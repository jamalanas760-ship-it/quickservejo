import { useEffect, useState, type FormEvent } from "react";
import { Info } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useBackOfficeWrite } from "@/hooks/useBackOffice";
import { EXPENSE_CATEGORIES, ERP_UNITS, type InventoryBalance, type Supplier } from "@/lib/erp";
import { humanError } from "@/lib/errors";
import { formatMoney, formatNumber } from "@/lib/format";
import { useI18n } from "@/lib/i18n";

export type RecordRequest =
  | { kind: "item" }
  | { kind: "supplier"; supplierId?: string }
  | { kind: "procurement"; itemId?: string }
  | { kind: "expense" }
  | { kind: "receive"; itemId?: string }
  | { kind: "issue"; itemId?: string };

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
  const [movementQuantity, setMovementQuantity] = useState(0);
  const [movementCost, setMovementCost] = useState(0);
  const [itemId, setItemId] = useState("");
  const busy = write.isPending;

  const requestKind = request?.kind;
  const initialItemId =
    request && "itemId" in request
      ? (request.itemId ?? inventory[0]?.id ?? "")
      : (inventory[0]?.id ?? "");
  useEffect(() => {
    setMovementQuantity(0);
    setMovementCost(0);
    setError(null);
    setItemId(initialItemId);
  }, [requestKind, initialItemId]);

  const selectedSupplier =
    request?.kind === "supplier"
      ? suppliers.find((row) => row.id === request.supplierId)
      : undefined;

  const title = selectedSupplier
    ? ar
      ? "تعديل المورد"
      : "Edit supplier"
    : request
      ? {
          item: ar ? "إضافة مادة" : "Add inventory item",
          supplier: ar ? "إضافة مورد" : "Add supplier",
          procurement: ar ? "طلب شراء جديد" : "New procurement request",
          expense: ar ? "مصروف يدوي" : "Manual expense",
          receive: ar ? "استلام توريد" : "Receive supplies",
          issue: ar ? "صرف مخزون" : "Issue stock",
        }[request.kind]
      : "";
  const description = request
    ? {
        item: ar ? "أنشئ مادة مخزون جديدة." : "Create a new inventory item.",
        supplier: ar ? "أضف معلومات المورد." : "Add supplier information.",
        procurement: ar ? "أرسل طلب شراء للمراجعة." : "Send a procurement request for review.",
        expense: ar ? "سجّل مصروفاً تجارياً يدوياً." : "Record a business expense manually.",
        receive: ar
          ? "سجّل المخزون الوارد من الموردين."
          : "Record incoming stock from your suppliers.",
        issue: ar ? "استخدم مواد من المخزون." : "Use items from inventory.",
      }[request.kind]
    : "";
  const submitLabel = selectedSupplier
    ? ar
      ? "حفظ التغييرات"
      : "Save changes"
    : request
      ? {
          item: ar ? "إضافة المادة" : "Add item",
          supplier: ar ? "إضافة المورد" : "Add supplier",
          procurement: ar ? "إنشاء الطلب" : "Create request",
          expense: ar ? "تسجيل المصروف" : "Record expense",
          receive: ar ? "استلام التوريد" : "Receive supplies",
          issue: ar ? "صرف المخزون" : "Issue stock",
        }[request.kind]
      : "";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!request || busy) return;
    const values = new FormData(event.currentTarget);
    const text = (name: string) => String(values.get(name) ?? "").trim();
    const number = (name: string) => {
      const value = Number(text(name));
      if (!Number.isFinite(value))
        throw new Error(ar ? "أدخل رقماً صحيحاً" : "Enter a valid number");
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
        await write.mutateAsync(
          selectedSupplier
            ? {
                kind: "supplier_edit",
                id: selectedSupplier.id,
                name: text("name"),
                contact: text("contact"),
              }
            : { kind: "supplier", name: text("name"), contact: text("contact") },
        );
      } else if (request.kind === "procurement") {
        const itemId = text("item");
        const item = inventory.find((row) => row.id === itemId);
        if (!item) throw new Error(ar ? "اختر مادة مخزون" : "Choose an inventory item");
        await write.mutateAsync({
          kind: "procurement",
          item_id: item.id,
          item_name_snapshot: item.name,
          quantity: Math.abs(number("quantity")),
          unit: item.unit,
          estimated_unit_cost: Math.max(0, number("estimatedCost")),
          supplier_id: text("supplier") || null,
          needed_by: text("neededBy") || null,
          notes: text("notes"),
        });
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
        const selectedItem = inventory.find((row) => row.id === text("item"));
        if (!selectedItem) throw new Error(ar ? "اختر مادة مخزون" : "Choose an inventory item");
        if (request.kind === "issue" && magnitude > Number(selectedItem.quantity))
          throw new Error(
            ar ? "الكمية أكبر من المخزون المتاح." : "Quantity exceeds available stock.",
          );
        const unitCost = number("cost");
        if (request.kind === "receive" && unitCost <= 0)
          throw new Error(
            ar
              ? "سعر الوحدة مطلوب لتسجيل المصروف المالي تلقائياً"
              : "Unit price is required so Finance can record the receipt automatically",
          );
        await write.mutateAsync({
          kind: "movement",
          item_id: text("item"),
          supplier_id: text("supplier") || null,
          quantity: request.kind === "receive" ? magnitude : -magnitude,
          unit_cost: unitCost,
          movement_type: request.kind === "receive" ? "receipt" : "issue",
          reason: text("reason"),
        });
      }
      toast.success(
        request.kind === "receive"
          ? ar
            ? "تم استلام المخزون وتسجيل المصروف في المالية"
            : "Stock received and Finance expense recorded"
          : t("bo.form.saved"),
      );
      onClose();
    } catch (cause) {
      const message = humanError(cause, lang);
      setError(message);
      toast.error(message);
    }
  }

  const movement = request?.kind === "receive" || request?.kind === "issue";
  const receiving = request?.kind === "receive";
  const procurement = request?.kind === "procurement";
  const selectedItem = inventory.find((row) => row.id === itemId);
  const totalCost = Math.max(0, movementQuantity) * Math.max(0, movementCost);
  const stockAfter =
    Number(selectedItem?.quantity ?? 0) + (receiving ? movementQuantity : -movementQuantity);
  const itemField = (
    <label>
      <span>{ar ? "مادة المخزون" : "Inventory item"}</span>
      <select
        aria-label={ar ? "مادة المخزون" : "Inventory item"}
        name="item"
        required
        value={itemId}
        onChange={(e) => setItemId(e.target.value)}
      >
        <option value="" disabled>
          {ar ? "اختر مادة" : "Choose an item"}
        </option>
        {inventory.map((item) => (
          <option value={item.id} key={item.id}>
            {item.name} ({item.unit})
          </option>
        ))}
      </select>
    </label>
  );
  const quantityField = (
    <label>
      <span>
        {ar ? "الكمية" : "Quantity"}
        {selectedItem ? ` (${selectedItem.unit})` : ""}
      </span>
      <Input
        required
        name="quantity"
        type="number"
        min="0.001"
        max={request?.kind === "issue" ? Number(selectedItem?.quantity ?? 0) : undefined}
        step="0.001"
        value={movementQuantity || ""}
        onChange={(e) => setMovementQuantity(Number(e.target.value) || 0)}
      />
    </label>
  );
  const supplierField = (
    <label>
      <span>{ar ? "المورد (اختياري)" : "Supplier (optional)"}</span>
      <select aria-label={ar ? "المورد (اختياري)" : "Supplier (optional)"} name="supplier">
        <option value="">{ar ? "غير محدد" : "Not selected"}</option>
        {suppliers.map((supplier) => (
          <option key={supplier.id} value={supplier.id}>
            {supplier.name}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <Sheet
      open={request !== null}
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <SheetContent
        side={ar ? "left" : "right"}
        dir={ar ? "rtl" : "ltr"}
        className="bo-record"
        closeLabel={ar ? "إغلاق" : "Close"}
        onOpenAutoFocus={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => {
          if (busy) e.preventDefault();
        }}
        onPointerDownOutside={(e) => {
          if (busy) e.preventDefault();
        }}
      >
        <SheetHeader className="bo-record-header">
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>{description}</SheetDescription>
        </SheetHeader>
        <form onSubmit={submit}>
          <div className="bo-record-body">
            <fieldset disabled={busy}>
              {request?.kind === "item" || request?.kind === "supplier" ? (
                <label>
                  <span>{ar ? "الاسم" : "Name"}</span>
                  <Input
                    name="name"
                    required
                    maxLength={160}
                    autoComplete="off"
                    defaultValue={selectedSupplier?.name ?? ""}
                  />
                </label>
              ) : null}
              {request?.kind === "item" ? (
                <div className="bo-field-grid">
                  <label>
                    <span>{ar ? "الوحدة" : "Unit"}</span>
                    <select aria-label={ar ? "الوحدة" : "Unit"} name="unit">
                      {ERP_UNITS.map((unit) => (
                        <option key={unit}>{unit}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>{ar ? "حد إعادة الطلب" : "Reorder level"}</span>
                    <Input
                      name="reorder"
                      required
                      type="number"
                      min="0"
                      step="0.001"
                      defaultValue="0"
                    />
                  </label>
                </div>
              ) : null}
              {request?.kind === "supplier" ? (
                <label>
                  <span>{ar ? "معلومات الاتصال" : "Contact"}</span>
                  <Input
                    name="contact"
                    maxLength={250}
                    defaultValue={selectedSupplier?.contact ?? ""}
                  />
                </label>
              ) : null}
              {procurement ? (
                <>
                  {itemField}
                  <div className="bo-field-grid">
                    {quantityField}
                    <label>
                      <span>
                        {ar ? "سعر الوحدة التقديري" : "Estimated unit cost"} ({currency})
                      </span>
                      <Input
                        name="estimatedCost"
                        required
                        type="number"
                        min="0"
                        step="0.001"
                        value={movementCost}
                        onChange={(e) => setMovementCost(Number(e.target.value) || 0)}
                      />
                    </label>
                  </div>
                  {supplierField}
                  <div className="bo-field-grid">
                    <label>
                      <span>{ar ? "مطلوب قبل" : "Needed by"}</span>
                      <Input name="neededBy" type="date" />
                    </label>
                    <label>
                      <span>{ar ? "ملاحظات" : "Notes"}</span>
                      <textarea name="notes" maxLength={500} />
                    </label>
                  </div>
                  <div className="bo-live-summary blue">
                    <div>
                      <small>{ar ? "الإجمالي التقديري" : "Estimated total"}</small>
                      <strong>{formatMoney(totalCost, currency, lang)}</strong>
                    </div>
                    <p>
                      {ar
                        ? "أرسل الطلب للمراجعة قبل الشراء."
                        : "Send for review before purchasing."}
                    </p>
                  </div>
                </>
              ) : null}
              {movement ? (
                <>
                  {itemField}
                  {!receiving && selectedItem ? (
                    <div className="bo-available">
                      <strong>
                        {formatNumber(Number(selectedItem.quantity), lang)} {selectedItem.unit}{" "}
                        {ar ? "متاح" : "available"}
                      </strong>
                      <small>{ar ? "المخزون الحالي" : "Current stock level"}</small>
                    </div>
                  ) : null}
                  {quantityField}
                  <div className="bo-field-grid">
                    <label>
                      <span>
                        {ar ? "سعر الوحدة" : "Unit cost"} ({currency})
                      </span>
                      <Input
                        name="cost"
                        type="number"
                        min={receiving ? "0.001" : "0"}
                        step="0.001"
                        value={movementCost || ""}
                        onChange={(e) => setMovementCost(Number(e.target.value) || 0)}
                        required
                      />
                    </label>
                    {receiving ? (
                      supplierField
                    ) : (
                      <label>
                        <span>{ar ? "السبب" : "Reason"}</span>
                        <Input name="reason" required maxLength={250} />
                      </label>
                    )}
                  </div>
                  {receiving ? (
                    <label>
                      <span>{ar ? "السبب" : "Reason"}</span>
                      <Input
                        name="reason"
                        required
                        maxLength={250}
                        defaultValue={ar ? "استلام توريد" : "Supply receipt"}
                      />
                    </label>
                  ) : (
                    <input type="hidden" name="supplier" value="" />
                  )}
                  <div className="bo-live-summary" aria-live="polite">
                    <div>
                      <small>
                        {receiving
                          ? ar
                            ? "المخزون بعد الاستلام"
                            : "Stock after receipt"
                          : ar
                            ? "المخزون بعد الصرف"
                            : "Stock after issue"}
                      </small>
                      <strong>
                        {formatNumber(stockAfter, lang)} {selectedItem?.unit}
                      </strong>
                      <p>
                        {ar ? "المتاح الآن" : "Currently"}{" "}
                        {formatNumber(Number(selectedItem?.quantity ?? 0), lang)}{" "}
                        {selectedItem?.unit}
                      </p>
                    </div>
                    <div>
                      <small>
                        {receiving
                          ? ar
                            ? "التكلفة الإجمالية"
                            : "Total cost"
                          : ar
                            ? "القيمة"
                            : "Value"}
                      </small>
                      <strong>{formatMoney(totalCost, currency, lang)}</strong>
                      <p>
                        {formatNumber(movementQuantity, lang)} ×{" "}
                        {formatMoney(movementCost, currency, lang)}
                      </p>
                    </div>
                  </div>
                  {receiving ? (
                    <p className="text-xs text-muted-foreground">
                      {ar
                        ? "يُسجّل وقت الاستلام والمصروف المرتبط تلقائياً عند الحفظ."
                        : "Receipt time and its linked Finance expense are recorded automatically on save."}
                    </p>
                  ) : null}
                </>
              ) : null}
              {request?.kind === "expense" ? (
                <>
                  <label>
                    <span>{ar ? "الوصف" : "Description"}</span>
                    <Input name="description" required maxLength={250} />
                  </label>
                  <label>
                    <span>{ar ? "الفئة" : "Category"}</span>
                    <select aria-label={ar ? "الفئة" : "Category"} name="category">
                      {EXPENSE_CATEGORIES.map((category) => (
                        <option key={category.value} value={category.value}>
                          {ar ? category.ar : category.en}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="bo-field-grid">
                    <label>
                      <span>
                        {ar ? "المبلغ" : "Amount"} ({currency})
                      </span>
                      <Input name="amount" type="number" min="0.001" step="0.001" required />
                    </label>
                    <label>
                      <span>{ar ? "التاريخ" : "Date"}</span>
                      <Input
                        name="date"
                        type="date"
                        defaultValue={new Date().toLocaleDateString("en-CA")}
                        required
                      />
                    </label>
                  </div>
                  <label>
                    <span>{ar ? "المرجع (اختياري)" : "Reference (optional)"}</span>
                    <Input name="reference" maxLength={100} />
                  </label>
                  <div className="bo-available flex items-center gap-2">
                    <Info size={16} />
                    {ar ? "يُسجّل كمصروف يدوي." : "Recorded as a manual expense."}
                  </div>
                </>
              ) : null}
            </fieldset>
            {error ? (
              <p
                role="alert"
                className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                {error}
              </p>
            ) : null}
          </div>
          <footer className="bo-record-footer">
            <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
              {ar ? "إلغاء" : "Cancel"}
            </Button>
            <Button
              type="submit"
              disabled={busy || ((movement || procurement) && !inventory.length)}
            >
              {busy ? t("bo.form.saving") : submitLabel}
            </Button>
          </footer>
        </form>
      </SheetContent>
    </Sheet>
  );
}
