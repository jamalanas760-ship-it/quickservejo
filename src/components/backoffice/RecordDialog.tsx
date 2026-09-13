import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useBackOfficeWrite } from "@/hooks/useBackOffice";
import { EXPENSE_CATEGORIES, ERP_UNITS, type InventoryBalance, type Supplier } from "@/lib/erp";
import { humanError } from "@/lib/errors";
import { useI18n } from "@/lib/i18n";

export type RecordRequest =
  | { kind: "item" }
  | { kind: "supplier" }
  | { kind: "expense" }
  | { kind: "receive"; itemId?: string }
  | { kind: "issue"; itemId?: string };

const selectClass = "flex min-h-11 w-full rounded-xl border bg-background px-3 text-sm";

/** Single dialog for every Back Office write. Ledgers stay append-only. */
export function RecordDialog({
  restaurantId,
  request,
  onClose,
  inventory,
  suppliers,
  currency,
}: {
  restaurantId: string;
  request: RecordRequest | null;
  onClose: () => void;
  inventory: InventoryBalance[];
  suppliers: Supplier[];
  currency: string;
}) {
  const { t, lang } = useI18n();
  const ar = lang === "ar";
  const write = useBackOfficeWrite(restaurantId);
  const [error, setError] = useState<string | null>(null);
  const busy = write.isPending;

  const title = !request
    ? ""
    : request.kind === "item"
      ? t("bo.form.item")
      : request.kind === "supplier"
        ? t("bo.form.supplier")
        : request.kind === "expense"
          ? t("bo.form.expense")
          : request.kind === "receive"
            ? t("bo.form.receive")
            : t("bo.form.issue");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!request || busy) return;
    const values = new FormData(event.currentTarget);
    const text = (name: string) => String(values.get(name) ?? "").trim();
    const number = (name: string) => {
      const value = Number(text(name));
      if (!Number.isFinite(value)) throw new Error(ar ? "أدخل رقماً صحيحاً" : "Enter a valid number");
      return value;
    };
    setError(null);
    try {
      if (request.kind === "item") {
        await write.mutateAsync({
          kind: "item",
          name: text("name"),
          unit: text("unit"),
          reorder_level: number("reorder"),
        });
      } else if (request.kind === "supplier") {
        await write.mutateAsync({ kind: "supplier", name: text("name"), contact: text("contact") });
      } else if (request.kind === "expense") {
        await write.mutateAsync({
          kind: "expense",
          description: text("description"),
          category: text("category"),
          amount: number("amount"),
          expense_date: text("date"),
          reference: text("reference"),
        });
      } else {
        const magnitude = Math.abs(number("quantity"));
        await write.mutateAsync({
          kind: "movement",
          item_id: text("item"),
          supplier_id: text("supplier") || null,
          quantity: request.kind === "receive" ? magnitude : -magnitude,
          unit_cost: number("cost"),
          reason: text("reason"),
        });
      }
      toast.success(t("bo.form.saved"));
      onClose();
    } catch (cause) {
      const message = humanError(cause, lang);
      setError(message);
      toast.error(message);
    }
  }

  const movement = request?.kind === "receive" || request?.kind === "issue";
  const defaultItem = request && "itemId" in request ? request.itemId : undefined;

  return (
    <Dialog
      open={request !== null}
      onOpenChange={(open) => {
        if (!open && !busy) {
          setError(null);
          onClose();
        }
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{t("bo.form.check")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          {request?.kind === "item" || request?.kind === "supplier" ? (
            <label className="block space-y-2 text-sm">
              <span>{t("bo.form.name")}</span>
              <Input name="name" required maxLength={160} autoComplete="off" />
            </label>
          ) : null}

          {request?.kind === "item" ? (
            <>
              <label className="block space-y-2 text-sm">
                <span>{t("bo.inv.unit")}</span>
                <select name="unit" className={selectClass}>
                  {ERP_UNITS.map((unit) => (
                    <option key={unit}>{unit}</option>
                  ))}
                </select>
              </label>
              <label className="block space-y-2 text-sm">
                <span>{t("bo.form.reorderLevel")}</span>
                <Input name="reorder" required type="number" min="0" step="0.001" defaultValue="0" />
              </label>
            </>
          ) : null}

          {request?.kind === "supplier" ? (
            <label className="block space-y-2 text-sm">
              <span>{t("bo.sup.contact")}</span>
              <Input name="contact" maxLength={250} />
            </label>
          ) : null}

          {movement ? (
            <>
              <label className="block space-y-2 text-sm">
                <span>{t("bo.inv.item")}</span>
                <select name="item" className={selectClass} required defaultValue={defaultItem ?? ""}>
                  {inventory.map((item) => (
                    <option value={item.id} key={item.id}>
                      {item.name} ({item.unit})
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-2 text-sm">
                <span>{t("bo.form.quantity")}</span>
                <Input required name="quantity" type="number" min="0.001" step="0.001" />
              </label>
              {request?.kind === "receive" ? (
                <label className="block space-y-2 text-sm">
                  <span>{t("bo.form.supplierOptional")}</span>
                  <select name="supplier" className={selectClass}>
                    <option value="">—</option>
                    {suppliers.map((supplier) => (
                      <option key={supplier.id} value={supplier.id}>
                        {supplier.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <input type="hidden" name="supplier" value="" />
              )}
              <label className="block space-y-2 text-sm">
                <span>
                  {t("bo.form.unitCost")} ({currency})
                </span>
                <Input name="cost" type="number" min="0" step="0.001" defaultValue="0" required />
              </label>
              <label className="block space-y-2 text-sm">
                <span>{t("bo.form.reason")}</span>
                <Input name="reason" required maxLength={250} />
              </label>
              <p className="text-xs text-muted-foreground">{t("bo.form.noExpensePosted")}</p>
            </>
          ) : null}

          {request?.kind === "expense" ? (
            <>
              <label className="block space-y-2 text-sm">
                <span>{t("bo.form.description")}</span>
                <Input name="description" required maxLength={250} />
              </label>
              <label className="block space-y-2 text-sm">
                <span>{t("bo.form.category")}</span>
                <select name="category" className={selectClass}>
                  {EXPENSE_CATEGORIES.map((category) => (
                    <option key={category.value} value={category.value}>
                      {ar ? category.ar : category.en}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-2 text-sm">
                <span>
                  {t("bo.form.amount")} ({currency})
                </span>
                <Input name="amount" type="number" min="0.001" step="0.001" required />
              </label>
              <label className="block space-y-2 text-sm">
                <span>{t("bo.form.date")}</span>
                <Input name="date" type="date" defaultValue={new Date().toLocaleDateString("en-CA")} required />
              </label>
              <label className="block space-y-2 text-sm">
                <span>{t("bo.form.reference")}</span>
                <Input name="reference" maxLength={100} />
              </label>
            </>
          ) : null}

          {error ? (
            <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <Button className="min-h-11 w-full" disabled={busy}>
            {busy ? t("bo.form.saving") : t("bo.form.save")}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
