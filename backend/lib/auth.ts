import { randomBytes, randomUUID, scryptSync, timingSafeEqual, createHash } from "node:crypto";
import { cookies } from "next/headers";
import { and, eq, gt } from "drizzle-orm";
import { db } from "@backend/db";
import { authTokens, profiles, sessions, users, type User } from "@backend/db/schema";
import { ApiError } from "@backend/lib/api";

export const SESSION_COOKIE = "evolnex_session";
const SESSION_TTL_DAYS = 30;

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${derived}`;
}

export function verifyPassword(password: string, stored: string) {
  try {
    const [scheme, salt, digest] = stored.split(":");
    if (scheme !== "scrypt" || !salt || !digest) return false;
    const derived = scryptSync(password, salt, 64);
    const expected = Buffer.from(digest, "hex");
    if (expected.length !== derived.length) return false;
    return timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function newToken() {
  return `${randomUUID().replace(/-/g, "")}${randomBytes(16).toString("hex")}`;
}

export async function createSession(userId: number) {
  const token = newToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
  await db.insert(sessions).values({ userId, tokenHash: hashToken(token), expiresAt });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
  return token;
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
  }
  jar.delete(SESSION_COOKIE);
}

export async function getCurrentUser(): Promise<User | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const rows = await db
    .select({ user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, new Date())))
    .limit(1);
  return rows[0]?.user ?? null;
}

export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) {
    throw new ApiError(401, "Please sign in to continue.", { code: "unauthenticated" });
  }
  return user;
}

export async function ensureProfile(userId: number) {
  const existing = await db.select().from(profiles).where(eq(profiles.userId, userId)).limit(1);
  if (existing[0]) return existing[0];
  const user = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const row = await db
    .insert(profiles)
    .values({
      userId,
      fullName: user[0]?.fullName ?? "",
      contactEmail: user[0]?.email ?? "",
    })
    .returning();
  return row[0];
}

export async function issueAuthToken(userId: number, type: "verify_email" | "reset_password") {
  const token = newToken();
  const ttlMs = type === "verify_email" ? 24 * 60 * 60 * 1000 : 60 * 60 * 1000;
  await db.insert(authTokens).values({
    userId,
    type,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + ttlMs),
  });
  return token;
}

export async function consumeAuthToken(token: string, type: "verify_email" | "reset_password") {
  const rows = await db
    .select()
    .from(authTokens)
    .where(and(eq(authTokens.tokenHash, hashToken(token)), eq(authTokens.type, type)))
    .limit(1);
  const record = rows[0];
  if (!record || record.usedAt || record.expiresAt.getTime() < Date.now()) {
    throw new ApiError(400, "This link is invalid or has expired. Please request a new one.", {
      code: "invalid_token",
    });
  }
  await db.update(authTokens).set({ usedAt: new Date() }).where(eq(authTokens.id, record.id));
  return record;
}

export function publicUser(user: User) {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    emailVerified: Boolean(user.emailVerifiedAt),
    isDemo: user.isDemo,
    createdAt: user.createdAt,
  };
}
