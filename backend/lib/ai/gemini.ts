/**
 * Gemini integration (server-only).
 * API key never leaves the server. All callers must be route handlers / server code.
 */

export type AiFailureReason =
  | "missing_key"
  | "invalid_credentials"
  | "model_unavailable"
  | "quota_exhausted"
  | "high_demand"
  | "network_error"
  | "timeout"
  | "invalid_response"
  | "disabled";

export class AiUnavailableError extends Error {
  reason: AiFailureReason;
  userMessage: string;

  constructor(reason: AiFailureReason, userMessage: string) {
    super(userMessage);
    this.name = "AiUnavailableError";
    this.reason = reason;
    this.userMessage = userMessage;
  }
}

const DEFAULT_MODELS = ["gemini-2.0-flash", "gemini-1.5-flash", "gemini-1.5-flash-8b"];
const TIMEOUT_MS = Number(process.env.GEMINI_TIMEOUT_MS ?? 25_000);

export function aiConfigured() {
  return Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);
}

function apiKey() {
  return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";
}

function modelChain() {
  const primary = process.env.GEMINI_MODEL?.trim();
  const fallbacks = (process.env.GEMINI_FALLBACK_MODELS ?? "")
    .split(",")
    .map((model) => model.trim())
    .filter(Boolean);
  const chain = [primary, ...fallbacks, ...DEFAULT_MODELS].filter(Boolean) as string[];
  return [...new Set(chain)];
}

function classifyStatus(status: number): AiFailureReason {
  if (status === 400 || status === 401 || status === 403) return "invalid_credentials";
  if (status === 404) return "model_unavailable";
  if (status === 429) return "quota_exhausted";
  if (status >= 500) return "high_demand";
  return "network_error";
}

const MESSAGES: Record<AiFailureReason, string> = {
  missing_key: "Gemini is not configured on this server. Add GEMINI_API_KEY to enable AI generation.",
  invalid_credentials: "The Gemini API key was rejected. Check that the key is valid and enabled for the Generative Language API.",
  model_unavailable: "The configured Gemini model is not available for this API key.",
  quota_exhausted: "The Gemini quota for this project is exhausted. Please retry later.",
  high_demand: "Gemini is under high demand right now. Please retry in a moment.",
  network_error: "We could not reach Gemini. Check the server network connection and retry.",
  timeout: "Gemini took too long to respond. Please retry.",
  invalid_response: "Gemini returned a response we could not validate. Please retry.",
  disabled: "AI generation is disabled by configuration.",
};

function stripCodeFences(text: string) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : trimmed;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return body.trim();
  return body.slice(start, end + 1).trim();
}

async function callModel(model: string, system: string, prompt: string) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey(),
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.4,
          topP: 0.9,
          maxOutputTokens: 4096,
          responseMimeType: "application/json",
        },
        safetySettings: [],
      }),
      signal: controller.signal,
      cache: "no-store",
    });

    if (!response.ok) {
      const raw = await response.text().catch(() => "");
      console.error(`[gemini] ${model} HTTP ${response.status}: ${raw.slice(0, 300)}`);
      throw new AiUnavailableError(classifyStatus(response.status), MESSAGES[classifyStatus(response.status)]);
    }

    const payload = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>;
      promptFeedback?: { blockReason?: string };
    };
    const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ?? "";
    if (!text.trim()) {
      throw new AiUnavailableError("invalid_response", MESSAGES.invalid_response);
    }
    return text;
  } catch (error) {
    if (error instanceof AiUnavailableError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new AiUnavailableError("timeout", MESSAGES.timeout);
    }
    console.error("[gemini] network error", error);
    throw new AiUnavailableError("network_error", MESSAGES.network_error);
  } finally {
    clearTimeout(timer);
  }
}

export type AiResult<T> = {
  data: T;
  engine: "gemini";
  model: string;
};

/**
 * Calls Gemini with model fallback and validates JSON output through the provided validator.
 * Throws AiUnavailableError only after every configured model failed.
 */
export async function generateValidatedJson<T>(
  params: { system: string; prompt: string; validate: (raw: unknown) => T },
): Promise<AiResult<T>> {
  if (process.env.EVOLNEX_DISABLE_AI === "true") {
    throw new AiUnavailableError("disabled", MESSAGES.disabled);
  }
  if (!aiConfigured()) {
    throw new AiUnavailableError("missing_key", MESSAGES.missing_key);
  }
  let lastError: AiUnavailableError = new AiUnavailableError("network_error", MESSAGES.network_error);

  for (const model of modelChain()) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const text = await callModel(model, params.system, params.prompt);
        let parsed: unknown;
        try {
          parsed = JSON.parse(stripCodeFences(text));
        } catch {
          throw new AiUnavailableError("invalid_response", MESSAGES.invalid_response);
        }
        const data = params.validate(parsed);
        return { data, engine: "gemini", model };
      } catch (error) {
        const failure =
          error instanceof AiUnavailableError
            ? error
            : new AiUnavailableError("invalid_response", MESSAGES.invalid_response);
        lastError = failure;
        console.error(`[gemini] model=${model} attempt=${attempt + 1} failed: ${failure.reason}`);
        // Auth / quota / timeout problems are unlikely to be fixed by a retry of the same model.
        if (failure.reason === "invalid_credentials" || failure.reason === "quota_exhausted") break;
        if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 400));
      }
    }
  }

  throw lastError;
}

export function aiFailurePayload(error: unknown) {
  if (error instanceof AiUnavailableError) {
    return { reason: error.reason, message: error.userMessage };
  }
  return { reason: "network_error" as AiFailureReason, message: MESSAGES.network_error };
}
