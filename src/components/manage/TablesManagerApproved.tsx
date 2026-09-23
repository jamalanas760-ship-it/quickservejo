import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  Building2,
  Download,
  ImagePlus,
  Layers3,
  Minus,
  Plus,
  Printer,
  RotateCw,
  Save,
  Square,
  Table2,
  Trash2,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useRestaurant } from "@/hooks/useSuperAdmin";
import { humanError } from "@/lib/errors";
import { useI18n } from "@/lib/i18n";
import { downloadDataUrl, downloadText, printQrCards, qrDataUrl, qrSvg, tableMenuUrl } from "@/lib/qr";
import { removeRestaurantImage, uploadRestaurantImage } from "@/lib/storage";
import { cn } from "@/lib/utils";

type FloorTable = {
  id: string;
  restaurant_id: string;
  table_number: string;
  table_name: string | null;
  qr_token: string;
  qr_code_url: string | null;
  is_active: boolean;
  zone?: string | null;
  capacity?: number | null;
  shape?: string | null;
  layout?: Record<string, unknown> | null;
};

type Layout = { x: number; y: number; rotation: number; scale: number };
type Shape = "round" | "square" | "rectangle";
type Zone = { id: string; en: string; ar: string };
type FloorConfig = { id: string; en: string; ar: string; zones: Zone[]; backgroundUrl: string | null };
type DragState = { id: string; pointerId: number; startX: number; startY: number; start: Layout; latest: Layout; mode: "move" | "resize" };

const W = 1000;
const H = 700;
const DEFAULT_ZONES: Zone[] = [
  { id: "main", en: "Main Dining", ar: "الصالة الرئيسية" },
  { id: "patio", en: "Patio", ar: "التراس" },
  { id: "bar", en: "Bar", ar: "البار" },
];
const DEFAULT_FLOOR: FloorConfig = { id: "ground", en: "Ground Floor", ar: "الطابق الأرضي", zones: DEFAULT_ZONES, backgroundUrl: null };
const SLOTS = [
  [170, 180], [360, 180], [540, 180], [170, 350], [360, 350], [540, 350],
  [735, 185], [870, 185], [735, 365], [870, 365], [330, 560], [515, 560], [700, 560], [850, 560],
];

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
function asNumber(value: unknown, fallback: number) { const number = Number(value); return Number.isFinite(number) ? number : fallback; }
function shapeOf(value: unknown): Shape { return value === "round" || value === "circle" ? "round" : value === "square" ? "square" : "rectangle"; }
function objectValue(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function layoutOf(row: FloorTable, index: number): Layout {
  const raw = objectValue(row.layout);
  const slot = SLOTS[index % SLOTS.length]!;
  return {
    x: clamp(asNumber(raw.x, slot[0]), 55, 945),
    y: clamp(asNumber(raw.y, slot[1]), 55, 645),
    rotation: clamp(asNumber(raw.rotation, 0), -180, 180),
    scale: clamp(asNumber(raw.scale, 1), 0.68, 1.55),
  };
}
function floorOf(row: FloorTable) { const raw = objectValue(row.layout); return typeof raw.floor === "string" && raw.floor ? raw.floor : "ground"; }
function slug(value: string, fallback: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9\u0600-\u06ff]+/g, "-").replace(/^-|-$/g, "") || fallback;
}
function parseZones(value: unknown): Zone[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const raw = objectValue(entry);
    const id = typeof raw.id === "string" ? raw.id : "";
    if (!id) return [];
    const en = typeof raw.en === "string" && raw.en ? raw.en : id;
    const ar = typeof raw.ar === "string" && raw.ar ? raw.ar : en;
    return [{ id, en, ar }];
  });
}
function floorsFromTheme(value: unknown): FloorConfig[] {
  const theme = objectValue(value);
  const workspace = objectValue(theme.workspace);
  const legacyBackground = typeof workspace.floorPlanBackgroundUrl === "string" && workspace.floorPlanBackgroundUrl ? workspace.floorPlanBackgroundUrl : null;
  if (!Array.isArray(workspace.tableFloors) || workspace.tableFloors.length === 0) {
    return [{ ...DEFAULT_FLOOR, zones: DEFAULT_ZONES.map((zone) => ({ ...zone })), backgroundUrl: legacyBackground }];
  }
  const parsed = workspace.tableFloors.flatMap((entry, index) => {
    const raw = objectValue(entry);
    const id = typeof raw.id === "string" && raw.id ? raw.id : `floor-${index + 1}`;
    const en = typeof raw.en === "string" && raw.en ? raw.en : `Floor ${index + 1}`;
    const ar = typeof raw.ar === "string" && raw.ar ? raw.ar : en;
    const zones = parseZones(raw.zones);
    const backgroundUrl = typeof raw.backgroundUrl === "string" && raw.backgroundUrl ? raw.backgroundUrl : (id === "ground" ? legacyBackground : null);
    return [{ id, en, ar, zones: zones.length ? zones : [{ id: "main", en: "Main Dining", ar: "الصالة الرئيسية" }], backgroundUrl }];
  });
  return parsed.length ? parsed : [{ ...DEFAULT_FLOOR }];
}

export function TablesManagerApproved({ restaurantId }: { restaurantId: string }) {
  const { lang, t } = useI18n();
  const ar = lang === "ar";
  const qc = useQueryClient();
  const restaurantQuery = useRestaurant(restaurantId);
  const restaurant = restaurantQuery.data;
  const floorRef = useRef<HTMLDivElement | null>(null);
  const floorInputRef = useRef<HTMLInputElement | null>(null);
  const dragRef = useRef<DragState | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [zoneOpen, setZoneOpen] = useState(false);
  const [floorOpen, setFloorOpen] = useState(false);
  const [zoneName, setZoneName] = useState("");
  const [floorName, setFloorName] = useState("");
  const [floors, setFloors] = useState<FloorConfig[]>([{ ...DEFAULT_FLOOR }]);
  const [activeFloor, setActiveFloor] = useState("ground");
  const [activeZone, setActiveZone] = useState("all");
  const [zoom, setZoom] = useState(1);
  const [mobileMode, setMobileMode] = useState<"floor" | "list">("floor");
  const [draft, setDraft] = useState<Record<string, Layout>>({});
  const [busy, setBusy] = useState(false);
  const [floorBusy, setFloorBusy] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [form, setForm] = useState({ number: "", name: "", capacity: "4", floor: "ground", zone: "main", shape: "square" as Shape, active: true, rotation: "0" });

  const tables = useQuery<FloorTable[]>({
    queryKey: ["platform", "tables", restaurantId],
    queryFn: async () => {
      const { data, error } = await supabase.from("restaurant_tables").select("*").eq("restaurant_id", restaurantId).order("table_number", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as FloorTable[];
    },
  });

  useEffect(() => {
    setDraft((previous) => {
      const next: Record<string, Layout> = {};
      (tables.data ?? []).forEach((row, index) => { next[row.id] = previous[row.id] ?? layoutOf(row, index); });
      return next;
    });
  }, [tables.data]);

  useEffect(() => {
    const next = floorsFromTheme(restaurant?.menu_theme);
    setFloors(next);
    setActiveFloor((current) => next.some((floor) => floor.id === current) ? current : next[0]!.id);
  }, [restaurant?.menu_theme]);

  const currentFloor = floors.find((floor) => floor.id === activeFloor) ?? floors[0] ?? DEFAULT_FLOOR;
  const currentZones = currentFloor.zones;
  const floorTables = useMemo(() => (tables.data ?? []).filter((row) => floorOf(row) === activeFloor), [tables.data, activeFloor]);
  const visibleTables = useMemo(() => floorTables.filter((row) => activeZone === "all" || (row.zone || currentZones[0]?.id || "main") === activeZone), [floorTables, activeZone, currentZones]);
  const selected = (tables.data ?? []).find((row) => row.id === selectedId) ?? null;

  useEffect(() => {
    if (!selected) return;
    const floor = floorOf(selected);
    const floorConfig = floors.find((entry) => entry.id === floor) ?? currentFloor;
    const zone = selected.zone || floorConfig.zones[0]?.id || "main";
    setForm({
      number: selected.table_number,
      name: selected.table_name ?? "",
      capacity: String(selected.capacity ?? 4),
      floor,
      zone,
      shape: shapeOf(selected.shape),
      active: selected.is_active,
      rotation: String(Math.round((draft[selected.id] ?? layoutOf(selected, 0)).rotation)),
    });
  }, [selectedId, floors]);

  useEffect(() => {
    if (!selected || !restaurant) return;
    let cancelled = false;
    setQr(null);
    void qrDataUrl(tableMenuUrl(restaurant.slug, selected.qr_token)).then((value) => { if (!cancelled) setQr(value); });
    return () => { cancelled = true; };
  }, [selected?.id, selected?.qr_token, restaurant?.slug]);

  useEffect(() => {
    setActiveZone("all");
    if (selected && floorOf(selected) !== activeFloor) setSelectedId(null);
  }, [activeFloor]);

  async function refresh() { await qc.invalidateQueries({ queryKey: ["platform", "tables", restaurantId] }); }

  async function persistFloors(nextFloors: FloorConfig[]) {
    const current = await supabase.from("restaurants").select("menu_theme").eq("id", restaurantId).single();
    if (current.error) throw current.error;
    const theme = objectValue(current.data.menu_theme);
    const workspace = objectValue(theme.workspace);
    const groundBackground = nextFloors.find((floor) => floor.id === "ground")?.backgroundUrl ?? null;
    const { error } = await supabase.from("restaurants").update({
      menu_theme: { ...theme, workspace: { ...workspace, tableFloors: nextFloors, floorPlanBackgroundUrl: groundBackground } },
    }).eq("id", restaurantId);
    if (error) throw error;
    setFloors(nextFloors);
    qc.setQueryData(["platform", "restaurant", restaurantId], (cached: typeof restaurant) => cached ? { ...cached, menu_theme: { ...theme, workspace: { ...workspace, tableFloors: nextFloors, floorPlanBackgroundUrl: groundBackground } } } : cached);
    await qc.invalidateQueries({ queryKey: ["platform", "restaurant", restaurantId], exact: true });
  }

  async function persistLayout(id: string, layout: Layout) {
    const row = (tables.data ?? []).find((entry) => entry.id === id);
    if (!row) return;
    const raw = objectValue(row.layout);
    const { error } = await (supabase.from("restaurant_tables") as any).update({ layout: { ...raw, ...layout } }).eq("id", id).eq("restaurant_id", restaurantId);
    if (error) toast.error(humanError(error, lang));
  }

  function openCreate() {
    const next = (tables.data ?? []).length + 1;
    setForm({ number: String(next), name: "", capacity: "4", floor: activeFloor, zone: currentZones[0]?.id ?? "main", shape: "square", active: true, rotation: "0" });
    setCreateOpen(true);
  }

  async function createTable() {
    setBusy(true);
    try {
      const index = floorTables.length;
      const slot = SLOTS[index % SLOTS.length]!;
      const targetFloor = floors.find((floor) => floor.id === form.floor) ?? currentFloor;
      const safeZone = targetFloor.zones.some((zone) => zone.id === form.zone) ? form.zone : targetFloor.zones[0]?.id ?? "main";
      const { data, error } = await (supabase.from("restaurant_tables") as any).insert({
        restaurant_id: restaurantId,
        table_number: form.number.trim() || String((tables.data ?? []).length + 1),
        table_name: form.name.trim() || null,
        qr_token: crypto.randomUUID().replace(/-/g, ""),
        zone: safeZone,
        capacity: clamp(Number(form.capacity) || 4, 1, 30),
        shape: form.shape,
        is_active: form.active,
        layout: { x: slot[0], y: slot[1], rotation: 0, scale: 1, floor: form.floor },
      }).select("*").single();
      if (error) throw error;
      await refresh();
      setCreateOpen(false);
      setActiveFloor(form.floor);
      setActiveZone("all");
      if (data?.id) setSelectedId(data.id);
      toast.success(ar ? "تمت إضافة الطاولة" : "Table added");
    } catch (error) { toast.error(humanError(error, lang)); }
    finally { setBusy(false); }
  }

  async function saveSelected() {
    if (!selected) return;
    setBusy(true);
    try {
      const current = draft[selected.id] ?? layoutOf(selected, 0);
      const rotation = clamp(Number(form.rotation) || 0, -180, 180);
      const targetFloor = floors.find((floor) => floor.id === form.floor) ?? currentFloor;
      const safeZone = targetFloor.zones.some((zone) => zone.id === form.zone) ? form.zone : targetFloor.zones[0]?.id ?? "main";
      const next = { ...current, rotation };
      const raw = objectValue(selected.layout);
      const { error } = await (supabase.from("restaurant_tables") as any).update({
        table_number: form.number.trim() || selected.table_number,
        table_name: form.name.trim() || null,
        capacity: clamp(Number(form.capacity) || 4, 1, 30),
        zone: safeZone,
        shape: form.shape,
        is_active: form.active,
        layout: { ...raw, ...next, floor: form.floor },
      }).eq("id", selected.id).eq("restaurant_id", restaurantId);
      if (error) throw error;
      setDraft((value) => ({ ...value, [selected.id]: next }));
      await refresh();
      setActiveFloor(form.floor);
      toast.success(ar ? "تم حفظ التغييرات" : "Table changes saved");
    } catch (error) { toast.error(humanError(error, lang)); }
    finally { setBusy(false); }
  }

  async function deleteSelected() {
    if (!selected || !confirm(ar ? "حذف هذه الطاولة؟" : "Delete this table?")) return;
    setBusy(true);
    try {
      const { error } = await supabase.from("restaurant_tables").delete().eq("id", selected.id).eq("restaurant_id", restaurantId);
      if (error) throw error;
      setSelectedId(null);
      await refresh();
      toast.success(ar ? "تم حذف الطاولة" : "Table deleted");
    } catch (error) { toast.error(humanError(error, lang)); }
    finally { setBusy(false); }
  }

  async function addZone() {
    const clean = zoneName.trim();
    if (!clean) return;
    const id = slug(clean, `zone-${Date.now()}`);
    if (currentFloor.zones.some((zone) => zone.id === id)) { toast.error(ar ? "هذه المنطقة موجودة بالفعل." : "This zone already exists."); return; }
    const nextFloors = floors.map((floor) => floor.id === activeFloor
      ? { ...floor, zones: [...floor.zones, { id, en: clean, ar: clean }] }
      : floor);
    try {
      await persistFloors(nextFloors);
      setZoneName("");
      setZoneOpen(false);
      setActiveZone(id);
      toast.success(ar ? "تمت إضافة المنطقة" : "Zone added");
    } catch (error) { toast.error(humanError(error, lang)); }
  }

  async function deleteZone(zoneId: string) {
    const inUse = floorTables.some((table) => (table.zone || currentZones[0]?.id || "main") === zoneId);
    if (inUse) { toast.error(ar ? "انقل الطاولات من هذه المنطقة قبل حذفها." : "Move tables out of this zone before deleting it."); return; }
    if (currentZones.length <= 1) { toast.error(ar ? "يجب أن يحتوي الطابق على منطقة واحدة على الأقل." : "Each floor needs at least one zone."); return; }
    const zone = currentZones.find((entry) => entry.id === zoneId);
    if (!confirm(ar ? `حذف منطقة ${zone?.ar ?? zoneId}؟` : `Delete ${zone?.en ?? zoneId} zone?`)) return;
    const nextFloors = floors.map((floor) => floor.id === activeFloor ? { ...floor, zones: floor.zones.filter((entry) => entry.id !== zoneId) } : floor);
    try {
      await persistFloors(nextFloors);
      setActiveZone("all");
      toast.success(ar ? "تم حذف المنطقة" : "Zone deleted");
    } catch (error) { toast.error(humanError(error, lang)); }
  }

  async function addFloor() {
    const clean = floorName.trim();
    if (!clean) return;
    const id = slug(clean, `floor-${Date.now()}`);
    const nextFloor: FloorConfig = { id, en: clean, ar: clean, zones: [{ id: "main", en: "Main Dining", ar: "الصالة الرئيسية" }], backgroundUrl: null };
    const nextFloors = [...floors.filter((floor) => floor.id !== id), nextFloor];
    try {
      await persistFloors(nextFloors);
      setFloorName("");
      setFloorOpen(false);
      setActiveFloor(id);
      toast.success(ar ? "تمت إضافة الطابق" : "Floor added");
    } catch (error) { toast.error(humanError(error, lang)); }
  }

  async function deleteFloor() {
    if (floors.length <= 1) { toast.error(ar ? "يجب أن يبقى طابق واحد على الأقل." : "At least one floor must remain."); return; }
    if (floorTables.length) { toast.error(ar ? "انقل أو احذف طاولات هذا الطابق أولاً." : "Move or delete this floor's tables first."); return; }
    if (!confirm(ar ? `حذف ${currentFloor.ar}؟` : `Delete ${currentFloor.en}?`)) return;
    const previousBackground = currentFloor.backgroundUrl;
    const nextFloors = floors.filter((floor) => floor.id !== activeFloor);
    try {
      await persistFloors(nextFloors);
      setActiveFloor(nextFloors[0]!.id);
      if (previousBackground) void removeRestaurantImage(previousBackground).catch(() => undefined);
      toast.success(ar ? "تم حذف الطابق" : "Floor deleted");
    } catch (error) { toast.error(humanError(error, lang)); }
  }

  async function updateFloorBackground(nextUrl: string | null) {
    const nextFloors = floors.map((floor) => floor.id === activeFloor ? { ...floor, backgroundUrl: nextUrl } : floor);
    await persistFloors(nextFloors);
  }

  async function uploadFloorPlan(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error(ar ? "اختر صورة للمخطط." : "Choose an image file for the floor plan."); return; }
    setFloorBusy(true);
    const previous = currentFloor.backgroundUrl;
    try {
      const url = await uploadRestaurantImage(restaurantId, "floorplan", file);
      await updateFloorBackground(url);
      if (previous && previous !== url) void removeRestaurantImage(previous).catch(() => undefined);
      toast.success(ar ? "تم تحديث مخطط الطابق" : "Floor plan updated");
    } catch (error) { toast.error(humanError(error, lang)); }
    finally { setFloorBusy(false); if (floorInputRef.current) floorInputRef.current.value = ""; }
  }

  async function clearFloorPlan() {
    const previous = currentFloor.backgroundUrl;
    if (!previous) return;
    setFloorBusy(true);
    try {
      await updateFloorBackground(null);
      void removeRestaurantImage(previous).catch(() => undefined);
      toast.success(ar ? "تمت إزالة خلفية الطابق" : "Floor background removed");
    } catch (error) { toast.error(humanError(error, lang)); }
    finally { setFloorBusy(false); }
  }

  function beginDrag(event: ReactPointerEvent<HTMLElement>, row: FloorTable, mode: "move" | "resize") {
    const rect = floorRef.current?.getBoundingClientRect();
    if (!rect) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const current = draft[row.id] ?? layoutOf(row, 0);
    dragRef.current = { id: row.id, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, start: current, latest: current, mode };
    setSelectedId(row.id);
  }
  function drag(event: ReactPointerEvent<HTMLElement>) {
    const state = dragRef.current;
    const rect = floorRef.current?.getBoundingClientRect();
    if (!state || !rect || state.pointerId !== event.pointerId) return;
    event.preventDefault();
    const dx = (event.clientX - state.startX) / rect.width * W;
    const dy = (event.clientY - state.startY) / rect.height * H;
    const next = state.mode === "move"
      ? { ...state.start, x: clamp(state.start.x + dx, 55, 945), y: clamp(state.start.y + dy, 55, 645) }
      : { ...state.start, scale: clamp(state.start.scale + (dx + dy) / 420, 0.68, 1.55) };
    state.latest = next;
    setDraft((value) => ({ ...value, [state.id]: next }));
  }
  function endDrag(event: ReactPointerEvent<HTMLElement>) {
    const state = dragRef.current;
    if (!state || state.pointerId !== event.pointerId) return;
    dragRef.current = null;
    try { event.currentTarget.releasePointerCapture(event.pointerId); } catch { /* already released */ }
    void persistLayout(state.id, state.latest);
  }
  function rotateSelected(delta: number) {
    if (!selected) return;
    const current = draft[selected.id] ?? layoutOf(selected, 0);
    const next = { ...current, rotation: clamp(current.rotation + delta, -180, 180) };
    setDraft((value) => ({ ...value, [selected.id]: next }));
    setForm((value) => ({ ...value, rotation: String(Math.round(next.rotation)) }));
    void persistLayout(selected.id, next);
  }
  async function printSingle() {
    if (!selected || !restaurant) return;
    const opened = await printQrCards(restaurant.name, t("sa.tables.scan"), [{ table_number: selected.table_number, table_name: selected.table_name, url: tableMenuUrl(restaurant.slug, selected.qr_token) }], { back: ar ? "← رجوع" : "← Back", print: ar ? "طباعة" : "Print" });
    if (!opened) toast.error(ar ? "اسمح بالنوافذ المنبثقة للطباعة." : "Allow pop-ups to print QR codes.");
  }
  async function printAll(scope: "all" | "zone" = "all") {
    if (!restaurant) return;
    const source = scope === "zone" && activeZone !== "all" ? visibleTables : floorTables;
    if (!source.length) { toast.error(ar ? "لا توجد طاولات للطباعة." : "There are no tables to print."); return; }
    const opened = await printQrCards(restaurant.name, t("sa.tables.scan"), source.map((row) => ({ table_number: row.table_number, table_name: row.table_name, url: tableMenuUrl(restaurant.slug, row.qr_token) })), { back: ar ? "← رجوع" : "← Back", print: ar ? "طباعة" : "Print" });
    if (!opened) toast.error(ar ? "اسمح بالنوافذ المنبثقة للطباعة." : "Allow pop-ups to print QR codes.");
  }
  async function downloadSelectedSvg() {
    if (!selected || !restaurant) return;
    downloadText(await qrSvg(tableMenuUrl(restaurant.slug, selected.qr_token)), `table-${selected.table_number}-qr.svg`);
  }

  if (tables.isPending || restaurantQuery.isPending) return <Skeleton className="h-[720px] rounded-2xl" />;

  return <div className="space-y-5">
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div><h1 className="qs-page-title">{ar ? "الطاولات و QR" : "Tables & QR"}</h1><p className="qs-page-subtitle">{ar ? "نظم الطوابق والمناطق، ضع الطاولات على المخطط، وأدر رموز QR." : "Organize floors and zones, position tables on the plan, and manage QR codes."}</p></div>
      <LinkOrders restaurantId={restaurantId} ar={ar} />
    </header>

    <section className="qs-card overflow-hidden">
      <div className="space-y-3 border-b border-border p-3 sm:p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <div className="min-w-[190px] flex-1 sm:flex-none">
              <Select value={activeFloor} onValueChange={setActiveFloor}>
                <SelectTrigger className="h-11"><Building2 className="me-2 size-4 shrink-0 text-muted-foreground"/><SelectValue /></SelectTrigger>
                <SelectContent>{floors.map((floor) => <SelectItem key={floor.id} value={floor.id}>{ar ? floor.ar : floor.en}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <button type="button" className="qs-button-secondary" onClick={() => setFloorOpen(true)}><Plus className="size-4" />{ar ? "طابق" : "Floor"}</button>
            {floors.length > 1 ? <button type="button" className="grid size-11 place-items-center rounded-xl border border-border text-muted-foreground transition hover:border-red-200 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/20" onClick={() => void deleteFloor()} aria-label={ar ? "حذف الطابق" : "Delete floor"}><Trash2 className="size-4"/></button> : null}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="qs-button-primary" onClick={openCreate}><Plus className="size-4" />{ar ? "إضافة طاولة" : "Add Table"}</button>
            <button type="button" className="qs-button-secondary whitespace-nowrap" onClick={() => void printAll(activeZone === "all" ? "all" : "zone")}><Printer className="size-4" />{activeZone === "all" ? (ar ? "طباعة كل رموز QR" : "Print all QR codes") : (ar ? "طباعة رموز المنطقة" : "Print zone QR codes")}</button>
            <input ref={floorInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(event) => void uploadFloorPlan(event.target.files?.[0])} />
            <button type="button" disabled={floorBusy} className="qs-button-secondary whitespace-nowrap" onClick={() => floorInputRef.current?.click()}><ImagePlus className="size-4" />{floorBusy ? (ar ? "جارٍ الرفع…" : "Uploading…") : (currentFloor.backgroundUrl ? (ar ? "تغيير المخطط" : "Replace plan") : (ar ? "رفع مخطط" : "Upload plan"))}</button>
            {currentFloor.backgroundUrl ? <button type="button" disabled={floorBusy} className="grid size-11 place-items-center rounded-xl border border-border text-destructive hover:bg-destructive/10" onClick={() => void clearFloorPlan()} aria-label={ar ? "إزالة خلفية المخطط" : "Remove floor background"}><Trash2 className="size-4" /></button> : null}
          </div>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <button type="button" onClick={() => setActiveZone("all")} className={cn("shrink-0 rounded-full border px-3 py-2 text-xs font-bold transition", activeZone === "all" ? "border-[#e85d2a] bg-orange-500/10 text-[#e85d2a]" : "border-border bg-card text-muted-foreground hover:text-foreground")}>{ar ? "كل المناطق" : "All zones"}</button>
          {currentZones.map((zone) => {
            const count = floorTables.filter((table) => (table.zone || currentZones[0]?.id || "main") === zone.id).length;
            return <div key={zone.id} className={cn("flex shrink-0 items-center rounded-full border transition", activeZone === zone.id ? "border-[#e85d2a] bg-orange-500/10 text-[#e85d2a]" : "border-border bg-card text-muted-foreground")}>
              <button type="button" onClick={() => setActiveZone(zone.id)} className="min-h-9 px-3 text-xs font-bold">{ar ? zone.ar : zone.en} <span className="ms-1 opacity-60">{count}</span></button>
              <button type="button" onClick={() => void deleteZone(zone.id)} className="me-1 grid size-7 place-items-center rounded-full opacity-55 transition hover:bg-destructive/10 hover:text-destructive hover:opacity-100" aria-label={ar ? "حذف المنطقة" : "Delete zone"}><X className="size-3" /></button>
            </div>;
          })}
          <button type="button" className="shrink-0 rounded-full border border-dashed border-border px-3 py-2 text-xs font-bold text-muted-foreground hover:border-[#e85d2a]/40 hover:text-foreground" onClick={() => setZoneOpen(true)}><Plus className="me-1 inline size-3.5" />{ar ? "منطقة" : "Zone"}</button>
        </div>
      </div>

      <div className="grid min-w-0 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 border-b border-border xl:border-b-0 xl:border-e">
          <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
            <div className="flex md:hidden"><button type="button" className={cn("rounded-lg px-3 py-2 text-xs font-bold", mobileMode === "floor" ? "bg-muted text-foreground" : "text-muted-foreground")} onClick={() => setMobileMode("floor")}>{ar ? "المخطط" : "Floor Plan"}</button><button type="button" className={cn("rounded-lg px-3 py-2 text-xs font-bold", mobileMode === "list" ? "bg-muted text-foreground" : "text-muted-foreground")} onClick={() => setMobileMode("list")}>{ar ? "القائمة" : "List"}</button></div>
            <div className="hidden text-xs font-semibold text-muted-foreground md:block">{ar ? currentFloor.ar : currentFloor.en} · {activeZone === "all" ? (ar ? "كل المناطق" : "All zones") : (ar ? currentZones.find((zone) => zone.id === activeZone)?.ar : currentZones.find((zone) => zone.id === activeZone)?.en)}</div>
            <div className="ms-auto hidden items-center rounded-xl border border-border bg-card p-1 sm:flex"><button type="button" className="grid size-9 place-items-center rounded-lg hover:bg-muted" onClick={() => setZoom((value) => clamp(value - 0.1, 0.7, 1.35))}><ZoomOut className="size-4" /></button><span className="grid min-w-14 place-items-center text-xs font-bold">{Math.round(zoom * 100)}%</span><button type="button" className="grid size-9 place-items-center rounded-lg hover:bg-muted" onClick={() => setZoom((value) => clamp(value + 0.1, 0.7, 1.35))}><ZoomIn className="size-4" /></button></div>
          </div>

          {mobileMode === "list" ? <div className="space-y-2 p-3 md:hidden">{visibleTables.map((row) => <button key={row.id} type="button" onClick={() => { setSelectedId(row.id); setDetailsOpen(true); }} className="flex w-full items-center gap-3 rounded-xl border border-border p-3 text-start"><span className="grid size-10 place-items-center rounded-xl bg-orange-50 font-bold text-[#e85d2a] dark:bg-orange-950/30">T{row.table_number}</span><span className="min-w-0 flex-1"><strong className="block truncate text-sm">{row.table_name || `${ar ? "طاولة" : "Table"} ${row.table_number}`}</strong><span className="text-xs text-muted-foreground">{row.capacity ?? 4} {ar ? "مقاعد" : "seats"} · {currentZones.find((zone) => zone.id === (row.zone || currentZones[0]?.id))?.[ar ? "ar" : "en"] ?? row.zone}</span></span><i className={cn("size-2 rounded-full", row.is_active ? "bg-emerald-500" : "bg-slate-400")} /></button>)}</div> : <div className="overflow-auto bg-[#f6f7f8] p-3 dark:bg-[#11171b]">
            <div
              ref={floorRef}
              className="relative mx-auto min-w-[690px] overflow-hidden rounded-2xl border border-border bg-[#ebe8e1] shadow-inner dark:bg-slate-900"
              style={{
                width: `${zoom * 100}%`,
                aspectRatio: `${W}/${H}`,
                ...(currentFloor.backgroundUrl ? {
                  backgroundImage: `linear-gradient(rgba(255,255,255,.05),rgba(255,255,255,.05)),url("${currentFloor.backgroundUrl}")`,
                  backgroundSize: "100% 100%, contain",
                  backgroundPosition: "center",
                  backgroundRepeat: "no-repeat",
                } : {}),
              }}
            >
              {currentFloor.backgroundUrl ? null : <FloorArchitecture ar={ar} zones={currentZones} />}
              {visibleTables.map((row, index) => {
                const layout = draft[row.id] ?? layoutOf(row, index);
                return <TablePiece key={row.id} row={row} layout={layout} selected={selectedId === row.id} onDown={(event) => beginDrag(event, row, "move")} onMove={drag} onUp={endDrag} onResizeDown={(event) => beginDrag(event, row, "resize")} />;
              })}
              {currentFloor.backgroundUrl ? <div className="pointer-events-none absolute start-3 top-3 z-[3] flex max-w-[75%] flex-wrap gap-1.5">{currentZones.map((zone) => <span key={zone.id} className="rounded-full border border-black/10 bg-white/90 px-2.5 py-1 text-[10px] font-bold text-slate-700 shadow-sm">{ar ? zone.ar : zone.en}</span>)}</div> : null}
            </div>
          </div>}

          <div className="flex flex-wrap items-center gap-4 border-t border-border px-4 py-3 text-[10px] text-muted-foreground"><Legend tone="bg-emerald-500" label={ar ? "متاح" : "Available"} /><Legend tone="bg-[#e85d2a]" label={ar ? "نشط / مشغول" : "Active / Occupied"} /><Legend tone="bg-slate-400" label={ar ? "غير نشط" : "Inactive"} /><span className="ms-auto">{visibleTables.length} / {floorTables.length} {ar ? "طاولة" : "tables"}</span></div>
        </div>

        <aside className="bg-card">
          {selected ? <>
            <div className="qs-panel-header"><div><h2 className="font-display text-lg font-bold">{ar ? "طاولة" : "Table"} T{selected.table_number}</h2><p className="mt-1 text-xs text-muted-foreground">{form.active ? (ar ? "نشطة" : "Active") : (ar ? "غير نشطة" : "Inactive")}</p></div><button type="button" className="grid size-9 place-items-center rounded-lg hover:bg-muted" onClick={() => setSelectedId(null)}><X className="size-4" /></button></div>
            <div className="space-y-4 p-4">
              <Field label={ar ? "اسم الطاولة" : "Table Name"}><Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder={`T${selected.table_number}`} /></Field>
              <Field label={ar ? "المقاعد" : "Seats"}><div className="grid grid-cols-[44px_1fr_44px] overflow-hidden rounded-xl border border-border"><button type="button" onClick={() => setForm((value) => ({ ...value, capacity: String(clamp((Number(value.capacity) || 1) - 1, 1, 30)) }))} className="grid min-h-11 place-items-center hover:bg-muted"><Minus className="size-4" /></button><span className="grid place-items-center border-x border-border font-bold">{form.capacity}</span><button type="button" onClick={() => setForm((value) => ({ ...value, capacity: String(clamp((Number(value.capacity) || 1) + 1, 1, 30)) }))} className="grid min-h-11 place-items-center hover:bg-muted"><Plus className="size-4" /></button></div></Field>
              <Field label={ar ? "الطابق" : "Floor"}><Select value={form.floor} onValueChange={(value) => { const floor = floors.find((entry) => entry.id === value); setForm({ ...form, floor: value, zone: floor?.zones[0]?.id ?? "main" }); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{floors.map((floor) => <SelectItem key={floor.id} value={floor.id}>{ar ? floor.ar : floor.en}</SelectItem>)}</SelectContent></Select></Field>
              <Field label={ar ? "المنطقة" : "Zone"}><Select value={form.zone} onValueChange={(value) => setForm({ ...form, zone: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{(floors.find((floor) => floor.id === form.floor)?.zones ?? currentZones).map((zone) => <SelectItem key={zone.id} value={zone.id}>{ar ? zone.ar : zone.en}</SelectItem>)}</SelectContent></Select></Field>
              <Field label={ar ? "الشكل" : "Shape"}><Select value={form.shape} onValueChange={(value) => setForm({ ...form, shape: value as Shape })}><SelectTrigger><Square className="me-2 size-4" /><SelectValue /></SelectTrigger><SelectContent><SelectItem value="square">{ar ? "مربع" : "Square"}</SelectItem><SelectItem value="round">{ar ? "دائري" : "Round"}</SelectItem><SelectItem value="rectangle">{ar ? "مستطيل" : "Rectangle"}</SelectItem></SelectContent></Select></Field>
              <Field label={ar ? "الدوران" : "Rotation"}><div className="flex gap-2"><Input type="number" value={form.rotation} onChange={(event) => setForm({ ...form, rotation: event.target.value })} /><button type="button" className="qs-button-secondary px-3" onClick={() => rotateSelected(15)}><RotateCw className="size-4" /></button></div></Field>
              <label className="flex items-center justify-between rounded-xl border border-border p-3"><span className="text-sm font-semibold">{ar ? "الطاولة نشطة" : "Table active"}</span><Switch checked={form.active} onCheckedChange={(value) => setForm({ ...form, active: value })} /></label>
              <div className="border-t border-border pt-4">
                <h3 className="text-sm font-bold">{ar ? "رمز QR" : "QR Code"}</h3>
                {qr ? <div className="mt-3 grid grid-cols-[80px_minmax(0,1fr)] items-center gap-3"><img src={qr} alt="QR" className="size-20 rounded-lg border bg-white p-1" /><div className="min-w-0"><p className="truncate text-xs font-bold">{ar ? "طاولة" : "Table"} T{selected.table_number}</p><p className="text-[10px] text-muted-foreground">{ar ? "امسح للطلب" : "Scan to order"}</p><div className="mt-2 grid grid-cols-2 gap-2"><button type="button" className="qs-button-secondary inline-flex min-w-0 items-center justify-center gap-1.5 whitespace-nowrap px-2 py-1 text-[10px]" onClick={() => downloadDataUrl(qr, `table-${selected.table_number}-qr.png`)}><Download className="size-3 shrink-0" /><span>{ar ? "تنزيل" : "Download"}</span></button><button type="button" className="qs-button-secondary inline-flex min-w-0 items-center justify-center gap-1.5 whitespace-nowrap px-2 py-1 text-[10px]" onClick={() => void printSingle()}><Printer className="size-3 shrink-0" /><span>{ar ? "طباعة" : "Print"}</span></button></div></div></div> : <Skeleton className="mt-3 h-20 rounded-xl" />}
              </div>
            </div>
            <div className="safe-bottom sticky bottom-0 grid grid-cols-2 gap-2 border-t border-border bg-card/96 p-4 backdrop-blur"><button type="button" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-red-200 text-sm font-semibold text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20" onClick={() => void deleteSelected()}><Trash2 className="size-4" />{ar ? "حذف" : "Delete Table"}</button><button type="button" className="qs-button-primary" disabled={busy} onClick={() => void saveSelected()}><Save className="size-4" />{busy ? (ar ? "حفظ…" : "Saving…") : (ar ? "حفظ" : "Save Changes")}</button></div>
          </> : <div className="grid min-h-[520px] place-items-center p-6 text-center"><div><Table2 className="mx-auto size-9 text-muted-foreground" /><p className="mt-3 text-sm font-bold">{ar ? "اختر طاولة من المخطط" : "Select a table on the floor plan"}</p><p className="mt-1 text-xs text-muted-foreground">{ar ? "اسحب الطاولات لتغيير مكانها وحجمها." : "Drag tables to reposition them and use the handle to resize."}</p></div></div>}
        </aside>
      </div>
    </section>

    <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{selected ? `${ar ? "طاولة" : "Table"} ${selected.table_number}` : (ar ? "تفاصيل الطاولة" : "Table details")}</DialogTitle><DialogDescription>{selected?.table_name || (ar ? "رمز QR ومعلومات الطاولة" : "QR code and table information")}</DialogDescription></DialogHeader>
        {selected ? <div className="grid gap-4">
          <div className="grid grid-cols-3 gap-2 rounded-2xl border border-border bg-muted/30 p-3 text-center"><div><span className="block text-[10px] uppercase text-muted-foreground">{ar ? "المقاعد" : "Seats"}</span><strong>{selected.capacity ?? 4}</strong></div><div><span className="block text-[10px] uppercase text-muted-foreground">{ar ? "المنطقة" : "Zone"}</span><strong className="text-xs">{currentZones.find((zone) => zone.id === (selected.zone || currentZones[0]?.id))?.[ar ? "ar" : "en"] ?? selected.zone ?? "—"}</strong></div><div><span className="block text-[10px] uppercase text-muted-foreground">{ar ? "الحالة" : "Status"}</span><strong className={selected.is_active ? "text-emerald-600" : "text-muted-foreground"}>{selected.is_active ? (ar ? "نشطة" : "Active") : (ar ? "متوقفة" : "Inactive")}</strong></div></div>
          <div className="mx-auto grid size-60 place-items-center rounded-3xl border border-border bg-white p-4 shadow-sm">{qr ? <img src={qr} alt={`${ar ? "رمز QR للطاولة" : "QR code for table"} ${selected.table_number}`} className="size-full" /> : <Skeleton className="size-full rounded-2xl" />}</div>
          <div className="grid grid-cols-3 gap-2"><Button variant="outline" disabled={!qr} onClick={() => qr && downloadDataUrl(qr, `table-${selected.table_number}-qr.png`)}><Download className="size-4" />PNG</Button><Button variant="outline" onClick={() => void downloadSelectedSvg()}><Download className="size-4" />SVG</Button><Button onClick={() => void printSingle()}><Printer className="size-4" />{ar ? "طباعة" : "Print"}</Button></div>
        </div> : null}
      </DialogContent>
    </Dialog>

    <Dialog open={createOpen} onOpenChange={setCreateOpen}><DialogContent className="sm:max-w-lg"><DialogHeader><DialogTitle>{ar ? "إضافة طاولة" : "Add Table"}</DialogTitle><DialogDescription>{ar ? "أضف طاولة إلى الطابق والمنطقة المحددين." : "Add a table to the selected floor and zone."}</DialogDescription></DialogHeader><div className="grid gap-4 sm:grid-cols-2"><Field label={ar ? "رقم الطاولة" : "Table Number"}><Input value={form.number} onChange={(event) => setForm({ ...form, number: event.target.value })} /></Field><Field label={ar ? "الاسم" : "Name"}><Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></Field><Field label={ar ? "المقاعد" : "Seats"}><Input type="number" min="1" max="30" value={form.capacity} onChange={(event) => setForm({ ...form, capacity: event.target.value })} /></Field><Field label={ar ? "الطابق" : "Floor"}><Select value={form.floor} onValueChange={(value) => { const floor = floors.find((entry) => entry.id === value); setForm({ ...form, floor: value, zone: floor?.zones[0]?.id ?? "main" }); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{floors.map((floor) => <SelectItem key={floor.id} value={floor.id}>{ar ? floor.ar : floor.en}</SelectItem>)}</SelectContent></Select></Field><Field label={ar ? "المنطقة" : "Zone"}><Select value={form.zone} onValueChange={(value) => setForm({ ...form, zone: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{(floors.find((floor) => floor.id === form.floor)?.zones ?? currentZones).map((zone) => <SelectItem key={zone.id} value={zone.id}>{ar ? zone.ar : zone.en}</SelectItem>)}</SelectContent></Select></Field></div><DialogFooter><Button variant="ghost" onClick={() => setCreateOpen(false)}>{t("common.cancel")}</Button><Button disabled={busy || !form.number.trim()} onClick={() => void createTable()}>{ar ? "إضافة" : "Add Table"}</Button></DialogFooter></DialogContent></Dialog>

    <Dialog open={zoneOpen} onOpenChange={setZoneOpen}><DialogContent className="sm:max-w-md"><DialogHeader><DialogTitle>{ar ? "إضافة منطقة" : "Add Zone"}</DialogTitle><DialogDescription>{ar ? `ستتم إضافة المنطقة إلى ${currentFloor.ar}.` : `The zone will be added to ${currentFloor.en}.`}</DialogDescription></DialogHeader><Field label={ar ? "اسم المنطقة" : "Zone name"}><Input autoFocus value={zoneName} onChange={(event) => setZoneName(event.target.value)} placeholder={ar ? "مثال: VIP" : "e.g. VIP"} /></Field><DialogFooter><Button variant="ghost" onClick={() => setZoneOpen(false)}>{t("common.cancel")}</Button><Button disabled={!zoneName.trim()} onClick={() => void addZone()}>{ar ? "إضافة" : "Add Zone"}</Button></DialogFooter></DialogContent></Dialog>

    <Dialog open={floorOpen} onOpenChange={setFloorOpen}><DialogContent className="sm:max-w-md"><DialogHeader><DialogTitle>{ar ? "إضافة طابق" : "Add Floor"}</DialogTitle><DialogDescription>{ar ? "أنشئ مخططاً مستقلاً لطابق أو قاعة أخرى." : "Create a separate layout for another floor or hall."}</DialogDescription></DialogHeader><Field label={ar ? "اسم الطابق" : "Floor name"}><Input autoFocus value={floorName} onChange={(event) => setFloorName(event.target.value)} placeholder={ar ? "مثال: الطابق الأول" : "e.g. First Floor"} /></Field><DialogFooter><Button variant="ghost" onClick={() => setFloorOpen(false)}>{t("common.cancel")}</Button><Button disabled={!floorName.trim()} onClick={() => void addFloor()}>{ar ? "إضافة" : "Add Floor"}</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}

function FloorArchitecture({ ar, zones }: { ar: boolean; zones: Zone[] }) {
  const visible = zones.slice(0, 3);
  return <>
    <div className="absolute inset-[3%] rounded-xl border-[8px] border-[#8c877f] bg-[#dedbd4] shadow-[inset_0_0_0_2px_rgba(255,255,255,.55)] dark:border-slate-700 dark:bg-slate-800" />
    <div className="absolute left-[5%] top-[6%] h-[54%] w-[57%] rounded-lg border border-[#c8c2b8] bg-[repeating-linear-gradient(45deg,#ead8bf_0_8px,#f0dfc8_8px_16px)] shadow-inner"><ZoneLabel className="left-[6%] top-[6%]" label={ar ? (visible[0]?.ar ?? "الصالة") : (visible[0]?.en ?? "Main Dining")} /></div>
    <div className="absolute right-[5%] top-[6%] h-[54%] w-[30%] rounded-lg border border-[#c6c4bd] bg-[repeating-linear-gradient(0deg,#d4d1c9_0_18px,#dedbd4_18px_36px)] shadow-inner"><ZoneLabel className="left-[7%] top-[7%]" label={ar ? (visible[1]?.ar ?? "منطقة 2") : (visible[1]?.en ?? "Zone 2")} /></div>
    <div className="absolute bottom-[5%] left-[22%] h-[30%] w-[73%] rounded-lg border border-[#c7b9a5] bg-[repeating-linear-gradient(90deg,#dcc4a4_0_12px,#e5cfb1_12px_24px)] shadow-inner"><ZoneLabel className="left-[5%] top-[8%]" label={ar ? (visible[2]?.ar ?? "منطقة 3") : (visible[2]?.en ?? "Zone 3")} /></div>
    <div className="absolute bottom-[1%] left-[7%] text-center text-[10px] font-bold text-slate-600 dark:text-slate-300">↑<br />{ar ? "المدخل" : "Entrance"}</div>
  </>;
}
function ZoneLabel({ className, label }: { className: string; label: string }) { return <div className={`absolute z-[2] rounded-xl border border-black/5 bg-white/92 px-3 py-2 text-xs font-bold text-slate-800 shadow-sm ${className}`}>{label}</div>; }

function TablePiece({ row, layout, selected, onDown, onMove, onUp, onResizeDown }: { row: FloorTable; layout: Layout; selected: boolean; onDown: (event: ReactPointerEvent<HTMLElement>) => void; onMove: (event: ReactPointerEvent<HTMLElement>) => void; onUp: (event: ReactPointerEvent<HTMLElement>) => void; onResizeDown: (event: ReactPointerEvent<HTMLElement>) => void }) {
  const shape = shapeOf(row.shape);
  const seats = clamp(row.capacity ?? 4, 2, 8);
  return <div role="button" tabIndex={0} aria-label={`Table ${row.table_number}`} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} className="absolute z-10 touch-none select-none" style={{ left: `${layout.x / 10}%`, top: `${layout.y / 7}%`, width: shape === "rectangle" ? "110px" : "84px", height: "84px", transform: `translate(-50%,-50%) rotate(${layout.rotation}deg) scale(${layout.scale})` }}>
    <span className={cn("absolute inset-[10px] grid place-items-center border-2 bg-[#b87843] font-display text-sm font-bold text-white shadow-[0_8px_14px_rgba(77,47,23,.22)]", shape === "round" ? "rounded-full" : shape === "square" ? "rounded-xl" : "rounded-[14px]", selected ? "border-[#2486ff] ring-2 ring-[#2486ff]/35" : "border-[#8b5a35]")}>T{row.table_number}</span>
    {Array.from({ length: Math.min(seats, 6) }, (_, index) => { const angle = (360 / Math.min(seats, 6)) * index - 90; const x = 50 + Math.cos(angle * Math.PI / 180) * 49; const y = 50 + Math.sin(angle * Math.PI / 180) * 49; return <i key={index} className="absolute h-4 w-6 rounded-[5px] border border-[#7a5a3d] bg-[#9b795c] shadow-sm" style={{ left: `${x}%`, top: `${y}%`, transform: `translate(-50%,-50%) rotate(${angle + 90}deg)` }} />; })}
    {selected ? <><span className="pointer-events-none absolute -inset-1 rounded-xl border border-[#2486ff]" /><button type="button" aria-label="Resize table" onPointerDown={onResizeDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} className="absolute -bottom-2 -right-2 z-30 size-4 rounded-full border-2 border-white bg-[#2486ff] shadow" /></> : null}
  </div>;
}
function Legend({ tone, label }: { tone: string; label: string }) { return <span className="flex items-center gap-2"><i className={`size-2.5 rounded-full ${tone}`} />{label}</span>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div className="min-w-0 space-y-1.5"><Label className="text-xs font-bold">{label}</Label>{children}</div>; }
function LinkOrders({ restaurantId, ar }: { restaurantId: string; ar: boolean }) { return <Link to={`/manage/${restaurantId}/orders` as never} preload="intent" className="qs-button-secondary whitespace-nowrap"><Table2 className="size-4" />{ar ? "عرض الطلبات" : "View Orders"}</Link>; }
