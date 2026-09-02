/** Centralized server-only OpenAI runtime gateway. Never import this from client code. */

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const DEFAULT_MODEL = "gpt-5.6-luna";

export type OpenAIGatewayStatus = {
  configured: boolean;
  verified: boolean;
  model: string;
  latencyMs?: number;
  errorCode?: string;
};

function cleanKey(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const valueTrimmed = value.trim();
  return valueTrimmed || undefined;
}

/** Resolve credentials at request time so deployment/runtime secrets are never captured at module load. */
export function getOpenAIKey(): string {
  const key = cleanKey(process.env["OPENAI_API_KEY"]) ?? cleanKey(process.env["OPENAI_API_KEYS"]);
  if (!key) {
    throw new Error("OpenAI is not configured on the server. Add OPENAI_API_KEY to the production server secrets, then run the AI preflight again.");
  }
  return key;
}

export async function verifyOpenAI(): Promise<OpenAIGatewayStatus> {
  const key = getOpenAIKey();
  const started = Date.now();
  try {
    const response = await fetch(OPENAI_RESPONSES_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        input: [{ role: "user", content: [{ type: "input_text", text: "Reply with exactly OK." }] }],
        max_output_tokens: 4,
      }),
      signal: AbortSignal.timeout(15000),
    });
    const latencyMs = Date.now() - started;
    if (!response.ok) {
      const status = response.status;
      if (status === 401) throw Object.assign(new Error("OpenAI rejected the server API key."), { code: "INVALID_KEY" });
      if (status === 403) throw Object.assign(new Error("OpenAI denied access to the configured project/model."), { code: "ACCESS_DENIED" });
      if (status === 429) throw Object.assign(new Error("OpenAI is reachable but the project is rate-limited or has reached its usage limit."), { code: "RATE_LIMITED" });
      throw Object.assign(new Error(`OpenAI health check failed with HTTP ${status}.`), { code: "UPSTREAM_ERROR" });
    }
    return { configured: true, verified: true, model: DEFAULT_MODEL, latencyMs };
  } catch (error) {
    if (error instanceof Error && "code" in error) throw error;
    throw Object.assign(new Error("OpenAI could not be reached from the production server."), { code: "NETWORK_ERROR" });
  }
}

export function normalizeOpenAIError(error: unknown): Error {
  if (error instanceof Error) return error;
  return new Error("The OpenAI service failed unexpectedly. Your previous design was preserved.");
}
