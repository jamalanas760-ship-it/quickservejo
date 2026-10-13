import { BackHomeButton } from "@/components/app/BackHomeButton";
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppHeader } from "@/components/nav/AppHeader";
import { MasterPageHeader } from "@/components/app/MasterPage";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { selectedHomeRange, type HomeDateSelection } from "@/lib/home-period";
import { formatMoney } from "@/lib/format";
import { humanError } from "@/lib/errors";
import { useI18n } from "@/lib/i18n";

export function SalesPeriodDetail({
  restaurantId,
  currency,
  timezone,
  selection,
}: {
  restaurantId: string;
  currency: string;
  timezone: string;
  selection: HomeDateSelection;
}) {
  const { lang } = useI18n();
  const ar = lang === "ar";
  const range = selectedHomeRange(selection, timezone);
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  const [status, setStatus] = useState("all");
  const [payment, setPayment] = useState("all");
  const [page, setPage] = useState(0);
  const [ascending, setAscending] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => {
      setTerm(search.trim());
      setPage(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);
  const report = useQuery({
    queryKey: ["workspace", "home-period", restaurantId, range.start, range.end],
    queryFn: async () => {
      const { data, error } = await supabase.rpc(
        "home_period_overview" as never,
        { _restaurant_id: restaurantId, _start: range.start, _end: range.end } as never,
      );
      if (error) throw error;
      return data as unknown as { sales: number; orderCount: number };
    },
    staleTime: 20_000,
  });
  const orders = useQuery({
    queryKey: [
      "sales-period-orders",
      restaurantId,
      range.start,
      range.end,
      term,
      status,
      payment,
      page,
      ascending,
    ],
    queryFn: async () => {
      let query = supabase
        .from("orders")
        .select(
          "id,order_number,created_at,status,payment_status,subtotal,discount_amount,tax_amount,service_amount,total,table:restaurant_tables(table_number)",
          { count: "exact" },
        )
        .eq("restaurant_id", restaurantId)
        .gte("created_at", range.start)
        .lt("created_at", range.end)
        .neq("status", "cancelled");
      if (term) query = query.ilike("order_number", `%${term.replace(/[%_]/g, "")}%`);
      if (status !== "all") query = query.eq("status", status as never);
      if (payment !== "all") query = query.eq("payment_status", payment as never);
      const { data, error, count } = await query
        .order("created_at", { ascending })
        .order("id", { ascending })
        .range(page * 25, page * 25 + 24);
      if (error) throw error;
      return { rows: data ?? [], count: count ?? 0 };
    },
  });
  const money = (value: number) => formatMoney(value, currency, lang);
  const reset = () => {
    setSearch("");
    setTerm("");
    setStatus("all");
    setPayment("all");
    setPage(0);
  };
  return (
    <div className="min-h-dvh bg-background">
      <AppHeader />
      <main className="qs-page space-y-4">
        <BackHomeButton ar={ar} selection={selection} />
        <MasterPageHeader
          title={ar ? "تفاصيل المبيعات" : "Sales details"}
          description={`${range.firstDay} – ${range.lastDay} · ${timezone}`}
        />
        <section className="qs-card p-4">
          <p className="text-sm">
            {ar ? "إجمالي قيمة الطلبات غير الملغاة" : "Total value of non-cancelled orders"}
          </p>
          <strong className="text-2xl">
            {report.isPending ? "…" : report.isError ? "—" : money(report.data.sales)}
          </strong>
          <p className="mt-2 text-xs text-muted-foreground">
            {ar
              ? "نفس حساب الصفحة الرئيسية. يشمل الطلبات غير المدفوعة؛ ليس صافي المدفوعات أو الإيراد بعد الاستردادات."
              : "Same calculation as Home. Includes unpaid orders; this is order value, not net collected payments or revenue after refunds."}
          </p>
          {report.isError ? <p role="alert">{humanError(report.error, lang)}</p> : null}
        </section>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            className="min-w-0 sm:max-w-xs"
            aria-label={ar ? "بحث برقم الطلب" : "Search order number"}
            placeholder={ar ? "رقم الطلب" : "Order number"}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <label className="text-sm">
            {ar ? "الطلب" : "Order status"}
            <select
              className="ms-2 min-h-11 rounded-lg border bg-card px-2"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(0);
              }}
            >
              <option value="all">{ar ? "الكل" : "All"}</option>
              {["new", "accepted", "preparing", "ready", "served", "paid"].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            {ar ? "الدفع" : "Payment status"}
            <select
              className="ms-2 min-h-11 rounded-lg border bg-card px-2"
              value={payment}
              onChange={(event) => {
                setPayment(event.target.value);
                setPage(0);
              }}
            >
              <option value="all">{ar ? "الكل" : "All"}</option>
              {["unpaid", "paid", "refunded"].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <Button
            variant="outline"
            onClick={() => {
              setAscending((value) => !value);
              setPage(0);
            }}
          >
            {ascending
              ? ar
                ? "الأقدم أولاً"
                : "Oldest first"
              : ar
                ? "الأحدث أولاً"
                : "Newest first"}
          </Button>
          <Button variant="outline" onClick={reset}>
            {ar ? "مسح الفلاتر" : "Clear filters"}
          </Button>
        </div>
        {orders.isPending ? (
          <p role="status">{ar ? "جارٍ التحميل…" : "Loading…"}</p>
        ) : orders.isError ? (
          <div role="alert">
            {humanError(orders.error, lang)}
            <Button onClick={() => void orders.refetch()}>{ar ? "إعادة المحاولة" : "Retry"}</Button>
          </div>
        ) : !orders.data.rows.length ? (
          <section className="qs-card p-8 text-center">
            {ar
              ? "لا توجد طلبات ضمن هذه الفترة والفلاتر."
              : "No orders match this period and filters."}
          </section>
        ) : (
          <section className="qs-card overflow-x-auto">
            <table className="w-full min-w-[900px] text-xs">
              <thead>
                <tr>
                  {[
                    "Order",
                    "Date / time",
                    "Table / source",
                    "Subtotal",
                    "Discount",
                    "Tax",
                    "Service",
                    "Total",
                    "Payment status",
                    "Order status",
                  ].map((label) => (
                    <th key={label} className="p-3 text-start">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {orders.data.rows.map((row) => (
                  <tr key={row.id} className="border-t">
                    <td className="p-3">
                      <Link
                        to="/manage/$restaurantId/orders"
                        params={{ restaurantId }}
                        search={{ record: row.id }}
                      >
                        {row.order_number}
                      </Link>
                    </td>
                    <td className="p-3">
                      {new Intl.DateTimeFormat(ar ? "ar-JO" : "en-GB", {
                        timeZone: timezone,
                        dateStyle: "short",
                        timeStyle: "short",
                      }).format(new Date(row.created_at))}
                    </td>
                    <td className="p-3">{row.table?.table_number ?? "—"}</td>
                    {[
                      row.subtotal,
                      row.discount_amount,
                      row.tax_amount,
                      row.service_amount,
                      row.total,
                    ].map((amount, index) => (
                      <td key={index} className="p-3">
                        {money(amount)}
                      </td>
                    ))}
                    <td className="p-3">{row.payment_status}</td>
                    <td className="p-3">{row.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
        <div className="flex items-center justify-between gap-2">
          <Button
            variant="outline"
            disabled={!page || orders.isPending}
            onClick={() => setPage((value) => value - 1)}
          >
            {ar ? "السابق" : "Previous"}
          </Button>
          <span className="text-sm">
            {page + 1} / {Math.max(1, Math.ceil((orders.data?.count ?? 0) / 25))} ·{" "}
            {orders.data?.count ?? 0}
          </span>
          <Button
            variant="outline"
            disabled={orders.isPending || (page + 1) * 25 >= (orders.data?.count ?? 0)}
            onClick={() => setPage((value) => value + 1)}
          >
            {ar ? "التالي" : "Next"}
          </Button>
        </div>
      </main>
    </div>
  );
}
