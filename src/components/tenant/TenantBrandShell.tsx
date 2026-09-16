import type { CSSProperties, ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";

import { useAccess } from "@/hooks/useSession";
import { readAppearance } from "@/lib/restaurant-appearance";

type TenantStyle = CSSProperties & Record<`--${string}`, string>;

/** Restaurant-scoped brand shell. Never apply one tenant's theme to another. */
export function TenantBrandShell({ children }: { children: ReactNode }) {
  const access = useAccess();
  const pathname = useRouterState({ select: state => state.location.pathname });
  const selectedId = pathname.match(/^\/manage\/([^/]+)/)?.[1];
  const membership = (access.data ?? []).find(
    row => row.restaurant_id && row.restaurant && (!selectedId || row.restaurant_id === selectedId),
  );
  const restaurant = access.isSuperAdmin ? null : membership?.restaurant;

  if (!restaurant) return <div className="qs-app tenant-app">{children}</div>;

  const appearance = readAppearance(restaurant.menu_theme);
  const style: TenantStyle = {
    "--restaurant-primary": restaurant.primary_color || "#ff5a0a",
    "--restaurant-accent": restaurant.accent_color || "#111111",
    "--restaurant-light-bg": appearance.lightBackground || restaurant.background_color || "#fafbfc",
    "--restaurant-dark-bg": appearance.darkBackground || "#11171b",
    "--restaurant-text": restaurant.text_color || "#171a18",
    "--tenant-topbar-bg": appearance.topNavBackground,
    "--tenant-topbar-fg": appearance.topNavForeground,
    "--tenant-sidebar-bg": appearance.sidebarBackground,
    "--tenant-sidebar-fg": appearance.sidebarForeground,
    "--primary": restaurant.primary_color || "#ff5a0a",
    "--accent": restaurant.accent_color || "#ff5a0a",
  };

  return (
    <>
      <style>{`.tenant-theme-scope{--background:var(--restaurant-light-bg)!important;background:var(--restaurant-light-bg);transition:background-color .18s ease}.dark .tenant-theme-scope{--background:var(--restaurant-dark-bg)!important;background:var(--restaurant-dark-bg)}.tenant-theme-scope .bg-background{background-color:var(--background)!important}.tenant-theme-scope .qs-topbar{background:var(--tenant-topbar-bg)!important;color:var(--tenant-topbar-fg)!important}.tenant-theme-scope .qs-sidebar-shell{background:var(--tenant-sidebar-bg)!important;color:var(--tenant-sidebar-fg)!important}.tenant-theme-scope .qs-sidebar-shell .qs-sidebar-item:not([data-active=true]){color:var(--tenant-sidebar-fg)!important}`}</style>
      <div className="qs-app tenant-app tenant-theme-scope" style={style} data-tenant={restaurant.id}>
        {children}
      </div>
    </>
  );
}
