import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { StatCard } from "@/components/superadmin/StatCard";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { daysAgoIso, formatMoney, formatNumber } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/super-admin/analytics")({
  head: () => ({
    meta: [
      { title: "Platform analytics — QuickServe admin" },
      {
        name: "description",
        content:
          "Revenue, order volume, average order value and per-restaurant performance across the platform.",
      },
      { property: "og:title", content: "Platform analytics — QuickServe admin" },
      { property: "og:description", content: "Cross-tenant performance analytics for QuickServe." },
    ],
  }),
  component: AnalyticsPage,
});

function AnalyticsPage() {
  const { t, lang } = useI18n();
  const [days, setDays] = useState("30");

  const analytics = useQuery({
    queryKey: ["platform", "analytics", days],
    queryFn: async () => {
      const from = daysAgoIso(Number(days));
      const [orders, restaurants] = await Promise.all([
        supabase
          .from("orders")
          .select("restaurant_id, total, status, created_at")
          .gte("created_at", from),
        supabase.from("restaurants").select("id, name, currency"),
      ]);
      if (orders.error) throw orders.error;
      if (restaurants.error) throw restaurants.error;

      const live = (orders.data ?? []).filter((o) => o.status !== "cancelled");
      const revenue = live.reduce((acc, o) => acc + Number(o.total ?? 0), 0);

      const byRestaurant = (restaurants.data ?? [])
        .map((r) => {
          const rows = live.filter((o) => o.restaurant_id === r.id);
          return {
            id: r.id,
            name: r.name,
            currency: r.currency,
            orders: rows.length,
            revenue: rows.reduce((acc, o) => acc + Number(o.total ?? 0), 0),
          };
        })
        .sort((a, b) => b.revenue - a.revenue);

      const byHour = Array.from({ length: 24 }, (_, hour) => ({
        hour,
        orders: live.filter((o) => new Date(o.created_at).getHours() === hour).length,
      }));

      const statusMix = Object.entries(
        (orders.data ?? []).reduce<Record<string, number>>((acc, o) => {
          acc[o.status] = (acc[o.status] ?? 0) + 1;
          return acc;
        }, {}),
      ).sort((a, b) => b[1] - a[1]);

      return {
        orders: live.length,
        revenue,
        aov: live.length ? revenue / live.length : 0,
        byRestaurant,
        byHour,
        statusMix,
      };
    },
  });

  const a = analytics.data;
  const peak = Math.max(1, ...(a?.byHour.map((h) => h.orders) ?? [1]));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">{t("sa.analytics.title")}</h1>
        <Select value={days} onValueChange={setDays}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {["7", "30", "90"].map((d) => (
              <SelectItem key={d} value={d}>
                {d} {t("sa.analytics.days")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
        <StatCard
          label={t("sa.analytics.sales")}
          value={formatMoney(a?.revenue, "JOD", lang)}
          {...(analytics.isPending ? { loading: true } : {})}
        />
        <StatCard
          label={t("sa.stat.ordersMonth")}
          value={formatNumber(a?.orders, lang)}
          {...(analytics.isPending ? { loading: true } : {})}
        />
        <StatCard
          label={t("sa.analytics.aov")}
          value={formatMoney(a?.aov, "JOD", lang)}
          {...(analytics.isPending ? { loading: true } : {})}
        />
      </div>

      <section className="panel p-6">
        <h2 className="font-semibold">{t("sa.analytics.peakHours")}</h2>
        {analytics.isPending ? (
          <Skeleton className="mt-4 h-32 rounded-lg" />
        ) : (
          <div className="mt-4 flex h-32 items-end gap-1">
            {(a?.byHour ?? []).map((h) => (
              <div key={h.hour} className="flex-1 text-center">
                <div
                  className="mx-auto w-full rounded-t bg-primary/70"
                  style={{ height: `${(h.orders / peak) * 100}%` }}
                  title={`${h.hour}:00 — ${h.orders}`}
                />
                <span className="text-[10px] text-muted-foreground">{h.hour}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="panel p-6">
          <h2 className="font-semibold">{t("sa.analytics.byRestaurant")}</h2>
          {analytics.isPending ? (
            <Skeleton className="mt-4 h-48 rounded-lg" />
          ) : (
            <ul className="mt-4 divide-y text-sm">
              {(a?.byRestaurant ?? []).map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="truncate">{r.name}</span>
                  <span className="whitespace-nowrap text-muted-foreground">
                    {formatNumber(r.orders, lang)} · {formatMoney(r.revenue, r.currency, lang)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="panel p-6">
          <h2 className="font-semibold">{t("sa.analytics.statusMix")}</h2>
          {analytics.isPending ? (
            <Skeleton className="mt-4 h-48 rounded-lg" />
          ) : (
            <ul className="mt-4 divide-y text-sm">
              {(a?.statusMix ?? []).map(([status, count]) => (
                <li key={status} className="flex justify-between py-2">
                  <span className="capitalize">{status}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {formatNumber(count, lang)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
