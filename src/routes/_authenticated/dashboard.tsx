import { createFileRoute, Link } from "@tanstack/react-router";
import {
  BarChart3,
  ChevronRight,
  CircleDollarSign,
  Clock,
  QrCode,
  Receipt,
  Sparkles,
  Store,
  TrendingUp,
  Users,
  UtensilsCrossed,
} from "lucide-react";

import { AppHeader } from "@/components/nav/AppHeader";
import { Sparkline } from "@/components/common/Sparkline";
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
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
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
  const rid = scope.restaurantId;

  const metrics = [
    {
      label: lang === "ar" ? "مبيعات اليوم" : "Sales today",
      value: formatMoney(r?.salesToday ?? 0, currency, lang),
      icon: CircleDollarSign,
      series: (r?.series ?? []).map((d) => d.sales),
      tone: "accent" as const,
    },
    {
      label: lang === "ar" ? "طلبات اليوم" : "Orders today",
      value: formatNumber(r?.ordersToday ?? 0, lang),
      icon: Receipt,
      series: (r?.series ?? []).map((d) => d.orders),
      tone: "primary" as const,
    },
    {
      label: lang === "ar" ? "طلبات مفتوحة" : "Open orders",
      value: formatNumber(r?.openOrders ?? 0, lang),
      icon: Clock,
      series: (r?.series ?? []).map((d) => d.orders),
      tone: "success" as const,
    },
    {
      label: lang === "ar" ? "متوسط الطلب" : "Average order",
      value: formatMoney(r?.averageOrder ?? 0, currency, lang),
      icon: TrendingUp,
      series: (r?.series ?? []).map((d) => (d.orders ? d.sales / d.orders : 0)),
      tone: "accent" as const,
    },
  ];

  const actions = [
    {
      to: "/manage/$restaurantId" as const,
      params: rid ? { restaurantId: rid } : undefined,
      icon: UtensilsCrossed,
      label: lang === "ar" ? "محرّر القائمة" : "Menu editor",
    },
    {
      to: "/manage/$restaurantId/tables" as const,
      params: rid ? { restaurantId: rid } : undefined,
      icon: QrCode,
      label: lang === "ar" ? "الطاولات ورموز QR" : "Tables & QR",
    },
    {
      to: "/manage/$restaurantId/staff" as const,
      params: rid ? { restaurantId: rid } : undefined,
      icon: Users,
      label: lang === "ar" ? "الفريق" : "Team",
    },
    {
      to: "/manage/$restaurantId/analytics" as const,
      params: rid ? { restaurantId: rid } : undefined,
      icon: BarChart3,
      label: lang === "ar" ? "التحليلات" : "Analytics",
    },
  ].filter(() => Boolean(rid));

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto w-full max-w-5xl space-y-5 px-4 py-5 sm:px-6 sm:py-7">
        {/* Greeting banner */}
        <section className="relative overflow-hidden rounded-2xl bg-sidebar p-5 text-sidebar-foreground shadow-lift sm:p-6">
          <div className="absolute inset-0 opacity-70 [background:radial-gradient(75%_120%_at_100%_0%,color-mix(in_oklab,var(--color-accent)_28%,transparent),transparent_72%)]" />
          <div className="relative">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sidebar-primary">
              {t("nav.dashboard")}
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
              {scope.restaurantName ??
                (lang === "ar" ? "نظرة عامة على مساحة عملك" : "Your workspace overview")}
            </h1>
            <p className="mt-1.5 text-sm text-sidebar-foreground/80">
              {lang === "ar"
                ? "أرقام اليوم وآخر التذاكر في مكان واحد."
                : "Today's numbers and the latest tickets in one place."}
            </p>
            {rid ? (
              <Button asChild size="sm" variant="secondary" className="mt-4">
                <Link to="/manage/$restaurantId/orders" params={{ restaurantId: rid }}>
                  {lang === "ar" ? "الطلبات المباشرة" : "Live orders"}
                  <ChevronRight className="size-4" />
                </Link>
              </Button>
            ) : null}
          </div>
        </section>

        {/* KPIs */}
        {report.isPending && rid ? (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-32 rounded-2xl" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {metrics.map((m) => {
              const Icon = m.icon;
              return (
                <article key={m.label} className="panel flex flex-col p-4">
                  <span className="grid size-9 place-items-center rounded-2xl bg-accent/15">
                    <Icon className="size-[18px]" aria-hidden />
                  </span>
                  <p className="mt-2.5 truncate text-[11px] text-muted-foreground">{m.label}</p>
                  <p className="truncate text-lg font-semibold tabular-nums sm:text-xl">{m.value}</p>
                  <Sparkline values={m.series} tone={m.tone} className="mt-2 h-7" />
                </article>
              );
            })}
          </div>
        )}

        {/* Recent orders */}
        <section className="panel p-4 sm:p-5">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
            <h2 className="flex min-w-0 items-center gap-2 text-sm font-semibold">
              <Receipt className="size-4 shrink-0 text-accent-foreground" />
              <span className="truncate">{lang === "ar" ? "أحدث الطلبات" : "Recent orders"}</span>
            </h2>
            {rid ? (
              <Button asChild size="sm" variant="ghost" className="h-8 shrink-0">
                <Link to="/manage/$restaurantId/orders" params={{ restaurantId: rid }}>
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

        {/* Quick actions */}
        {actions.length ? (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold">
              {lang === "ar" ? "إجراءات سريعة" : "Quick actions"}
            </h2>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {actions.map((a) => {
                const Icon = a.icon;
                return (
                  <li key={a.label}>
                    <Link
                      to={a.to as never}
                      params={a.params as never}
                      className="panel flex h-full flex-col items-center gap-2 px-2 py-4 text-center transition-transform active:scale-[0.97]"
                    >
                      <span className="grid size-10 place-items-center rounded-2xl bg-accent/15">
                        <Icon className="size-[18px]" aria-hidden />
                      </span>
                      <span className="w-full truncate text-[11px] font-semibold">{a.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        {/* Workspaces */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold">{t("dash.workspaces")}</h2>

          {isPending && (
            <div className="grid gap-3 sm:grid-cols-2">
              {[0, 1].map((i) => (
                <Skeleton key={i} className="h-24 rounded-2xl" />
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

        {rid ? (
          <p className="flex items-center justify-center gap-2 pb-2 text-xs text-muted-foreground">
            <Sparkles className="size-3.5" aria-hidden />
            {lang === "ar"
              ? "نصيحة: خصّص تقاريرك من الصفحة الرئيسية."
              : "Tip: customize your report cards from Home."}
          </p>
        ) : null}
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
      <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-accent/15">
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
