import { createFileRoute, Link } from "@tanstack/react-router";
import { Building2, ClipboardList, LayoutGrid, Users, Wallet, Bell } from "lucide-react";

import { StatCard } from "@/components/superadmin/StatCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useAuditLogs,
  usePlatformStats,
  useRestaurantsWithStats,
} from "@/hooks/useSuperAdmin";
import { useI18n } from "@/lib/i18n";
import { formatDateTime, formatMoney, formatNumber } from "@/lib/format";
import { healthOf } from "@/lib/health";
import { humanError } from "@/lib/errors";

export const Route = createFileRoute("/_authenticated/super-admin/")({
  head: () => ({
    meta: [
      { title: "Platform dashboard — QuickServe admin" },
      {
        name: "description",
        content:
          "Live QuickServe platform metrics: restaurants, orders, sales and staff across every tenant.",
      },
      { property: "og:title", content: "Platform dashboard — QuickServe admin" },
      {
        property: "og:description",
        content: "Monitor every restaurant on the QuickServe platform in real time.",
      },
    ],
  }),
  component: PlatformDashboard,
});

function PlatformDashboard() {
  const { t, lang } = useI18n();
  const stats = usePlatformStats();
  const restaurants = useRestaurantsWithStats();
  const activity = useAuditLogs({});

  const loading = stats.isPending;
  const s = stats.data;

  const attention = (restaurants.data ?? [])
    .map((r) => ({ restaurant: r, health: healthOf(r) }))
    .filter((x) => x.health.level !== "healthy");

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{t("sa.nav.dashboard")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("sa.rest.subtitle")}</p>
        </div>
        <Button asChild>
          <Link to="/super-admin/restaurants/new">{t("sa.rest.new")}</Link>
        </Button>
      </div>

      {stats.isError && (
        <div className="panel p-6">
          <p className="font-medium">{t("common.error")}</p>
          <p className="mt-1 text-sm text-muted-foreground">{humanError(stats.error, lang)}</p>
          <Button size="sm" className="mt-4" onClick={() => void stats.refetch()}>
            {t("common.retry")}
          </Button>
        </div>
      )}

      <section className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard
          label={t("sa.stat.totalRestaurants")}
          value={formatNumber(s?.restaurants, lang)}
          hint={`${formatNumber(s?.activeRestaurants, lang)} ${t("sa.status.active")} · ${formatNumber(s?.inactiveRestaurants, lang)} ${t("sa.status.inactive")}`}
          icon={<Building2 className="size-4" />}
          {...(loading ? { loading: true } : {})}
        />
        <StatCard
          label={t("sa.stat.ordersToday")}
          value={formatNumber(s?.ordersToday, lang)}
          hint={`${t("sa.stat.ordersWeek")}: ${formatNumber(s?.ordersWeek, lang)} · ${t("sa.stat.ordersMonth")}: ${formatNumber(s?.ordersMonth, lang)}`}
          icon={<ClipboardList className="size-4" />}
          {...(loading ? { loading: true } : {})}
        />
        <StatCard
          label={t("sa.stat.salesToday")}
          value={formatMoney(s?.salesToday, "SAR", lang)}
          hint={`${t("sa.stat.salesMonth")}: ${formatMoney(s?.salesMonth, "SAR", lang)}`}
          icon={<Wallet className="size-4" />}
          {...(loading ? { loading: true } : {})}
        />
        <StatCard
          label={t("sa.stat.staff")}
          value={formatNumber(s?.staff, lang)}
          hint={`${t("sa.stat.activeTables")}: ${formatNumber(s?.tables, lang)} · ${t("sa.stat.menuItems")}: ${formatNumber(s?.menuItems, lang)}`}
          icon={<Users className="size-4" />}
          {...(loading ? { loading: true } : {})}
        />
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="panel p-6">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">{t("sa.nav.restaurants")}</h2>
            <Button asChild variant="ghost" size="sm">
              <Link to="/super-admin/restaurants">{t("common.next")}</Link>
            </Button>
          </div>
          {restaurants.isPending ? (
            <div className="mt-4 space-y-3">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (restaurants.data ?? []).length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">{t("sa.rest.empty")}</p>
          ) : (
            <ul className="mt-4 divide-y">
              {(restaurants.data ?? []).slice(0, 6).map((r) => {
                const health = healthOf(r);
                return (
                  <li key={r.id} className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <Link
                        to="/super-admin/restaurants/$restaurantId"
                        params={{ restaurantId: r.id }}
                        className="truncate font-medium underline-offset-4 hover:underline"
                      >
                        {r.name}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {formatNumber(r.orderCount, lang)} {t("sa.rest.col.orders")} ·{" "}
                        {formatMoney(r.revenue, r.currency, lang)}
                      </p>
                    </div>
                    <Badge variant={health.level === "healthy" ? "secondary" : "outline"}>
                      {health.percent}%
                    </Badge>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="panel p-6">
          <h2 className="flex items-center gap-2 font-semibold">
            <Bell className="size-4" /> {t("sa.notifications")}
          </h2>
          {attention.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">{t("sa.notifications.empty")}</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {attention.slice(0, 6).map(({ restaurant, health }) => (
                <li key={restaurant.id} className="text-sm">
                  <Link
                    to="/super-admin/restaurants/$restaurantId"
                    params={{ restaurantId: restaurant.id }}
                    className="font-medium underline-offset-4 hover:underline"
                  >
                    {restaurant.name}
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    {health.missing.map((m) => (lang === "ar" ? m.labelAr : m.labelEn)).join(" · ")}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="panel p-6">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-semibold">
            <LayoutGrid className="size-4" /> {t("sa.activity")}
          </h2>
          <Button asChild variant="ghost" size="sm">
            <Link to="/super-admin/audit-logs">{t("sa.nav.audit")}</Link>
          </Button>
        </div>
        {(activity.data ?? []).length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">{t("sa.activity.empty")}</p>
        ) : (
          <ul className="mt-4 divide-y text-sm">
            {(activity.data ?? []).slice(0, 8).map((log) => (
              <li key={log.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  <span className="font-medium">{log.actor_name ?? "—"}</span>{" "}
                  <span className="text-muted-foreground">{log.action}</span>
                </span>
                <span className="text-xs text-muted-foreground">
                  {formatDateTime(log.created_at, lang)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
