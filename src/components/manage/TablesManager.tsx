import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useRestaurant } from "@/hooks/useSuperAdmin";
import { useI18n } from "@/lib/i18n";
import { humanError } from "@/lib/errors";
import { logAudit } from "@/lib/audit";
import { downloadDataUrl, printQrCards, qrDataUrl, tableMenuUrl } from "@/lib/qr";

export function TablesManager({ restaurantId }: { restaurantId: string }) {
  const { t, lang } = useI18n();
  const queryClient = useQueryClient();
  const { data: restaurant } = useRestaurant(restaurantId);
  const [dialog, setDialog] = useState<"single" | "bulk" | null>(null);
  const [number, setNumber] = useState("");
  const [name, setName] = useState("");
  const [count, setCount] = useState("5");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{ label: string; dataUrl: string } | null>(null);

  const tables = useQuery({
    queryKey: ["platform", "tables", restaurantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("restaurant_tables")
        .select("*")
        .eq("restaurant_id", restaurantId)
        .order("table_number", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["platform"] });
  }

  async function createTables(rows: { table_number: string; table_name: string | null }[]) {
    setBusy(true);
    try {
      const { error } = await supabase.from("restaurant_tables").insert(
        rows.map((r) => ({
          restaurant_id: restaurantId,
          table_number: r.table_number,
          table_name: r.table_name,
          qr_token: crypto.randomUUID().replace(/-/g, ""),
        })),
      );
      if (error) throw error;
      await logAudit("table.created", {
        restaurantId,
        entity: "restaurant_tables",
        metadata: { count: rows.length },
      });
      await refresh();
      toast.success(t("common.saved"));
      setDialog(null);
      setNumber("");
      setName("");
    } catch (error) {
      toast.error(humanError(error, lang));
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(id: string, isActive: boolean) {
    try {
      const { error } = await supabase
        .from("restaurant_tables")
        .update({ is_active: !isActive })
        .eq("id", id);
      if (error) throw error;
      await logAudit(isActive ? "table.deactivated" : "table.updated", {
        restaurantId,
        entity: "restaurant_tables",
        entityId: id,
      });
      await refresh();
    } catch (error) {
      toast.error(humanError(error, lang));
    }
  }

  async function regenerate(id: string) {
    try {
      const { error } = await supabase
        .from("restaurant_tables")
        .update({ qr_token: crypto.randomUUID().replace(/-/g, ""), qr_code_url: null })
        .eq("id", id);
      if (error) throw error;
      await logAudit("table.qr_regenerated", {
        restaurantId,
        entity: "restaurant_tables",
        entityId: id,
      });
      await refresh();
      toast.success(t("common.saved"));
    } catch (error) {
      toast.error(humanError(error, lang));
    }
  }

  async function showQr(tableNumber: string, token: string) {
    if (!restaurant) return;
    const url = tableMenuUrl(restaurant.slug, token);
    setPreview({ label: `${t("sa.tables.number")} ${tableNumber}`, dataUrl: await qrDataUrl(url) });
  }

  async function printAll() {
    if (!restaurant) return;
    const rows = (tables.data ?? []).filter((tb) => tb.is_active);
    if (!rows.length) return;
    await printQrCards(
      restaurant.name,
      t("sa.tables.scan"),
      rows.map((tb) => ({
        table_number: tb.table_number,
        table_name: tb.table_name,
        url: tableMenuUrl(restaurant.slug, tb.qr_token),
      })),
      {
        back: lang === "ar" ? "← رجوع" : "← Back",
        print: lang === "ar" ? "طباعة" : "Print",
      },
    );
  }

  const nextNumber = (tables.data ?? []).length + 1;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">{t("sa.tables.title")}</h2>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => void printAll()}>
            {t("sa.tables.print")}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setDialog("bulk")}>
            {t("sa.tables.bulk")}
          </Button>
          <Button size="sm" onClick={() => setDialog("single")}>
            {t("sa.tables.new")}
          </Button>
        </div>
      </div>

      {tables.isPending ? (
        <Skeleton className="h-64 rounded-xl" />
      ) : (tables.data ?? []).length === 0 ? (
        <div className="panel p-8 text-center text-sm text-muted-foreground">
          {t("sa.tables.empty")}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(tables.data ?? []).map((tb) => (
            <div key={tb.id} className="panel space-y-3 p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">
                    {t("sa.tables.number")} {tb.table_number}
                  </p>
                  <p className="text-xs text-muted-foreground">{tb.table_name ?? "—"}</p>
                </div>
                <Badge variant={tb.is_active ? "secondary" : "outline"}>
                  {tb.is_active ? t("common.active") : t("common.inactive")}
                </Badge>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void showQr(tb.table_number, tb.qr_token)}
                >
                  {t("sa.tables.qr")}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => void regenerate(tb.id)}>
                  {t("sa.tables.regenerate")}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void toggleActive(tb.id, tb.is_active)}
                >
                  {tb.is_active ? t("sa.staff.deactivate") : t("sa.staff.reactivate")}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialog !== null} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialog === "bulk" ? t("sa.tables.bulk") : t("sa.tables.new")}
            </DialogTitle>
            <DialogDescription>{t("sa.tables.title")}</DialogDescription>
          </DialogHeader>
          {dialog === "bulk" ? (
            <div className="space-y-1.5">
              <Label>{t("sa.wizard.tableCount")}</Label>
              <Input
                type="number"
                min="1"
                max="100"
                value={count}
                onChange={(e) => setCount(e.target.value)}
              />
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>{t("sa.tables.number")}</Label>
                <Input
                  value={number}
                  placeholder={String(nextNumber)}
                  onChange={(e) => setNumber(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t("sa.tables.name")}</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialog(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              disabled={busy}
              onClick={() => {
                if (dialog === "bulk") {
                  const n = Math.min(Math.max(Number(count) || 1, 1), 100);
                  void createTables(
                    Array.from({ length: n }, (_, i) => ({
                      table_number: String(nextNumber + i),
                      table_name: null,
                    })),
                  );
                } else {
                  void createTables([
                    {
                      table_number: number.trim() || String(nextNumber),
                      table_name: name.trim() || null,
                    },
                  ]);
                }
              }}
            >
              {t("common.create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={preview !== null} onOpenChange={(open) => !open && setPreview(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{preview?.label}</DialogTitle>
            <DialogDescription>{t("sa.tables.scan")}</DialogDescription>
          </DialogHeader>
          {preview ? (
            <img src={preview.dataUrl} alt={preview.label} className="mx-auto size-56" />
          ) : null}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() =>
                preview && downloadDataUrl(preview.dataUrl, `${preview.label}.png`)
              }
            >
              {t("sa.tables.download")}
            </Button>
            <Button onClick={() => setPreview(null)}>{t("common.close")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
