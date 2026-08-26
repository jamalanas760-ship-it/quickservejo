import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const inviteSchema = z.object({
  restaurantId: z.string().uuid(),
  email: z.string().email(),
  name: z.string().min(1).max(120),
  role: z.enum(["restaurant_admin", "manager", "kitchen", "waiter", "cashier"]),
});

/**
 * Creates (or links) an auth user and attaches a staff row for one restaurant.
 * The caller must be the platform owner or already able to manage the target
 * restaurant — verified through RLS-scoped queries before any admin call.
 */
export const inviteStaffMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => inviteSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const owner = await supabase.rpc("is_platform_owner");
    if (owner.error) throw owner.error;

    if (!owner.data) {
      // Non-owners must already hold a management role in that restaurant.
      const { data: rows, error } = await supabase
        .from("staff")
        .select("role")
        .eq("restaurant_id", data.restaurantId)
        .eq("auth_user_id", userId)
        .eq("is_active", true);
      if (error) throw error;
      const allowed = (rows ?? []).some((r) => r.role === "restaurant_admin" || r.role === "manager");
      if (!allowed) throw new Error("Forbidden");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const email = data.email.trim().toLowerCase();

    // Reuse an existing auth account when the person already signed up.
    const existing = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (existing.error) throw existing.error;
    let authUserId = existing.data.users.find((u) => u.email?.toLowerCase() === email)?.id;

    if (!authUserId) {
      const created = await supabaseAdmin.auth.admin.createUser({
        email,
        email_confirm: true,
        password: crypto.randomUUID() + crypto.randomUUID(),
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
      })
      .select("id")
      .single();
    if (inserted.error) throw inserted.error;

    // Password-setup link so the staff member chooses their own credentials.
    const recovery = await supabaseAdmin.auth.admin.generateLink({ type: "recovery", email });

    return {
      staffId: inserted.data.id,
      setupLink: recovery.error ? null : (recovery.data.properties?.action_link ?? null),
    };
  });
