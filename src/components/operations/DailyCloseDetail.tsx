import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { MasterPageHeader } from "@/components/app/MasterPage";
import { selectedHomeRange } from "@/lib/home-period";
import { humanError } from "@/lib/errors";
import { formatMoney } from "@/lib/format";
export type CloseMetric = "net" | "cash" | "card-wallet" | "labor" | "inventory";
export function DailyCloseDetail({
  restaurantId,
  date,
  timezone,
  metric,
  expected,
  currency,
  ar,
  lang,
  finalized,
  onBack,
}: {
  restaurantId: string;
  date: string;
  timezone: string;
  metric: CloseMetric;
  expected: number;
  currency: string;
  ar: boolean;
  lang: "en" | "ar";
  finalized: boolean;
  onBack: () => void;
}) {
  const [page, setPage] = useState(0);
  const [status, setStatus] = useState("all");
  const range = selectedHomeRange({ from: date, until: date }, timezone);
  const payment = ["net", "cash", "card-wallet"].includes(metric);
  const title = {
    net: "Net payments",
    cash: "Cash",
    "card-wallet": "Card + wallet",
    labor: "Labor hours",
    inventory: "Inventory exceptions",
  }[metric];
  const columns = payment
    ? ["created_at", "order_id", "method", "transaction_type", "status", "amount", "reference"]
    : metric === "labor"
      ? ["staff_id", "clock_in", "clock_out", "break_minutes", "review_status", "hours"]
      : ["item_id", "created_at", "movement_type", "quantity", "unit_cost", "total_cost", "reason"];
  const records = useQuery({
    queryKey: ["daily-close-detail", restaurantId, date, timezone, metric, status, page],
    queryFn: async () => {
      const table = payment
        ? "payment_transactions"
        : metric === "labor"
          ? "staff_time_entries"
          : "erp_stock_movements";
      let query = supabase
        .from(table as never)
        .select(
          [
            "id",
            ...columns.filter((column) => column !== "hours"),
            payment
              ? "order:orders!payment_transactions_order_id_fkey(order_number)"
              : metric === "labor"
                ? "employee:staff!staff_time_entries_staff_id_fkey(name)"
                : "item:erp_inventory!erp_stock_movements_restaurant_id_item_id_fkey(name)",
          ].join(","),
          {
            count: "exact",
          },
        )
        .eq("restaurant_id", restaurantId);
      if (metric === "labor")
        query = query.lt("clock_in", range.end).or(`clock_out.is.null,clock_out.gt.${range.start}`);
      else query = query.gte("created_at", range.start).lt("created_at", range.end);
      if (metric === "cash") query = query.eq("method", "cash");
      if (metric === "card-wallet") query = query.in("method", ["card", "wallet"]);
      if (metric === "inventory") query = query.not("movement_type", "in", "(receipt,issue)");
      if (payment && status !== "all") query = query.eq("status", status);
      const { data, error, count } = await query
        .order(metric === "labor" ? "clock_in" : "created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(page * 50, page * 50 + 49);
      if (error) throw error;
      return { rows: data as unknown as Record<string, unknown>[], count: count ?? 0 };
    },
  });
  const cashSessions = useQuery({
    queryKey: ["daily-close-cash-sessions", restaurantId, date, timezone],
    enabled: metric === "cash",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cash_sessions" as never)
        .select("id,opened_at,closed_at,opening_float,expected_cash,closing_cash,variance")
        .eq("restaurant_id", restaurantId)
        .gte("opened_at", range.start)
        .lt("opened_at", range.end)
        .order("opened_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as unknown as Record<string, unknown>[];
    },
  });
  const hours = (row: Record<string, unknown>) =>
    Math.max(
      0,
      (Math.min(Date.parse(String(row.clock_out ?? range.end)), Date.parse(range.end)) -
        Math.max(Date.parse(String(row.clock_in)), Date.parse(range.start))) /
        3600000 -
        Number(row.break_minutes ?? 0) / 60,
    );
  const relatedName = (row: Record<string, unknown>, key: string, field: string) => {
    const related = row[key];
    return related && typeof related === "object" && field in related
      ? String((related as Record<string, unknown>)[field])
      : null;
  };
  const value = (row: Record<string, unknown>, column: string) =>
    column === "staff_id" ? (
      (relatedName(row, "employee", "name") ?? String(row.staff_id))
    ) : column === "item_id" ? (
      (relatedName(row, "item", "name") ?? String(row.item_id))
    ) : column === "order_id" && row.order_id ? (
      <Link
        to="/manage/$restaurantId/orders"
        params={{ restaurantId }}
        search={{ record: String(row.order_id) }}
      >
        {relatedName(row, "order", "order_number") ?? String(row.order_id).slice(0, 8)}
      </Link>
    ) : column === "hours" ? (
      hours(row).toFixed(2)
    ) : column === "amount" || column === "unit_cost" || column === "total_cost" ? (
      formatMoney(Number(row[column] ?? 0), currency, lang)
    ) : row[column] == null ? (
      "—"
    ) : (
      String(row[column])
    );
  return (
    <div className="space-y-4">
      <MasterPageHeader
        title={title}
        description={`${date} · ${timezone}`}
        actions={
          <Button variant="outline" onClick={onBack}>
            {ar ? "العودة للإقفال" : "Back to Daily Close"}
          </Button>
        }
      />
      <section className="qs-card p-4">
        <p>{ar ? "قيمة مؤشر الإقفال" : "Daily Close summary"}</p>
        <strong className="text-xl">
          {metric === "labor"
            ? `${expected.toFixed(2)}h`
            : metric === "inventory"
              ? expected
              : formatMoney(expected, currency, lang)}
        </strong>
        <p className="mt-2 text-xs text-muted-foreground">
          {metric === "net"
            ? "Net = completed payments − completed refunds. Pending, failed and reversed records are excluded."
            : payment
              ? "Cash / card / wallet summaries include completed payment transactions. Refunds are displayed separately and are excluded from these gross method summaries."
              : metric === "labor"
                ? "Hours use clipped business-day clock intervals minus recorded breaks, matching Daily Close."
                : "Exceptions are recorded stock movements other than receipts and issues."}
        </p>
        {finalized ? (
          <p className="mt-2 text-xs text-amber-700">
            {ar
              ? "المؤشر لقطة إقفال محفوظة. السجلات المعروضة حالية وقد تختلف عند إجراء تعديلات لاحقة."
              : "The summary is a finalized snapshot. These current records can differ after subsequent adjustments."}
          </p>
        ) : null}
      </section>
      {metric === "cash" ? (
        <section className="qs-card overflow-x-auto p-4">
          <h2 className="mb-3 text-sm font-bold">{ar ? "تسوية الصندوق" : "Cash reconciliation"}</h2>
          {cashSessions.isPending ? (
            <p role="status">…</p>
          ) : cashSessions.isError ? (
            <p role="alert">{humanError(cashSessions.error, lang)}</p>
          ) : cashSessions.data.length ? (
            <table className="w-full min-w-[600px] text-xs">
              <thead>
                <tr>
                  {[
                    "Session",
                    "Opening float",
                    "Expected cash",
                    "Counted cash",
                    "Variance",
                    "Status",
                  ].map((label) => (
                    <th key={label} className="p-2 text-start">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cashSessions.data.map((row) => (
                  <tr key={String(row.id)} className="border-t">
                    <td className="p-2">{String(row.id).slice(0, 8)}</td>
                    {["opening_float", "expected_cash", "closing_cash", "variance"].map(
                      (column) => (
                        <td key={column} className="p-2">
                          {row[column] == null
                            ? "—"
                            : formatMoney(Number(row[column]), currency, lang)}
                        </td>
                      ),
                    )}
                    <td className="p-2">{row.closed_at ? "Closed" : "Open"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p>{ar ? "لا توجد جلسات صندوق متاحة" : "No accessible cash sessions"}</p>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            {ar
              ? "أحدث 50 جلسة بدأت في تاريخ العمل المحدد."
              : "Latest 50 sessions opened on this business date."}
          </p>
        </section>
      ) : null}
      {payment ? (
        <label className="flex items-center gap-2 text-sm">
          {ar ? "حالة الدفع" : "Payment status"}
          <select
            className="min-h-11 rounded-lg border bg-card px-3"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(0);
            }}
          >
            <option value="all">All statuses</option>
            {["completed", "pending", "failed", "reversed"].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
      ) : null}
      {records.isPending ? (
        <p role="status">{ar ? "جارٍ التحميل…" : "Loading…"}</p>
      ) : records.isError ? (
        <p role="alert" className="text-destructive">
          {humanError(records.error, lang)}
        </p>
      ) : !records.data.rows.length ? (
        <section className="qs-card p-8 text-center">
          {ar
            ? "لا توجد سجلات متاحة للفترة والفلاتر المحددة."
            : "No accessible records match this business date and filters."}
        </section>
      ) : (
        <section className="qs-card overflow-x-auto">
          <table className="w-full min-w-[780px] text-xs">
            <thead>
              <tr>
                {columns.map((column) => (
                  <th key={column} className="p-3 text-start">
                    {column.replaceAll("_", " ")}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {records.data.rows.map((row) => (
                <tr key={String(row.id)} className="border-t">
                  {columns.map((column) => (
                    <td key={column} className="p-3">
                      {value(row, column)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      <div className="flex justify-between gap-2">
        <Button
          variant="outline"
          disabled={!page || records.isPending}
          onClick={() => setPage((value) => value - 1)}
        >
          Previous
        </Button>
        <span>
          {page + 1} · {records.data?.count ?? 0} records
        </span>
        <Button
          variant="outline"
          disabled={records.isPending || (page + 1) * 50 >= (records.data?.count ?? 0)}
          onClick={() => setPage((value) => value + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
