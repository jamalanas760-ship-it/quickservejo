import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, ChevronLeft, ChevronRight, Edit3, FileText, Loader2, MousePointer2, Save, Settings2, Trash2, Upload, X, ZoomIn, ZoomOut } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useRestaurant } from "@/hooks/useSuperAdmin";
import { humanError } from "@/lib/errors";
import { fetchPdfBytes, openPdf, renderPdfPage, type PdfMenuAnalysis, type PdfMenuCandidate } from "@/lib/pdf-menu";
import { extractPdfVisualProducts } from "@/lib/pdf-menu-vision.server";
import { MAX_PDF_BYTES, uploadRestaurantPdf } from "@/lib/storage";

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
type DocumentRow = { id: string; file_url: string; file_parts?: string[]; file_name: string; page_count: number; analysis: PdfMenuAnalysis; is_active: boolean };
const EMPTY: PdfMenuAnalysis = { page_count: 0, pages: [], candidates: [] };
const JOD = "JOD";

function emptyProduct(id: string): Product {
  return { candidate_id: id, name_en: "", name_ar: "", description_en: null, description_ar: null, price: null, currency: JOD, confidence: 1 };
}
function onlyManual(analysis: PdfMenuAnalysis | null | undefined): PdfMenuAnalysis {
  return { ...(analysis ?? EMPTY), candidates: (analysis?.candidates ?? []).filter((c) => c.id.startsWith("manual-")) };
}


function EditablePdfHotspot({ candidate, active, disabled, draftName, onSelect, onChange, stageRef }: { candidate: PdfMenuCandidate; active: boolean; disabled: boolean; draftName: string; onSelect: () => void; onChange: (rect: Rect) => void; stageRef: React.RefObject<HTMLDivElement | null> }) {
  const drag = useRef<{ pointerX: number; pointerY: number; rect: Rect; mode: string } | null>(null);
  const rect = { x: candidate.x, y: candidate.y, width: candidate.width, height: candidate.height };
  const begin = (event: React.PointerEvent<HTMLButtonElement>, mode: string) => {
    if (disabled) return;
    event.preventDefault();
    event.stopPropagation();
    if (!active) { onSelect(); return; }
    event.currentTarget.setPointerCapture?.(event.pointerId);
    drag.current = { pointerX: event.clientX, pointerY: event.clientY, rect, mode };
  };
  const move = (event: React.PointerEvent<HTMLButtonElement>) => {
    const state = drag.current;
    const stage = stageRef.current;
    if (!state || !stage) return;
    event.preventDefault();
    event.stopPropagation();
    const box = stage.getBoundingClientRect();
    const dx = (event.clientX - state.pointerX) / Math.max(1, box.width);
    const dy = (event.clientY - state.pointerY) / Math.max(1, box.height);
    let { x, y, width, height } = state.rect;
    if (state.mode === "move") { x += dx; y += dy; }
    else {
      if (state.mode.includes("w")) { x += dx; width -= dx; }
      if (state.mode.includes("e")) width += dx;
      if (state.mode.includes("n")) { y += dy; height -= dy; }
      if (state.mode.includes("s")) height += dy;
    }
    const left = Math.max(0, Math.min(1, Math.min(x, x + width)));
    const top = Math.max(0, Math.min(1, Math.min(y, y + height)));
    const right = Math.max(0, Math.min(1, Math.max(x, x + width)));
    const bottom = Math.max(0, Math.min(1, Math.max(y, y + height)));
    onChange({ x: left, y: top, width: Math.max(0.008, right - left), height: Math.max(0.008, bottom - top) });
  };
  const end = (event: React.PointerEvent<HTMLButtonElement>) => { event.stopPropagation(); drag.current = null; };
  const handles = [["nw", "-left-1 -top-1 cursor-nwse-resize"], ["n", "left-1/2 -top-1 -translate-x-1/2 cursor-ns-resize"], ["ne", "-right-1 -top-1 cursor-nesw-resize"], ["w", "-left-1 top-1/2 -translate-y-1/2 cursor-ew-resize"], ["e", "-right-1 top-1/2 -translate-y-1/2 cursor-ew-resize"], ["sw", "-left-1 -bottom-1 cursor-nesw-resize"], ["s", "left-1/2 -bottom-1 -translate-x-1/2 cursor-ns-resize"], ["se", "-right-1 -bottom-1 cursor-nwse-resize"]] as const;
  return <div className={"absolute z-30 " + (disabled ? "pointer-events-none" : "")} style={{ left: (rect.x * 100) + "%", top: (rect.y * 100) + "%", width: (rect.width * 100) + "%", height: (rect.height * 100) + "%" }}>
    <button type="button" aria-label={active ? "Move selected product area" : "Open selected product"} onClick={(event) => { event.stopPropagation(); if (!disabled) onSelect(); }} onPointerDown={(event) => begin(event, "move")} onPointerMove={move} onPointerUp={end} onPointerCancel={end} className={"absolute inset-0 rounded-md border-2 transition " + (active ? "border-primary bg-primary/15 shadow-[0_0_0_3px_hsl(var(--primary)/.12)]" : "border-primary/50 bg-primary/5 hover:border-primary")}>
      <span className="absolute -top-5 left-1 max-w-[180px] truncate rounded bg-primary px-1.5 py-0.5 text-[9px] font-black text-primary-foreground">{draftName || "Product"}</span>
    </button>
    {active ? handles.map(([mode, position]) => <button key={mode} type="button" aria-label={"Resize selected area " + mode} onPointerDown={(event) => begin(event, mode)} onPointerMove={move} onPointerUp={end} onPointerCancel={end} className={"absolute z-50 size-3 rounded-full border-2 border-background bg-primary shadow " + position} />) : null}
  </div>;
}

export function PdfMenuManagerV2({ restaurantId }: { restaurantId: string }) {
  const { data: restaurant } = useRestaurant(restaurantId);
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
  const [zoom, setZoom] = useState(0.85);
  const [selecting, setSelecting] = useState(false);
  const [editingArea, setEditingArea] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [dragRect, setDragRect] = useState<Rect | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [taxRate, setTaxRate] = useState(0);
  const [serviceRate, setServiceRate] = useState(0);
  const [serviceEnabled, setServiceEnabled] = useState(false);
  const [chargesSaving, setChargesSaving] = useState(false);

  const existing = useQuery<DocumentRow | null>({
    queryKey: ["platform", "pdf-document", restaurantId],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("menu_pdf_documents").select("id,file_url,file_parts,file_name,page_count,analysis,is_active").eq("restaurant_id", restaurantId).maybeSingle();
      if (error) throw error;
      return data as DocumentRow | null;
    },
  });

  const charges = useQuery({
    queryKey: ["platform", "restaurant-menu-charges", restaurantId],
    queryFn: async () => {
      const [r, s] = await Promise.all([
        supabase.from("restaurants").select("tax_rate,service_charge").eq("id", restaurantId).single(),
        supabase.from("restaurant_settings").select("enable_service_charge").eq("restaurant_id", restaurantId).maybeSingle(),
      ]);
      if (r.error) throw r.error;
      if (s.error) throw s.error;
      return { tax: Number(r.data.tax_rate ?? 0), service: Number(r.data.service_charge ?? 0), enabled: Boolean(s.data?.enable_service_charge) };
    },
  });

  useEffect(() => {
    if (!existing.data || documentRow || file) return;
    setDocumentRow(existing.data);
    const clean = onlyManual(existing.data.analysis);
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
      const { data: links } = await (supabase as any).from("menu_pdf_item_links").select("candidate_id,menu_item_id").eq("document_id", existing.data.id).eq("restaurant_id", restaurantId).eq("is_active", true);
      const rows = (links ?? []).filter((r: any) => typeof r.candidate_id === "string" && r.candidate_id.startsWith("manual-"));
      if (!rows.length) { setDrafts({}); return; }
      const { data: items } = await supabase.from("menu_items").select("id,name_en,name_ar,description_en,description_ar,price").in("id", rows.map((r: any) => r.menu_item_id));
      const map = new Map((items ?? []).map((item: any) => [item.id, item]));
      const next: Record<string, Product> = {};
      for (const row of rows) {
        const item: any = map.get(row.menu_item_id);
        if (!item) continue;
        next[row.candidate_id] = { candidate_id: row.candidate_id, name_en: item.name_en ?? "", name_ar: item.name_ar ?? "", description_en: item.description_en ?? null, description_ar: item.description_ar ?? null, price: item.price == null ? null : Number(item.price), currency: JOD, confidence: 1 };
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

  const pageCandidates = useMemo(() => analysis.candidates.filter((c) => c.page_number === page), [analysis.candidates, page]);
  const active = activeId ? drafts[activeId] : null;
  const activeCandidate = activeId ? analysis.candidates.find((c) => c.id === activeId) ?? null : null;
  const savedCount = Object.keys(drafts).length;

  async function handleFile(nextFile?: File) {
    if (!nextFile) return;
    if (nextFile.type !== "application/pdf" && !nextFile.name.toLowerCase().endsWith(".pdf")) { toast.error("Please upload a PDF menu."); return; }
    if (nextFile.size > MAX_PDF_BYTES) { toast.error("PDF is too large. Maximum allowed size is 100 MB."); return; }
    setSaving(true);
    try {
      const buffer = await nextFile.arrayBuffer();
      const pdf = await openPdf(buffer);
      const uploaded = await uploadRestaurantPdf(restaurantId, nextFile);
      const nextAnalysis: PdfMenuAnalysis = { page_count: pdf.numPages, pages: [], candidates: [] };
      const payload = { restaurant_id: restaurantId, file_url: uploaded.url, file_parts: uploaded.parts, file_name: nextFile.name, page_count: pdf.numPages, analysis: nextAnalysis, is_active: true };
      const { data, error } = await (supabase as any).from("menu_pdf_documents").upsert(payload, { onConflict: "restaurant_id" }).select("id,file_url,file_parts,file_name,page_count,analysis,is_active").single();
      if (error) throw error;
      setDocumentRow(data as DocumentRow); setFile(nextFile); setFileUrl(uploaded.url); setFileParts(uploaded.parts); setAnalysis(nextAnalysis); setDrafts({}); setPage(1); setZoom(0.85); setSelecting(true); setActiveId(null);
      toast.success(`${pdf.numPages} page${pdf.numPages === 1 ? "" : "s"} ready. Select your first product.`);
    } catch (error) { toast.error(humanError(error)); }
    finally { setSaving(false); if (inputRef.current) inputRef.current.value = ""; }
  }

  function pointFromEvent(event: React.PointerEvent<HTMLDivElement>) {
    const box = stageRef.current?.getBoundingClientRect();
    if (!box) return null;
    return { x: Math.max(0, Math.min(1, (event.clientX - box.left) / box.width)), y: Math.max(0, Math.min(1, (event.clientY - box.top) / box.height)) };
  }

  function startDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (!selecting && !editingArea) return;
    if (event.button !== 0) return;
    const point = pointFromEvent(event);
    if (!point) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragStart(point); setDragRect({ x: point.x, y: point.y, width: 0, height: 0 });
  }

  function moveDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (!dragStart) return;
    const point = pointFromEvent(event);
    if (!point) return;
    const x = Math.min(dragStart.x, point.x); const y = Math.min(dragStart.y, point.y);
    setDragRect({ x, y, width: Math.abs(point.x - dragStart.x), height: Math.abs(point.y - dragStart.y) });
  }

  function finishDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (!dragStart || !dragRect) return;
    try { event.currentTarget.releasePointerCapture(event.pointerId); } catch { /* pointer may already be released */ }
    const rect = dragRect;
    setDragStart(null); setDragRect(null);
    if (rect.width < 0.008 || rect.height < 0.008) return;
    if (editingArea && activeCandidate) {
      const updated: PdfMenuCandidate = { ...activeCandidate, x: rect.x, y: rect.y, width: rect.width, height: rect.height };
      setAnalysis((current) => ({ ...current, candidates: current.candidates.map((c) => c.id === updated.id ? updated : c) }));
      setEditingArea(false); setSelecting(false); setZoom(0.85);
      void readSelection(updated, rect);
      return;
    }
    const id = `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const candidate: PdfMenuCandidate = { id, page_number: page, text: "Manual selection", x: rect.x, y: rect.y, width: rect.width, height: rect.height, confidence: 1 };
    setAnalysis((current) => ({ ...current, candidates: [...current.candidates, candidate].sort((a, b) => a.page_number - b.page_number || a.y - b.y || a.x - b.x) }));
    setDrafts((current) => ({ ...current, [id]: emptyProduct(id) }));
    setActiveId(id); setSelecting(false); setZoom(0.85);
    void readSelection(candidate, rect);
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
      const full = document.createElement("canvas"); full.width = Math.ceil(viewport.width); full.height = Math.ceil(viewport.height);
      const ctx = full.getContext("2d"); if (!ctx) throw new Error("Could not render PDF page");
      await pdfPage.render({ canvasContext: ctx, viewport }).promise;
      const padX = Math.max(12, Math.round(full.width * 0.012)); const padY = Math.max(12, Math.round(full.height * 0.012));
      const sx = Math.max(0, Math.floor(rect.x * full.width) - padX); const sy = Math.max(0, Math.floor(rect.y * full.height) - padY);
      const ex = Math.min(full.width, Math.ceil((rect.x + rect.width) * full.width) + padX); const ey = Math.min(full.height, Math.ceil((rect.y + rect.height) * full.height) + padY);
      const sw = Math.max(1, ex - sx); const sh = Math.max(1, ey - sy);
      const crop = document.createElement("canvas"); const down = Math.min(1, 2400 / Math.max(sw, sh)); crop.width = Math.max(1, Math.round(sw * down)); crop.height = Math.max(1, Math.round(sh * down));
      const cropCtx = crop.getContext("2d"); if (!cropCtx) throw new Error("Could not prepare selected area");
      cropCtx.imageSmoothingEnabled = true; cropCtx.imageSmoothingQuality = "high"; cropCtx.drawImage(full, sx, sy, sw, sh, 0, 0, crop.width, crop.height);
      const textItems = await pdfPage.getTextContent();
      const selectedText = textItems.items.map((item: any) => {
        if (!item?.str || !Array.isArray(item.transform)) return null;
        const x = Number(item.transform[4]) || 0; const baseline = Number(item.transform[5]) || 0; const h = Math.max(5, Math.abs(Number(item.transform[3]) || Number(item.height) || 10));
        const y = base.height - baseline - h; const w = Math.max(3, Number(item.width) || item.str.length * h * 0.45);
        const overlaps = x < (rect.x + rect.width) * base.width && x + w > rect.x * base.width && y < (rect.y + rect.height) * base.height && y + h > rect.y * base.height;
        return overlaps ? String(item.str).trim() : null;
      }).filter(Boolean).join(" ").replace(/\s+/g, " ").trim().slice(0, 10000);
      const result = await runVision({ data: { restaurantId, pageNumber: candidate.page_number, pageWidth: crop.width, pageHeight: crop.height, imageDataUrl: crop.toDataURL("image/jpeg", 0.96), selectionOnly: true, selectedText } });
      const product = result.products?.[0]?.product;
      if (!product) throw new Error("No product could be read from this area");
      setDrafts((current) => ({ ...current, [candidate.id]: { candidate_id: candidate.id, name_en: product.name_en ?? "", name_ar: product.name_ar ?? "", description_en: product.description_en ?? null, description_ar: product.description_ar ?? null, price: product.price == null ? null : Number(product.price), currency: JOD, confidence: Number(product.confidence ?? 0) } }));
      toast.success("Fields filled. Review and save the product.");
    } catch (error) {
      setDrafts((current) => ({ ...current, [candidate.id]: emptyProduct(candidate.id) }));
      toast.info("The area was selected, but the text could not be read reliably. You can enter it manually.");
    } finally { setReading(false); }
  }

  function updateDraft(patch: Partial<Product>) { if (!activeId) return; setDrafts((current) => ({ ...current, [activeId]: { ...(current[activeId] ?? emptyProduct(activeId)), ...patch } })); }

  async function saveProduct() {
    if (!activeId || !activeCandidate || !documentRow) return;
    const product = drafts[activeId] ?? emptyProduct(activeId);
    const nameEn = product.name_en.trim() || product.name_ar.trim(); const nameAr = product.name_ar.trim() || product.name_en.trim();
    if (!nameEn) { toast.error("Add a product title in English or Arabic before saving."); return; }
    if (product.price == null || !Number.isFinite(product.price)) { toast.error("Add the product price before saving."); return; }
    setSaving(true);
    try {
      const payload = { restaurant_id: restaurantId, name_en: nameEn, name_ar: nameAr, description_en: product.description_en?.trim() || null, description_ar: product.description_ar?.trim() || null, price: product.price, is_available: true };
      const { data: existingLink } = await (supabase as any).from("menu_pdf_item_links").select("id,menu_item_id").eq("document_id", documentRow.id).eq("candidate_id", activeId).maybeSingle();
      let menuItemId = existingLink?.menu_item_id as string | undefined;
      if (menuItemId) {
        const { error } = await supabase.from("menu_items").update(payload).eq("id", menuItemId).eq("restaurant_id", restaurantId); if (error) throw error;
      } else {
        const { data: item, error } = await supabase.from("menu_items").insert(payload).select("id").single(); if (error) throw error; menuItemId = item.id;
      }
      const linkPayload = { document_id: documentRow.id, restaurant_id: restaurantId, menu_item_id: menuItemId, page_number: activeCandidate.page_number, x: activeCandidate.x, y: activeCandidate.y, width: activeCandidate.width, height: activeCandidate.height, label: nameEn, source: "manual-selection", is_active: true, candidate_id: activeId };
      const { error: linkError } = await (supabase as any).from("menu_pdf_item_links").upsert(linkPayload, { onConflict: "document_id,candidate_id" });
      if (linkError) throw linkError;
      const clean = onlyManual(analysis); const { error: analysisError } = await (supabase as any).from("menu_pdf_documents").update({ analysis: clean }).eq("id", documentRow.id).eq("restaurant_id", restaurantId); if (analysisError) throw analysisError;
      setAnalysis(clean); setDocumentRow((current) => current ? { ...current, analysis: clean } : current); setActiveId(null); setSelecting(true); setEditingArea(false); setZoom(0.85);
      await queryClient.invalidateQueries({ queryKey: ["platform", "pdf-document", restaurantId] });
      toast.success("Product saved. Select the next area.");
    } catch (error) { toast.error(humanError(error)); }
    finally { setSaving(false); }
  }

  async function deleteProduct(candidateId: string) {
    if (!documentRow) return;
    setSaving(true);
    try {
      const { data: link } = await (supabase as any).from("menu_pdf_item_links").select("id,menu_item_id").eq("document_id", documentRow.id).eq("candidate_id", candidateId).maybeSingle();
      if (link?.id) await (supabase as any).from("menu_pdf_item_links").delete().eq("id", link.id);
      if (link?.menu_item_id) await supabase.from("menu_items").delete().eq("id", link.menu_item_id).eq("restaurant_id", restaurantId);
      const clean = { ...analysis, candidates: analysis.candidates.filter((c) => c.id !== candidateId) }; await (supabase as any).from("menu_pdf_documents").update({ analysis: clean }).eq("id", documentRow.id).eq("restaurant_id", restaurantId);
      setAnalysis(clean); setDrafts((current) => { const next = { ...current }; delete next[candidateId]; return next; }); setActiveId(null); setSelecting(true); setEditingArea(false); toast.success("Product removed.");
    } catch (error) { toast.error(humanError(error)); }
    finally { setSaving(false); }
  }

  async function saveCharges() {
    const tax = Math.max(0, Math.min(100, Number(taxRate) || 0)); const service = Math.max(0, Math.min(100, Number(serviceRate) || 0));
    setChargesSaving(true);
    try {
      const { error: rError } = await supabase.from("restaurants").update({ tax_rate: tax, service_charge: service }).eq("id", restaurantId); if (rError) throw rError;
      const { data: settings, error: sError } = await supabase.from("restaurant_settings").select("id").eq("restaurant_id", restaurantId).maybeSingle(); if (sError) throw sError;
      if (settings?.id) { const { error } = await supabase.from("restaurant_settings").update({ enable_service_charge: serviceEnabled }).eq("id", settings.id); if (error) throw error; }
      else { const { error } = await supabase.from("restaurant_settings").insert({ restaurant_id: restaurantId, enable_service_charge: serviceEnabled }); if (error) throw error; }
      await queryClient.invalidateQueries({ queryKey: ["platform", "restaurant-menu-charges", restaurantId] });
      toast.success("Menu charges saved. They apply to the whole menu.");
    } catch (error) { toast.error(humanError(error)); }
    finally { setChargesSaving(false); }
  }

  if (existing.isPending) return <Skeleton className="mx-auto h-[70vh] max-w-7xl rounded-[30px]" />;

  return <div className="mx-auto max-w-7xl space-y-4 pb-20">
    <div className="rounded-[30px] border bg-card p-4 shadow-sm sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0"><div className="flex items-center gap-2"><Badge className="rounded-full">Manual mode</Badge><span className="text-xs font-medium text-muted-foreground">No automatic product detection</span></div><h1 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">Interactive PDF Menu</h1><p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">Keep your original menu exactly as designed. Select an item, let QuickServe read its fields, review them, save, and continue to the next item.</p></div>
        <div className="flex shrink-0 gap-2"><input ref={inputRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => void handleFile(e.target.files?.[0])}/><Button onClick={() => inputRef.current?.click()} disabled={saving}><Upload className="mr-2 size-4"/>{documentRow ? "Replace PDF" : "Upload PDF"}</Button></div>
      </div>
      {documentRow ? <div className="mt-5 grid gap-3 sm:grid-cols-3"><div className="rounded-2xl bg-muted/60 p-4"><p className="text-xs text-muted-foreground">PDF</p><p className="mt-1 truncate font-bold">{documentRow.file_name}</p></div><div className="rounded-2xl bg-muted/60 p-4"><p className="text-xs text-muted-foreground">Pages</p><p className="mt-1 font-bold">{documentRow.page_count}</p></div><div className="rounded-2xl bg-muted/60 p-4"><p className="text-xs text-muted-foreground">Clickable products</p><p className="mt-1 font-bold">{savedCount}</p></div></div> : <button onClick={() => inputRef.current?.click()} className="mt-5 flex w-full items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-10 text-sm font-bold text-muted-foreground transition hover:bg-muted/50"><FileText className="size-5"/>Upload your original PDF to start</button>}
    </div>

    {documentRow ? <>
      <div className="rounded-[30px] border bg-card shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b p-3 sm:p-4"><div className="flex items-center gap-2"><Button size="icon" variant="outline" disabled={page <= 1} onClick={() => { setPage((p) => p - 1); setActiveId(null); setSelecting(false); }}><ChevronLeft className="size-4"/></Button><span className="min-w-24 text-center text-sm font-bold">Page {page} / {documentRow.page_count}</span><Button size="icon" variant="outline" disabled={page >= documentRow.page_count} onClick={() => { setPage((p) => p + 1); setActiveId(null); setSelecting(false); }}><ChevronRight className="size-4"/></Button></div><div className="flex items-center gap-2"><Button size="icon" variant="outline" onClick={() => setZoom((z) => Math.max(0.75, z - 0.1))}><ZoomOut className="size-4"/></Button><span className="w-12 text-center text-xs font-bold">{Math.round(zoom * 100)}%</span><Button size="icon" variant="outline" onClick={() => setZoom((z) => Math.min(2, z + 0.1))}><ZoomIn className="size-4"/></Button><Button variant={selecting ? "default" : "outline"} onClick={() => { setActiveId(null); setEditingArea(false); setSelecting(true); setZoom(0.85); }}><MousePointer2 className="mr-2 size-4"/>Select area</Button></div></div>
        <div className="grid gap-4 p-3 lg:grid-cols-[minmax(0,1fr)_380px] lg:p-5">
          <div className="overflow-auto rounded-2xl bg-muted/40 p-2 sm:p-4"><div ref={stageRef} className="relative mx-auto w-fit touch-none select-none" style={{ transform: `scale(${zoom})`, transformOrigin: "top center" }} onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={finishDrag} onPointerCancel={finishDrag}><canvas ref={canvasRef} className="block h-auto max-w-none rounded-lg bg-white shadow-md"/><div className="pointer-events-none absolute inset-0">{pageCandidates.map((candidate) => <EditablePdfHotspot key={candidate.id} candidate={candidate} active={candidate.id === activeId} disabled={selecting || editingArea} draftName={drafts[candidate.id]?.name_en || drafts[candidate.id]?.name_ar || ""} onSelect={() => { setActiveId(candidate.id); setSelecting(false); setEditingArea(false); setZoom(0.85); }} onChange={(rect) => setAnalysis((current) => ({ ...current, candidates: current.candidates.map((c) => c.id === candidate.id ? { ...c, ...rect } : c) }))} stageRef={stageRef} />)}</div>{dragRect && <div className="pointer-events-none absolute border-2 border-dashed border-primary bg-primary/10" style={{ left: `${dragRect.x * 100}%`, top: `${dragRect.y * 100}%`, width: `${dragRect.width * 100}%`, height: `${dragRect.height * 100}%` }}/>}</div></div>
          <aside className="rounded-2xl border bg-background p-4 sm:p-5">
            {selecting ? <div className="flex min-h-[360px] flex-col justify-center text-center"><div className="mx-auto grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary"><MousePointer2 className="size-6"/></div><h2 className="mt-4 text-lg font-black">Select one product</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">Drag a rectangle tightly around the product name, description and price. When you release, QuickServe reads the selected area automatically.</p><div className="mt-5 rounded-xl bg-muted p-3 text-left text-xs leading-5"><b>Tip:</b> include the complete item block, but avoid nearby items.</div></div> : active ? <div><div className="flex items-center justify-between"><div><Badge variant="outline" className="rounded-full">Selected product</Badge><p className="mt-1 text-xs text-muted-foreground">Review before publishing</p></div><Button size="icon" variant="ghost" onClick={() => { setActiveId(null); setSelecting(true); }}><X className="size-4"/></Button></div>{reading ? <div className="my-8 flex items-center justify-center gap-2 text-sm font-semibold text-muted-foreground"><Loader2 className="size-4 animate-spin"/>Reading selected area…</div> : null}<div className="mt-5 space-y-4"><div><label className="text-xs font-bold">Product title — English</label><Input className="mt-1.5" value={active.name_en} onChange={(e) => updateDraft({ name_en: e.target.value })} placeholder="e.g. Chicken Shawarma" /></div><div><label className="text-xs font-bold">Product title — Arabic</label><Input dir="rtl" className="mt-1.5" value={active.name_ar} onChange={(e) => updateDraft({ name_ar: e.target.value })} placeholder="مثال: شاورما دجاج" /></div><div><label className="text-xs font-bold">Description — English <span className="font-normal text-muted-foreground">(optional)</span></label><Textarea className="mt-1.5 min-h-20" value={active.description_en ?? ""} onChange={(e) => updateDraft({ description_en: e.target.value || null })} placeholder="What comes with the item? Ingredients or details from the PDF." /></div><div><label className="text-xs font-bold">Description — Arabic <span className="font-normal text-muted-foreground">(optional)</span></label><Textarea dir="rtl" className="mt-1.5 min-h-20" value={active.description_ar ?? ""} onChange={(e) => updateDraft({ description_ar: e.target.value || null })} placeholder="وصف المنتج بالعربي، إذا كان موجوداً في القائمة." /></div><div className="grid grid-cols-[1fr_100px] gap-2"><div><label className="text-xs font-bold">Price</label><Input className="mt-1.5" type="number" min="0" step="0.01" value={active.price ?? ""} onChange={(e) => updateDraft({ price: e.target.value === "" ? null : Number(e.target.value) })} placeholder="0.00" /></div><div><label className="text-xs font-bold">Currency</label><div className="mt-1.5 flex h-10 items-center justify-center rounded-md border bg-muted font-bold">JOD</div></div></div><div className="rounded-xl bg-muted/60 p-3 text-xs leading-5 text-muted-foreground"><b>How this works:</b> English and Arabic fields are separate so you can correct either language without changing the original PDF. Currency is fixed to JOD for this restaurant.</div><div className="grid grid-cols-2 gap-2"><Button variant="outline" onClick={() => { if (!activeCandidate) return; setEditingArea(true); setSelecting(false); }}><Edit3 className="mr-2 size-4"/>Edit area</Button><Button variant="outline" onClick={() => activeId && void deleteProduct(activeId)} disabled={saving}><Trash2 className="mr-2 size-4"/>Delete</Button></div><Button className="w-full" onClick={() => void saveProduct()} disabled={saving || reading}><Save className="mr-2 size-4"/>{saving ? "Saving…" : "Save & continue"}</Button></div></div> : <div className="flex min-h-[360px] flex-col justify-center text-center text-muted-foreground"><Settings2 className="mx-auto size-7"/><h2 className="mt-3 font-bold text-foreground">Ready for the next product</h2><p className="mt-1 text-sm">Use Select area, drag around the next item, then review and save.</p></div>}
          </aside>
        </div>
      </div>

      <div className="rounded-[30px] border bg-card p-4 shadow-sm sm:p-6"><div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"><div><div className="flex items-center gap-2"><Settings2 className="size-5 text-primary"/><h2 className="text-lg font-black">Whole-menu charges</h2></div><p className="mt-1 text-sm text-muted-foreground">These charges are applied to the customer's entire order, not to individual PDF products.</p></div><Button onClick={() => void saveCharges()} disabled={chargesSaving}><Check className="mr-2 size-4"/>{chargesSaving ? "Saving…" : "Save charges"}</Button></div><div className="mt-5 grid gap-4 sm:grid-cols-2"><div className="rounded-2xl border p-4"><label className="text-sm font-bold">Tax</label><p className="mt-1 text-xs text-muted-foreground">Set 0% if the restaurant does not charge tax.</p><div className="mt-3 flex items-center gap-2"><Input type="number" min="0" max="100" step="0.01" value={taxRate} onChange={(e) => setTaxRate(Number(e.target.value) || 0)} /><span className="font-bold">%</span></div></div><div className="rounded-2xl border p-4"><div className="flex items-center justify-between"><div><label className="text-sm font-bold">Service charge</label><p className="mt-1 text-xs text-muted-foreground">Enable only if the restaurant charges a service fee.</p></div><input type="checkbox" checked={serviceEnabled} onChange={(e) => setServiceEnabled(e.target.checked)} className="size-5 accent-primary"/></div><div className="mt-3 flex items-center gap-2"><Input type="number" min="0" max="100" step="0.01" value={serviceRate} onChange={(e) => setServiceRate(Number(e.target.value) || 0)} disabled={!serviceEnabled}/><span className="font-bold">%</span></div></div></div><div className="mt-4 rounded-2xl bg-muted/60 p-3 text-xs leading-5 text-muted-foreground">Customer checkout will show the charges separately as <b>Tax</b> and <b>Service</b>. Arabic changes only the wording (for example <b>ضرائب</b> and <b>خدمة</b>); the original PDF layout and direction stay unchanged.</div></div>
    </> : null}
  </div>;
}
