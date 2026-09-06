import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FileCheck2, FileText, Link2, Loader2, MousePointer2, Save, Sparkles, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useRestaurant } from "@/hooks/useSuperAdmin";
import { humanError } from "@/lib/errors";
import { logAudit } from "@/lib/audit";
import { extractPdfProducts } from "@/lib/pdf-menu.functions";
import { analyzePdfFile, fetchPdfBytes, openPdf, renderPdfPage, type PdfMenuAnalysis, type PdfMenuCandidate } from "@/lib/pdf-menu";
import { MAX_PDF_BYTES, uploadRestaurantPdf } from "@/lib/storage";

type ExtractedProduct = { candidate_id: string; name_en: string; name_ar: string; description_en: string | null; description_ar: string | null; price: number | null; currency: string | null; confidence: number };
type LinkDraft = { enabled: boolean; productId?: string; product: ExtractedProduct };
type PdfDocument = { id: string; file_url: string; file_parts?: string[]; file_name: string; page_count: number; analysis: PdfMenuAnalysis; is_active: boolean };
const EMPTY_ANALYSIS: PdfMenuAnalysis = { page_count: 0, pages: [], candidates: [] };

export function PdfMenuManager({ restaurantId }: { restaurantId: string }) {
  const { data: restaurant } = useRestaurant(restaurantId);
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [documentRow, setDocumentRow] = useState<PdfDocument | null>(null);
  const [analysis, setAnalysis] = useState<PdfMenuAnalysis>(EMPTY_ANALYSIS);
  const [extracted, setExtracted] = useState<Record<string, ExtractedProduct>>({});
  const [file, setFile] = useState<File | null>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [fileParts, setFileParts] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [links, setLinks] = useState<Record<string, LinkDraft>>({});
  const [busy, setBusy] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [search, setSearch] = useState("");
  const runExtract = useServerFn(extractPdfProducts);

  const existing = useQuery<PdfDocument | null>({
    queryKey: ["platform", "pdf-document", restaurantId],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("menu_pdf_documents").select("id, file_url, file_parts, file_name, page_count, analysis, is_active").eq("restaurant_id", restaurantId).maybeSingle();
      if (error) throw error;
      return data as PdfDocument | null;
    },
  });

  useEffect(() => {
    if (!existing.data || documentRow || file) return;
    setDocumentRow(existing.data); setAnalysis(existing.data.analysis ?? EMPTY_ANALYSIS); setFileUrl(existing.data.file_url); setFileParts(existing.data.file_parts ?? []);
  }, [existing.data, documentRow, file]);

  useEffect(() => {
    let cancelled = false;
    async function loadExistingLinks() {
      if (!existing.data || file) return;
      const { data, error } = await (supabase as any).from("menu_pdf_item_links").select("candidate_id, label, menu_item_id").eq("document_id", existing.data.id).eq("restaurant_id", restaurantId).eq("is_active", true);
      if (cancelled || error) return;
      const rows = (data ?? []) as Array<{ candidate_id?: string | null; label: string | null; menu_item_id: string }>;
      const ids = rows.map((row) => row.menu_item_id).filter(Boolean);
      if (!ids.length) return;
      const { data: products } = await supabase.from("menu_items").select("id, name_en, name_ar, description_en, description_ar, price").in("id", ids);
      const productById = new Map((products ?? []).map((row: any) => [row.id, row]));
      const next: Record<string, LinkDraft> = {};
      for (const row of rows) {
        const candidate = row.candidate_id ? (existing.data.analysis?.candidates ?? []).find((item) => item.id === row.candidate_id) : (existing.data.analysis?.candidates ?? []).find((item) => item.text === row.label);
        const product = productById.get(row.menu_item_id);
        if (!candidate || !product) continue;
        next[candidate.id] = { enabled: true, productId: product.id, product: { candidate_id: candidate.id, name_en: product.name_en ?? "", name_ar: product.name_ar ?? "", description_en: product.description_en ?? null, description_ar: product.description_ar ?? null, price: product.price === null ? null : Number(product.price), currency: null, confidence: 1 } };
      }
      if (!cancelled) setLinks(next);
    }
    void loadExistingLinks();
    return () => { cancelled = true; };
  }, [existing.data, restaurantId, file]);

  useEffect(() => {
    let disposed = false;
    async function draw() {
      if (!canvasRef.current || !fileUrl || !analysis.page_count) return;
      try { const pdf = await openPdf(await fetchPdfBytes(fileUrl, fileParts)); if (!disposed) await renderPdfPage(pdf, page, canvasRef.current, 1200); }
      catch (error) { if (!disposed) toast.error(humanError(error)); }
    }
    void draw(); return () => { disposed = true; };
  }, [fileUrl, fileParts, page, analysis.page_count]);

  const pageCandidates = useMemo(() => analysis.candidates.filter((candidate) => candidate.page_number === page), [analysis.candidates, page]);
  const visibleCandidates = useMemo(() => { const needle = search.trim().toLowerCase(); return needle ? analysis.candidates.filter((candidate) => candidate.text.toLowerCase().includes(needle)) : analysis.candidates; }, [analysis.candidates, search]);
  const enabledCount = Object.values(links).filter((link) => link.enabled).length;

  async function analyzeCandidates(candidates: PdfMenuCandidate[]) {
    if (!candidates.length) return;
    setAnalyzing(true);
    try {
      const result = await runExtract({ data: { restaurantId, candidates } });
      const next: Record<string, ExtractedProduct> = {};
      for (const product of result.products ?? []) next[product.candidate_id] = product;
      setExtracted(next);
      setLinks((previous) => {
        const merged: Record<string, LinkDraft> = {};
        for (const candidate of candidates) { const product = next[candidate.id]; if (!product) continue; merged[candidate.id] = previous[candidate.id] ?? { enabled: false, product }; merged[candidate.id].product = product; }
        return merged;
      });
      toast.success(result.ai ? "Smart analysis completed. Review the extracted details before enabling items." : "PDF analysis completed. Review the detected details before enabling items.");
    } catch (error) { toast.error(humanError(error)); }
    finally { setAnalyzing(false); }
  }

  async function handleFile(nextFile: File | undefined) {
    if (!nextFile) return;
    if (nextFile.type !== "application/pdf" && !nextFile.name.toLowerCase().endsWith(".pdf")) { toast.error("Please upload a PDF menu."); return; }
    if (nextFile.size > MAX_PDF_BYTES) { toast.error("PDF is too large. Maximum allowed size is 100 MB."); return; }
    setBusy(true);
    try {
      const { analysis: nextAnalysis } = await analyzePdfFile(nextFile);
      const uploaded = await uploadRestaurantPdf(restaurantId, nextFile);
      setFile(nextFile); setFileUrl(uploaded.url); setFileParts(uploaded.parts); setAnalysis(nextAnalysis); setDocumentRow(null); setExtracted({}); setLinks({}); setPage(1);
      toast.success(`Found ${nextAnalysis.candidates.length} PDF lines across ${nextAnalysis.page_count} pages.`);
      await analyzeCandidates(nextAnalysis.candidates);
    } catch (error) { toast.error(humanError(error)); }
    finally { setBusy(false); if (inputRef.current) inputRef.current.value = ""; }
  }

  function toggle(candidate: PdfMenuCandidate) {
    const product = extracted[candidate.id] ?? { candidate_id: candidate.id, name_en: /[A-Za-z]/.test(candidate.text) ? candidate.text : "", name_ar: /[\u0600-\u06FF]/.test(candidate.text) ? candidate.text : "", description_en: null, description_ar: null, price: null, currency: null, confidence: candidate.confidence };
    setLinks((previous) => ({ ...previous, [candidate.id]: { enabled: !(previous[candidate.id]?.enabled ?? false), productId: previous[candidate.id]?.productId, product: previous[candidate.id]?.product ?? product } }));
  }

  function edit(candidateId: string, patch: Partial<ExtractedProduct>) {
    setLinks((previous) => { const current = previous[candidateId]; if (!current) return previous; return { ...previous, [candidateId]: { ...current, product: { ...current.product, ...patch } } }; });
  }

  async function save() {
    if (!restaurant || !fileUrl || !analysis.page_count || enabledCount === 0) return;
    setBusy(true);
    try {
      const payload = { restaurant_id: restaurantId, file_url: fileUrl, file_parts: fileParts, file_name: file?.name ?? documentRow?.file_name ?? "menu.pdf", page_count: analysis.page_count, analysis, is_active: true };
      let documentId = documentRow?.id;
      if (documentId) { const { error } = await (supabase as any).from("menu_pdf_documents").update(payload).eq("id", documentId).eq("restaurant_id", restaurantId); if (error) throw error; }
      else { const { data, error } = await (supabase as any).from("menu_pdf_documents").upsert(payload, { onConflict: "restaurant_id" }).select("id").single(); if (error) throw error; documentId = data.id; }

      const { data: oldLinks, error: oldLinkError } = await (supabase as any).from("menu_pdf_item_links").select("candidate_id, label, menu_item_id").eq("document_id", documentId).eq("restaurant_id", restaurantId).eq("is_active", true);
      if (oldLinkError) throw oldLinkError;
      const existingByCandidate = new Map<string, string>();
      for (const row of (oldLinks ?? []) as Array<{ candidate_id?: string | null; label: string | null; menu_item_id: string }>) { const candidate = row.candidate_id ? analysis.candidates.find((item) => item.id === row.candidate_id) : analysis.candidates.find((item) => item.text === row.label); if (candidate) existingByCandidate.set(candidate.id, row.menu_item_id); }
      await (supabase as any).from("menu_pdf_item_links").update({ is_active: false }).eq("document_id", documentId).eq("restaurant_id", restaurantId).eq("is_active", true);

      const linkRows: any[] = [];
      for (const candidate of analysis.candidates) {
        const draft = links[candidate.id];
        if (!draft?.enabled) continue;
        const p = draft.product;
        const nameEn = p.name_en.trim() || p.name_ar.trim();
        const nameAr = p.name_ar.trim() || p.name_en.trim();
        if (!nameEn && !nameAr) continue;
        let productId = draft.productId ?? existingByCandidate.get(candidate.id);
        const productPayload = { restaurant_id: restaurantId, name_en: nameEn, name_ar: nameAr, description_en: p.description_en?.trim() || null, description_ar: p.description_ar?.trim() || null, price: Number.isFinite(p.price as number) ? p.price : 0, is_available: true };
        if (productId) { const { error } = await supabase.from("menu_items").update(productPayload).eq("id", productId).eq("restaurant_id", restaurantId); if (error) throw error; }
        else { const { data, error } = await supabase.from("menu_items").insert(productPayload).select("id").single(); if (error) throw error; productId = data.id; }
        linkRows.push({ document_id: documentId, restaurant_id: restaurantId, menu_item_id: productId, candidate_id: candidate.id, page_number: candidate.page_number, x: candidate.x, y: candidate.y, width: candidate.width, height: candidate.height, label: candidate.text, source: "pdf-extraction", is_active: true });
      }
      if (linkRows.length) { const { error } = await (supabase as any).from("menu_pdf_item_links").insert(linkRows); if (error) throw error; }
      await logAudit("menu.pdf_published", { restaurantId, entity: "menu_pdf_documents", entityId: documentId, metadata: { links: linkRows.length, pages: analysis.page_count, extracted: true } });
      setDocumentRow({ id: documentId, ...payload } as PdfDocument);
      await queryClient.invalidateQueries({ queryKey: ["platform", "pdf-document", restaurantId] });
      toast.success(`${linkRows.length} clickable products saved. Non-clickable PDF lines were ignored.`);
    } catch (error) { toast.error(humanError(error)); }
    finally { setBusy(false); }
  }

  async function disablePdf() { if (!documentRow) return; setBusy(true); try { const { error } = await (supabase as any).from("menu_pdf_documents").update({ is_active: false }).eq("id", documentRow.id).eq("restaurant_id", restaurantId); if (error) throw error; setDocumentRow({ ...documentRow, is_active: false }); toast.success("PDF ordering disabled. Your products remain unchanged."); } catch (error) { toast.error(humanError(error)); } finally { setBusy(false); } }

  if (existing.isPending && !documentRow) return <div className="space-y-4"><Skeleton className="h-40 rounded-3xl"/><Skeleton className="h-96 rounded-3xl"/></div>;
  return <div className="space-y-5">
    <header className="flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-[28px] font-bold tracking-[-0.04em]">{restaurant?.name ?? "Restaurant"} — PDF Menu</h1><p className="mt-1 max-w-2xl text-sm text-muted-foreground">Upload the exact menu artwork. QuickServe analyzes only the PDF, then you decide which lines become clickable products.</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" disabled={busy || analyzing} onClick={() => inputRef.current?.click()}><Upload className="size-4"/>{documentRow ? "Replace PDF" : "Upload PDF"}</Button>{documentRow?.is_active ? <Button variant="outline" disabled={busy || analyzing} onClick={() => void disablePdf()}><X className="size-4"/>Disable</Button> : null}<Button disabled={busy || analyzing || !fileUrl || enabledCount === 0} onClick={() => void save()}><Save className="size-4"/>{busy ? "Saving…" : "Publish clickable menu"}</Button></div><input ref={inputRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(event) => void handleFile(event.target.files?.[0])}/></header>
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(340px,.75fr)]">
      <section className="panel overflow-hidden rounded-3xl"><div className="flex flex-wrap items-center justify-between gap-3 border-b p-4"><div className="flex items-center gap-2"><FileText className="size-5 text-primary"/><div><p className="font-semibold">Original PDF preview</p><p className="text-xs text-muted-foreground">The artwork stays exactly as uploaded.</p></div></div><div className="flex items-center gap-2"><Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</Button><span className="text-xs font-semibold tabular-nums">Page {page} / {analysis.page_count || 0}</span><Button size="sm" variant="outline" disabled={page >= analysis.page_count} onClick={() => setPage((value) => value + 1)}>Next</Button></div></div><div className="bg-slate-100 p-3 sm:p-6">{!fileUrl ? <button type="button" onClick={() => inputRef.current?.click()} className="grid min-h-[520px] w-full place-items-center rounded-2xl border-2 border-dashed bg-white text-center"><span><Upload className="mx-auto size-9 text-muted-foreground"/><span className="mt-3 block font-semibold">Upload the restaurant PDF</span><span className="mt-1 block text-sm text-muted-foreground">PDF menus up to 100 MB are supported.</span></span></button> : <PdfOverlayPreview canvasRef={canvasRef} candidates={pageCandidates} links={links} onSelect={(candidate) => setPage(candidate.page_number)}/>}</div></section>
      <aside className="panel rounded-3xl p-4 sm:p-5"><div className="flex items-start justify-between gap-3"><div><div className="flex items-center gap-2"><MousePointer2 className="size-4 text-primary"/><h2 className="font-bold">Select products</h2></div><p className="mt-1 text-xs leading-5 text-muted-foreground">Your existing product catalog is not used here. Turn a PDF line ON only if you want that exact line to become a product.</p></div><Badge variant="secondary">{enabledCount} clickable</Badge></div>
        <div className="mt-4 flex gap-2"><Input placeholder="Find a PDF line…" value={search} onChange={(event) => setSearch(event.target.value)}/><Button size="icon" variant="outline" disabled={analyzing || !analysis.candidates.length} title="Analyze PDF" onClick={() => void analyzeCandidates(analysis.candidates)}>{analyzing ? <Loader2 className="size-4 animate-spin"/> : <Sparkles className="size-4"/>}</Button></div>
        <div className="mt-4 max-h-[620px] space-y-3 overflow-y-auto pr-1">{visibleCandidates.length === 0 ? <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">Upload and analyze a PDF to see its detected lines.</div> : visibleCandidates.map((candidate) => { const draft = links[candidate.id]; const product = draft?.product ?? extracted[candidate.id]; const enabled = Boolean(draft?.enabled); return <div key={candidate.id} className={`rounded-2xl border p-3 transition ${enabled ? "border-primary bg-primary/5" : "bg-card"}`}><div className="flex items-start gap-3"><button type="button" className="min-w-0 flex-1 text-left" onClick={() => setPage(candidate.page_number)}><div className="flex items-center gap-2"><span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">P{candidate.page_number}</span>{enabled ? <Badge className="bg-emerald-50 text-emerald-700 hover:bg-emerald-50">Clickable</Badge> : <Badge variant="outline">Not clickable</Badge>}</div><p className="mt-1 text-sm font-semibold leading-5">{candidate.text}</p></button><span className="text-[10px] tabular-nums text-muted-foreground">{Math.round((product?.confidence ?? candidate.confidence) * 100)}%</span></div><div className="mt-3 flex items-center justify-between rounded-xl border bg-background px-3 py-2"><span className="text-sm font-semibold">Clickable</span><button type="button" role="switch" aria-checked={enabled} onClick={() => toggle(candidate)} className={`relative h-6 w-11 rounded-full transition ${enabled ? "bg-primary" : "bg-muted"}`}><span className={`absolute top-1 size-4 rounded-full bg-white shadow transition ${enabled ? "left-6" : "left-1"}`}/></button></div>{enabled && product ? <div className="mt-3 space-y-3 rounded-2xl bg-background p-3 ring-1 ring-border"><div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground"><Sparkles className="size-3.5"/> Extracted from this PDF line — review before saving</div><Field label="Name (English)" value={product.name_en} onChange={(value) => edit(candidate.id, { name_en: value })}/><Field label="Name (Arabic)" value={product.name_ar} onChange={(value) => edit(candidate.id, { name_ar: value })}/><div className="grid grid-cols-[1fr_100px] gap-2"><Field label="Price" value={product.price === null ? "" : String(product.price)} onChange={(value) => edit(candidate.id, { price: value.trim() === "" ? null : Number(value) })} type="number"/><Field label="Currency" value={product.currency ?? ""} onChange={(value) => edit(candidate.id, { currency: value })}/></div><div><label className="text-xs font-medium text-muted-foreground">Description (English)</label><Textarea className="mt-1.5 min-h-16" value={product.description_en ?? ""} onChange={(event) => edit(candidate.id, { description_en: event.target.value || null })} placeholder="Not detected — leave empty if unavailable"/></div><div><label className="text-xs font-medium text-muted-foreground">Description (Arabic)</label><Textarea dir="rtl" className="mt-1.5 min-h-16" value={product.description_ar ?? ""} onChange={(event) => edit(candidate.id, { description_ar: event.target.value || null })} placeholder="لم يتم اكتشاف وصف — اتركه فارغًا إذا غير موجود"/></div></div> : null}</div>; })}</div>
      </aside>
    </div>
    <div className="grid gap-3 sm:grid-cols-3"><StatusCard icon={<FileCheck2 className="size-4"/>} label="PDF" value={file?.name ?? documentRow?.file_name ?? "Not uploaded"}/><StatusCard icon={<Link2 className="size-4"/>} label="Clickable products" value={`${enabledCount} / ${analysis.candidates.length || 0}`}/><StatusCard icon={<Sparkles className="size-4"/>} label="Smart extraction" value={analyzing ? "Analyzing…" : analysis.candidates.length ? "Ready for review" : "Waiting for PDF"}/></div>
  </div>;
}

function Field({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: "text" | "number" }) { return <div><label className="text-xs font-medium text-muted-foreground">{label}</label><Input type={type} className="mt-1.5" value={value} onChange={(event) => onChange(event.target.value)}/></div>; }
function StatusCard({ icon, label, value }: { icon: ReactNode; label: string; value: string }) { return <div className="panel rounded-2xl p-4"><div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{icon}{label}</div><p className="mt-2 truncate text-sm font-semibold">{value}</p></div>; }
function PdfOverlayPreview({ canvasRef, candidates, links, onSelect }: { canvasRef: RefObject<HTMLCanvasElement | null>; candidates: PdfMenuCandidate[]; links: Record<string, LinkDraft>; onSelect: (candidate: PdfMenuCandidate) => void }) { return <div className="relative mx-auto w-full max-w-3xl overflow-hidden rounded-xl bg-white shadow-sm"><canvas ref={canvasRef} className="block h-auto w-full"/><div className="absolute inset-0">{candidates.map((candidate) => { const enabled = links[candidate.id]?.enabled; return <button key={candidate.id} type="button" aria-label={`${enabled ? "Clickable" : "Not clickable"}: ${candidate.text}`} onClick={() => onSelect(candidate)} className={`absolute rounded-md border-2 transition ${enabled ? "border-emerald-500 bg-emerald-500/10" : "border-transparent bg-transparent hover:border-primary/50 hover:bg-primary/5"}`} style={{ left: `${candidate.x * 100}%`, top: `${candidate.y * 100}%`, width: `${candidate.width * 100}%`, height: `${candidate.height * 100}%` }}><span className="sr-only">{candidate.text}</span></button>; })}</div></div>; }
