import { useQuery } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { AppRole, Capability, PermissionOverrides } from "@/lib/permissions";
import { membershipHasCapability } from "@/lib/permissions";

export type StaffMembership = {
  id: string;
  restaurant_id: string | null;
  role: AppRole;
  name: string;
  is_active: boolean;
  avatar_url: string | null;
  avatar_preset: string | null;
  permission_overrides: PermissionOverrides | null;
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
          "id, restaurant_id, role, name, is_active, avatar_url, avatar_preset, permission_overrides, restaurant:restaurants(id, name, slug, logo_url, cover_image_url, primary_color, secondary_color, accent_color, background_color, text_color, menu_theme, is_active, subscription_plan)",
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
  const rows = memberships.data ?? [];
  const roles = rows.map((m) => m.role);
  const isSuperAdmin = roles.includes("super_admin");
  const canFor = (restaurantId: string, capability: Capability) => {
    if (isSuperAdmin) return true;
    const membership = rows.find((row) => row.restaurant_id === restaurantId);
    return membership ? membershipHasCapability(membership.role, membership.permission_overrides, capability) : false;
  };
  return {
    ...memberships,
    roles,
    isSuperAdmin,
    can: (capability: Capability) => isSuperAdmin || rows.some((row) => membershipHasCapability(row.role, row.permission_overrides, capability)),
    canFor,
    membershipFor: (restaurantId: string) => rows.find((m) => m.restaurant_id === restaurantId) ?? null,
  };
}