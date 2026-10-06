import { useEffect, type CSSProperties, type ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";

import { useAccess } from "@/hooks/useSession";
import { contrastRatio, selectionPalette } from "@/lib/contrast";
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

  const appearance = readAppearance(restaurant?.menu_theme);
  const lightPrimary = restaurant?.primary_color || "#e85d2a";
  const darkPrimary = appearance.darkPrimaryColor;
  const buttonText = (background: string) => contrastRatio("#ffffff", background) >= contrastRatio("#000000", background) ? "#ffffff" : "#000000";
  const lightSelection = selectionPalette(appearance.selectedNavColor || lightPrimary, false);
  const darkSelection = selectionPalette(appearance.darkSelectedNavColor, true);
  const style: TenantStyle = {
    ...Object.fromEntries(Object.entries(lightSelection).map(([key, value]) => [`--restaurant-light-selection-${key}`, value])),
    ...Object.fromEntries(Object.entries(darkSelection).map(([key, value]) => [`--restaurant-dark-selection-${key}`, value])),
    "--restaurant-light-accent-text": buttonText(restaurant?.accent_color || "#ff8a4c"),
    "--restaurant-dark-accent-text": buttonText(appearance.darkAccentColor),
    "--restaurant-light-primary-text": buttonText(lightPrimary),
    "--restaurant-dark-primary-text": buttonText(darkPrimary),
    "--restaurant-light-primary": restaurant?.primary_color || "#e85d2a",
    "--restaurant-light-accent": restaurant?.accent_color || "#ff8a4c",
    "--restaurant-light-bg": appearance.lightBackground || restaurant?.background_color || "#fafbfc",
    "--restaurant-light-topbar-bg": appearance.topNavBackground || "#ffffff",
    "--restaurant-light-topbar-text": appearance.topNavText || "#171a18",
    "--restaurant-light-sidebar-bg": appearance.sidebarBackground,
    "--restaurant-light-sidebar-text": appearance.sidebarText,
    "--restaurant-light-selected-nav": appearance.selectedNavColor || restaurant?.primary_color || "#e85d2a",
    "--restaurant-dark-primary": appearance.darkPrimaryColor,
    "--restaurant-dark-accent": appearance.darkAccentColor,
    "--restaurant-dark-bg": appearance.darkBackground,
    "--restaurant-dark-topbar-bg": appearance.darkTopNavBackground,
    "--restaurant-dark-topbar-text": appearance.darkTopNavText,
    "--restaurant-dark-sidebar-bg": appearance.darkSidebarBackground,
    "--restaurant-dark-sidebar-text": appearance.darkSidebarText,
    "--restaurant-dark-selected-nav": appearance.darkSelectedNavColor,
  };

  const brandKey = JSON.stringify(style);
  useEffect(() => {
    if (!restaurant) return;
    const root = document.documentElement;
    const values = JSON.parse(brandKey) as Record<string,string>;
    const previous = Object.fromEntries(Object.keys(values).map(key => [key, root.style.getPropertyValue(key)]));
    root.classList.add("tenant-portal-theme");
    Object.entries(values).forEach(([key,value]) => root.style.setProperty(key,value));
    return () => {
      root.classList.remove("tenant-portal-theme");
      Object.entries(previous).forEach(([key,value]) => value ? root.style.setProperty(key,value) : root.style.removeProperty(key));
    };
  }, [brandKey, restaurant?.id]);
  if (!restaurant) return <div className="qs-app tenant-app">{children}</div>;
  return <div className="qs-app tenant-app tenant-theme-scope" style={style} data-tenant={restaurant.id}>{children}</div>;
}
