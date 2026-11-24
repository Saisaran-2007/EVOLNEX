import { eq } from "drizzle-orm";
import { db } from "@backend/db";
import { users } from "@backend/db/schema";
import { ApiError, asString, clientKey, handle, ok, rateLimit } from "@backend/lib/api";
import { consumeAuthToken, issueAuthToken, publicUser } from "@backend/lib/auth";
import { requireWorkspaceUser } from "@backend/lib/workspace";

export const dynamic = "force-dynamic";

/** Resend the verification link for the signed-in account. */
export async function POST(request: Request) {
  return handle(async () => {
    rateLimit(clientKey(request, "verify-send"), 5, 10 * 60 * 1000);
    const user = await requireWorkspaceUser();
    if (user.emailVerifiedAt) return ok({ alreadyVerified: true, verificationUrl: null });
    const token = await issueAuthToken(user.id, "verify_email");
    const exposeLinks = process.env.EVOLNEX_DEV_LINKS !== "false";
    return ok({
      alreadyVerified: false,
      verificationUrl: exposeLinks ? `/verify-email?token=${token}` : null,
      message: "A fresh verification link has been issued for this account.",
    });
  });
}

/** Confirm an email address with a token. */
export async function PUT(request: Request) {
  return handle(async () => {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const token = asString(body.token);
    if (!token) throw new ApiError(400, "Verification token is missing.");
    const record = await consumeAuthToken(token, "verify_email");
    const [user] = await db
      .update(users)
      .set({ emailVerifiedAt: new Date(), updatedAt: new Date() })
      .where(eq(users.id, record.userId))
      .returning();
    return ok({ user: publicUser(user), message: "Email verified. Your account is fully activated." });
  });
}
