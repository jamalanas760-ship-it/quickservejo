import type { CSSProperties, ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";

import { useAccess } from "@/hooks/useSession";
import { readAppearance } from "@/lib/restaurant-appearance";

type TenantStyle = CSSProperties & Record<`--${string}`, string>;

/** Restaurant-scoped brand shell. Light and dark workspace palettes are independent. */
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
    "--restaurant-light-primary": restaurant.primary_color || "#ff5a0a",
    "--restaurant-light-accent": restaurant.accent_color || "#ff8a4c",
    "--restaurant-light-bg": appearance.lightBackground || restaurant.background_color || "#fafbfc",
    "--restaurant-light-topbar-bg": appearance.topNavBackground || "#ffffff",
    "--restaurant-light-topbar-text": appearance.topNavText || "#171a18",
    "--restaurant-light-sidebar-bg": appearance.sidebarBackground || "#ffffff",
    "--restaurant-light-sidebar-text": appearance.sidebarText || "#64748b",
    "--restaurant-light-selected-nav": appearance.selectedNavColor || restaurant.primary_color || "#ff5a0a",
    "--restaurant-dark-primary": appearance.darkPrimaryColor,
    "--restaurant-dark-accent": appearance.darkAccentColor,
    "--restaurant-dark-bg": appearance.darkBackground,
    "--restaurant-dark-topbar-bg": appearance.darkTopNavBackground,
    "--restaurant-dark-topbar-text": appearance.darkTopNavText,
    "--restaurant-dark-sidebar-bg": appearance.darkSidebarBackground,
    "--restaurant-dark-sidebar-text": appearance.darkSidebarText,
    "--restaurant-dark-selected-nav": appearance.darkSelectedNavColor,
  };

  return (
    <>
      <style>{`.tenant-theme-scope{--background:var(--restaurant-light-bg)!important;--primary:var(--restaurant-light-primary)!important;--accent:var(--restaurant-light-accent)!important;--restaurant-topbar-bg:var(--restaurant-light-topbar-bg);--restaurant-topbar-text:var(--restaurant-light-topbar-text);--restaurant-sidebar-bg:var(--restaurant-light-sidebar-bg);--restaurant-sidebar-text:var(--restaurant-light-sidebar-text);--restaurant-selected-nav:var(--restaurant-light-selected-nav);background:var(--restaurant-light-bg);transition:background-color .18s ease}.dark .tenant-theme-scope{--background:var(--restaurant-dark-bg)!important;--primary:var(--restaurant-dark-primary)!important;--accent:var(--restaurant-dark-accent)!important;--restaurant-topbar-bg:var(--restaurant-dark-topbar-bg);--restaurant-topbar-text:var(--restaurant-dark-topbar-text);--restaurant-sidebar-bg:var(--restaurant-dark-sidebar-bg);--restaurant-sidebar-text:var(--restaurant-dark-sidebar-text);--restaurant-selected-nav:var(--restaurant-dark-selected-nav);background:var(--restaurant-dark-bg)}.tenant-theme-scope .bg-background{background-color:var(--background)!important}.tenant-theme-scope .qs-topbar{background:var(--restaurant-topbar-bg)!important;color:var(--restaurant-topbar-text)!important;border-color:var(--border)!important}.tenant-theme-scope .qs-topbar :is(a,button){color:inherit}.tenant-theme-scope .qs-sidebar-shell{background:var(--restaurant-sidebar-bg)!important;color:var(--restaurant-sidebar-text)!important;border-color:var(--border)!important}.tenant-theme-scope .qs-sidebar-shell .qs-sidebar-item{color:var(--restaurant-sidebar-text)!important}.dark .tenant-theme-scope :is([role=dialog],[role=menu],[role=listbox],[data-radix-popper-content-wrapper]>* ){background-color:var(--popover)!important;color:var(--popover-foreground)!important;border-color:var(--border)!important}.tenant-theme-scope .qs-sidebar-shell .qs-sidebar-item[data-active=true]{color:var(--restaurant-selected-nav)!important;background:color-mix(in oklab,var(--restaurant-selected-nav) 10%,transparent)!important}.tenant-theme-scope .qs-sidebar-shell .qs-sidebar-item[data-active=true]::before{background:var(--restaurant-selected-nav)!important}`}</style>
      <div className="qs-app tenant-app tenant-theme-scope" style={style} data-tenant={restaurant.id}>{children}</div>
    </>
  );
}
