import { desc, eq } from "drizzle-orm";
import { db } from "@backend/db";
import { jobAnalyses } from "@backend/db/schema";
import { ApiError, asString, clientKey, handle, ok, rateLimit } from "@backend/lib/api";
import { requireWorkspaceUser } from "@backend/lib/workspace";
import { getActiveResume, getProfile, resolveUserSkills } from "@backend/lib/career";
import { analyzeJobFit } from "@backend/lib/ai/jobFit";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => {
    const user = await requireWorkspaceUser();
    const rows = await db
      .select()
      .from(jobAnalyses)
      .where(eq(jobAnalyses.userId, user.id))
      .orderBy(desc(jobAnalyses.createdAt))
      .limit(15);
    return ok({ analyses: rows });
  });
}

export async function POST(request: Request) {
  return handle(async () => {
    const user = await requireWorkspaceUser();
    rateLimit(clientKey(request, `analysis:${user.id}`), 12, 10 * 60 * 1000);

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const jobTitle = asString(body.jobTitle).slice(0, 200);
    const company = asString(body.company).slice(0, 200);
    const jobDescription = asString(body.jobDescription);

    if (jobTitle.length < 2) throw new ApiError(400, "Add the target job title before running the analysis.");
    if (jobDescription.length < 80) {
      throw new ApiError(400, "Paste at least a few lines of the job description (80+ characters) for an accurate comparison.");
    }

    const [profile, skillRows, resume] = await Promise.all([
      getProfile(user.id),
      resolveUserSkills(user.id),
      getActiveResume(user.id),
    ]);

    const outcome = await analyzeJobFit({
      jobTitle,
      company,
      jobDescription,
      userSkills: skillRows.map((skill) => skill.name),
      resumeText: resume?.textContent ?? "",
      targetRole: profile?.targetRole ?? jobTitle,
      yearsExperience: profile?.yearsExperience ?? 0,
    });

    const [saved] = await db
      .insert(jobAnalyses)
      .values({
        userId: user.id,
        jobTitle,
        company,
        jobDescription: jobDescription.slice(0, 40_000),
        fitScore: outcome.result.fitScore,
        matchedSkills: outcome.result.matchedSkills,
        missingSkills: outcome.result.missingSkills,
        partialSkills: outcome.result.partialSkills,
        recommendedSkills: outcome.result.recommendedSkills,
        readiness: outcome.result.readiness,
        summary: outcome.result.summary,
        recommendations: outcome.result.recommendations,
        engine: outcome.engine,
        model: outcome.model,
      })
      .returning();

    return ok({ analysis: saved, engine: outcome.engine, warning: outcome.warning }, 201);
  });
}
