import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useState } from "react";

import { StatCard } from "@/components/superadmin/StatCard";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useRestaurant } from "@/hooks/useSuperAdmin";
import { useI18n } from "@/lib/i18n";
import { formatDate, formatMoney, formatNumber, startOfTodayIso } from "@/lib/format";
import { onboardingSteps } from "@/lib/health";
import { humanError } from "@/lib/errors";
import { logAudit } from "@/lib/audit";

export const Route = createFileRoute("/_authenticated/super-admin/restaurants/$restaurantId/")({
  head: () => ({
    meta: [
      { title: "Restaurant overview — QuickServe admin" },
      {
        name: "description",
        content:
          "Tenant overview: orders, revenue, tables, staff, onboarding progress and activation controls.",
      },
      { property: "og:title", content: "Restaurant overview — QuickServe admin" },
      {
        property: "og:description",
        content: "Live metrics and setup progress for a QuickServe restaurant.",
      },
    ],
  }),
  component: RestaurantOverview,
});

function RestaurantOverview() {
  const { restaurantId } = Route.useParams();
  const { t, lang } = useI18n();
  const queryClient = useQueryClient();
  const restaurant = useRestaurant(restaurantId);
  const [confirm, setConfirm] = useState<null | "archive" | "restore" | "toggle">(null);

  const metrics = useQuery({
    queryKey: ["platform", "restaurant-metrics", restaurantId],
    queryFn: async () => {
      const today = startOfTodayIso();
      const [orders, tables, staff, products, calls] = await Promise.all([
        supabase.from("orders").select("total, status, created_at").eq("restaurant_id", restaurantId),
        supabase
          .from("restaurant_tables")
          .select("id", { count: "exact", head: true })
          .eq("restaurant_id", restaurantId)
          .eq("is_active", true),
        supabase
          .from("staff")
          .select("id", { count: "exact", head: true })
          .eq("restaurant_id", restaurantId)
          .eq("is_active", true),
        supabase
          .from("menu_items")
          .select("id", { count: "exact", head: true })
          .eq("restaurant_id", restaurantId),
        supabase
          .from("waiter_calls")
          .select("id", { count: "exact", head: true })
          .eq("restaurant_id", restaurantId)
          .gte("created_at", today),
      ]);
      if (orders.error) throw orders.error;
      const live = (orders.data ?? []).filter((o) => o.status !== "cancelled");
      return {
        orders: live.length,
        ordersToday: live.filter((o) => o.created_at >= today).length,
        revenue: live.reduce((acc, o) => acc + Number(o.total ?? 0), 0),
        tables: tables.count ?? 0,
        staff: staff.count ?? 0,
        products: products.count ?? 0,
        calls: calls.count ?? 0,
      };
    },
  });

  const r = restaurant.data;
  const m = metrics.data;

  const steps = r
    ? onboardingSteps({
        productCount: m?.products ?? 0,
        tableCount: m?.tables ?? 0,
        staffCount: m?.staff ?? 0,
        is_active: r.is_active,
        archived_at: r.archived_at,
        logo_url: r.logo_url,
      })
    : [];
  const donePercent = steps.length
    ? Math.round((steps.filter((s) => s.done).length / steps.length) * 100)
    : 0;

  async function apply(action: "archive" | "restore" | "toggle") {
    if (!r) return;
    try {
      const patch =
        action === "archive"
          ? { archived_at: new Date().toISOString(), is_active: false }
          : action === "restore"
            ? { archived_at: null, is_active: true }
            : { is_active: !r.is_active };
      const { error } = await supabase.from("restaurants").update(patch).eq("id", r.id);
      if (error) throw error;
      await logAudit(
        action === "archive"
          ? "restaurant.archived"
          : action === "restore"
            ? "restaurant.restored"
            : r.is_active
              ? "restaurant.deactivated"
              : "restaurant.activated",
        { restaurantId: r.id, entity: "restaurants", entityId: r.id },
      );
      await queryClient.invalidateQueries({ queryKey: ["platform"] });
      toast.success(t("common.saved"));
    } catch (error) {
      toast.error(humanError(error, lang));
    } finally {
      setConfirm(null);
    }
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={t("sa.rest.col.orders")}
          value={formatNumber(m?.orders, lang)}
          hint={`${t("sa.stat.ordersToday")}: ${formatNumber(m?.ordersToday, lang)}`}
          {...(metrics.isPending ? { loading: true } : {})}
        />
        <StatCard
          label={t("sa.stat.salesMonth")}
          value={formatMoney(m?.revenue, r?.currency ?? "JOD", lang)}
          {...(metrics.isPending ? { loading: true } : {})}
        />
        <StatCard
          label={t("sa.stat.activeTables")}
          value={formatNumber(m?.tables, lang)}
          hint={`${t("sa.stat.menuItems")}: ${formatNumber(m?.products, lang)}`}
          {...(metrics.isPending ? { loading: true } : {})}
        />
        <StatCard
          label={t("sa.stat.staff")}
          value={formatNumber(m?.staff, lang)}
          hint={`${t("sa.stat.waiterCalls")}: ${formatNumber(m?.calls, lang)}`}
          {...(metrics.isPending ? { loading: true } : {})}
        />
      </section>

      <section className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <div className="panel p-6">
          <h2 className="font-semibold">{t("sa.detail.onboarding")}</h2>
          <Progress className="mt-3" value={donePercent} />
          <ul className="mt-4 space-y-2 text-sm">
            {steps.map((s) => (
              <li key={s.key} className="flex items-center justify-between gap-3">
                <span>{lang === "ar" ? s.labelAr : s.labelEn}</span>
                <Badge variant={s.done ? "secondary" : "outline"}>
                  {s.done ? t("sa.detail.completed") : t("sa.detail.missing")}
                </Badge>
              </li>
            ))}
          </ul>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button asChild size="sm" variant="outline">
              <Link to="/super-admin/restaurants/$restaurantId/menu" params={{ restaurantId }}>
                {t("sa.created.menu")}
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link to="/super-admin/restaurants/$restaurantId/tables" params={{ restaurantId }}>
                {t("sa.created.tables")}
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link to="/super-admin/restaurants/$restaurantId/staff" params={{ restaurantId }}>
                {t("sa.staff.new")}
              </Link>
            </Button>
          </div>
        </div>

        <div className="panel space-y-4 p-6">
          <h2 className="font-semibold">{t("sa.detail.overview")}</h2>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <Row label={t("sa.field.email")} value={r?.email ?? "—"} />
            <Row label={t("sa.field.phone")} value={r?.phone ?? "—"} />
            <Row label={t("sa.field.currency")} value={r?.currency ?? "—"} />
            <Row label={t("sa.field.timezone")} value={r?.timezone ?? "—"} />
            <Row label={t("sa.field.tax")} value={`${r?.tax_rate ?? 0}%`} />
            <Row label={t("sa.field.service")} value={`${r?.service_charge ?? 0}%`} />
            <Row label={t("sa.subs.plan")} value={r?.subscription_plan ?? "—"} />
            <Row label={t("sa.field.subStatus")} value={r?.subscription_status ?? "—"} />
            <Row label={t("sa.subs.start")} value={formatDate(r?.subscription_start, lang)} />
            <Row label={t("sa.subs.end")} value={formatDate(r?.subscription_end, lang)} />
          </dl>

          <div className="flex flex-wrap gap-2 border-t pt-4">
            <Button size="sm" variant="outline" onClick={() => setConfirm("toggle")}>
              {r?.is_active ? t("sa.detail.deactivate") : t("sa.detail.activate")}
            </Button>
            {r?.archived_at ? (
              <Button size="sm" variant="outline" onClick={() => setConfirm("restore")}>
                {t("sa.detail.restore")}
              </Button>
            ) : (
              <Button size="sm" variant="destructive" onClick={() => setConfirm("archive")}>
                {t("sa.detail.archive")}
              </Button>
            )}
          </div>
        </div>
      </section>

      <AlertDialog open={confirm !== null} onOpenChange={(open) => !open && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("common.dangerZone")}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === "archive"
                ? lang === "ar"
                  ? "سيتم أرشفة المطعم وإيقاف الطلبات. تبقى البيانات محفوظة ويمكن الاستعادة."
                  : "The restaurant will be archived and ordering stops. Data is preserved and can be restored."
                : confirm === "restore"
                  ? lang === "ar"
                    ? "سيتم استعادة المطعم وتنشيطه."
                    : "The restaurant will be restored and activated."
                  : lang === "ar"
                    ? "سيتم تغيير حالة تنشيط المطعم."
                    : "The restaurant activation status will change."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void apply(confirm ?? "toggle")}>
              {t("common.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium capitalize">{value}</dd>
    </div>
  );
}
