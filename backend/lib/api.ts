import { NextResponse } from "next/server";

export class ApiError extends Error {
  status: number;
  details?: unknown;
  code?: string;

  constructor(status: number, message: string, options?: { details?: unknown; code?: string }) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = options?.details;
    this.code = options?.code;
  }
}

export function ok<T>(data: T, status = 200) {
  return NextResponse.json({ ok: true, data }, { status });
}

export function fail(status: number, message: string, code?: string) {
  return NextResponse.json({ ok: false, error: message, code }, { status });
}

export async function handle<T>(fn: () => Promise<T>) {
  try {
    const result = await fn();
    return result instanceof NextResponse ? result : ok(result);
  } catch (error) {
    if (error instanceof ApiError) {
      return fail(error.status, error.message, error.code);
    }
    console.error("[api] unhandled error", error);
    return fail(500, "Something went wrong on our side. Please try again in a moment.", "internal_error");
  }
}

/** Best-effort in-memory rate limiter (per process) for expensive / auth endpoints. */
const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const existing = buckets.get(key);
  if (!existing || existing.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  existing.count += 1;
  if (existing.count > limit) {
    throw new ApiError(429, "Too many requests. Please wait a moment and try again.", {
      code: "rate_limited",
    });
  }
}

export function clientKey(request: Request, scope: string) {
  const forwarded = request.headers.get("x-forwarded-for") ?? "local";
  return `${scope}:${forwarded.split(",")[0]?.trim() ?? "local"}`;
}

export function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

export function asInt(value: unknown, fallback = 0): number {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item.length > 0)
    .slice(0, 60);
}

export function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.round(value)));
}
