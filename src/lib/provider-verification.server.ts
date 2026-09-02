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
  try {
    const response = await fetch(input, init);
    return { response, latencyMs: Date.now() - started, error: null as Error | null };
  } catch (error) {
    return {
      response: null,
      latencyMs: Date.now() - started,
      error: error instanceof Error ? error : new Error("Network request failed."),
    };
  }
}

function result(provider: ProviderName, data: Omit<ProviderCheck, "provider" | "checkedAt">): ProviderCheck {
  return { provider, checkedAt: new Date().toISOString(), ...data };
}

async function verifyOpenAI(): Promise<ProviderCheck> {
  const apiKey = secret("OPENAI_API_KEY") ?? secret("OPENAI_API_KEYS");
  const model = secret("OPENAI_MENU_MODEL") ?? "gpt-5.6-luna";
  if (!apiKey) return result("openai", { connected: false, verified: false, status: "needs_configuration", latencyMs: null, capability: "Responses API + vision", message: "OPENAI_API_KEY or OPENAI_API_KEYS is not configured in the QuickServe server runtime.", details: { model } });

  const { response, latencyMs, error } = await timedFetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, input: "Reply with exactly QUICKSERVE_OPENAI_RUNTIME_OK", max_output_tokens: 16 }),
  });
  if (error) return result("openai", { connected: false, verified: false, status: "error", latencyMs, capability: "Responses API + vision", message: `OpenAI runtime request failed: ${error.message}`, details: { model } });
  if (!response!.ok) return result("openai", { connected: false, verified: false, status: response!.status === 401 ? "unauthorized" : response!.status === 403 ? "forbidden" : "error", latencyMs, capability: "Responses API + vision", message: `OpenAI Responses API runtime verification failed (${response!.status}).`, details: { model } });
  const body = await response!.json() as { output_text?: string };
  const verified = body.output_text?.trim() === "QUICKSERVE_OPENAI_RUNTIME_OK";
  return result("openai", { connected: true, verified, status: verified ? "healthy" : "error", latencyMs, capability: "Responses API + vision", message: verified ? "OpenAI Responses API is authenticated and responding from the QuickServe server runtime." : "OpenAI responded, but the runtime smoke-test response did not match the expected value.", details: { model } });
}

async function verifyFigma(): Promise<ProviderCheck> {
  const token = secret("FIGMA_ACCESS_TOKEN");
  if (!token) return result("figma", { connected: false, verified: false, status: "needs_configuration", latencyMs: null, capability: "REST file read", message: "FIGMA_ACCESS_TOKEN is not configured." });
  const { response, latencyMs, error } = await timedFetch("https://api.figma.com/v1/me", { headers: { Authorization: `Bearer ${token}` } });
  if (error) return result("figma", { connected: false, verified: false, status: "error", latencyMs, capability: "REST file read", message: `Figma verification request failed: ${error.message}` });
  if (!response!.ok) return result("figma", { connected: false, verified: false, status: response!.status === 401 ? "unauthorized" : response!.status === 403 ? "forbidden" : "error", latencyMs, capability: "REST file read", message: `Figma authentication check failed (${response!.status}).` });
  const body = await response!.json() as { id?: string; handle?: string; email?: string };
  return result("figma", { connected: true, verified: true, status: "healthy", latencyMs, capability: "REST file read", message: `Figma authenticated as ${body.handle ?? body.email ?? "connected user"}.`, details: { userId: body.id ?? null, handle: body.handle ?? null } });
}

async function verifyCanva(): Promise<ProviderCheck> {
  const clientId = secret("CANVA_CLIENT_ID");
  const clientSecret = secret("CANVA_CLIENT_SECRET");
  const accessToken = secret("CANVA_ACCESS_TOKEN");
  if (!clientId || !clientSecret || !accessToken) {
    return result("canva", {
      connected: false,
      verified: false,
      status: "needs_configuration",
      latencyMs: null,
      capability: "Canva Connect OAuth + Design API",
      message: "CANVA_CLIENT_ID, CANVA_CLIENT_SECRET and CANVA_ACCESS_TOKEN are required in the QuickServe server runtime.",
      details: { missing: [!clientId && "CANVA_CLIENT_ID", !clientSecret && "CANVA_CLIENT_SECRET", !accessToken && "CANVA_ACCESS_TOKEN"].filter(Boolean) },
    });
  }

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const { response: introspectResponse, latencyMs: introspectLatency, error: introspectError } = await timedFetch("https://api.canva.com/rest/v1/oauth/introspect", {
    method: "POST",
    headers: { Authorization: `Basic ${credentials}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token: accessToken }),
  });
  if (introspectError) return result("canva", { connected: false, verified: false, status: "error", latencyMs: introspectLatency, capability: "Canva Connect OAuth + Design API", message: `Canva token verification request failed: ${introspectError.message}` });
  if (!introspectResponse!.ok) return result("canva", { connected: false, verified: false, status: introspectResponse!.status === 401 ? "unauthorized" : introspectResponse!.status === 403 ? "forbidden" : "error", latencyMs: introspectLatency, capability: "Canva Connect OAuth + Design API", message: `Canva token verification failed (${introspectResponse!.status}).` });

  const tokenInfo = await introspectResponse!.json() as { active?: boolean; scope?: string; exp?: number; client?: string; sub?: string };
  if (!tokenInfo.active) return result("canva", { connected: false, verified: false, status: "unauthorized", latencyMs: introspectLatency, capability: "Canva Connect OAuth + Design API", message: "Canva access token is inactive or expired.", details: { scope: tokenInfo.scope ?? null, expiresAt: tokenInfo.exp ? new Date(tokenInfo.exp * 1000).toISOString() : null } });

  const { response: designsResponse, latencyMs: designsLatency, error: designsError } = await timedFetch("https://api.canva.com/rest/v1/designs?limit=1", { headers: { Authorization: `Bearer ${accessToken}` } });
  const latencyMs = introspectLatency + designsLatency;
  if (designsError) return result("canva", { connected: true, verified: false, status: "error", latencyMs, capability: "Canva Connect OAuth + Design API", message: `Canva Design API verification request failed: ${designsError.message}`, details: { scope: tokenInfo.scope ?? null } });
  if (!designsResponse!.ok) return result("canva", { connected: true, verified: false, status: designsResponse!.status === 401 ? "unauthorized" : designsResponse!.status === 403 ? "forbidden" : "error", latencyMs, capability: "Canva Connect OAuth + Design API", message: `Canva token is valid, but Design API access failed (${designsResponse!.status}). Check the required Design API scopes.`, details: { scope: tokenInfo.scope ?? null } });

  return result("canva", { connected: true, verified: true, status: "healthy", latencyMs, capability: "Canva Connect OAuth + Design API", message: "Canva OAuth token and Design API are verified from the QuickServe server runtime.", details: { scope: tokenInfo.scope ?? null, client: tokenInfo.client ?? null, subject: tokenInfo.sub ?? null, expiresAt: tokenInfo.exp ? new Date(tokenInfo.exp * 1000).toISOString() : null } });
}

async function verifyAdobe(): Promise<ProviderCheck> {
  // ADOBE_EXPRESS_CLIENT_ID is intentionally not accepted here: the Photoshop/Firefly
  // server-to-server API requires its own Developer Console OAuth credentials.
  const clientId = secret("ADOBE_CLIENT_ID");
  const clientSecret = secret("ADOBE_CLIENT_SECRET");
  if (!clientId || !clientSecret) {
    return result("adobe", {
      connected: false,
      verified: false,
      status: "needs_configuration",
      latencyMs: null,
      capability: "Photoshop API v2 / Firefly Services",
      message: "ADOBE_CLIENT_ID and ADOBE_CLIENT_SECRET are required in the QuickServe server runtime.",
      details: { missing: [!clientId && "ADOBE_CLIENT_ID", !clientSecret && "ADOBE_CLIENT_SECRET"].filter(Boolean) },
    });
  }

  const tokenBody = new URLSearchParams({ grant_type: "client_credentials", client_id: clientId, client_secret: clientSecret, scope: "openid,AdobeID,read_organizations" });
  const { response: tokenResponse, latencyMs: tokenLatency, error: tokenError } = await timedFetch("https://ims-na1.adobelogin.com/ims/token/v3", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: tokenBody,
  });
  if (tokenError) return result("adobe", { connected: false, verified: false, status: "error", latencyMs: tokenLatency, capability: "Photoshop API v2 / Firefly Services", message: `Adobe token request failed: ${tokenError.message}` });
  if (!tokenResponse!.ok) return result("adobe", { connected: false, verified: false, status: tokenResponse!.status === 401 ? "unauthorized" : tokenResponse!.status === 403 ? "forbidden" : "error", latencyMs: tokenLatency, capability: "Photoshop API v2 / Firefly Services", message: `Adobe OAuth token generation failed (${tokenResponse!.status}).` });

  const token = await tokenResponse!.json() as { access_token?: string; expires_in?: number };
  if (!token.access_token) return result("adobe", { connected: false, verified: false, status: "error", latencyMs: tokenLatency, capability: "Photoshop API v2 / Firefly Services", message: "Adobe returned no access token." });

  const { response: helloResponse, latencyMs: helloLatency, error: helloError } = await timedFetch("https://image.adobe.io/pie/psdService/hello", { headers: { Authorization: `Bearer ${token.access_token}`, "x-api-key": clientId } });
  const latencyMs = tokenLatency + helloLatency;
  if (helloError) return result("adobe", { connected: true, verified: false, status: "error", latencyMs, capability: "Photoshop API v2 / Firefly Services", message: `Adobe Photoshop API verification request failed: ${helloError.message}` });
  if (!helloResponse!.ok) return result("adobe", { connected: true, verified: false, status: helloResponse!.status === 401 ? "unauthorized" : helloResponse!.status === 403 ? "forbidden" : "error", latencyMs, capability: "Photoshop API v2 / Firefly Services", message: `Adobe Photoshop API verification failed (${helloResponse!.status}). Check that the Developer Console project has the required Photoshop API / Firefly Services access.`, details: { expiresIn: token.expires_in ?? null } });

  const hello = (await helloResponse!.text()).slice(0, 200);
  return result("adobe", { connected: true, verified: true, status: "healthy", latencyMs, capability: "Photoshop API v2 / Firefly Services", message: "Adobe server-to-server authentication and Photoshop API are verified from the QuickServe server runtime.", details: { hello, expiresIn: token.expires_in ?? null } });
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
