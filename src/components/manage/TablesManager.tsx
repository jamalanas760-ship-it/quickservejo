import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Circle, Grid2x2, Layers3, Pencil, Plus, Power, Printer, QrCode, RectangleHorizontal, RefreshCw, Square, Table2, UsersRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useRestaurant } from "@/hooks/useSuperAdmin";
import { useI18n } from "@/lib/i18n";
import { humanError } from "@/lib/errors";
import { logAudit } from "@/lib/audit";
import { downloadDataUrl, printQrCards, qrDataUrl, tableMenuUrl } from "@/lib/qr";
import { cn } from "@/lib/utils";

type FloorTable = {
  id: string;
  restaurant_id: string;
  table_number: string;
  table_name: string | null;
  qr_token: string;
  qr_code_url: string | null;
  is_active: boolean;
  zone?: string;
  capacity?: number;
  shape?: string;
  layout?: Record<string, unknown> | null;
};

const ZONES = [
  { id: "main", en: "Main Dining", ar: "الصالة الرئيسية" },
  { id: "patio", en: "Patio", ar: "التراس" },
  { id: "bar", en: "Bar", ar: "البار" },
] as const;

export function TablesManager({ restaurantId }: { restaurantId: string }) {
  const { t, lang } = useI18n();
  const ar = lang === "ar";
  const qc = useQueryClient();
  const { data: restaurant } = useRestaurant(restaurantId);
  const [dialog, setDialog] = useState<"single" | "bulk" | "edit" | null>(null);
  const [number, setNumber] = useState("");
  const [name, setName] = useState("");
  const [count, setCount] = useState("5");
  const [zone, setZone] = useState("main");
  const [capacity, setCapacity] = useState("4");
  const [shape, setShape] = useState("rectangle");
  const [activeZone, setActiveZone] = useState("main");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{ label: string; dataUrl: string } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const tables = useQuery<FloorTable[]>({
    queryKey: ["platform", "tables", restaurantId],
    queryFn: async () => {
      const { data, error } = await supabase.from("restaurant_tables").select("*").eq("restaurant_id", restaurantId).order("table_number", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as FloorTable[];
    },
  });

  async function refresh() { await qc.invalidateQueries({ queryKey: ["platform", "tables", restaurantId] }); }

  async function create(rows: { table_number: string; table_name: string | null }[]) {
    setBusy(true);
    try {
      const payload = rows.map((row) => ({ ...row, restaurant_id: restaurantId, qr_token: crypto.randomUUID().replace(/-/g, ""), zone, capacity: Math.max(1, Math.min(30, Number(capacity) || 4)), shape }));
      const { error } = await (supabase.from("restaurant_tables") as any).insert(payload);
      if (error) throw error;
      await logAudit("table.created", { restaurantId, entity: "restaurant_tables", metadata: { count: rows.length } });
      await refresh(); toast.success(t("common.saved")); setDialog(null); setNumber(""); setName("");
    } catch (error) { toast.error(humanError(error, lang)); } finally { setBusy(false); }
  }

  async function saveEdit() {
    const selected = (tables.data ?? []).find((row) => row.id === selectedId);
    if (!selected) return;
    setBusy(true);
    try {
      const { error } = await (supabase.from("restaurant_tables") as any).update({ table_number: number.trim() || selected.table_number, table_name: name.trim() || null, zone, capacity: Math.max(1, Math.min(30, Number(capacity) || 4)), shape }).eq("id", selected.id).eq("restaurant_id", restaurantId);
      if (error) throw error;
      await refresh(); toast.success(ar ? "تم تحديث الطاولة" : "Table updated"); setDialog(null);
    } catch (error) { toast.error(humanError(error, lang)); } finally { setBusy(false); }
  }

  function openEdit(table: FloorTable) {
    setSelectedId(table.id); setNumber(table.table_number); setName(table.table_name ?? ""); setZone(table.zone || "main"); setCapacity(String(table.capacity ?? 4)); setShape(table.shape || "rectangle"); setDialog("edit");
  }

  async function toggle(id: string, active: boolean) {
    try { const { error } = await supabase.from("restaurant_tables").update({ is_active: !active }).eq("id", id); if (error) throw error; await refresh(); }
    catch (error) { toast.error(humanError(error, lang)); }
  }

  async function regenerate(id: string) {
    try { const { error } = await supabase.from("restaurant_tables").update({ qr_token: crypto.randomUUID().replace(/-/g, ""), qr_code_url: null }).eq("id", id); if (error) throw error; await refresh(); toast.success(t("common.saved")); }
    catch (error) { toast.error(humanError(error, lang)); }
  }

  async function showQr(table: FloorTable) {
    if (!restaurant) return;
    setPreview({ label: `${t("sa.tables.number")} ${table.table_number}`, dataUrl: await qrDataUrl(tableMenuUrl(restaurant.slug, table.qr_token)) });
  }

  async function printAll() {
    if (!restaurant) return;
    const activeRows = (tables.data ?? []).filter((row) => row.is_active);
    if (!activeRows.length) return;
    await printQrCards(restaurant.name, t("sa.tables.scan"), activeRows.map((row) => ({ table_number: row.table_number, table_name: row.table_name, url: tableMenuUrl(restaurant.slug, row.qr_token) })), { back: ar ? "← رجوع" : "← Back", print: ar ? "طباعة" : "Print" });
  }

  const next = (tables.data ?? []).length + 1;
  const active = (tables.data ?? []).filter((row) => row.is_active).length;
  const inactive = (tables.data ?? []).length - active;
  const zoneTables = (tables.data ?? []).filter((row) => (row.zone || "main") === activeZone);
  const selected = useMemo(() => (tables.data ?? []).find((row) => row.id === selectedId) ?? zoneTables[0] ?? null, [selectedId, tables.data, zoneTables]);

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div><h1 className="qs-page-title">{ar ? "إدارة الصالة" : "Floor Management"}</h1><p className="qs-page-subtitle">{ar ? "خصص مناطق المطعم والطاولات والسعة والشكل وأكواد QR." : "Customize restaurant zones, table capacity, shape, and QR access."}</p></div>
        <div className="grid grid-cols-2 gap-2 sm:flex"><button type="button" className="qs-button-secondary" onClick={() => void printAll()}><Printer className="size-4" />{ar ? "طباعة QR" : "Print QR"}</button><button type="button" className="qs-button-secondary" onClick={() => { setZone(activeZone); setCapacity("4"); setShape("rectangle"); setDialog("bulk"); }}><Layers3 className="size-4" />{ar ? "إضافة جماعية" : "Bulk Add"}</button><button type="button" className="qs-button-primary col-span-2 sm:col-auto" onClick={() => { setNumber(""); setName(""); setZone(activeZone); setCapacity("4"); setShape("rectangle"); setDialog("single"); }}><Plus className="size-4" />{ar ? "طاولة جديدة" : "New Table"}</button></div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric icon={<Table2 className="size-5" />} value={String((tables.data ?? []).length)} label={ar ? "كل الطاولات" : "Total Tables"} detail={ar ? "في مساحة المطعم" : "in this restaurant"} tone="orange" />
        <Metric icon={<Power className="size-5" />} value={String(active)} label={ar ? "نشطة" : "Active"} detail={`${Math.round(((tables.data ?? []).length ? active / (tables.data ?? []).length : 0) * 100)}%`} tone="green" />
        <Metric icon={<QrCode className="size-5" />} value={String(active)} label={ar ? "QR متاح" : "QR Ready"} detail={ar ? "جاهز للمسح" : "ready to scan"} tone="blue" />
        <Metric icon={<UsersRound className="size-5" />} value={String(inactive)} label={ar ? "معطلة" : "Inactive"} detail={ar ? "يمكن إعادة تفعيلها" : "can be reactivated"} tone="gray" />
      </div>

      {tables.isPending ? <Skeleton className="h-[620px] rounded-2xl" /> : (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_360px]">
          <section className="qs-card overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
              <div className="no-scrollbar flex max-w-full overflow-x-auto rounded-xl bg-muted p-1 text-xs font-semibold">
                {ZONES.map((entry) => <button key={entry.id} type="button" onClick={() => { setActiveZone(entry.id); setSelectedId(null); }} className={cn("shrink-0 rounded-lg px-4 py-2 transition", activeZone === entry.id ? "bg-card text-[#ff5a0a] shadow-sm" : "text-muted-foreground hover:text-foreground")}>{ar ? entry.ar : entry.en}</button>)}
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground"><Grid2x2 className="size-4" />{zoneTables.length} {ar ? "طاولة" : "tables"}</div>
            </div>

            <div className="qs-floor-canvas relative min-h-[560px] overflow-auto p-5 sm:p-8">
              <div className="grid auto-rows-[138px] grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
                {zoneTables.map((table, index) => {
                  const focused = selected?.id === table.id;
                  const wide = table.shape === "rectangle" && index % 4 === 0 ? "sm:col-span-2" : "";
                  return (
                    <button key={table.id} type="button" data-active={table.is_active} data-selected={focused} onClick={() => setSelectedId(table.id)} onDoubleClick={() => openEdit(table)} className={cn("qs-floor-table group relative min-h-[118px] border p-4 text-start transition hover:-translate-y-0.5", table.shape === "round" ? "rounded-full" : table.shape === "square" ? "rounded-xl" : "rounded-[22px]", wide)}>
                      <span className="block font-display text-xl font-bold text-white">T{table.table_number}</span>
                      <span className="mt-1 block truncate text-xs text-white/65">{table.table_name || (ar ? "طاولة" : "Dining table")}</span>
                      <span className="mt-2 flex items-center gap-1 text-[10px] text-white/55"><UsersRound className="size-3" />{table.capacity ?? 4} {ar ? "مقاعد" : "seats"}</span>
                      <span className={cn("absolute bottom-3 start-3 qs-status", table.is_active ? "bg-emerald-500/18 text-emerald-300" : "bg-white/10 text-white/60")}><span className={cn("size-1.5 rounded-full", table.is_active ? "bg-emerald-400" : "bg-slate-400")} />{table.is_active ? t("common.active") : t("common.inactive")}</span>
                      <QrCode className="absolute end-3 top-3 size-4 text-white/55" />
                      <span className="absolute end-3 bottom-3 grid size-8 place-items-center rounded-lg bg-black/20 text-white/70 opacity-0 transition group-hover:opacity-100"><Pencil className="size-3.5" /></span>
                    </button>
                  );
                })}
              </div>
              {zoneTables.length === 0 ? <div className="grid min-h-[420px] place-items-center text-center text-white"><div><Table2 className="mx-auto size-10 text-white/60" /><p className="mt-3 text-sm font-semibold">{ar ? "لا توجد طاولات في هذه المنطقة" : "No tables in this zone"}</p><button type="button" className="qs-button-primary mt-4" onClick={() => { setZone(activeZone); setDialog("single"); }}><Plus className="size-4" />{ar ? "أضف طاولة" : "Add table"}</button></div></div> : null}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-3 text-[11px] text-muted-foreground">
              <div className="flex gap-4"><span><i className="me-1 inline-block size-2 rounded-full bg-emerald-500" />{ar ? "نشطة" : "Active"}</span><span><i className="me-1 inline-block size-2 rounded-full bg-slate-400" />{ar ? "معطلة" : "Inactive"}</span></div>
              <span>{zoneTables.length} {ar ? "طاولة" : "Tables"}</span>
            </div>
          </section>

          {selected ? <aside className="qs-card self-start overflow-hidden xl:sticky xl:top-24"><div className="flex items-center justify-between border-b border-border p-5"><div><p className="text-xs text-muted-foreground">{ar ? "تفاصيل الطاولة" : "Table details"}</p><h2 className="mt-1 font-display text-2xl font-bold">T{selected.table_number}</h2></div><span className={cn("qs-status", selected.is_active ? "bg-emerald-500/12 text-emerald-600" : "bg-slate-500/12 text-slate-500")}>{selected.is_active ? t("common.active") : t("common.inactive")}</span></div><div className="space-y-3 p-5"><div className="grid grid-cols-2 gap-2"><Info label={ar ? "المنطقة" : "Zone"} value={ZONES.find((item) => item.id === (selected.zone || "main"))?.[ar ? "ar" : "en"] ?? selected.zone ?? "Main"} /><Info label={ar ? "السعة" : "Capacity"} value={`${selected.capacity ?? 4}`} /></div><Info label={ar ? "اسم الطاولة" : "Table name"} value={selected.table_name || "—"} /><button type="button" className="qs-button-primary w-full" onClick={() => openEdit(selected)}><Pencil className="size-4" />{ar ? "تخصيص الطاولة" : "Customize Table"}</button><button type="button" className="qs-button-secondary w-full" onClick={() => void showQr(selected)}><QrCode className="size-4" />{ar ? "عرض رمز QR" : "Open QR Code"}</button><div className="grid grid-cols-2 gap-2"><button type="button" className="qs-button-secondary" onClick={() => void regenerate(selected.id)}><RefreshCw className="size-4" />{ar ? "تجديد" : "Regenerate"}</button><button type="button" className="qs-button-secondary" onClick={() => void toggle(selected.id, selected.is_active)}><Power className="size-4" />{selected.is_active ? (ar ? "تعطيل" : "Disable") : (ar ? "تفعيل" : "Enable")}</button></div></div></aside> : null}
        </div>
      )}

      <Dialog open={dialog !== null} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>{dialog === "edit" ? (ar ? "تخصيص الطاولة" : "Customize Table") : dialog === "bulk" ? (ar ? "إضافة طاولات" : "Bulk Add Tables") : (ar ? "طاولة جديدة" : "New Table")}</DialogTitle><DialogDescription>{ar ? "حدد المنطقة والسعة والشكل. كل طاولة تحتفظ برمز QR فريد." : "Choose zone, capacity, and shape. Every table keeps its own secure QR code."}</DialogDescription></DialogHeader>
          <div className="space-y-4">
            {dialog === "bulk" ? <div className="space-y-2"><Label>{t("sa.wizard.tableCount")}</Label><Input type="number" min="1" max="100" value={count} onChange={(e) => setCount(e.target.value)} /></div> : <div className="grid grid-cols-2 gap-3"><div><Label>{t("sa.tables.number")}</Label><Input value={number} placeholder={String(next)} onChange={(e) => setNumber(e.target.value)} /></div><div><Label>{t("sa.tables.name")}</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div></div>}
            <div className="grid gap-3 sm:grid-cols-2"><div className="space-y-1.5"><Label>{ar ? "المنطقة" : "Zone"}</Label><Select value={zone} onValueChange={setZone}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{ZONES.map((item) => <SelectItem key={item.id} value={item.id}>{ar ? item.ar : item.en}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1.5"><Label>{ar ? "عدد المقاعد" : "Seat capacity"}</Label><Input type="number" min="1" max="30" value={capacity} onChange={(e) => setCapacity(e.target.value)} /></div></div>
            <div className="space-y-2"><Label>{ar ? "شكل الطاولة" : "Table shape"}</Label><div className="grid grid-cols-3 gap-2">{[{ id: "rectangle", icon: RectangleHorizontal, en: "Rectangle", ar: "مستطيل" }, { id: "square", icon: Square, en: "Square", ar: "مربع" }, { id: "round", icon: Circle, en: "Round", ar: "دائري" }].map(({ id, icon: Icon, en, ar: arabic }) => <button key={id} type="button" onClick={() => setShape(id)} className={cn("flex min-h-20 flex-col items-center justify-center gap-2 rounded-xl border text-xs font-semibold", shape === id ? "border-[#ff5a0a] bg-orange-500/10 text-[#ff5a0a]" : "border-border hover:bg-muted")}><Icon className="size-5" />{ar ? arabic : en}</button>)}</div></div>
          </div>
          <DialogFooter><Button variant="ghost" onClick={() => setDialog(null)}>{t("common.cancel")}</Button><Button disabled={busy} onClick={() => dialog === "edit" ? void saveEdit() : dialog === "bulk" ? void create(Array.from({ length: Math.min(Math.max(Number(count) || 1, 1), 100) }, (_, index) => ({ table_number: String(next + index), table_name: null }))) : void create([{ table_number: number.trim() || String(next), table_name: name.trim() || null }])}>{dialog === "edit" ? t("common.save") : t("common.create")}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={preview !== null} onOpenChange={(open) => !open && setPreview(null)}><DialogContent className="max-w-sm"><DialogHeader><DialogTitle>{preview?.label}</DialogTitle><DialogDescription>{t("sa.tables.scan")}</DialogDescription></DialogHeader>{preview ? <img src={preview.dataUrl} alt={preview.label} className="mx-auto size-56 rounded-xl bg-white p-2" /> : null}<DialogFooter>{preview ? <Button variant="outline" onClick={() => downloadDataUrl(preview.dataUrl, `${preview.label}.png`)}>Download</Button> : null}<Button onClick={() => setPreview(null)}>{t("common.close")}</Button></DialogFooter></DialogContent></Dialog>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border border-border bg-muted/35 p-3"><p className="text-[10px] text-muted-foreground">{label}</p><p className="mt-1 truncate text-sm font-bold">{value}</p></div>; }
function Metric({ icon, value, label, detail, tone }: { icon: React.ReactNode; value: string; label: string; detail: string; tone: "orange" | "green" | "blue" | "gray" }) { const toneClass = tone === "orange" ? "bg-orange-500/12 text-orange-600" : tone === "green" ? "bg-emerald-500/12 text-emerald-600" : tone === "blue" ? "bg-blue-500/12 text-blue-600" : "bg-slate-500/12 text-slate-500"; return <div className="qs-stat flex items-center gap-4"><span className={`grid size-12 place-items-center rounded-full ${toneClass}`}>{icon}</span><div><p className="font-display text-2xl font-bold">{value}</p><p className="text-xs font-semibold text-muted-foreground">{label}</p><p className="mt-1 text-[10px] text-muted-foreground">{detail}</p></div></div>; }
