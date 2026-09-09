import { supabase } from "@/integrations/supabase/client";

/**
 * Sends each role to the workspace it can actually use. The dashboard is the
 * fallback whenever the user has several memberships or none yet.
 */
export async function roleDestination(fallback = "/dashboard", authenticatedUserId?: string): Promise<string> {
  if (fallback !== "/dashboard") return fallback;

  try {
    // Authentication callers already have a verified session user. Reusing its
    // id avoids a second Auth network request immediately after sign-in.
    const uid = authenticatedUserId ?? (await supabase.auth.getSession()).data.session?.user.id;
    if (!uid) return fallback;

    const { data, error } = await supabase
      .from("staff")
      .select("role, restaurant_id")
      .eq("auth_user_id", uid)
      .eq("is_active", true);

    if (error) {
      console.warn("Staff role lookup failed after authentication; using the safe destination.", error);
      return fallback;
    }

    const rows = data ?? [];
    if (rows.some((r) => r.role === "super_admin")) return "/super-admin";
    if (rows.length === 1) {
      const row = rows[0]!;
      if ((row.role === "restaurant_admin" || row.role === "manager") && row.restaurant_id) {
        return `/manage/${row.restaurant_id}`;
      }
      if (row.role === "kitchen" || row.role === "waiter" || row.role === "cashier") return "/kitchen";
    }
  } catch (error) {
    console.warn("Unable to resolve the post-sign-in role; using the safe destination.", error);
  }

  return fallback;
}
