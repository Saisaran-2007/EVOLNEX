import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@backend/db";
import { interviewQuestions, interviewSessions } from "@backend/db/schema";
import { ApiError, asInt, asString, clientKey, clamp, handle, ok, rateLimit } from "@backend/lib/api";
import { requireWorkspaceUser } from "@backend/lib/workspace";
import { getActiveResume, getProfile, resolveUserSkills } from "@backend/lib/career";
import { generateInterviewQuestions } from "@backend/lib/ai/interview";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => {
    const user = await requireWorkspaceUser();
    const sessions = await db
      .select()
      .from(interviewSessions)
      .where(eq(interviewSessions.userId, user.id))
      .orderBy(desc(interviewSessions.createdAt))
      .limit(25);

    const ids = sessions.map((session) => session.id);
    const questions = ids.length
      ? await db
          .select({
            sessionId: interviewQuestions.sessionId,
            score: interviewQuestions.score,
            answeredAt: interviewQuestions.answeredAt,
          })
          .from(interviewQuestions)
          .where(inArray(interviewQuestions.sessionId, ids))
      : [];

    const scored = sessions.filter((session) => typeof session.overallScore === "number");
    return ok({
      sessions: sessions.map((session) => {
        const sessionQuestions = questions.filter((question) => question.sessionId === session.id);
        return {
          ...session,
          questionCount: sessionQuestions.length,
          answeredCount: sessionQuestions.filter((question) => question.answeredAt).length,
        };
      }),
      stats: {
        sessions: sessions.length,
        completed: sessions.filter((session) => session.status === "completed").length,
        answered: questions.filter((question) => question.answeredAt).length,
        averageScore: scored.length
          ? Math.round(scored.reduce((total, session) => total + (session.overallScore ?? 0), 0) / scored.length)
          : null,
      },
    });
  });
}

export async function POST(request: Request) {
  return handle(async () => {
    const user = await requireWorkspaceUser();
    rateLimit(clientKey(request, `interview-create:${user.id}`), 10, 10 * 60 * 1000);

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const profile = await getProfile(user.id);
    const role = (asString(body.role) || profile?.targetRole || "").slice(0, 150);
    const difficulty = ["junior", "mid", "senior"].includes(asString(body.difficulty))
      ? asString(body.difficulty)
      : "mid";
    const count = clamp(asInt(body.count, 5), 3, 8);
    if (role.length < 2) throw new ApiError(400, "Choose an interview role (or set a target role in your profile).");

    const [skillRows, resume] = await Promise.all([resolveUserSkills(user.id), getActiveResume(user.id)]);
    const generated = await generateInterviewQuestions({
      role,
      difficulty,
      skills: skillRows.map((skill) => skill.name),
      count,
      resumeText: resume?.textContent?.slice(0, 3000) ?? "",
    });

    const result = await db.transaction(async (tx) => {
      const [session] = await tx
        .insert(interviewSessions)
        .values({
          userId: user.id,
          role,
          difficulty,
          status: "in_progress",
          engine: generated.engine,
        })
        .returning();
      const questions = await tx
        .insert(interviewQuestions)
        .values(
          generated.questions.map((question, index) => ({
            sessionId: session.id,
            userId: user.id,
            position: index + 1,
            question: question.question,
            focus: question.focus,
          })),
        )
        .returning();
      return { session, questions };
    });

    return ok(
      {
        session: result.session,
        questions: result.questions,
        engine: generated.engine,
        warning: generated.warning,
        message: "Interview ready. Answer each question to receive structured feedback.",
      },
      201,
    );
  });
}

export async function DELETE() {
  return handle(async () => {
    const user = await requireWorkspaceUser();
    await db.delete(interviewSessions).where(eq(interviewSessions.userId, user.id));
    return ok({ message: "Interview history cleared." });
  });
}
