import { and, eq } from "drizzle-orm";
import { db } from "@backend/db";
import { applicationEvents, applications, reminders } from "@backend/db/schema";
import { ApiError, asInt, asString, handle, ok } from "@backend/lib/api";
import { requireWorkspaceUser } from "@backend/lib/workspace";
import { isStage, parseDate, type Stage } from "@backend/lib/applications";

export const dynamic = "force-dynamic";

async function ownedApplication(userId: number, id: number) {
  const rows = await db
    .select()
    .from(applications)
    .where(and(eq(applications.id, id), eq(applications.userId, userId)))
    .limit(1);
  if (!rows[0]) throw new ApiError(404, "Application not found.");
  return rows[0];
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireWorkspaceUser();
    const { id } = await params;
    const application = await ownedApplication(user.id, asInt(id, 0));
    const history = await db
      .select()
      .from(applicationEvents)
      .where(and(eq(applicationEvents.applicationId, application.id), eq(applicationEvents.userId, user.id)))
      .orderBy(applicationEvents.createdAt);
    return ok({ application, history });
  });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireWorkspaceUser();
    const { id } = await params;
    const application = await ownedApplication(user.id, asInt(id, 0));
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

    const nextStageRaw = asString(body.stage, application.stage);
    if (!isStage(nextStageRaw)) {
      throw new ApiError(400, "Unknown application stage.");
    }
    const nextStage: Stage = nextStageRaw;
    const stageChanged = nextStage !== application.stage;
    const jobUrl = body.jobUrl === undefined ? application.jobUrl : asString(body.jobUrl).slice(0, 1000);
    if (jobUrl && !/^https?:\/\//i.test(jobUrl)) throw new ApiError(400, "Job URL must start with http:// or https://.");

    const followUpAt = body.followUpAt === undefined ? application.followUpAt : parseDate(body.followUpAt);
    const company = body.company === undefined ? application.company : asString(body.company).slice(0, 190);
    const jobTitle = body.jobTitle === undefined ? application.jobTitle : asString(body.jobTitle).slice(0, 190);
    if (!company || !jobTitle) throw new ApiError(400, "Company and job title cannot be empty.");

    const updated = await db.transaction(async (tx) => {
      const [row] = await tx
        .update(applications)
        .set({
          company,
          jobTitle,
          jobUrl,
          stage: nextStage,
          notes: body.notes === undefined ? application.notes : asString(body.notes).slice(0, 4000),
          appliedAt: body.appliedAt === undefined ? application.appliedAt : parseDate(body.appliedAt),
          followUpAt,
          followUpNote:
            body.followUpNote === undefined ? application.followUpNote : asString(body.followUpNote).slice(0, 600),
          updatedAt: new Date(),
        })
        .where(and(eq(applications.id, application.id), eq(applications.userId, user.id)))
        .returning();

      if (stageChanged) {
        await tx.insert(applicationEvents).values({
          applicationId: application.id,
          userId: user.id,
          fromStage: application.stage,
          toStage: nextStage,
          note: asString(body.note).slice(0, 500) || `Stage moved to ${nextStage}.`,
        });
      }

      await tx.delete(reminders).where(and(eq(reminders.applicationId, application.id), eq(reminders.userId, user.id)));
      if (followUpAt) {
        await tx.insert(reminders).values({
          userId: user.id,
          applicationId: application.id,
          title: `Follow up with ${company}`,
          dueAt: followUpAt,
          note: asString(body.followUpNote ?? application.followUpNote).slice(0, 500),
        });
      }
      return row;
    });

    return ok({ application: updated, message: "Application updated." });
  });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireWorkspaceUser();
    const { id } = await params;
    const application = await ownedApplication(user.id, asInt(id, 0));
    await db
      .delete(applications)
      .where(and(eq(applications.id, application.id), eq(applications.userId, user.id)));
    return ok({ id: application.id, message: "Application deleted." });
  });
}
