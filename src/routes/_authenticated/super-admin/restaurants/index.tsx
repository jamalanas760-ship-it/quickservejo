import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";

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
          "Search, filter and manage every restaurant tenant on the QuickServe platform, with setup health at a glance.",
      },
      { property: "og:title", content: "Restaurants — QuickServe admin" },
      {
        property: "og:description",
        content: "All QuickServe restaurant tenants, subscriptions and onboarding status.",
      },
    ],
  }),
  component: RestaurantsPage,
});

const PAGE_SIZE = 12;

function RestaurantsPage() {
  const { t, lang } = useI18n();
  const { data, isPending, isError, error, refetch } = useRestaurantsWithStats();

  const [term, setTerm] = useState("");
  const [status, setStatus] = useState("all");
  const [plan, setPlan] = useState("all");
  const [subStatus, setSubStatus] = useState("all");
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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{t("sa.rest.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("sa.rest.subtitle")}</p>
        </div>
        <Button asChild>
          <Link to="/super-admin/restaurants/new">{t("sa.rest.new")}</Link>
        </Button>
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
          <SelectTrigger aria-label={t("sa.filter.subStatus")}>
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
                      to="/super-admin/restaurants/$restaurantId/menu"
                      params={{ restaurantId: r.id }}
                      className="block truncate font-semibold underline-offset-4 hover:underline"
                    >
                      {r.name}
                    </Link>
                    <p className="truncate text-xs text-muted-foreground">/{r.slug}</p>
                  </div>
                  <Badge
                    variant={r.archived_at ? "outline" : r.is_active ? "secondary" : "destructive"}
                  >
                    {r.archived_at
                      ? t("sa.status.archived")
                      : r.is_active
                        ? t("sa.status.active")
                        : t("sa.status.inactive")}
                  </Badge>
                </div>

                <dl className="grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <dt className="text-muted-foreground">{t("sa.rest.col.orders")}</dt>
                    <dd className="font-medium">{formatNumber(r.orderCount, lang)}</dd>
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

                <div className="mt-auto flex gap-2">
                  <Button asChild size="sm" className="flex-1">
                    <Link
                      to="/super-admin/restaurants/$restaurantId/menu"
                      params={{ restaurantId: r.id }}
                    >
                      {t("sa.detail.menu")}
                    </Link>
                  </Button>
                  <Button asChild size="sm" variant="outline">
                    <Link to="/super-admin/restaurants/$restaurantId" params={{ restaurantId: r.id }}>
                      {t("sa.detail.overview")}
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
