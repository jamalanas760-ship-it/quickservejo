import { AlertTriangle, Coins, PackageSearch, Receipt, TrendingDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { BackOfficeData } from "@/hooks/useBackOffice";
import { backOfficeSummary } from "@/hooks/useBackOffice";
import { expenseCategoryLabel } from "@/lib/erp";
import { formatDateTime, formatMoney, formatNumber } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import type { RecordRequest } from "@/components/backoffice/RecordDialog";

type Summary = ReturnType<typeof backOfficeSummary>;

function Kpi({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Coins;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="panel p-5">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="size-4 shrink-0" aria-hidden />
        <p className="text-xs font-medium">{label}</p>
      </div>
      <p className="mt-3 text-2xl font-semibold tabular-nums">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function OverviewPanel({
  data,
  summary,
  currency,
  onAction,
}: {
  data: BackOfficeData;
  summary: Summary;
  currency: string;
  onAction: (request: RecordRequest) => void;
}) {
  const { t, lang } = useI18n();

  const activity = [
    ...data.movements.slice(0, 12).map((m) => ({
      id: `m-${m.id}`,
      at: m.created_at,
      title: data.inventory.find((i) => i.id === m.item_id)?.name ?? m.item_id,
      detail: m.reason,
      amount: `${Number(m.quantity) > 0 ? "+" : ""}${formatNumber(Number(m.quantity), lang)}`,
    })),
    ...data.expenses.slice(0, 12).map((e) => ({
      id: `e-${e.id}`,
      at: e.created_at,
      title: e.description,
      detail: expenseCategoryLabel(e.category, lang),
      amount: formatMoney(Number(e.amount), currency, lang),
    })),
  ]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 8);

  if (summary.isEmpty) {
    return (
      <div className="panel space-y-4 p-8 text-center">
        <PackageSearch className="mx-auto size-8 text-primary" aria-hidden />
        <h3 className="text-lg font-semibold">{t("bo.overview.startTitle")}</h3>
        <p className="mx-auto max-w-md text-sm text-muted-foreground">{t("bo.overview.startBody")}</p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button className="min-h-11" onClick={() => onAction({ kind: "item" })}>
            {t("bo.inv.addItem")}
          </Button>
          <Button variant="outline" className="min-h-11" onClick={() => onAction({ kind: "supplier" })}>
            {t("bo.sup.add")}
          </Button>
          <Button variant="outline" className="min-h-11" onClick={() => onAction({ kind: "expense" })}>
            {t("bo.fin.record")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi icon={PackageSearch} label={t("bo.kpi.items")} value={formatNumber(summary.itemCount, lang)} />
        <Kpi icon={AlertTriangle} label={t("bo.kpi.low")} value={formatNumber(summary.lowStock.length, lang)} />
        <Kpi
          icon={Coins}
          label={t("bo.kpi.value")}
          value={formatMoney(summary.valuation.value, currency, lang)}
          hint={
            summary.valuation.itemsWithoutCost > 0
              ? `${formatNumber(summary.valuation.itemsWithoutCost, lang)} ${t("bo.value.missing")}`
              : t("bo.value.basis")
          }
        />
        <Kpi
          icon={Receipt}
          label={t("bo.kpi.monthExpenses")}
          value={formatMoney(summary.monthTotal, currency, lang)}
          hint={`${formatNumber(summary.monthCount, lang)} · ${t("bo.fin.count")}`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="panel p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold">{t("bo.overview.lowTitle")}</h3>
            {data.inventory.length > 0 ? (
              <Button size="sm" variant="outline" className="min-h-10" onClick={() => onAction({ kind: "receive" })}>
                {t("bo.inv.receive")}
              </Button>
            ) : null}
          </div>
          {summary.lowStock.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">{t("bo.overview.lowEmpty")}</p>
          ) : (
            <ul className="mt-4 divide-y">
              {summary.lowStock.slice(0, 8).map((item) => (
                <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{item.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatNumber(Number(item.quantity), lang)} {item.unit} · {t("bo.inv.reorder")}{" "}
                      {formatNumber(Number(item.reorder_level), lang)} {item.unit}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="min-h-10"
                      onClick={() => onAction({ kind: "receive", itemId: item.id })}
                    >
                      {t("bo.inv.receive")}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="min-h-10"
                      onClick={() => onAction({ kind: "issue", itemId: item.id })}
                    >
                      {t("bo.inv.issue")}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="space-y-4">
          <section className="panel p-5">
            <h3 className="font-semibold">{t("bo.overview.categorySplit")}</h3>
            {summary.monthByCategory.length === 0 ? (
              <p className="mt-4 text-sm text-muted-foreground">{t("bo.fin.noMatch")}</p>
            ) : (
              <ul className="mt-4 space-y-3">
                {summary.monthByCategory.map(([category, amount]) => {
                  const share = summary.monthTotal > 0 ? Math.round((amount / summary.monthTotal) * 100) : 0;
                  return (
                    <li key={category}>
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span>{expenseCategoryLabel(category, lang)}</span>
                        <span className="font-medium tabular-nums">
                          {formatMoney(amount, currency, lang)}
                        </span>
                      </div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${share}%` }} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="panel p-5">
            <div className="flex items-center gap-2">
              <TrendingDown className="size-4 text-muted-foreground" aria-hidden />
              <h3 className="font-semibold">{t("bo.overview.activity")}</h3>
            </div>
            {activity.length === 0 ? (
              <p className="mt-4 text-sm text-muted-foreground">{t("bo.overview.activityEmpty")}</p>
            ) : (
              <ul className="mt-4 divide-y">
                {activity.map((entry) => (
                  <li key={entry.id} className="flex items-start justify-between gap-4 py-3 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{entry.title}</p>
                      <p className="truncate text-xs text-muted-foreground">{entry.detail}</p>
                      <time className="text-xs text-muted-foreground">{formatDateTime(entry.at, lang)}</time>
                    </div>
                    <span className="whitespace-nowrap font-semibold tabular-nums">{entry.amount}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
