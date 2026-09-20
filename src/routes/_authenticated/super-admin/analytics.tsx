import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, Clock3, Landmark, ReceiptText, Store, TrendingUp } from "lucide-react";
import { useState } from "react";

import { MasterEyebrow, MasterKpi, MasterPageHeader, MasterSection } from "@/components/app/MasterPage";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { daysAgoIso, formatMoney, formatNumber } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/super-admin/analytics")({
  head: () => ({
    meta: [
      { title: "Platform analytics — QuickServe admin" },
      { name: "description", content: "Revenue, order volume, average order value and per-restaurant performance across the platform." },
    ],
  }),
  component: AnalyticsPage,
});

function AnalyticsPage() {
  const { t, lang } = useI18n();
  const ar = lang === "ar";
  const [days, setDays] = useState("30");

  const analytics = useQuery({
    queryKey: ["platform", "analytics", days],
    queryFn: async () => {
      const from = daysAgoIso(Number(days));
      const [orders, restaurants] = await Promise.all([
        supabase.from("orders").select("restaurant_id, total, status, created_at").gte("created_at", from),
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

      return { orders: live.length, revenue, aov: live.length ? revenue / live.length : 0, byRestaurant, byHour, statusMix };
    },
  });

  const a = analytics.data;
  const peak = Math.max(1, ...(a?.byHour.map((h) => h.orders) ?? [1]));
  const topRestaurant = a?.byRestaurant[0];

  return (
    <div className="space-y-5">
      <MasterPageHeader
        eyebrow={<MasterEyebrow icon={BarChart3}>{ar ? "تحليلات المنصة" : "Platform intelligence"}</MasterEyebrow>}
        title={t("sa.analytics.title")}
        description={ar ? "صورة تنفيذية واضحة لأداء الإيرادات والطلبات والمطاعم عبر المنصة." : "An executive view of revenue, order volume and restaurant performance across the QuickServe platform."}
        actions={
          <Select value={days} onValueChange={setDays}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {["7", "30", "90"].map((d) => <SelectItem key={d} value={d}>{d} {t("sa.analytics.days")}</SelectItem>)}
            </SelectContent>
          </Select>
        }
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MasterKpi icon={Landmark} label={t("sa.analytics.sales")} value={analytics.isPending ? "—" : formatMoney(a?.revenue, "JOD", lang)} hint={ar ? `آخر ${days} يوم` : `Last ${days} days`} />
        <MasterKpi icon={ReceiptText} label={t("sa.stat.ordersMonth")} value={analytics.isPending ? "—" : formatNumber(a?.orders, lang)} tone="blue" />
        <MasterKpi icon={TrendingUp} label={t("sa.analytics.aov")} value={analytics.isPending ? "—" : formatMoney(a?.aov, "JOD", lang)} tone="green" />
        <MasterKpi icon={Store} label={ar ? "أفضل مطعم" : "Top restaurant"} value={topRestaurant?.name ?? "—"} hint={topRestaurant ? formatMoney(topRestaurant.revenue, topRestaurant.currency, lang) : undefined} tone="purple" />
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(330px,.75fr)]">
        <MasterSection title={t("sa.analytics.peakHours")} description={ar ? "توزيع الطلبات حسب ساعة اليوم." : "Order distribution by hour of day."}>
          {analytics.isPending ? <Skeleton className="h-60 rounded-2xl" /> : (
            <div className="flex h-60 items-end gap-1.5 pt-4">
              {(a?.byHour ?? []).map((h) => (
                <div key={h.hour} className="group flex min-w-0 flex-1 flex-col items-center justify-end gap-2">
                  <div className="relative flex h-[190px] w-full items-end overflow-hidden rounded-t-lg bg-muted/40">
                    <div
                      className="w-full rounded-t-lg bg-[#ff5a0a] transition group-hover:bg-[#e94f00]"
                      style={{ height: `${Math.max(3, (h.orders / peak) * 100)}%` }}
                      title={`${h.hour}:00 — ${h.orders}`}
                    />
                  </div>
                  <span className="text-[9px] tabular-nums text-muted-foreground">{h.hour}</span>
                </div>
              ))}
            </div>
          )}
        </MasterSection>

        <MasterSection title={t("sa.analytics.statusMix")} description={ar ? "مزيج حالات الطلبات في الفترة المختارة." : "Order lifecycle mix for the selected period."}>
          {analytics.isPending ? <Skeleton className="h-60 rounded-2xl" /> : (
            <div className="space-y-3">
              {(a?.statusMix ?? []).map(([status, count]) => {
                const total = Math.max(1, (a?.statusMix ?? []).reduce((sum, [, value]) => sum + value, 0));
                const pct = Math.round((count / total) * 100);
                return <div key={status}>
                  <div className="flex items-center justify-between gap-3 text-xs"><span className="capitalize">{status}</span><strong className="tabular-nums">{formatNumber(count, lang)} · {pct}%</strong></div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-[#ff5a0a]" style={{ width: `${pct}%` }} /></div>
                </div>;
              })}
            </div>
          )}
        </MasterSection>
      </section>

      <MasterSection title={t("sa.analytics.byRestaurant")} description={ar ? "مقارنة المطاعم حسب الطلبات والإيرادات." : "Compare tenant restaurants by order volume and revenue."}>
        {analytics.isPending ? <Skeleton className="h-72 rounded-2xl" /> : (
          <div className="overflow-x-auto">
            <table className="qs-table min-w-[720px]">
              <thead><tr><th>{ar ? "المطعم" : "Restaurant"}</th><th>{ar ? "الطلبات" : "Orders"}</th><th>{ar ? "الإيرادات" : "Revenue"}</th><th>{ar ? "متوسط الطلب" : "Avg ticket"}</th></tr></thead>
              <tbody>
                {(a?.byRestaurant ?? []).map((r) => <tr key={r.id}>
                  <td className="font-semibold">{r.name}</td>
                  <td className="tabular-nums">{formatNumber(r.orders, lang)}</td>
                  <td className="tabular-nums">{formatMoney(r.revenue, r.currency, lang)}</td>
                  <td className="tabular-nums text-muted-foreground">{formatMoney(r.orders ? r.revenue / r.orders : 0, r.currency, lang)}</td>
                </tr>)}
              </tbody>
            </table>
          </div>
        )}
      </MasterSection>
    </div>
  );
}
