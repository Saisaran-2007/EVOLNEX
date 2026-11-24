import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@backend/db";
import { applicationEvents, applications, reminders } from "@backend/db/schema";
import { ApiError, asString, handle, ok } from "@backend/lib/api";
import { requireWorkspaceUser } from "@backend/lib/workspace";
import { isStage, parseDate, STAGES, type Stage } from "@backend/lib/applications";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => {
    const user = await requireWorkspaceUser();
    const rows = await db
      .select()
      .from(applications)
      .where(eq(applications.userId, user.id))
      .orderBy(desc(applications.updatedAt));

    const ids = rows.map((row) => row.id);
    const events = ids.length
      ? await db
          .select()
          .from(applicationEvents)
          .where(and(eq(applicationEvents.userId, user.id), inArray(applicationEvents.applicationId, ids)))
          .orderBy(desc(applicationEvents.createdAt))
      : [];
    const reminderRows = ids.length
      ? await db
          .select()
          .from(reminders)
          .where(and(eq(reminders.userId, user.id), inArray(reminders.applicationId, ids)))
          .orderBy(reminders.dueAt)
      : [];

    const submitted = rows.filter((row) => row.stage !== "interested").length;
    const offers = rows.filter((row) => row.stage === "offer").length;
    return ok({
      applications: rows.map((row) => ({
        ...row,
        history: events.filter((event) => event.applicationId === row.id),
        reminders: reminderRows.filter((reminder) => reminder.applicationId === row.id),
      })),
      stats: {
        total: rows.length,
        submitted,
        active: rows.filter((row) => ["applied", "screening", "interview", "assessment"].includes(row.stage)).length,
        offers,
        rejected: rows.filter((row) => row.stage === "rejected").length,
        interviews: rows.filter((row) => ["interview", "assessment"].includes(row.stage)).length,
        byStage: STAGES.map((stage) => ({ stage, count: rows.filter((row) => row.stage === stage).length })),
        offerRate: submitted ? Math.round((offers / submitted) * 100) : 0,
      },
    });
  });
}

export async function POST(request: Request) {
  return handle(async () => {
    const user = await requireWorkspaceUser();
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const company = asString(body.company).slice(0, 190);
    const jobTitle = asString(body.jobTitle).slice(0, 190);
    if (company.length < 1) throw new ApiError(400, "Company name is required.");
    if (jobTitle.length < 1) throw new ApiError(400, "Job title is required.");
    const stageInput = asString(body.stage, "interested");
    const stage: Stage = isStage(stageInput) ? stageInput : "interested";
    const jobUrl = asString(body.jobUrl).slice(0, 1000);
    if (jobUrl && !/^https?:\/\//i.test(jobUrl)) throw new ApiError(400, "Job URL must start with http:// or https://.");
    const appliedAt = parseDate(body.appliedAt) ?? (stage === "interested" ? null : new Date());
    const followUpAt = parseDate(body.followUpAt);

    const created = await db.transaction(async (tx) => {
      const [application] = await tx
        .insert(applications)
        .values({
          userId: user.id,
          company,
          jobTitle,
          jobUrl,
          stage,
          notes: asString(body.notes).slice(0, 4000),
          appliedAt,
          followUpAt,
          followUpNote: asString(body.followUpNote).slice(0, 600),
        })
        .returning();
      await tx.insert(applicationEvents).values({
        applicationId: application.id,
        userId: user.id,
        fromStage: null,
        toStage: stage,
        note: "Application created.",
      });
      if (followUpAt) {
        await tx.insert(reminders).values({
          userId: user.id,
          applicationId: application.id,
          title: `Follow up with ${company}`,
          dueAt: followUpAt,
          note: asString(body.followUpNote).slice(0, 500),
        });
      }
      return application;
    });

    return ok({ application: created, message: "Application added." }, 201);
  });
}
