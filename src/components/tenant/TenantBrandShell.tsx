import type { CSSProperties, ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";

import { useAccess } from "@/hooks/useSession";
import { readAppearance } from "@/lib/restaurant-appearance";

type TenantStyle = CSSProperties & Record<`--${string}`, string>;

/** Restaurant-scoped brand shell. Tenant accents are preserved in both light and dark mode. */
export function TenantBrandShell({ children }: { children: ReactNode }) {
  const access = useAccess();
  const pathname = useRouterState({ select: state => state.location.pathname });
  const selectedId = pathname.match(/^\/manage\/([^/]+)/)?.[1];
  const membership = (access.data ?? []).find(row => row.restaurant_id && row.restaurant && (!selectedId || row.restaurant_id === selectedId))
    ?? (access.data ?? []).find(row => row.restaurant_id && row.restaurant);
  const restaurant = access.isSuperAdmin ? null : membership?.restaurant;

  if (!restaurant) return <div className="qs-app tenant-app">{children}</div>;

  const appearance = readAppearance(restaurant.menu_theme);
  const style: TenantStyle = {
    "--restaurant-light-primary": restaurant.primary_color || "#e85d2a",
    "--restaurant-light-accent": restaurant.accent_color || "#ff8a4c",
    "--restaurant-light-bg": appearance.lightBackground || restaurant.background_color || "#fafbfc",
    "--restaurant-light-topbar-bg": appearance.topNavBackground || "#ffffff",
    "--restaurant-light-topbar-text": appearance.topNavText || "#171a18",
    "--restaurant-light-sidebar-bg": appearance.sidebarBackground,
    "--restaurant-light-sidebar-text": appearance.sidebarText,
    "--restaurant-light-selected-nav": appearance.selectedNavColor || restaurant.primary_color || "#e85d2a",
    "--restaurant-dark-primary": appearance.darkPrimaryColor,
    "--restaurant-dark-accent": appearance.darkAccentColor,
    "--restaurant-dark-bg": appearance.darkBackground,
    "--restaurant-dark-topbar-bg": appearance.darkTopNavBackground,
    "--restaurant-dark-topbar-text": appearance.darkTopNavText,
    "--restaurant-dark-sidebar-bg": appearance.darkSidebarBackground,
    "--restaurant-dark-sidebar-text": appearance.darkSidebarText,
    "--restaurant-dark-selected-nav": appearance.darkSelectedNavColor,
  };

  return <div className="qs-app tenant-app tenant-theme-scope" style={style} data-tenant={restaurant.id}>{children}</div>;
}
