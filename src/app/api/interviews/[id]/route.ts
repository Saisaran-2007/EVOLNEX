import { and, eq } from "drizzle-orm";
import { db } from "@backend/db";
import { interviewQuestions, interviewSessions } from "@backend/db/schema";
import { ApiError, asInt, handle, ok } from "@backend/lib/api";
import { requireWorkspaceUser } from "@backend/lib/workspace";
import { aggregateSession } from "@backend/lib/ai/interview";

export const dynamic = "force-dynamic";

async function loadSession(userId: number, sessionId: number) {
  const rows = await db
    .select()
    .from(interviewSessions)
    .where(and(eq(interviewSessions.id, sessionId), eq(interviewSessions.userId, userId)))
    .limit(1);
  if (!rows[0]) throw new ApiError(404, "Interview session not found.");
  const questions = await db
    .select()
    .from(interviewQuestions)
    .where(and(eq(interviewQuestions.sessionId, sessionId), eq(interviewQuestions.userId, userId)))
    .orderBy(interviewQuestions.position);
  return { session: rows[0], questions };
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireWorkspaceUser();
    const { id } = await params;
    const sessionId = asInt(id, 0);
    if (!sessionId) throw new ApiError(400, "Invalid session id.");
    return ok(await loadSession(user.id, sessionId));
  });
}

/** Finalise a session: recompute the aggregate report from stored answers. */
export async function PATCH(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireWorkspaceUser();
    const { id } = await params;
    const sessionId = asInt(id, 0);
    if (!sessionId) throw new ApiError(400, "Invalid session id.");
    const { session, questions } = await loadSession(user.id, sessionId);
    if (!questions.some((question) => typeof question.score === "number")) {
      throw new ApiError(400, "Answer at least one question before finishing the session.");
    }
    const aggregate = aggregateSession(questions);
    const [updated] = await db
      .update(interviewSessions)
      .set({
        status: "completed",
        overallScore: aggregate.overallScore,
        summary: aggregate.summary,
        strengths: aggregate.strengths,
        improvements: aggregate.improvements,
        completedAt: new Date(),
      })
      .where(and(eq(interviewSessions.id, session.id), eq(interviewSessions.userId, user.id)))
      .returning();
    return ok({ session: updated, aggregate, message: "Session complete. Your report is ready." });
  });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireWorkspaceUser();
    const { id } = await params;
    const sessionId = asInt(id, 0);
    if (!sessionId) throw new ApiError(400, "Invalid session id.");
    const [deleted] = await db
      .delete(interviewSessions)
      .where(and(eq(interviewSessions.id, sessionId), eq(interviewSessions.userId, user.id)))
      .returning({ id: interviewSessions.id });
    if (!deleted) throw new ApiError(404, "Interview session not found.");
    return ok({ id: deleted.id, message: "Interview session deleted." });
  });
}
