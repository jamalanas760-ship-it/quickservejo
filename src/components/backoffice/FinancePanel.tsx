import { useMemo, useState } from "react";
import { Download, Receipt } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateRangePicker } from "@/components/common/DateRangePicker";
import type { BackOfficeData } from "@/hooks/useBackOffice";
import { downloadCsv, expenseCategoryLabel, sumBy } from "@/lib/erp";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { dayKey, rangeFromPreset, type DateRange } from "@/lib/range";
import type { RecordRequest } from "@/components/backoffice/RecordDialog";

export function FinancePanel({
  data,
  currency,
  restaurantName,
  onAction,
}: {
  data: BackOfficeData;
  currency: string;
  restaurantName: string;
  onAction: (request: RecordRequest) => void;
}) {
  const { t, lang } = useI18n();
  const [range, setRange] = useState<DateRange>(() => rangeFromPreset("30d"));
  const [term, setTerm] = useState("");

  const rows = useMemo(() => {
    const from = dayKey(range.from);
    const toExclusive = dayKey(range.to);
    const needle = term.trim().toLowerCase();
    return data.expenses.filter((expense) => {
      if (expense.expense_date < from || expense.expense_date >= toExclusive) return false;
      if (needle && !`${expense.description} ${expense.reference} ${expense.category}`.toLowerCase().includes(needle))
        return false;
      return true;
    });
  }, [data.expenses, range, term]);

  const total = sumBy(rows, (row) => Number(row.amount));
  const byCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of rows) map.set(row.category, (map.get(row.category) ?? 0) + Number(row.amount));
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [rows]);

  function exportCsv() {
    downloadCsv(
      `${restaurantName || "restaurant"}-expenses-${dayKey(range.from)}.csv`,
      ["Date", "Description", "Category", "Amount", "Currency", "Reference"],
      rows.map((row) => [
        row.expense_date,
        row.description,
        row.category,
        Number(row.amount).toFixed(3),
        currency,
        row.reference,
      ]),
    );
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <DateRangePicker value={range} onChange={setRange} />
        <Input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder={t("bo.fin.search")}
          aria-label={t("bo.fin.search")}
          className="min-h-11 min-w-40 flex-1"
        />
        <Button variant="outline" className="min-h-11" onClick={exportCsv} disabled={rows.length === 0}>
          <Download className="size-4" />
          {t("bo.fin.export")}
        </Button>
        <Button className="min-h-11" onClick={() => onAction({ kind: "expense" })}>
          <Receipt className="size-4" />
          {t("bo.fin.record")}
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="panel p-5">
          <p className="text-xs text-muted-foreground">{t("bo.fin.total")}</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums">{formatMoney(total, currency, lang)}</p>
        </div>
        <div className="panel p-5">
          <p className="text-xs text-muted-foreground">{t("bo.fin.count")}</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums">{formatNumber(rows.length, lang)}</p>
        </div>
        <div className="panel p-5">
          <p className="text-xs text-muted-foreground">{t("bo.fin.average")}</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums">
            {formatMoney(rows.length ? total / rows.length : 0, currency, lang)}
          </p>
        </div>
      </div>

      {byCategory.length > 0 ? (
        <section className="panel p-5">
          <h3 className="font-semibold">{t("bo.fin.byCategory")}</h3>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {byCategory.map(([category, amount]) => (
              <li key={category} className="flex items-center justify-between gap-3 text-sm">
                <span>{expenseCategoryLabel(category, lang)}</span>
                <span className="font-medium tabular-nums">{formatMoney(amount, currency, lang)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {data.expenses.length === 0 ? (
        <div className="panel grid min-h-48 place-items-center p-6 text-center text-sm text-muted-foreground">
          {t("bo.fin.empty")}
        </div>
      ) : rows.length === 0 ? (
        <div className="panel grid min-h-32 place-items-center p-6 text-center text-sm text-muted-foreground">
          {t("bo.fin.noMatch")}
        </div>
      ) : (
        <div className="panel divide-y px-5">
          {rows.map((expense) => (
            <article key={expense.id} className="flex items-start justify-between gap-4 py-4">
              <div className="min-w-0">
                <h3 className="truncate font-medium">{expense.description}</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatDate(expense.expense_date, lang)} · {expenseCategoryLabel(expense.category, lang)}
                  {expense.reference ? ` · ${expense.reference}` : ""}
                </p>
              </div>
              <p className="whitespace-nowrap text-sm font-semibold tabular-nums">
                {formatMoney(Number(expense.amount), currency, lang)}
              </p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
