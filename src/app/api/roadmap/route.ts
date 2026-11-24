import { desc, eq } from "drizzle-orm";
import { db } from "@backend/db";
import { roadmapTasks, roadmaps } from "@backend/db/schema";
import { ApiError, asInt, asString, clientKey, handle, ok, rateLimit } from "@backend/lib/api";
import { requireWorkspaceUser } from "@backend/lib/workspace";
import { getLatestAnalysis, getLatestRoadmap, getProfile, resolveUserSkills } from "@backend/lib/career";
import { generateRoadmap } from "@backend/lib/ai/roadmap";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => {
    const user = await requireWorkspaceUser();
    const current = await getLatestRoadmap(user.id);
    const history = await db
      .select({ id: roadmaps.id, title: roadmaps.title, createdAt: roadmaps.createdAt, engine: roadmaps.engine })
      .from(roadmaps)
      .where(eq(roadmaps.userId, user.id))
      .orderBy(desc(roadmaps.createdAt))
      .limit(10);
    return ok({
      roadmap: current?.roadmap ?? null,
      tasks: current?.tasks ?? [],
      history,
      progress: current
        ? {
            total: current.tasks.length,
            completed: current.tasks.filter((task) => task.completed).length,
            percent: current.tasks.length
              ? Math.round((current.tasks.filter((task) => task.completed).length / current.tasks.length) * 100)
              : 0,
            hours: current.tasks.reduce((total, task) => total + task.durationHours, 0),
          }
        : null,
    });
  });
}

export async function POST(request: Request) {
  return handle(async () => {
    const user = await requireWorkspaceUser();
    rateLimit(clientKey(request, `roadmap:${user.id}`), 6, 10 * 60 * 1000);
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

    const [profile, skillRows, analysis] = await Promise.all([
      getProfile(user.id),
      resolveUserSkills(user.id),
      getLatestAnalysis(user.id),
    ]);

    const targetRole = asString(body.targetRole) || analysis?.jobTitle || profile?.targetRole || "Software Engineer";
    const missing = Array.isArray(body.missingSkills)
      ? (body.missingSkills as unknown[]).map(String)
      : (analysis?.missingSkills ?? []);
    if (!analysis && !profile?.targetRole && !asString(body.targetRole)) {
      throw new ApiError(400, "Set a target role in your profile or run a job-fit analysis first.");
    }

    const weeklyHours = asInt(profile?.preferences?.weeklyHours, 6);
    const plan = await generateRoadmap({
      targetRole,
      missingSkills: missing,
      currentSkills: skillRows.map((skill) => skill.name),
      weeklyHours,
      summary: analysis?.summary ?? "",
    });

    const result = await db.transaction(async (tx) => {
      const [roadmap] = await tx
        .insert(roadmaps)
        .values({
          userId: user.id,
          title: plan.title.slice(0, 190),
          targetRole: targetRole.slice(0, 150),
          summary: plan.summary,
          estimatedWeeks: plan.estimatedWeeks,
          focusSkills: plan.focusSkills,
          analysisId: analysis?.id ?? null,
          engine: plan.engine,
        })
        .returning();

      const taskValues = plan.weeks.flatMap((week) =>
        week.tasks.map((task) => ({
          roadmapId: roadmap.id,
          userId: user.id,
          week: week.week,
          title: task.title.slice(0, 230),
          description: task.description,
          skill: task.skill,
          resourceLabel: task.resourceLabel.slice(0, 190),
          resourceUrl: task.resourceUrl,
          exercise: task.exercise,
          durationHours: task.durationHours,
        })),
      );
      const tasks = taskValues.length
        ? await tx.insert(roadmapTasks).values(taskValues).returning()
        : [];
      return { roadmap, tasks };
    });

    return ok(
      {
        roadmap: result.roadmap,
        tasks: result.tasks,
        engine: plan.engine,
        warning: plan.warning,
        progress: {
          total: result.tasks.length,
          completed: 0,
          percent: 0,
          hours: result.tasks.reduce((total, task) => total + task.durationHours, 0),
        },
        message: `Roadmap generated with ${result.tasks.length} tasks across ${plan.estimatedWeeks} weeks.`,
      },
      201,
    );
  });
}
