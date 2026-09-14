import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  FileText,
  Loader2,
  Maximize2,
  MousePointer2,
  Save,
  Settings2,
  Trash2,
  Upload,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { humanError } from "@/lib/errors";
import { fetchPdfBytes, openPdf, renderPdfPage, type PdfMenuAnalysis, type PdfMenuCandidate } from "@/lib/pdf-menu";
import { extractPdfVisualProducts } from "@/lib/pdf-menu-vision.server";
import { MAX_PDF_BYTES, uploadRestaurantPdf } from "@/lib/storage";
import { cn } from "@/lib/utils";

type Product = {
  candidate_id: string;
  name_en: string;
  name_ar: string;
  description_en: string | null;
  description_ar: string | null;
  price: number | null;
  currency: string;
  confidence: number;
};

type Rect = { x: number; y: number; width: number; height: number };
type DocumentRow = {
  id: string;
  file_url: string;
  file_parts?: string[];
  file_name: string;
  page_count: number;
  analysis: PdfMenuAnalysis;
  is_active: boolean;
};

type HotspotDrag = {
  kind: "move" | "resize";
  handle?: string;
  pointerX: number;
  pointerY: number;
  rect: Rect;
};

const EMPTY: PdfMenuAnalysis = { page_count: 0, pages: [], candidates: [] };
const JOD = "JOD";
const MIN_ZOOM = 0.35;
const MAX_ZOOM = 2;
const ZOOM_STEP = 0.05;

function emptyProduct(id: string): Product {
  return { candidate_id: id, name_en: "", name_ar: "", description_en: null, description_ar: null, price: null, currency: JOD, confidence: 1 };
}

function onlyManual(analysis: PdfMenuAnalysis | null | undefined): PdfMenuAnalysis {
  return { ...(analysis ?? EMPTY), candidates: (analysis?.candidates ?? []).filter((candidate) => candidate.id.startsWith("manual-")) };
}

function clampZoom(value: number) {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Number(value.toFixed(2))));
}

function normalizeRect(rect: Rect): Rect {
  const left = Math.max(0, Math.min(1, Math.min(rect.x, rect.x + rect.width)));
  const top = Math.max(0, Math.min(1, Math.min(rect.y, rect.y + rect.height)));
  const right = Math.max(0, Math.min(1, Math.max(rect.x, rect.x + rect.width)));
  const bottom = Math.max(0, Math.min(1, Math.max(rect.y, rect.y + rect.height)));
  return {
    x: left,
    y: top,
    width: Math.max(0.008, right - left),
    height: Math.max(0.008, bottom - top),
  };
}

function EditableHotspot({
  candidate,
  active,
  enabled,
  label,
  onSelect,
  onChange,
  stageRef,
}: {
  candidate: PdfMenuCandidate;
  active: boolean;
  enabled: boolean;
  label: string;
  onSelect: () => void;
  onChange: (rect: Rect) => void;
  stageRef: React.RefObject<HTMLDivElement | null>;
}) {
  const drag = useRef<HotspotDrag | null>(null);
  const rect = { x: candidate.x, y: candidate.y, width: candidate.width, height: candidate.height };

  function beginMove(event: React.PointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (!active) {
      onSelect();
      return;
    }
    event.currentTarget.setPointerCapture?.(event.pointerId);
    drag.current = { kind: "move", pointerX: event.clientX, pointerY: event.clientY, rect };
  }

  function beginResize(event: React.PointerEvent<HTMLButtonElement>, handle: string) {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    drag.current = { kind: "resize", handle, pointerX: event.clientX, pointerY: event.clientY, rect };
  }

  function move(event: React.PointerEvent<HTMLButtonElement>) {
    const state = drag.current;
    const stage = stageRef.current;
    if (!state || !stage) return;
    event.preventDefault();
    event.stopPropagation();
    const box = stage.getBoundingClientRect();
    const dx = (event.clientX - state.pointerX) / Math.max(1, box.width);
    const dy = (event.clientY - state.pointerY) / Math.max(1, box.height);
    let next = { ...state.rect };

    if (state.kind === "move") {
      next.x = Math.max(0, Math.min(1 - next.width, next.x + dx));
      next.y = Math.max(0, Math.min(1 - next.height, next.y + dy));
    } else {
      const handle = state.handle ?? "se";
      if (handle.includes("w")) { next.x += dx; next.width -= dx; }
      if (handle.includes("e")) next.width += dx;
      if (handle.includes("n")) { next.y += dy; next.height -= dy; }
      if (handle.includes("s")) next.height += dy;
      next = normalizeRect(next);
    }
    onChange(next);
  }

  function end(event: React.PointerEvent<HTMLButtonElement>) {
    event.stopPropagation();
    drag.current = null;
  }

  const handles = [
    ["nw", "-left-1.5 -top-1.5 cursor-nwse-resize"],
    ["n", "left-1/2 -top-1.5 -translate-x-1/2 cursor-ns-resize"],
    ["ne", "-right-1.5 -top-1.5 cursor-nesw-resize"],
    ["w", "-left-1.5 top-1/2 -translate-y-1/2 cursor-ew-resize"],
    ["e", "-right-1.5 top-1/2 -translate-y-1/2 cursor-ew-resize"],
    ["sw", "-left-1.5 -bottom-1.5 cursor-nesw-resize"],
    ["s", "left-1/2 -bottom-1.5 -translate-x-1/2 cursor-ns-resize"],
    ["se", "-right-1.5 -bottom-1.5 cursor-nwse-resize"],
  ] as const;

  return (
    <div
      className="qs-pdf-hotspot absolute z-30"
      data-active={active}
      style={{ left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.width * 100}%`, height: `${rect.height * 100}%` }}
    >
      <button
        type="button"
        aria-label={active ? "Move selected menu area" : "Select menu area"}
        onPointerDown={beginMove}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        onClick={(event) => { event.stopPropagation(); onSelect(); }}
        className={cn(
          "absolute inset-0 rounded-md border-2 transition",
          active ? "cursor-move border-[#ff5a0a] bg-orange-500/12 shadow-[0_0_0_3px_rgba(255,90,10,.12)]" : "border-[#ff5a0a]/55 bg-orange-500/[.05] hover:bg-orange-500/[.1]",
          !enabled && "border-dashed opacity-50",
        )}
      >
        {active ? <span className="absolute -top-7 start-0 max-w-[220px] truncate rounded-md bg-slate-950 px-2 py-1 text-[10px] font-bold text-white shadow-lg">{label || "Selected area"}</span> : null}
      </button>

      {active ? handles.map(([handle, position]) => (
        <button
          key={handle}
          type="button"
          aria-label={`Resize selected area ${handle}`}
          onPointerDown={(event) => beginResize(event, handle)}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
          className={cn("qs-pdf-handle absolute z-50 size-3.5 rounded-full border-2 border-white bg-[#ff5a0a] shadow-md", position)}
        />
      )) : null}
    </div>
  );
}

export function PdfMenuManagerV3({ restaurantId }: { restaurantId: string }) {
  const queryClient = useQueryClient();
  const runVision = useServerFn(extractPdfVisualProducts);
  const inputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [documentRow, setDocumentRow] = useState<DocumentRow | null>(null);
  const [analysis, setAnalysis] = useState<PdfMenuAnalysis>(EMPTY);
  const [drafts, setDrafts] = useState<Record<string, Product>>({});
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [fileParts, setFileParts] = useState<string[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(0.55);
  const [selecting, setSelecting] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [dragRect, setDragRect] = useState<Rect | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [enabledMap, setEnabledMap] = useState<Record<string, boolean>>({});
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [taxRate, setTaxRate] = useState(0);
  const [serviceRate, setServiceRate] = useState(0);
  const [serviceEnabled, setServiceEnabled] = useState(false);
  const [chargesSaving, setChargesSaving] = useState(false);

  const existing = useQuery<DocumentRow | null>({
    queryKey: ["platform", "pdf-document", restaurantId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("menu_pdf_documents")
        .select("id,file_url,file_parts,file_name,page_count,analysis,is_active")
        .eq("restaurant_id", restaurantId)
        .maybeSingle();
      if (error) throw error;
      return data as DocumentRow | null;
    },
  });

  const charges = useQuery({
    queryKey: ["platform", "restaurant-menu-charges", restaurantId],
    queryFn: async () => {
      const [restaurant, settings] = await Promise.all([
        supabase.from("restaurants").select("tax_rate,service_charge").eq("id", restaurantId).single(),
        supabase.from("restaurant_settings").select("enable_service_charge").eq("restaurant_id", restaurantId).maybeSingle(),
      ]);
      if (restaurant.error) throw restaurant.error;
      if (settings.error) throw settings.error;
      return {
        tax: Number(restaurant.data.tax_rate ?? 0),
        service: Number(restaurant.data.service_charge ?? 0),
        enabled: Boolean(settings.data?.enable_service_charge),
      };
    },
  });

  useEffect(() => {
    if (!existing.data || documentRow || file) return;
    const clean = onlyManual(existing.data.analysis);
    setDocumentRow(existing.data);
    setAnalysis(clean);
    setFileUrl(existing.data.file_url);
    setFileParts(existing.data.file_parts ?? []);
  }, [existing.data, documentRow, file]);

  useEffect(() => {
    if (!charges.data) return;
    setTaxRate(charges.data.tax);
    setServiceRate(charges.data.service);
    setServiceEnabled(charges.data.enabled);
  }, [charges.data]);

  useEffect(() => {
    let cancelled = false;
    async function loadSaved() {
      if (!existing.data || file) return;
      const { data: links } = await (supabase as any)
        .from("menu_pdf_item_links")
        .select("candidate_id,menu_item_id,is_active")
        .eq("document_id", existing.data.id)
        .eq("restaurant_id", restaurantId);
      const rows = (links ?? []).filter((row: any) => typeof row.candidate_id === "string" && row.candidate_id.startsWith("manual-"));
      setEnabledMap(Object.fromEntries(rows.map((row: any) => [row.candidate_id, Boolean(row.is_active)])));
      if (!rows.length) { setDrafts({}); return; }
      const { data: items } = await supabase
        .from("menu_items")
        .select("id,name_en,name_ar,description_en,description_ar,price")
        .in("id", rows.map((row: any) => row.menu_item_id));
      const map = new Map((items ?? []).map((item: any) => [item.id, item]));
      const next: Record<string, Product> = {};
      for (const row of rows) {
        const item: any = map.get(row.menu_item_id);
        if (!item) continue;
        next[row.candidate_id] = {
          candidate_id: row.candidate_id,
          name_en: item.name_en ?? "",
          name_ar: item.name_ar ?? "",
          description_en: item.description_en ?? null,
          description_ar: item.description_ar ?? null,
          price: item.price == null ? null : Number(item.price),
          currency: JOD,
          confidence: 1,
        };
      }
      if (!cancelled) setDrafts(next);
    }
    void loadSaved();
    return () => { cancelled = true; };
  }, [existing.data, restaurantId, file]);

  useEffect(() => {
    let cancelled = false;
    async function draw() {
      if (!canvasRef.current || !fileUrl || !analysis.page_count) return;
      try {
        const pdf = await openPdf(await fetchPdfBytes(fileUrl, fileParts));
        if (!cancelled) await renderPdfPage(pdf, page, canvasRef.current, 1400);
      } catch (error) {
        if (!cancelled) toast.error(humanError(error));
      }
    }
    void draw();
    return () => { cancelled = true; };
  }, [fileUrl, fileParts, page, analysis.page_count]);

  const pageCandidates = useMemo(() => analysis.candidates.filter((candidate) => candidate.page_number === page), [analysis.candidates, page]);
  const active = activeId ? drafts[activeId] : null;
  const activeCandidate = activeId ? analysis.candidates.find((candidate) => candidate.id === activeId) ?? null : null;
  const savedCount = Object.keys(drafts).length;

  function fitPage() {
    const width = typeof window === "undefined" ? 1200 : window.innerWidth;
    setZoom(width < 640 ? 0.36 : width < 1024 ? 0.45 : width < 1440 ? 0.55 : 0.65);
  }

  function pointFromEvent(event: React.PointerEvent<HTMLDivElement>) {
    const box = stageRef.current?.getBoundingClientRect();
    if (!box) return null;
    return {
      x: Math.max(0, Math.min(1, (event.clientX - box.left) / box.width)),
      y: Math.max(0, Math.min(1, (event.clientY - box.top) / box.height)),
    };
  }

  function startSelection(event: React.PointerEvent<HTMLDivElement>) {
    if (!selecting || activeId || event.button !== 0) return;
    const point = pointFromEvent(event);
    if (!point) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragStart(point);
    setDragRect({ x: point.x, y: point.y, width: 0, height: 0 });
  }

  function moveSelection(event: React.PointerEvent<HTMLDivElement>) {
    if (!dragStart) return;
    const point = pointFromEvent(event);
    if (!point) return;
    setDragRect({
      x: Math.min(dragStart.x, point.x),
      y: Math.min(dragStart.y, point.y),
      width: Math.abs(point.x - dragStart.x),
      height: Math.abs(point.y - dragStart.y),
    });
  }

  function finishSelection(event: React.PointerEvent<HTMLDivElement>) {
    if (!dragStart || !dragRect) return;
    try { event.currentTarget.releasePointerCapture(event.pointerId); } catch { /* no-op */ }
    const rect = dragRect;
    setDragStart(null);
    setDragRect(null);
    if (rect.width < 0.008 || rect.height < 0.008) return;
    const id = `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const candidate: PdfMenuCandidate = {
      id,
      page_number: page,
      text: "Manual selection",
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      confidence: 1,
    };
    setAnalysis((current) => ({ ...current, candidates: [...current.candidates, candidate].sort((a, b) => a.page_number - b.page_number || a.y - b.y || a.x - b.x) }));
    setDrafts((current) => ({ ...current, [id]: emptyProduct(id) }));
    setEnabledMap((current) => ({ ...current, [id]: true }));
    setActiveId(id);
    setSelecting(false);
    void readSelection(candidate, rect);
  }

  async function handleFile(nextFile?: File) {
    if (!nextFile) return;
    if (nextFile.type !== "application/pdf" && !nextFile.name.toLowerCase().endsWith(".pdf")) {
      toast.error("Please upload a PDF menu.");
      return;
    }
    if (nextFile.size > MAX_PDF_BYTES) {
      toast.error("PDF is too large. Maximum allowed size is 100 MB.");
      return;
    }
    setSaving(true);
    try {
      const buffer = await nextFile.arrayBuffer();
      const pdf = await openPdf(buffer);
      const uploaded = await uploadRestaurantPdf(restaurantId, nextFile);
      const nextAnalysis: PdfMenuAnalysis = { page_count: pdf.numPages, pages: [], candidates: [] };
      const { data, error } = await (supabase as any)
        .from("menu_pdf_documents")
        .upsert({ restaurant_id: restaurantId, file_url: uploaded.url, file_parts: uploaded.parts, file_name: nextFile.name, page_count: pdf.numPages, analysis: nextAnalysis, is_active: true }, { onConflict: "restaurant_id" })
        .select("id,file_url,file_parts,file_name,page_count,analysis,is_active")
        .single();
      if (error) throw error;
      setDocumentRow(data as DocumentRow);
      setFile(nextFile);
      setFileUrl(uploaded.url);
      setFileParts(uploaded.parts);
      setAnalysis(nextAnalysis);
      setDrafts({});
      setEnabledMap({});
      setPage(1);
      setZoom(0.55);
      setSelecting(true);
      setActiveId(null);
      toast.success("PDF ready. Drag over the first product area.");
    } catch (error) {
      toast.error(humanError(error));
    } finally {
      setSaving(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function readSelection(candidate: PdfMenuCandidate, rect: Rect) {
    if (!fileUrl) return;
    setReading(true);
    try {
      const pdf = await openPdf(await fetchPdfBytes(fileUrl, fileParts));
      const pdfPage = await pdf.getPage(candidate.page_number);
      const base = pdfPage.getViewport({ scale: 1 });
      const scale = Math.min(4, Math.max(2.5, 2200 / base.width));
      const viewport = pdfPage.getViewport({ scale });
      const full = document.createElement("canvas");
      full.width = Math.ceil(viewport.width);
      full.height = Math.ceil(viewport.height);
      const ctx = full.getContext("2d");
      if (!ctx) throw new Error("Could not render PDF page");
      await pdfPage.render({ canvasContext: ctx, viewport }).promise;

      const padX = Math.max(12, Math.round(full.width * 0.012));
      const padY = Math.max(12, Math.round(full.height * 0.012));
      const sx = Math.max(0, Math.floor(rect.x * full.width) - padX);
      const sy = Math.max(0, Math.floor(rect.y * full.height) - padY);
      const ex = Math.min(full.width, Math.ceil((rect.x + rect.width) * full.width) + padX);
      const ey = Math.min(full.height, Math.ceil((rect.y + rect.height) * full.height) + padY);
      const sw = Math.max(1, ex - sx);
      const sh = Math.max(1, ey - sy);
      const crop = document.createElement("canvas");
      const down = Math.min(1, 2400 / Math.max(sw, sh));
      crop.width = Math.max(1, Math.round(sw * down));
      crop.height = Math.max(1, Math.round(sh * down));
      const cropCtx = crop.getContext("2d");
      if (!cropCtx) throw new Error("Could not prepare selected area");
      cropCtx.imageSmoothingEnabled = true;
      cropCtx.imageSmoothingQuality = "high";
      cropCtx.drawImage(full, sx, sy, sw, sh, 0, 0, crop.width, crop.height);

      const textItems = await pdfPage.getTextContent();
      const selectedText = textItems.items.map((item: any) => {
        if (!item?.str || !Array.isArray(item.transform)) return null;
        const x = Number(item.transform[4]) || 0;
        const baseline = Number(item.transform[5]) || 0;
        const h = Math.max(5, Math.abs(Number(item.transform[3]) || Number(item.height) || 10));
        const y = base.height - baseline - h;
        const w = Math.max(3, Number(item.width) || item.str.length * h * 0.45);
        return x < (rect.x + rect.width) * base.width && x + w > rect.x * base.width && y < (rect.y + rect.height) * base.height && y + h > rect.y * base.height ? String(item.str).trim() : null;
      }).filter(Boolean).join(" ").replace(/\s+/g, " ").trim().slice(0, 10000);

      const result = await runVision({ data: {
        restaurantId,
        pageNumber: candidate.page_number,
        pageWidth: crop.width,
        pageHeight: crop.height,
        imageDataUrl: crop.toDataURL("image/jpeg", 0.96),
        selectionOnly: true,
        selectedText,
      } });
      const product = result.products?.[0]?.product;
      if (!product) throw new Error("No product could be read from this area");
      setDrafts((current) => ({
        ...current,
        [candidate.id]: {
          candidate_id: candidate.id,
          name_en: product.name_en ?? "",
          name_ar: product.name_ar ?? "",
          description_en: product.description_en ?? null,
          description_ar: product.description_ar ?? null,
          price: product.price == null ? null : Number(product.price),
          currency: JOD,
          confidence: Number(product.confidence ?? 0),
        },
      }));
      toast.success("Product details detected. Review and save.");
    } catch {
      setDrafts((current) => ({ ...current, [candidate.id]: emptyProduct(candidate.id) }));
      toast.info("Area selected. Enter any missing product details manually.");
    } finally {
      setReading(false);
    }
  }

  function updateDraft(patch: Partial<Product>) {
    if (!activeId) return;
    setDrafts((current) => ({ ...current, [activeId]: { ...(current[activeId] ?? emptyProduct(activeId)), ...patch } }));
  }

  function updateCandidate(id: string, rect: Rect) {
    setAnalysis((current) => ({ ...current, candidates: current.candidates.map((candidate) => candidate.id === id ? { ...candidate, ...rect } : candidate) }));
  }

  async function saveProduct() {
    if (!activeId || !activeCandidate || !documentRow) return;
    const product = drafts[activeId] ?? emptyProduct(activeId);
    const nameEn = product.name_en.trim() || product.name_ar.trim();
    const nameAr = product.name_ar.trim() || product.name_en.trim();
    if (!nameEn) { toast.error("Add a product name before saving."); return; }
    if (product.price == null || !Number.isFinite(product.price)) { toast.error("Add the product price before saving."); return; }
    setSaving(true);
    try {
      const payload = {
        restaurant_id: restaurantId,
        name_en: nameEn,
        name_ar: nameAr,
        description_en: product.description_en?.trim() || null,
        description_ar: product.description_ar?.trim() || null,
        price: product.price,
        is_available: true,
      };
      const { data: existingLink } = await (supabase as any)
        .from("menu_pdf_item_links")
        .select("id,menu_item_id")
        .eq("document_id", documentRow.id)
        .eq("candidate_id", activeId)
        .maybeSingle();
      let menuItemId = existingLink?.menu_item_id as string | undefined;
      if (menuItemId) {
        const { error } = await supabase.from("menu_items").update(payload).eq("id", menuItemId).eq("restaurant_id", restaurantId);
        if (error) throw error;
      } else {
        const { data: item, error } = await supabase.from("menu_items").insert(payload).select("id").single();
        if (error) throw error;
        menuItemId = item.id;
      }
      const { error: linkError } = await (supabase as any)
        .from("menu_pdf_item_links")
        .upsert({
          document_id: documentRow.id,
          restaurant_id: restaurantId,
          menu_item_id: menuItemId,
          page_number: activeCandidate.page_number,
          x: activeCandidate.x,
          y: activeCandidate.y,
          width: activeCandidate.width,
          height: activeCandidate.height,
          label: nameEn,
          source: "manual-selection",
          is_active: enabledMap[activeId] ?? true,
          candidate_id: activeId,
        }, { onConflict: "document_id,candidate_id" });
      if (linkError) throw linkError;
      const clean = onlyManual(analysis);
      const { error: analysisError } = await (supabase as any)
        .from("menu_pdf_documents")
        .update({ analysis: clean })
        .eq("id", documentRow.id)
        .eq("restaurant_id", restaurantId);
      if (analysisError) throw analysisError;
      setAnalysis(clean);
      setDocumentRow((current) => current ? { ...current, analysis: clean } : current);
      setActiveId(null);
      setSelecting(true);
      await queryClient.invalidateQueries({ queryKey: ["platform", "pdf-document", restaurantId] });
      toast.success("Product saved.");
    } catch (error) {
      toast.error(humanError(error));
    } finally {
      setSaving(false);
    }
  }

  async function deleteProduct(candidateId: string) {
    if (!documentRow) return;
    setSaving(true);
    try {
      const { data: link } = await (supabase as any)
        .from("menu_pdf_item_links")
        .select("id,menu_item_id")
        .eq("document_id", documentRow.id)
        .eq("candidate_id", candidateId)
        .maybeSingle();
      if (link?.id) await (supabase as any).from("menu_pdf_item_links").delete().eq("id", link.id);
      if (link?.menu_item_id) await supabase.from("menu_items").delete().eq("id", link.menu_item_id).eq("restaurant_id", restaurantId);
      const clean = { ...analysis, candidates: analysis.candidates.filter((candidate) => candidate.id !== candidateId) };
      await (supabase as any).from("menu_pdf_documents").update({ analysis: clean }).eq("id", documentRow.id).eq("restaurant_id", restaurantId);
      setAnalysis(clean);
      setDrafts((current) => { const next = { ...current }; delete next[candidateId]; return next; });
      setEnabledMap((current) => { const next = { ...current }; delete next[candidateId]; return next; });
      setActiveId(null);
      setSelecting(true);
      toast.success("Area removed.");
    } catch (error) {
      toast.error(humanError(error));
    } finally {
      setSaving(false);
    }
  }

  async function saveCharges() {
    const tax = Math.max(0, Math.min(100, Number(taxRate) || 0));
    const service = Math.max(0, Math.min(100, Number(serviceRate) || 0));
    setChargesSaving(true);
    try {
      const { error: restaurantError } = await supabase.from("restaurants").update({ tax_rate: tax, service_charge: service }).eq("id", restaurantId);
      if (restaurantError) throw restaurantError;
      const { data: settings, error: settingsError } = await supabase.from("restaurant_settings").select("id").eq("restaurant_id", restaurantId).maybeSingle();
      if (settingsError) throw settingsError;
      if (settings?.id) {
        const { error } = await supabase.from("restaurant_settings").update({ enable_service_charge: serviceEnabled }).eq("id", settings.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("restaurant_settings").insert({ restaurant_id: restaurantId, enable_service_charge: serviceEnabled });
        if (error) throw error;
      }
      await queryClient.invalidateQueries({ queryKey: ["platform", "restaurant-menu-charges", restaurantId] });
      toast.success("Menu charges saved.");
    } catch (error) {
      toast.error(humanError(error));
    } finally {
      setChargesSaving(false);
    }
  }

  if (existing.isPending) return <Skeleton className="mx-auto h-[68vh] max-w-[1600px] rounded-2xl" />;

  return (
    <div className="mx-auto max-w-[1600px] space-y-4 pb-24">
      <section className="qs-card p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2"><FileText className="size-5 text-[#ff5a0a]" /><h2 className="font-display text-lg font-bold">Clickable PDF</h2></div>
            {documentRow ? <p className="mt-1 truncate text-xs text-muted-foreground">{documentRow.file_name} · {documentRow.page_count} pages · {savedCount} areas</p> : <p className="mt-1 text-xs text-muted-foreground">Upload the original menu PDF and mark clickable products.</p>}
          </div>
          <div className="flex shrink-0 gap-2">
            <input ref={inputRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(event) => void handleFile(event.target.files?.[0])} />
            <Button size="sm" onClick={() => inputRef.current?.click()} disabled={saving}><Upload className="size-4" />{documentRow ? "Replace" : "Upload PDF"}</Button>
          </div>
        </div>
      </section>

      {!documentRow ? (
        <button type="button" onClick={() => inputRef.current?.click()} className="qs-card flex min-h-64 w-full items-center justify-center gap-3 border-dashed text-sm font-semibold text-muted-foreground hover:bg-muted/30"><Upload className="size-5" />Upload PDF</button>
      ) : (
        <>
          <section className="qs-card overflow-hidden">
            <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
              <div className="flex items-center rounded-xl border border-border bg-background p-1">
                <Button size="icon" variant="ghost" disabled={page <= 1} onClick={() => { setPage((current) => Math.max(1, current - 1)); setActiveId(null); }}><ChevronLeft className="size-4" /></Button>
                <span className="min-w-20 text-center text-xs font-bold tabular-nums">{page} / {analysis.page_count}</span>
                <Button size="icon" variant="ghost" disabled={page >= analysis.page_count} onClick={() => { setPage((current) => Math.min(analysis.page_count, current + 1)); setActiveId(null); }}><ChevronRight className="size-4" /></Button>
              </div>
              <Button size="sm" variant="outline" onClick={fitPage}><Maximize2 className="size-4" />Fit</Button>
              <div className="flex items-center rounded-xl border border-border bg-background p-1">
                <Button size="icon" variant="ghost" disabled={zoom <= MIN_ZOOM} onClick={() => setZoom((current) => clampZoom(current - ZOOM_STEP))}><ZoomOut className="size-4" /></Button>
                <span className="min-w-12 text-center text-xs font-bold tabular-nums">{Math.round(zoom * 100)}%</span>
                <Button size="icon" variant="ghost" disabled={zoom >= MAX_ZOOM} onClick={() => setZoom((current) => clampZoom(current + ZOOM_STEP))}><ZoomIn className="size-4" /></Button>
              </div>
              <Button className="ms-auto" size="sm" variant={selecting ? "default" : "outline"} onClick={() => { setActiveId(null); setSelecting(true); }}><MousePointer2 className="size-4" />{selecting ? "Draw area" : "New area"}</Button>
            </div>

            <div className="grid min-w-0 gap-3 p-2 sm:p-3 xl:grid-cols-[minmax(0,2.4fr)_minmax(300px,.75fr)]">
              <div className="qs-pdf-stage min-w-0 overflow-auto rounded-xl bg-muted/40 p-2 sm:p-4 xl:max-h-[calc(100dvh-190px)] xl:min-h-[700px]">
                <div className="flex min-h-[65vh] min-w-0 items-start justify-center py-2 sm:py-4">
                  <div
                    ref={stageRef}
                    className={cn("relative w-fit touch-none select-none", selecting && !activeId && "cursor-crosshair")}
                    style={{ transform: `scale(${zoom})`, transformOrigin: "top center" }}
                    onPointerDown={startSelection}
                    onPointerMove={moveSelection}
                    onPointerUp={finishSelection}
                    onPointerCancel={finishSelection}
                  >
                    <canvas ref={canvasRef} className="block max-w-none rounded-md bg-white shadow-xl ring-1 ring-black/5" />
                    {pageCandidates.map((candidate) => (
                      <EditableHotspot
                        key={candidate.id}
                        candidate={candidate}
                        active={activeId === candidate.id}
                        enabled={enabledMap[candidate.id] ?? true}
                        label={drafts[candidate.id]?.name_en || drafts[candidate.id]?.name_ar || "Product"}
                        onSelect={() => { setActiveId(candidate.id); setSelecting(false); }}
                        onChange={(rect) => updateCandidate(candidate.id, rect)}
                        stageRef={stageRef}
                      />
                    ))}
                    {dragRect ? <div className="pointer-events-none absolute z-40 rounded-md border-2 border-dashed border-[#ff5a0a] bg-orange-500/10" style={{ left: `${dragRect.x * 100}%`, top: `${dragRect.y * 100}%`, width: `${dragRect.width * 100}%`, height: `${dragRect.height * 100}%` }} /> : null}
                  </div>
                </div>
              </div>

              {activeId && activeCandidate && active ? (
                <>
                  <button type="button" aria-label="Close editor" onClick={() => setActiveId(null)} className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[1px] xl:hidden" />
                  <aside className={cn(
                    "space-y-3",
                    "fixed inset-x-2 bottom-[calc(78px+env(safe-area-inset-bottom))] z-50 max-h-[76dvh] overflow-y-auto rounded-2xl border border-border bg-background p-3 shadow-2xl",
                    "xl:sticky xl:top-24 xl:z-auto xl:max-h-[calc(100dvh-120px)] xl:self-start xl:rounded-none xl:border-0 xl:bg-transparent xl:p-0 xl:shadow-none",
                  )}>
                    <div className="qs-card p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Selected area</p><h3 className="mt-1 truncate font-bold">{active.name_en || active.name_ar || "New product"}</h3></div>
                        <button type="button" className="grid size-9 place-items-center rounded-lg text-muted-foreground hover:bg-muted" onClick={() => setActiveId(null)}><X className="size-4" /></button>
                      </div>
                      <p className="mt-3 rounded-xl bg-muted/50 p-3 text-xs leading-5 text-muted-foreground">Drag the box to move it. Drag any orange handle to resize it.</p>
                      <button
                        type="button"
                        className={cn("mt-3 inline-flex min-h-10 items-center gap-2 rounded-xl border px-3 text-xs font-bold", (enabledMap[activeId] ?? true) ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "border-border text-muted-foreground")}
                        onClick={() => setEnabledMap((current) => ({ ...current, [activeId]: !(current[activeId] ?? true) }))}
                      >
                        <Check className="size-3.5" />{(enabledMap[activeId] ?? true) ? "Clickable" : "Disabled"}
                      </button>
                    </div>

                    <div className="qs-card p-4">
                      <div className="mb-3 flex items-center justify-between"><h3 className="font-bold">Product</h3>{reading ? <Loader2 className="size-4 animate-spin text-[#ff5a0a]" /> : null}</div>
                      <div className="space-y-3">
                        <Input placeholder="Name (English)" value={active.name_en} onChange={(event) => updateDraft({ name_en: event.target.value })} />
                        <Input placeholder="Name (Arabic)" value={active.name_ar} onChange={(event) => updateDraft({ name_ar: event.target.value })} />
                        <Textarea rows={2} placeholder="Description (English)" value={active.description_en ?? ""} onChange={(event) => updateDraft({ description_en: event.target.value })} />
                        <Textarea rows={2} placeholder="Description (Arabic)" value={active.description_ar ?? ""} onChange={(event) => updateDraft({ description_ar: event.target.value })} />
                        <Input type="number" min="0" step="0.01" placeholder="Price" value={active.price ?? ""} onChange={(event) => updateDraft({ price: event.target.value === "" ? null : Number(event.target.value) })} />
                      </div>
                      <div className="safe-bottom sticky bottom-0 mt-4 flex gap-2 border-t border-border bg-background/96 pt-3 backdrop-blur">
                        <Button className="flex-1" onClick={() => void saveProduct()} disabled={saving || reading}><Save className="size-4" />Save</Button>
                        <Button size="icon" variant="outline" onClick={() => void deleteProduct(activeId)} disabled={saving} aria-label="Delete area"><Trash2 className="size-4" /></Button>
                      </div>
                    </div>
                  </aside>
                </>
              ) : (
                <aside className="xl:sticky xl:top-24 xl:self-start">
                  <div className="qs-card p-4">
                    <MousePointer2 className="size-5 text-[#ff5a0a]" />
                    <p className="mt-2 text-sm font-bold">{selecting ? "Draw a product area" : "Select an area"}</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">Existing areas can be dragged and resized directly.</p>
                  </div>
                </aside>
              )}
            </div>
          </section>

          <section className="qs-card p-4 sm:p-5">
            <div className="flex items-center gap-2"><Settings2 className="size-4 text-[#ff5a0a]" /><h3 className="font-bold">Charges</h3></div>
            <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end">
              <label className="space-y-1.5 text-xs font-semibold text-muted-foreground"><span>Tax %</span><Input type="number" min="0" max="100" step="0.01" value={taxRate} onChange={(event) => setTaxRate(Number(event.target.value))} /></label>
              <label className="space-y-1.5 text-xs font-semibold text-muted-foreground"><span>Service %</span><Input type="number" min="0" max="100" step="0.01" value={serviceRate} onChange={(event) => setServiceRate(Number(event.target.value))} /></label>
              <Button variant={serviceEnabled ? "secondary" : "outline"} onClick={() => setServiceEnabled((current) => !current)}>{serviceEnabled ? "Service on" : "Service off"}</Button>
              <Button onClick={() => void saveCharges()} disabled={chargesSaving}>{chargesSaving ? <Loader2 className="size-4 animate-spin" /> : "Save"}</Button>
            </div>
          </section>
        </>
      )}
    </div>
  );
}