import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const inviteSchema = z.object({
  restaurantId: z.string().uuid(),
  email: z.string().email(),
  name: z.string().min(1).max(120),
  role: z.enum(["restaurant_admin", "manager", "kitchen", "waiter", "cashier"]),
});

const staffRefSchema = z.object({ staffId: z.string().uuid() });

/** Readable but strong temporary password shared with the staff member. */
function generatePassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = new Uint8Array(14);
  crypto.getRandomValues(bytes);
  const body = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
  return `Qs-${body}!7`;
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
 * Creates (or links) an auth user and attaches a staff row for one restaurant.
 * Returns the sign-in credentials so the manager can hand them over directly.
 */
export const inviteStaffMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => inviteSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertCanManage(supabase as never, userId, data.restaurantId);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const email = data.email.trim().toLowerCase();
    const password = generatePassword();

    // Reuse an existing auth account when the person already signed up.
    const existing = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (existing.error) throw existing.error;
    let authUserId = existing.data.users.find((u) => u.email?.toLowerCase() === email)?.id;
    let passwordIsNew = true;

    if (authUserId) {
      // Existing account keeps its own password; set the fresh one so the
      // manager can always hand over working credentials.
      const updated = await supabaseAdmin.auth.admin.updateUserById(authUserId, {
        password,
        email_confirm: true,
      });
      if (updated.error) passwordIsNew = false;
    } else {
      const created = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: data.name },
      });
      if (created.error) throw created.error;
      authUserId = created.data.user?.id;
    }
    if (!authUserId) throw new Error("Could not create the staff account");

    const inserted = await supabaseAdmin
      .from("staff")
      .insert({
        restaurant_id: data.restaurantId,
        auth_user_id: authUserId,
        name: data.name.trim(),
        email,
        role: data.role,
        is_active: true,
      })
      .select("id")
      .single();
    if (inserted.error) throw inserted.error;

    if (passwordIsNew) {
      await supabaseAdmin.from("staff_login_secrets").upsert(
        {
          staff_id: inserted.data.id,
          restaurant_id: data.restaurantId,
          email,
          password,
        },
        { onConflict: "staff_id" },
      );
    }

    return {
      staffId: inserted.data.id,
      email,
      password: passwordIsNew ? password : null,
    };
  });

/** Issues a fresh password for an existing staff member. */
export const resetStaffPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => staffRefSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("staff")
      .select("id, restaurant_id, email, auth_user_id")
      .eq("id", data.staffId)
      .single();
    if (error) throw error;
    if (!row.restaurant_id) throw new Error("Forbidden");
    await assertCanManage(supabase as never, userId, row.restaurant_id);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const password = generatePassword();
    const updated = await supabaseAdmin.auth.admin.updateUserById(row.auth_user_id, {
      password,
      email_confirm: true,
    });
    if (updated.error) throw updated.error;

    await supabaseAdmin.from("staff_login_secrets").upsert(
      {
        staff_id: row.id,
        restaurant_id: row.restaurant_id,
        email: row.email ?? updated.data.user?.email ?? null,
        password,
      },
      { onConflict: "staff_id" },
    );

    return { email: row.email ?? updated.data.user?.email ?? "", password };
  });

/**
 * Removes a staff member from a restaurant. The auth account itself is deleted
 * only when the person no longer belongs to any restaurant.
 */
export const removeStaffMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => staffRefSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("staff")
      .select("id, restaurant_id, auth_user_id, role")
      .eq("id", data.staffId)
      .single();
    if (error) throw error;
    if (!row.restaurant_id || row.role === "super_admin") throw new Error("Forbidden");
    await assertCanManage(supabase as never, userId, row.restaurant_id);
    if (row.auth_user_id === userId) throw new Error("You cannot remove your own access");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const deleted = await supabaseAdmin.from("staff").delete().eq("id", row.id);
    if (deleted.error) throw deleted.error;

    const remaining = await supabaseAdmin
      .from("staff")
      .select("id")
      .eq("auth_user_id", row.auth_user_id)
      .limit(1);
    if (!remaining.error && (remaining.data ?? []).length === 0) {
      await supabaseAdmin.auth.admin.deleteUser(row.auth_user_id);
    }

    return { removed: true };
  });

/**
 * Admin-only directory of staff logins for one restaurant, including the last
 * password issued through QuickServe. Guarded by the same manage check as the
 * rest of staff administration; the underlying table is unreachable from the
 * client because it has no Data API grants.
 */
export const listStaffLogins = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertCanManage(supabase as never, userId, data.restaurantId);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [staff, secrets] = await Promise.all([
      supabaseAdmin
        .from("staff")
        .select("id, name, email, role, is_active, created_at")
        .eq("restaurant_id", data.restaurantId)
        .order("created_at", { ascending: false }),
      supabaseAdmin
        .from("staff_login_secrets")
        .select("staff_id, password")
        .eq("restaurant_id", data.restaurantId),
    ]);
    if (staff.error) throw staff.error;
    if (secrets.error) throw secrets.error;

    const byStaff = new Map((secrets.data ?? []).map((r) => [r.staff_id, r.password]));
    return (staff.data ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      role: row.role,
      isActive: row.is_active,
      password: byStaff.get(row.id) ?? null,
    }));
  });

const updateSchema = z.object({
  staffId: z.string().uuid(),
  name: z.string().trim().min(1).max(120).optional(),
  email: z.string().trim().email().optional(),
  password: z.string().min(8).max(72).optional(),
  role: z.enum(["restaurant_admin", "manager", "kitchen", "waiter", "cashier"]).optional(),
  isActive: z.boolean().optional(),
});

/**
 * Single admin entry point for editing a staff member: name, email, password,
 * role (member/admin) and active state. Email/password changes are mirrored
 * into the auth account so the person can sign in with the new details.
 */
export const updateStaffMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => updateSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("staff")
      .select("id, restaurant_id, auth_user_id, email, name, role")
      .eq("id", data.staffId)
      .single();
    if (error) throw error;
    if (!row.restaurant_id || row.role === "super_admin") throw new Error("Forbidden");
    await assertCanManage(supabase as never, userId, row.restaurant_id);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const email = data.email ? data.email.toLowerCase() : undefined;

    if (email || data.password) {
      const authUpdate: { email?: string; password?: string; email_confirm?: boolean } = {
        email_confirm: true,
      };
      if (email) authUpdate.email = email;
      if (data.password) authUpdate.password = data.password;
      const updated = await supabaseAdmin.auth.admin.updateUserById(row.auth_user_id, authUpdate);
      if (updated.error) throw updated.error;
    }

    const staffUpdate: Record<string, unknown> = {};
    if (data.name) staffUpdate['name'] = data.name;
    if (email) staffUpdate['email'] = email;
    if (data.role) staffUpdate['role'] = data.role;
    if (typeof data.isActive === "boolean") staffUpdate['is_active'] = data.isActive;
    if (Object.keys(staffUpdate).length > 0) {
      const saved = await supabaseAdmin.from("staff").update(staffUpdate).eq("id", row.id);
      if (saved.error) throw saved.error;
    }

    if (email || data.password) {
      await supabaseAdmin.from("staff_login_secrets").upsert(
        {
          staff_id: row.id,
          restaurant_id: row.restaurant_id,
          email: email ?? row.email ?? null,
          ...(data.password ? { password: data.password } : {}),
        },
        { onConflict: "staff_id" },
      );
    }

    return { ok: true, email: email ?? row.email ?? null };
  });
