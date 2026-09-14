import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown,
  Circle,
  Download,
  Expand,
  Grid2x2,
  Layers3,
  Map,
  MapPin,
  Minus,
  Move3d,
  Plus,
  Printer,
  RectangleHorizontal,
  RefreshCw,
  RotateCcw,
  Save,
  Square,
  Table2,
  Trash2,
  UsersRound,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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

type TableShape = "round" | "square" | "rectangle";
type TableMaterial = "wood" | "dark-wood" | "marble" | "neutral";
type InspectorTab = "details" | "style" | "qr" | "more";

type TableLayout = {
  x: number;
  y: number;
  rotation: number;
  scale: number;
  material: TableMaterial;
};

type ZoneOption = { id: string; en: string; ar: string };

type DragState = {
  id: string;
  pointerId: number;
  offsetX: number;
  offsetY: number;
  moved: boolean;
  latest: TableLayout;
};

const CANVAS_WIDTH = 1000;
const CANVAS_HEIGHT = 700;

const BASE_ZONES: ZoneOption[] = [
  { id: "main", en: "Main Dining", ar: "الصالة الرئيسية" },
  { id: "patio", en: "Patio", ar: "التراس" },
  { id: "bar", en: "Bar", ar: "البار" },
  { id: "vip", en: "VIP", ar: "VIP" },
];

const DEFAULT_SLOTS = [
  { x: 165, y: 145 },
  { x: 395, y: 145 },
  { x: 165, y: 335 },
  { x: 395, y: 335 },
  { x: 730, y: 245 },
  { x: 180, y: 555 },
  { x: 455, y: 555 },
  { x: 700, y: 555 },
  { x: 855, y: 480 },
  { x: 590, y: 395 },
  { x: 565, y: 130 },
  { x: 850, y: 135 },
];

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function numberFrom(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeShape(value: unknown): TableShape {
  if (value === "round" || value === "circle") return "round";
  if (value === "square") return "square";
  return "rectangle";
}

function normalizeMaterial(value: unknown): TableMaterial {
  return value === "dark-wood" || value === "marble" || value === "neutral" ? value : "wood";
}

function layoutFor(table: FloorTable, index: number): TableLayout {
  const fallback = DEFAULT_SLOTS[index % DEFAULT_SLOTS.length];
  const raw = table.layout && typeof table.layout === "object" ? table.layout : {};
  return {
    x: clamp(numberFrom(raw.x, fallback.x), 55, 945),
    y: clamp(numberFrom(raw.y, fallback.y), 55, 645),
    rotation: clamp(numberFrom(raw.rotation, 0), -180, 180),
    scale: clamp(numberFrom(raw.scale, 1), 0.7, 1.45),
    material: normalizeMaterial(raw.material),
  };
}

function initialNewLayout(index: number): TableLayout {
  const fallback = DEFAULT_SLOTS[index % DEFAULT_SLOTS.length];
  return { x: fallback.x, y: fallback.y, rotation: 0, scale: 1, material: "wood" };
}

function storageKey(restaurantId: string) {
  return `qs-table-zones:${restaurantId}`;
}

function readCustomZones(restaurantId: string): ZoneOption[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(storageKey(restaurantId)) ?? "[]") as ZoneOption[];
    return Array.isArray(parsed) ? parsed.filter((item) => item && typeof item.id === "string") : [];
  } catch {
    return [];
  }
}

export function TablesManager({ restaurantId }: { restaurantId: string }) {
  const { t, lang } = useI18n();
  const ar = lang === "ar";
  const qc = useQueryClient();
  const { data: restaurant } = useRestaurant(restaurantId);
  const floorRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState | null>(null);

  const [activeZone, setActiveZone] = useState("main");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createMode, setCreateMode] = useState(false);
  const [mobileInspectorOpen, setMobileInspectorOpen] = useState(false);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("details");
  const [busy, setBusy] = useState(false);
  const [number, setNumber] = useState("");
  const [name, setName] = useState("");
  const [zone, setZone] = useState("main");
  const [capacity, setCapacity] = useState("4");
  const [shape, setShape] = useState<TableShape>("round");
  const [isActive, setIsActive] = useState(true);
  const [draftLayouts, setDraftLayouts] = useState<Record<string, TableLayout>>({});
  const [newLayout, setNewLayout] = useState<TableLayout>(() => initialNewLayout(0));
  const [zoom, setZoom] = useState(1);
  const [snap, setSnap] = useState(true);
  const [threeD, setThreeD] = useState(true);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkCount, setBulkCount] = useState("5");
  const [zoneDialogOpen, setZoneDialogOpen] = useState(false);
  const [zoneName, setZoneName] = useState("");
  const [customZones, setCustomZones] = useState<ZoneOption[]>(() => readCustomZones(restaurantId));
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [qrPreview, setQrPreview] = useState<string | null>(null);

  const tables = useQuery<FloorTable[]>({
    queryKey: ["platform", "tables", restaurantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("restaurant_tables")
        .select("*")
        .eq("restaurant_id", restaurantId)
        .order("table_number", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as FloorTable[];
    },
  });

  useEffect(() => {
    setCustomZones(readCustomZones(restaurantId));
  }, [restaurantId]);

  useEffect(() => {
    const rows = tables.data ?? [];
    setDraftLayouts((previous) => {
      const next: Record<string, TableLayout> = {};
      rows.forEach((table, index) => {
        next[table.id] = previous[table.id] ?? layoutFor(table, index);
      });
      return next;
    });
  }, [tables.data]);

  const allZones = useMemo(() => {
    const map = new globalThis.Map<string, ZoneOption>();
    BASE_ZONES.forEach((item) => map.set(item.id, item));
    customZones.forEach((item) => map.set(item.id, item));
    (tables.data ?? []).forEach((table) => {
      const id = table.zone || "main";
      if (!map.has(id)) map.set(id, { id, en: id.replace(/[-_]/g, " "), ar: id.replace(/[-_]/g, " ") });
    });
    return [...map.values()];
  }, [customZones, tables.data]);

  const zoneTables = useMemo(
    () => (tables.data ?? []).filter((row) => (row.zone || "main") === activeZone),
    [activeZone, tables.data],
  );

  const selected = useMemo(
    () => (tables.data ?? []).find((row) => row.id === selectedId) ?? zoneTables[0] ?? null,
    [selectedId, tables.data, zoneTables],
  );

  const currentLayout = createMode
    ? newLayout
    : selected
      ? draftLayouts[selected.id] ?? layoutFor(selected, Math.max(0, zoneTables.findIndex((item) => item.id === selected.id)))
      : null;

  useEffect(() => {
    if (!selected || createMode) return;
    setNumber(selected.table_number);
    setName(selected.table_name ?? "");
    setZone(selected.zone || "main");
    setCapacity(String(selected.capacity ?? 4));
    setShape(normalizeShape(selected.shape));
    setIsActive(selected.is_active);
  }, [selected?.id, createMode]);

  useEffect(() => {
    if (inspectorTab !== "qr" || !selected || !restaurant) return;
    let cancelled = false;
    void qrDataUrl(tableMenuUrl(restaurant.slug, selected.qr_token)).then((dataUrl) => {
      if (!cancelled) setQrPreview(dataUrl);
    });
    return () => { cancelled = true; };
  }, [inspectorTab, selected?.id, selected?.qr_token, restaurant?.slug]);

  async function refresh() {
    await qc.invalidateQueries({ queryKey: ["platform", "tables", restaurantId] });
  }

  async function persistLayout(id: string, layout: TableLayout) {
    const table = (tables.data ?? []).find((item) => item.id === id);
    if (!table) return;
    const merged = { ...(table.layout ?? {}), ...layout };
    const { error } = await (supabase.from("restaurant_tables") as any)
      .update({ layout: merged })
      .eq("id", id)
      .eq("restaurant_id", restaurantId);
    if (error) toast.error(humanError(error, lang));
  }

  function setSelectedLayout(patch: Partial<TableLayout>) {
    if (createMode) {
      setNewLayout((current) => ({ ...current, ...patch }));
      return;
    }
    if (!selected) return;
    setDraftLayouts((current) => ({
      ...current,
      [selected.id]: { ...(current[selected.id] ?? layoutFor(selected, 0)), ...patch },
    }));
  }

  function openCreate() {
    const next = (tables.data ?? []).length + 1;
    setCreateMode(true);
    setSelectedId(null);
    setNumber(String(next));
    setName("");
    setZone(activeZone);
    setCapacity("4");
    setShape("round");
    setIsActive(true);
    setNewLayout(initialNewLayout(zoneTables.length));
    setInspectorTab("details");
    setMobileInspectorOpen(true);
  }

  function closeInspector() {
    setCreateMode(false);
    setMobileInspectorOpen(false);
    setSelectedId(null);
    setInspectorTab("details");
  }

  async function saveCurrent() {
    setBusy(true);
    try {
      if (createMode) {
        const payload = {
          restaurant_id: restaurantId,
          table_number: number.trim() || String((tables.data ?? []).length + 1),
          table_name: name.trim() || null,
          qr_token: crypto.randomUUID().replace(/-/g, ""),
          zone,
          capacity: clamp(Number(capacity) || 4, 1, 30),
          shape,
          is_active: isActive,
          layout: newLayout,
        };
        const { data, error } = await (supabase.from("restaurant_tables") as any).insert(payload).select("*").single();
        if (error) throw error;
        await logAudit("table.created", { restaurantId, entity: "restaurant_tables", entityId: data?.id });
        await refresh();
        if (data?.id) setSelectedId(data.id);
        setCreateMode(false);
        toast.success(ar ? "تمت إضافة الطاولة" : "Table added");
      } else if (selected && currentLayout) {
        const merged = { ...(selected.layout ?? {}), ...currentLayout };
        const { error } = await (supabase.from("restaurant_tables") as any)
          .update({
            table_number: number.trim() || selected.table_number,
            table_name: name.trim() || null,
            zone,
            capacity: clamp(Number(capacity) || 4, 1, 30),
            shape,
            is_active: isActive,
            layout: merged,
          })
          .eq("id", selected.id)
          .eq("restaurant_id", restaurantId);
        if (error) throw error;
        await logAudit("table.updated", { restaurantId, entity: "restaurant_tables", entityId: selected.id });
        await refresh();
        toast.success(ar ? "تم حفظ تغييرات الطاولة" : "Table changes saved");
      }
    } catch (error) {
      toast.error(humanError(error, lang));
    } finally {
      setBusy(false);
    }
  }

  async function removeSelected() {
    if (!selected) return;
    setBusy(true);
    try {
      const { error } = await supabase.from("restaurant_tables").delete().eq("id", selected.id).eq("restaurant_id", restaurantId);
      if (error) throw error;
      await logAudit("table.deleted", { restaurantId, entity: "restaurant_tables", entityId: selected.id });
      setDeleteOpen(false);
      setSelectedId(null);
      setMobileInspectorOpen(false);
      await refresh();
      toast.success(ar ? "تم حذف الطاولة" : "Table deleted");
    } catch (error) {
      toast.error(humanError(error, lang));
    } finally {
      setBusy(false);
    }
  }

  async function regenerate(id: string) {
    try {
      const { error } = await supabase
        .from("restaurant_tables")
        .update({ qr_token: crypto.randomUUID().replace(/-/g, ""), qr_code_url: null })
        .eq("id", id)
        .eq("restaurant_id", restaurantId);
      if (error) throw error;
      setQrPreview(null);
      await refresh();
      toast.success(t("common.saved"));
    } catch (error) {
      toast.error(humanError(error, lang));
    }
  }

  async function printAll() {
    if (!restaurant) return;
    const activeRows = (tables.data ?? []).filter((row) => row.is_active);
    if (!activeRows.length) return;
    await printQrCards(
      restaurant.name,
      t("sa.tables.scan"),
      activeRows.map((row) => ({ table_number: row.table_number, table_name: row.table_name, url: tableMenuUrl(restaurant.slug, row.qr_token) })),
      { back: ar ? "← رجوع" : "← Back", print: ar ? "طباعة" : "Print" },
    );
  }

  async function printSingle() {
    if (!restaurant || !selected) return;
    await printQrCards(
      restaurant.name,
      t("sa.tables.scan"),
      [{ table_number: selected.table_number, table_name: selected.table_name, url: tableMenuUrl(restaurant.slug, selected.qr_token) }],
      { back: ar ? "← رجوع" : "← Back", print: ar ? "طباعة" : "Print" },
    );
  }

  async function createBulk() {
    const total = clamp(Number(bulkCount) || 1, 1, 50);
    const first = (tables.data ?? []).length + 1;
    setBusy(true);
    try {
      const payload = Array.from({ length: total }, (_, index) => ({
        restaurant_id: restaurantId,
        table_number: String(first + index),
        table_name: null,
        qr_token: crypto.randomUUID().replace(/-/g, ""),
        zone: activeZone,
        capacity: 4,
        shape: "round",
        is_active: true,
        layout: initialNewLayout(zoneTables.length + index),
      }));
      const { error } = await (supabase.from("restaurant_tables") as any).insert(payload);
      if (error) throw error;
      await logAudit("table.created", { restaurantId, entity: "restaurant_tables", metadata: { count: total } });
      setBulkOpen(false);
      await refresh();
      toast.success(ar ? "تمت إضافة الطاولات" : "Tables added");
    } catch (error) {
      toast.error(humanError(error, lang));
    } finally {
      setBusy(false);
    }
  }

  function addZone() {
    const clean = zoneName.trim();
    if (!clean) return;
    const id = clean.toLowerCase().replace(/[^a-z0-9\u0600-\u06ff]+/g, "-").replace(/^-|-$/g, "") || `zone-${Date.now()}`;
    const item: ZoneOption = { id, en: clean, ar: clean };
    const next = [...customZones.filter((entry) => entry.id !== id), item];
    setCustomZones(next);
    if (typeof window !== "undefined") window.localStorage.setItem(storageKey(restaurantId), JSON.stringify(next));
    setActiveZone(id);
    setZone(id);
    setZoneName("");
    setZoneDialogOpen(false);
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLButtonElement>, table: FloorTable, layout: TableLayout) {
    if (!floorRef.current) return;
    const rect = floorRef.current.getBoundingClientRect();
    const pointerX = ((event.clientX - rect.left) / rect.width) * CANVAS_WIDTH;
    const pointerY = ((event.clientY - rect.top) / rect.height) * CANVAS_HEIGHT;
    dragRef.current = {
      id: table.id,
      pointerId: event.pointerId,
      offsetX: pointerX - layout.x,
      offsetY: pointerY - layout.y,
      moved: false,
      latest: layout,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setSelectedId(table.id);
    setCreateMode(false);
    setInspectorTab("details");
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !floorRef.current) return;
    const rect = floorRef.current.getBoundingClientRect();
    let x = ((event.clientX - rect.left) / rect.width) * CANVAS_WIDTH - drag.offsetX;
    let y = ((event.clientY - rect.top) / rect.height) * CANVAS_HEIGHT - drag.offsetY;
    if (snap) {
      x = Math.round(x / 10) * 10;
      y = Math.round(y / 10) * 10;
    }
    const next = { ...drag.latest, x: clamp(x, 55, 945), y: clamp(y, 55, 645) };
    drag.moved = drag.moved || Math.abs(next.x - drag.latest.x) > 1 || Math.abs(next.y - drag.latest.y) > 1;
    drag.latest = next;
    setDraftLayouts((current) => ({ ...current, [drag.id]: next }));
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    try { event.currentTarget.releasePointerCapture(event.pointerId); } catch { /* no-op */ }
    dragRef.current = null;
    if (drag.moved) void persistLayout(drag.id, drag.latest);
    else setMobileInspectorOpen(true);
  }

  const inspectorExists = createMode || !!selected;
  const inspectorVisibleMobile = createMode || mobileInspectorOpen;
  const titleNumber = createMode ? number || "New" : selected?.table_number ?? "";
  const activeCount = (tables.data ?? []).filter((row) => row.is_active).length;

  return (
    <div className="-mx-3 -my-3 min-h-[calc(100dvh-5.25rem)] overflow-hidden bg-[#07131d] text-[#f4f7f9] sm:-mx-5 sm:-my-5 lg:-mx-7 lg:-my-7">
      <div className="mx-auto w-full max-w-[1680px] p-4 sm:p-5 lg:p-6">
        <header className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <h1 className="font-display text-[30px] font-bold tracking-[-0.045em] text-white sm:text-[34px]">{ar ? "إدارة الطاولات" : "Table Management"}</h1>
            <p className="mt-1 text-sm text-slate-400">{ar ? "صمم توزيع المطعم، وأدر الطاولات، وأنشئ تجربة صالة مثالية." : "Design your restaurant layout, manage tables, and create the perfect dining experience."}</p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center sm:justify-end">
            <button type="button" className="qs-floor-control col-span-2 sm:col-auto"><span>{ar ? "الطابق الرئيسي" : "Main Floor"}</span><ChevronDown className="size-4" /></button>
            <button type="button" className="qs-floor-icon-control" aria-label={ar ? "توسيط المخطط" : "Center floor"} onClick={() => { setActiveZone("main"); setZoom(1); }}><MapPin className="size-4" /></button>
            <button type="button" className={cn("qs-floor-control", threeD && "border-slate-500 bg-[#132431]")} onClick={() => setThreeD((value) => !value)}><Move3d className="size-4" />{ar ? "عرض 3D" : "3D View"}</button>
            <button type="button" className="qs-floor-control" onClick={() => setZoom(1)}><RotateCcw className="size-4" />{ar ? "إعادة" : "Reset"}</button>
            <button type="button" className="col-span-2 inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#ff5a0a] px-5 text-sm font-bold text-white shadow-[0_12px_30px_rgba(255,90,10,.23)] transition hover:bg-[#e94f00] sm:col-auto" onClick={openCreate}><Plus className="size-5" />{ar ? "إضافة طاولة" : "Add Table"}</button>
          </div>
        </header>

        <div className="mt-5 flex flex-col gap-3 2xl:flex-row 2xl:items-center 2xl:justify-between">
          <div className="no-scrollbar flex max-w-full items-center gap-2 overflow-x-auto">
            <div className="flex shrink-0 rounded-xl border border-[#243746] bg-[#0d1b26] p-1">
              {allZones.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => { setActiveZone(entry.id); setSelectedId(null); setMobileInspectorOpen(false); }}
                  className={cn(
                    "min-h-11 shrink-0 rounded-lg px-5 text-xs font-semibold text-slate-400 transition sm:text-sm",
                    activeZone === entry.id && "bg-[#7d2d0d] text-white shadow-[inset_0_0_0_1px_#ff5a0a,0_8px_18px_rgba(255,90,10,.12)]",
                  )}
                >
                  {ar ? entry.ar : entry.en}
                </button>
              ))}
            </div>
            <button type="button" className="qs-floor-control shrink-0" onClick={() => setZoneDialogOpen(true)}><Plus className="size-4" />{ar ? "إضافة منطقة" : "Add Zone"}</button>
          </div>

          <div className="no-scrollbar flex shrink-0 gap-4 overflow-x-auto rounded-xl border border-[#1e3140] bg-[#0c1a24] px-4 py-3 text-[11px] text-slate-300 sm:gap-5">
            <LegendDot tone="bg-emerald-400" label={ar ? "متاحة" : "Available"} />
            <LegendDot tone="bg-rose-500" label={ar ? "مشغولة" : "Occupied"} />
            <LegendDot tone="bg-amber-400" label={ar ? "محجوزة" : "Reserved"} />
            <LegendDot tone="bg-slate-400" label={ar ? "غير نشطة" : "Inactive"} />
          </div>
        </div>

        {tables.isPending ? (
          <Skeleton className="mt-4 h-[720px] rounded-2xl bg-[#0d1b26]" />
        ) : (
          <div className={cn("mt-4 grid min-w-0 gap-4", inspectorExists ? "xl:grid-cols-[minmax(0,1fr)_390px]" : "xl:grid-cols-1")}>
            <section className="min-w-0 overflow-hidden rounded-2xl border border-[#253947] bg-[#08141d] shadow-[0_24px_70px_rgba(0,0,0,.34)]">
              <div className="relative overflow-auto bg-[#050b10] p-2 sm:p-3">
                <div
                  ref={floorRef}
                  className="relative isolate overflow-hidden rounded-xl border border-[#24333d] shadow-[inset_0_0_70px_rgba(0,0,0,.7)]"
                  style={{
                    width: `${zoom * 100}%`,
                    minWidth: `${760 * zoom}px`,
                    aspectRatio: `${CANVAS_WIDTH} / ${CANVAS_HEIGHT}`,
                    backgroundColor: "#1e2528",
                    backgroundImage:
                      "radial-gradient(circle at 5% 10%, rgba(38,117,72,.35), transparent 12%), radial-gradient(circle at 94% 88%, rgba(28,94,60,.32), transparent 15%), repeating-linear-gradient(0deg, rgba(255,255,255,.026) 0, rgba(255,255,255,.026) 1px, transparent 1px, transparent 48px), repeating-linear-gradient(90deg, rgba(255,255,255,.026) 0, rgba(255,255,255,.026) 1px, transparent 1px, transparent 48px), linear-gradient(135deg,#292e30 0%,#202628 48%,#171d1f 100%)",
                  }}
                >
                  <FloorDecor threeD={threeD} />

                  {zoneTables.map((table, index) => {
                    const layout = draftLayouts[table.id] ?? layoutFor(table, index);
                    return (
                      <FloorTablePiece
                        key={table.id}
                        table={table}
                        layout={layout}
                        selected={selected?.id === table.id && !createMode}
                        shape={normalizeShape(table.shape)}
                        threeD={threeD}
                        onPointerDown={(event) => handlePointerDown(event, table, layout)}
                        onPointerMove={handlePointerMove}
                        onPointerUp={handlePointerUp}
                        onPointerCancel={handlePointerUp}
                      />
                    );
                  })}

                  {zoneTables.length === 0 ? (
                    <div className="absolute inset-0 grid place-items-center p-6 text-center">
                      <div className="rounded-2xl border border-white/10 bg-black/35 p-6 backdrop-blur">
                        <Table2 className="mx-auto size-9 text-slate-400" />
                        <p className="mt-3 text-sm font-semibold">{ar ? "لا توجد طاولات في هذه المنطقة" : "No tables in this zone"}</p>
                        <button type="button" className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#ff5a0a] px-4 text-sm font-bold text-white" onClick={openCreate}><Plus className="size-4" />{ar ? "إضافة طاولة" : "Add Table"}</button>
                      </div>
                    </div>
                  ) : null}

                  <div className="absolute bottom-[5%] right-[8%] z-[2] grid h-[12%] w-[12%] min-w-[92px] place-items-center border border-[#9b571d]/70 bg-[linear-gradient(180deg,#4a2a13,#2b180e)] text-center shadow-[0_8px_22px_rgba(0,0,0,.45)]">
                    <div><span className="block text-xl text-orange-200">↑</span><span className="text-[10px] font-semibold text-orange-100/85">{ar ? "المدخل" : "Entrance"}</span></div>
                  </div>
                </div>

                <div className="absolute bottom-5 left-5 z-20 flex items-center rounded-xl border border-[#2a4050] bg-[#0b1923]/95 p-1 shadow-xl backdrop-blur">
                  <button type="button" className="grid size-10 place-items-center rounded-lg text-slate-200 hover:bg-white/5" onClick={() => setZoom((value) => clamp(Number((value - 0.1).toFixed(2)), 0.7, 1.5))}><Minus className="size-4" /></button>
                  <span className="min-w-16 px-2 text-center text-xs font-semibold text-slate-200">{Math.round(zoom * 100)}%</span>
                  <button type="button" className="grid size-10 place-items-center rounded-lg text-slate-200 hover:bg-white/5" onClick={() => setZoom((value) => clamp(Number((value + 0.1).toFixed(2)), 0.7, 1.5))}><Plus className="size-4" /></button>
                  <div className="mx-1 h-6 w-px bg-white/10" />
                  <button type="button" className="grid size-10 place-items-center rounded-lg text-slate-200 hover:bg-white/5" onClick={() => floorRef.current?.requestFullscreen?.()} aria-label={ar ? "ملء الشاشة" : "Fullscreen"}><Expand className="size-4" /></button>
                  <button type="button" className={cn("grid size-10 place-items-center rounded-lg text-slate-200 hover:bg-white/5", snap && "bg-white/8 text-orange-400")} onClick={() => setSnap((value) => !value)} aria-label={ar ? "محاذاة للشبكة" : "Snap to grid"}><Grid2x2 className="size-4" /></button>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#20313e] bg-[#0b1821] px-4 py-3 text-[11px] text-slate-400">
                <div className="flex items-center gap-4"><span>{zoneTables.length} {ar ? "طاولة" : "tables"}</span><span>{activeCount} {ar ? "نشطة بالمطعم" : "active restaurant-wide"}</span></div>
                <button type="button" className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-[#2b3e4c] px-3 font-semibold text-slate-300 hover:bg-white/5" onClick={() => void printAll()}><Printer className="size-4" />{ar ? "طباعة جميع QR" : "Print all QR"}</button>
              </div>
            </section>

            {inspectorExists ? (
              <>
                {inspectorVisibleMobile ? <button type="button" className="fixed inset-0 z-40 bg-black/60 backdrop-blur-[2px] xl:hidden" onClick={() => setMobileInspectorOpen(false)} aria-label={ar ? "إغلاق محرر الطاولة" : "Close table editor"} /> : null}
                <aside className={cn(
                  "border border-[#2a3e4c] bg-[#0c1a24] text-slate-100 shadow-[0_24px_60px_rgba(0,0,0,.38)]",
                  "xl:sticky xl:top-24 xl:block xl:max-h-[calc(100dvh-7rem)] xl:self-start xl:overflow-y-auto xl:rounded-2xl",
                  inspectorVisibleMobile ? "fixed inset-x-2 bottom-[calc(5.25rem+env(safe-area-inset-bottom))] z-50 block max-h-[82dvh] overflow-y-auto rounded-2xl" : "hidden xl:block",
                )}>
                  <div className="sticky top-0 z-20 border-b border-[#203340] bg-[#0c1a24]/96 px-4 pt-4 backdrop-blur sm:px-5 sm:pt-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-3">
                          <h2 className="truncate font-display text-xl font-bold text-white">{createMode ? (ar ? "طاولة جديدة" : "New Table") : `${ar ? "طاولة" : "Table"} T${titleNumber}`}</h2>
                          <span className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold", isActive ? "bg-emerald-500/15 text-emerald-300" : "bg-slate-500/15 text-slate-400")}><i className={cn("size-2 rounded-full", isActive ? "bg-emerald-400" : "bg-slate-400")} />{isActive ? t("common.active") : t("common.inactive")}</span>
                        </div>
                      </div>
                      <button type="button" className="grid size-10 shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-white/5 hover:text-white" onClick={closeInspector} aria-label={t("common.close")}><X className="size-5" /></button>
                    </div>

                    <div className="mt-4 grid grid-cols-4 text-center text-xs font-semibold text-slate-400">
                      {(["details", "style", "qr", "more"] as InspectorTab[]).map((tab) => (
                        <button key={tab} type="button" onClick={() => setInspectorTab(tab)} className={cn("relative min-h-11 px-2 capitalize transition hover:text-white", inspectorTab === tab && "text-[#ff5a0a]")}>
                          {tab === "details" ? (ar ? "التفاصيل" : "Details") : tab === "style" ? (ar ? "النمط" : "Style") : tab === "qr" ? "QR Code" : (ar ? "المزيد" : "More")}
                          {inspectorTab === tab ? <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-[#ff5a0a]" /> : null}
                        </button>
                      ))}
                    </div>
                  </div>

                  {inspectorTab === "details" ? (
                    <div className="space-y-4 p-4 sm:p-5">
                      <div className="grid grid-cols-2 gap-3">
                        <DarkField label={ar ? "رقم الطاولة *" : "Table Number *"}><Input value={number} onChange={(event) => setNumber(event.target.value)} className="h-11 border-[#304654] bg-[#112431] text-white" /></DarkField>
                        <DarkField label={ar ? "اسم الطاولة" : "Table Name"}><Input value={name} onChange={(event) => setName(event.target.value)} className="h-11 border-[#304654] bg-[#112431] text-white" /></DarkField>
                      </div>

                      <DarkField label={ar ? "السعة *" : "Capacity *"}>
                        <div className="grid grid-cols-[44px_1fr_44px_44px] overflow-hidden rounded-xl border border-[#304654] bg-[#112431]">
                          <button type="button" className="grid min-h-11 place-items-center border-e border-[#304654] hover:bg-white/5" onClick={() => setCapacity(String(clamp((Number(capacity) || 1) - 1, 1, 30)))}><Minus className="size-4" /></button>
                          <div className="grid min-h-11 place-items-center text-sm font-bold">{capacity}</div>
                          <button type="button" className="grid min-h-11 place-items-center border-s border-[#304654] hover:bg-white/5" onClick={() => setCapacity(String(clamp((Number(capacity) || 1) + 1, 1, 30)))}><Plus className="size-4" /></button>
                          <div className="grid min-h-11 place-items-center border-s border-[#304654] text-slate-400"><UsersRound className="size-4" /></div>
                        </div>
                      </DarkField>

                      <DarkField label={ar ? "الشكل" : "Shape"}>
                        <div className="grid grid-cols-3 gap-2">
                          <ShapeButton active={shape === "round"} icon={<Circle className="size-4" />} label={ar ? "دائرية" : "Round"} onClick={() => setShape("round")} />
                          <ShapeButton active={shape === "square"} icon={<Square className="size-4" />} label={ar ? "مربعة" : "Square"} onClick={() => setShape("square")} />
                          <ShapeButton active={shape === "rectangle"} icon={<RectangleHorizontal className="size-4" />} label={ar ? "مستطيلة" : "Rectangle"} onClick={() => setShape("rectangle")} />
                        </div>
                      </DarkField>

                      <DarkField label={ar ? "الحالة" : "Status"}>
                        <Select value={isActive ? "active" : "inactive"} onValueChange={(value) => setIsActive(value === "active")}>
                          <SelectTrigger className="h-11 border-[#304654] bg-[#112431] text-white"><SelectValue /></SelectTrigger>
                          <SelectContent><SelectItem value="active">{ar ? "نشطة" : "Active"}</SelectItem><SelectItem value="inactive">{ar ? "غير نشطة" : "Inactive"}</SelectItem></SelectContent>
                        </Select>
                      </DarkField>

                      <DarkField label={ar ? "المنطقة" : "Zone"}>
                        <Select value={zone} onValueChange={setZone}>
                          <SelectTrigger className="h-11 border-[#304654] bg-[#112431] text-white"><Map className="me-2 size-4" /><SelectValue /></SelectTrigger>
                          <SelectContent>{allZones.map((entry) => <SelectItem key={entry.id} value={entry.id}>{ar ? entry.ar : entry.en}</SelectItem>)}</SelectContent>
                        </Select>
                      </DarkField>

                      {currentLayout ? (
                        <div className="space-y-3 pt-1">
                          <div className="flex items-center justify-between"><h3 className="text-sm font-semibold text-slate-200">{ar ? "الموقع والحجم" : "Position & Size"}</h3><button type="button" className="grid size-9 place-items-center rounded-lg border border-[#304654] text-slate-400 hover:bg-white/5" onClick={() => setSnap((value) => !value)}><Grid2x2 className="size-4" /></button></div>
                          <div className="grid grid-cols-3 gap-2">
                            <CompactNumber label="X" value={Math.round(currentLayout.x)} onChange={(value) => setSelectedLayout({ x: clamp(value, 55, 945) })} />
                            <CompactNumber label="Y" value={Math.round(currentLayout.y)} onChange={(value) => setSelectedLayout({ y: clamp(value, 55, 645) })} />
                            <CompactNumber label={ar ? "الدوران" : "Rotation"} suffix="°" value={Math.round(currentLayout.rotation)} onChange={(value) => setSelectedLayout({ rotation: clamp(value, -180, 180) })} />
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {inspectorTab === "style" && currentLayout ? (
                    <div className="space-y-5 p-4 sm:p-5">
                      <DarkField label={ar ? "خامة سطح الطاولة" : "Tabletop Material"}>
                        <div className="grid grid-cols-2 gap-2">
                          {([
                            ["wood", ar ? "خشب" : "Wood"],
                            ["dark-wood", ar ? "خشب داكن" : "Dark Wood"],
                            ["marble", ar ? "رخام" : "Marble"],
                            ["neutral", ar ? "محايد" : "Neutral"],
                          ] as Array<[TableMaterial, string]>).map(([value, label]) => (
                            <button key={value} type="button" onClick={() => setSelectedLayout({ material: value })} className={cn("min-h-16 rounded-xl border px-3 text-sm font-semibold", currentLayout.material === value ? "border-[#ff5a0a] bg-orange-500/10 text-white" : "border-[#304654] bg-[#112431] text-slate-300 hover:bg-[#162b39]")}><span className="mx-auto mb-2 block h-3 w-12 rounded-full" style={materialSwatch(value)} />{label}</button>
                          ))}
                        </div>
                      </DarkField>
                      <DarkField label={ar ? "حجم الطاولة" : "Table Size"}>
                        <div className="grid grid-cols-[44px_1fr_44px] overflow-hidden rounded-xl border border-[#304654] bg-[#112431]">
                          <button type="button" className="grid min-h-11 place-items-center border-e border-[#304654]" onClick={() => setSelectedLayout({ scale: clamp(Number((currentLayout.scale - 0.05).toFixed(2)), 0.7, 1.45) })}><Minus className="size-4" /></button>
                          <div className="grid place-items-center text-sm font-bold">{Math.round(currentLayout.scale * 100)}%</div>
                          <button type="button" className="grid min-h-11 place-items-center border-s border-[#304654]" onClick={() => setSelectedLayout({ scale: clamp(Number((currentLayout.scale + 0.05).toFixed(2)), 0.7, 1.45) })}><Plus className="size-4" /></button>
                        </div>
                      </DarkField>
                      <p className="rounded-xl border border-[#253a48] bg-[#0a1620] p-3 text-xs leading-5 text-slate-400">{ar ? "يتم تمثيل عدد الكراسي تلقائياً حسب سعة الطاولة." : "Chair visualization is generated automatically from table capacity."}</p>
                    </div>
                  ) : null}

                  {inspectorTab === "qr" ? (
                    <div className="space-y-4 p-4 sm:p-5">
                      {createMode ? <p className="rounded-xl border border-[#2a3d4b] bg-[#112431] p-4 text-sm text-slate-400">{ar ? "احفظ الطاولة أولاً لإنشاء رمز QR." : "Save the table first to generate its QR code."}</p> : selected ? (
                        <>
                          <div className="grid place-items-center rounded-2xl border border-[#2b4050] bg-white p-5">{qrPreview ? <img src={qrPreview} alt={`QR T${selected.table_number}`} className="size-56 max-w-full" /> : <Skeleton className="size-56" />}</div>
                          <div className="grid grid-cols-2 gap-2"><button type="button" disabled={!qrPreview} onClick={() => qrPreview && downloadDataUrl(qrPreview, `table-${selected.table_number}-qr.png`)} className="qs-floor-control justify-center"><Download className="size-4" />{ar ? "تنزيل" : "Download"}</button><button type="button" onClick={() => void printSingle()} className="qs-floor-control justify-center"><Printer className="size-4" />{ar ? "طباعة" : "Print"}</button></div>
                          <button type="button" className="qs-floor-control w-full justify-center" onClick={() => void regenerate(selected.id)}><RefreshCw className="size-4" />{ar ? "تجديد QR" : "Regenerate QR"}</button>
                        </>
                      ) : null}
                    </div>
                  ) : null}

                  {inspectorTab === "more" ? (
                    <div className="space-y-3 p-4 sm:p-5">
                      <button type="button" className="qs-floor-control w-full justify-between" onClick={() => setIsActive((value) => !value)}><span>{isActive ? (ar ? "تعطيل الطاولة" : "Deactivate Table") : (ar ? "تفعيل الطاولة" : "Activate Table")}</span><span className={cn("size-2.5 rounded-full", isActive ? "bg-emerald-400" : "bg-slate-400")} /></button>
                      <button type="button" className="qs-floor-control w-full justify-center" onClick={() => setBulkOpen(true)}><Layers3 className="size-4" />{ar ? "إضافة عدة طاولات" : "Bulk Add Tables"}</button>
                      {!createMode && selected ? <button type="button" className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-red-500/40 bg-red-500/5 px-4 text-sm font-semibold text-red-400 hover:bg-red-500/10" onClick={() => setDeleteOpen(true)}><Trash2 className="size-4" />{ar ? "حذف الطاولة" : "Delete Table"}</button> : null}
                    </div>
                  ) : null}

                  <div className="safe-bottom sticky bottom-0 z-20 grid grid-cols-2 gap-3 border-t border-[#203340] bg-[#0c1a24]/96 p-4 backdrop-blur sm:p-5">
                    {!createMode && selected ? (
                      <button type="button" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-red-500/35 bg-red-500/5 px-4 text-sm font-bold text-red-400 hover:bg-red-500/10" onClick={() => setDeleteOpen(true)}><Trash2 className="size-4" />{ar ? "حذف الطاولة" : "Delete Table"}</button>
                    ) : (
                      <button type="button" className="qs-floor-control justify-center" onClick={closeInspector}>{t("common.cancel")}</button>
                    )}
                    <button type="button" disabled={busy || !number.trim()} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#ff5a0a] px-4 text-sm font-bold text-white shadow-[0_10px_28px_rgba(255,90,10,.2)] hover:bg-[#e94f00] disabled:opacity-50" onClick={() => void saveCurrent()}><Save className="size-4" />{busy ? (ar ? "جارٍ الحفظ…" : "Saving…") : (ar ? "حفظ التغييرات" : "Save Changes")}</button>
                  </div>
                </aside>
              </>
            ) : null}
          </div>
        )}
      </div>

      <Dialog open={zoneDialogOpen} onOpenChange={setZoneDialogOpen}>
        <DialogContent><DialogHeader><DialogTitle>{ar ? "إضافة منطقة" : "Add Zone"}</DialogTitle><DialogDescription>{ar ? "أضف اسماً لمنطقة جديدة مثل العائلات أو VIP." : "Add a new floor zone such as Family or VIP."}</DialogDescription></DialogHeader><div className="space-y-2"><Label>{ar ? "اسم المنطقة" : "Zone name"}</Label><Input value={zoneName} onChange={(event) => setZoneName(event.target.value)} /></div><DialogFooter><Button variant="ghost" onClick={() => setZoneDialogOpen(false)}>{t("common.cancel")}</Button><Button disabled={!zoneName.trim()} onClick={addZone}>{t("common.create")}</Button></DialogFooter></DialogContent>
      </Dialog>

      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent><DialogHeader><DialogTitle>{ar ? "إضافة عدة طاولات" : "Bulk Add Tables"}</DialogTitle><DialogDescription>{ar ? "سيتم توزيع الطاولات الجديدة داخل المنطقة الحالية." : "New tables will be placed into the current zone using the floor layout."}</DialogDescription></DialogHeader><div className="space-y-2"><Label>{ar ? "عدد الطاولات" : "Number of tables"}</Label><Input type="number" min="1" max="50" value={bulkCount} onChange={(event) => setBulkCount(event.target.value)} /></div><DialogFooter><Button variant="ghost" onClick={() => setBulkOpen(false)}>{t("common.cancel")}</Button><Button disabled={busy} onClick={() => void createBulk()}>{ar ? "إضافة" : "Add Tables"}</Button></DialogFooter></DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{ar ? "حذف الطاولة؟" : "Delete this table?"}</AlertDialogTitle><AlertDialogDescription>{ar ? "سيتم حذف الطاولة من مخطط المطعم. لا يمكن التراجع عن هذا الإجراء." : "This removes the table from the restaurant floor. This action cannot be undone."}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel><AlertDialogAction disabled={busy} onClick={() => void removeSelected()}>{t("common.delete")}</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>

      <style>{`
        .qs-floor-control{display:inline-flex;min-height:44px;align-items:center;gap:.55rem;border:1px solid #2b4050;border-radius:11px;background:#0d1c27;padding:.65rem .9rem;color:#eef3f6;font-size:.78rem;font-weight:650;transition:background .15s,border-color .15s,transform .15s}.qs-floor-control:hover{background:#132633;border-color:#405564}.qs-floor-icon-control{display:grid;min-width:44px;min-height:44px;place-items:center;border:1px solid #2b4050;border-radius:11px;background:#0d1c27;color:#eef3f6}.qs-floor-icon-control:hover{background:#132633}.qs-table-piece{touch-action:none;user-select:none;-webkit-user-select:none}.qs-table-piece:focus-visible{outline:2px solid #ff5a0a;outline-offset:3px}@media(max-width:1279px){.qs-table-piece{cursor:pointer}}@media(prefers-reduced-motion:reduce){.qs-table-piece,.qs-floor-control{transition:none!important}}
      `}</style>
    </div>
  );
}

function FloorTablePiece({
  table,
  layout,
  shape,
  selected,
  threeD,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
}: {
  table: FloorTable;
  layout: TableLayout;
  shape: TableShape;
  selected: boolean;
  threeD: boolean;
  onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onPointerCancel: (event: ReactPointerEvent<HTMLButtonElement>) => void;
}) {
  const seats = clamp(table.capacity ?? 4, 1, 8);
  const round = shape === "round";
  const widthClass = round ? "w-[12.5%] min-w-[98px] max-w-[146px]" : shape === "square" ? "w-[13%] min-w-[104px] max-w-[150px]" : "w-[16%] min-w-[126px] max-w-[184px]";
  const aspectClass = round || shape === "square" ? "aspect-square" : "aspect-[1.55/1]";

  return (
    <button
      type="button"
      className={cn("qs-table-piece absolute z-10", widthClass, aspectClass)}
      style={{
        left: `${layout.x / 10}%`,
        top: `${layout.y / 7}%`,
        transform: `translate(-50%,-50%) rotate(${layout.rotation}deg) scale(${layout.scale})`,
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      aria-label={`Table ${table.table_number}`}
    >
      {Array.from({ length: seats }, (_, index) => <Chair key={index} index={index} count={seats} round={round} threeD={threeD} />)}
      <span
        className={cn(
          "absolute inset-[8%] grid place-items-center overflow-hidden border text-center text-white",
          round ? "rounded-full" : shape === "square" ? "rounded-[20%]" : "rounded-[22%]",
          selected ? "border-[#61a8ff] shadow-[0_0_0_2px_#318cff,0_0_18px_5px_rgba(49,140,255,.75),0_15px_24px_rgba(0,0,0,.55)]" : "border-white/10",
          threeD ? "shadow-[inset_0_2px_3px_rgba(255,255,255,.17),inset_0_-8px_16px_rgba(0,0,0,.35),0_14px_22px_rgba(0,0,0,.55)]" : "shadow-[0_8px_16px_rgba(0,0,0,.35)]",
        )}
        style={materialStyle(layout.material)}
      >
        <span className="relative z-10 px-2">
          <strong className="block font-display text-[clamp(14px,1.25vw,20px)] font-bold leading-none">T{table.table_number}</strong>
          <span className="mt-1 block text-[clamp(9px,.75vw,12px)] text-white/75">{table.capacity ?? 4} seats</span>
          <i className={cn("mx-auto mt-2 block size-2.5 rounded-full shadow-[0_0_10px_currentColor]", table.is_active ? "bg-emerald-400 text-emerald-400" : "bg-slate-400 text-slate-400")} />
        </span>
      </span>
    </button>
  );
}

function Chair({ index, count, round, threeD }: { index: number; count: number; round: boolean; threeD: boolean }) {
  const angle = (360 / count) * index - 90;
  const radius = round ? 46 : 53;
  const x = 50 + Math.cos((angle * Math.PI) / 180) * radius;
  const y = 50 + Math.sin((angle * Math.PI) / 180) * radius;
  return (
    <span
      className={cn("absolute z-0 h-[22%] w-[28%] rounded-[34%] border border-[#a66b3b]/45 bg-[linear-gradient(180deg,#7c4b2d,#362116)]", threeD && "shadow-[inset_0_2px_2px_rgba(255,255,255,.12),0_7px_10px_rgba(0,0,0,.5)]")}
      style={{ left: `${x}%`, top: `${y}%`, transform: `translate(-50%,-50%) rotate(${angle + 90}deg)` }}
    />
  );
}

function FloorDecor({ threeD }: { threeD: boolean }) {
  return (
    <>
      <div className="pointer-events-none absolute inset-[1.2%] rounded-lg border-[8px] border-[#101719] shadow-[inset_0_0_0_1px_rgba(255,255,255,.05),inset_0_0_25px_rgba(0,0,0,.7)]" />
      <div className="pointer-events-none absolute right-[7%] top-[6%] h-[44%] w-[32%] border border-[#554535]/60 bg-[repeating-linear-gradient(45deg,rgba(255,255,255,.018)_0_2px,transparent_2px_7px),linear-gradient(145deg,#41372f,#241f1b)] shadow-[inset_0_0_32px_rgba(0,0,0,.45),0_10px_25px_rgba(0,0,0,.4)]" />
      <div className="pointer-events-none absolute left-[21%] top-[51%] h-[7%] w-[51%] border border-[#64411f]/70 bg-[linear-gradient(180deg,#56331c,#2e1d13)] shadow-[0_8px_15px_rgba(0,0,0,.45)]">
        <div className="absolute inset-x-[8%] top-[-23%] h-[52%] rounded-full" style={{ backgroundImage: "radial-gradient(circle,#1d7044 0 25%,transparent 27%),radial-gradient(circle at 35% 55%,#2a8650 0 22%,transparent 24%),radial-gradient(circle at 70% 35%,#235d3d 0 24%,transparent 26%)", backgroundSize: "42px 22px" }} />
      </div>
      <div className="pointer-events-none absolute left-[3%] top-[3%] h-[12%] w-[12%] rounded-full opacity-80" style={{ background: "radial-gradient(circle at 45% 40%,#3d945c 0 10%,#225539 25%,transparent 66%)" }} />
      <div className="pointer-events-none absolute bottom-[4%] left-[6%] h-[12%] w-[12%] rounded-full opacity-70" style={{ background: "radial-gradient(circle at 45% 40%,#3d945c 0 10%,#225539 25%,transparent 66%)" }} />
      <div className="pointer-events-none absolute bottom-[3%] right-[3%] h-[16%] w-[15%] rounded-full opacity-70" style={{ background: "radial-gradient(circle at 45% 40%,#3d945c 0 10%,#225539 25%,transparent 66%)" }} />
      {threeD ? <>
        <div className="pointer-events-none absolute left-[1%] top-[12%] h-[50%] w-[1.2%] bg-[linear-gradient(180deg,#ffb45f55,transparent,#ffb45f30)] blur-[1px]" />
        <div className="pointer-events-none absolute right-[1.6%] top-[9%] h-[62%] w-[1.2%] bg-[linear-gradient(180deg,#ffb45f45,transparent,#ffb45f30)] blur-[1px]" />
      </> : null}
    </>
  );
}

function materialStyle(material: TableMaterial): CSSProperties {
  if (material === "marble") return {
    backgroundColor: "#22272a",
    backgroundImage: "linear-gradient(120deg,transparent 0 38%,rgba(255,255,255,.11) 39%,transparent 41%),linear-gradient(35deg,transparent 0 58%,rgba(255,255,255,.08) 59%,transparent 61%),linear-gradient(150deg,#15191c,#34383b 55%,#111416)",
  };
  if (material === "dark-wood") return {
    backgroundColor: "#3a2114",
    backgroundImage: "repeating-linear-gradient(92deg,rgba(255,255,255,.035) 0 1px,transparent 1px 12px),linear-gradient(145deg,#5a321c,#2d180f 58%,#482413)",
  };
  if (material === "neutral") return {
    backgroundColor: "#4b4d4c",
    backgroundImage: "linear-gradient(145deg,#6b6e6b,#3d403f 58%,#555856)",
  };
  return {
    backgroundColor: "#78451f",
    backgroundImage: "repeating-linear-gradient(92deg,rgba(255,255,255,.04) 0 1px,transparent 1px 11px),linear-gradient(145deg,#9a5e32,#5f3219 58%,#7b421f)",
  };
}

function materialSwatch(material: TableMaterial): CSSProperties {
  return { ...materialStyle(material), boxShadow: "inset 0 1px rgba(255,255,255,.15)" };
}

function LegendDot({ tone, label }: { tone: string; label: string }) {
  return <span className="flex shrink-0 items-center gap-2"><i className={cn("size-3 rounded-full", tone)} />{label}</span>;
}

function DarkField({ label, children }: { label: string; children: ReactNode }) {
  return <div className="space-y-2"><Label className="text-xs font-semibold text-slate-300">{label}</Label>{children}</div>;
}

function ShapeButton({ active, icon, label, onClick }: { active: boolean; icon: ReactNode; label: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} className={cn("inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-2 text-xs font-semibold transition", active ? "border-[#ff5a0a] bg-orange-500/10 text-white shadow-[inset_0_0_0_1px_rgba(255,90,10,.12)]" : "border-[#304654] bg-[#112431] text-slate-300 hover:bg-[#162b39]")}>{icon}{label}</button>;
}

function CompactNumber({ label, value, suffix, onChange }: { label: string; value: number; suffix?: string; onChange: (value: number) => void }) {
  return <label className="space-y-1.5 text-[10px] font-semibold text-slate-400"><span>{label}</span><div className="relative"><Input type="number" value={value} onChange={(event) => onChange(Number(event.target.value) || 0)} className="h-11 border-[#304654] bg-[#112431] pe-6 text-white" />{suffix ? <span className="pointer-events-none absolute end-2 top-1/2 -translate-y-1/2 text-xs text-slate-500">{suffix}</span> : null}</div></label>;
}
