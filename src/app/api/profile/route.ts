import { and, eq, inArray, notInArray } from "drizzle-orm";
import { db } from "@backend/db";
import { profiles, skills } from "@backend/db/schema";
import { ApiError, asInt, asString, asStringArray, handle, ok } from "@backend/lib/api";
import { ensureProfile } from "@backend/lib/auth";
import { requireWorkspaceUser } from "@backend/lib/workspace";
import { getActiveResume, getProfile, getUserSkillRows, profileCompletion } from "@backend/lib/career";
import { normalizeSkillList, skillLabel } from "@backend/lib/skills";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => {
    const user = await requireWorkspaceUser();
    await ensureProfile(user.id);
    const [profile, skillRows, resume] = await Promise.all([
      getProfile(user.id),
      getUserSkillRows(user.id),
      getActiveResume(user.id),
    ]);
    const resumeSkills = (resume?.extractedSkills ?? []).map((skill) => skill.name);
    const merged = normalizeSkillList([...skillRows.map((row) => row.name), ...resumeSkills]);
    const completion = profileCompletion(profile, {
      skillCount: merged.length,
      hasResume: Boolean(resume),
    });
    return ok({
      profile,
      completion,
      skills: skillRows.map((row) => ({ id: row.id, name: row.name, label: skillLabel(row.name), source: row.source, level: row.level })),
      resumeSkills: normalizeSkillList(resumeSkills).map((name) => ({ name, label: skillLabel(name) })),
      resume: resume
        ? {
            id: resume.id,
            filename: resume.filename,
            status: resume.status,
            processingNote: resume.processingNote,
            sizeBytes: resume.sizeBytes,
            createdAt: resume.createdAt,
            skillsCount: resume.extractedSkills.length,
          }
        : null,
      account: { email: user.email, emailVerified: Boolean(user.emailVerifiedAt) },
    });
  });
}

export async function PUT(request: Request) {
  return handle(async () => {
    const user = await requireWorkspaceUser();
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const fullName = asString(body.fullName).slice(0, 160);
    if (fullName.length < 2) throw new ApiError(400, "Full name is required.");

    const values = {
      fullName,
      contactEmail: asString(body.contactEmail).slice(0, 320),
      currentTitle: asString(body.currentTitle).slice(0, 160),
      yearsExperience: Math.max(0, Math.min(60, asInt(body.yearsExperience, 0))),
      education: asString(body.education).slice(0, 1200),
      targetRole: asString(body.targetRole).slice(0, 160),
      interests: asString(body.interests).slice(0, 1200),
      summary: asString(body.summary).slice(0, 4000),
      preferences:
        body.preferences && typeof body.preferences === "object"
          ? (body.preferences as Record<string, unknown>)
          : undefined,
      updatedAt: new Date(),
    };

    await db
      .insert(profiles)
      .values({ userId: user.id, ...values })
      .onConflictDoUpdate({ target: profiles.userId, set: values });

    let skillsUpdated = false;
    if (Array.isArray(body.skills)) {
      const requested = normalizeSkillList(body.skills);
      const existing = await getUserSkillRows(user.id);
      const existingNames = existing.map((row) => row.name);
      const toAdd = requested.filter((name) => !existingNames.includes(name));
      const toRemove = existingNames.filter((name) => !requested.includes(name));
      if (toAdd.length) {
        await db
          .insert(skills)
          .values(toAdd.map((name) => ({ userId: user.id, name, source: "manual" as const })))
          .onConflictDoNothing();
      }
      if (toRemove.length) {
        await db
          .delete(skills)
          .where(and(eq(skills.userId, user.id), inArray(skills.name, toRemove)));
      }
      skillsUpdated = true;
    } else if (typeof body.skillInput === "string") {
      const additions = normalizeSkillList(body.skillInput.split(","));
      if (additions.length) {
        await db
          .insert(skills)
          .values(additions.map((name) => ({ userId: user.id, name, source: "manual" as const })))
          .onConflictDoNothing();
        skillsUpdated = true;
      }
    }

    if (asString(body.removeSkill)) {
      await db
        .delete(skills)
        .where(and(eq(skills.userId, user.id), eq(skills.name, asString(body.removeSkill))));
      skillsUpdated = true;
    }

    // Keep the account display name in sync without touching password or verification state.
    const { users } = await import("@backend/db/schema");
    await db.update(users).set({ fullName, updatedAt: new Date() }).where(eq(users.id, user.id));

    const [profile, skillRows, resume] = await Promise.all([
      getProfile(user.id),
      getUserSkillRows(user.id),
      getActiveResume(user.id),
    ]);
    const merged = normalizeSkillList([...skillRows.map((row) => row.name), ...(resume?.extractedSkills ?? []).map((s) => s.name)]);
    return ok({
      profile,
      skillsUpdated,
      completion: profileCompletion(profile, { skillCount: merged.length, hasResume: Boolean(resume) }),
      skills: skillRows.map((row) => ({ id: row.id, name: row.name, label: skillLabel(row.name), source: row.source, level: row.level })),
      message: "Profile saved.",
    });
  });
}

export async function DELETE() {
  return handle(async () => {
    const user = await requireWorkspaceUser();
    // Clear only manually-added skills; resume-extracted skills remain tied to resume records.
    await db.delete(skills).where(and(eq(skills.userId, user.id), notInArray(skills.source, ["resume"])));
    return ok({ message: "Manual skills cleared." });
  });
}
