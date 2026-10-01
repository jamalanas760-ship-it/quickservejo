import { useMemo, useState } from "react";
import { Clock3, Plus, Truck } from "lucide-react";

import type { RecordRequest } from "@/components/backoffice/RecordDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { BackOfficeData } from "@/hooks/useBackOffice";
import { formatDateTime, formatMoney, formatNumber } from "@/lib/format";
import { useI18n } from "@/lib/i18n";

export function SuppliersPanel({
  data,
  currency,
  onAction,
  canManage = true,
}: {
  canManage?: boolean;
  data: BackOfficeData;
  currency: string;
  onAction: (request: RecordRequest) => void;
}) {
  const { lang } = useI18n();
  const ar = lang === "ar";
  const [term, setTerm] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const rows = useMemo(() => {
    const q = term.trim().toLowerCase();
    return data.suppliers
      .map((supplier) => {
        const receipts = data.movements.filter(
          (row) => row.supplier_id === supplier.id && row.movement_type === "receipt",
        );
        const openRequests = data.procurement.filter(
          (row) =>
            row.supplier_id === supplier.id &&
            (row.status === "approved" || row.status === "ordered"),
        );
        const late = openRequests.filter(
          (row) => row.needed_by && row.needed_by < new Date().toLocaleDateString("en-CA"),
        ).length;
        const openValue = openRequests.reduce(
          (sum, row) => sum + Number(row.quantity) * Number(row.estimated_unit_cost),
          0,
        );
        const latest =
          [...receipts].sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null;
        return { supplier, receipts, openRequests, late, openValue, latest };
      })
      .filter(
        (row) => !q || (row.supplier.name + " " + row.supplier.contact).toLowerCase().includes(q),
      )
      .sort(
        (a, b) =>
          b.late - a.late ||
          b.openValue - a.openValue ||
          a.supplier.name.localeCompare(b.supplier.name),
      );
  }, [data.movements, data.procurement, data.suppliers, term]);

  const selected = rows.find((row) => row.supplier.id === selectedId) ?? rows[0];
  return (
    <section className="space-y-4">
      <header className="bo-section-heading">
        <div>
          <h2>{ar ? "الموردون" : "Suppliers"}</h2>
          <p>
            {ar
              ? "معلومات المورد وطلباته وتوريداته."
              : "Manage supplier information, requests and deliveries."}
          </p>
        </div>
        {canManage ? (
          <Button onClick={() => onAction({ kind: "supplier" })}>
            <Plus size={15} />
            {ar ? "إضافة مورد" : "Add supplier"}
          </Button>
        ) : null}
      </header>
      <div className="bo-toolbar">
        <Input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder={ar ? "بحث عن مورد" : "Search suppliers"}
          aria-label={ar ? "بحث عن مورد" : "Search suppliers"}
        />
      </div>
      {!rows.length ? (
        <div className="bo-panel bo-empty">
          <Truck size={28} />
          <strong>{ar ? "لا يوجد موردون مطابقون" : "No matching suppliers"}</strong>
        </div>
      ) : (
        <div className="bo-split">
          <div className="bo-panel bo-table-scroll">
            <table className="bo-data-table">
              <thead>
                <tr>
                  {[
                    ar ? "الاسم" : "Name",
                    ar ? "الاتصال" : "Contact",
                    ar ? "طلبات مفتوحة" : "Open requests",
                    ar ? "القيمة" : "Open value",
                  ].map((label) => (
                    <th key={label}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.supplier.id}
                    className={selected?.supplier.id === row.supplier.id ? "bo-selected-row" : ""}
                  >
                    <td>
                      <button
                        className="bo-link"
                        aria-pressed={selected?.supplier.id === row.supplier.id}
                        onClick={() => setSelectedId(row.supplier.id)}
                      >
                        {row.supplier.name}
                      </button>
                      {row.late ? (
                        <small>
                          {row.late} {ar ? "متأخر" : "late"}
                        </small>
                      ) : null}
                    </td>
                    <td>{row.supplier.contact || "—"}</td>
                    <td>{row.openRequests.length}</td>
                    <td>{formatMoney(row.openValue, currency, lang)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {selected ? (
            <aside className="bo-detail">
              <span className="bo-icon">
                <Truck size={18} />
              </span>
              <h3 className="mt-3 font-bold">{selected.supplier.name}</h3>
              {canManage ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-3"
                  onClick={() => onAction({ kind: "supplier", supplierId: selected.supplier.id })}
                >
                  {ar ? "تعديل" : "Edit supplier"}
                </Button>
              ) : null}
              <dl>
                <dt>{ar ? "الاتصال" : "Contact"}</dt>
                <dd>{selected.supplier.contact || "—"}</dd>
                <dt>{ar ? "طلبات مفتوحة" : "Open requests"}</dt>
                <dd>{selected.openRequests.length}</dd>
                <dt>{ar ? "القيمة المفتوحة" : "Open value"}</dt>
                <dd>{formatMoney(selected.openValue, currency, lang)}</dd>
                <dt>{ar ? "آخر توريد" : "Latest delivery"}</dt>
                <dd>{selected.latest ? formatDateTime(selected.latest.created_at, lang) : "—"}</dd>
                <dt>{ar ? "التوريدات" : "Receipts"}</dt>
                <dd>{formatNumber(selected.receipts.length, lang)}</dd>
              </dl>
              {selected.late ? (
                <p className="mt-5 text-xs text-amber-700 flex gap-2">
                  <Clock3 size={14} />
                  {ar ? "يوجد طلب تجاوز تاريخ الحاجة." : "A request is past its needed-by date."}
                </p>
              ) : null}
            </aside>
          ) : null}
        </div>
      )}
    </section>
  );
}
