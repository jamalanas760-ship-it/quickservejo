import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { quickServeSupabase } from "@/integrations/supabase/public-config";

const permissionKeys = [
  "manage_restaurant","manage_menu","manage_tables","manage_staff","manage_appearance","view_analytics",
  "view_orders","view_order_prices","update_order_status","manage_payments","handle_waiter_calls",
] as const;

const inviteSchema = z.object({
  restaurantId: z.string().uuid(),
  email: z.string().trim().email(),
  name: z.string().trim().min(1).max(120),
  role: z.enum(["restaurant_admin", "manager", "kitchen", "waiter", "cashier"]),
});

const staffRefSchema = z.object({ staffId: z.string().uuid() });
const restaurantRefSchema = z.object({ restaurantId: z.string().uuid() });
const updateSchema = z.object({
  staffId: z.string().uuid(),
  name: z.string().trim().min(1).max(120).optional(),
  email: z.string().trim().email().optional(),
  password: z.string().min(8).max(72).optional(),
  role: z.enum(["restaurant_admin", "manager", "kitchen", "waiter", "cashier"]).optional(),
  isActive: z.boolean().optional(),
  permissionOverrides: z.record(z.enum(permissionKeys), z.boolean()).optional(),
});

type EdgeError = { error?: string };

async function callStaffAdmin<T>(accessToken: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${quickServeSupabase.url}/functions/v1/staff-admin`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: quickServeSupabase.publishableKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  let payload: unknown;
  try { payload = await response.json(); } catch { payload = null; }
  if (!response.ok) {
    const message = payload && typeof payload === "object" && "error" in payload
      ? String((payload as EdgeError).error ?? "Staff administration request failed")
      : "Staff administration request failed";
    throw new Error(message);
  }
  return payload as T;
}

export const inviteStaffMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => inviteSchema.parse(input))
  .handler(async ({ data, context }) => callStaffAdmin<{ staffId: string; email: string; password: string | null }>(context.accessToken, { action: "invite", ...data }));

export const checkStaffManagementAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => restaurantRefSchema.parse(input))
  .handler(async ({ data, context }) => callStaffAdmin<{ ready: true }>(context.accessToken, { action: "check", restaurantId: data.restaurantId }));

export const removeStaffMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => staffRefSchema.parse(input))
  .handler(async ({ data, context }) => callStaffAdmin<{ removed: true }>(context.accessToken, { action: "remove", staffId: data.staffId }));

/** Updates profile/role/status/permission overrides and mirrors optional password changes to Supabase Auth. */
export const updateStaffMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => updateSchema.parse(input))
  .handler(async ({ data, context }) => callStaffAdmin<{ ok: true }>(context.accessToken, { action: "update", ...data }));

export const listStaffLogins = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => restaurantRefSchema.parse(input))
  .handler(async ({ data, context }) => {
    const owner = await context.supabase.rpc("is_platform_owner");
    if (owner.error) throw owner.error;
    if (!owner.data) throw new Error("Only the Super Admin can view the staff login directory");

    const staff = await context.supabase
      .from("staff")
      .select("id, name, email, role, is_active, created_at")
      .eq("restaurant_id", data.restaurantId)
      .order("created_at", { ascending: false });
    if (staff.error) throw staff.error;

    return (staff.data ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      role: row.role,
      isActive: row.is_active,
      password: null,
    }));
  });