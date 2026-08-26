import { supabase } from "@/integrations/supabase/client";

/**
 * Sends each role to the workspace it can actually use. The dashboard is the
 * fallback whenever the user has several memberships or none yet.
 */
export async function roleDestination(fallback = "/dashboard"): Promise<string> {
  if (fallback !== "/dashboard") return fallback;
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData.user?.id;
  if (!uid) return fallback;
  const { data } = await supabase
    .from("staff")
    .select("role, restaurant_id")
    .eq("auth_user_id", uid)
    .eq("is_active", true);
  const rows = data ?? [];
  if (rows.some((r) => r.role === "super_admin")) return "/super-admin";
  if (rows.length === 1) {
    const row = rows[0]!;
    if ((row.role === "restaurant_admin" || row.role === "manager") && row.restaurant_id) {
      return `/manage/${row.restaurant_id}`;
    }
    if (row.role === "kitchen" || row.role === "waiter") return "/kitchen";
    if (row.role === "cashier") return "/kitchen";
  }
  return fallback;
}
