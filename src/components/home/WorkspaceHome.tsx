import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronRight,
  CircleDollarSign,
  Clock,
  Receipt,
  Settings2,
  Sparkles,
  TrendingUp,
  Trophy,
  Users,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useAccess } from "@/hooks/useSession";
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

/** Signed-in home: personalised greeting, team, and reports the user configures. */
export function WorkspaceHome() {
  const { lang } = useI18n();
  const access = useAccess();
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

  const visible = useMemo(
    () => prefs.order.filter((id) => !prefs.off.includes(id)),
    [prefs],
  );

  const greeting = lang === "ar" ? "مرحباً" : "Welcome back";
  const data = report.data;
  const currency = scope.currency;
  const selected = (members.data ?? []).find((m) => m.id === selectedMember) ?? null;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6 sm:px-6">
      <header className="panel relative overflow-hidden p-5 sm:p-6">
        <div className="absolute inset-0 -z-10 opacity-60 [background:radial-gradient(80%_60%_at_100%_0%,color-mix(in_oklab,var(--color-primary)_18%,transparent),transparent_70%)]" />
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          {lang === "ar" ? "مساحة العمل" : "Workspace"}
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
          {greeting}
          {name ? `, ${name}` : ""} 👋
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {scope.restaurantName
            ? lang === "ar"
              ? `أنت تدير ${scope.restaurantName} اليوم.`
              : `You're running ${scope.restaurantName} today.`
            : lang === "ar"
              ? "لا يوجد مطعم مرتبط بحسابك بعد."
              : "No restaurant is linked to your account yet."}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button asChild size="sm">
            <Link to="/dashboard">{lang === "ar" ? "لوحة التحكم" : "Dashboard"}</Link>
          </Button>
          {scope.restaurantId ? (
            <Button asChild size="sm" variant="outline">
              <Link to="/manage/$restaurantId" params={{ restaurantId: scope.restaurantId }}>
                {lang === "ar" ? "محرّر القائمة" : "Menu editor"}
              </Link>
            </Button>
          ) : null}
          {scope.restaurantId ? (
            <Button asChild size="sm" variant="outline">
              <Link to="/manage/$restaurantId/design" params={{ restaurantId: scope.restaurantId }}>
                <Sparkles className="size-4" />
                {lang === "ar" ? "مصمّم الذكاء الاصطناعي" : "AI designer"}
              </Link>
            </Button>
          ) : null}
        </div>
      </header>

      <section className="panel p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Users className="size-4 text-primary" />
            {lang === "ar" ? "أعضاء مساحة العمل" : "Workspace members"}
          </h2>
          {access.isSuperAdmin || scope.restaurantId ? (
            <Button asChild size="sm" variant="ghost" className="h-8">
              <Link
                to="/manage/$restaurantId/staff"
                params={{ restaurantId: scope.restaurantId ?? "" }}
                disabled={!scope.restaurantId}
              >
                {lang === "ar" ? "إدارة" : "Manage"}
                <ChevronRight className="size-4" />
              </Link>
            </Button>
          ) : null}
        </div>
        {members.isPending && scope.restaurantId ? (
          <Skeleton className="mt-3 h-14 rounded-lg" />
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
                      "flex w-24 flex-col items-center gap-1 rounded-xl border p-2 transition-colors",
                      m.id === selectedMember
                        ? "border-primary bg-primary/10"
                        : "border-border hover:bg-muted",
                    )}
                  >
                    <span className="grid size-9 place-items-center rounded-full bg-primary/15 text-sm font-semibold text-primary">
                      {m.name?.slice(0, 1).toUpperCase() ?? "?"}
                    </span>
                    <span className="w-full truncate text-center text-xs font-medium">{m.name}</span>
                    <span className="w-full truncate text-center text-[10px] text-muted-foreground">
                      {ROLE_LABELS[m.role][lang]}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {selected ? (
              <div className="mt-3 rounded-lg border p-3 text-sm">
                <p className="font-medium">{selected.name}</p>
                <p className="text-xs text-muted-foreground">{selected.email ?? "—"}</p>
                <div className="mt-2 flex items-center gap-2">
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

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold">
            {lang === "ar" ? "تقاريري" : "My reports"}
          </h2>
          <Button size="sm" variant="outline" onClick={() => setConfiguring((v) => !v)}>
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

        {report.isPending && scope.restaurantId ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-24 rounded-xl" />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <p className="panel p-6 text-center text-sm text-muted-foreground">
            {lang === "ar" ? "كل التقارير مخفية." : "All reports are hidden."}
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {visible.map((id) => (
              <Widget
                key={id}
                id={id}
                data={data}
                currency={currency}
                lang={lang}
                restaurantId={scope.restaurantId}
              />
            ))}
          </div>
        )}
      </section>
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
      <article className="panel p-4 sm:col-span-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Trophy className="size-4 text-primary" />
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
                <span className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
                  <span
                    className="block h-full rounded-full bg-primary"
                    style={{
                      width: `${Math.round(
                        (item.quantity / (data?.topItems[0]?.quantity || 1)) * 100,
                      )}%`,
                    }}
                  />
                </span>
                <span className="w-8 text-end text-sm font-semibold tabular-nums">
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
      <article className="panel p-4 sm:col-span-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Receipt className="size-4 text-primary" />
            {label}
          </h3>
          {restaurantId ? (
            <Button asChild size="sm" variant="ghost" className="h-8">
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
              <li key={o.id} className="flex items-center justify-between gap-3 py-2">
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
    { value: string; icon: typeof TrendingUp }
  > = {
    salesToday: { value: formatMoney(data?.salesToday ?? 0, currency, lang), icon: CircleDollarSign },
    salesWeek: { value: formatMoney(data?.salesWeek ?? 0, currency, lang), icon: TrendingUp },
    averageOrder: { value: formatMoney(data?.averageOrder ?? 0, currency, lang), icon: TrendingUp },
    ordersToday: { value: formatNumber(data?.ordersToday ?? 0, lang), icon: Receipt },
    openOrders: { value: formatNumber(data?.openOrders ?? 0, lang), icon: Clock },
  };
  const metric = metrics[id as keyof typeof metrics];
  const Icon = metric.icon;

  return (
    <article className="panel flex items-center gap-3 p-4">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
        <Icon className="size-5" />
      </span>
      <div className="min-w-0">
        <p className="truncate text-xs text-muted-foreground">{label}</p>
        <p className="truncate text-xl font-semibold tabular-nums">{metric.value}</p>
      </div>
    </article>
  );
}
