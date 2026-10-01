import {
  ArrowLeftRight,
  Package,
  PackageCheck,
  Plus,
  Receipt,
  ShoppingCart,
  Truck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { BackOfficeAccess } from "@/hooks/useBackOffice";
import { useI18n } from "@/lib/i18n";
import type { RecordRequest } from "./RecordDialog";

export function QuickActions({
  access,
  onAction,
  dropdown = false,
}: {
  access: BackOfficeAccess;
  onAction: (request: RecordRequest) => void;
  dropdown?: boolean;
}) {
  const { lang } = useI18n(),
    ar = lang === "ar";
  const actions = [
    {
      kind: "receive",
      group: ar ? "المخزون" : "Stock",
      icon: PackageCheck,
      label: ar ? "استلام توريد" : "Receive supplies",
      detail: ar ? "سجّل المخزون الوارد" : "Record incoming stock",
      show: access.inventory,
    },
    {
      kind: "issue",
      group: ar ? "المخزون" : "Stock",
      icon: ArrowLeftRight,
      label: ar ? "صرف مخزون" : "Issue stock",
      detail: ar ? "استخدام مواد من المخزون" : "Use items from inventory",
      show: access.inventory,
    },
    {
      kind: "procurement",
      group: ar ? "المشتريات" : "Purchasing",
      icon: ShoppingCart,
      label: ar ? "طلب شراء جديد" : "New request",
      detail: ar ? "اطلب مواد من الموردين" : "Request items from suppliers",
      show: access.procurement,
    },
    {
      kind: "expense",
      group: ar ? "المالية" : "Finance",
      icon: Receipt,
      label: ar ? "مصروف يدوي" : "Manual expense",
      detail: ar ? "سجّل مصروفاً يدوياً" : "Record a business expense",
      show: access.finance,
    },
    {
      kind: "item",
      group: ar ? "الإدارة" : "Administration",
      icon: Package,
      label: ar ? "إضافة مادة" : "Add item",
      detail: ar ? "مادة مخزون جديدة" : "Create an inventory item",
      show: access.inventory,
    },
    {
      kind: "supplier",
      group: ar ? "الإدارة" : "Administration",
      icon: Truck,
      label: ar ? "إضافة مورد" : "Add supplier",
      detail: ar ? "معلومات المورد" : "Add supplier information",
      show: access.procurement,
    },
  ].filter((a) => a.show);
  if (!actions.length) return null;
  if (!dropdown)
    return (
      <div className="bo-quick-grid">
        {actions.slice(0, 4).map((a) => (
          <button
            type="button"
            key={a.kind}
            onClick={() => onAction({ kind: a.kind } as RecordRequest)}
          >
            <span className={`bo-icon ${a.kind === "procurement" ? "blue" : ""}`}>
              <a.icon size={18} />
            </span>
            <span>
              <strong>{a.label}</strong>
              <small>{a.detail}</small>
            </span>
          </button>
        ))}
      </div>
    );
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="bo-quick-trigger">
          <Plus size={15} />
          {ar ? "إجراءات سريعة" : "Quick actions"}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="bo-more bo-action-menu"
        align="end"
        style={{ direction: ar ? "rtl" : "ltr" }}
      >
        {actions.map((a, i) => (
          <div key={a.kind}>
            {i === 0 || actions[i - 1]?.group !== a.group ? (
              <DropdownMenuLabel>{a.group}</DropdownMenuLabel>
            ) : null}
            <DropdownMenuItem onSelect={() => onAction({ kind: a.kind } as RecordRequest)}>
              <span className={`bo-icon ${a.kind === "procurement" ? "blue" : ""}`}>
                <a.icon size={17} />
              </span>
              <span>
                <strong>{a.label}</strong>
                <small>{a.detail}</small>
              </span>
            </DropdownMenuItem>
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
