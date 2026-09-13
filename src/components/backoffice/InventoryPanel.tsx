import { useMemo, useState } from "react";
import { History, Plus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { BackOfficeData } from "@/hooks/useBackOffice";
import { ERP_UNITS, isLowStock, type InventoryBalance } from "@/lib/erp";
import { formatDateTime, formatMoney, formatNumber } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import type { RecordRequest } from "@/components/backoffice/RecordDialog";

type Sort = "name" | "quantity" | "status";

function statusOf(item: InventoryBalance): "out" | "low" | "ok" {
  if (Number(item.quantity) <= 0) return "out";
  return isLowStock(item) ? "low" : "ok";
}

export function InventoryPanel({
  data,
  currency,
  onAction,
}: {
  data: BackOfficeData;
  currency: string;
  onAction: (request: RecordRequest) => void;
}) {
  const { t, lang } = useI18n();
  const [term, setTerm] = useState("");
  const [status, setStatus] = useState("all");
  const [unit, setUnit] = useState("all");
  const [sort, setSort] = useState<Sort>("status");
  const [historyItem, setHistoryItem] = useState<InventoryBalance | null>(null);

  const rows = useMemo(() => {
    const needle = term.trim().toLowerCase();
    const filtered = data.inventory.filter((item) => {
      if (needle && !item.name.toLowerCase().includes(needle)) return false;
      if (unit !== "all" && item.unit !== unit) return false;
      const state = statusOf(item);
      if (status === "low" && state === "ok") return false;
      if (status === "out" && state !== "out") return false;
      if (status === "ok" && state !== "ok") return false;
      return true;
    });
    const rank = { out: 0, low: 1, ok: 2 } as const;
    return filtered.sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "quantity") return Number(b.quantity) - Number(a.quantity);
      return rank[statusOf(a)] - rank[statusOf(b)] || a.name.localeCompare(b.name);
    });
  }, [data.inventory, term, status, unit, sort]);

  const history = useMemo(
    () => (historyItem ? data.movements.filter((m) => m.item_id === historyItem.id) : []),
    [data.movements, historyItem],
  );

  function StatusBadge({ item }: { item: InventoryBalance }) {
    const state = statusOf(item);
    return (
      <Badge variant={state === "out" ? "destructive" : state === "low" ? "outline" : "secondary"}>
        {state === "out" ? t("bo.inv.out") : state === "low" ? t("bo.inv.lowBadge") : t("bo.inv.ok")}
      </Badge>
    );
  }

  function RowActions({ item }: { item: InventoryBalance }) {
    return (
      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" className="min-h-10" onClick={() => onAction({ kind: "receive", itemId: item.id })}>
          {t("bo.inv.receive")}
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="min-h-10"
          disabled={Number(item.quantity) <= 0}
          onClick={() => onAction({ kind: "issue", itemId: item.id })}
        >
          {t("bo.inv.issue")}
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="size-10"
          aria-label={t("bo.inv.history")}
          onClick={() => setHistoryItem(item)}
        >
          <History className="size-4" />
        </Button>
      </div>
    );
  }

  return (
    <section className="space-y-4">
      <div className="grid gap-2 md:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))_auto]">
        <Input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder={t("bo.inv.search")}
          aria-label={t("bo.inv.search")}
          className="min-h-11"
        />
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="min-h-11" aria-label={t("bo.inv.filterStatus")}>
            <SelectValue placeholder={t("bo.inv.filterStatus")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("sa.filter.all")}</SelectItem>
            <SelectItem value="ok">{t("bo.inv.ok")}</SelectItem>
            <SelectItem value="low">{t("bo.inv.lowBadge")}</SelectItem>
            <SelectItem value="out">{t("bo.inv.out")}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={unit} onValueChange={setUnit}>
          <SelectTrigger className="min-h-11" aria-label={t("bo.inv.filterUnit")}>
            <SelectValue placeholder={t("bo.inv.filterUnit")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("sa.filter.all")}</SelectItem>
            {ERP_UNITS.map((u) => (
              <SelectItem key={u} value={u}>
                {u}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sort} onValueChange={(value) => setSort(value as Sort)}>
          <SelectTrigger className="min-h-11" aria-label={t("bo.inv.sort")}>
            <SelectValue placeholder={t("bo.inv.sort")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="status">{t("bo.inv.sort.status")}</SelectItem>
            <SelectItem value="name">{t("bo.inv.sort.name")}</SelectItem>
            <SelectItem value="quantity">{t("bo.inv.sort.quantity")}</SelectItem>
          </SelectContent>
        </Select>
        <Button className="min-h-11" onClick={() => onAction({ kind: "item" })}>
          <Plus className="size-4" />
          {t("bo.inv.addItem")}
        </Button>
      </div>

      {data.inventory.length === 0 ? (
        <div className="panel grid min-h-48 place-items-center p-6 text-center text-sm text-muted-foreground">
          {t("bo.inv.empty")}
        </div>
      ) : rows.length === 0 ? (
        <div className="panel grid min-h-32 place-items-center p-6 text-center text-sm text-muted-foreground">
          {t("bo.inv.noMatch")}
        </div>
      ) : (
        <>
          <div className="panel hidden overflow-x-auto md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("bo.inv.item")}</TableHead>
                  <TableHead className="text-end">{t("bo.inv.quantity")}</TableHead>
                  <TableHead className="text-end">{t("bo.inv.reorder")}</TableHead>
                  <TableHead>{t("bo.inv.status")}</TableHead>
                  <TableHead className="text-end">{t("bo.inv.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.name}</TableCell>
                    <TableCell className="text-end tabular-nums">
                      {formatNumber(Number(item.quantity), lang)} {item.unit}
                    </TableCell>
                    <TableCell className="text-end tabular-nums text-muted-foreground">
                      {formatNumber(Number(item.reorder_level), lang)} {item.unit}
                    </TableCell>
                    <TableCell>
                      <StatusBadge item={item} />
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end">
                        <RowActions item={item} />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="grid gap-3 md:hidden">
            {rows.map((item) => (
              <article key={item.id} className="panel space-y-3 p-4">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="min-w-0 truncate font-semibold">{item.name}</h3>
                  <StatusBadge item={item} />
                </div>
                <p className="text-2xl font-semibold tabular-nums">
                  {formatNumber(Number(item.quantity), lang)}{" "}
                  <span className="text-sm font-normal text-muted-foreground">{item.unit}</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("bo.inv.reorder")}: {formatNumber(Number(item.reorder_level), lang)} {item.unit}
                </p>
                <RowActions item={item} />
              </article>
            ))}
          </div>
        </>
      )}

      <p className="text-xs text-muted-foreground">{t("bo.inv.appendOnly")}</p>

      <Sheet open={historyItem !== null} onOpenChange={(open) => !open && setHistoryItem(null)}>
        <SheetContent className="w-[min(28rem,100vw)] overflow-y-auto">
          <SheetTitle>
            {t("bo.inv.history")}
            {historyItem ? ` — ${historyItem.name}` : ""}
          </SheetTitle>
          {history.length === 0 ? (
            <p className="mt-6 text-sm text-muted-foreground">{t("bo.inv.historyEmpty")}</p>
          ) : (
            <ul className="mt-6 divide-y">
              {history.map((movement) => (
                <li key={movement.id} className="flex items-start justify-between gap-4 py-3 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium">{movement.reason}</p>
                    <time className="text-xs text-muted-foreground">
                      {formatDateTime(movement.created_at, lang)}
                    </time>
                    {Number(movement.unit_cost) > 0 ? (
                      <p className="text-xs text-muted-foreground">
                        {formatMoney(Number(movement.unit_cost), currency, lang)} / {historyItem?.unit}
                      </p>
                    ) : null}
                  </div>
                  <span
                    className={
                      Number(movement.quantity) > 0
                        ? "whitespace-nowrap font-semibold tabular-nums text-primary"
                        : "whitespace-nowrap font-semibold tabular-nums text-destructive"
                    }
                  >
                    {Number(movement.quantity) > 0 ? "+" : ""}
                    {formatNumber(Number(movement.quantity), lang)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </SheetContent>
      </Sheet>
    </section>
  );
}
