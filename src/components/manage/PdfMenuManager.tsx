import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FileCheck2, FileText, Link2, Loader2, MousePointer2, Save, Settings2, Trash2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useRestaurant } from "@/hooks/useSuperAdmin";
import { humanError } from "@/lib/errors";
import { logAudit } from "@/lib/audit";
import { extractPdfVisualProducts } from "@/lib/pdf-menu-vision.server";
import { fetchPdfBytes, openPdf, renderPdfPage, type PdfMenuAnalysis, type PdfMenuCandidate } from "@/lib/pdf-menu";
import { MAX_PDF_BYTES, uploadRestaurantPdf } from "@/lib/storage";

type Product = { candidate_id: string; name_en: string; name_ar: string; description_en: string | null; description_ar: string | null; price: number | null; currency: string | null; confidence: number };
type SelectionRect = { x: number; y: number; width: number; height: number };
type PdfDocument = { id: string; file_url: string; file_parts?: string[]; file_name: string; page_count: number; analysis: PdfMenuAnalysis; is_active: boolean };
const EMPTY: PdfMenuAnalysis = { page_count: 0, pages: [], candidates: [] };

function manualCandidates(analysis: PdfMenuAnalysis | null | undefined): PdfMenuCandidate[] {
  return (analysis?.candidates ?? []).filter((candidate) => candidate.id.startsWith("manual-"));
}

export function PdfMenuManager({ restaurantId }: { restaurantId: string }) {
  const { data: restaurant } = useRestaurant(restaurantId);
  const queryClient = useQueryClient();
  const runVision = useServerFn(extractPdfVisualProducts);
  const inputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [documentRow, setDocumentRow] = useState<PdfDocument | null>(null);
  const [analysis, setAnalysis] = useState<PdfMenuAnalysis>(EMPTY);
  const [drafts, setDrafts] = useState<Record<string, Product>>({});
  const [file, setFile] = useState<File | null>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [fileParts, setFileParts] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [filling, setFilling] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [activeCandidate, setActiveCandidate] = useState<PdfMenuCandidate | null>(null);
  const [taxRate, setTaxRate] = useState(0);
  const [serviceRate, setServiceRate] = useState(0);
  const [serviceEnabled, setServiceEnabled] = useState(false);

  const existing = useQuery<PdfDocument | null>({
    queryKey: ["platform", "pdf-document", restaurantId],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("menu_pdf_documents").select("id,file_url,file_parts,file_name,page_count,analysis,is_active").eq("restaurant_id", restaurantId).maybeSingle();
      if (error) throw error;
      return data as PdfDocument | null;
    },
  });

  const settings = useQuery({
    queryKey: ["platform", "restaurant-menu-charges", restaurantId],
    queryFn: async () => {
      const [restaurantRes, settingsRes] = await Promise.all([
        supabase.from("restaurants").select("tax_rate,service_charge").eq("id", restaurantId).single(),
        supabase.from("restaurant_settings").select("enable_service_charge").eq("restaurant_id", restaurantId).maybeSingle(),
      ]);
      if (restaurantRes.error) throw restaurantRes.error;
      if (settingsRes.error) throw settingsRes.error;
      return { tax_rate: Number(restaurantRes.data.tax_rate ?? 0), service_charge: Number(restaurantRes.data.service_charge ?? 0), enable_service_charge: Boolean(settingsRes.data?.enable_service_charge) };
    },
  });

  useEffect(() => {
    if (!existing.data || documentRow || file) return;
    const stored = existing.data.analysis ?? EMPTY;
    setDocumentRow(existing.data);
    setAnalysis({ ...stored, candidates: manualCandidates(stored) });
    setFileUrl(existing.data.file_url);
    setFileParts(existing.data.file_parts ?? []);
  }, [existing.data, documentRow, file]);

  useEffect(() => {
    if (!settings.data) return;
    setTaxRate(settings.data.tax_rate);
    setServiceRate(settings.data.service_charge);
    setServiceEnabled(settings.data.enable_service_charge);
  }, [settings.data]);

  useEffect(() => {
    let cancelled = false;
    async function loadLinks() {
      if (!existing.data || file) return;
      const { data, error } = await (supabase as any).from("menu_pdf_item_links").select("candidate_id,menu_item_id").eq("document_id", existing.data.id).eq("restaurant_id", restaurantId).eq("is_active", true);
      if (error || cancelled) return;
      const rows = (data ?? []) as Array<{ candidate_id?: string | null; menu_item_id: string }>;
      const manualRows = rows.filter((row) => row.candidate_id?.startsWith("manual-"));
      if (!manualRows.length) return setDrafts({});
      const { data: items } = await supabase.from("menu_items").select("id,name_en,name_ar,description_en,description_ar,price").in("id", manualRows.map((row) => row.menu_item_id));
      const byId = new Map((items ?? []).map((item: any) => [item.id, item]));
      const next: Record<string, Product> = {};
      for (const row of manualRows) {
        const candidate = manualCandidates(existing.data.analysis).find((item) => item.id === row.candidate_id);
        const item: any = byId.get(row.menu_item_id);
        if (!candidate || !item) continue;
        next[candidate.id] = { candidate_id: candidate.id, name_en: item.name_en ?? "", name_ar: item.name_ar ?? "", description_en: item.description_en ?? null, description_ar: item.description_ar ?? null, price: item.price == null ? null : Number(item.price), currency: null, confidence: 1 };
      }
      if (!cancelled) setDrafts(next);
    }
    void loadLinks();
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
  const savedCount = Object.keys(drafts).length;

  async function persistDocumentAnalysis(nextAnalysis: PdfMenuAnalysis) {
    if (!documentRow) return;
    const clean = { ...nextAnalysis, candidates: manualCandidates(nextAnalysis) };
    const { error } = await (supabase as any).from("menu_pdf_documents").update({ analysis: clean }).eq("id", documentRow.id).eq("restaurant_id", restaurantId);
    if (error) throw error;
    setAnalysis(clean);
    setDocumentRow((current) => current ? { ...current, analysis: clean } : current);
  }

  async function handleFile(nextFile?: File) {
    if (!nextFile) return;
    if (nextFile.type !== "application/pdf" && !nextFile.name.toLowerCase().endsWith(".pdf")) { toast.error("Please upload a PDF menu."); return; }
    if (nextFile.size > MAX_PDF_BYTES) { toast.error("PDF is too large. Maximum allowed size is 100 MB."); return; }
    setBusy(true);
    try {
      const buffer = await nextFile.arrayBuffer();
      const pdf = await openPdf(buffer);
      const uploaded = await uploadRestaurantPdf(restaurantId, nextFile);
      const nextAnalysis: PdfMenuAnalysis = { page_count: pdf.numPages, pages: [], candidates: [] };
      const payload = { restaurant_id: restaurantId, file_url: uploaded.url, file_parts: uploaded.parts, file_name: nextFile.name, page_count: pdf.numPages, analysis: nextAnalysis, is_active: true };
      const { data, error } = await (supabase as any).from("menu_pdf_documents").upsert(payload, { onConflict: "restaurant_id" }).select("id,file_url,file_parts,file_name,page_count,analysis,is_active").single();
      if (error) throw error;
      setDocumentRow(data as PdfDocument);
      setFile(nextFile);
      setFileUrl(uploaded.url);
      setFileParts(uploaded.parts);
      setAnalysis(nextAnalysis);
      setDrafts({});
      setPage(1);
      setSelecting(true);
      setActiveCandidate(null);
      toast.success(`${pdf.numPages} page${pdf.numPages === 1 ? "" : "s"} ready. Select each product manually.`);
    } catch (error) {
      toast.error(humanError(error));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function autofill(candidate: PdfMenuCandidate, rect: SelectionRect) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setFilling(true);
    try {
      const crop = document.createElement("canvas");
      const sx = Math.max(0, Math.floor(rect.x * canvas.width));
      const sy = Math.max(0, Math.floor(rect.y * canvas.height));
      const sw = Math.max(1, Math.min(canvas.width - sx, Math.floor(rect.width * canvas.width)));
      const sh = Math.max(1, Math.min(canvas.height - sy, Math.floor(rect.height * canvas.height)));
      crop.width = Math.min(1800, sw);
      crop.height = Math.min(1800, sh);
      const context = crop.getContext("2d");
      if (!context) throw new Error("Could not prepare the selected area");
      context.drawImage(canvas, sx, sy, sw, sh, 0, 0, crop.width, crop.height);
      const result = await runVision({ data: { restaurantId, pageNumber: page, pageWidth: crop.width, pageHeight: crop.height, imageDataUrl: crop.toDataURL("image/jpeg", 0.92), selectionOnly: true } });
      const first = result.products?.[0];
      if (first?.product) {
        setDrafts((current) => ({ ...current, [candidate.id]: { ...first.product, candidate_id: candidate.id } as Product }));
        toast.success("Title, description and price filled automatically.");
      } else {
        toast.info("I couldn't read this area automatically. You can enter the details manually.");
        setDrafts((current) => ({ ...current, [candidate.id]: blankProduct(candidate.id) }));
      }
    } catch {
      toast.info("Auto-fill was unavailable. You can enter the details manually.");
      setDrafts((current) => ({ ...current, [candidate.id]: blankProduct(candidate.id) }));
    } finally {
      setFilling(false);
    }
  }

  function addManualSelection(rect: SelectionRect) {
    const id = `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const candidate: PdfMenuCandidate = { id, page_number: page, text: "Manual selection", x: rect.x, y: rect.y, width: rect.width, height: rect.height, confidence: 1 };
    const nextAnalysis = { ...analysis, candidates: [...analysis.candidates, candidate].sort((a, b) => a.page_number - b.page_number || a.y - b.y || a.x - b.x) };
    setAnalysis(nextAnalysis);
    setDrafts((current) => ({ ...current, [id]: blankProduct(id) }));
    setSelecting(false);
    setActiveCandidate(candidate);
    void autofill(candidate, rect);
  }

  function updateDraft(id: string, patch: Partial<Product>) {
    setDrafts((current) => ({ ...current, [id]: { ...(current[id] ?? blankProduct(id)), ...patch } }));
  }

  async function saveSelectedProduct() {
    if (!activeCandidate || !documentRow) return;
    const product = drafts[activeCandidate.id] ?? blankProduct(activeCandidate.id);
    const nameEn = product.name_en.trim() || product.name_ar.trim();
    const nameAr = product.name_ar.trim() || product.name_en.trim();
    if (!nameEn) { toast.error("Product title is required."); return; }
    setBusy(true);
    try {
      const productPayload = { restaurant_id: restaurantId, name_en: nameEn, name_ar: nameAr, description_en: product.description_en?.trim() || null, description_ar: product.description_ar?.trim() || null, price: product.price == null || !Number.isFinite(product.price) ? 0 : product.price, is_available: true };
      const { data: existingLink } = await (supabase as any).from("menu_pdf_item_links").select("id,menu_item_id").eq("document_id", documentRow.id).eq("candidate_id", activeCandidate.id).eq("restaurant_id", restaurantId).eq("is_active", true).maybeSingle();
      let itemId: string;
      if (existingLink?.menu_item_id) {
        const { error: itemError } = await supabase.from("menu_items").update(productPayload).eq("id", existingLink.menu_item_id).eq("restaurant_id", restaurantId);
        if (itemError) throw itemError;
        itemId = existingLink.menu_item_id;
      } else {
        const { data: item, error: itemError } = await supabase.from("menu_items").insert(productPayload).select("id").single();
        if (itemError) throw itemError;
        itemId = item.id;
      }
      const { error: linkError } = existingLink ? await (supabase as any).from("menu_pdf_item_links").update({ menu_item_id: itemId, label: nameEn, is_active: true }).eq("id", existingLink.id) : await (supabase as any).from("menu_pdf_item_links").insert({ document_id: documentRow.id, restaurant_id: restaurantId, menu_item_id: itemId, candidate_id: activeCandidate.id, page_number: activeCandidate.page_number, x: activeCandidate.x, y: activeCandidate.y, width: activeCandidate.width, height: activeCandidate.height, label: nameEn, source: "manual-selection", is_active: true });
      if (linkError) throw linkError;
      const savedProduct = { ...product, name_en: nameEn, name_ar: nameAr };
      setDrafts((current) => ({ ...current, [activeCandidate.id]: savedProduct }));
      const nextAnalysis = { ...analysis, candidates: analysis.candidates.map((candidate) => candidate.id === activeCandidate.id ? { ...candidate, text: nameEn } : candidate) };
      await persistDocumentAnalysis(nextAnalysis);
      setActiveCandidate(null);
      setSelecting(true);
      toast.success("Saved and made clickable. Select the next product.");
    } catch (error) {
      toast.error(humanError(error));
    } finally {
      setBusy(false);
    }
  }

  async function deleteSelectedProduct() {
    if (!activeCandidate || !documentRow) return;
    setBusy(true);
    try {
      const { data: links } = await (supabase as any).from("menu_pdf_item_links").select("menu_item_id").eq("document_id", documentRow.id).eq("candidate_id", activeCandidate.id).eq("restaurant_id", restaurantId);
      await (supabase as any).from("menu_pdf_item_links").update({ is_active: false }).eq("document_id", documentRow.id).eq("candidate_id", activeCandidate.id).eq("restaurant_id", restaurantId);
      for (const link of links ?? []) await supabase.from("menu_items").update({ is_available: false }).eq("id", link.menu_item_id).eq("restaurant_id", restaurantId);
      const nextAnalysis = { ...analysis, candidates: analysis.candidates.filter((candidate) => candidate.id !== activeCandidate.id) };
      await persistDocumentAnalysis(nextAnalysis);
      setDrafts((current) => { const next = { ...current }; delete next[activeCandidate.id]; return next; });
      setActiveCandidate(null);
      setSelecting(true);
      toast.success("Selection removed.");
    } catch (error) {
      toast.error(humanError(error));
    } finally {
      setBusy(false);
    }
  }

  async function saveCharges() {
    setBusy(true);
    try {
      const tax = Math.max(0, Number(taxRate) || 0);
      const service = Math.max(0, Number(serviceRate) || 0);
      const { error: restaurantError } = await supabase.from("restaurants").update({ tax_rate: tax, service_charge: service }).eq("id", restaurantId);
      if (restaurantError) throw restaurantError;
      const { error: settingsError } = await supabase.from("restaurant_settings").update({ enable_service_charge: serviceEnabled }).eq("restaurant_id", restaurantId);
      if (settingsError) throw settingsError;
      await queryClient.invalidateQueries({ queryKey: ["pdf-diner"] });
      await queryClient.invalidateQueries({ queryKey: ["platform", "restaurant-menu-charges", restaurantId] });
      toast.success("Tax and service charge saved for the whole menu.");
    } catch (error) {
      toast.error(humanError(error));
    } finally {
      setBusy(false);
    }
  }

  async function disablePdf() {
    if (!documentRow) return;
    setBusy(true);
    try {
      const { error } = await (supabase as any).from("menu_pdf_documents").update({ is_active: false }).eq("id", documentRow.id).eq("restaurant_id", restaurantId);
      if (error) throw error;
      setDocumentRow({ ...documentRow, is_active: false });
      toast.success("PDF ordering disabled.");
    } catch (error) {
      toast.error(humanError(error));
    } finally {
      setBusy(false);
    }
  }

  if (existing.isPending && !documentRow) return <div className="space-y-4"><Skeleton className="h-36 rounded-3xl" /><Skeleton className="h-[70vh] rounded-3xl" /></div>;

  return <div className="space-y-5">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-2xl"><div className="flex items-center gap-2"><Badge variant="secondary">Manual menu builder</Badge><Badge variant="outline">PDF preserved</Badge></div><h1 className="mt-2 text-[30px] font-black tracking-[-0.045em]">{restaurant?.name ?? "Restaurant"} — Interactive Menu</h1><p className="mt-1 text-sm leading-6 text-muted-foreground">Select one product area at a time. AI reads the selected area and fills English/Arabic title, description and price. Save it, then the editor closes so you can continue.</p></div>
      <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={busy} onClick={() => inputRef.current?.click()}><Upload className="size-4" />{documentRow ? "Replace PDF" : "Upload PDF"}</Button>{documentRow?.is_active ? <Button variant="outline" disabled={busy} onClick={() => void disablePdf()}><X className="size-4" />Disable</Button> : null}</div>
      <input ref={inputRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(event) => void handleFile(event.target.files?.[0])} />
    </header>

    <section className="panel overflow-hidden rounded-[28px]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4 sm:p-5"><div className="flex items-center gap-3"><div className="grid size-10 place-items-center rounded-2xl bg-primary/10 text-primary"><MousePointer2 className="size-5" /></div><div><p className="font-bold">Select products directly on the PDF</p><p className="text-xs text-muted-foreground">Drag a rectangle around the whole item. Only your manual selections become clickable.</p></div></div><div className="flex items-center gap-2"><Badge>{savedCount} saved</Badge><Button size="sm" variant={selecting ? "default" : "outline"} disabled={!fileUrl || busy} onClick={() => setSelecting((value) => !value)}><MousePointer2 className="size-4" />{selecting ? "Cancel selection" : "Select product"}</Button></div></div>
      <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="bg-slate-100 p-3 sm:p-6">{!fileUrl ? <button type="button" onClick={() => inputRef.current?.click()} className="grid min-h-[620px] w-full place-items-center rounded-3xl border-2 border-dashed bg-white text-center shadow-sm"><span><Upload className="mx-auto size-10 text-muted-foreground" /><span className="mt-4 block text-lg font-bold">Upload your original PDF menu</span><span className="mt-1 block text-sm text-muted-foreground">Up to 100 MB · the design stays exactly the same</span></span></button> : <div className="mx-auto max-w-4xl"><PdfOverlayPreview canvasRef={canvasRef} candidates={pageCandidates} drafts={drafts} selecting={selecting} onManualSelect={addManualSelection} onOpenCandidate={setActiveCandidate} /></div>}</div>
        <aside className="border-t bg-card p-4 sm:p-5 lg:border-l lg:border-t-0">
          <div className="flex items-start gap-3"><div className="grid size-9 place-items-center rounded-xl bg-muted"><Settings2 className="size-4" /></div><div><p className="font-bold">Menu-wide tax & service</p><p className="text-xs leading-5 text-muted-foreground">These charges apply to the complete order.</p></div></div>
          <div className="mt-4 space-y-3"><div className="rounded-2xl border p-3"><label className="text-xs font-semibold text-muted-foreground">Tax / VAT (%)</label><div className="mt-2 flex items-center gap-2"><Input type="number" min="0" max="100" step="0.01" value={taxRate} onChange={(event) => setTaxRate(Number(event.target.value))} /><span className="text-sm font-semibold">%</span></div><p className="mt-1.5 text-[11px] text-muted-foreground">Use 0 when no tax applies.</p></div><div className="rounded-2xl border p-3"><div className="flex items-center justify-between gap-3"><div><p className="text-sm font-semibold">Service charge</p><p className="text-[11px] text-muted-foreground">Percentage of the order subtotal.</p></div><button type="button" role="switch" aria-checked={serviceEnabled} onClick={() => setServiceEnabled((value) => !value)} className={`relative h-6 w-11 rounded-full transition ${serviceEnabled ? "bg-primary" : "bg-muted"}`}><span className={`absolute top-1 size-4 rounded-full bg-white shadow transition ${serviceEnabled ? "left-6" : "left-1"}`} /></button></div><div className="mt-3 flex items-center gap-2"><Input type="number" min="0" max="100" step="0.01" value={serviceRate} onChange={(event) => setServiceRate(Number(event.target.value))} disabled={!serviceEnabled} /><span className="text-sm font-semibold">%</span></div></div><Button className="w-full" disabled={busy} onClick={() => void saveCharges()}><Save className="size-4" />Save tax & service</Button></div>
          <div className="mt-6 rounded-2xl bg-muted/60 p-4"><p className="text-xs font-bold uppercase tracking-[.12em] text-muted-foreground">Fast workflow</p><ol className="mt-3 space-y-3 text-sm"><li className="flex gap-2"><span className="grid size-5 shrink-0 place-items-center rounded-full bg-background text-xs font-bold">1</span>Click <b>Select product</b>.</li><li className="flex gap-2"><span className="grid size-5 shrink-0 place-items-center rounded-full bg-background text-xs font-bold">2</span>Drag around one complete item.</li><li className="flex gap-2"><span className="grid size-5 shrink-0 place-items-center rounded-full bg-background text-xs font-bold">3</span>AI fills EN + AR details.</li><li className="flex gap-2"><span className="grid size-5 shrink-0 place-items-center rounded-full bg-background text-xs font-bold">4</span>Review → <b>Save & continue</b>.</li></ol></div>
          <div className="mt-4 flex items-center gap-2 rounded-2xl border p-3 text-xs text-muted-foreground"><FileCheck2 className="size-4 shrink-0" /><span>Every saved item is an invisible hotspot over the original PDF.</span></div>
        </aside>
      </div>
      {fileUrl ? <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-3 text-xs text-muted-foreground"><span className="flex min-w-0 items-center gap-2"><FileText className="size-4 shrink-0" /><span className="truncate">{file?.name ?? documentRow?.file_name}</span></span><span>Page {page} / {analysis.page_count}</span><div className="flex gap-1"><Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</Button><Button size="sm" variant="outline" disabled={page >= analysis.page_count} onClick={() => setPage((value) => value + 1)}>Next</Button></div></div> : null}
    </section>

    <div className="grid gap-3 sm:grid-cols-3"><StatusCard icon={<Link2 className="size-4" />} label="Clickable products" value={String(savedCount)} /><StatusCard icon={<FileCheck2 className="size-4" />} label="Original PDF" value={file?.name ?? documentRow?.file_name ?? "Not uploaded"} /><StatusCard icon={<Settings2 className="size-4" />} label="Charges" value={`${taxRate}% tax · ${serviceEnabled ? `${serviceRate}% service` : "service off"}`} /></div>

    <Dialog open={activeCandidate !== null} onOpenChange={(open) => { if (!open && !filling) setActiveCandidate(null); }}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>Product details</DialogTitle><DialogDescription>AI fills both languages from the selected area. Review it, then save. The editor closes automatically so you can select the next product.</DialogDescription></DialogHeader>{activeCandidate ? <ProductEditor product={drafts[activeCandidate.id]} filling={filling} onChange={(patch) => updateDraft(activeCandidate.id, patch)} /> : null}<DialogFooter className="gap-2 sm:justify-between"><Button variant="ghost" disabled={busy || filling} onClick={() => setActiveCandidate(null)}>Cancel</Button><div className="flex gap-2"><Button variant="outline" disabled={busy || filling} onClick={() => void deleteSelectedProduct()}><Trash2 className="size-4" />Delete</Button><Button disabled={busy || filling} onClick={() => void saveSelectedProduct()}><Save className="size-4" />{busy ? "Saving…" : "Save & continue"}</Button></div></DialogFooter></DialogContent></Dialog>
  </div>;
}

function blankProduct(id: string): Product { return { candidate_id: id, name_en: "", name_ar: "", description_en: null, description_ar: null, price: null, currency: null, confidence: 1 }; }

function ProductEditor({ product, filling, onChange }: { product?: Product; filling: boolean; onChange: (patch: Partial<Product>) => void }) {
  const value = product ?? blankProduct("");
  return <div className="space-y-4"><div className="rounded-2xl border bg-muted/40 p-3 text-xs text-muted-foreground">{filling ? <span className="flex items-center gap-2"><Loader2 className="size-4 animate-spin" />Reading the selected area…</span> : "Review the AI-filled details before saving."}</div><div className="grid gap-3 sm:grid-cols-2"><Field label="Product title · English" value={value.name_en} onChange={(v) => onChange({ name_en: v })} /><Field label="اسم المنتج · العربية" value={value.name_ar} dir="rtl" onChange={(v) => onChange({ name_ar: v })} /></div><div className="grid gap-3 sm:grid-cols-[1fr_120px]"><Field label="Price" value={value.price == null ? "" : String(value.price)} type="number" onChange={(v) => onChange({ price: v.trim() === "" ? null : Number(v) })} /><Field label="Currency" value={value.currency ?? ""} onChange={(v) => onChange({ currency: v })} /></div><div><label className="text-xs font-semibold text-muted-foreground">Description · English</label><Textarea className="mt-1.5 min-h-24" value={value.description_en ?? ""} onChange={(event) => onChange({ description_en: event.target.value || null })} placeholder="No description" /></div><div><label className="text-xs font-semibold text-muted-foreground">الوصف · العربية</label><Textarea dir="rtl" className="mt-1.5 min-h-24" value={value.description_ar ?? ""} onChange={(event) => onChange({ description_ar: event.target.value || null })} placeholder="لا يوجد وصف" /></div></div>;
}

function Field({ label, value, onChange, type = "text", dir }: { label: string; value: string; onChange: (value: string) => void; type?: "text" | "number"; dir?: "rtl" }) { return <div><label className="text-xs font-semibold text-muted-foreground">{label}</label><Input dir={dir} type={type} className="mt-1.5" value={value} onChange={(event) => onChange(event.target.value)} /></div>; }
function StatusCard({ icon, label, value }: { icon: ReactNode; label: string; value: string }) { return <div className="panel rounded-2xl p-4"><div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{icon}{label}</div><p className="mt-2 truncate text-sm font-semibold">{value}</p></div>; }

function PdfOverlayPreview({ canvasRef, candidates, drafts, selecting, onManualSelect, onOpenCandidate }: { canvasRef: RefObject<HTMLCanvasElement | null>; candidates: PdfMenuCandidate[]; drafts: Record<string, Product>; selecting: boolean; onManualSelect: (rect: SelectionRect) => void; onOpenCandidate: (candidate: PdfMenuCandidate) => void }) {
  const [selection, setSelection] = useState<SelectionRect | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; pointerId: number } | null>(null);
  function point(event: React.PointerEvent<HTMLDivElement>) { const rect = event.currentTarget.getBoundingClientRect(); return { x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)), y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)) }; }
  function down(event: React.PointerEvent<HTMLDivElement>) { if (!selecting || event.button !== 0) return; const p = point(event); dragRef.current = { startX: p.x, startY: p.y, pointerId: event.pointerId }; event.currentTarget.setPointerCapture(event.pointerId); setSelection({ x: p.x, y: p.y, width: 0, height: 0 }); }
  function move(event: React.PointerEvent<HTMLDivElement>) { const drag = dragRef.current; if (!selecting || !drag || drag.pointerId !== event.pointerId) return; const p = point(event); setSelection({ x: Math.min(drag.startX, p.x), y: Math.min(drag.startY, p.y), width: Math.abs(p.x - drag.startX), height: Math.abs(p.y - drag.startY) }); }
  function up(event: React.PointerEvent<HTMLDivElement>) { const drag = dragRef.current; if (!selecting || !drag || drag.pointerId !== event.pointerId) return; dragRef.current = null; const p = point(event); const rect = { x: Math.min(drag.startX, p.x), y: Math.min(drag.startY, p.y), width: Math.abs(p.x - drag.startX), height: Math.abs(p.y - drag.startY) }; setSelection(null); if (rect.width < 0.01 || rect.height < 0.01) { toast.info("Drag around the full product area."); return; } onManualSelect(rect); }
  return <div className={`relative overflow-hidden rounded-2xl bg-white shadow-sm ${selecting ? "cursor-crosshair select-none touch-none" : ""}`} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={() => { dragRef.current = null; setSelection(null); }}><canvas ref={canvasRef} className="block h-auto w-full" /><div className="pointer-events-none absolute inset-0">{candidates.map((candidate) => <button key={candidate.id} type="button" disabled={selecting} onClick={() => onOpenCandidate(candidate)} className={`pointer-events-auto absolute rounded-lg border-2 ${drafts[candidate.id] ? "border-emerald-500 bg-emerald-500/10" : "border-primary/30 bg-primary/5"}`} style={{ left: `${candidate.x * 100}%`, top: `${candidate.y * 100}%`, width: `${candidate.width * 100}%`, height: `${candidate.height * 100}%` }} aria-label="Open saved product"><span className="sr-only">Saved product</span></button>)}</div>{selecting ? <div className="pointer-events-none absolute left-3 top-3 rounded-full bg-background/95 px-3 py-1.5 text-xs font-bold shadow ring-1 ring-border">Drag to select one product</div> : null}{selection ? <div className="pointer-events-none absolute rounded-lg border-2 border-primary bg-primary/15" style={{ left: `${selection.x * 100}%`, top: `${selection.y * 100}%`, width: `${selection.width * 100}%`, height: `${selection.height * 100}%` }} /> : null}</div>;
}
