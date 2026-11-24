import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@backend/db";
import { jobAnalyses, profiles, resumes, skills, users, type User } from "@backend/db/schema";
import { analyzeJobFit } from "@backend/lib/ai/jobFit";
import { getActiveResume, getLatestAnalysis, getProfile, resolveUserSkills } from "@backend/lib/career";
import {
  buildProfilePatch,
  extractProfileFromResume,
  type FieldChange,
  type ProfileFields,
} from "@backend/lib/resumeProfile";
import { SAMPLE_PROFILE, SAMPLE_SKILLS } from "@backend/lib/sampleData";
import { extractSkillsFromText, skillLabel } from "@backend/lib/skills";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type ResumeSyncResult = {
  profileUpdates: FieldChange[];
  skillsAdded: string[];
  skillsRemoved: string[];
  skillsTotal: number;
};

export type AnalysisRefresh = {
  jobTitle: string;
  company: string;
  previousScore: number;
  newScore: number;
  changed: boolean;
  engine: string;
};

/** Seeded skills are inserted in the same instant the sample account is created. */
const SAMPLE_WINDOW_MS = 60_000;

/**
 * Makes the workspace reflect a resume: professional details and the
 * resume-derived skill set. Runs inside the caller's transaction so a failed
 * upload can never leave a half-updated profile.
 */
export async function syncWorkspaceFromResume(
  tx: Tx,
  user: User,
  input: { text: string; skills: string[] },
): Promise<ResumeSyncResult> {
  const draft = extractProfileFromResume(input.text, input.skills);

  let profile = (await tx.select().from(profiles).where(eq(profiles.userId, user.id)).limit(1))[0];
  if (!profile) {
    profile = (
      await tx
        .insert(profiles)
        .values({ userId: user.id, fullName: user.fullName, contactEmail: user.email })
        .returning()
    )[0];
  }

  // What earlier resumes would have produced — used to tell resume-derived
  // values (replaceable) apart from values the user typed (kept).
  const earlier = await tx
    .select({ text: resumes.textContent })
    .from(resumes)
    .where(eq(resumes.userId, user.id))
    .orderBy(desc(resumes.createdAt))
    .limit(6);
  const priorDrafts = earlier.map((row) => extractProfileFromResume(row.text, extractSkillsFromText(row.text)));

  const current: ProfileFields = {
    fullName: profile.fullName,
    contactEmail: profile.contactEmail,
    currentTitle: profile.currentTitle,
    yearsExperience: profile.yearsExperience,
    education: profile.education,
    targetRole: profile.targetRole,
    interests: profile.interests,
    summary: profile.summary,
  };
  const { patch, changes } = buildProfilePatch(current, draft, priorDrafts, user.isDemo ? SAMPLE_PROFILE : null);

  if (Object.keys(patch).length > 0) {
    await tx.update(profiles).set({ ...patch, updatedAt: new Date() }).where(eq(profiles.userId, user.id));
    if (patch.fullName) {
      await tx.update(users).set({ fullName: patch.fullName, updatedAt: new Date() }).where(eq(users.id, user.id));
    }
  }

  // Skills: the resume owns every resume-derived (and seeded sample) skill.
  // Skills the user added by hand are never touched.
  const rows = await tx.select().from(skills).where(eq(skills.userId, user.id));
  const next = new Set(input.skills);
  const sampleCutoff = user.createdAt.getTime() + SAMPLE_WINDOW_MS;
  const replaceable = rows.filter(
    (row) =>
      row.source === "resume" ||
      (user.isDemo &&
        row.source === "manual" &&
        SAMPLE_SKILLS.includes(row.name) &&
        row.createdAt.getTime() <= sampleCutoff),
  );
  const toRemove = replaceable.filter((row) => !next.has(row.name));
  const toRelabel = replaceable.filter((row) => next.has(row.name) && row.source !== "resume");
  const existing = new Set(rows.map((row) => row.name));
  const toAdd = input.skills.filter((name) => !existing.has(name));

  if (toRemove.length) {
    await tx.delete(skills).where(inArray(skills.id, toRemove.map((row) => row.id)));
  }
  if (toRelabel.length) {
    await tx.update(skills).set({ source: "resume" }).where(inArray(skills.id, toRelabel.map((row) => row.id)));
  }
  if (toAdd.length) {
    await tx
      .insert(skills)
      .values(toAdd.map((name) => ({ userId: user.id, name, source: "resume" as const })))
      .onConflictDoNothing();
  }

  return {
    profileUpdates: changes,
    skillsAdded: toAdd.map(skillLabel),
    skillsRemoved: toRemove.map((row) => skillLabel(row.name)),
    skillsTotal: rows.length - toRemove.length + toAdd.length,
  };
}

/** One-line, user-facing account of what a sync changed. */
export function describeSync(sync: ResumeSyncResult) {
  const parts: string[] = [];
  if (sync.profileUpdates.length) {
    parts.push(`Profile updated from the resume: ${sync.profileUpdates.map((item) => item.label).join(", ")}.`);
  } else {
    parts.push("Your professional details already match this resume.");
  }
  if (sync.skillsAdded.length || sync.skillsRemoved.length) {
    parts.push(`Skills: ${sync.skillsAdded.length} added, ${sync.skillsRemoved.length} no longer on the resume removed.`);
  }
  return parts.join(" ");
}

function sameList(a: string[], b: string[]) {
  return a.length === b.length && [...a].sort().join("|") === [...b].sort().join("|");
}

/**
 * Re-scores the most recent job-fit analysis against the current profile,
 * skills and resume. Saves a new analysis row only when the result changed,
 * so history is preserved and re-uploading the same resume adds no duplicates.
 * Returns null when the user has never run an analysis.
 */
export async function refreshLatestAnalysis(userId: number): Promise<AnalysisRefresh | null> {
  const latest = await getLatestAnalysis(userId);
  if (!latest) return null;

  const [profile, skillRows, resume] = await Promise.all([
    getProfile(userId),
    resolveUserSkills(userId),
    getActiveResume(userId),
  ]);

  const outcome = await analyzeJobFit({
    jobTitle: latest.jobTitle,
    company: latest.company,
    jobDescription: latest.jobDescription,
    userSkills: skillRows.map((skill) => skill.name),
    resumeText: resume?.textContent ?? "",
    targetRole: profile?.targetRole || latest.jobTitle,
    yearsExperience: profile?.yearsExperience ?? 0,
  });

  const result = outcome.result;
  const changed =
    result.fitScore !== latest.fitScore ||
    !sameList(result.matchedSkills, latest.matchedSkills) ||
    !sameList(result.missingSkills, latest.missingSkills) ||
    !sameList(result.partialSkills, latest.partialSkills);

  if (changed) {
    await db.insert(jobAnalyses).values({
      userId,
      jobTitle: latest.jobTitle,
      company: latest.company,
      jobDescription: latest.jobDescription,
      fitScore: result.fitScore,
      matchedSkills: result.matchedSkills,
      missingSkills: result.missingSkills,
      partialSkills: result.partialSkills,
      recommendedSkills: result.recommendedSkills,
      readiness: result.readiness,
      summary: result.summary,
      recommendations: result.recommendations,
      engine: outcome.engine,
      model: outcome.model,
    });
  }

  return {
    jobTitle: latest.jobTitle,
    company: latest.company,
    previousScore: latest.fitScore,
    newScore: result.fitScore,
    changed,
    engine: outcome.engine,
  };
}
