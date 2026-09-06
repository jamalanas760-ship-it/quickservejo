import { useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent, ReactNode, RefObject } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileCheck2, FileText, Link2, MousePointer2, Save, Upload, X } from "lucide-react";
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
import { fetchPdfBytes, openPdf, renderPdfPage, type PdfMenuAnalysis, type PdfMenuCandidate } from "@/lib/pdf-menu";
import { MAX_PDF_BYTES, uploadRestaurantPdf } from "@/lib/storage";

type Product = {
  candidate_id: string;
  name_en: string;
  name_ar: string;
  description_en: string | null;
  description_ar: string | null;
  price: number | null;
  currency: string | null;
  confidence: number;
};
type Draft = { enabled: boolean; productId?: string; product: Product };
type PdfDocument = {
  id: string;
  file_url: string;
  file_parts?: string[];
  file_name: string;
  page_count: number;
  analysis: PdfMenuAnalysis;
  is_active: boolean;
};
type SelectionRect = { x: number; y: number; width: number; height: number };
const EMPTY: PdfMenuAnalysis = { page_count: 0, pages: [], candidates: [] };

function manualCandidates(analysis: PdfMenuAnalysis | null | undefined): PdfMenuCandidate[] {
  return (analysis?.candidates ?? []).filter((candidate) => candidate.id.startsWith("manual-"));
}

export function PdfMenuManager({ restaurantId }: { restaurantId: string }) {
  const { data: restaurant } = useRestaurant(restaurantId);
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [documentRow, setDocumentRow] = useState<PdfDocument | null>(null);
  const [analysis, setAnalysis] = useState<PdfMenuAnalysis>(EMPTY);
  const [products, setProducts] = useState<Record<string, Product>>({});
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [file, setFile] = useState<File | null>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [fileParts, setFileParts] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [manualMode, setManualMode] = useState(false);

  const existing = useQuery<PdfDocument | null>({
    queryKey: ["platform", "pdf-document", restaurantId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("menu_pdf_documents")
        .select("id,file_url,file_parts,file_name,page_count,analysis,is_active")
        .eq("restaurant_id", restaurantId)
        .maybeSingle();
      if (error) throw error;
      return data as PdfDocument | null;
    },
  });

  useEffect(() => {
    if (!existing.data || documentRow || file) return;
    const storedAnalysis = existing.data.analysis ?? EMPTY;
    const manualOnly: PdfMenuAnalysis = {
      ...storedAnalysis,
      candidates: manualCandidates(storedAnalysis),
    };
    setDocumentRow(existing.data);
    setAnalysis(manualOnly);
    setFileUrl(existing.data.file_url);
    setFileParts(existing.data.file_parts ?? []);
  }, [existing.data, documentRow, file]);

  useEffect(() => {
    let cancelled = false;
    async function loadLinks() {
      if (!existing.data || file) return;

      // Keep the old catalog records, but immediately remove every automatic PDF hotspot.
      await (supabase as any)
        .from("menu_pdf_item_links")
        .update({ is_active: false })
        .eq("document_id", existing.data.id)
        .eq("restaurant_id", restaurantId)
        .eq("is_active", true)
        .not("candidate_id", "like", "manual-%");

      const { data, error } = await (supabase as any)
        .from("menu_pdf_item_links")
        .select("candidate_id,label,menu_item_id")
        .eq("document_id", existing.data.id)
        .eq("restaurant_id", restaurantId)
        .eq("is_active", true);
      if (error) {
        if (!cancelled) toast.error(humanError(error));
        return;
      }

      const rows = (data ?? []) as Array<{ candidate_id?: string | null; label: string | null; menu_item_id: string }>;
      const manualRows = rows.filter((row) => row.candidate_id?.startsWith("manual-"));
      if (!manualRows.length) {
        if (!cancelled) setDrafts({});
        return;
      }

      const { data: items, error: itemsError } = await supabase
        .from("menu_items")
        .select("id,name_en,name_ar,description_en,description_ar,price")
        .in("id", manualRows.map((row) => row.menu_item_id));
      if (itemsError) {
        if (!cancelled) toast.error(humanError(itemsError));
        return;
      }

      const byId = new Map((items ?? []).map((item: any) => [item.id, item]));
      const next: Record<string, Draft> = {};
      for (const row of manualRows) {
        const candidate = row.candidate_id
          ? manualCandidates(existing.data.analysis).find((candidate) => candidate.id === row.candidate_id)
          : null;
        const item: any = byId.get(row.menu_item_id);
        if (!candidate || !item) continue;
        next[candidate.id] = {
          enabled: true,
          productId: item.id,
          product: {
            candidate_id: candidate.id,
            name_en: item.name_en ?? "",
            name_ar: item.name_ar ?? "",
            description_en: item.description_en ?? null,
            description_ar: item.description_ar ?? null,
            price: item.price == null ? null : Number(item.price),
            currency: null,
            confidence: 1,
          },
        };
      }
      if (!cancelled) setDrafts(next);
    }
    void loadLinks();
    return () => {
      cancelled = true;
    };
  }, [existing.data, restaurantId, file]);

  useEffect(() => {
    let cancelled = false;
    async function draw() {
      if (!canvasRef.current || !fileUrl || !analysis.page_count) return;
      try {
        const pdf = await openPdf(await fetchPdfBytes(fileUrl, fileParts));
        if (!cancelled) await renderPdfPage(pdf, page, canvasRef.current, 1200);
      } catch (error) {
        if (!cancelled) toast.error(humanError(error));
      }
    }
    void draw();
    return () => {
      cancelled = true;
    };
  }, [fileUrl, fileParts, page, analysis.page_count]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q
      ? analysis.candidates.filter((candidate) =>
          (products[candidate.id]?.name_en || products[candidate.id]?.name_ar || "").toLowerCase().includes(q),
        )
      : analysis.candidates;
  }, [analysis.candidates, products, search]);
  const pageCandidates = useMemo(
    () => analysis.candidates.filter((candidate) => candidate.page_number === page),
    [analysis.candidates, page],
  );
  const enabledCount = Object.values(drafts).filter((draft) => draft.enabled).length;

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

    setBusy(true);
    try {
      const buffer = await nextFile.arrayBuffer();
      const pdf = await openPdf(buffer);
      const uploaded = await uploadRestaurantPdf(restaurantId, nextFile);
      const nextAnalysis: PdfMenuAnalysis = {
        page_count: pdf.numPages,
        pages: [],
        candidates: [],
      };

      setFile(nextFile);
      setFileUrl(uploaded.url);
      setFileParts(uploaded.parts);
      setDocumentRow(null);
      setAnalysis(nextAnalysis);
      setProducts({});
      setDrafts({});
      setPage(1);
      setManualMode(true);
      toast.success(
        `${pdf.numPages} PDF page${pdf.numPages === 1 ? "" : "s"} ready. Select each item area manually to make it clickable.`,
      );
    } catch (error) {
      toast.error(humanError(error));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function edit(id: string, patch: Partial<Product>) {
    setDrafts((current) => {
      const previous = current[id];
      if (!previous) return current;
      return { ...current, [id]: { ...previous, product: { ...previous.product, ...patch } } };
    });
    setProducts((current) => (current[id] ? { ...current, [id]: { ...current[id], ...patch } } : current));
  }

  function removeManualSelection(id: string) {
    setAnalysis((current) => ({ ...current, candidates: current.candidates.filter((candidate) => candidate.id !== id) }));
    setProducts((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    setDrafts((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    toast.success("Clickable area removed. Publish to apply the change.");
  }

  function addManualSelection(rect: SelectionRect) {
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
    const product: Product = {
      candidate_id: id,
      name_en: "",
      name_ar: "",
      description_en: null,
      description_ar: null,
      price: null,
      currency: null,
      confidence: 1,
    };
    setAnalysis((current) => ({
      ...current,
      candidates: [...current.candidates, candidate].sort(
        (a, b) => a.page_number - b.page_number || a.y - b.y || a.x - b.x,
      ),
    }));
    setProducts((current) => ({ ...current, [id]: product }));
    setDrafts((current) => ({ ...current, [id]: { enabled: true, product } }));
    setManualMode(false);
    toast.success("Area selected. Enter the item name and price.");
  }

  async function save() {
    if (!restaurant || !fileUrl || !analysis.page_count || !enabledCount) return;
    setBusy(true);
    try {
      const payload = {
        restaurant_id: restaurantId,
        file_url: fileUrl,
        file_parts: fileParts,
        file_name: file?.name ?? documentRow?.file_name ?? "menu.pdf",
        page_count: analysis.page_count,
        analysis: { ...analysis, candidates: manualCandidates(analysis) },
        is_active: true,
      };
      let documentId = documentRow?.id;
      if (documentId) {
        const { error } = await (supabase as any)
          .from("menu_pdf_documents")
          .update(payload)
          .eq("id", documentId)
          .eq("restaurant_id", restaurantId);
        if (error) throw error;
      } else {
        const { data, error } = await (supabase as any)
          .from("menu_pdf_documents")
          .upsert(payload, { onConflict: "restaurant_id" })
          .select("id")
          .single();
        if (error) throw error;
        documentId = data.id;
      }

      const { error: deactivateError } = await (supabase as any)
        .from("menu_pdf_item_links")
        .update({ is_active: false })
        .eq("document_id", documentId)
        .eq("restaurant_id", restaurantId)
        .eq("is_active", true);
      if (deactivateError) throw deactivateError;

      const rows: any[] = [];
      for (const candidate of manualCandidates(analysis)) {
        const draft = drafts[candidate.id];
        if (!draft?.enabled) continue;
        const p = draft.product;
        const nameEn = p.name_en.trim() || p.name_ar.trim();
        const nameAr = p.name_ar.trim() || p.name_en.trim();
        if (!nameEn) continue;

        const productPayload = {
          restaurant_id: restaurantId,
          name_en: nameEn,
          name_ar: nameAr,
          description_en: p.description_en?.trim() || null,
          description_ar: p.description_ar?.trim() || null,
          price: p.price == null || !Number.isFinite(p.price) ? 0 : p.price,
          is_available: true,
        };

        let productId = draft.productId;
        if (productId) {
          const { error } = await supabase
            .from("menu_items")
            .update(productPayload)
            .eq("id", productId)
            .eq("restaurant_id", restaurantId);
          if (error) throw error;
        } else {
          const { data, error } = await supabase.from("menu_items").insert(productPayload).select("id").single();
          if (error) throw error;
          productId = data.id;
        }

        rows.push({
          document_id: documentId,
          restaurant_id: restaurantId,
          menu_item_id: productId,
          candidate_id: candidate.id,
          page_number: candidate.page_number,
          x: candidate.x,
          y: candidate.y,
          width: candidate.width,
          height: candidate.height,
          label: candidate.text,
          source: "manual-selection",
          is_active: true,
        });
      }

      if (rows.length) {
        const { error } = await (supabase as any).from("menu_pdf_item_links").insert(rows);
        if (error) throw error;
      }

      await logAudit("menu.pdf_published", {
        restaurantId,
        entity: "menu_pdf_documents",
        entityId: documentId,
        metadata: { links: rows.length, pages: analysis.page_count, extracted: false, verified: false, source: "manual-selection" },
      });

      setDocumentRow({ id: documentId, ...payload } as PdfDocument);
      setAnalysis(payload.analysis);
      await queryClient.invalidateQueries({ queryKey: ["platform", "pdf-document", restaurantId] });
      toast.success(`${rows.length} manual clickable product${rows.length === 1 ? "" : "s"} saved.`);
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
      const { error } = await (supabase as any)
        .from("menu_pdf_documents")
        .update({ is_active: false })
        .eq("id", documentRow.id)
        .eq("restaurant_id", restaurantId);
      if (error) throw error;
      setDocumentRow({ ...documentRow, is_active: false });
      toast.success("PDF ordering disabled.");
    } catch (error) {
      toast.error(humanError(error));
    } finally {
      setBusy(false);
    }
  }

  if (existing.isPending && !documentRow) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-40 rounded-3xl" />
        <Skeleton className="h-96 rounded-3xl" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[28px] font-bold tracking-[-0.04em]">{restaurant?.name ?? "Restaurant"} — PDF Menu</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Manual selection only. The original PDF stays unchanged. Drag over each product area, enter its details, then publish.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={busy} onClick={() => inputRef.current?.click()}>
            <Upload className="size-4" />
            {documentRow ? "Replace PDF" : "Upload PDF"}
          </Button>
          {documentRow?.is_active ? (
            <Button variant="outline" disabled={busy} onClick={() => void disablePdf()}>
              <X className="size-4" />
              Disable
            </Button>
          ) : null}
          <Button disabled={busy || !fileUrl || !enabledCount} onClick={() => void save()}>
            <Save className="size-4" />
            {busy ? "Saving…" : "Publish clickable menu"}
          </Button>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          onChange={(event) => void handleFile(event.target.files?.[0])}
        />
      </header>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(340px,.75fr)]">
        <section className="panel overflow-hidden rounded-3xl">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
            <div className="flex items-center gap-2">
              <FileText className="size-5 text-primary" />
              <div>
                <p className="font-semibold">Original PDF preview</p>
                <p className="text-xs text-muted-foreground">No automatic product detection or hotspots.</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant={manualMode ? "default" : "outline"}
                disabled={!fileUrl || busy}
                onClick={() => setManualMode((value) => !value)}
              >
                <MousePointer2 className="size-4" />
                {manualMode ? "Cancel selection" : "Select area"}
              </Button>
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>
                Previous
              </Button>
              <span className="text-xs font-semibold">Page {page} / {analysis.page_count || 0}</span>
              <Button size="sm" variant="outline" disabled={page >= analysis.page_count} onClick={() => setPage((value) => value + 1)}>
                Next
              </Button>
            </div>
          </div>
          {manualMode ? (
            <div className="border-b bg-primary/5 px-4 py-2 text-xs font-medium text-primary">
              Drag a rectangle around the full menu item. Release to create its clickable area.
            </div>
          ) : null}
          <div className="bg-slate-100 p-3 sm:p-6">
            {!fileUrl ? (
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="grid min-h-[520px] w-full place-items-center rounded-2xl border-2 border-dashed bg-white text-center"
              >
                <span>
                  <Upload className="mx-auto size-9 text-muted-foreground" />
                  <span className="mt-3 block font-semibold">Upload the restaurant PDF</span>
                  <span className="mt-1 block text-sm text-muted-foreground">PDF menus up to 100 MB are supported.</span>
                </span>
              </button>
            ) : (
              <PdfOverlayPreview
                canvasRef={canvasRef}
                candidates={pageCandidates}
                drafts={drafts}
                manualMode={manualMode}
                onSelect={(candidate) => setPage(candidate.page_number)}
                onManualSelect={addManualSelection}
              />
            )}
          </div>
        </section>

        <aside className="panel rounded-3xl p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <MousePointer2 className="size-4 text-primary" />
                <h2 className="font-bold">Manual clickable items</h2>
              </div>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Select exactly the areas you want customers to tap. Nothing is auto-selected.
              </p>
            </div>
            <Badge variant="secondary">{enabledCount} clickable</Badge>
          </div>

          <div className="mt-4 flex gap-2">
            <Input placeholder="Search selected items…" value={search} onChange={(event) => setSearch(event.target.value)} />
          </div>

          <div className="mt-4 max-h-[650px] space-y-3 overflow-y-auto pr-1">
            {visible.length === 0 ? (
              <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
                No clickable items yet. Use Select area on the PDF.
              </div>
            ) : (
              visible.map((candidate) => {
                const draft = drafts[candidate.id];
                const product = draft?.product ?? products[candidate.id];
                return (
                  <div key={candidate.id} className="rounded-2xl border border-primary bg-primary/5 p-3">
                    <div className="flex items-start gap-3">
                      <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setPage(candidate.page_number)}>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">P{candidate.page_number}</span>
                          <Badge variant="outline">Manual</Badge>
                          <Badge className="bg-emerald-50 text-emerald-700 hover:bg-emerald-50">Clickable</Badge>
                        </div>
                        <p className="mt-1 text-sm font-bold leading-5">
                          {product?.name_en || product?.name_ar || "Enter product name"}
                        </p>
                        {product?.price != null ? (
                          <p className="mt-2 text-sm font-semibold">{product.price} {product.currency ?? ""}</p>
                        ) : (
                          <p className="mt-2 text-xs text-muted-foreground">Price not set</p>
                        )}
                      </button>
                      <Button size="icon" variant="ghost" onClick={() => removeManualSelection(candidate.id)} aria-label="Remove clickable area">
                        <X className="size-4" />
                      </Button>
                    </div>

                    {product ? (
                      <div className="mt-3 space-y-3 rounded-2xl bg-background p-3 ring-1 ring-border">
                        <Field label="Name (English)" value={product.name_en} onChange={(value) => edit(candidate.id, { name_en: value })} />
                        <Field label="Name (Arabic)" value={product.name_ar} onChange={(value) => edit(candidate.id, { name_ar: value })} />
                        <div className="grid grid-cols-[1fr_100px] gap-2">
                          <Field
                            label="Price"
                            value={product.price == null ? "" : String(product.price)}
                            type="number"
                            onChange={(value) => edit(candidate.id, { price: value.trim() === "" ? null : Number(value) })}
                          />
                          <Field label="Currency" value={product.currency ?? ""} onChange={(value) => edit(candidate.id, { currency: value })} />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-muted-foreground">Description (English)</label>
                          <Textarea
                            className="mt-1.5 min-h-16"
                            value={product.description_en ?? ""}
                            onChange={(event) => edit(candidate.id, { description_en: event.target.value || null })}
                            placeholder="Optional"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-muted-foreground">Description (Arabic)</label>
                          <Textarea
                            dir="rtl"
                            className="mt-1.5 min-h-16"
                            value={product.description_ar ?? ""}
                            onChange={(event) => edit(candidate.id, { description_ar: event.target.value || null })}
                            placeholder="اختياري"
                          />
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>
        </aside>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatusCard icon={<FileCheck2 className="size-4" />} label="PDF" value={file?.name ?? documentRow?.file_name ?? "Not uploaded"} />
        <StatusCard icon={<Link2 className="size-4" />} label="Clickable products" value={`${enabledCount} / ${analysis.candidates.length || 0}`} />
        <StatusCard icon={<MousePointer2 className="size-4" />} label="Selection" value={analysis.candidates.length ? "Manual only" : "Select areas on PDF"} />
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: "text" | "number" }) {
  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <Input type={type} className="mt-1.5" value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

function StatusCard({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="panel rounded-2xl p-4">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{icon}{label}</div>
      <p className="mt-2 truncate text-sm font-semibold">{value}</p>
    </div>
  );
}

function PdfOverlayPreview({
  canvasRef,
  candidates,
  drafts,
  manualMode,
  onSelect,
  onManualSelect,
}: {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  candidates: PdfMenuCandidate[];
  drafts: Record<string, Draft>;
  manualMode: boolean;
  onSelect: (candidate: PdfMenuCandidate) => void;
  onManualSelect: (rect: SelectionRect) => void;
}) {
  const [selection, setSelection] = useState<SelectionRect | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; pointerId: number } | null>(null);

  function getPoint(event: PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
    };
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (!manualMode || event.button !== 0) return;
    const point = getPoint(event);
    dragRef.current = { startX: point.x, startY: point.y, pointerId: event.pointerId };
    event.currentTarget.setPointerCapture(event.pointerId);
    setSelection({ x: point.x, y: point.y, width: 0, height: 0 });
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!manualMode || !drag || drag.pointerId !== event.pointerId) return;
    const point = getPoint(event);
    const x = Math.min(drag.startX, point.x);
    const y = Math.min(drag.startY, point.y);
    setSelection({ x, y, width: Math.abs(point.x - drag.startX), height: Math.abs(point.y - drag.startY) });
  }

  function handlePointerUp(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!manualMode || !drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    const point = getPoint(event);
    const x = Math.min(drag.startX, point.x);
    const y = Math.min(drag.startY, point.y);
    const width = Math.abs(point.x - drag.startX);
    const height = Math.abs(point.y - drag.startY);
    setSelection(null);
    if (width < 0.01 || height < 0.01) {
      toast.info("Drag around the full menu item to create a clickable area.");
      return;
    }
    onManualSelect({ x, y, width, height });
  }

  function handlePointerCancel() {
    dragRef.current = null;
    setSelection(null);
  }

  return (
    <div
      className={`relative mx-auto w-full max-w-3xl overflow-hidden rounded-xl bg-white shadow-sm ${manualMode ? "cursor-crosshair select-none" : ""}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
    >
      <canvas ref={canvasRef} className="block h-auto w-full" />
      <div className="absolute inset-0 pointer-events-none">
        {candidates.map((candidate) => {
          const enabled = drafts[candidate.id]?.enabled;
          return (
            <button
              key={candidate.id}
              type="button"
              aria-label={`Clickable manual area ${candidate.id}`}
              onClick={() => onSelect(candidate)}
              disabled={manualMode}
              className={`pointer-events-auto absolute rounded-md border-2 transition ${
                enabled ? "border-emerald-500 bg-emerald-500/10" : "border-primary/50 bg-primary/5"
              } ${manualMode ? "pointer-events-none" : ""}`}
              style={{
                left: `${candidate.x * 100}%`,
                top: `${candidate.y * 100}%`,
                width: `${candidate.width * 100}%`,
                height: `${candidate.height * 100}%`,
              }}
            >
              <span className="sr-only">Manual clickable area</span>
            </button>
          );
        })}
      </div>
      {manualMode && selection ? (
        <div
          className="pointer-events-none absolute rounded-md border-2 border-primary bg-primary/15"
          style={{
            left: `${selection.x * 100}%`,
            top: `${selection.y * 100}%`,
            width: `${selection.width * 100}%`,
            height: `${selection.height * 100}%`,
          }}
        />
      ) : null}
      {manualMode ? (
        <div className="pointer-events-none absolute left-3 top-3 rounded-full bg-background/95 px-3 py-1.5 text-xs font-semibold shadow-sm ring-1 ring-border">
          Drag over a menu item
        </div>
      ) : null}
    </div>
  );
}
