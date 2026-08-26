import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ChevronRight,
  CircleDollarSign,
  Clock,
  Receipt,
  Store,
  TrendingUp,
} from "lucide-react";

import { StaffHeader } from "@/components/staff/StaffHeader";
import { useAccess } from "@/hooks/useSession";
import { useWorkspaceReport, useWorkspaceScope } from "@/hooks/useWorkspace";
import { useI18n } from "@/lib/i18n";
import { ROLE_LABELS } from "@/lib/permissions";
import { formatDateTime, formatMoney, formatNumber } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — QuickServe" },
      {
        name: "description",
        content:
          "QuickServe dashboard: today's sales, live order status, recent tickets and every workspace you can open.",
      },
      { property: "og:title", content: "Dashboard — QuickServe" },
      {
        property: "og:description",
        content: "Sales, orders and workspace overview for your restaurants.",
      },
    ],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const { t, lang } = useI18n();
  const { data, isPending, isError, error, refetch, isSuperAdmin } = useAccess();
  const scope = useWorkspaceScope();
  const report = useWorkspaceReport(scope.restaurantId);
  const currency = scope.currency;
  const r = report.data;

  const metrics = [
    {
      label: lang === "ar" ? "مبيعات اليوم" : "Sales today",
      value: formatMoney(r?.salesToday ?? 0, currency, lang),
      icon: CircleDollarSign,
    },
    {
      label: lang === "ar" ? "طلبات اليوم" : "Orders today",
      value: formatNumber(r?.ordersToday ?? 0, lang),
      icon: Receipt,
    },
    {
      label: lang === "ar" ? "طلبات مفتوحة" : "Open orders",
      value: formatNumber(r?.openOrders ?? 0, lang),
      icon: Clock,
    },
    {
      label: lang === "ar" ? "متوسط الطلب" : "Average order",
      value: formatMoney(r?.averageOrder ?? 0, currency, lang),
      icon: TrendingUp,
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <StaffHeader title={t("nav.dashboard")} />
      <main className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6 sm:px-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("nav.dashboard")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {scope.restaurantName ??
              (lang === "ar" ? "نظرة عامة على مساحة عملك" : "Overview of your workspace")}
          </p>
        </div>

        {report.isPending && scope.restaurantId ? (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-24 rounded-xl" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {metrics.map((m) => {
              const Icon = m.icon;
              return (
                <article key={m.label} className="panel p-4">
                  <span className="grid size-9 place-items-center rounded-xl bg-primary/10 text-primary">
                    <Icon className="size-4" />
                  </span>
                  <p className="mt-3 truncate text-xs text-muted-foreground">{m.label}</p>
                  <p className="truncate text-lg font-semibold tabular-nums sm:text-xl">{m.value}</p>
                </article>
              );
            })}
          </div>
        )}

        <section className="panel p-4 sm:p-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Receipt className="size-4 text-primary" />
              {lang === "ar" ? "أحدث الطلبات" : "Recent orders"}
            </h2>
            {scope.restaurantId ? (
              <Button asChild size="sm" variant="ghost" className="h-8">
                <Link
                  to="/manage/$restaurantId/orders"
                  params={{ restaurantId: scope.restaurantId }}
                >
                  {lang === "ar" ? "الكل" : "All"}
                  <ChevronRight className="size-4" />
                </Link>
              </Button>
            ) : null}
          </div>
          {(r?.recent ?? []).length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              {lang === "ar" ? "لا توجد طلبات بعد." : "No orders yet."}
            </p>
          ) : (
            <ul className="mt-2 divide-y">
              {(r?.recent ?? []).map((o) => (
                <li key={o.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold tabular-nums">{o.order_number}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {o.table ? `${lang === "ar" ? "طاولة" : "Table"} ${o.table} · ` : ""}
                      {formatDateTime(o.created_at, lang)}
                    </p>
                  </div>
                  <div className="shrink-0 text-end">
                    <p className="text-sm font-semibold">{formatMoney(o.total, currency, lang)}</p>
                    <Badge variant="secondary" className="mt-1 text-[10px]">
                      {o.status}
                    </Badge>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold">{t("dash.workspaces")}</h2>

          {isPending && (
            <div className="grid gap-3 sm:grid-cols-2">
              {[0, 1].map((i) => (
                <Skeleton key={i} className="h-24 rounded-xl" />
              ))}
            </div>
          )}

          {isError && (
            <div className="panel p-5">
              <p className="font-medium">{t("common.error")}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {error instanceof Error ? error.message : ""}
              </p>
              <Button className="mt-4" size="sm" onClick={() => refetch()}>
                {t("common.retry")}
              </Button>
            </div>
          )}

          {!isPending && !isError && (
            <div className="grid gap-3 sm:grid-cols-2">
              {isSuperAdmin && (
                <WorkspaceCard
                  role={ROLE_LABELS.super_admin[lang]}
                  title={lang === "ar" ? "منصة QuickServe" : "QuickServe platform"}
                  to="/super-admin"
                  cta={t("dash.open")}
                />
              )}

              {(data ?? [])
                .filter((m) => m.role !== "super_admin")
                .map((m) =>
                  (m.role === "restaurant_admin" || m.role === "manager") && m.restaurant_id ? (
                    <WorkspaceCard
                      key={m.id}
                      role={ROLE_LABELS[m.role][lang]}
                      title={m.restaurant?.name ?? ""}
                      to="/manage/$restaurantId"
                      params={{ restaurantId: m.restaurant_id }}
                      cta={lang === "ar" ? "محرّر القائمة" : "Menu editor"}
                    />
                  ) : (
                    <WorkspaceCard
                      key={m.id}
                      role={ROLE_LABELS[m.role][lang]}
                      title={m.restaurant?.name ?? ""}
                      to="/kitchen"
                      cta={t("dash.open")}
                    />
                  ),
                )}

              {!isSuperAdmin && (data ?? []).length === 0 && (
                <div className="panel p-5 sm:col-span-2">
                  <p className="font-medium">{t("dash.noAccess")}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{t("dash.noAccessHelp")}</p>
                </div>
              )}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function WorkspaceCard({
  role,
  title,
  to,
  params,
  cta,
}: {
  role: string;
  title: string;
  to: string;
  params?: Record<string, string>;
  cta: string;
}) {
  return (
    <article className="panel flex items-center gap-3 p-4">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
        <Store className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {role}
        </p>
        <p className="truncate text-sm font-semibold">{title}</p>
      </div>
      <Button asChild size="sm" variant="outline" className="shrink-0">
        <Link to={to as never} params={params as never}>
          {cta}
        </Link>
      </Button>
    </article>
  );
}
