import type { CSSProperties, ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";

import { useAccess } from "@/hooks/useSession";
import { readAppearance } from "@/lib/restaurant-appearance";

type TenantStyle = CSSProperties & Record<`--${string}`, string>;

/** Restaurant-scoped brand shell. Product chrome stays light while restaurant accents remain tenant-owned. */
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
    "--restaurant-light-sidebar-bg": "#ffffff",
    "--restaurant-light-sidebar-text": "#667085",
    "--restaurant-light-selected-nav": appearance.selectedNavColor || restaurant.primary_color || "#e85d2a",
    "--restaurant-dark-primary": appearance.darkPrimaryColor,
    "--restaurant-dark-accent": appearance.darkAccentColor,
    "--restaurant-dark-bg": appearance.lightBackground || restaurant.background_color || "#fafbfc",
    "--restaurant-dark-topbar-bg": appearance.topNavBackground || "#ffffff",
    "--restaurant-dark-topbar-text": appearance.topNavText || "#171a18",
    "--restaurant-dark-sidebar-bg": "#ffffff",
    "--restaurant-dark-sidebar-text": "#667085",
    "--restaurant-dark-selected-nav": appearance.darkSelectedNavColor,
  };

  return (
    <>
      <style>{`.tenant-theme-scope{--background:var(--restaurant-light-bg)!important;--primary:var(--restaurant-light-primary)!important;--accent:var(--restaurant-light-accent)!important;--restaurant-topbar-bg:var(--restaurant-light-topbar-bg);--restaurant-topbar-text:var(--restaurant-light-topbar-text);--restaurant-sidebar-bg:#fff;--restaurant-sidebar-text:#667085;--restaurant-selected-nav:var(--restaurant-light-selected-nav);background:var(--restaurant-light-bg);transition:background-color .18s ease}.dark .tenant-theme-scope{--background:var(--restaurant-light-bg)!important;--primary:var(--restaurant-light-primary)!important;--accent:var(--restaurant-light-accent)!important;--restaurant-topbar-bg:var(--restaurant-light-topbar-bg);--restaurant-topbar-text:var(--restaurant-light-topbar-text);--restaurant-sidebar-bg:#fff;--restaurant-sidebar-text:#667085;--restaurant-selected-nav:var(--restaurant-light-selected-nav);background:var(--restaurant-light-bg)!important}.tenant-theme-scope .bg-background{background-color:var(--background)!important}.tenant-theme-scope .qs-topbar{background:color-mix(in srgb,var(--restaurant-topbar-bg) 94%,transparent)!important;color:var(--restaurant-topbar-text)!important;border-color:var(--border)!important}.tenant-theme-scope .qs-sidebar-shell{background:#fff!important;color:#667085!important;border-color:var(--border)!important}.tenant-theme-scope .qs-sidebar-shell .qs-sidebar-item{color:#667085!important}.tenant-theme-scope .qs-sidebar-shell .qs-sidebar-item[data-active=true]{color:var(--restaurant-selected-nav)!important;background:color-mix(in oklab,var(--restaurant-selected-nav) 10%,white)!important}`}</style>
      <div className="qs-app tenant-app tenant-theme-scope" style={style} data-tenant={restaurant.id}>{children}</div>
    </>
  );
}
