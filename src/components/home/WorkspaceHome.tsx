import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  BarChart3,
  ChevronRight,
  CircleDollarSign,
  Clock,
  LayoutDashboard,
  QrCode,
  Receipt,
  Settings2,
  Sparkles,
  Store,
  TrendingUp,
  Trophy,
  Users,
  UtensilsCrossed,
} from "lucide-react";

import heroDish from "@/assets/hero-dish.jpg";
import { AppHeader } from "@/components/nav/AppHeader";
import { Sparkline } from "@/components/common/Sparkline";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspaceMembers, useWorkspaceReport, useWorkspaceScope } from "@/hooks/useWorkspace";
import { formatDateTime, formatMoney, formatNumber } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { ROLE_LABELS } from "@/lib/permissions";
import { cn } from "@/lib/utils";

type WidgetId =
  | "salesToday"
  | "ordersToday"
  | "openOrders"
  | "averageOrder"
  | "salesWeek"
  | "topItems"
  | "recentOrders";

const ALL_WIDGETS: WidgetId[] = [
  "salesToday",
  "ordersToday",
  "openOrders",
  "averageOrder",
  "salesWeek",
  "topItems",
  "recentOrders",
];

const LABELS: Record<WidgetId, { en: string; ar: string }> = {
  salesToday: { en: "Sales today", ar: "مبيعات اليوم" },
  ordersToday: { en: "Orders today", ar: "طلبات اليوم" },
  openOrders: { en: "Open orders", ar: "طلبات مفتوحة" },
  averageOrder: { en: "Average order", ar: "متوسط الطلب" },
  salesWeek: { en: "Sales, 7 days", ar: "مبيعات 7 أيام" },
  topItems: { en: "Top items", ar: "الأصناف الأكثر طلباً" },
  recentOrders: { en: "Recent orders", ar: "أحدث الطلبات" },
};

const STORAGE_KEY = "quickserve.home.widgets";

type Prefs = { order: WidgetId[]; off: WidgetId[] };
const DEFAULT_PREFS: Prefs = { order: ALL_WIDGETS, off: [] };

function loadPrefs(): Prefs {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<Prefs>;
    const order = (parsed.order ?? []).filter((id): id is WidgetId => ALL_WIDGETS.includes(id));
    const missing = ALL_WIDGETS.filter((id) => !order.includes(id));
    return {
      order: [...order, ...missing],
      off: (parsed.off ?? []).filter((id): id is WidgetId => ALL_WIDGETS.includes(id)),
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

/** Signed-in home: hero greeting, quick nav, team, reports and quick actions. */
export function WorkspaceHome() {
  const { lang } = useI18n();
  const scope = useWorkspaceScope();
  const report = useWorkspaceReport(scope.restaurantId);
  const members = useWorkspaceMembers(scope.restaurantId);
  const [name, setName] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [configuring, setConfiguring] = useState(false);
  const [selectedMember, setSelectedMember] = useState<string | null>(null);

  useEffect(() => {
    setPrefs(loadPrefs());
    void supabase.auth.getUser().then(({ data }) => {
      const meta = data.user?.user_metadata as { full_name?: string; name?: string } | undefined;
      setName(meta?.full_name || meta?.name || data.user?.email?.split("@")[0] || null);
    });
  }, []);

  function savePrefs(next: Prefs) {
    setPrefs(next);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }

  function toggle(id: WidgetId) {
    const off = prefs.off.includes(id) ? prefs.off.filter((x) => x !== id) : [...prefs.off, id];
    savePrefs({ ...prefs, off });
  }

  function move(id: WidgetId, delta: -1 | 1) {
    const order = [...prefs.order];
    const index = order.indexOf(id);
    const next = index + delta;
    if (index < 0 || next < 0 || next >= order.length) return;
    [order[index], order[next]] = [order[next]!, order[index]!];
    savePrefs({ ...prefs, order });
  }

  const visible = useMemo(() => prefs.order.filter((id) => !prefs.off.includes(id)), [prefs]);

  const greeting = lang === "ar" ? "مرحباً بعودتك" : "Welcome back";
  const data = report.data;
  const currency = scope.currency;
  const selected = (members.data ?? []).find((m) => m.id === selectedMember) ?? null;
  const rid = scope.restaurantId;

  const quickNav = [
    {
      to: "/dashboard" as const,
      params: undefined,
      icon: LayoutDashboard,
      label: lang === "ar" ? "لوحة التحكم" : "Dashboard",
    },
    {
      to: "/manage/$restaurantId" as const,
      params: rid ? { restaurantId: rid } : undefined,
      icon: UtensilsCrossed,
      label: lang === "ar" ? "القائمة" : "Menu",
    },
    {
      to: "/manage/$restaurantId/tables" as const,
      params: rid ? { restaurantId: rid } : undefined,
      icon: QrCode,
      label: lang === "ar" ? "الطاولات" : "Tables",
    },
    {
      to: "/manage/$restaurantId/analytics" as const,
      params: rid ? { restaurantId: rid } : undefined,
      icon: BarChart3,
      label: lang === "ar" ? "التحليلات" : "Analytics",
    },
  ].filter((item) => item.to === "/dashboard" || rid);

  const quickActions = [
    {
      to: "/manage/$restaurantId/orders" as const,
      params: rid ? { restaurantId: rid } : undefined,
      icon: Receipt,
      label: lang === "ar" ? "الطلبات المباشرة" : "Live orders",
      hint: lang === "ar" ? "تابع كل تذكرة" : "Track every ticket",
    },
    {
      to: "/manage/$restaurantId/staff" as const,
      params: rid ? { restaurantId: rid } : undefined,
      icon: Users,
      label: lang === "ar" ? "الفريق" : "Team",
      hint: lang === "ar" ? "الأعضاء والصلاحيات" : "Members & roles",
    },
    {
      to: "/manage/$restaurantId/design" as const,
      params: rid ? { restaurantId: rid } : undefined,
      icon: Sparkles,
      label: lang === "ar" ? "مصمّم القائمة" : "Menu designer",
      hint: lang === "ar" ? "قوالب احترافية" : "Pro templates",
    },
    {
      to: "/profile" as const,
      params: undefined,
      icon: Settings2,
      label: lang === "ar" ? "الإعدادات" : "Settings",
      hint: lang === "ar" ? "حسابك وهويتك" : "Account & brand",
    },
  ].filter((item) => item.to === "/profile" || rid);

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <div className="mx-auto w-full max-w-5xl space-y-5 px-4 py-5 sm:px-6 sm:py-7">
        {/* Hero */}
        <header className="panel relative overflow-hidden p-0">
          <div className="grid gap-0 sm:grid-cols-[minmax(0,1fr)_14rem]">
            <div className="relative p-5 sm:p-6">
              <div className="absolute inset-0 -z-10 opacity-70 [background:radial-gradient(90%_70%_at_0%_0%,color-mix(in_oklab,var(--color-accent)_22%,transparent),transparent_72%)]" />
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {lang === "ar" ? "مساحة العمل" : "Workspace"}
              </p>
              <h1 className="mt-2 text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">
                {greeting}
                {name ? `, ${name}` : ""}
              </h1>
              <p className="mt-1.5 text-sm text-muted-foreground">
                {scope.restaurantName
                  ? lang === "ar"
                    ? `أنت تدير ${scope.restaurantName} اليوم.`
                    : `You're running ${scope.restaurantName} today.`
                  : lang === "ar"
                    ? "لا يوجد مطعم مرتبط بحسابك بعد."
                    : "No restaurant is linked to your account yet."}
              </p>
              <dl className="mt-4 flex flex-wrap gap-2">
                <div className="rounded-full bg-surface px-3 py-1.5">
                  <dt className="inline text-[11px] text-muted-foreground">
                    {lang === "ar" ? "مبيعات اليوم" : "Sales today"}{" "}
                  </dt>
                  <dd className="inline text-xs font-bold tabular-nums">
                    {formatMoney(data?.salesToday ?? 0, currency, lang)}
                  </dd>
                </div>
                <div className="rounded-full bg-surface px-3 py-1.5">
                  <dt className="inline text-[11px] text-muted-foreground">
                    {lang === "ar" ? "طلبات مفتوحة" : "Open"}{" "}
                  </dt>
                  <dd className="inline text-xs font-bold tabular-nums">
                    {formatNumber(data?.openOrders ?? 0, lang)}
                  </dd>
                </div>
              </dl>
            </div>
            <div className="relative h-32 sm:h-auto">
              <img
                src={heroDish}
                alt=""
                loading="lazy"
                className="size-full object-cover"
                aria-hidden
              />
              <div className="absolute inset-0 bg-gradient-to-t from-card/80 via-card/10 to-transparent sm:bg-gradient-to-r sm:from-card sm:via-card/25 sm:to-transparent" />
            </div>
          </div>
        </header>

        {/* Quick nav */}
        <nav aria-label={lang === "ar" ? "تنقل سريع" : "Quick navigation"}>
          <ul className="grid grid-cols-4 gap-2 sm:gap-3">
            {quickNav.map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.label}>
                  <Link
                    to={item.to as never}
                    params={item.params as never}
                    className="panel flex h-full flex-col items-center gap-1.5 px-1 py-3 text-center transition-transform active:scale-[0.97]"
                  >
                    <span className="grid size-10 place-items-center rounded-2xl bg-accent/15 text-accent-foreground">
                      <Icon className="size-[18px]" aria-hidden />
                    </span>
                    <span className="w-full truncate text-[11px] font-semibold">{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Members */}
        <section className="panel p-4 sm:p-5">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
            <h2 className="flex min-w-0 items-center gap-2 text-sm font-semibold">
              <Users className="size-4 shrink-0 text-accent-foreground" />
              <span className="truncate">
                {lang === "ar" ? "أعضاء مساحة العمل" : "Workspace members"}
              </span>
            </h2>
            {rid ? (
              <Button asChild size="sm" variant="ghost" className="h-8 shrink-0">
                <Link to="/manage/$restaurantId/staff" params={{ restaurantId: rid }}>
                  {lang === "ar" ? "إدارة" : "Manage"}
                  <ChevronRight className="size-4" />
                </Link>
              </Button>
            ) : null}
          </div>
          {members.isPending && rid ? (
            <Skeleton className="mt-3 h-16 rounded-xl" />
          ) : (members.data ?? []).length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              {lang === "ar" ? "لا يوجد أعضاء بعد." : "No members yet."}
            </p>
          ) : (
            <>
              <ul className="no-scrollbar mt-3 flex gap-2 overflow-x-auto pb-1">
                {(members.data ?? []).map((m) => (
                  <li key={m.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedMember(m.id === selectedMember ? null : m.id)}
                      className={cn(
                        "flex w-[5.5rem] flex-col items-center gap-1 rounded-2xl border p-2 transition-colors",
                        m.id === selectedMember
                          ? "border-accent bg-accent/10"
                          : "border-border hover:bg-muted",
                      )}
                    >
                      <span className="grid size-9 place-items-center rounded-full bg-accent/20 text-sm font-bold">
                        {m.name?.slice(0, 1).toUpperCase() ?? "?"}
                      </span>
                      <span className="w-full truncate text-center text-[11px] font-semibold">
                        {m.name}
                      </span>
                      <span className="w-full truncate text-center text-[10px] text-muted-foreground">
                        {ROLE_LABELS[m.role][lang]}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              {selected ? (
                <div className="mt-3 rounded-xl border p-3 text-sm">
                  <p className="font-semibold">{selected.name}</p>
                  <p className="text-xs text-muted-foreground">{selected.email ?? "—"}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">{ROLE_LABELS[selected.role][lang]}</Badge>
                    <Badge variant={selected.is_active ? "outline" : "destructive"}>
                      {selected.is_active
                        ? lang === "ar"
                          ? "نشط"
                          : "Active"
                        : lang === "ar"
                          ? "معطّل"
                          : "Disabled"}
                    </Badge>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </section>

        {/* Reports */}
        <section className="space-y-3">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
            <h2 className="truncate text-sm font-semibold">
              {lang === "ar" ? "تقاريري" : "My reports"}
            </h2>
            <Button
              size="sm"
              variant="outline"
              className="shrink-0"
              onClick={() => setConfiguring((v) => !v)}
            >
              <Settings2 className="size-4" />
              {lang === "ar" ? "تخصيص" : "Customize"}
            </Button>
          </div>

          {configuring ? (
            <div className="panel divide-y p-2">
              {prefs.order.map((id, index) => (
                <div key={id} className="flex items-center gap-2 px-2 py-2">
                  <span className="min-w-0 flex-1 truncate text-sm">{LABELS[id][lang]}</span>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-8"
                    disabled={index === 0}
                    onClick={() => move(id, -1)}
                    aria-label="Move up"
                  >
                    <ArrowUp className="size-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-8"
                    disabled={index === prefs.order.length - 1}
                    onClick={() => move(id, 1)}
                    aria-label="Move down"
                  >
                    <ArrowDown className="size-4" />
                  </Button>
                  <Switch checked={!prefs.off.includes(id)} onCheckedChange={() => toggle(id)} />
                </div>
              ))}
            </div>
          ) : null}

          {report.isPending && rid ? (
            <div className="grid grid-cols-2 gap-3">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-28 rounded-2xl" />
              ))}
            </div>
          ) : visible.length === 0 ? (
            <p className="panel p-6 text-center text-sm text-muted-foreground">
              {lang === "ar" ? "كل التقارير مخفية." : "All reports are hidden."}
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {visible.map((id) => (
                <Widget
                  key={id}
                  id={id}
                  data={data}
                  currency={currency}
                  lang={lang}
                  restaurantId={rid}
                />
              ))}
            </div>
          )}
        </section>

        {/* Premium banner */}
        <section className="relative overflow-hidden rounded-2xl bg-sidebar p-5 text-sidebar-foreground shadow-lift">
          <div className="absolute inset-0 -z-0 opacity-70 [background:radial-gradient(70%_120%_at_100%_0%,color-mix(in_oklab,var(--color-accent)_30%,transparent),transparent_70%)]" />
          <div className="relative grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-sidebar-primary">
                <Sparkles className="size-3.5" aria-hidden />
                QuickServe Pro
              </p>
              <h2 className="mt-1.5 text-lg font-semibold">
                {lang === "ar" ? "وسّع مساحة عملك" : "Grow your workspace"}
              </h2>
              <p className="mt-1 text-sm text-sidebar-foreground/80">
                {lang === "ar"
                  ? "مقاعد أكثر، تحليلات أعمق، وقوالب قوائم احترافية."
                  : "More seats, deeper analytics and pro menu templates."}
              </p>
            </div>
            <Button asChild size="sm" variant="secondary" className="w-full sm:w-auto">
              <Link to="/">{lang === "ar" ? "عرض الخطط" : "See plans"}</Link>
            </Button>
          </div>
        </section>

        {/* Quick actions */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold">
            {lang === "ar" ? "إجراءات سريعة" : "Quick actions"}
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {quickActions.map((action) => {
              const Icon = action.icon;
              return (
                <li key={action.label}>
                  <Link
                    to={action.to as never}
                    params={action.params as never}
                    className="panel flex items-center gap-3 p-4 transition-transform active:scale-[0.99]"
                  >
                    <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-accent/15">
                      <Icon className="size-5" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{action.label}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {action.hint}
                      </span>
                    </span>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>

        {!rid ? (
          <p className="panel flex items-center gap-3 p-4 text-sm text-muted-foreground">
            <Store className="size-4 shrink-0" aria-hidden />
            {lang === "ar"
              ? "اطلب من مدير المنصة ربط مطعم بحسابك."
              : "Ask a platform admin to link a restaurant to your account."}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function Widget({
  id,
  data,
  currency,
  lang,
  restaurantId,
}: {
  id: WidgetId;
  data: ReturnType<typeof useWorkspaceReport>["data"];
  currency: string;
  lang: "en" | "ar";
  restaurantId: string | null;
}) {
  const label = LABELS[id][lang];

  if (id === "topItems") {
    return (
      <article className="panel col-span-2 p-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Trophy className="size-4 text-accent-foreground" />
          {label}
        </h3>
        {(data?.topItems ?? []).length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            {lang === "ar" ? "لا توجد بيانات بعد." : "No data yet."}
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {(data?.topItems ?? []).map((item) => (
              <li key={item.name} className="flex items-center gap-3">
                <span className="min-w-0 flex-1 truncate text-sm">{item.name}</span>
                <span className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-muted sm:w-24">
                  <span
                    className="block h-full rounded-full bg-accent"
                    style={{
                      width: `${Math.round(
                        (item.quantity / (data?.topItems[0]?.quantity || 1)) * 100,
                      )}%`,
                    }}
                  />
                </span>
                <span className="w-8 shrink-0 text-end text-sm font-semibold tabular-nums">
                  {item.quantity}
                </span>
              </li>
            ))}
          </ul>
        )}
      </article>
    );
  }

  if (id === "recentOrders") {
    return (
      <article className="panel col-span-2 p-4">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
          <h3 className="flex min-w-0 items-center gap-2 text-sm font-semibold">
            <Receipt className="size-4 shrink-0 text-accent-foreground" />
            <span className="truncate">{label}</span>
          </h3>
          {restaurantId ? (
            <Button asChild size="sm" variant="ghost" className="h-8 shrink-0">
              <Link to="/manage/$restaurantId/orders" params={{ restaurantId }}>
                {lang === "ar" ? "الكل" : "All"}
                <ChevronRight className="size-4" />
              </Link>
            </Button>
          ) : null}
        </div>
        {(data?.recent ?? []).length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            {lang === "ar" ? "لا توجد طلبات بعد." : "No orders yet."}
          </p>
        ) : (
          <ul className="mt-2 divide-y">
            {(data?.recent ?? []).map((o) => (
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
      </article>
    );
  }

  const metrics: Record<
    Exclude<WidgetId, "topItems" | "recentOrders">,
    { value: string; icon: typeof TrendingUp; series: number[]; tone: "primary" | "accent" | "success" }
  > = {
    salesToday: {
      value: formatMoney(data?.salesToday ?? 0, currency, lang),
      icon: CircleDollarSign,
      series: (data?.series ?? []).map((d) => d.sales),
      tone: "accent",
    },
    salesWeek: {
      value: formatMoney(data?.salesWeek ?? 0, currency, lang),
      icon: TrendingUp,
      series: (data?.series ?? []).map((d) => d.sales),
      tone: "success",
    },
    averageOrder: {
      value: formatMoney(data?.averageOrder ?? 0, currency, lang),
      icon: TrendingUp,
      series: (data?.series ?? []).map((d) => (d.orders ? d.sales / d.orders : 0)),
      tone: "primary",
    },
    ordersToday: {
      value: formatNumber(data?.ordersToday ?? 0, lang),
      icon: Receipt,
      series: (data?.series ?? []).map((d) => d.orders),
      tone: "accent",
    },
    openOrders: {
      value: formatNumber(data?.openOrders ?? 0, lang),
      icon: Clock,
      series: (data?.series ?? []).map((d) => d.orders),
      tone: "success",
    },
  };
  const metric = metrics[id as keyof typeof metrics];
  const Icon = metric.icon;

  return (
    <article className="panel flex flex-col p-4">
      <span className="grid size-9 place-items-center rounded-2xl bg-accent/15">
        <Icon className="size-[18px]" aria-hidden />
      </span>
      <p className="mt-2.5 truncate text-[11px] text-muted-foreground">{label}</p>
      <p className="truncate text-lg font-semibold tabular-nums sm:text-xl">{metric.value}</p>
      <Sparkline values={metric.series} tone={metric.tone} className="mt-2 h-7" />
    </article>
  );
}
