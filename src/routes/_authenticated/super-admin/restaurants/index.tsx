import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AlertTriangle, Download, LayoutGrid, Rows3 } from "lucide-react";

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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useErpSignals, useRestaurantsWithStats, type ErpSignal } from "@/hooks/useSuperAdmin";
import { useI18n } from "@/lib/i18n";
import { formatDate, formatDateTime, formatMoney, formatNumber } from "@/lib/format";
import { healthOf } from "@/lib/health";
import { humanError } from "@/lib/errors";
import { downloadCsv } from "@/lib/erp";

export const Route = createFileRoute("/_authenticated/super-admin/restaurants/")({
  head: () => ({
    meta: [
      { title: "Restaurants — QuickServe admin" },
      {
        name: "description",
        content:
          "Search, filter and manage every restaurant tenant on the QuickServe platform, with setup health and Back Office signals at a glance.",
      },
      { property: "og:title", content: "Restaurants — QuickServe admin" },
      {
        property: "og:description",
        content: "All QuickServe restaurant tenants, subscriptions, onboarding status and Back Office signals.",
      },
    ],
  }),
  component: RestaurantsPage,
});

const PAGE_SIZE = 12;
const EMPTY_SIGNAL: ErpSignal = { lowStock: 0, items: 0, lastActivity: null };

function RestaurantsPage() {
  const { t, lang } = useI18n();
  const { data, isPending, isError, error, refetch } = useRestaurantsWithStats();
  const signals = useErpSignals();

  const [term, setTerm] = useState("");
  const [status, setStatus] = useState("all");
  const [plan, setPlan] = useState("all");
  const [subStatus, setSubStatus] = useState("all");
  const [view, setView] = useState<"grid" | "table">("grid");
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
  const signalFor = (id: string) => signals.data?.[id] ?? EMPTY_SIGNAL;

  const statusLabel = (r: (typeof filtered)[number]) =>
    r.archived_at ? t("sa.status.archived") : r.is_active ? t("sa.status.active") : t("sa.status.inactive");

  function exportCsv() {
    downloadCsv(
      "quickserve-restaurants.csv",
      [
        "Name",
        "Slug",
        "Status",
        "Plan",
        "Subscription",
        "Orders",
        "Revenue",
        "Currency",
        "Setup %",
        "Low stock items",
        "Last back office activity",
        "Created",
      ],
      filtered.map((r) => {
        const signal = signalFor(r.id);
        return [
          r.name,
          r.slug,
          r.archived_at ? "archived" : r.is_active ? "active" : "inactive",
          r.subscription_plan,
          r.subscription_status,
          r.orderCount,
          r.revenue.toFixed(3),
          r.currency,
          healthOf(r).percent,
          signal.lowStock,
          signal.lastActivity ?? "",
          r.created_at,
        ];
      }),
    );
  }

  function ErpCell({ id }: { id: string }) {
    const signal = signalFor(id);
    if (signals.isPending) return <span className="text-xs text-muted-foreground">…</span>;
    if (signal.items === 0)
      return <span className="text-xs text-muted-foreground">{t("sa.rest.erpNone")}</span>;
    return (
      <span className="inline-flex flex-wrap items-center gap-2 text-xs">
        {signal.lowStock > 0 ? (
          <span className="inline-flex items-center gap-1 rounded-md bg-amber-100 px-2 py-0.5 font-medium text-amber-900">
            <AlertTriangle className="size-3" aria-hidden />
            {formatNumber(signal.lowStock, lang)} {t("sa.rest.col.lowStock")}
          </span>
        ) : null}
        {signal.lastActivity ? (
          <span className="text-muted-foreground">{formatDateTime(signal.lastActivity, lang)}</span>
        ) : null}
      </span>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{t("sa.rest.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("sa.rest.subtitle")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-xl border p-0.5" role="group" aria-label={t("sa.rest.view.grid")}>
            <Button
              size="sm"
              variant={view === "grid" ? "secondary" : "ghost"}
              className="min-h-10 gap-1.5"
              aria-pressed={view === "grid"}
              onClick={() => setView("grid")}
            >
              <LayoutGrid className="size-4" />
              <span className="hidden sm:inline">{t("sa.rest.view.grid")}</span>
            </Button>
            <Button
              size="sm"
              variant={view === "table" ? "secondary" : "ghost"}
              className="min-h-10 gap-1.5"
              aria-pressed={view === "table"}
              onClick={() => setView("table")}
            >
              <Rows3 className="size-4" />
              <span className="hidden sm:inline">{t("sa.rest.view.table")}</span>
            </Button>
          </div>
          <Button variant="outline" className="min-h-10" onClick={exportCsv} disabled={filtered.length === 0}>
            <Download className="size-4" />
            <span className="hidden sm:inline">{t("sa.rest.export")}</span>
          </Button>
          <Button asChild className="min-h-10">
            <Link to="/super-admin/restaurants/new">{t("sa.rest.new")}</Link>
          </Button>
        </div>
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
          className="min-h-11"
        />
        <Select
          value={status}
          onValueChange={(v) => {
            setStatus(v);
            setPage(0);
          }}
        >
          <SelectTrigger className="min-h-11" aria-label={t("sa.filter.status")}>
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
          <SelectTrigger className="min-h-11" aria-label={t("sa.filter.plan")}>
            <SelectValue placeholder={t("sa.filter.plan")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("sa.filter.all")}</SelectItem>
            {["free", "basic", "professional", "enterprise"].map((p) => (
              <SelectItem key={p} value={p}>
                {p}
              </SelectItem>
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
          <SelectTrigger className="min-h-11" aria-label={t("sa.filter.subStatus")}>
            <SelectValue placeholder={t("sa.filter.subStatus")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("sa.filter.all")}</SelectItem>
            {["trialing", "active", "past_due", "cancelled", "suspended"].map((p) => (
              <SelectItem key={p} value={p}>
                {p}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isError && (
        <div className="panel p-6">
          <p className="font-medium">{t("common.error")}</p>
          <p className="mt-1 text-sm text-muted-foreground">{humanError(error, lang)}</p>
          <Button size="sm" className="mt-4" onClick={() => void refetch()}>
            {t("common.retry")}
          </Button>
        </div>
      )}

      {!isPending && !isError ? (
        <p className="text-sm text-muted-foreground">
          {formatNumber(filtered.length, lang)} {t("sa.rest.summary")}
        </p>
      ) : null}

      {isPending ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-44 rounded-xl" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="panel p-8 text-center text-sm text-muted-foreground">
          {t("sa.rest.empty")}
        </div>
      ) : view === "table" ? (
        <div className="panel overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("sa.rest.col.name")}</TableHead>
                <TableHead>{t("sa.rest.col.status")}</TableHead>
                <TableHead>{t("sa.subs.plan")}</TableHead>
                <TableHead className="text-end">{t("sa.rest.col.orders")}</TableHead>
                <TableHead className="text-end">{t("sa.rest.col.revenue")}</TableHead>
                <TableHead className="text-end">{t("sa.rest.col.health")}</TableHead>
                <TableHead>{t("sa.rest.col.erpActivity")}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <Link
                      to="/super-admin/restaurants/$restaurantId"
                      params={{ restaurantId: r.id }}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {r.name}
                    </Link>
                    <p className="text-xs text-muted-foreground">/{r.slug}</p>
                  </TableCell>
                  <TableCell>
                    <Badge variant={r.archived_at ? "outline" : r.is_active ? "secondary" : "destructive"}>
                      {statusLabel(r)}
                    </Badge>
                  </TableCell>
                  <TableCell className="capitalize">{r.subscription_plan}</TableCell>
                  <TableCell className="text-end tabular-nums">{formatNumber(r.orderCount, lang)}</TableCell>
                  <TableCell className="text-end tabular-nums">
                    {formatMoney(r.revenue, r.currency, lang)}
                  </TableCell>
                  <TableCell className="text-end tabular-nums">{healthOf(r).percent}%</TableCell>
                  <TableCell>
                    <ErpCell id={r.id} />
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <Button asChild size="sm" variant="outline" className="min-h-10">
                        <Link to="/super-admin/restaurants/$restaurantId" params={{ restaurantId: r.id }}>
                          {t("sa.detail.overview")}
                        </Link>
                      </Button>
                      <Button asChild size="sm" className="min-h-10">
                        <Link
                          to="/super-admin/restaurants/$restaurantId/operations"
                          params={{ restaurantId: r.id }}
                        >
                          {t("sa.rest.openBackOffice")}
                        </Link>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((r) => {
            const health = healthOf(r);
            return (
              <article key={r.id} className="panel flex flex-col gap-3 p-5">
                <div className="flex items-start gap-3">
                  <div className="size-11 shrink-0 overflow-hidden rounded-lg border bg-muted">
                    {r.logo_url ? (
                      <img
                        src={r.logo_url}
                        alt={r.name}
                        className="size-full object-cover"
                        loading="lazy"
                      />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <Link
                      to="/super-admin/restaurants/$restaurantId"
                      params={{ restaurantId: r.id }}
                      className="block truncate font-semibold underline-offset-4 hover:underline"
                    >
                      {r.name}
                    </Link>
                    <p className="truncate text-xs text-muted-foreground">/{r.slug}</p>
                  </div>
                  <Badge variant={r.archived_at ? "outline" : r.is_active ? "secondary" : "destructive"}>
                    {statusLabel(r)}
                  </Badge>
                </div>

                <dl className="grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <dt className="text-muted-foreground">{t("sa.rest.col.orders")}</dt>
                    <dd className="font-medium tabular-nums">{formatNumber(r.orderCount, lang)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">{t("sa.subs.plan")}</dt>
                    <dd className="font-medium capitalize">{r.subscription_plan}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">{t("sa.rest.col.created")}</dt>
                    <dd className="font-medium">{formatDate(r.created_at, lang)}</dd>
                  </div>
                </dl>

                <p className="text-xs text-muted-foreground">
                  {formatMoney(r.revenue, r.currency, lang)} ·{" "}
                  {health.level === "healthy"
                    ? t("sa.health.healthy")
                    : `${t("sa.health.needsSetup")} (${health.percent}%)`}
                </p>

                <ErpCell id={r.id} />

                <div className="mt-auto flex flex-wrap gap-2">
                  <Button asChild size="sm" className="min-h-10 flex-1">
                    <Link to="/super-admin/restaurants/$restaurantId" params={{ restaurantId: r.id }}>
                      {t("sa.detail.overview")}
                    </Link>
                  </Button>
                  <Button asChild size="sm" variant="outline" className="min-h-10">
                    <Link
                      to="/super-admin/restaurants/$restaurantId/operations"
                      params={{ restaurantId: r.id }}
                    >
                      {t("sa.rest.openBackOffice")}
                    </Link>
                  </Button>
                  <Button asChild size="sm" variant="ghost" className="min-h-10">
                    <Link to="/super-admin/restaurants/$restaurantId/menu" params={{ restaurantId: r.id }}>
                      {t("sa.detail.menu")}
                    </Link>
                  </Button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {pageCount > 1 && (
        <div className="flex items-center justify-center gap-3">
          <Button
            size="sm"
            variant="outline"
            disabled={current === 0}
            onClick={() => setPage(current - 1)}
          >
            {t("common.prev")}
          </Button>
          <span className="text-sm text-muted-foreground">
            {t("common.page")} {current + 1} / {pageCount}
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={current >= pageCount - 1}
            onClick={() => setPage(current + 1)}
          >
            {t("common.next")}
          </Button>
        </div>
      )}
    </div>
  );
}
