import { AlertTriangle, Coins, PackageCheck, ShoppingCart } from "lucide-react";

import type { RecordRequest } from "@/components/backoffice/RecordDialog";
import { Button } from "@/components/ui/button";
import type { BackOfficeAccess, BackOfficeData } from "@/hooks/useBackOffice";
import { backOfficeSummary } from "@/hooks/useBackOffice";
import { expenseCategoryLabel } from "@/lib/erp";
import { formatDateTime, formatMoney, formatNumber } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { QuickActions } from "./QuickActions";

type Summary = ReturnType<typeof backOfficeSummary>;
type NavTarget =
  "overview" | "inventory" | "receiving" | "procurement" | "suppliers" | "finance" | "reports";

export function OverviewPanel({
  data,
  summary,
  access,
  currency,
  onAction,
  onNavigate,
  canApproveProcurement,
}: {
  data: BackOfficeData;
  summary: Summary;
  access: BackOfficeAccess;
  currency: string;
  onAction: (request: RecordRequest) => void;
  onNavigate: (section: NavTarget) => void;
  canApproveProcurement: boolean;
}) {
  const { lang } = useI18n();
  const ar = lang === "ar";

  const receiptPendingFinance = data.movements.filter(
    (row) => row.movement_type === "receipt" && !row.finance_expense_id,
  ).length;
  const activity = [
    ...data.procurement.slice(0, 12).map((row) => ({
      id: "p-" + row.id,
      at: row.updated_at,
      title: row.item_name_snapshot,
      detail: (ar ? "مشتريات" : "Procurement") + " · " + row.status,
      amount: formatMoney(
        Number(row.quantity) * Number(row.actual_unit_cost ?? row.estimated_unit_cost),
        currency,
        lang,
      ),
    })),
    ...data.movements.slice(0, 12).map((row) => ({
      id: "m-" + row.id,
      at: row.created_at,
      title:
        data.inventory.find((item) => item.id === row.item_id)?.name ??
        (ar ? "حركة مخزون" : "Stock movement"),
      detail: row.reason,
      amount: (Number(row.quantity) > 0 ? "+" : "") + formatNumber(Number(row.quantity), lang),
    })),
    ...data.expenses.slice(0, 12).map((row) => ({
      id: "e-" + row.id,
      at: row.created_at,
      title: row.description,
      detail:
        expenseCategoryLabel(row.category, lang) + " · " + (row.source_type ? "AUTO" : "MANUAL"),
      amount: formatMoney(Number(row.amount), currency, lang),
    })),
  ]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 8);

  const attention = [
    ...(access.inventory && summary.lowStock.length
      ? [
          {
            id: "low",
            icon: AlertTriangle,
            title: ar ? "مخزون منخفض" : "Low stock",
            detail: ar
              ? summary.lowStock.length + " مادة عند أو تحت حد إعادة الطلب"
              : summary.lowStock.length + " items are at or below reorder level",
            action: () => onNavigate("inventory"),
            tone: "danger" as const,
          },
        ]
      : []),
    ...((access.procurement || canApproveProcurement) && summary.pendingApproval
      ? [
          {
            id: "approval",
            icon: ShoppingCart,
            title: ar ? "طلبات شراء بانتظار الاعتماد" : "Procurement awaiting approval",
            detail: ar
              ? summary.pendingApproval + " طلب يحتاج قراراً"
              : summary.pendingApproval + " requests need a decision",
            action: () => onNavigate("procurement"),
            tone: "warning" as const,
          },
        ]
      : []),
    ...((access.procurement || access.inventory) && summary.pendingReceiving
      ? [
          {
            id: "receiving",
            icon: PackageCheck,
            title: ar ? "توريدات بانتظار الاستلام" : "Supplies waiting to be received",
            detail: ar
              ? summary.pendingReceiving + " طلب معتمد أو تم طلبه"
              : summary.pendingReceiving + " approved or ordered requests",
            action: () => onNavigate("receiving"),
            tone: "warning" as const,
          },
        ]
      : []),
    ...(access.finance && receiptPendingFinance
      ? [
          {
            id: "finance",
            icon: Coins,
            title: ar ? "استلام غير مرحّل للمالية" : "Receipt missing Finance posting",
            detail: ar
              ? receiptPendingFinance + " حركة استلام تحتاج مراجعة"
              : receiptPendingFinance + " receipt movements need review",
            action: () => onNavigate("finance"),
            tone: "danger" as const,
          },
        ]
      : []),
  ];

  return (
    <div className="bo-overview-grid">
      <section className="bo-panel">
        <header>
          <h2>
            {ar ? "تحتاج انتباه" : "Needs attention"} ({attention.length})
          </h2>
          <button onClick={() => onNavigate("inventory")}>{ar ? "عرض الكل" : "View all"}</button>
        </header>
        {access.inventory && summary.lowStock.length ? (
          <div className="bo-table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{ar ? "المادة" : "Item"}</th>
                  <th>{ar ? "المتاح" : "On hand"}</th>
                  <th>{ar ? "حد الطلب" : "Reorder at"}</th>
                  <th>{ar ? "الإجراء" : "Action"}</th>
                </tr>
              </thead>
              <tbody>
                {summary.lowStock.slice(0, 4).map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong>{item.name}</strong>
                    </td>
                    <td>
                      {formatNumber(Number(item.quantity), lang)} {item.unit}
                    </td>
                    <td>
                      {formatNumber(Number(item.reorder_level), lang)} {item.unit}
                    </td>
                    <td>
                      {access.procurement ? (
                        <Button
                          size="sm"
                          onClick={() => onAction({ kind: "procurement", itemId: item.id })}
                        >
                          {ar ? "طلب" : "Order"}
                        </Button>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => onNavigate("inventory")}>
                          {ar ? "فتح" : "Open"}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        {attention
          .filter((a) => a.id !== "low")
          .map((item) => (
            <button className="bo-alert-row" key={item.id} onClick={item.action}>
              <span className="bo-icon">
                <item.icon size={16} />
              </span>
              <span>
                <strong>{item.title}</strong>
                <small>{item.detail}</small>
              </span>
              <span>{ar ? "فتح" : "Open"}</span>
            </button>
          ))}
        {!attention.length ? (
          <div className="bo-empty">
            <PackageCheck size={26} />
            <strong>{ar ? "كل شيء تحت السيطرة" : "Everything looks under control"}</strong>
            <p>
              {ar
                ? "لا توجد استثناءات تحتاج تدخلاً الآن."
                : "No operational exceptions need action right now."}
            </p>
          </div>
        ) : null}
      </section>
      <section className="bo-panel bo-quick-panel">
        <header>
          <h2>{ar ? "إجراءات سريعة" : "Quick actions"}</h2>
        </header>
        <QuickActions access={access} onAction={onAction} />
      </section>
      <section className="bo-panel bo-activity">
        <header>
          <h2>{ar ? "آخر النشاطات" : "Recent activity"}</h2>
          <button onClick={() => onNavigate("reports")}>{ar ? "عرض الكل" : "View all"}</button>
        </header>
        {activity.length ? (
          <div className="bo-table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{ar ? "التاريخ" : "Date"}</th>
                  <th>{ar ? "النشاط" : "Activity"}</th>
                  <th>{ar ? "القيمة" : "Value"}</th>
                </tr>
              </thead>
              <tbody>
                {activity.slice(0, 5).map((entry) => (
                  <tr key={entry.id}>
                    <td>
                      <time>{formatDateTime(entry.at, lang)}</time>
                    </td>
                    <td>
                      <strong>{entry.title}</strong>
                      <small>{entry.detail}</small>
                    </td>
                    <td>{entry.amount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="bo-empty">
            {ar ? "لا يوجد نشاط مسجل بعد." : "No ERP activity recorded yet."}
          </p>
        )}
      </section>
    </div>
  );
}
