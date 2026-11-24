import { eq } from "drizzle-orm";
import { db } from "@backend/db";
import { users } from "@backend/db/schema";
import { ApiError, asString, clientKey, handle, ok, rateLimit } from "@backend/lib/api";
import { createSession, ensureProfile, publicUser, verifyPassword } from "@backend/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handle(async () => {
    rateLimit(clientKey(request, "login"), 12, 5 * 60 * 1000);
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const email = asString(body.email).toLowerCase();
    const password = asString(body.password);
    if (!email || !password) throw new ApiError(400, "Email and password are required.");

    const rows = await db.select().from(users).where(eq(users.email, email)).limit(1);
    const user = rows[0];
    if (!user || !verifyPassword(password, user.passwordHash)) {
      throw new ApiError(401, "Email or password is incorrect.", { code: "invalid_credentials" });
    }

    await ensureProfile(user.id);
    await createSession(user.id);
    return ok({ user: publicUser(user) });
  });
}
