import { eq } from "drizzle-orm";
import { db } from "@backend/db";
import { users, type User } from "@backend/db/schema";
import { getCurrentUser } from "@backend/lib/auth";
import { DEMO_EMAIL, ensureDemoUser } from "@backend/lib/seed";

/**
 * Local single-user workspace mode.
 *
 * The app opens straight into a persistent workspace: if a signed-in session
 * exists it is used, otherwise the local workspace account is resolved (and
 * seeded once) so every module is immediately usable with real database records.
 * No login screen is required for this deployment mode.
 */
let workspacePromise: Promise<User> | null = null;

export async function getWorkspaceUser(): Promise<User> {
  const sessionUser = await getCurrentUser();
  if (sessionUser) return sessionUser;

  if (!workspacePromise) {
    workspacePromise = ensureDemoUser().catch((error: unknown) => {
      workspacePromise = null;
      throw error;
    });
  }

  try {
    return await workspacePromise;
  } catch (error) {
    // Fallback: resolve the workspace account without seeding if seeding failed.
    const rows = await db.select().from(users).where(eq(users.email, DEMO_EMAIL)).limit(1);
    if (rows[0]) return rows[0];
    throw error;
  }
}

export async function requireWorkspaceUser(): Promise<User> {
  return getWorkspaceUser();
}
