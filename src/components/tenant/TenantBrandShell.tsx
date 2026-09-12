import type { CSSProperties, ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";

import { useAccess } from "@/hooks/useSession";
import { ensureContrast } from "@/lib/contrast";

type TenantStyle = CSSProperties & Record<`--${string}`, string>;

export function TenantBrandShell({ children }: { children: ReactNode }) {
  const access = useAccess();
  const pathname = useRouterState({ select: state => state.location.pathname });
  const selectedId = pathname.match(/^\/manage\/([^/]+)/)?.[1];
  const membership = (access.data ?? []).find((row) => row.restaurant_id && row.restaurant && (!selectedId || row.restaurant_id === selectedId));
  const restaurant = access.isSuperAdmin ? null : membership?.restaurant;

  if (!restaurant) return <>{children}</>;

  const background = restaurant.background_color || "#faf9f6";
  const primary = restaurant.primary_color || "#183f2b";
  const accent = restaurant.accent_color || "#d9a441";
  const foreground = ensureContrast(restaurant.text_color || "#171a18", background);
  const primaryForeground = ensureContrast("#ffffff", primary);
  const accentForeground = ensureContrast("#182019", accent);

  const style: TenantStyle = {
    "--background": background,
    "--foreground": foreground,
    "--primary": primary,
    "--primary-foreground": primaryForeground,
    "--accent": accent,
    "--accent-foreground": accentForeground,
    "--ring": accent,
    "--sidebar": primary,
    "--sidebar-foreground": primaryForeground,
    "--sidebar-primary": accent,
    "--sidebar-primary-foreground": accentForeground,
    "--restaurant-primary": primary,
    "--restaurant-accent": accent,
    "--card": `color-mix(in oklab, ${background} 18%, white)`,
    "--card-foreground": foreground,
    "--popover": `color-mix(in oklab, ${background} 12%, white)`,
    "--popover-foreground": foreground,
    "--secondary": `color-mix(in oklab, ${primary} 7%, ${background})`,
    "--secondary-foreground": foreground,
    "--muted": `color-mix(in oklab, ${primary} 5%, ${background})`,
    "--muted-foreground": ensureContrast("#667169", background),
    "--border": `color-mix(in oklab, ${primary} 15%, ${background})`,
    "--input": `color-mix(in oklab, ${primary} 18%, ${background})`,
    "--surface": `color-mix(in oklab, ${primary} 4%, ${background})`,
    "--surface-foreground": foreground,
  };

  return (
    <div className="tenant-app min-h-screen bg-background text-foreground" style={style} data-tenant={restaurant.id}>
      <div className="lg:ps-64">{children}</div>
    </div>
  );
}
