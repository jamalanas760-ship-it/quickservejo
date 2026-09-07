import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, ChevronLeft, ChevronRight, Edit3, FileText, Loader2, MousePointer2, Move, Save, Settings2, Trash2, Upload, X, ZoomIn, ZoomOut } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
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
type InteractionMode = "select" | "move" | "edit";
type DocumentRow = { id: string; file_url: string; file_parts?: string[]; file_name: string; page_count: number; analysis: PdfMenuAnalysis; is_active: boolean };
const EMPTY: PdfMenuAnalysis = { page_count: 0, pages: [], candidates: [] };
const JOD = "JOD";
const MIN_ZOOM = 0.4;
const MAX_ZOOM = 2;
const ZOOM_STEP = 0.05;

function emptyProduct(id: string): Product {
  return { candidate_id: id, name_en: "", name_ar: "", description_en: null, description_ar: null, price: null, currency: JOD, confidence: 1 };
}
function onlyManual(analysis: PdfMenuAnalysis | null | undefined): PdfMenuAnalysis {
  return { ...(analysis ?? EMPTY), candidates: (analysis?.candidates ?? []).filter((c) => c.id.startsWith("manual-")) };
}
function clampZoom(value: number) { return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Number(value.toFixed(2)))); }

function EditablePdfHotspot({ candidate, active, enabled, mode, draftName, onSelect, onChange, stageRef }: { candidate: PdfMenuCandidate; active: boolean; enabled: boolean; mode: InteractionMode; draftName: string; onSelect: () => void; onChange: (rect: Rect) => void; stageRef: React.RefObject<HTMLDivElement | null> }) {
  const drag = useRef<{ pointerX: number; pointerY: number; rect: Rect; mode: "move" | "edit" } | null>(null);
  const rect = { x: candidate.x, y: candidate.y, width: candidate.width, height: candidate.height };
  const canInteract = enabled && active;
  const begin = (event: React.PointerEvent<HTMLButtonElement>, action: "move" | "edit") => {
    event.preventDefault(); event.stopPropagation();
    if (!enabled) { onSelect(); return; }
    if (!active) { onSelect(); return; }
    if (mode !== action) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    drag.current = { pointerX: event.clientX, pointerY: event.clientY, rect, mode: action };
  };
  const move = (event: React.PointerEvent<HTMLButtonElement>) => {
    const state = drag.current; const stage = stageRef.current;
    if (!state || !stage) return;
    event.preventDefault(); event.stopPropagation();
    const box = stage.getBoundingClientRect();
    const dx = (event.clientX - state.pointerX) / Math.max(1, box.width);
    const dy = (event.clientY - state.pointerY) / Math.max(1, box.height);
    let { x, y, width, height } = state.rect;
    if (state.mode === "move") { x += dx; y += dy; }
    else { width += dx; height += dy; }
    const left = Math.max(0, Math.min(1, Math.min(x, x + width)));
    const top = Math.max(0, Math.min(1, Math.min(y, y + height)));
    const right = Math.max(0, Math.min(1, Math.max(x, x + width)));
    const bottom = Math.max(0, Math.min(1, Math.max(y, y + height)));
    onChange({ x: left, y: top, width: Math.max(0.008, right - left), height: Math.max(0.008, bottom - top) });
  };
  const end = (event: React.PointerEvent<HTMLButtonElement>) => { event.stopPropagation(); drag.current = null; };
  const resize = (event: React.PointerEvent<HTMLButtonElement>, handle: string) => {
    event.preventDefault(); event.stopPropagation();
    if (!canInteract || mode !== "edit") return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    drag.current = { pointerX: event.clientX, pointerY: event.clientY, rect, mode: "edit" };
    (drag.current as any).handle = handle;
  };
  const resizeMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const state: any = drag.current; const stage = stageRef.current;
    if (!state || state.mode !== "edit" || !stage) return;
    event.preventDefault(); event.stopPropagation();
    const box = stage.getBoundingClientRect();
    const dx = (event.clientX - state.pointerX) / Math.max(1, box.width);
    const dy = (event.clientY - state.pointerY) / Math.max(1, box.height);
    let { x, y, width, height } = state.rect;
    if (state.handle.includes("w")) { x += dx; width -= dx; }
    if (state.handle.includes("e")) width += dx;
    if (state.handle.includes("n")) { y += dy; height -= dy; }
    if (state.handle.includes("s")) height += dy;
    const left = Math.max(0, Math.min(1, Math.min(x, x + width)));
    const top = Math.max(0, Math.min(1, Math.min(y, y + height)));
    const right = Math.max(0, Math.min(1, Math.max(x, x + width)));
    const bottom = Math.max(0, Math.min(1, Math.max(y, y + height)));
    onChange({ x: left, y: top, width: Math.max(0.008, right - left), height: Math.max(0.008, bottom - top) });
  };
  const handles = [["nw", "-left-1 -top-1 cursor-nwse-resize"], ["n", "left-1/2 -top-1 -translate-x-1/2 cursor-ns-resize"], ["ne", "-right-1 -top-1 cursor-nesw-resize"], ["w", "-left-1 top-1/2 -translate-y-1/2 cursor-ew-resize"], ["e", "-right-1 top-1/2 -translate-y-1/2 cursor-ew-resize"], ["sw", "-left-1 -bottom-1 cursor-nesw-resize"], ["s", "left-1/2 -bottom-1 -translate-x-1/2 cursor-ns-resize"], ["se", "-right-1 -bottom-1 cursor-nwse-resize"]] as const;
  return <div className={"absolute z-30 " + (!enabled ? "opacity-40" : "")} style={{ left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.width * 100}%`, height: `${rect.height * 100}%` }}>
    <button type="button" aria-label={active ? "Selected menu area" : "Select menu area"} onClick={(event) => { event.stopPropagation(); onSelect(); }} onPointerDown={(event) => begin(event, "move")} onPointerMove={move} onPointerUp={end} onPointerCancel={end} className={`absolute inset-0 rounded-lg border-2 transition ${active ? "border-primary bg-primary/12 shadow-[0_0_0_3px_hsl(var(--primary)/.12)]" : "border-primary/45 bg-primary/5 hover:border-primary"} ${!enabled ? "border-dashed" : ""}`}>
      {active && <span className="absolute -top-6 left-0 max-w-[210px] truncate rounded-md bg-foreground px-2 py-1 text-[10px] font-bold text-background shadow-sm">{draftName || "Selected area"}</span>}
    </button>
    {active && mode === "edit" && enabled && handles.map(([handle, position]) => <button key={handle} type="button" aria-label={`Resize selected area ${handle}`} onPointerDown={(event) => resize(event, handle)} onPointerMove={resizeMove} onPointerUp={end} onPointerCancel={end} className={`absolute z-50 size-3 rounded-full border-2 border-background bg-primary shadow ${position}`} />)}
  </div>;
}

export function PdfMenuManagerV2({ restaurantId }: { restaurantId: string }) {
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
  const [interactionMode, setInteractionMode] = useState<InteractionMode>("select");
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

  const existing = useQuery<DocumentRow | null>({ queryKey: ["platform", "pdf-document", restaurantId], queryFn: async () => {
    const { data, error } = await (supabase as any).from("menu_pdf_documents").select("id,file_url,file_parts,file_name,page_count,analysis,is_active").eq("restaurant_id", restaurantId).maybeSingle();
    if (error) throw error; return data as DocumentRow | null;
  }});
  const charges = useQuery({ queryKey: ["platform", "restaurant-menu-charges", restaurantId], queryFn: async () => {
    const [r, s] = await Promise.all([supabase.from("restaurants").select("tax_rate,service_charge").eq("id", restaurantId).single(), supabase.from("restaurant_settings").select("enable_service_charge").eq("restaurant_id", restaurantId).maybeSingle()]);
    if (r.error) throw r.error; if (s.error) throw s.error;
    return { tax: Number(r.data.tax_rate ?? 0), service: Number(r.data.service_charge ?? 0), enabled: Boolean(s.data?.enable_service_charge) };
  }});

  useEffect(() => { if (!existing.data || documentRow || file) return; setDocumentRow(existing.data); const clean = onlyManual(existing.data.analysis); setAnalysis(clean); setFileUrl(existing.data.file_url); setFileParts(existing.data.file_parts ?? []); }, [existing.data, documentRow, file]);
  useEffect(() => { if (!charges.data) return; setTaxRate(charges.data.tax); setServiceRate(charges.data.service); setServiceEnabled(charges.data.enabled); }, [charges.data]);
  useEffect(() => {
    let cancelled = false;
    async function loadSaved() {
      if (!existing.data || file) return;
      const { data: links } = await (supabase as any).from("menu_pdf_item_links").select("candidate_id,menu_item_id,is_active").eq("document_id", existing.data.id).eq("restaurant_id", restaurantId);
      const rows = (links ?? []).filter((r: any) => typeof r.candidate_id === "string" && r.candidate_id.startsWith("manual-"));
      setEnabledMap(Object.fromEntries(rows.map((r: any) => [r.candidate_id, Boolean(r.is_active)])));
      if (!rows.length) { setDrafts({}); return; }
      const { data: items } = await supabase.from("menu_items").select("id,name_en,name_ar,description_en,description_ar,price").in("id", rows.map((r: any) => r.menu_item_id));
      const map = new Map((items ?? []).map((item: any) => [item.id, item])); const next: Record<string, Product> = {};
      for (const row of rows) { const item: any = map.get(row.menu_item_id); if (!item) continue; next[row.candidate_id] = { candidate_id: row.candidate_id, name_en: item.name_en ?? "", name_ar: item.name_ar ?? "", description_en: item.description_en ?? null, description_ar: item.description_ar ?? null, price: item.price == null ? null : Number(item.price), currency: JOD, confidence: 1 }; }
      if (!cancelled) setDrafts(next);
    }
    void loadSaved(); return () => { cancelled = true; };
  }, [existing.data, restaurantId, file]);
  useEffect(() => {
    let cancelled = false;
    async function draw() { if (!canvasRef.current || !fileUrl || !analysis.page_count) return; try { const pdf = await openPdf(await fetchPdfBytes(fileUrl, fileParts)); if (!cancelled) await renderPdfPage(pdf, page, canvasRef.current, 1400); } catch (error) { if (!cancelled) toast.error(humanError(error)); } }
    void draw(); return () => { cancelled = true; };
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
      const buffer = await nextFile.arrayBuffer(); const pdf = await openPdf(buffer); const uploaded = await uploadRestaurantPdf(restaurantId, nextFile);
      const nextAnalysis: PdfMenuAnalysis = { page_count: pdf.numPages, pages: [], candidates: [] };
      const { data, error } = await (supabase as any).from("menu_pdf_documents").upsert({ restaurant_id: restaurantId, file_url: uploaded.url, file_parts: uploaded.parts, file_name: nextFile.name, page_count: pdf.numPages, analysis: nextAnalysis, is_active: true }, { onConflict: "restaurant_id" }).select("id,file_url,file_parts,file_name,page_count,analysis,is_active").single();
      if (error) throw error;
      setDocumentRow(data as DocumentRow); setFile(nextFile); setFileUrl(uploaded.url); setFileParts(uploaded.parts); setAnalysis(nextAnalysis); setDrafts({}); setEnabledMap({}); setPage(1); setZoom(0.85); setSelecting(true); setInteractionMode("select"); setActiveId(null);
      toast.success(`${pdf.numPages} page${pdf.numPages === 1 ? "" : "s"} ready. Select your first product.`);
    } catch (error) { toast.error(humanError(error)); } finally { setSaving(false); if (inputRef.current) inputRef.current.value = ""; }
  }
  function pointFromEvent(event: React.PointerEvent<HTMLDivElement>) { const box = stageRef.current?.getBoundingClientRect(); if (!box) return null; return { x: Math.max(0, Math.min(1, (event.clientX - box.left) / box.width)), y: Math.max(0, Math.min(1, (event.clientY - box.top) / box.height)) }; }
  function startDrag(event: React.PointerEvent<HTMLDivElement>) { if (!selecting || interactionMode !== "select" || activeId) return; if (event.button !== 0) return; const point = pointFromEvent(event); if (!point) return; event.currentTarget.setPointerCapture(event.pointerId); setDragStart(point); setDragRect({ x: point.x, y: point.y, width: 0, height: 0 }); }
  function moveDrag(event: React.PointerEvent<HTMLDivElement>) { if (!dragStart) return; const point = pointFromEvent(event); if (!point) return; const x = Math.min(dragStart.x, point.x); const y = Math.min(dragStart.y, point.y); setDragRect({ x, y, width: Math.abs(point.x - dragStart.x), height: Math.abs(point.y - dragStart.y) }); }
  function finishDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (!dragStart || !dragRect) return; try { event.currentTarget.releasePointerCapture(event.pointerId); } catch {}
    const rect = dragRect; setDragStart(null); setDragRect(null); if (rect.width < 0.008 || rect.height < 0.008) return;
    const id = `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`; const candidate: PdfMenuCandidate = { id, page_number: page, text: "Manual selection", x: rect.x, y: rect.y, width: rect.width, height: rect.height, confidence: 1 };
    setAnalysis((current) => ({ ...current, candidates: [...current.candidates, candidate].sort((a, b) => a.page_number - b.page_number || a.y - b.y || a.x - b.x) }));
    setDrafts((current) => ({ ...current, [id]: emptyProduct(id) })); setEnabledMap((current) => ({ ...current, [id]: true })); setActiveId(id); setSelecting(false); setInteractionMode("select"); void readSelection(candidate, rect);
  }
  async function readSelection(candidate: PdfMenuCandidate, rect: Rect) {
    if (!fileUrl) return; setReading(true);
    try {
      const pdf = await openPdf(await fetchPdfBytes(fileUrl, fileParts)); const pdfPage = await pdf.getPage(candidate.page_number); const base = pdfPage.getViewport({ scale: 1 }); const scale = Math.min(4, Math.max(2.5, 2200 / base.width)); const viewport = pdfPage.getViewport({ scale });
      const full = document.createElement("canvas"); full.width = Math.ceil(viewport.width); full.height = Math.ceil(viewport.height); const ctx = full.getContext("2d"); if (!ctx) throw new Error("Could not render PDF page"); await pdfPage.render({ canvasContext: ctx, viewport }).promise;
      const padX = Math.max(12, Math.round(full.width * 0.012)); const padY = Math.max(12, Math.round(full.height * 0.012)); const sx = Math.max(0, Math.floor(rect.x * full.width) - padX); const sy = Math.max(0, Math.floor(rect.y * full.height) - padY); const ex = Math.min(full.width, Math.ceil((rect.x + rect.width) * full.width) + padX); const ey = Math.min(full.height, Math.ceil((rect.y + rect.height) * full.height) + padY); const sw = Math.max(1, ex - sx); const sh = Math.max(1, ey - sy);
      const crop = document.createElement("canvas"); const down = Math.min(1, 2400 / Math.max(sw, sh)); crop.width = Math.max(1, Math.round(sw * down)); crop.height = Math.max(1, Math.round(sh * down)); const cropCtx = crop.getContext("2d"); if (!cropCtx) throw new Error("Could not prepare selected area"); cropCtx.imageSmoothingEnabled = true; cropCtx.imageSmoothingQuality = "high"; cropCtx.drawImage(full, sx, sy, sw, sh, 0, 0, crop.width, crop.height);
      const textItems = await pdfPage.getTextContent(); const selectedText = textItems.items.map((item: any) => { if (!item?.str || !Array.isArray(item.transform)) return null; const x = Number(item.transform[4]) || 0; const baseline = Number(item.transform[5]) || 0; const h = Math.max(5, Math.abs(Number(item.transform[3]) || Number(item.height) || 10)); const y = base.height - baseline - h; const w = Math.max(3, Number(item.width) || item.str.length * h * 0.45); return x < (rect.x + rect.width) * base.width && x + w > rect.x * base.width && y < (rect.y + rect.height) * base.height && y + h > rect.y * base.height ? String(item.str).trim() : null; }).filter(Boolean).join(" ").replace(/\s+/g, " ").trim().slice(0, 10000);
      const result = await runVision({ data: { restaurantId, pageNumber: candidate.page_number, pageWidth: crop.width, pageHeight: crop.height, imageDataUrl: crop.toDataURL("image/jpeg", 0.96), selectionOnly: true, selectedText } }); const product = result.products?.[0]?.product; if (!product) throw new Error("No product could be read from this area");
      setDrafts((current) => ({ ...current, [candidate.id]: { candidate_id: candidate.id, name_en: product.name_en ?? "", name_ar: product.name_ar ?? "", description_en: product.description_en ?? null, description_ar: product.description_ar ?? null, price: product.price == null ? null : Number(product.price), currency: JOD, confidence: Number(product.confidence ?? 0) } })); toast.success("Fields filled. Review and save the product.");
    } catch { setDrafts((current) => ({ ...current, [candidate.id]: emptyProduct(candidate.id) })); toast.info("The area was selected, but the text could not be read reliably. You can enter it manually."); } finally { setReading(false); }
  }
  function updateDraft(patch: Partial<Product>) { if (!activeId) return; setDrafts((current) => ({ ...current, [activeId]: { ...(current[activeId] ?? emptyProduct(activeId)), ...patch } })); }
  function updateCandidate(id: string, rect: Rect) { setAnalysis((current) => ({ ...current, candidates: current.candidates.map((c) => c.id === id ? { ...c, ...rect } : c) })); }
  function setSelectedMode(mode: InteractionMode) { if (!activeId) return; setInteractionMode(mode); setSelecting(false); }
  function toggleEnabled() { if (!activeId) return; setEnabledMap((current) => ({ ...current, [activeId]: !(current[activeId] ?? true) })); }

  async function saveProduct() {
    if (!activeId || !activeCandidate || !documentRow) return; const product = drafts[activeId] ?? emptyProduct(activeId); const nameEn = product.name_en.trim() || product.name_ar.trim(); const nameAr = product.name_ar.trim() || product.name_en.trim();
    if (!nameEn) { toast.error("Add a product title in English or Arabic before saving."); return; } if (product.price == null || !Number.isFinite(product.price)) { toast.error("Add the product price before saving."); return; }
    setSaving(true);
    try {
      const payload = { restaurant_id: restaurantId, name_en: nameEn, name_ar: nameAr, description_en: product.description_en?.trim() || null, description_ar: product.description_ar?.trim() || null, price: product.price, is_available: true };
      const { data: existingLink } = await (supabase as any).from("menu_pdf_item_links").select("id,menu_item_id").eq("document_id", documentRow.id).eq("candidate_id", activeId).maybeSingle(); let menuItemId = existingLink?.menu_item_id as string | undefined;
      if (menuItemId) { const { error } = await supabase.from("menu_items").update(payload).eq("id", menuItemId).eq("restaurant_id", restaurantId); if (error) throw error; } else { const { data: item, error } = await supabase.from("menu_items").insert(payload).select("id").single(); if (error) throw error; menuItemId = item.id; }
      const { error: linkError } = await (supabase as any).from("menu_pdf_item_links").upsert({ document_id: documentRow.id, restaurant_id: restaurantId, menu_item_id: menuItemId, page_number: activeCandidate.page_number, x: activeCandidate.x, y: activeCandidate.y, width: activeCandidate.width, height: activeCandidate.height, label: nameEn, source: "manual-selection", is_active: enabledMap[activeId] ?? true, candidate_id: activeId }, { onConflict: "document_id,candidate_id" }); if (linkError) throw linkError;
      const clean = onlyManual(analysis); const { error: analysisError } = await (supabase as any).from("menu_pdf_documents").update({ analysis: clean }).eq("id", documentRow.id).eq("restaurant_id", restaurantId); if (analysisError) throw analysisError;
      setAnalysis(clean); setDocumentRow((current) => current ? { ...current, analysis: clean } : current); setActiveId(null); setSelecting(true); setInteractionMode("select"); await queryClient.invalidateQueries({ queryKey: ["platform", "pdf-document", restaurantId] }); toast.success("Product saved. Select the next area.");
    } catch (error) { toast.error(humanError(error)); } finally { setSaving(false); }
  }
  async function deleteProduct(candidateId: string) {
    if (!documentRow) return; setSaving(true);
    try { const { data: link } = await (supabase as any).from("menu_pdf_item_links").select("id,menu_item_id").eq("document_id", documentRow.id).eq("candidate_id", candidateId).maybeSingle(); if (link?.id) await (supabase as any).from("menu_pdf_item_links").delete().eq("id", link.id); if (link?.menu_item_id) await supabase.from("menu_items").delete().eq("id", link.menu_item_id).eq("restaurant_id", restaurantId); const clean = { ...analysis, candidates: analysis.candidates.filter((c) => c.id !== candidateId) }; await (supabase as any).from("menu_pdf_documents").update({ analysis: clean }).eq("id", documentRow.id).eq("restaurant_id", restaurantId); setAnalysis(clean); setDrafts((current) => { const next = { ...current }; delete next[candidateId]; return next; }); setEnabledMap((current) => { const next = { ...current }; delete next[candidateId]; return next; }); setActiveId(null); setSelecting(true); setInteractionMode("select"); toast.success("Product removed."); } catch (error) { toast.error(humanError(error)); } finally { setSaving(false); }
  }
  async function saveCharges() {
    const tax = Math.max(0, Math.min(100, Number(taxRate) || 0)); const service = Math.max(0, Math.min(100, Number(serviceRate) || 0)); setChargesSaving(true);
    try { const { error: rError } = await supabase.from("restaurants").update({ tax_rate: tax, service_charge: service }).eq("id", restaurantId); if (rError) throw rError; const { data: settings, error: sError } = await supabase.from("restaurant_settings").select("id").eq("restaurant_id", restaurantId).maybeSingle(); if (sError) throw sError; if (settings?.id) { const { error } = await supabase.from("restaurant_settings").update({ enable_service_charge: serviceEnabled }).eq("id", settings.id); if (error) throw error; } else { const { error } = await supabase.from("restaurant_settings").insert({ restaurant_id: restaurantId, enable_service_charge: serviceEnabled }); if (error) throw error; } await queryClient.invalidateQueries({ queryKey: ["platform", "restaurant-menu-charges", restaurantId] }); toast.success("Menu charges saved. They apply to the whole menu."); } catch (error) { toast.error(humanError(error)); } finally { setChargesSaving(false); }
  }

  if (existing.isPending) return <Skeleton className="mx-auto h-[70vh] max-w-7xl rounded-[30px]" />;

  return <div className="mx-auto max-w-7xl space-y-4 pb-20">
    <div className="rounded-[30px] border bg-card p-4 shadow-sm sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0"><div className="flex items-center gap-2"><Badge className="rounded-full">Interactive mode</Badge><span className="text-xs font-medium text-muted-foreground">Select • Move • Edit</span></div><h1 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">Interactive PDF Menu</h1><p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">Keep the original menu design and place precise clickable areas. Click an area to select it, then choose exactly how you want to customize it.</p></div>
        <div className="flex shrink-0 gap-2"><input ref={inputRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => void handleFile(e.target.files?.[0])}/><Button onClick={() => inputRef.current?.click()} disabled={saving}><Upload className="mr-2 size-4"/>{documentRow ? "Replace PDF" : "Upload PDF"}</Button></div>
      </div>
      {documentRow ? <div className="mt-5 grid gap-3 sm:grid-cols-3"><div className="rounded-2xl bg-muted/60 p-4"><p className="text-xs text-muted-foreground">PDF</p><p className="mt-1 truncate font-bold">{documentRow.file_name}</p></div><div className="rounded-2xl bg-muted/60 p-4"><p className="text-xs text-muted-foreground">Pages</p><p className="mt-1 font-bold">{documentRow.page_count}</p></div><div className="rounded-2xl bg-muted/60 p-4"><p className="text-xs text-muted-foreground">Clickable areas</p><p className="mt-1 font-bold">{savedCount}</p></div></div> : <button onClick={() => inputRef.current?.click()} className="mt-5 flex w-full items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-10 text-sm font-bold text-muted-foreground transition hover:bg-muted/50"><FileText className="size-5"/>Upload your original PDF to start</button>}
    </div>

    {documentRow && <>
      <div className="rounded-[30px] border bg-card shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b p-3 sm:p-4">
          <div className="flex items-center gap-2"><Button size="icon" variant="outline" disabled={page <= 1} onClick={() => { setPage((p) => p - 1); setActiveId(null); setSelecting(false); }}><ChevronLeft className="size-4"/></Button><span className="min-w-24 text-center text-sm font-bold">Page {page} / {documentRow.page_count}</span><Button size="icon" variant="outline" disabled={page >= documentRow.page_count} onClick={() => { setPage((p) => p + 1); setActiveId(null); setSelecting(false); }}><ChevronRight className="size-4"/></Button></div>
          <div className="flex flex-wrap items-center gap-2"><div className="flex items-center rounded-xl border bg-background p-1"><Button size="icon" variant="ghost" disabled={zoom <= MIN_ZOOM} onClick={() => setZoom((z) => clampZoom(z - ZOOM_STEP))}><ZoomOut className="size-4"/></Button><button className="min-w-14 px-1 text-xs font-black tabular-nums" onClick={() => setZoom(0.85)}>{Math.round(zoom * 100)}%</button><Button size="icon" variant="ghost" disabled={zoom >= MAX_ZOOM} onClick={() => setZoom((z) => clampZoom(z + ZOOM_STEP))}><ZoomIn className="size-4"/></Button></div><Button variant={selecting ? "default" : "outline"} onClick={() => { setActiveId(null); setSelecting(true); setInteractionMode("select"); }}><MousePointer2 className="mr-2 size-4"/>New area</Button></div>
        </div>

        <div className="grid gap-4 p-3 lg:grid-cols-[minmax(0,1fr)_360px] lg:p-5">
          <div className="overflow-auto rounded-2xl bg-muted/40 p-3 sm:p-5">
            <div className="flex min-h-[60vh] min-w-0 items-start justify-center overflow-visible">
              <div ref={stageRef} className="relative w-fit touch-none select-none" style={{ transform: `scale(${zoom})`, transformOrigin: "top center" }} onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={finishDrag} onPointerCancel={finishDrag}>
                <canvas ref={canvasRef} className="block max-w-none rounded-md bg-white shadow-xl" />
                {pageCandidates.map((candidate) => <EditablePdfHotspot key={candidate.id} candidate={candidate} active={activeId === candidate.id} enabled={enabledMap[candidate.id] ?? true} mode={interactionMode} draftName={drafts[candidate.id]?.name_en || drafts[candidate.id]?.name_ar || "Product"} onSelect={() => { setActiveId(candidate.id); setSelecting(false); setInteractionMode("select"); }} onChange={(rect) => updateCandidate(candidate.id, rect)} stageRef={stageRef}/>) }
                {dragRect && <div className="pointer-events-none absolute z-40 rounded-lg border-2 border-dashed border-primary bg-primary/10" style={{ left: `${dragRect.x * 100}%`, top: `${dragRect.y * 100}%`, width: `${dragRect.width * 100}%`, height: `${dragRect.height * 100}%` }}/>} 
              </div>
            </div>
          </div>

          <aside className="space-y-3">
            {activeId && activeCandidate && active ? <>
              <div className="rounded-2xl border bg-background p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Selected area</p><h2 className="mt-1 truncate text-lg font-black">{active.name_en || active.name_ar || "New product"}</h2></div><button className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted" onClick={() => { setActiveId(null); setInteractionMode("select"); }}><X className="size-4"/></button></div>
                <div className="mt-4 grid grid-cols-3 gap-2"><Button size="sm" variant={interactionMode === "move" ? "default" : "outline"} onClick={() => setSelectedMode("move")}><Move className="mr-1.5 size-3.5"/>Move</Button><Button size="sm" variant={interactionMode === "edit" ? "default" : "outline"} onClick={() => setSelectedMode("edit")}><Edit3 className="mr-1.5 size-3.5"/>Edit</Button><Button size="sm" variant={enabledMap[activeId] ?? true ? "outline" : "secondary"} onClick={toggleEnabled}>{enabledMap[activeId] ?? true ? <><Check className="mr-1.5 size-3.5"/>On</> : "Off"}</Button></div>
                <p className="mt-3 text-xs leading-5 text-muted-foreground">{interactionMode === "move" ? "Drag inside the selected box to reposition it." : interactionMode === "edit" ? "Drag the handles to resize the selected box." : "Select Move or Edit to customize this area."}</p>
              </div>
              <div className="rounded-2xl border bg-background p-4 shadow-sm">
                <div className="mb-3 flex items-center justify-between"><h3 className="font-black">Product details</h3>{reading && <Loader2 className="size-4 animate-spin text-primary"/>}</div>
                <div className="space-y-3"><Input placeholder="Name (English)" value={active.name_en} onChange={(e) => updateDraft({ name_en: e.target.value })}/><Input placeholder="Name (Arabic)" value={active.name_ar} onChange={(e) => updateDraft({ name_ar: e.target.value })}/><Textarea placeholder="Description (English)" value={active.description_en ?? ""} onChange={(e) => updateDraft({ description_en: e.target.value })}/><Textarea placeholder="Description (Arabic)" value={active.description_ar ?? ""} onChange={(e) => updateDraft({ description_ar: e.target.value })}/><Input type="number" min="0" step="0.01" placeholder="Price" value={active.price ?? ""} onChange={(e) => updateDraft({ price: e.target.value === "" ? null : Number(e.target.value) })}/></div>
                <div className="mt-4 grid grid-cols-2 gap-2"><Button onClick={() => void saveProduct()} disabled={saving || reading}><Save className="mr-2 size-4"/>Save</Button><Button variant="outline" onClick={() => void deleteProduct(activeId)} disabled={saving}><Trash2 className="mr-2 size-4"/>Delete</Button></div>
              </div>
            </> : <div className="rounded-2xl border bg-background p-5 shadow-sm"><div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><MousePointer2 className="size-5"/></div><h2 className="mt-3 font-black">Simple area control</h2><p className="mt-1 text-sm leading-6 text-muted-foreground">Click an existing area to select it. Use <b>Move</b> to reposition, <b>Edit</b> to resize, or <b>On/Off</b> to control whether it is clickable.</p><Button className="mt-4 w-full" onClick={() => { setSelecting(true); setInteractionMode("select"); setActiveId(null); }}>Create new area</Button></div>}
            <div className="rounded-2xl border bg-muted/30 p-4"><p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Tip</p><p className="mt-1 text-sm leading-6 text-muted-foreground">Zoom can go down to <b>40%</b>. This makes it easier to work with large menus without losing the full-page view.</p></div>
          </aside>
        </div>
      </div>

      <div className="rounded-[30px] border bg-card p-5 shadow-sm"><div className="flex items-center gap-2"><Settings2 className="size-5 text-primary"/><h2 className="text-lg font-black">Menu charges</h2></div><p className="mt-1 text-sm text-muted-foreground">These settings apply to the whole menu.</p><div className="mt-4 grid gap-3 sm:grid-cols-3"><div><label className="mb-1.5 block text-xs font-bold text-muted-foreground">Tax %</label><Input type="number" min="0" max="100" step="0.01" value={taxRate} onChange={(e) => setTaxRate(Number(e.target.value))}/></div><div><label className="mb-1.5 block text-xs font-bold text-muted-foreground">Service charge %</label><Input type="number" min="0" max="100" step="0.01" value={serviceRate} onChange={(e) => setServiceRate(Number(e.target.value))}/></div><div className="flex items-end gap-2"><Button variant={serviceEnabled ? "default" : "outline"} className="flex-1" onClick={() => setServiceEnabled((v) => !v)}>{serviceEnabled ? "Service charge ON" : "Service charge OFF"}</Button><Button onClick={() => void saveCharges()} disabled={chargesSaving}>{chargesSaving ? <Loader2 className="size-4 animate-spin"/> : "Save"}</Button></div></div></div>
    </>}
  </div>;
}
