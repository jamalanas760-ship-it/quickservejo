import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const scopes = ["menu:read","orders:read","orders:write","inventory:read"] as const;
const events = ["order.created","order.status_changed","payment.updated","menu.updated","inventory.low_stock"] as const;

const restaurantSchema = z.object({ restaurantId: z.string().uuid() });
const createKeySchema = restaurantSchema.extend({
  name: z.string().trim().min(1).max(120),
  scopes: z.array(z.enum(scopes)).min(1).max(scopes.length),
});
const keyRefSchema = restaurantSchema.extend({ keyId: z.string().uuid() });
const webhookCreateSchema = restaurantSchema.extend({
  name: z.string().trim().min(1).max(120),
  endpointUrl: z.string().url().refine((value) => value.startsWith("https://"), "Webhook URL must use HTTPS"),
  events: z.array(z.enum(events)).min(1).max(events.length),
});
const webhookRefSchema = restaurantSchema.extend({ webhookId: z.string().uuid() });

async function authorize(context: { supabase: any; userId: string }, restaurantId: string) {
  const owner = await context.supabase.rpc("is_platform_owner");
  if (owner.error) throw owner.error;
  if (owner.data) return;
  const { data, error } = await context.supabase
    .from("staff")
    .select("role")
    .eq("restaurant_id", restaurantId)
    .eq("auth_user_id", context.userId)
    .eq("is_active", true)
    .maybeSingle();
  if (error) throw error;
  if (!data || data.role !== "restaurant_admin") throw new Error("Forbidden");
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return bytesToHex(new Uint8Array(digest));
}

function randomSecret(prefix: string) {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return `${prefix}_${bytesToBase64(bytes).replaceAll("+","-").replaceAll("/","_").replaceAll("=","")}`;
}

async function encryptionKey() {
  const raw = process.env["QUICKSERVE_WEBHOOK_ENCRYPTION_KEY"]?.trim();
  if (!raw) throw new Error("QUICKSERVE_WEBHOOK_ENCRYPTION_KEY is not configured on the server.");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt","decrypt"]);
}

async function encryptSecret(value: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await encryptionKey();
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(value));
  return `v1:${bytesToBase64(iv)}:${bytesToBase64(new Uint8Array(encrypted))}`;
}

export const listDeveloperCredentials = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => restaurantSchema.parse(input))
  .handler(async ({ data, context }) => {
    await authorize(context, data.restaurantId);
    const [keysRes, hooksRes, deliveriesRes] = await Promise.all([
      supabaseAdmin.from("api_keys" as any).select("id,name,key_prefix,scopes,is_active,expires_at,last_used_at,created_at,revoked_at").eq("restaurant_id", data.restaurantId).order("created_at", { ascending: false }),
      supabaseAdmin.from("webhook_subscriptions" as any).select("id,name,endpoint_url,events,is_active,failure_count,last_success_at,last_failure_at,created_at").eq("restaurant_id", data.restaurantId).order("created_at", { ascending: false }),
      supabaseAdmin.from("webhook_deliveries" as any).select("id,subscription_id,event_type,status,attempt_count,response_status,created_at,delivered_at").eq("restaurant_id", data.restaurantId).order("created_at", { ascending: false }).limit(100),
    ]);
    if (keysRes.error) throw keysRes.error;
    if (hooksRes.error) throw hooksRes.error;
    if (deliveriesRes.error) throw deliveriesRes.error;
    return { keys: keysRes.data ?? [], webhooks: hooksRes.data ?? [], deliveries: deliveriesRes.data ?? [] };
  });

export const createApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => createKeySchema.parse(input))
  .handler(async ({ data, context }) => {
    await authorize(context, data.restaurantId);
    const plaintext = randomSecret("qs_live");
    const hash = await sha256(plaintext);
    const prefix = plaintext.slice(0, 16);
    const { data: created, error } = await supabaseAdmin.from("api_keys" as any).insert({
      restaurant_id: data.restaurantId,
      name: data.name,
      key_prefix: prefix,
      key_hash: hash,
      scopes: data.scopes,
      created_by: context.userId,
    }).select("id,name,key_prefix,scopes,created_at").single();
    if (error) throw error;
    return { key: plaintext, record: created };
  });

export const revokeApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => keyRefSchema.parse(input))
  .handler(async ({ data, context }) => {
    await authorize(context, data.restaurantId);
    const { error } = await supabaseAdmin.from("api_keys" as any).update({ is_active: false, revoked_at: new Date().toISOString() }).eq("id", data.keyId).eq("restaurant_id", data.restaurantId);
    if (error) throw error;
    return { revoked: true };
  });

export const createWebhookSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => webhookCreateSchema.parse(input))
  .handler(async ({ data, context }) => {
    await authorize(context, data.restaurantId);
    const secret = randomSecret("whsec");
    const secretCiphertext = await encryptSecret(secret);
    const { data: created, error } = await supabaseAdmin.from("webhook_subscriptions" as any).insert({
      restaurant_id: data.restaurantId,
      name: data.name,
      endpoint_url: data.endpointUrl,
      events: data.events,
      secret_ciphertext: secretCiphertext,
      created_by: context.userId,
    }).select("id,name,endpoint_url,events,created_at").single();
    if (error) throw error;
    return { secret, record: created };
  });

export const toggleWebhookSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => webhookRefSchema.extend({ isActive: z.boolean() }).parse(input))
  .handler(async ({ data, context }) => {
    await authorize(context, data.restaurantId);
    const { error } = await supabaseAdmin.from("webhook_subscriptions" as any).update({ is_active: data.isActive }).eq("id", data.webhookId).eq("restaurant_id", data.restaurantId);
    if (error) throw error;
    return { updated: true };
  });
