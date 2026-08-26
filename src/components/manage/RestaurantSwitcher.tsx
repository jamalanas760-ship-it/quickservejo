import { useNavigate, useRouterState } from "@tanstack/react-router";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useRestaurantsWithStats } from "@/hooks/useSuperAdmin";
import { useI18n } from "@/lib/i18n";

/**
 * Switches the managed tenant while keeping the current sub-page. Only a
 * convenience: every page re-reads data with the new restaurant id and the
 * database re-authorizes that id on every request.
 */
export function RestaurantSwitcher({ restaurantId }: { restaurantId: string }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const restaurants = useRestaurantsWithStats();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground">{t("sa.switch.label")}</span>
      <Select
        value={restaurantId}
        onValueChange={(next) => {
          const target = pathname.replace(restaurantId, next);
          void navigate({ to: target, replace: true });
        }}
      >
        <SelectTrigger className="w-56">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(restaurants.data ?? []).map((r) => (
            <SelectItem key={r.id} value={r.id}>
              {r.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
