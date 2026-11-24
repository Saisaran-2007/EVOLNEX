import { and, eq } from "drizzle-orm";
import { db } from "@backend/db";
import { roadmapTasks } from "@backend/db/schema";
import { ApiError, asInt, handle, ok } from "@backend/lib/api";
import { requireWorkspaceUser } from "@backend/lib/workspace";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireWorkspaceUser();
    const { id } = await params;
    const taskId = asInt(id, 0);
    if (!taskId) throw new ApiError(400, "Invalid task id.");

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const rows = await db
      .select()
      .from(roadmapTasks)
      .where(and(eq(roadmapTasks.id, taskId), eq(roadmapTasks.userId, user.id)))
      .limit(1);
    const existing = rows[0];
    if (!existing) throw new ApiError(404, "Task not found in your roadmap.");

    const completed = typeof body.completed === "boolean" ? body.completed : !existing.completed;
    const [updated] = await db
      .update(roadmapTasks)
      .set({ completed, completedAt: completed ? new Date() : null })
      .where(and(eq(roadmapTasks.id, taskId), eq(roadmapTasks.userId, user.id)))
      .returning();

    const siblings = await db
      .select({ completed: roadmapTasks.completed })
      .from(roadmapTasks)
      .where(and(eq(roadmapTasks.roadmapId, existing.roadmapId), eq(roadmapTasks.userId, user.id)));
    const completedCount = siblings.filter((task) => task.completed).length;

    return ok({
      task: updated,
      progress: {
        total: siblings.length,
        completed: completedCount,
        percent: siblings.length ? Math.round((completedCount / siblings.length) * 100) : 0,
      },
      message: completed ? "Task marked complete." : "Task reopened.",
    });
  });
}
