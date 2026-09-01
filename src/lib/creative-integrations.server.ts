import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type CreativeProvider = "figma" | "canva" | "adobe";

const providerSchema = z.enum(["figma", "canva", "adobe"]);
const integrationInput = z.object({ provider: providerSchema });
const tokenInput = z.object({ provider: providerSchema, code: z.string().min(1), codeVerifier: z.string().min(43).max(128).optional(), state: z.string().min(16) });
const SCOPES = { figma: "file_content:read file_metadata:read", canva: "design:content:read design:content:write design:meta:read asset:read asset:write brandtemplate:meta:read brandtemplate:content:read", adobe: "openid" } as const;

function env(name: string): string { const value = process.env[name]; if (!value) throw new Error(`${name} is not configured.`); return value; }
function baseUrl() { return (process.env["PUBLIC_APP_URL"] ?? "http://127.0.0.1:3000").replace(/\/$/, ""); }
function redirectUri(provider: CreativeProvider) { return `${baseUrl()}/integrations/${provider}/callback`; }
function randomState() { const bytes = new Uint8Array(32); crypto.getRandomValues(bytes); return Buffer.from(bytes).toString("base64url"); }

function authUrl(provider: CreativeProvider, state: string, codeChallenge?: string) {
  const clientId = env(`${provider.toUpperCase()}_CLIENT_ID`);
  const params = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri(provider), response_type: "code", state, scope: SCOPES[provider] });
  if (provider === "canva" || provider === "figma") { if (!codeChallenge) throw new Error("PKCE challenge is required."); params.set("code_challenge", codeChallenge); params.set("code_challenge_method", "S256"); }
  const endpoint = provider === "canva" ? "https://www.canva.com/api/oauth/authorize" : provider === "figma" ? "https://www.figma.com/oauth" : "https://ims-na1.adobelogin.com/ims/authorize/v2";
  return `${endpoint}?${params.toString()}`;
}

export const beginCreativeIntegration = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((input: unknown) => integrationInput.parse(input)).handler(async ({ data }) => {
  const state = randomState();
  return { provider: data.provider, state, redirectUri: redirectUri(data.provider), authorizationUrl: authUrl(data.provider, state) };
});

async function exchangeCanva(code: string, verifier: string) {
  const credentials = Buffer.from(`${env("CANVA_CLIENT_ID")}:${env("CANVA_CLIENT_SECRET")}`).toString("base64");
  const body = new URLSearchParams({ grant_type: "authorization_code", code, code_verifier: verifier, redirect_uri: redirectUri("canva") });
  const response = await fetch("https://api.canva.com/rest/v1/oauth/token", { method: "POST", headers: { Authorization: `Basic ${credentials}`, "Content-Type": "application/x-www-form-urlencoded" }, body });
  if (!response.ok) throw new Error(`Canva OAuth failed (${response.status}).`); return response.json();
}
async function exchangeFigma(code: string, verifier?: string) {
  const credentials = Buffer.from(`${env("FIGMA_CLIENT_ID")}:${env("FIGMA_CLIENT_SECRET")}`).toString("base64");
  const body = new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri("figma") });
  if (verifier) body.set("code_verifier", verifier);
  const response = await fetch("https://api.figma.com/v1/oauth/token", { method: "POST", headers: { Authorization: `Basic ${credentials}`, "Content-Type": "application/x-www-form-urlencoded" }, body });
  if (!response.ok) throw new Error(`Figma OAuth failed (${response.status}).`); return response.json();
}
async function exchangeAdobe(code: string) {
  const body = new URLSearchParams({ grant_type: "authorization_code", client_id: env("ADOBE_CLIENT_ID"), client_secret: env("ADOBE_CLIENT_SECRET"), code, redirect_uri: redirectUri("adobe") });
  const response = await fetch("https://ims-na1.adobelogin.com/ims/token/v3", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
  if (!response.ok) throw new Error(`Adobe OAuth failed (${response.status}).`); return response.json();
}

export const exchangeCreativeIntegration = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((input: unknown) => tokenInput.parse(input)).handler(async ({ data }) => {
  if (data.provider === "canva" && !data.codeVerifier) throw new Error("Canva requires the PKCE verifier.");
  const token = data.provider === "canva" ? await exchangeCanva(data.code, data.codeVerifier!) : data.provider === "figma" ? await exchangeFigma(data.code, data.codeVerifier) : await exchangeAdobe(data.code);
  return { provider: data.provider, expiresIn: token.expires_in ?? null, connected: true };
});

export const canvaCreateAutofill = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((input: unknown) => z.object({ accessToken: z.string().min(1), templateId: z.string().min(1), data: z.record(z.string(), z.unknown()) }).parse(input)).handler(async ({ data }) => {
  const response = await fetch("https://api.canva.com/rest/v1/autofills", { method: "POST", headers: { Authorization: `Bearer ${data.accessToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ type: "create_from_brand_template", brand_template_id: data.templateId, data: data.data }) });
  if (!response.ok) throw new Error(`Canva autofill failed (${response.status}).`); return response.json();
});

export const figmaFileMetadata = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((input: unknown) => z.object({ accessToken: z.string().min(1), fileKey: z.string().min(22) }).parse(input)).handler(async ({ data }) => {
  const response = await fetch(`https://api.figma.com/v1/files/${encodeURIComponent(data.fileKey)}/meta`, { headers: { Authorization: `Bearer ${data.accessToken}` } });
  if (!response.ok) throw new Error(`Figma file lookup failed (${response.status}).`); return response.json();
});

export const adobeExpressConfig = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async () => ({ clientId: env("ADOBE_CLIENT_ID"), appName: env("ADOBE_EXPRESS_APP_NAME") }));
