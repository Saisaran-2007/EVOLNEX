import { eq } from "drizzle-orm";
import { db } from "@backend/db";
import { profiles, users } from "@backend/db/schema";
import { ApiError, asInt, asString, handle, ok } from "@backend/lib/api";
import { ensureProfile, publicUser } from "@backend/lib/auth";
import { requireWorkspaceUser } from "@backend/lib/workspace";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => {
    const user = await requireWorkspaceUser();
    const profile = await ensureProfile(user.id);
    return ok({
      account: publicUser(user),
      profile: {
        fullName: profile.fullName,
        targetRole: profile.targetRole,
        preferences: profile.preferences ?? {},
      },
    });
  });
}

export async function PATCH(request: Request) {
  return handle(async () => {
    const user = await requireWorkspaceUser();
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

    if (body.fullName !== undefined) {
      const fullName = asString(body.fullName).slice(0, 160);
      if (fullName.length < 2) throw new ApiError(400, "Full name must be at least 2 characters.");
      await db.update(users).set({ fullName, updatedAt: new Date() }).where(eq(users.id, user.id));
      await db
        .update(profiles)
        .set({ fullName, updatedAt: new Date() })
        .where(eq(profiles.userId, user.id));
    }

    if (body.preferences !== undefined) {
      if (typeof body.preferences !== "object" || body.preferences === null) {
        throw new ApiError(400, "Preferences payload is invalid.");
      }
      const preferences = body.preferences as Record<string, unknown>;
      const weeklyHours = asInt(preferences.weeklyHours, 6);
      if (weeklyHours < 1 || weeklyHours > 60) {
        throw new ApiError(400, "Weekly study hours must be between 1 and 60.");
      }
      const difficulty = ["beginner", "intermediate", "advanced"].includes(asString(preferences.difficulty))
        ? asString(preferences.difficulty)
        : "intermediate";
      await ensureProfile(user.id);
      await db
        .update(profiles)
        .set({
          preferences: {
            weeklyHours,
            difficulty,
            locations: asString(preferences.locations).slice(0, 200),
            remoteOnly: Boolean(preferences.remoteOnly),
          },
          updatedAt: new Date(),
        })
        .where(eq(profiles.userId, user.id));
    }

    const updatedUser = (await db.select().from(users).where(eq(users.id, user.id)).limit(1))[0];
    const profile = await ensureProfile(user.id);
    return ok({
      account: publicUser(updatedUser),
      profile: {
        fullName: profile.fullName,
        targetRole: profile.targetRole,
        preferences: profile.preferences ?? {},
      },
      message: "Settings saved.",
    });
  });
}
