import { eq } from "drizzle-orm";
import { db } from "@backend/db";
import { resumes } from "@backend/db/schema";
import { ApiError, clientKey, handle, ok, rateLimit } from "@backend/lib/api";
import { getActiveResume } from "@backend/lib/career";
import { describeSync, refreshLatestAnalysis, syncWorkspaceFromResume, type AnalysisRefresh } from "@backend/lib/resumeSync";
import { extractSkillsFromText } from "@backend/lib/skills";
import { requireWorkspaceUser } from "@backend/lib/workspace";

export const dynamic = "force-dynamic";

/**
 * Re-applies the active resume to the profile, skills and job-fit analysis
 * without uploading the file again.
 */
export async function POST(request: Request) {
  return handle(async () => {
    const user = await requireWorkspaceUser();
    rateLimit(clientKey(request, `resume-sync:${user.id}`), 12, 10 * 60 * 1000);

    const resume = await getActiveResume(user.id);
    if (!resume) throw new ApiError(400, "Upload a resume first, then it can be applied to your profile.");
    if (!resume.textContent.trim()) {
      throw new ApiError(422, "The saved resume has no readable text. Upload a text-based PDF.");
    }

    // Re-detect skills with the current dictionary so the stored resume record stays consistent.
    const detected = extractSkillsFromText(resume.textContent);
    const sync = await db.transaction(async (tx) => {
      await tx
        .update(resumes)
        .set({
          extractedSkills: detected.map((name) => ({ name, source: "resume", category: "detected" })),
          processingNote: `Extracted ${detected.length} skills from the saved resume.`,
        })
        .where(eq(resumes.id, resume.id));
      return syncWorkspaceFromResume(tx, user, { text: resume.textContent, skills: detected });
    });

    let analysisRefresh: AnalysisRefresh | null = null;
    let analysisRefreshFailed = false;
    try {
      analysisRefresh = await refreshLatestAnalysis(user.id);
    } catch (error) {
      analysisRefreshFailed = true;
      console.error("[resume] job-fit refresh failed", error);
    }

    return ok({
      resume: { id: resume.id, filename: resume.filename, skillsCount: detected.length },
      ...sync,
      analysisRefresh,
      analysisRefreshFailed,
      message: describeSync(sync),
    });
  });
}
