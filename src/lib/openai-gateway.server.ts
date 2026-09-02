/** Centralized server-only OpenAI runtime gateway. Never import this from client code. */

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const DEFAULT_MODEL = "gpt-5.6-luna";
const REQUIRED_SECRET_NAME = "QUICK_SERVE";

export type OpenAIGatewayStatus = {
  configured: boolean;
  verified: boolean;
  model: string;
  credential: typeof REQUIRED_SECRET_NAME;
  latencyMs?: number;
  errorCode?: string;
};

function cleanKey(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const valueTrimmed = value.trim();
  return valueTrimmed || undefined;
}

/** Resolve the single approved QUICK_SERVE credential at request time. */
export function getOpenAIKey(): string {
  // QUICK_SERVE is the OpenAI Platform key name. The hosting environment must expose
  // its secret value to the server under OPENAI_API_KEY; never commit the value.
  const key = cleanKey(process.env["OPENAI_API_KEY"]);
  if (!key) {
    throw Object.assign(
      new Error(`The ${REQUIRED_SECRET_NAME} OpenAI credential is not configured on the production server. Map the QUICK_SERVE key value to the server secret OPENAI_API_KEY, then run AI preflight again.`),
      { code: "MISSING_QUICK_SERVE" },
    );
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
      if (status === 401) throw Object.assign(new Error(`${REQUIRED_SECRET_NAME} was rejected by OpenAI.`), { code: "INVALID_QUICK_SERVE" });
      if (status === 403) throw Object.assign(new Error(`${REQUIRED_SECRET_NAME} does not have access to the configured OpenAI project/model.`), { code: "ACCESS_DENIED" });
      if (status === 429) throw Object.assign(new Error(`${REQUIRED_SECRET_NAME} is reachable but the OpenAI project is rate-limited or has reached its usage limit.`), { code: "RATE_LIMITED" });
      throw Object.assign(new Error(`OpenAI health check failed with HTTP ${status}.`), { code: "UPSTREAM_ERROR" });
    }
    return { configured: true, verified: true, model: DEFAULT_MODEL, credential: REQUIRED_SECRET_NAME, latencyMs };
  } catch (error) {
    if (error instanceof Error && "code" in error) throw error;
    throw Object.assign(new Error(`${REQUIRED_SECRET_NAME} could not reach OpenAI from the production server.`), { code: "NETWORK_ERROR" });
  }
}

export function normalizeOpenAIError(error: unknown): Error {
  if (error instanceof Error) return error;
  return new Error(`${REQUIRED_SECRET_NAME} failed unexpectedly. Your previous design was preserved.`);
}
