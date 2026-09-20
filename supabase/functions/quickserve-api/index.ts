import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-quickserve-key, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

function serviceKey() {
  const direct = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (direct) return direct;
  const secretKeys = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (secretKeys) {
    try {
      const parsed = JSON.parse(secretKeys);
      if (parsed.default) return parsed.default;
    } catch {}
  }
  throw new Error("Supabase server secret is not configured");
}

function apiKey(req: Request) {
  const direct = req.headers.get("x-quickserve-key")?.trim();
  if (direct) return direct;
  const auth = req.headers.get("authorization")?.trim() ?? "";
  return auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
}

function hasScope(scopes: string[], required: string) {
  return scopes.includes("*") || scopes.includes(required);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const key = apiKey(req);
    if (!key.startsWith("qs_live_")) return json({ error: "Missing or invalid QuickServe API key" }, 401);

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authData, error: authError } = await supabase.rpc("authenticate_integration_api_key", { _api_key: key });
    if (authError) throw authError;
    if (!authData?.restaurant_id) return json({ error: "API key is invalid, expired, or revoked" }, 401);

    const restaurantId = String(authData.restaurant_id);
    const scopes = Array.isArray(authData.scopes) ? authData.scopes.map(String) : [];
    const url = new URL(req.url);
    const marker = "/quickserve-api";
    const relative = url.pathname.includes(marker) ? url.pathname.split(marker)[1] || "/" : url.pathname;
    const parts = relative.split("/").filter(Boolean);

    if (req.method === "GET" && (parts.length === 0 || parts[0] === "health")) {
      return json({ ok: true, api: "QuickServe Connect", version: "1", key_name: authData.name, restaurant_id: restaurantId });
    }

    if (req.method === "GET" && parts[0] === "restaurant") {
      if (!hasScope(scopes, "restaurant:read")) return json({ error: "Missing scope: restaurant:read" }, 403);
      const { data, error } = await supabase.from("restaurants")
        .select("id,name,slug,currency,timezone,is_active,subscription_plan,subscription_status")
        .eq("id", restaurantId).single();
      if (error) throw error;
      return json({ data });
    }

    if (req.method === "GET" && parts[0] === "orders") {
      if (!hasScope(scopes, "orders:read")) return json({ error: "Missing scope: orders:read" }, 403);
      const limit = Math.max(1, Math.min(Number(url.searchParams.get("limit") ?? 50) || 50, 200));
      const since = url.searchParams.get("since");
      let query = supabase.from("orders")
        .select("id,order_number,status,payment_status,subtotal,tax_amount,service_amount,discount_amount,delivery_amount,tip_amount,total,currency,fulfillment_type,scheduled_for,created_at,updated_at")
        .eq("restaurant_id", restaurantId)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (since) query = query.gte("created_at", since);
      const { data, error } = await query;
      if (error) throw error;
      return json({ data, meta: { limit, count: data?.length ?? 0 } });
    }

    if (req.method === "GET" && parts[0] === "menu-items") {
      if (!hasScope(scopes, "menu:read")) return json({ error: "Missing scope: menu:read" }, 403);
      const { data, error } = await supabase.from("menu_items")
        .select("id,category_id,name_ar,name_en,description_ar,description_en,price,is_available,is_featured,preparation_time,kitchen_station_id,updated_at")
        .eq("restaurant_id", restaurantId)
        .order("display_order")
        .limit(2000);
      if (error) throw error;
      return json({ data });
    }

    if (req.method === "POST" && parts[0] === "menu-items" && parts[1] && parts[2] === "availability") {
      if (!hasScope(scopes, "menu:write")) return json({ error: "Missing scope: menu:write" }, 403);
      const body = await req.json().catch(() => ({}));
      if (typeof body.available !== "boolean") return json({ error: "Body must contain boolean available" }, 400);
      const { data, error } = await supabase.from("menu_items")
        .update({ is_available: body.available })
        .eq("restaurant_id", restaurantId)
        .eq("id", parts[1])
        .select("id,is_available,updated_at")
        .maybeSingle();
      if (error) throw error;
      if (!data) return json({ error: "Menu item not found" }, 404);
      await supabase.from("audit_logs").insert({
        restaurant_id: restaurantId,
        actor_name: "QuickServe API",
        action: "api_menu_availability_updated",
        entity: "menu_item",
        entity_id: parts[1],
        metadata: { key_id: authData.id, available: body.available },
      });
      return json({ data });
    }

    if (req.method === "POST" && parts[0] === "orders" && parts[1] && parts[2] === "status") {
      if (!hasScope(scopes, "orders:write")) return json({ error: "Missing scope: orders:write" }, 403);
      const body = await req.json().catch(() => ({}));
      const next = String(body.status ?? "");
      const { data: current, error: readError } = await supabase.from("orders")
        .select("id,status,restaurant_id")
        .eq("restaurant_id", restaurantId)
        .eq("id", parts[1]).maybeSingle();
      if (readError) throw readError;
      if (!current) return json({ error: "Order not found" }, 404);
      const allowed: Record<string, string[]> = {
        new: ["accepted", "cancelled"],
        accepted: ["preparing", "cancelled"],
        preparing: ["ready", "cancelled"],
        ready: ["served", "cancelled"],
        served: ["paid"],
      };
      if (!(allowed[current.status] ?? []).includes(next)) {
        return json({ error: `Invalid status transition: ${current.status} -> ${next}` }, 409);
      }
      const patch: Record<string, unknown> = { status: next, updated_at: new Date().toISOString() };
      if (next === "cancelled") {
        patch.cancelled_at = new Date().toISOString();
        patch.cancellation_reason = "external_api";
        patch.cancellation_note = String(body.reason ?? "External API").slice(0, 500);
      }
      const { data, error } = await supabase.from("orders").update(patch)
        .eq("restaurant_id", restaurantId).eq("id", parts[1])
        .select("id,order_number,status,updated_at").single();
      if (error) throw error;
      await supabase.from("audit_logs").insert({
        restaurant_id: restaurantId,
        actor_name: "QuickServe API",
        action: "api_order_status_updated",
        entity: "order",
        entity_id: parts[1],
        metadata: { key_id: authData.id, from: current.status, to: next },
      });
      return json({ data });
    }

    return json({ error: "Endpoint not found" }, 404);
  } catch (error) {
    console.error(error);
    return json({ error: "QuickServe API request failed" }, 500);
  }
});