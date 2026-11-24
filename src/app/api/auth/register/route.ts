import { eq } from "drizzle-orm";
import { db } from "@backend/db";
import { users } from "@backend/db/schema";
import { ApiError, asString, clientKey, handle, isEmail, ok, rateLimit } from "@backend/lib/api";
import {
  createSession,
  ensureProfile,
  hashPassword,
  issueAuthToken,
  publicUser,
} from "@backend/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handle(async () => {
    rateLimit(clientKey(request, "register"), 10, 10 * 60 * 1000);
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const fullName = asString(body.fullName).slice(0, 160);
    const email = asString(body.email).toLowerCase().slice(0, 320);
    const password = asString(body.password);

    if (fullName.length < 2) throw new ApiError(400, "Please enter your full name.");
    if (!isEmail(email)) throw new ApiError(400, "Please enter a valid email address.");
    if (password.length < 8) throw new ApiError(400, "Password must be at least 8 characters.");

    const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
    if (existing[0]) throw new ApiError(409, "An account with this email already exists. Try signing in.");

    const [user] = await db
      .insert(users)
      .values({ email, fullName, passwordHash: hashPassword(password) })
      .returning();

    await ensureProfile(user.id);
    const verificationToken = await issueAuthToken(user.id, "verify_email");
    await createSession(user.id);

    const exposeLinks = process.env.EVOLNEX_DEV_LINKS !== "false";
    return ok({
      user: publicUser(user),
      verificationUrl: exposeLinks ? `/verify-email?token=${verificationToken}` : null,
      message: "Account created. Verify your email to unlock the full career workspace.",
    }, 201);
  });
}
