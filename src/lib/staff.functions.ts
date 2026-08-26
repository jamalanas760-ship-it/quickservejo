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
