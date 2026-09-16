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
  avatar_url: string | null;
  avatar_preset: string | null;
  restaurant: {
    id: string;
    name: string;
    slug: string;
    logo_url: string | null;
    cover_image_url: string | null;
    primary_color: string;
    secondary_color: string;
    accent_color: string;
    background_color: string;
    text_color: string;
    menu_theme: unknown;
    is_active: boolean;
    subscription_plan: string;
  } | null;
};

export function useSupabaseSession() {
  return useQuery<Session | null>({
    queryKey: ["auth", "session"],
    queryFn: async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        return data.session ?? null;
      } catch (err) {
        if (err instanceof Error && /fetch|network/i.test(err.message)) return null;
        throw err;
      }
    },
    retry: false,
    staleTime: 30_000,
  });
}

export function useMemberships() {
  const session = useSupabaseSession();
  const uid = session.data?.user.id ?? null;

  return useQuery<StaffMembership[]>({
    queryKey: ["staff", "memberships", uid],
    enabled: session.isSuccess && Boolean(uid),
    queryFn: async () => {
      if (!uid) return [];
      const { data, error } = await (supabase.from("staff") as any)
        .select(
          "id, restaurant_id, role, name, is_active, avatar_url, avatar_preset, restaurant:restaurants(id, name, slug, logo_url, cover_image_url, primary_color, secondary_color, accent_color, background_color, text_color, menu_theme, is_active, subscription_plan)",
        )
        .eq("auth_user_id", uid)
        .eq("is_active", true);
      if (error) throw error;
      return (data ?? []) as StaffMembership[];
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
