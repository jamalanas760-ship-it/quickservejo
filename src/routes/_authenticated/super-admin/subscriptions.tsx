import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CreditCard, Gauge, Store, UsersRound } from "lucide-react";
import { toast } from "sonner";

import { MasterEyebrow, MasterKpi, MasterPageHeader, MasterSection, MasterStatus } from "@/components/app/MasterPage";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
      { name: "description", content: "Review plan limits and change the subscription plan or status of any restaurant." },
    ],
  }),
  component: SubscriptionsPage,
});

const PLANS: SubscriptionPlan[] = ["free", "basic", "professional", "enterprise"];
const STATUSES = ["trialing", "active", "past_due", "cancelled", "suspended"];

function SubscriptionsPage() {
  const { t, lang, pick } = useI18n();
  const ar = lang === "ar";
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

  async function update(id: string, patch: { subscription_plan?: SubscriptionPlan; subscription_status?: string }) {
    try {
      const { error } = await supabase.from("restaurants").update(patch as never).eq("id", id);
      if (error) throw error;
      await logAudit("plan.updated", { restaurantId: id, entity: "restaurants", entityId: id, metadata: patch });
      await queryClient.invalidateQueries({ queryKey: ["platform"] });
      toast.success(t("common.saved"));
    } catch (error) {
      toast.error(humanError(error, lang));
    }
  }

  const rows = restaurants.data ?? [];
  const active = rows.filter((r) => r.subscription_status === "active").length;
  const trialing = rows.filter((r) => r.subscription_status === "trialing").length;
  const atRisk = rows.filter((r) => r.subscription_status === "past_due" || r.subscription_status === "suspended").length;
  const monthlyPlanValue = rows.reduce((sum, r) => sum + Number(planByName.get(r.subscription_plan)?.price_monthly ?? 0), 0);
  const limit = (value: number | null) => value === null ? t("sa.subs.unlimited") : formatNumber(value, lang);

  return (
    <div className="space-y-5">
      <MasterPageHeader
        eyebrow={<MasterEyebrow icon={CreditCard}>{ar ? "الفوترة والخطط" : "Billing & plans"}</MasterEyebrow>}
        title={t("sa.subs.title")}
        description={ar ? "تحكم واضح بالخطط، الحالة، وحدود الاستخدام لكل مطعم." : "A clear control center for tenant plans, billing status and usage limits."}
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MasterKpi icon={Store} label={ar ? "كل المطاعم" : "Restaurants"} value={rows.length} tone="slate" />
        <MasterKpi icon={CreditCard} label={ar ? "اشتراكات نشطة" : "Active subscriptions"} value={active} tone="green" />
        <MasterKpi icon={UsersRound} label={ar ? "فترة تجريبية" : "Trialing"} value={trialing} tone="blue" />
        <MasterKpi icon={Gauge} label={ar ? "قيمة الخطط الشهرية" : "Monthly plan value"} value={formatMoney(monthlyPlanValue, "JOD", lang)} hint={atRisk ? (ar ? `${atRisk} تحتاج متابعة` : `${atRisk} need attention`) : (ar ? "لا توجد حالات متعثرة" : "No accounts at risk")} tone={atRisk ? "orange" : "purple"} />
      </section>

      <MasterSection title={t("sa.subs.plans")} description={ar ? "حدود ومزايا كل خطة متاحة." : "Plan limits and capabilities at a glance."}>
        {plans.isPending ? <Skeleton className="h-52 rounded-2xl" /> : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {(plans.data ?? []).map((p) => (
              <article key={p.plan} className="rounded-2xl border border-border/85 bg-muted/20 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div><p className="text-sm font-bold">{pick(p.name_en, p.name_ar)}</p><p className="mt-1 font-display text-2xl font-bold tracking-[-.04em]">{formatMoney(p.price_monthly, "JOD", lang)}</p></div>
                  <MasterStatus tone={p.plan === "enterprise" ? "purple" : p.plan === "professional" ? "orange" : "slate"}>{p.plan}</MasterStatus>
                </div>
                <div className="mt-4 space-y-2 text-xs">
                  <PlanLine label={t("sa.stat.activeTables")} value={limit(p.max_tables)} />
                  <PlanLine label={t("sa.stat.menuItems")} value={limit(p.max_products)} />
                  <PlanLine label={t("sa.stat.staff")} value={limit(p.max_staff)} />
                  <PlanLine label={t("sa.stat.ordersMonth")} value={limit(p.max_monthly_orders)} />
                </div>
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {p.analytics_enabled ? <Badge variant="secondary">{t("sa.nav.analytics")}</Badge> : null}
                  {p.custom_branding ? <Badge variant="secondary">{t("sa.wizard.branding")}</Badge> : null}
                  {p.ai_features ? <Badge variant="secondary">AI</Badge> : null}
                </div>
              </article>
            ))}
          </div>
        )}
      </MasterSection>

      <MasterSection title={t("sa.subs.usage")} description={ar ? "الخطة والحالة والاستخدام الفعلي لكل مطعم." : "Plan, status and real usage for every tenant."}>
        {restaurants.isPending ? <Skeleton className="h-80 rounded-2xl" /> : (
          <>
            <div className="grid gap-3 md:hidden">
              {rows.map((r) => {
                const u = usageByRestaurant.get(r.id);
                const p = planByName.get(r.subscription_plan);
                return <article key={r.id} className="rounded-2xl border border-border/85 bg-card p-4">
                  <div className="flex items-start justify-between gap-3"><div><strong className="block truncate">{r.name}</strong><p className="mt-1 text-[10px] text-muted-foreground">{formatDate(r.subscription_start, lang)} → {formatDate(r.subscription_end, lang)}</p></div><MasterStatus tone={statusTone(r.subscription_status)}>{r.subscription_status}</MasterStatus></div>
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <Select value={r.subscription_plan} onValueChange={(v) => void update(r.id, { subscription_plan: v as SubscriptionPlan })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{PLANS.map((pName) => <SelectItem key={pName} value={pName}>{pName}</SelectItem>)}</SelectContent></Select>
                    <Select value={r.subscription_status} onValueChange={(v) => void update(r.id, { subscription_status: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select>
                  </div>
                  <div className="mt-4 space-y-3">
                    <UsageBar label={t("sa.stat.activeTables")} value={u?.tables_count ?? r.tableCount} limit={p?.max_tables ?? null} lang={lang} />
                    <UsageBar label={t("sa.stat.menuItems")} value={u?.menu_items_count ?? r.productCount} limit={p?.max_products ?? null} lang={lang} />
                    <UsageBar label={t("sa.stat.staff")} value={u?.active_staff ?? r.staffCount} limit={p?.max_staff ?? null} lang={lang} />
                    <UsageBar label={t("sa.stat.ordersMonth")} value={u?.orders_count ?? 0} limit={p?.max_monthly_orders ?? null} lang={lang} />
                  </div>
                </article>;
              })}
            </div>

            <div className="hidden overflow-x-auto md:block">
              <table className="qs-table min-w-[960px]">
                <thead><tr><th>{t("sa.rest.col.restaurant")}</th><th>{t("sa.subs.plan")}</th><th>{t("sa.field.subStatus")}</th><th>{ar ? "الفترة" : "Period"}</th><th>{t("sa.subs.usage")}</th></tr></thead>
                <tbody>
                  {rows.map((r) => {
                    const u = usageByRestaurant.get(r.id);
                    const p = planByName.get(r.subscription_plan);
                    return <tr key={r.id}>
                      <td className="font-semibold">{r.name}</td>
                      <td><Select value={r.subscription_plan} onValueChange={(v) => void update(r.id, { subscription_plan: v as SubscriptionPlan })}><SelectTrigger className="w-40"><SelectValue /></SelectTrigger><SelectContent>{PLANS.map((pName) => <SelectItem key={pName} value={pName}>{pName}</SelectItem>)}</SelectContent></Select></td>
                      <td><Select value={r.subscription_status} onValueChange={(v) => void update(r.id, { subscription_status: v })}><SelectTrigger className="w-40"><SelectValue /></SelectTrigger><SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></td>
                      <td className="whitespace-nowrap text-xs text-muted-foreground">{formatDate(r.subscription_start, lang)} → {formatDate(r.subscription_end, lang)}</td>
                      <td className="min-w-[300px]"><div className="space-y-2"><UsageBar label={t("sa.stat.activeTables")} value={u?.tables_count ?? r.tableCount} limit={p?.max_tables ?? null} lang={lang} compact /><UsageBar label={t("sa.stat.staff")} value={u?.active_staff ?? r.staffCount} limit={p?.max_staff ?? null} lang={lang} compact /><UsageBar label={t("sa.stat.ordersMonth")} value={u?.orders_count ?? 0} limit={p?.max_monthly_orders ?? null} lang={lang} compact /></div></td>
                    </tr>;
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </MasterSection>
    </div>
  );
}

function PlanLine({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between gap-3"><span className="text-muted-foreground">{label}</span><strong>{value}</strong></div>;
}

function statusTone(status: string): "green" | "blue" | "orange" | "red" | "slate" {
  if (status === "active") return "green";
  if (status === "trialing") return "blue";
  if (status === "past_due") return "orange";
  if (status === "suspended" || status === "cancelled") return "red";
  return "slate";
}

function UsageBar({ label, value, limit, lang, compact = false }: { label: string; value: number; limit: number | null | undefined; lang: "en" | "ar"; compact?: boolean }) {
  const capped = limit === null || limit === undefined ? 0 : Math.min(100, Math.round((value / Math.max(1, Number(limit))) * 100));
  const near = limit !== null && limit !== undefined && capped >= 80;
  return <div>
    <div className="flex items-center justify-between gap-3 text-[10px]"><span className="text-muted-foreground">{label}</span><strong className={near ? "text-amber-700" : ""}>{formatNumber(value, lang)} / {limit === null || limit === undefined ? "∞" : formatNumber(Number(limit), lang)}</strong></div>
    {!compact || (limit !== null && limit !== undefined) ? <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted"><div className={near ? "h-full rounded-full bg-amber-500" : "h-full rounded-full bg-[#e85d2a]"} style={{ width: (limit === null || limit === undefined ? 4 : Math.max(2, capped)) + "%" }} /></div> : null}
  </div>;
}
