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
  ) ?? (access.data ?? []).find(row => row.restaurant_id && row.restaurant);
  const restaurant = access.isSuperAdmin ? null : membership?.restaurant;

  if (!restaurant) return <div className="qs-app tenant-app">{children}</div>;

  const appearance = readAppearance(restaurant.menu_theme);
  const style: TenantStyle = {
    "--restaurant-primary": restaurant.primary_color || "#ff5a0a",
    "--restaurant-accent": restaurant.accent_color || "#111111",
    "--restaurant-light-bg": appearance.lightBackground || restaurant.background_color || "#fafbfc",
    "--restaurant-dark-bg": appearance.darkBackground || "#11171b",
    "--restaurant-text": restaurant.text_color || "#171a18",
    "--restaurant-topbar-bg": appearance.topNavBackground || "#ffffff",
    "--restaurant-topbar-text": appearance.topNavText || "#171a18",
    "--restaurant-sidebar-bg": appearance.sidebarBackground || "#ffffff",
    "--restaurant-sidebar-text": appearance.sidebarText || "#64748b",
    "--restaurant-selected-nav": appearance.selectedNavColor || restaurant.primary_color || "#ff5a0a",
    "--primary": restaurant.primary_color || "#ff5a0a",
    "--accent": restaurant.accent_color || "#ff5a0a",
  };

  return (
    <>
      <style>{`.tenant-theme-scope{--background:var(--restaurant-light-bg)!important;background:var(--restaurant-light-bg);transition:background-color .18s ease}.dark .tenant-theme-scope{--background:var(--restaurant-dark-bg)!important;background:var(--restaurant-dark-bg)}.tenant-theme-scope .bg-background{background-color:var(--background)!important}.tenant-theme-scope .qs-topbar{background:var(--restaurant-topbar-bg)!important;color:var(--restaurant-topbar-text)!important}.tenant-theme-scope .qs-topbar :is(a,button){color:inherit}.tenant-theme-scope .qs-sidebar-shell{background:var(--restaurant-sidebar-bg)!important;color:var(--restaurant-sidebar-text)!important}.tenant-theme-scope .qs-sidebar-shell .qs-sidebar-item{color:var(--restaurant-sidebar-text)}.dark .tenant-theme-scope .qs-topbar{background:color-mix(in srgb,var(--restaurant-dark-bg) 94%,#fff 6%)!important;color:var(--foreground)!important;border-color:var(--border)!important}.dark .tenant-theme-scope .qs-sidebar-shell{background:color-mix(in srgb,var(--restaurant-dark-bg) 88%,#000 12%)!important;color:var(--foreground)!important;border-color:var(--border)!important}.dark .tenant-theme-scope .qs-sidebar-shell .qs-sidebar-item{color:var(--muted-foreground)!important}.dark .tenant-theme-scope :is([role=dialog],[role=menu],[role=listbox],[data-radix-popper-content-wrapper]>* ){background-color:var(--popover)!important;color:var(--popover-foreground)!important;border-color:var(--border)!important}.tenant-theme-scope .qs-sidebar-shell .qs-sidebar-item[data-active=true]{color:var(--restaurant-selected-nav)!important;background:color-mix(in oklab,var(--restaurant-selected-nav) 10%,transparent)!important}.tenant-theme-scope .qs-sidebar-shell .qs-sidebar-item[data-active=true]::before{background:var(--restaurant-selected-nav)!important}`}</style>
      <div className="qs-app tenant-app tenant-theme-scope" style={style} data-tenant={restaurant.id}>
        {children}
      </div>
    </>
  );
}
