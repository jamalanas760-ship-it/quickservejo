import { useQuery } from "@tanstack/react-query";

import { StatCard } from "@/components/superadmin/StatCard";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useRestaurant } from "@/hooks/useSuperAdmin";
import { useI18n } from "@/lib/i18n";
import { daysAgoIso, formatMoney, formatNumber } from "@/lib/format";

/** Analytics scoped to a single restaurant. */
export function AnalyticsManager({ restaurantId }: { restaurantId: string }) {
  const { t, lang } = useI18n();
  const { data: restaurant } = useRestaurant(restaurantId);
  const currency = restaurant?.currency ?? "SAR";

  const stats = useQuery({
    queryKey: ["platform", "restaurant-analytics", restaurantId],
    queryFn: async () => {
      const since = daysAgoIso(30);
      const { data, error } = await supabase
        .from("orders")
        .select("id, total, status, created_at")
        .eq("restaurant_id", restaurantId)
        .gte("created_at", since);
      if (error) throw error;
      const live = (data ?? []).filter((o) => o.status !== "cancelled");
      const revenue = live.reduce((acc, o) => acc + Number(o.total ?? 0), 0);
      const byHour = new Map<number, number>();
      for (const o of live) {
        const hour = new Date(o.created_at).getHours();
        byHour.set(hour, (byHour.get(hour) ?? 0) + 1);
      }
      return {
        orders: live.length,
        revenue,
        aov: live.length ? revenue / live.length : 0,
        cancelled: (data ?? []).length - live.length,
        peak: [...byHour.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6),
      };
    },
  });

  if (stats.isPending) return <Skeleton className="h-64 rounded-xl" />;

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold">{t("sa.detail.analytics")}</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={t("sa.stat.ordersMonth")} value={formatNumber(stats.data?.orders, lang)} />
        <StatCard
          label={t("sa.stat.salesMonth")}
          value={formatMoney(stats.data?.revenue ?? 0, currency, lang)}
        />
        <StatCard
          label={t("sa.analytics.aov")}
          value={formatMoney(stats.data?.aov ?? 0, currency, lang)}
        />
        <StatCard label={t("sa.orders.cancel")} value={formatNumber(stats.data?.cancelled, lang)} />
      </div>

      <section className="panel p-5">
        <h2 className="font-semibold">{t("sa.analytics.peakHours")}</h2>
        {(stats.data?.peak ?? []).length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">{t("sa.orders.empty")}</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {(stats.data?.peak ?? []).map(([hour, count]) => (
              <li key={hour} className="flex items-center gap-3 text-sm">
                <span className="w-14 text-muted-foreground">{String(hour).padStart(2, "0")}:00</span>
                <span className="h-2 flex-1 rounded-full bg-muted">
                  <span
                    className="block h-2 rounded-full bg-primary"
                    style={{
                      width: `${(count / Math.max(...(stats.data?.peak ?? [[0, 1]]).map((p) => p[1]))) * 100}%`,
                    }}
                  />
                </span>
                <span className="w-8 text-end">{count}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
