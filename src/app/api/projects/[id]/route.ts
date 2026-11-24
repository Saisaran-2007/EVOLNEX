import { and, eq } from "drizzle-orm";
import { db } from "@backend/db";
import { projects } from "@backend/db/schema";
import { ApiError, asInt, asString, handle, ok } from "@backend/lib/api";
import { requireWorkspaceUser } from "@backend/lib/workspace";

export const dynamic = "force-dynamic";

const STATUSES = ["not_started", "in_progress", "completed"] as const;

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireWorkspaceUser();
    const { id } = await params;
    const projectId = asInt(id, 0);
    if (!projectId) throw new ApiError(400, "Invalid project id.");
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const status = asString(body.status);
    if (!STATUSES.includes(status as (typeof STATUSES)[number])) {
      throw new ApiError(400, "Status must be not_started, in_progress or completed.");
    }
    const [updated] = await db
      .update(projects)
      .set({ status, updatedAt: new Date() })
      .where(and(eq(projects.id, projectId), eq(projects.userId, user.id)))
      .returning();
    if (!updated) throw new ApiError(404, "Project not found in your lab.");
    return ok({ project: updated, message: "Project status updated." });
  });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireWorkspaceUser();
    const { id } = await params;
    const projectId = asInt(id, 0);
    if (!projectId) throw new ApiError(400, "Invalid project id.");
    const [deleted] = await db
      .delete(projects)
      .where(and(eq(projects.id, projectId), eq(projects.userId, user.id)))
      .returning({ id: projects.id });
    if (!deleted) throw new ApiError(404, "Project not found in your lab.");
    return ok({ id: deleted.id, message: "Project removed." });
  });
}
