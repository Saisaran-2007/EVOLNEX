import { desc, eq } from "drizzle-orm";
import { db } from "@backend/db";
import { resumes } from "@backend/db/schema";
import { ApiError, clientKey, handle, ok, rateLimit } from "@backend/lib/api";
import { requireWorkspaceUser } from "@backend/lib/workspace";
import { parseResumeFile } from "@backend/lib/resume";
import { describeSync, refreshLatestAnalysis, syncWorkspaceFromResume, type AnalysisRefresh } from "@backend/lib/resumeSync";
import { skillLabel } from "@backend/lib/skills";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return handle(async () => {
    const user = await requireWorkspaceUser();
    const rows = await db
      .select({
        id: resumes.id,
        filename: resumes.filename,
        mimeType: resumes.mimeType,
        sizeBytes: resumes.sizeBytes,
        status: resumes.status,
        processingNote: resumes.processingNote,
        extractedSkills: resumes.extractedSkills,
        isActive: resumes.isActive,
        createdAt: resumes.createdAt,
      })
      .from(resumes)
      .where(eq(resumes.userId, user.id))
      .orderBy(desc(resumes.createdAt))
      .limit(20);
    return ok({
      resumes: rows.map((row) => ({
        ...row,
        skillsCount: row.extractedSkills.length,
        extractedSkills: row.extractedSkills.map((skill) => ({ ...skill, label: skillLabel(skill.name) })),
      })),
    });
  });
}

export async function POST(request: Request) {
  return handle(async () => {
    const user = await requireWorkspaceUser();
    rateLimit(clientKey(request, `resume:${user.id}`), 8, 10 * 60 * 1000);

    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.includes("multipart/form-data")) {
      throw new ApiError(400, "Upload the resume as multipart/form-data.");
    }
    const form = await request.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) throw new ApiError(400, "Attach a PDF file to upload.");

    const parsed = await parseResumeFile(file);

    // One transaction: the resume record, the profile refresh and the skill
    // replacement either all land or none do.
    const { record, sync } = await db.transaction(async (tx) => {
      await tx.update(resumes).set({ isActive: false }).where(eq(resumes.userId, user.id));
      const [created] = await tx
        .insert(resumes)
        .values({
          userId: user.id,
          filename: file.name.slice(0, 250),
          mimeType: file.type || "application/pdf",
          sizeBytes: file.size,
          textContent: parsed.text.slice(0, 200_000),
          status: parsed.status,
          processingNote: parsed.note,
          extractedSkills: parsed.skills.map((name) => ({ name, source: "resume", category: "detected" })),
          isActive: true,
        })
        .returning();
      const result = await syncWorkspaceFromResume(tx, user, { text: parsed.text, skills: parsed.skills });
      return { record: created, sync: result };
    });

    // The saved job-fit analysis is stale once skills change, so re-score it.
    // A failure here must not fail the upload — it is reported instead.
    let analysisRefresh: AnalysisRefresh | null = null;
    let analysisRefreshFailed = false;
    try {
      analysisRefresh = await refreshLatestAnalysis(user.id);
    } catch (error) {
      analysisRefreshFailed = true;
      console.error("[resume] job-fit refresh failed", error);
    }

    return ok(
      {
        resume: {
          id: record.id,
          filename: record.filename,
          status: record.status,
          processingNote: record.processingNote,
          skillsCount: record.extractedSkills.length,
          extractedSkills: record.extractedSkills.map((skill) => ({ name: skill.name, label: skillLabel(skill.name) })),
          createdAt: record.createdAt,
        },
        ...sync,
        analysisRefresh,
        analysisRefreshFailed,
        message: `${parsed.note} ${describeSync(sync)}`,
      },
      201,
    );
  });
}
