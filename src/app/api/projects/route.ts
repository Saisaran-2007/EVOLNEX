import { desc, eq } from "drizzle-orm";
import { db } from "@backend/db";
import { projects } from "@backend/db/schema";
import { ApiError, clientKey, handle, ok, rateLimit } from "@backend/lib/api";
import { requireWorkspaceUser } from "@backend/lib/workspace";
import { getLatestAnalysis, getProfile, resolveUserSkills } from "@backend/lib/career";
import { generateProjects } from "@backend/lib/ai/projects";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => {
    const user = await requireWorkspaceUser();
    const rows = await db
      .select()
      .from(projects)
      .where(eq(projects.userId, user.id))
      .orderBy(desc(projects.createdAt));
    return ok({
      projects: rows,
      stats: {
        total: rows.length,
        notStarted: rows.filter((row) => row.status === "not_started").length,
        inProgress: rows.filter((row) => row.status === "in_progress").length,
        completed: rows.filter((row) => row.status === "completed").length,
      },
    });
  });
}

export async function POST(request: Request) {
  return handle(async () => {
    const user = await requireWorkspaceUser();
    rateLimit(clientKey(request, `projects:${user.id}`), 8, 10 * 60 * 1000);
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

    const [profile, skillRows, analysis] = await Promise.all([
      getProfile(user.id),
      resolveUserSkills(user.id),
      getLatestAnalysis(user.id),
    ]);

    const targetRole = profile?.targetRole || analysis?.jobTitle || "";
    if (!targetRole) {
      throw new ApiError(400, "Add a target role to your profile first so projects can be matched to your direction.");
    }

    const existing = await db.select({ title: projects.title }).from(projects).where(eq(projects.userId, user.id));
    const outcome = await generateProjects({
      targetRole,
      currentSkills: skillRows.map((skill) => skill.name),
      missingSkills: analysis?.missingSkills ?? [],
      interests: profile?.interests ?? "",
      startIndex: existing.length,
    });

    const existingTitles = new Set(existing.map((row) => row.title.toLowerCase()));
    const fresh = outcome.projects.filter((project) => !existingTitles.has(project.title.toLowerCase()));
    if (fresh.length === 0) {
      return ok({
        projects: [],
        warning: outcome.warning,
        message: "Those recommendations are already in your Project Lab. Update your skills or target role to unlock new ideas.",
      });
    }

    const created = await db
      .insert(projects)
      .values(
        fresh.map((project) => ({
          userId: user.id,
          title: project.title.slice(0, 190),
          description: project.description,
          difficulty: project.difficulty,
          requiredSkills: project.requiredSkills,
          technologies: project.technologies,
          outcome: project.outcome,
          steps: project.steps,
          engine: outcome.engine,
        })),
      )
      .returning();

    return ok(
      {
        projects: created,
        engine: outcome.engine,
        warning: outcome.warning,
        message: `${created.length} project${created.length === 1 ? "" : "s"} added to your Project Lab.`,
      },
      201,
    );
  });
}
