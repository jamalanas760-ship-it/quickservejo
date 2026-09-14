import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Grid2x2, Layers3, Plus, Power, Printer, QrCode, RefreshCw, Table2, UsersRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useRestaurant } from "@/hooks/useSuperAdmin";
import { useI18n } from "@/lib/i18n";
import { humanError } from "@/lib/errors";
import { logAudit } from "@/lib/audit";
import { downloadDataUrl, printQrCards, qrDataUrl, tableMenuUrl } from "@/lib/qr";
import { cn } from "@/lib/utils";

export function TablesManager({ restaurantId }: { restaurantId: string }) {
  const { t, lang } = useI18n();
  const qc = useQueryClient();
  const { data: restaurant } = useRestaurant(restaurantId);
  const [dialog, setDialog] = useState<"single" | "bulk" | null>(null);
  const [number, setNumber] = useState("");
  const [name, setName] = useState("");
  const [count, setCount] = useState("5");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{ label: string; dataUrl: string } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const tables = useQuery({
    queryKey: ["platform", "tables", restaurantId],
    queryFn: async () => {
      const { data, error } = await supabase.from("restaurant_tables").select("*").eq("restaurant_id", restaurantId).order("table_number", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  async function refresh() { await qc.invalidateQueries({ queryKey: ["platform", "tables", restaurantId] }); }
  async function create(rows: { table_number: string; table_name: string | null }[]) {
    setBusy(true);
    try {
      const { error } = await supabase.from("restaurant_tables").insert(rows.map((row) => ({ ...row, restaurant_id: restaurantId, qr_token: crypto.randomUUID().replace(/-/g, "") })));
      if (error) throw error;
      await logAudit("table.created", { restaurantId, entity: "restaurant_tables", metadata: { count: rows.length } });
      await refresh();
      toast.success(t("common.saved"));
      setDialog(null); setNumber(""); setName("");
    } catch (error) { toast.error(humanError(error, lang)); } finally { setBusy(false); }
  }
  async function toggle(id: string, active: boolean) {
    try { const { error } = await supabase.from("restaurant_tables").update({ is_active: !active }).eq("id", id); if (error) throw error; await refresh(); }
    catch (error) { toast.error(humanError(error, lang)); }
  }
  async function regenerate(id: string) {
    try { const { error } = await supabase.from("restaurant_tables").update({ qr_token: crypto.randomUUID().replace(/-/g, ""), qr_code_url: null }).eq("id", id); if (error) throw error; await refresh(); toast.success(t("common.saved")); }
    catch (error) { toast.error(humanError(error, lang)); }
  }
  async function showQr(table: any) {
    if (!restaurant) return;
    setPreview({ label: `${t("sa.tables.number")} ${table.table_number}`, dataUrl: await qrDataUrl(tableMenuUrl(restaurant.slug, table.qr_token)) });
  }
  async function printAll() {
    if (!restaurant) return;
    const activeRows = (tables.data ?? []).filter((row) => row.is_active);
    if (!activeRows.length) return;
    await printQrCards(restaurant.name, t("sa.tables.scan"), activeRows.map((row) => ({ table_number: row.table_number, table_name: row.table_name, url: tableMenuUrl(restaurant.slug, row.qr_token) })), { back: lang === "ar" ? "← رجوع" : "← Back", print: lang === "ar" ? "طباعة" : "Print" });
  }

  const next = (tables.data ?? []).length + 1;
  const active = (tables.data ?? []).filter((row) => row.is_active).length;
  const inactive = (tables.data ?? []).length - active;
  const selected = useMemo(() => (tables.data ?? []).find((row) => row.id === selectedId) ?? (tables.data ?? [])[0] ?? null, [selectedId, tables.data]);

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div><h1 className="qs-page-title">{lang === "ar" ? "إدارة الصالة" : "Floor Management"}</h1><p className="qs-page-subtitle">{lang === "ar" ? "راقب طاولاتك وأكواد QR وحافظ على الخدمة منظمة." : "Monitor tables, QR access, and keep service running smoothly."}</p></div>
        <div className="flex flex-wrap gap-2"><button type="button" className="qs-button-secondary" onClick={() => void printAll()}><Printer className="size-4" />{lang === "ar" ? "طباعة QR" : "Print QR"}</button><button type="button" className="qs-button-secondary" onClick={() => setDialog("bulk")}><Layers3 className="size-4" />{lang === "ar" ? "إضافة جماعية" : "Bulk Add"}</button><button type="button" className="qs-button-primary" onClick={() => setDialog("single")}><Plus className="size-4" />{lang === "ar" ? "طاولة جديدة" : "New Table"}</button></div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric icon={<Table2 className="size-5" />} value={String((tables.data ?? []).length)} label={lang === "ar" ? "كل الطاولات" : "Total Tables"} detail={lang === "ar" ? "في مساحة المطعم" : "in this restaurant"} tone="orange" />
        <Metric icon={<Power className="size-5" />} value={String(active)} label={lang === "ar" ? "نشطة" : "Active"} detail={`${Math.round(((tables.data ?? []).length ? active / (tables.data ?? []).length : 0) * 100)}%`} tone="green" />
        <Metric icon={<QrCode className="size-5" />} value={String(active)} label={lang === "ar" ? "QR متاح" : "QR Ready"} detail={lang === "ar" ? "جاهز للمسح" : "ready to scan"} tone="blue" />
        <Metric icon={<UsersRound className="size-5" />} value={String(inactive)} label={lang === "ar" ? "معطلة" : "Inactive"} detail={lang === "ar" ? "يمكن إعادة تفعيلها" : "can be reactivated"} tone="gray" />
      </div>

      {tables.isPending ? <Skeleton className="h-[620px] rounded-2xl" /> : (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_360px]">
          <section className="qs-card overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4"><div className="flex rounded-lg bg-muted p-1 text-xs font-semibold"><span className="rounded-md bg-card px-4 py-2 text-[#ff5a0a] shadow-sm">{lang === "ar" ? "الصالة الرئيسية" : "Main Dining"}</span><span className="px-4 py-2 text-muted-foreground">Patio</span><span className="px-4 py-2 text-muted-foreground">Bar</span></div><div className="flex items-center gap-2 text-xs text-muted-foreground"><Grid2x2 className="size-4" />{(tables.data ?? []).length} {lang === "ar" ? "طاولة" : "tables"}</div></div>
            <div className="relative min-h-[560px] overflow-hidden bg-[linear-gradient(90deg,color-mix(in_srgb,var(--border)_35%,transparent)_1px,transparent_1px),linear-gradient(color-mix(in_srgb,var(--border)_35%,transparent)_1px,transparent_1px)] bg-[size:42px_42px] p-5 sm:p-8">
              <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4">
                {(tables.data ?? []).map((table, index) => {
                  const selectedNow = selected?.id === table.id;
                  const varied = index % 5 === 0 ? "sm:col-span-2" : "";
                  return <button key={table.id} type="button" onClick={() => setSelectedId(table.id)} className={cn("relative min-h-[116px] rounded-2xl border p-3 text-start shadow-[0_8px_22px_rgba(0,0,0,.08)] transition hover:-translate-y-0.5", varied, selectedNow ? "border-[#ff5a0a] bg-orange-500/12 ring-2 ring-orange-500/20" : table.is_active ? "border-emerald-500/45 bg-emerald-500/8" : "border-border bg-card")}>
                    <span className="block font-display text-lg font-bold">T{table.table_number}</span><span className="mt-1 block truncate text-xs text-muted-foreground">{table.table_name || (lang === "ar" ? "طاولة" : "Dining table")}</span><span className={cn("absolute bottom-3 start-3 qs-status", table.is_active ? "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400" : "bg-slate-500/12 text-slate-500")}><span className={cn("size-1.5 rounded-full", table.is_active ? "bg-emerald-500" : "bg-slate-400")} />{table.is_active ? t("common.active") : t("common.inactive")}</span><QrCode className="absolute end-3 top-3 size-4 text-muted-foreground" />
                  </button>;
                })}
              </div>
              {(tables.data ?? []).length === 0 ? <div className="grid min-h-[420px] place-items-center text-center"><div><Table2 className="mx-auto size-10 text-muted-foreground" /><p className="mt-3 text-sm font-semibold">{lang === "ar" ? "لا توجد طاولات بعد" : "No tables yet"}</p><button type="button" className="qs-button-primary mt-4" onClick={() => setDialog("single")}><Plus className="size-4" />{lang === "ar" ? "أضف أول طاولة" : "Add first table"}</button></div></div> : null}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-3 text-[11px] text-muted-foreground"><div className="flex gap-4"><span><i className="me-1 inline-block size-2 rounded-full bg-emerald-500" />{lang === "ar" ? "نشطة" : "Active"}</span><span><i className="me-1 inline-block size-2 rounded-full bg-slate-400" />{lang === "ar" ? "معطلة" : "Inactive"}</span><span><i className="me-1 inline-block size-2 rounded-full bg-[#ff5a0a]" />{lang === "ar" ? "محددة" : "Selected"}</span></div><span>{(tables.data ?? []).length} {lang === "ar" ? "طاولة" : "Tables"}</span></div>
          </section>

          {selected ? <aside className="qs-card self-start overflow-hidden xl:sticky xl:top-24"><div className="flex items-center justify-between border-b border-border p-5"><div><p className="text-xs text-muted-foreground">{lang === "ar" ? "الطاولة المحددة" : "Selected table"}</p><h2 className="mt-1 font-display text-2xl font-bold">T{selected.table_number}</h2></div><span className={cn("qs-status", selected.is_active ? "bg-emerald-500/12 text-emerald-600" : "bg-slate-500/12 text-slate-500")}>{selected.is_active ? t("common.active") : t("common.inactive")}</span></div><div className="space-y-3 p-5"><div className="rounded-xl border border-border bg-muted/35 p-4"><p className="text-xs text-muted-foreground">{lang === "ar" ? "اسم الطاولة" : "Table name"}</p><p className="mt-1 font-bold">{selected.table_name || "—"}</p></div><button type="button" className="qs-button-primary w-full" onClick={() => void showQr(selected)}><QrCode className="size-4" />{lang === "ar" ? "عرض رمز QR" : "Open QR Code"}</button><div className="grid grid-cols-2 gap-2"><button type="button" className="qs-button-secondary" onClick={() => void regenerate(selected.id)}><RefreshCw className="size-4" />{lang === "ar" ? "تجديد" : "Regenerate"}</button><button type="button" className="qs-button-secondary" onClick={() => void toggle(selected.id, selected.is_active)}><Power className="size-4" />{selected.is_active ? (lang === "ar" ? "تعطيل" : "Disable") : (lang === "ar" ? "تفعيل" : "Enable")}</button></div><div className="mt-5 border-t border-border pt-4"><h3 className="text-sm font-bold">{lang === "ar" ? "الوصول الرقمي" : "Digital access"}</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">{lang === "ar" ? "كل طاولة مرتبطة برمز QR فريد وآمن لقائمة المطعم." : "Each table has a unique secure QR token linked to the restaurant menu."}</p></div></div></aside> : null}
        </div>
      )}

      <Dialog open={dialog !== null} onOpenChange={(open) => !open && setDialog(null)}><DialogContent><DialogHeader><DialogTitle>{dialog === "bulk" ? (lang === "ar" ? "إضافة طاولات" : "Bulk Add Tables") : (lang === "ar" ? "طاولة جديدة" : "New Table")}</DialogTitle><DialogDescription>{lang === "ar" ? "سيتم إنشاء QR فريد لكل طاولة." : "A unique QR code will be created for every table."}</DialogDescription></DialogHeader>{dialog === "bulk" ? <div className="space-y-2"><Label>{t("sa.wizard.tableCount")}</Label><Input type="number" min="1" max="100" value={count} onChange={(e) => setCount(e.target.value)} /></div> : <div className="space-y-3"><div><Label>{t("sa.tables.number")}</Label><Input value={number} placeholder={String(next)} onChange={(e) => setNumber(e.target.value)} /></div><div><Label>{t("sa.tables.name")}</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div></div>}<DialogFooter><Button variant="ghost" onClick={() => setDialog(null)}>{t("common.cancel")}</Button><Button disabled={busy} onClick={() => dialog === "bulk" ? void create(Array.from({ length: Math.min(Math.max(Number(count) || 1, 1), 100) }, (_, index) => ({ table_number: String(next + index), table_name: null }))) : void create([{ table_number: number.trim() || String(next), table_name: name.trim() || null }])}>{t("common.create")}</Button></DialogFooter></DialogContent></Dialog>

      <Dialog open={preview !== null} onOpenChange={(open) => !open && setPreview(null)}><DialogContent className="max-w-sm"><DialogHeader><DialogTitle>{preview?.label}</DialogTitle><DialogDescription>{t("sa.tables.scan")}</DialogDescription></DialogHeader>{preview ? <img src={preview.dataUrl} alt={preview.label} className="mx-auto size-56 rounded-xl bg-white p-2" /> : null}<DialogFooter>{preview ? <Button variant="outline" onClick={() => downloadDataUrl(preview.dataUrl, `${preview.label}.png`)}>Download</Button> : null}<Button onClick={() => setPreview(null)}>{t("common.close")}</Button></DialogFooter></DialogContent></Dialog>
    </div>
  );
}

function Metric({ icon, value, label, detail, tone }: { icon: React.ReactNode; value: string; label: string; detail: string; tone: "orange" | "green" | "blue" | "gray" }) {
  const toneClass = tone === "orange" ? "bg-orange-500/12 text-orange-600" : tone === "green" ? "bg-emerald-500/12 text-emerald-600" : tone === "blue" ? "bg-blue-500/12 text-blue-600" : "bg-slate-500/12 text-slate-500";
  return <div className="qs-stat flex items-center gap-4"><span className={`grid size-12 place-items-center rounded-full ${toneClass}`}>{icon}</span><div><p className="font-display text-2xl font-bold">{value}</p><p className="text-xs font-semibold text-muted-foreground">{label}</p><p className="mt-1 text-[10px] text-muted-foreground">{detail}</p></div></div>;
}
