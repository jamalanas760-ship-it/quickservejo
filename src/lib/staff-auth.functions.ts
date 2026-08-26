import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const staffRef = z.object({ staffId: z.string().uuid() });
const pinSignIn = z.object({
  restaurantCode: z.string().trim().min(4).max(12),
  pin: z.string().trim().regex(/^\d{6}$/),
});
const badgeSignIn = z.object({ code: z.string().trim().min(16).max(64) });

/** PIN digests are salted with the staff id, so equal PINs never share a hash. */
async function hashPin(staffId: string, pin: string): Promise<string> {
  const bytes = new TextEncoder().encode(`quickserve:${staffId}:${pin}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

function randomDigits(length: number): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => String(b % 10)).join("");
}

function randomToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Throws unless the caller may manage staff for the given restaurant. */
async function assertCanManage(
  supabase: { rpc: (fn: "is_platform_owner") => Promise<{ data: unknown; error: unknown }>; from: Function },
  userId: string,
  restaurantId: string,
) {
  const owner = await supabase.rpc("is_platform_owner");
  if (owner.error) throw owner.error;
  if (owner.data) return;
  const { data: rows, error } = await supabase
    .from("staff")
    .select("role")
    .eq("restaurant_id", restaurantId)
    .eq("auth_user_id", userId)
    .eq("is_active", true);
  if (error) throw error;
  const allowed = ((rows ?? []) as { role: string }[]).some(
    (r) => r.role === "restaurant_admin" || r.role === "manager",
  );
  if (!allowed) throw new Error("Forbidden");
}

/**
 * Issues (or re-issues) the easy sign-in credentials for one staff member:
 * a 6-digit PIN used with the restaurant code, plus a personal badge token
 * that can be printed as a QR code.
 */
export const issueStaffAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => staffRef.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("staff")
      .select("id, restaurant_id, name")
      .eq("id", data.staffId)
      .single();
    if (error) throw error;
    if (!row.restaurant_id) throw new Error("Forbidden");
    await assertCanManage(supabase as never, userId, row.restaurant_id);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const restaurant = await supabaseAdmin
      .from("restaurants")
      .select("staff_code")
      .eq("id", row.restaurant_id)
      .single();
    if (restaurant.error) throw restaurant.error;

    const pin = randomDigits(6);
    const loginCode = randomToken();
    const upserted = await supabaseAdmin.from("staff_credentials").upsert(
      {
        staff_id: row.id,
        restaurant_id: row.restaurant_id,
        pin_hash: await hashPin(row.id, pin),
        login_code: loginCode,
      },
      { onConflict: "staff_id" },
    );
    if (upserted.error) throw upserted.error;

    return {
      name: row.name,
      restaurantCode: restaurant.data.staff_code ?? "",
      pin,
      badgeCode: loginCode,
    };
  });

/** Current badge token (for reprinting) and whether a PIN has been issued. */
export const getStaffAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => staffRef.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("staff")
      .select("id, restaurant_id, name")
      .eq("id", data.staffId)
      .single();
    if (error) throw error;
    if (!row.restaurant_id) throw new Error("Forbidden");
    await assertCanManage(supabase as never, userId, row.restaurant_id);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [creds, restaurant] = await Promise.all([
      supabaseAdmin
        .from("staff_credentials")
        .select("pin_hash, login_code")
        .eq("staff_id", row.id)
        .maybeSingle(),
      supabaseAdmin.from("restaurants").select("staff_code").eq("id", row.restaurant_id).single(),
    ]);
    if (creds.error) throw creds.error;

    return {
      name: row.name,
      restaurantCode: restaurant.data?.staff_code ?? "",
      hasPin: Boolean(creds.data?.pin_hash),
      badgeCode: creds.data?.login_code ?? null,
    };
  });

/** Builds a one-time magic token the browser exchanges for a real session. */
async function magicTokenFor(email: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const link = await supabaseAdmin.auth.admin.generateLink({ type: "magiclink", email });
  if (link.error) throw link.error;
  const hashed = link.data.properties?.hashed_token;
  if (!hashed) throw new Error("Sign-in could not be completed");
  return { email, tokenHash: hashed };
}

/** Restaurant code + personal PIN sign-in (shared tablets, no email typing). */
export const staffPinSignIn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => pinSignIn.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const code = data.restaurantCode.toUpperCase();

    const restaurant = await supabaseAdmin
      .from("restaurants")
      .select("id, is_active, archived_at")
      .eq("staff_code", code)
      .maybeSingle();
    if (restaurant.error) throw restaurant.error;
    if (!restaurant.data || !restaurant.data.is_active || restaurant.data.archived_at) {
      throw new Error("Wrong restaurant code or PIN");
    }

    const creds = await supabaseAdmin
      .from("staff_credentials")
      .select("staff_id, pin_hash")
      .eq("restaurant_id", restaurant.data.id)
      .not("pin_hash", "is", null);
    if (creds.error) throw creds.error;

    let staffId: string | null = null;
    for (const row of creds.data ?? []) {
      if (row.pin_hash === (await hashPin(row.staff_id, data.pin))) {
        staffId = row.staff_id;
        break;
      }
    }
    if (!staffId) throw new Error("Wrong restaurant code or PIN");

    const staff = await supabaseAdmin
      .from("staff")
      .select("email, is_active")
      .eq("id", staffId)
      .single();
    if (staff.error) throw staff.error;
    if (!staff.data.is_active || !staff.data.email) throw new Error("Wrong restaurant code or PIN");

    return magicTokenFor(staff.data.email);
  });

/** Badge QR sign-in: the token in the QR identifies the staff member. */
export const staffBadgeSignIn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => badgeSignIn.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const creds = await supabaseAdmin
      .from("staff_credentials")
      .select("staff_id")
      .eq("login_code", data.code)
      .maybeSingle();
    if (creds.error) throw creds.error;
    if (!creds.data) throw new Error("This badge is no longer valid");

    const staff = await supabaseAdmin
      .from("staff")
      .select("email, is_active")
      .eq("id", creds.data.staff_id)
      .single();
    if (staff.error) throw staff.error;
    if (!staff.data.is_active || !staff.data.email) throw new Error("This badge is no longer valid");

    return magicTokenFor(staff.data.email);
  });
