import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { DateRangePicker } from "@/components/common/DateRangePicker";
import { Button } from "@/components/ui/button";
import type { BackOfficeAccess, BackOfficeData } from "@/hooks/useBackOffice";
import { downloadCsv, expenseCategoryLabel, stockValuation } from "@/lib/erp";
import { formatMoney, formatNumber } from "@/lib/format";
import { dayKey, rangeFromPreset, type DateRange } from "@/lib/range";
import { useI18n } from "@/lib/i18n";

const colors = ["#ff5a0a", "#ffa154", "#568cff", "#a18be7", "#8b97a8"];
export function ReportsPanel({
  data,
  access,
  currency,
  restaurantName,
}: {
  data: BackOfficeData;
  access: BackOfficeAccess;
  currency: string;
  restaurantName: string;
}) {
  const { lang } = useI18n(),
    ar = lang === "ar";
  const [range, setRange] = useState<DateRange>(() => rangeFromPreset("30d"));
  const expenses = useMemo(
    () =>
      data.expenses.filter(
        (row) => row.expense_date >= dayKey(range.from) && row.expense_date < dayKey(range.to),
      ),
    [data.expenses, range],
  );
  const total = expenses.reduce((sum, row) => sum + Number(row.amount), 0);
  const daily = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of expenses)
      map.set(row.expense_date, (map.get(row.expense_date) ?? 0) + Number(row.amount));
    return [...map]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, amount]) => ({ date: date.slice(5), amount }));
  }, [expenses]);
  const categories = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of expenses)
      map.set(row.category, (map.get(row.category) ?? 0) + Number(row.amount));
    return [...map]
      .sort((a, b) => b[1] - a[1])
      .map(([category, value]) => ({ name: expenseCategoryLabel(category, lang), value }));
  }, [expenses, lang]);
  const valuation = stockValuation(data.inventory, data.movements);
  const costs = useMemo(() => {
    const map = new Map<string, number>();
    for (const movement of [...data.movements].sort((a, b) =>
      b.created_at.localeCompare(a.created_at),
    ))
      if (Number(movement.unit_cost) > 0 && !map.has(movement.item_id))
        map.set(movement.item_id, Number(movement.unit_cost));
    return map;
  }, [data.movements]);
  const stock = [...data.inventory].sort(
    (a, b) =>
      Number(b.quantity) * (costs.get(b.id) ?? 0) - Number(a.quantity) * (costs.get(a.id) ?? 0),
  );
  function exportReport() {
    const rows: (string | number)[][] = [];
    if (access.finance) {
      rows.push(["Period expenses", total]);
      for (const entry of categories) rows.push([entry.name, entry.value]);
    }
    if (access.inventory) {
      rows.push(["Inventory value", valuation.value]);
      for (const item of stock)
        rows.push([item.name, Number(item.quantity) * (costs.get(item.id) ?? 0)]);
    }
    downloadCsv(
      `${restaurantName || "restaurant"}-backoffice-${dayKey(range.from)}.csv`,
      ["Metric / Item", `Value (${currency})`],
      rows,
    );
  }
  return (
    <section className="space-y-4">
      <header className="bo-section-heading">
        <div>
          <h2>{ar ? "التقارير" : "Reports"}</h2>
          <p>
            {ar
              ? "رؤى حول المخزون والمشتريات والمصروفات."
              : "Insights into your inventory, purchasing and expenses."}
          </p>
        </div>
        <div className="bo-toolbar">
          <DateRangePicker value={range} onChange={setRange} />
          <Button variant="outline" onClick={exportReport}>
            <Download size={15} />
            {ar ? "تصدير التقرير" : "Export report"}
          </Button>
        </div>
      </header>
      {access.finance ? (
        <div className="bo-charts">
          <section className="bo-panel bo-chart">
            <h3>
              {ar ? "مصروفات الفترة" : "Period expenses"} ({currency}){" "}
              <span className="float-end">{formatMoney(total, currency, lang)}</span>
            </h3>
            {daily.length ? (
              <div
                className="bo-chart-body"
                aria-label={ar ? "المصروفات حسب اليوم" : "Expenses by day"}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={daily}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--bo-line)" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 10, fill: "var(--bo-muted)" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: "var(--bo-muted)" }}
                      axisLine={false}
                      tickLine={false}
                      width={45}
                    />
                    <Tooltip
                      formatter={(v) => formatMoney(Number(v), currency, lang)}
                      contentStyle={{
                        background: "var(--bo-surface)",
                        borderColor: "var(--bo-line)",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                    />
                    <Bar
                      isAnimationActive={false}
                      dataKey="amount"
                      fill="#ff5a0a"
                      radius={[3, 3, 0, 0]}
                      maxBarSize={28}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="bo-empty">
                {ar ? "لا مصروفات في هذه الفترة." : "No expenses in this period."}
              </div>
            )}
          </section>
          <section className="bo-panel bo-chart">
            <h3>{ar ? "المصروف حسب الفئة" : "Expenses by category"}</h3>
            {categories.length ? (
              <div className="bo-category-chart">
                <div className="bo-chart-body">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        isAnimationActive={false}
                        data={categories}
                        dataKey="value"
                        nameKey="name"
                        innerRadius="55%"
                        outerRadius="85%"
                        paddingAngle={3}
                      >
                        {categories.map((entry, i) => (
                          <Cell key={entry.name} fill={colors[i % colors.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(v) => formatMoney(Number(v), currency, lang)}
                        contentStyle={{
                          background: "var(--bo-surface)",
                          borderColor: "var(--bo-line)",
                          fontSize: 12,
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <ul>
                  {categories.map((entry, i) => (
                    <li key={entry.name}>
                      <i style={{ background: colors[i % colors.length] }} />
                      <span>{entry.name}</span>
                      <strong>{total > 0 ? Math.round((entry.value / total) * 100) : 0}%</strong>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="bo-empty">
                {ar ? "لا مصروفات في هذه الفترة." : "No expenses in this period."}
              </div>
            )}
          </section>
        </div>
      ) : null}
      {access.inventory ? (
        <section className="bo-panel">
          <header>
            <h2>{ar ? "قيمة المخزون" : "Stock valuation"}</h2>
            <strong className="text-sm">{formatMoney(valuation.value, currency, lang)}</strong>
          </header>
          <div className="bo-table-scroll">
            <table className="bo-data-table">
              <thead>
                <tr>
                  {[
                    ar ? "المادة" : "Item",
                    ar ? "الكمية" : "Quantity",
                    ar ? "تكلفة الوحدة" : "Unit cost",
                    ar ? "القيمة" : "Value",
                  ].map((label) => (
                    <th key={label}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {stock.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong>{item.name}</strong>
                    </td>
                    <td>
                      {formatNumber(Number(item.quantity), lang)} {item.unit}
                    </td>
                    <td>
                      {costs.has(item.id) ? formatMoney(costs.get(item.id)!, currency, lang) : "—"}
                    </td>
                    <td>
                      {costs.has(item.id)
                        ? formatMoney(Number(item.quantity) * costs.get(item.id)!, currency, lang)
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!stock.length ? (
              <p className="bo-empty">{ar ? "لا مواد مخزون بعد." : "No inventory items yet."}</p>
            ) : null}
          </div>
        </section>
      ) : null}
    </section>
  );
}
