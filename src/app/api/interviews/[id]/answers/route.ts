import { and, eq } from "drizzle-orm";
import { db } from "@backend/db";
import { interviewQuestions, interviewSessions } from "@backend/db/schema";
import { ApiError, asInt, asString, clientKey, handle, ok, rateLimit } from "@backend/lib/api";
import { requireWorkspaceUser } from "@backend/lib/workspace";
import { aggregateSession, evaluateAnswer } from "@backend/lib/ai/interview";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireWorkspaceUser();
    const { id } = await params;
    const sessionId = asInt(id, 0);
    if (!sessionId) throw new ApiError(400, "Invalid session id.");
    rateLimit(clientKey(request, `answer:${user.id}`), 30, 10 * 60 * 1000);

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const questionId = asInt(body.questionId, 0);
    const answer = asString(body.answer);
    if (!questionId) throw new ApiError(400, "Question id is required.");
    if (answer.length < 10) throw new ApiError(400, "Write a little more so we can give meaningful feedback.");

    const sessionRows = await db
      .select()
      .from(interviewSessions)
      .where(and(eq(interviewSessions.id, sessionId), eq(interviewSessions.userId, user.id)))
      .limit(1);
    const session = sessionRows[0];
    if (!session) throw new ApiError(404, "Interview session not found.");

    const questionRows = await db
      .select()
      .from(interviewQuestions)
      .where(
        and(
          eq(interviewQuestions.id, questionId),
          eq(interviewQuestions.sessionId, sessionId),
          eq(interviewQuestions.userId, user.id),
        ),
      )
      .limit(1);
    const question = questionRows[0];
    if (!question) throw new ApiError(404, "Question not found in this session.");

    const { evaluation, engine, warning } = await evaluateAnswer({
      role: session.role,
      difficulty: session.difficulty,
      question: question.question,
      answer,
    });

    const [updated] = await db
      .update(interviewQuestions)
      .set({
        answer,
        score: evaluation.score,
        scores: evaluation.scores,
        feedback: evaluation.feedback,
        improvements: evaluation.improvements,
        answeredAt: new Date(),
      })
      .where(and(eq(interviewQuestions.id, questionId), eq(interviewQuestions.userId, user.id)))
      .returning();

    const allQuestions = await db
      .select()
      .from(interviewQuestions)
      .where(and(eq(interviewQuestions.sessionId, sessionId), eq(interviewQuestions.userId, user.id)))
      .orderBy(interviewQuestions.position);
    const aggregate = aggregateSession(allQuestions);
    const allAnswered = allQuestions.every((item) => typeof item.score === "number");

    const [updatedSession] = await db
      .update(interviewSessions)
      .set({
        overallScore: aggregate.overallScore,
        summary: aggregate.summary,
        strengths: aggregate.strengths,
        improvements: aggregate.improvements,
        status: allAnswered ? "completed" : "in_progress",
        completedAt: allAnswered ? new Date() : null,
      })
      .where(and(eq(interviewSessions.id, sessionId), eq(interviewSessions.userId, user.id)))
      .returning();

    return ok({
      question: updated,
      session: updatedSession,
      aggregate,
      engine,
      warning,
      message: "Answer evaluated.",
    });
  });
}
