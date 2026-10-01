import { useMemo, useState } from "react";
import { PackageCheck, ReceiptText, Truck } from "lucide-react";

import type { RecordRequest } from "@/components/backoffice/RecordDialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { BackOfficeData } from "@/hooks/useBackOffice";
import { formatDateTime, formatMoney, formatNumber } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export function ReceivingPanel({
  data,
  currency,
  onAction,
  onGoProcurement,
}: {
  data: BackOfficeData;
  currency: string;
  onAction: (request: RecordRequest) => void;
  onGoProcurement: () => void;
}) {
  const { lang } = useI18n();
  const ar = lang === "ar";
  const [term, setTerm] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [status, setStatus] = useState("all");
  const receipts = useMemo(
    () =>
      data.movements.filter((row) => row.movement_type === "receipt" && Number(row.quantity) > 0),
    [data.movements],
  );
  const pendingProcurement = data.procurement.filter(
    (row) => row.status === "approved" || row.status === "ordered",
  );

  const filtered = receipts.filter((row) => {
    const item = data.inventory.find((i) => i.id === row.item_id);
    const supplier = data.suppliers.find((i) => i.id === row.supplier_id);
    return (
      (status === "all" ||
        (status === "posted" ? Boolean(row.finance_expense_id) : !row.finance_expense_id)) &&
      `${item?.name ?? ""} ${supplier?.name ?? ""} ${row.reason}`
        .toLowerCase()
        .includes(term.trim().toLowerCase())
    );
  });
  const selected = filtered.find((row) => row.id === selectedId) ?? filtered[0];
  const selectedItem = data.inventory.find((i) => i.id === selected?.item_id);
  return (
    <section className="space-y-4">
      <header className="bo-section-heading">
        <div>
          <h2>{ar ? "الاستلام" : "Receiving"}</h2>
          <p>
            {ar
              ? "استلم التوريدات وحدّث المخزون."
              : "Receive supplier deliveries and update inventory."}
          </p>
        </div>
        <Button onClick={() => onAction({ kind: "receive" })}>
          <PackageCheck size={15} />
          {ar ? "استلام توريد" : "Receive supplies"}
        </Button>
      </header>
      <div className="bo-toolbar">
        <Input
          placeholder={ar ? "بحث في الاستلام" : "Search receipts"}
          aria-label={ar ? "بحث في الاستلام" : "Search receipts"}
          value={term}
          onChange={(e) => setTerm(e.target.value)}
        />
        <select
          aria-label={ar ? "حالة الاستلام" : "Receipt status"}
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="max-w-48"
        >
          <option value="all">{ar ? "كل الحالات" : "All statuses"}</option>
          <option value="posted">{ar ? "مرحّل" : "Posted"}</option>
          <option value="pending">{ar ? "بانتظار المالية" : "Finance pending"}</option>
        </select>
      </div>
      {pendingProcurement.length ? (
        <button className="bo-alert-row bo-panel" onClick={onGoProcurement}>
          <span className="bo-icon">
            <Truck size={17} />
          </span>
          <span>
            <strong>{ar ? "توريدات جاهزة للاستلام" : "Supplies ready to receive"}</strong>
            <small>
              {pendingProcurement.length}{" "}
              {ar ? "طلبات معتمدة أو تم طلبها" : "approved or ordered requests"}
            </small>
          </span>
          <span>{ar ? "فتح" : "Open"}</span>
        </button>
      ) : null}
      <section className="bo-panel bo-table-scroll">
        <table className="bo-data-table">
          <thead>
            <tr>
              {[
                ar ? "الاستلام" : "Receipt",
                ar ? "المادة" : "Item",
                ar ? "الكمية" : "Quantity",
                ar ? "المورد" : "Supplier",
                ar ? "تكلفة الوحدة" : "Unit cost",
                ar ? "الإجمالي" : "Total",
                ar ? "التاريخ" : "Received at",
                ar ? "الحالة" : "Status",
              ].map((label) => (
                <th key={label}>{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => (
              <tr key={row.id} className={row.id === selected?.id ? "bo-selected-row" : ""}>
                <td>
                  <button
                    className="bo-link"
                    aria-pressed={row.id === selected?.id}
                    onClick={() => setSelectedId(row.id)}
                  >
                    {row.id.slice(0, 8)}
                  </button>
                </td>
                <td>{data.inventory.find((i) => i.id === row.item_id)?.name ?? row.item_id}</td>
                <td>
                  {formatNumber(Number(row.quantity), lang)}{" "}
                  {data.inventory.find((i) => i.id === row.item_id)?.unit}
                </td>
                <td>{data.suppliers.find((i) => i.id === row.supplier_id)?.name ?? "—"}</td>
                <td>{formatMoney(Number(row.unit_cost), currency, lang)}</td>
                <td>
                  {formatMoney(
                    Number(
                      row.total_cost ?? Math.abs(Number(row.quantity)) * Number(row.unit_cost),
                    ),
                    currency,
                    lang,
                  )}
                </td>
                <td>{formatDateTime(row.created_at, lang)}</td>
                <td>
                  <span
                    className={cn(
                      "rounded-full px-2 py-1 text-[10px]",
                      row.finance_expense_id
                        ? "bg-emerald-500/10 text-emerald-700"
                        : "bg-amber-500/10 text-amber-700",
                    )}
                  >
                    {row.finance_expense_id
                      ? ar
                        ? "مرحّل"
                        : "Posted"
                      : ar
                        ? "بانتظار المالية"
                        : "Finance pending"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!filtered.length ? (
          <div className="bo-empty">
            <ReceiptText size={26} />
            <strong>{ar ? "لا استلام مطابق" : "No matching receipts"}</strong>
          </div>
        ) : null}
      </section>
      {selected ? (
        <section className="bo-detail">
          <h3>
            {ar ? "تفاصيل الاستلام" : "Receipt details"} · {selected.id.slice(0, 8)}
          </h3>
          <dl>
            <dt>{ar ? "المادة" : "Item"}</dt>
            <dd>{selectedItem?.name ?? selected.item_id}</dd>
            <dt>{ar ? "المورد" : "Supplier"}</dt>
            <dd>{data.suppliers.find((s) => s.id === selected.supplier_id)?.name ?? "—"}</dd>
            <dt>{ar ? "حركة المخزون" : "Stock movement"}</dt>
            <dd>
              +{formatNumber(Number(selected.quantity), lang)} {selectedItem?.unit}
            </dd>
            <dt>{ar ? "السبب" : "Reason"}</dt>
            <dd>{selected.reason}</dd>
            <dt>{ar ? "التاريخ" : "Received at"}</dt>
            <dd>{formatDateTime(selected.created_at, lang)}</dd>
          </dl>
        </section>
      ) : null}
    </section>
  );
}
