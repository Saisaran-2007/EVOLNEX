import { aiFailurePayload, generateValidatedJson, type AiResult } from "@backend/lib/ai/gemini";
import { clamp } from "@backend/lib/api";
import { canonicalSkill, extractSkillsFromText, normalizeSkillList, skillLabel } from "@backend/lib/skills";

export type FitAnalysis = {
  fitScore: number;
  matchedSkills: string[];
  missingSkills: string[];
  partialSkills: string[];
  recommendedSkills: string[];
  readiness: "ready" | "developing" | "early";
  summary: string;
  recommendations: string[];
};

export type AnalysisOutcome = {
  result: FitAnalysis;
  engine: "gemini" | "local";
  model: string;
  warning: string | null;
};

const READY = 78;
const DEVELOPING = 52;

function readinessFor(score: number): FitAnalysis["readiness"] {
  if (score >= READY) return "ready";
  if (score >= DEVELOPING) return "developing";
  return "early";
}

function tokens(value: string) {
  return new Set(
    value
      .toLowerCase()
      .split(/[^a-z0-9+#.]+/)
      .filter((token) => token.length > 2),
  );
}

/** Deterministic, transparent job-fit computation. Never presented as AI output. */
export function localJobFit(input: {
  jobTitle: string;
  jobDescription: string;
  userSkills: string[];
  resumeText?: string;
}): FitAnalysis {
  const required = normalizeSkillList(extractRequirementSkills(input.jobDescription));
  const userSet = new Set(normalizeSkillList(input.userSkills));
  const resumeTokens = tokens(input.resumeText ?? "");

  const matched: string[] = [];
  const missing: string[] = [];
  const partial: string[] = [];

  for (const skill of required) {
    if (userSet.has(skill)) {
      matched.push(skill);
      continue;
    }
    const related = [...userSet].find((userSkill) => {
      const a = tokens(userSkill);
      const b = tokens(skill);
      const overlap = [...b].filter((token) => a.has(token) && token.length > 3);
      return overlap.length > 0;
    });
    if (related) {
      partial.push(skill);
      continue;
    }
    const wordPresent = [...tokens(skill)].every((token) => resumeTokens.has(token));
    if (wordPresent) {
      partial.push(skill);
      continue;
    }
    missing.push(skill);
  }

  const weighted = matched.length + partial.length * 0.5;
  const baseScore = required.length > 0 ? (weighted / required.length) * 100 : 0;
  // Experience depth gives a small honest boost; capped so an empty profile can never look ready.
  const fitScore = required.length > 0 ? clamp(baseScore * 0.92 + (userSet.size >= 8 ? 4 : 0), 0, 98) : 0;
  const readiness = readinessFor(fitScore);
  const recommendedSkills = missing.slice(0, 8);

  const summary =
    required.length === 0
      ? `We could not detect concrete technologies in this job description. Add the responsibilities and required stack so the comparison can be measured against your ${userSet.size} saved skills.`
      : `You match ${matched.length} of ${required.length} detectable requirements for ${input.jobTitle || "this role"}${
          partial.length ? `, with ${partial.length} adjacent skill${partial.length > 1 ? "s" : ""}` : ""
        }. ${
          readiness === "ready"
            ? "Your profile already covers most of the core stack — focus on positioning and proof of impact."
            : readiness === "developing"
              ? "You are close. Closing the highest-leverage gaps below will materially move your fit score."
              : "This is an aspirational target. Sequence the missing fundamentals before applying at scale."
        }`;

  const recommendations: string[] = [];
  if (missing.length) {
    recommendations.push(
      `Prioritise ${missing
        .slice(0, 3)
        .map(skillLabel)
        .join(", ")} — they appear as hard requirements and are absent from your saved profile.`,
    );
  }
  if (partial.length) {
    recommendations.push(
      `Convert adjacent experience into evidence for ${partial
        .slice(0, 3)
        .map(skillLabel)
        .join(", ")} with one shipped, documented example.`,
    );
  }
  if (matched.length) {
    recommendations.push(
      `Lead your resume summary with your strongest matches: ${matched
        .slice(0, 4)
        .map(skillLabel)
        .join(", ")}.`,
    );
  }
  recommendations.push(
    readiness === "ready"
      ? "Run a system-design and behavioural mock interview to convert fit into an offer."
      : "Generate a learning roadmap from this analysis and complete the first milestone before reapplying.",
  );

  return {
    fitScore,
    matchedSkills: matched,
    missingSkills: missing,
    partialSkills: partial,
    recommendedSkills,
    readiness,
    summary,
    recommendations,
  };
}

function extractRequirementSkills(jobDescription: string): string[] {
  return extractSkillsFromText(jobDescription).map(canonicalSkill).filter(Boolean);
}

function coerceAnalysis(raw: unknown, userSkills: string[]): FitAnalysis {
  const value = (raw ?? {}) as Record<string, unknown>;
  const score = clamp(Number(value.fitScore ?? value.score ?? 0), 0, 100);
  const normalizedUser = new Set(normalizeSkillList(userSkills));
  const matched = normalizeSkillList(value.matchedSkills).filter((skill) => normalizedUser.has(skill));
  const missing = normalizeSkillList(value.missingSkills).filter((skill) => !normalizedUser.has(skill));
  const partial = normalizeSkillList(value.partialSkills).filter(
    (skill) => !normalizedUser.has(skill) && !missing.includes(skill),
  );
  const recommendations = normalizeTextArray(value.recommendations).slice(0, 6);
  const summary = typeof value.summary === "string" ? value.summary.trim().slice(0, 1200) : "";
  if (!summary) throw new Error("Missing summary");
  return {
    fitScore: score,
    matchedSkills: matched,
    missingSkills: missing,
    partialSkills: partial,
    recommendedSkills: normalizeSkillList(value.recommendedSkills).slice(0, 10),
    readiness: readinessFor(score),
    summary,
    recommendations:
      recommendations.length > 0
        ? recommendations
        : ["Close the highest-priority missing skills, then re-run this analysis to measure progress."],
  };
}

function normalizeTextArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item.length > 0)
    .slice(0, 12);
}

export async function analyzeJobFit(input: {
  jobTitle: string;
  company: string;
  jobDescription: string;
  userSkills: string[];
  resumeText: string;
  targetRole: string;
  yearsExperience: number;
}): Promise<AnalysisOutcome> {
  const system = [
    "You are EVOLNEX, a senior technical recruiter and career intelligence engine.",
    "Compare a candidate profile against a job description with strict honesty.",
    "Only claim a match when the candidate profile or resume evidences it.",
    "Respond with JSON only, using exactly these keys:",
    '{ "fitScore": number 0-100, "matchedSkills": string[], "missingSkills": string[], "partialSkills": string[], "recommendedSkills": string[], "summary": string, "recommendations": string[] }',
    "Use lowercase canonical skill names. Keep summary under 90 words and recommendations to 3-5 concrete actions.",
  ].join("\n");

  const prompt = [
    `Target job title: ${input.jobTitle}`,
    input.company ? `Company: ${input.company}` : "",
    input.targetRole ? `Candidate target role: ${input.targetRole}` : "",
    `Candidate years of experience: ${input.yearsExperience}`,
    `Candidate saved skills: ${input.userSkills.join(", ") || "none saved"}`,
    `Job description:\n${input.jobDescription.slice(0, 8000)}`,
    `Resume excerpt:\n${input.resumeText.slice(0, 6000) || "no resume text available"}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  try {
    const ai: AiResult<FitAnalysis> = await generateValidatedJson({
      system,
      prompt,
      validate: (raw) => coerceAnalysis(raw, input.userSkills),
    });
    return { result: ai.data, engine: "gemini", model: ai.model, warning: null };
  } catch (error) {
    const failure = aiFailurePayload(error);
    return {
      result: localJobFit({
        jobTitle: input.jobTitle,
        jobDescription: input.jobDescription,
        userSkills: input.userSkills,
        resumeText: input.resumeText,
      }),
      engine: "local",
      model: "evolnex-local-engine",
      warning: `${failure.message} This analysis was computed with the EVOLNEX deterministic engine using your saved skills and the pasted job description — not by AI.`,
    };
  }
}
