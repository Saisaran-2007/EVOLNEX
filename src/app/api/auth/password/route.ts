import { eq } from "drizzle-orm";
import { db } from "@backend/db";
import { sessions, users } from "@backend/db/schema";
import { ApiError, asString, clientKey, handle, isEmail, ok, rateLimit } from "@backend/lib/api";
import { consumeAuthToken, hashPassword, issueAuthToken, requireUser, verifyPassword } from "@backend/lib/auth";

export const dynamic = "force-dynamic";

/** Request a password reset link. Always responds generically for unknown emails. */
export async function POST(request: Request) {
  return handle(async () => {
    rateLimit(clientKey(request, "reset-request"), 6, 10 * 60 * 1000);
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const email = asString(body.email).toLowerCase();
    if (!isEmail(email)) throw new ApiError(400, "Please enter a valid email address.");

    const rows = await db.select().from(users).where(eq(users.email, email)).limit(1);
    const user = rows[0];
    const genericMessage =
      "This workspace runs in local single-user mode, so there is no email reset flow. Account security is managed in Settings.";
    if (!user) return ok({ message: genericMessage, resetUrl: null });

    // Token issuance is kept for API compatibility with registered accounts.
    await issueAuthToken(user.id, "reset_password");
    return ok({ message: genericMessage, resetUrl: null, resetTokenIssued: true });
  });
}

/** Complete a reset with a valid token. Invalidates all existing sessions. */
export async function PUT(request: Request) {
  return handle(async () => {
    rateLimit(clientKey(request, "reset-complete"), 10, 10 * 60 * 1000);
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const token = asString(body.token);
    const password = asString(body.password);
    if (!token) throw new ApiError(400, "Reset token is missing.");
    if (password.length < 8) throw new ApiError(400, "Password must be at least 8 characters.");

    const record = await consumeAuthToken(token, "reset_password");
    await db
      .update(users)
      .set({ passwordHash: hashPassword(password), updatedAt: new Date() })
      .where(eq(users.id, record.userId));
    await db.delete(sessions).where(eq(sessions.userId, record.userId));
    return ok({ message: "Password updated. Please sign in with your new password." });
  });
}

/** Change password from inside the authenticated workspace. */
export async function PATCH(request: Request) {
  return handle(async () => {
    const user = await requireUser();
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const currentPassword = asString(body.currentPassword);
    const newPassword = asString(body.newPassword);
    if (!verifyPassword(currentPassword, user.passwordHash)) {
      throw new ApiError(400, "Your current password is incorrect.");
    }
    if (newPassword.length < 8) throw new ApiError(400, "New password must be at least 8 characters.");
    if (newPassword === currentPassword) throw new ApiError(400, "Choose a password you have not used before.");

    await db
      .update(users)
      .set({ passwordHash: hashPassword(newPassword), updatedAt: new Date() })
      .where(eq(users.id, user.id));
    return ok({ message: "Password changed successfully." });
  });
}
