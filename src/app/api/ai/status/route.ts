import { aiConfigured } from "@backend/lib/ai/gemini";
import { handle, ok } from "@backend/lib/api";

export const dynamic = "force-dynamic";

/** Reports configuration state only — never exposes keys or model credentials. */
export async function GET() {
  return handle(async () => {
    const primary = process.env.GEMINI_MODEL?.trim() || "gemini-2.0-flash";
    const fallbacks = (process.env.GEMINI_FALLBACK_MODELS ?? "gemini-1.5-flash,gemini-1.5-flash-8b")
      .split(",")
      .map((model) => model.trim())
      .filter(Boolean);
    return ok({
      provider: "google-gemini",
      configured: aiConfigured(),
      primaryModel: primary,
      fallbackModels: fallbacks,
      mode: aiConfigured() ? "gemini" : "local-engine",
      note: aiConfigured()
        ? "Gemini is configured server-side. Requests fall back to the deterministic engine if every model fails."
        : "Gemini is not configured on this server. Analyses use the transparent EVOLNEX deterministic engine and are labelled as such.",
    });
  });
}
