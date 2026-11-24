import { db } from "@backend/db";
import { sql } from "drizzle-orm";
import { aiConfigured } from "@backend/lib/ai/gemini";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await db.execute(sql`select 1`);
    return Response.json({
      ok: true,
      service: "evolnex",
      database: "connected",
      ai: aiConfigured() ? "gemini" : "local-engine",
      timestamp: new Date().toISOString(),
    });
  } catch {
    return Response.json({ ok: false, database: "unavailable" }, { status: 500 });
  }
}
