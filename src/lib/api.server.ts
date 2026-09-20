import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type ApiPrincipal = {
  keyId: string;
  restaurantId: string;
  scopes: string[];
};

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return bytesToHex(new Uint8Array(digest));
}

export function json(data: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  return new Response(JSON.stringify(data), { ...init, headers });
}

export async function authenticateApiRequest(request: Request, requiredScope: string): Promise<ApiPrincipal | Response> {
  const auth = request.headers.get("authorization")?.trim() ?? "";
  const raw = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!raw.startsWith("qs_live_")) return json({ error: "unauthorized" }, { status: 401 });

  const hash = await sha256(raw);
  const { data, error } = await supabaseAdmin
    .from("api_keys" as any)
    .select("id,restaurant_id,scopes,is_active,expires_at")
    .eq("key_hash", hash)
    .maybeSingle();

  if (error || !data || !data.is_active) return json({ error: "unauthorized" }, { status: 401 });
  if (data.expires_at && new Date(data.expires_at).getTime() <= Date.now()) return json({ error: "api_key_expired" }, { status: 401 });
  const keyScopes = Array.isArray(data.scopes) ? data.scopes.map(String) : [];
  if (!keyScopes.includes(requiredScope)) return json({ error: "insufficient_scope", required_scope: requiredScope }, { status: 403 });

  void supabaseAdmin.from("api_keys" as any).update({ last_used_at: new Date().toISOString() }).eq("id", data.id);
  return { keyId: data.id, restaurantId: data.restaurant_id, scopes: keyScopes };
}

export function isResponse(value: ApiPrincipal | Response): value is Response {
  return value instanceof Response;
}

export function parseLimit(request: Request, fallback = 100, max = 500) {
  const url = new URL(request.url);
  const value = Number(url.searchParams.get("limit") ?? fallback);
  return Number.isFinite(value) ? Math.max(1, Math.min(max, Math.floor(value))) : fallback;
}
