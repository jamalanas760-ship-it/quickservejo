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

export function RestaurantSwitcher({ restaurantId }: { restaurantId: string }) {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const restaurants = useRestaurantsWithStats();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const translated = t("sa.switch.label");
  const switchLabel = !translated || translated === "sa.switch.label"
    ? (lang === "ar" ? "المطعم" : "Restaurant")
    : translated;

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground">{switchLabel}</span>
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
            <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
