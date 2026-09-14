import type { CSSProperties, ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";

import { useAccess } from "@/hooks/useSession";

type TenantStyle = CSSProperties & Record<`--${string}`, string>;

/**
 * Keep tenant brand values available to restaurant-specific experiences while
 * the signed-in QuickServe application uses the shared master product chrome.
 */
export function TenantBrandShell({ children }: { children: ReactNode }) {
  const access = useAccess();
  const pathname = useRouterState({ select: state => state.location.pathname });
  const selectedId = pathname.match(/^\/manage\/([^/]+)/)?.[1];
  const membership = (access.data ?? []).find(
    row => row.restaurant_id && row.restaurant && (!selectedId || row.restaurant_id === selectedId),
  );
  const restaurant = access.isSuperAdmin ? null : membership?.restaurant;

  if (!restaurant) return <div className="qs-app tenant-app">{children}</div>;

  const style: TenantStyle = {
    "--restaurant-primary": restaurant.primary_color || "#183f2b",
    "--restaurant-accent": restaurant.accent_color || "#d9a441",
    "--restaurant-background": restaurant.background_color || "#faf9f6",
    "--restaurant-text": restaurant.text_color || "#171a18",
  };

  return (
    <div className="qs-app tenant-app" style={style} data-tenant={restaurant.id}>
      {children}
    </div>
  );
}
