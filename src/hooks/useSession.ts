import { useQuery } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { AppRole, Capability } from "@/lib/permissions";
import { anyRoleHasCapability } from "@/lib/permissions";

export type StaffMembership = {
  id: string;
  restaurant_id: string | null;
  role: AppRole;
  name: string;
  is_active: boolean;
  restaurant: {
    id: string;
    name: string;
    slug: string;
    logo_url: string | null;
    cover_image_url: string | null;
    is_active: boolean;
    subscription_plan: string;
  } | null;
};

export function useSupabaseSession() {
  return useQuery<Session | null>({
    queryKey: ["auth", "session"],
    queryFn: async () => {
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      return data.session ?? null;
    },
    staleTime: 30_000,
  });
}

/**
 * Staff memberships for the signed-in user. Use the already-issued session
 * user id instead of making a second getUser() network request before every
 * membership lookup. RLS remains the authority for what rows are visible.
 */
export function useMemberships() {
  const session = useSupabaseSession();
  const uid = session.data?.user.id ?? null;

  return useQuery<StaffMembership[]>({
    queryKey: ["staff", "memberships", uid],
    enabled: session.isSuccess && Boolean(uid),
    queryFn: async () => {
      if (!uid) return [];
      const { data, error } = await supabase
        .from("staff")
        .select(
          "id, restaurant_id, role, name, is_active, restaurant:restaurants(id, name, slug, logo_url, cover_image_url, is_active, subscription_plan)",
        )
        .eq("auth_user_id", uid)
        .eq("is_active", true);
      if (error) throw error;
      return (data ?? []) as unknown as StaffMembership[];
    },
  });
}

export function useAccess() {
  const memberships = useMemberships();
  const roles = (memberships.data ?? []).map((m) => m.role);
  return {
    ...memberships,
    roles,
    isSuperAdmin: roles.includes("super_admin"),
    can: (capability: Capability) => anyRoleHasCapability(roles, capability),
    membershipFor: (restaurantId: string) =>
      (memberships.data ?? []).find((m) => m.restaurant_id === restaurantId) ?? null,
  };
}
