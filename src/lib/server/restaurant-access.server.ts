import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../integrations/supabase/types";
import type { AppRole } from "../permissions";

type AuthenticatedContext = {
  supabase: SupabaseClient<Database>;
  userId: string;
};

export const RESTAURANT_ADMIN_ROLES = ["restaurant_admin"] as const;
export const MENU_EDITOR_ROLES = ["restaurant_admin", "manager"] as const;

/**
 * Call only after requireSupabaseAuth. Uses the caller's RLS-bound client, never
 * a service role. Membership is checked on every request, not cached in a JWT
 * or inferred from a browser-selected restaurant or user-editable metadata.
 * Each endpoint must explicitly supply its allowed roles.
 */
export async function requireRestaurantAccess(
  context: AuthenticatedContext,
  restaurantId: string,
  allowedRoles: readonly AppRole[],
): Promise<{ restaurantId: string; userId: string; isPlatformOwner: boolean }> {
  if (!context.userId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(restaurantId)) {
    throw new Error("Forbidden");
  }

  const owner = await context.supabase.rpc("is_platform_owner");
  if (owner.error) throw owner.error;
  if (owner.data === true) {
    return { restaurantId, userId: context.userId, isPlatformOwner: true };
  }

  const { data, error } = await context.supabase
    .from("staff")
    .select("role")
    .eq("restaurant_id", restaurantId)
    .eq("auth_user_id", context.userId)
    .eq("is_active", true);
  if (error) throw error;
  if (!(data ?? []).some((row) => allowedRoles.includes(row.role))) {
    throw new Error("Forbidden");
  }

  return { restaurantId, userId: context.userId, isPlatformOwner: false };
}
