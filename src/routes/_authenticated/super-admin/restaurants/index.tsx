import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Download, Grid2X2, List, PackageSearch } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useRestaurantsWithStats } from "@/hooks/useSuperAdmin";
import { useI18n } from "@/lib/i18n";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import { healthOf } from "@/lib/health";
import { humanError } from "@/lib/errors";

export const Route = createFileRoute("/_authenticated/super-admin/restaurants/")({
  head: () => ({
    meta: [
      { title: "Restaurants — QuickServe admin" },
      {
        name: "description",
        content:
          "Search, filter and manage every restaurant tenant on the QuickServe platform, with setup and ERP health at a glance.",
      },
      { property: "og:title", content: "Restaurants — QuickServe admin" },
      {
        property: "og:description",
        content: "All QuickServe restaurant tenants, subscriptions, onboarding and back-office attention signals.",
      },
    ],
  }),
  component: RestaurantsPage,
});

const PAGE_SIZE = 12;

type ViewMode = "grid" | "table";

function csvCell(value: unknown) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function RestaurantsPage() {
  const { t, lang } = useI18n();
  const ar = lang === "ar";
  const { data, isPending, isError, error, refetch } = useRestaurantsWithStats();

  const [term, setTerm] = useState("");
  const [status, setStatus] = useState("all");
  const [plan, setPlan] = useState("all");
  const [subStatus, setSubStatus] = useState("all");
  const [view, setView] = useState<ViewMode>("grid");
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    const needle = term.trim().toLowerCase();
    return (data ?? []).filter((r) => {
      if (needle) {
        const haystack = [r.name, r.slug, r.email, r.phone, r.address_en, r.address_ar]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      if (status === "active" && (!r.is_active || r.archived_at)) return false;
      if (status === "inactive" && (r.is_active || r.archived_at)) return false;
      if (status === "archived" && !r.archived_at) return false;
      if (plan !== "all" && r.subscription_plan !== plan) return false;
      if (subStatus !== "all" && r.subscription_status !== subStatus) return false;
      return true;
    });
  }, [data, term, status, plan, subStatus]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pageCount - 1);
  const rows = filtered.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE);
  const activeVisible = filtered.filter((r) => r.is_active && !r.archived_at).length;
  const lowStockRestaurants = filtered.filter((r) => r.lowStockCount > 0).length;
  const healthySetup = filtered.filter((r) => healthOf(r).level === "healthy").length;

  function exportCsv() {
    if (!filtered.length || typeof document === "undefined") return;
    const header = ["Restaurant", "Slug", "Status", "Plan", "Subscription", "Orders", "Revenue", "Currency", "Low stock", "Onboarding health"];
    const body = filtered.map((r) => {
      const health = healthOf(r);
      const state = r.archived_at ? "archived" : r.is_active ? "active" : "inactive";
      return [r.name, r.slug, state, r.subscription_plan, r.subscription_status, r.orderCount, r.revenue, r.currency, r.lowStockCount, `${health.percent}%`];
    });
    const csv = [header, ...body].map((line) => line.map(csvCell).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `quickserve-restaurants-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6" dir={ar ? "rtl" : "ltr"}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{t("sa.rest.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {ar ? "مركز تحكم للمطاعم، الاشتراكات، الجاهزية وتنبيهات المكتب الخلفي." : "A command center for restaurants, subscriptions, readiness, and back-office attention."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={exportCsv} disabled={!filtered.length}>
            <Download className="size-4" />
            {ar ? "تصدير CSV" : "Export CSV"}
          </Button>
          <div className="flex rounded-lg border bg-card p-1" aria-label={ar ? "طريقة العرض" : "View mode"}>
            <Button size="sm" variant={view === "grid" ? "secondary" : "ghost"} aria-pressed={view === "grid"} onClick={() => setView("grid")}>
              <Grid2X2 className="size-4" />
              <span className="sr-only">{ar ? "شبكة" : "Grid"}</span>
            </Button>
            <Button size="sm" variant={view === "table" ? "secondary" : "ghost"} aria-pressed={view === "table"} onClick={() => setView("table")}>
              <List className="size-4" />
              <span className="sr-only">{ar ? "جدول" : "Table"}</span>
            </Button>
          </div>
          <Button asChild>
            <Link to="/super-admin/restaurants/new">{t("sa.rest.new")}</Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label={ar ? "المطاعم الظاهرة" : "Visible restaurants"} value={filtered.length} loading={isPending} />
        <Metric label={ar ? "نشطة" : "Active"} value={activeVisible} loading={isPending} />
        <Metric label={ar ? "تحتاج انتباه مخزون" : "Stock attention"} value={lowStockRestaurants} loading={isPending} />
        <Metric label={ar ? "جاهزة بالكامل" : "Setup healthy"} value={healthySetup} loading={isPending} />
      </div>

      <div className="grid gap-3 md:grid-cols-[2fr_1fr_1fr_1fr]">
        <Input
          value={term}
          onChange={(e) => {
            setTerm(e.target.value);
            setPage(0);
          }}
          placeholder={t("sa.rest.searchPlaceholder")}
          aria-label={t("common.search")}
        />
        <Select
          value={status}
          onValueChange={(v) => {
            setStatus(v);
            setPage(0);
          }}
        >
          <SelectTrigger aria-label={t("sa.filter.status")}>
            <SelectValue placeholder={t("sa.filter.status")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("sa.filter.all")}</SelectItem>
            <SelectItem value="active">{t("sa.status.active")}</SelectItem>
            <SelectItem value="inactive">{t("sa.status.inactive")}</SelectItem>
            <SelectItem value="archived">{t("sa.status.archived")}</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={plan}
          onValueChange={(v) => {
            setPlan(v);
            setPage(0);
          }}
        >
          <SelectTrigger aria-label={t("sa.filter.plan")}>
            <SelectValue placeholder={t("sa.filter.plan")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("sa.filter.all")}</SelectItem>
            {["free", "basic", "professional", "enterprise"].map((p) => (
              <SelectItem key={p} value={p}>{p}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={subStatus}
          onValueChange={(v) => {
            setSubStatus(v);
            setPage(0);
          }}
        >
          <SelectTrigger aria-label={t("sa.filter.subStatus")}>
            <SelectValue placeholder={t("sa.filter.subStatus")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("sa.filter.all")}</SelectItem>
            {["trialing", "active", "past_due", "cancelled", "suspended"].map((p) => (
              <SelectItem key={p} value={p}>{p}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isError && (
        <div className="panel p-6">
          <p className="font-medium">{t("common.error")}</p>
          <p className="mt-1 text-sm text-muted-foreground">{humanError(error, lang)}</p>
          <Button size="sm" className="mt-4" onClick={() => void refetch()}>{t("common.retry")}</Button>
        </div>
      )}

      {isPending ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-52 rounded-xl" />)}
        </div>
      ) : rows.length === 0 ? (
        <div className="panel p-8 text-center text-sm text-muted-foreground">{t("sa.rest.empty")}</div>
      ) : view === "grid" ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((r) => {
            const health = healthOf(r);
            return (
              <article key={r.id} className="panel flex flex-col gap-4 p-5">
                <div className="flex items-start gap-3">
                  <div className="size-11 shrink-0 overflow-hidden rounded-lg border bg-muted">
                    {r.logo_url ? <img src={r.logo_url} alt={r.name} className="size-full object-cover" loading="lazy" /> : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <Link to="/super-admin/restaurants/$restaurantId" params={{ restaurantId: r.id }} className="block truncate font-semibold underline-offset-4 hover:underline">
                      {r.name}
                    </Link>
                    <p className="truncate text-xs text-muted-foreground">/{r.slug}</p>
                  </div>
                  <StatusBadge restaurant={r} t={t} />
                </div>

                <dl className="grid grid-cols-3 gap-3 text-xs">
                  <div><dt className="text-muted-foreground">{t("sa.rest.col.orders")}</dt><dd className="mt-1 font-medium">{formatNumber(r.orderCount, lang)}</dd></div>
                  <div><dt className="text-muted-foreground">{t("sa.subs.plan")}</dt><dd className="mt-1 font-medium capitalize">{r.subscription_plan}</dd></div>
                  <div><dt className="text-muted-foreground">{ar ? "تنبيهات المخزون" : "Low stock"}</dt><dd className={r.lowStockCount > 0 ? "mt-1 font-semibold text-amber-700" : "mt-1 font-medium"}>{formatNumber(r.lowStockCount, lang)}</dd></div>
                </dl>

                <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
                  <div className="flex items-center justify-between gap-3"><span>{ar ? "الإيراد" : "Revenue"}</span><strong className="text-foreground">{formatMoney(r.revenue, r.currency, lang)}</strong></div>
                  <div className="mt-2 flex items-center justify-between gap-3"><span>{ar ? "جاهزية الإعداد" : "Setup health"}</span><strong className="text-foreground">{health.percent}%</strong></div>
                </div>

                <div className="mt-auto grid grid-cols-2 gap-2">
                  <Button asChild size="sm"><Link to="/super-admin/restaurants/$restaurantId" params={{ restaurantId: r.id }}>{t("sa.detail.overview")}</Link></Button>
                  <Button asChild size="sm" variant="outline"><Link to="/super-admin/restaurants/$restaurantId/operations" params={{ restaurantId: r.id }}>{ar ? "المكتب الخلفي" : "Back Office"}</Link></Button>
                </div>
                <Button asChild size="sm" variant="ghost" className="w-full"><Link to="/super-admin/restaurants/$restaurantId/menu" params={{ restaurantId: r.id }}>{t("sa.detail.menu")}</Link></Button>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-start font-medium">{ar ? "المطعم" : "Restaurant"}</th>
                <th className="px-4 py-3 text-start font-medium">{t("sa.filter.status")}</th>
                <th className="px-4 py-3 text-start font-medium">{t("sa.subs.plan")}</th>
                <th className="px-4 py-3 text-end font-medium">{t("sa.rest.col.orders")}</th>
                <th className="px-4 py-3 text-end font-medium">{ar ? "الإيراد" : "Revenue"}</th>
                <th className="px-4 py-3 text-end font-medium">{ar ? "تنبيهات المخزون" : "Low stock"}</th>
                <th className="px-4 py-3 text-end font-medium">{ar ? "الجاهزية" : "Health"}</th>
                <th className="px-4 py-3 text-end font-medium">{ar ? "الإجراءات" : "Actions"}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r) => {
                const health = healthOf(r);
                return <tr key={r.id} className="hover:bg-muted/30">
                  <td className="px-4 py-4"><Link to="/super-admin/restaurants/$restaurantId" params={{ restaurantId: r.id }} className="font-medium hover:underline">{r.name}</Link><p className="mt-1 text-xs text-muted-foreground">/{r.slug}</p></td>
                  <td className="px-4 py-4"><StatusBadge restaurant={r} t={t} /></td>
                  <td className="px-4 py-4 capitalize">{r.subscription_plan}</td>
                  <td className="px-4 py-4 text-end tabular-nums">{formatNumber(r.orderCount, lang)}</td>
                  <td className="px-4 py-4 text-end font-medium tabular-nums">{formatMoney(r.revenue, r.currency, lang)}</td>
                  <td className={r.lowStockCount > 0 ? "px-4 py-4 text-end font-semibold text-amber-700" : "px-4 py-4 text-end tabular-nums"}>{formatNumber(r.lowStockCount, lang)}</td>
                  <td className="px-4 py-4 text-end tabular-nums">{health.percent}%</td>
                  <td className="px-4 py-4"><div className="flex justify-end gap-2"><Button asChild size="sm" variant="outline"><Link to="/super-admin/restaurants/$restaurantId" params={{ restaurantId: r.id }}>{ar ? "فتح" : "Open"}</Link></Button><Button asChild size="sm"><Link to="/super-admin/restaurants/$restaurantId/operations" params={{ restaurantId: r.id }}>{ar ? "المكتب الخلفي" : "Back Office"}</Link></Button></div></td>
                </tr>;
              })}
            </tbody>
          </table>
        </div>
      )}

      {pageCount > 1 && (
        <div className="flex items-center justify-center gap-3">
          <Button size="sm" variant="outline" disabled={current === 0} onClick={() => setPage(current - 1)}>{t("common.prev")}</Button>
          <span className="text-sm text-muted-foreground">{t("common.page")} {current + 1} / {pageCount}</span>
          <Button size="sm" variant="outline" disabled={current >= pageCount - 1} onClick={() => setPage(current + 1)}>{t("common.next")}</Button>
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, loading }: { label: string; value: number; loading: boolean }) {
  return <div className="panel flex items-center gap-3 p-4"><div className="grid size-10 place-items-center rounded-lg bg-primary/10 text-primary"><PackageSearch className="size-5" /></div><div><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-xl font-semibold tabular-nums">{loading ? "—" : value}</p></div></div>;
}

function StatusBadge({ restaurant, t }: { restaurant: { archived_at: string | null; is_active: boolean }; t: (key: string) => string }) {
  return <Badge variant={restaurant.archived_at ? "outline" : restaurant.is_active ? "secondary" : "destructive"}>
    {restaurant.archived_at ? t("sa.status.archived") : restaurant.is_active ? t("sa.status.active") : t("sa.status.inactive")}
  </Badge>;
}
