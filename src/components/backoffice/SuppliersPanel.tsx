import { useMemo, useState } from "react";
import { Plus, Truck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { BackOfficeData } from "@/hooks/useBackOffice";
import { formatNumber } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import type { RecordRequest } from "@/components/backoffice/RecordDialog";

export function SuppliersPanel({
  data,
  onAction,
}: {
  data: BackOfficeData;
  onAction: (request: RecordRequest) => void;
}) {
  const { t, lang } = useI18n();
  const [term, setTerm] = useState("");

  const receiptsBySupplier = useMemo(() => {
    const map = new Map<string, number>();
    for (const movement of data.movements) {
      if (!movement.supplier_id) continue;
      map.set(movement.supplier_id, (map.get(movement.supplier_id) ?? 0) + 1);
    }
    return map;
  }, [data.movements]);

  const rows = useMemo(() => {
    const needle = term.trim().toLowerCase();
    if (!needle) return data.suppliers;
    return data.suppliers.filter((supplier) =>
      `${supplier.name} ${supplier.contact}`.toLowerCase().includes(needle),
    );
  }, [data.suppliers, term]);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder={t("bo.sup.search")}
          aria-label={t("bo.sup.search")}
          className="min-h-11 min-w-40 flex-1"
        />
        <Button className="min-h-11" onClick={() => onAction({ kind: "supplier" })}>
          <Plus className="size-4" />
          {t("bo.sup.add")}
        </Button>
      </div>

      {data.suppliers.length === 0 ? (
        <div className="panel grid min-h-48 place-items-center p-6 text-center text-sm text-muted-foreground">
          {t("bo.sup.empty")}
        </div>
      ) : rows.length === 0 ? (
        <div className="panel grid min-h-32 place-items-center p-6 text-center text-sm text-muted-foreground">
          {t("bo.sup.noMatch")}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((supplier) => (
            <article key={supplier.id} className="panel space-y-3 p-5">
              <div className="flex items-start gap-3">
                <div className="grid size-10 shrink-0 place-items-center rounded-xl border bg-muted">
                  <Truck className="size-4 text-primary" aria-hidden />
                </div>
                <div className="min-w-0">
                  <h3 className="truncate font-semibold">{supplier.name}</h3>
                  <p className="text-xs text-muted-foreground">
                    {t("bo.sup.receipts")}: {formatNumber(receiptsBySupplier.get(supplier.id) ?? 0, lang)}
                  </p>
                </div>
              </div>
              <p className="whitespace-pre-wrap text-sm text-muted-foreground">{supplier.contact || "—"}</p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
