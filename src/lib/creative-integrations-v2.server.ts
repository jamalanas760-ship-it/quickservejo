import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type CreativeProvider = "figma" | "canva" | "adobe";
const provider = z.enum(["figma", "canva", "adobe"]);
function required(name: string) { const value = process.env[name]; if (!value) throw new Error(`${name} is not configured.`); return value; }
function appUrl() { return (process.env["PUBLIC_APP_URL"] ?? "http://127.0.0.1:3000").replace(/\/$/, ""); }
function callback(provider: CreativeProvider) { return `${appUrl()}/integrations/${provider}/callback`; }
function state() { const bytes = new Uint8Array(32); crypto.getRandomValues(bytes); return Buffer.from(bytes).toString("base64url"); }

export const startCreativeOAuth = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((input: unknown) => z.object({ provider, codeChallenge: z.string().min(43).max(128).optional() }).parse(input)).handler(async ({ data }) => {
  if (data.provider === "adobe") return { mode: "embed" as const, provider: data.provider, clientId: required("ADOBE_EXPRESS_CLIENT_ID"), appName: required("ADOBE_EXPRESS_APP_NAME") };
  if (!data.codeChallenge) throw new Error(`${data.provider} requires PKCE.`);
  const clientId = required(`${data.provider.toUpperCase()}_CLIENT_ID`);
  const oauthState = state();
  const scope = data.provider === "canva" ? "design:content:read design:content:write design:meta:read asset:read asset:write brandtemplate:meta:read brandtemplate:content:read" : "file_content:read file_metadata:read";
  const params = new URLSearchParams({ client_id: clientId, redirect_uri: callback(data.provider), response_type: "code", scope, state: oauthState, code_challenge: data.codeChallenge, code_challenge_method: "S256" });
  const authorizationUrl = data.provider === "canva" ? `https://www.canva.com/api/oauth/authorize?${params}` : `https://www.figma.com/oauth?${params}`;
  return { mode: "oauth" as const, provider: data.provider, state: oauthState, redirectUri: callback(data.provider), authorizationUrl };
});

async function exchange(provider: "figma" | "canva", code: string, verifier: string) {
  const clientId = required(`${provider.toUpperCase()}_CLIENT_ID`); const clientSecret = required(`${provider.toUpperCase()}_CLIENT_SECRET`);
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const body = new URLSearchParams({ grant_type: "authorization_code", code, code_verifier: verifier, redirect_uri: callback(provider) });
  const endpoint = provider === "canva" ? "https://api.canva.com/rest/v1/oauth/token" : "https://api.figma.com/v1/oauth/token";
  const response = await fetch(endpoint, { method: "POST", headers: { Authorization: `Basic ${credentials}`, "Content-Type": "application/x-www-form-urlencoded" }, body });
  if (!response.ok) throw new Error(`${provider} OAuth exchange failed (${response.status}).`); return response.json() as Promise<{ access_token:string; refresh_token?:string; expires_in?:number; user_id_string?:string }>;
}

export const finishCreativeOAuth = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((input: unknown) => z.object({ provider: z.enum(["figma", "canva"]), code: z.string().min(1), codeVerifier: z.string().min(43).max(128), state: z.string().min(16), expectedState: z.string().min(16) }).parse(input)).handler(async ({ data }) => {
  if (data.state !== data.expectedState) throw new Error("OAuth state mismatch. Authorization was rejected.");
  const token = await exchange(data.provider, data.code, data.codeVerifier);
  return { provider: data.provider, connected: true, accessToken: token.access_token, refreshToken: token.refresh_token ?? null, expiresIn: token.expires_in ?? null, providerUserId: token.user_id_string ?? null };
});

export const canvaAutofill = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((input: unknown) => z.object({ accessToken:z.string().min(1),brandTemplateId:z.string().min(1),data:z.record(z.string(),z.unknown()) }).parse(input)).handler(async ({data})=>{
  const response=await fetch("https://api.canva.com/rest/v1/autofills",{method:"POST",headers:{Authorization:`Bearer ${data.accessToken}`,"Content-Type":"application/json"},body:JSON.stringify({type:"create_from_brand_template",brand_template_id:data.brandTemplateId,data:data.data})});
  if(!response.ok) throw new Error(`Canva autofill failed (${response.status}).`); return response.json();
});

export const figmaFile = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((input: unknown) => z.object({accessToken:z.string().min(1),fileKey:z.string().min(22)}).parse(input)).handler(async ({data})=>{
  const response=await fetch(`https://api.figma.com/v1/files/${encodeURIComponent(data.fileKey)}`,{headers:{Authorization:`Bearer ${data.accessToken}`}});
  if(!response.ok) throw new Error(`Figma file read failed (${response.status}).`); return response.json();
});
