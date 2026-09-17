import { supabase } from "@/integrations/supabase/client";
import { ROLE_HOME, type AppRole } from "@/lib/permissions";

/**
 * Sends a single restaurant membership to the workspace designed for that job
 * profile. Users with multiple memberships still land on the neutral dashboard
 * so they can choose the intended restaurant context safely.
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
    if (rows.some((row) => row.role === "super_admin")) return ROLE_HOME.super_admin;

    if (rows.length === 1) {
      const row = rows[0]!;
      const role = row.role as AppRole;
      return ROLE_HOME[role] ?? fallback;
    }
  } catch (error) {
    console.warn("Unable to resolve the post-sign-in role; using the safe destination.", error);
  }

  return fallback;
}
