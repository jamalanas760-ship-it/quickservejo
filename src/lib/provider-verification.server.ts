import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ProviderName = "openai" | "figma" | "canva" | "adobe";
export type ProviderCheck = {
  provider: ProviderName;
  connected: boolean;
  verified: boolean;
  status: "healthy" | "needs_configuration" | "unauthorized" | "forbidden" | "error";
  latencyMs: number | null;
  capability: string;
  message: string;
  checkedAt: string;
  details?: Record<string, unknown>;
};

const providerSchema = z.enum(["openai", "figma", "canva", "adobe"]);
const verifyInput = z.object({ provider: providerSchema.optional() });

function secret(name: string) {
  return process.env[name]?.trim() || null;
}

async function timedFetch(input: RequestInfo | URL, init?: RequestInit) {
  const started = Date.now();
  const response = await fetch(input, init);
  return { response, latencyMs: Date.now() - started };
}

function result(provider: ProviderName, data: Omit<ProviderCheck, "provider" | "checkedAt">): ProviderCheck {
  return { provider, checkedAt: new Date().toISOString(), ...data };
}

async function verifyOpenAI(): Promise<ProviderCheck> {
  const apiKey = secret("OPENAI_API_KEY") ?? secret("OPENAI_API_KEYS");
  const model = secret("OPENAI_MENU_MODEL") ?? "gpt-5.6-luna";
  if (!apiKey) return result("openai", { connected: false, verified: false, status: "needs_configuration", latencyMs: null, capability: "Responses API + vision", message: "OPENAI_API_KEY or OPENAI_API_KEYS is not configured in the QuickServe server runtime.", details: { model } });

  const started = Date.now();
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, input: "Reply with exactly QUICKSERVE_OPENAI_RUNTIME_OK", max_output_tokens: 16 }),
    });
    const latencyMs = Date.now() - started;
    if (!response.ok) return result("openai", { connected: false, verified: false, status: response.status === 401 ? "unauthorized" : response.status === 403 ? "forbidden" : "error", latencyMs, capability: "Responses API + vision", message: `OpenAI Responses API runtime verification failed (${response.status}).`, details: { model } });
    const body = await response.json() as { output_text?: string };
    const verified = body.output_text?.trim() === "QUICKSERVE_OPENAI_RUNTIME_OK";
    return result("openai", { connected: true, verified, status: verified ? "healthy" : "error", latencyMs, capability: "Responses API + vision", message: verified ? "OpenAI Responses API is authenticated and responding from the QuickServe server runtime." : "OpenAI responded, but the runtime smoke-test response did not match the expected value.", details: { model } });
  } catch (error) {
    return result("openai", { connected: false, verified: false, status: "error", latencyMs: Date.now() - started, capability: "Responses API + vision", message: error instanceof Error ? `OpenAI runtime request failed: ${error.message}` : "OpenAI runtime request failed.", details: { model } });
  }
}

async function verifyFigma(): Promise<ProviderCheck> {
  const token = secret("FIGMA_ACCESS_TOKEN");
  if (!token) return result("figma", { connected: false, verified: false, status: "needs_configuration", latencyMs: null, capability: "REST file read", message: "FIGMA_ACCESS_TOKEN is not configured." });
  const { response, latencyMs } = await timedFetch("https://api.figma.com/v1/me", { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) return result("figma", { connected: false, verified: false, status: response.status === 401 ? "unauthorized" : response.status === 403 ? "forbidden" : "error", latencyMs, capability: "REST file read", message: `Figma authentication check failed (${response.status}).` });
  const body = await response.json() as { id?: string; handle?: string; email?: string };
  return result("figma", { connected: true, verified: true, status: "healthy", latencyMs, capability: "REST file read", message: `Figma authenticated as ${body.handle ?? body.email ?? "connected user"}.`, details: { userId: body.id ?? null, handle: body.handle ?? null } });
}

async function verifyCanva(): Promise<ProviderCheck> {
  const clientId = secret("CANVA_CLIENT_ID");
  const clientSecret = secret("CANVA_CLIENT_SECRET");
  const accessToken = secret("CANVA_ACCESS_TOKEN");
  if (!clientId || !clientSecret || !accessToken) return result("canva", { connected: false, verified: false, status: "needs_configuration", latencyMs: null, capability: "OAuth + Design API", message: "CANVA_CLIENT_ID, CANVA_CLIENT_SECRET and CANVA_ACCESS_TOKEN are required." });
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const body = new URLSearchParams({ token: accessToken });
  const { response, latencyMs } = await timedFetch("https://api.canva.com/rest/v1/oauth/introspect", { method: "POST", headers: { Authorization: `Basic ${credentials}`, "Content-Type": "application/x-www-form-urlencoded" }, body });
  if (!response.ok) return result("canva", { connected: false, verified: false, status: response.status === 401 ? "unauthorized" : response.status === 403 ? "forbidden" : "error", latencyMs, capability: "OAuth + Design API", message: `Canva token verification failed (${response.status}).` });
  const tokenInfo = await response.json() as { active?: boolean; scope?: string; exp?: number };
  if (!tokenInfo.active) return result("canva", { connected: false, verified: false, status: "unauthorized", latencyMs, capability: "OAuth + Design API", message: "Canva access token is inactive.", details: { scope: tokenInfo.scope ?? null } });
  const { response: designsResponse } = await timedFetch("https://api.canva.com/rest/v1/designs?limit=1", { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!designsResponse.ok) return result("canva", { connected: true, verified: false, status: designsResponse.status === 403 ? "forbidden" : "error", latencyMs, capability: "OAuth + Design API", message: `Canva token is valid, but Design API access failed (${designsResponse.status}).`, details: { scope: tokenInfo.scope ?? null } });
  return result("canva", { connected: true, verified: true, status: "healthy", latencyMs, capability: "OAuth + Design API", message: "Canva OAuth token and Design API are verified.", details: { scope: tokenInfo.scope ?? null, expiresAt: tokenInfo.exp ? new Date(tokenInfo.exp * 1000).toISOString() : null } });
}

async function verifyAdobe(): Promise<ProviderCheck> {
  const clientId = secret("ADOBE_CLIENT_ID") ?? secret("ADOBE_EXPRESS_CLIENT_ID");
  const clientSecret = secret("ADOBE_CLIENT_SECRET");
  if (!clientId || !clientSecret) return result("adobe", { connected: false, verified: false, status: "needs_configuration", latencyMs: null, capability: "Photoshop API v2 / Firefly Services", message: "ADOBE_CLIENT_ID and ADOBE_CLIENT_SECRET are required." });
  const tokenBody = new URLSearchParams({ grant_type: "client_credentials", client_id: clientId, client_secret: clientSecret, scope: "openid,AdobeID,read_organizations" });
  const { response: tokenResponse, latencyMs: tokenLatency } = await timedFetch("https://ims-na1.adobelogin.com/ims/token/v3", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: tokenBody });
  if (!tokenResponse.ok) return result("adobe", { connected: false, verified: false, status: tokenResponse.status === 401 ? "unauthorized" : tokenResponse.status === 403 ? "forbidden" : "error", latencyMs: tokenLatency, capability: "Photoshop API v2 / Firefly Services", message: `Adobe token generation failed (${tokenResponse.status}).` });
  const token = await tokenResponse.json() as { access_token?: string };
  if (!token.access_token) return result("adobe", { connected: false, verified: false, status: "error", latencyMs: tokenLatency, capability: "Photoshop API v2 / Firefly Services", message: "Adobe returned no access token." });
  const { response: helloResponse, latencyMs: helloLatency } = await timedFetch("https://image.adobe.io/pie/psdService/hello", { headers: { Authorization: `Bearer ${token.access_token}`, "x-api-key": clientId } });
  if (!helloResponse.ok) return result("adobe", { connected: true, verified: false, status: helloResponse.status === 401 ? "unauthorized" : helloResponse.status === 403 ? "forbidden" : "error", latencyMs: tokenLatency + helloLatency, capability: "Photoshop API v2 / Firefly Services", message: `Adobe Photoshop API verification failed (${helloResponse.status}).` });
  const hello = (await helloResponse.text()).slice(0, 200);
  return result("adobe", { connected: true, verified: true, status: "healthy", latencyMs: tokenLatency + helloLatency, capability: "Photoshop API v2 / Firefly Services", message: "Adobe server-to-server authentication and Photoshop API are verified.", details: { hello } });
}

async function verify(provider: ProviderName) {
  if (provider === "openai") return verifyOpenAI();
  if (provider === "figma") return verifyFigma();
  if (provider === "canva") return verifyCanva();
  return verifyAdobe();
}

export const verifyCreativeProviders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => verifyInput.parse(input))
  .handler(async ({ data }) => {
    const providers: ProviderName[] = data.provider ? [data.provider] : ["openai", "figma", "canva", "adobe"];
    return Promise.all(providers.map(verify));
  });
