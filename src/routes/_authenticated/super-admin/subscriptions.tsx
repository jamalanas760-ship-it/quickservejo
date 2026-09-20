import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useRestaurantsWithStats, useSubscriptionPlans } from "@/hooks/useSuperAdmin";
import { useI18n } from "@/lib/i18n";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import { humanError } from "@/lib/errors";
import { logAudit } from "@/lib/audit";
import type { SubscriptionPlan } from "@/lib/permissions";

export const Route = createFileRoute("/_authenticated/super-admin/subscriptions")({
  head: () => ({
    meta: [
      { title: "Subscriptions & plans — QuickServe admin" },
      {
        name: "description",
        content: "Review plan limits and change the subscription plan or status of any restaurant.",
      },
      { property: "og:title", content: "Subscriptions & plans — QuickServe admin" },
      { property: "og:description", content: "Plan limits and tenant subscription management." },
    ],
  }),
  component: SubscriptionsPage,
});

const PLANS: SubscriptionPlan[] = ["free", "basic", "professional", "enterprise"];
const STATUSES = ["trialing", "active", "past_due", "cancelled", "suspended"];

function SubscriptionsPage() {
  const { t, lang, pick } = useI18n();
  const queryClient = useQueryClient();
  const plans = useSubscriptionPlans();
  const restaurants = useRestaurantsWithStats();
  const usage = useQuery({
    queryKey: ["platform", "saas-usage", new Date().toLocaleDateString("en-CA")],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("saas_usage_daily")
        .select("restaurant_id,orders_count,active_staff,tables_count,menu_items_count")
        .eq("usage_date", new Date().toLocaleDateString("en-CA"));
      if (error) throw error;
      return (data ?? []) as Array<{ restaurant_id: string; orders_count: number; active_staff: number; tables_count: number; menu_items_count: number }>;
    },
    staleTime: 60_000,
  });
  const usageByRestaurant = new Map((usage.data ?? []).map((row) => [row.restaurant_id, row]));
  const planByName = new Map((plans.data ?? []).map((plan) => [plan.plan, plan]));

  async function update(
    id: string,
    patch: { subscription_plan?: SubscriptionPlan; subscription_status?: string },
  ) {
    try {
      const { error } = await supabase
        .from("restaurants")
        .update(patch as never)
        .eq("id", id);
      if (error) throw error;
      await logAudit("plan.updated", {
        restaurantId: id,
        entity: "restaurants",
        entityId: id,
        metadata: patch,
      });
      await queryClient.invalidateQueries({ queryKey: ["platform"] });
      toast.success(t("common.saved"));
    } catch (error) {
      toast.error(humanError(error, lang));
    }
  }

  const limit = (value: number | null) => (value === null ? t("sa.subs.unlimited") : formatNumber(value, lang));

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">{t("sa.subs.title")}</h1>

      <section className="space-y-3">
        <h2 className="font-semibold">{t("sa.subs.plans")}</h2>
        {plans.isPending ? (
          <Skeleton className="h-40 rounded-xl" />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
            {(plans.data ?? []).map((p) => (
              <div key={p.plan} className="panel space-y-2 p-5">
                <p className="text-sm font-semibold">{pick(p.name_en, p.name_ar)}</p>
                <p className="text-2xl font-semibold">
                  {formatMoney(p.price_monthly, "JOD", lang)}
                </p>
                <ul className="space-y-1 text-xs text-muted-foreground">
                  <li>
                    {t("sa.stat.activeTables")}: {limit(p.max_tables)}
                  </li>
                  <li>
                    {t("sa.stat.menuItems")}: {limit(p.max_products)}
                  </li>
                  <li>
                    {t("sa.stat.staff")}: {limit(p.max_staff)}
                  </li>
                  <li>
                    {t("sa.stat.ordersMonth")}: {limit(p.max_monthly_orders)}
                  </li>
                </ul>
                <div className="flex flex-wrap gap-1 pt-1">
                  {p.analytics_enabled ? <Badge variant="secondary">{t("sa.nav.analytics")}</Badge> : null}
                  {p.custom_branding ? <Badge variant="secondary">{t("sa.wizard.branding")}</Badge> : null}
                  {p.ai_features ? <Badge variant="secondary">AI</Badge> : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">{t("sa.subs.usage")}</h2>
        {restaurants.isPending ? (
          <Skeleton className="h-64 rounded-xl" />
        ) : (
          <>
            <div className="grid gap-2 md:hidden">
              {(restaurants.data ?? []).map((r) => (
                <div key={r.id} className="panel space-y-3 p-4">
                  <p className="truncate font-semibold">{r.name}</p>
                  <div className="grid grid-cols-2 gap-2">
                    <Select
                      value={r.subscription_plan}
                      onValueChange={(v) =>
                        void update(r.id, { subscription_plan: v as SubscriptionPlan })
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PLANS.map((p) => (
                          <SelectItem key={p} value={p}>
                            {p}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select
                      value={r.subscription_status}
                      onValueChange={(v) => void update(r.id, { subscription_status: v })}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUSES.map((s) => (
                          <SelectItem key={s} value={s}>
                            {s}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(r.subscription_start, lang)} → {formatDate(r.subscription_end, lang)}
                  </p>
                  {(() => {
                    const u = usageByRestaurant.get(r.id);
                    const p = planByName.get(r.subscription_plan);
                    return <div className="space-y-2">
                      <UsageBar label={t("sa.stat.activeTables")} value={u?.tables_count ?? r.tableCount} limit={p?.max_tables ?? null} lang={lang} />
                      <UsageBar label={t("sa.stat.menuItems")} value={u?.menu_items_count ?? r.productCount} limit={p?.max_products ?? null} lang={lang} />
                      <UsageBar label={t("sa.stat.staff")} value={u?.active_staff ?? r.staffCount} limit={p?.max_staff ?? null} lang={lang} />
                      <UsageBar label={t("sa.stat.ordersMonth")} value={u?.orders_count ?? 0} limit={p?.max_monthly_orders ?? null} lang={lang} />
                    </div>;
                  })()}
                </div>
              ))}
            </div>
            <div className="panel hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead className="border-b text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="p-3 text-start">{t("sa.rest.col.restaurant")}</th>
                  <th className="p-3 text-start">{t("sa.subs.plan")}</th>
                  <th className="p-3 text-start">{t("sa.field.subStatus")}</th>
                  <th className="p-3 text-start">{t("sa.subs.start")}</th>
                  <th className="p-3 text-start">{t("sa.subs.end")}</th>
                  <th className="p-3 text-start">{t("sa.subs.usage")}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {(restaurants.data ?? []).map((r) => (
                  <tr key={r.id}>
                    <td className="p-3 font-medium">{r.name}</td>
                    <td className="p-3">
                      <Select
                        value={r.subscription_plan}
                        onValueChange={(v) =>
                          void update(r.id, { subscription_plan: v as SubscriptionPlan })
                        }
                      >
                        <SelectTrigger className="w-40">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {PLANS.map((p) => (
                            <SelectItem key={p} value={p}>
                              {p}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="p-3">
                      <Select
                        value={r.subscription_status}
                        onValueChange={(v) => void update(r.id, { subscription_status: v })}
                      >
                        <SelectTrigger className="w-40">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {STATUSES.map((s) => (
                            <SelectItem key={s} value={s}>
                              {s}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="whitespace-nowrap p-3 text-muted-foreground">
                      {formatDate(r.subscription_start, lang)}
                    </td>
                    <td className="whitespace-nowrap p-3 text-muted-foreground">
                      {formatDate(r.subscription_end, lang)}
                    </td>
                    <td className="min-w-[250px] p-3 text-xs">
                      {(() => {
                        const u = usageByRestaurant.get(r.id);
                        const p = planByName.get(r.subscription_plan);
                        return <div className="space-y-1.5">
                          <UsageBar label={t("sa.stat.activeTables")} value={u?.tables_count ?? r.tableCount} limit={p?.max_tables ?? null} lang={lang} compact />
                          <UsageBar label={t("sa.stat.staff")} value={u?.active_staff ?? r.staffCount} limit={p?.max_staff ?? null} lang={lang} compact />
                          <UsageBar label={t("sa.stat.ordersMonth")} value={u?.orders_count ?? 0} limit={p?.max_monthly_orders ?? null} lang={lang} compact />
                        </div>;
                      })()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </>
        )}
      </section>
    </div>
  );
}


function UsageBar({ label, value, limit, lang, compact = false }: { label: string; value: number; limit: number | null | undefined; lang: "en" | "ar"; compact?: boolean }) {
  const capped = limit === null || limit === undefined ? 0 : Math.min(100, Math.round((value / Math.max(1, Number(limit))) * 100));
  const near = limit !== null && limit !== undefined && capped >= 80;
  return <div>
    <div className="flex items-center justify-between gap-3 text-[10px]">
      <span className="text-muted-foreground">{label}</span>
      <strong className={near ? "text-amber-700" : ""}>{formatNumber(value, lang)} / {limit === null || limit === undefined ? "∞" : formatNumber(Number(limit), lang)}</strong>
    </div>
    {!compact || (limit !== null && limit !== undefined) ? <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted"><div className={near ? "h-full rounded-full bg-amber-500" : "h-full rounded-full bg-[#ff5a0a]"} style={{ width: (limit === null || limit === undefined ? 4 : Math.max(2, capped)) + "%" }} /></div> : null}
  </div>;
}
