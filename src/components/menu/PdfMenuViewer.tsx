import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Minus, Plus, ShoppingBag, ZoomIn, ZoomOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import { fetchPdfBytes, openPdf, renderPdfPage } from "@/lib/pdf-menu";
import type { DinerItem } from "@/lib/diner";

type PdfLink = {
  id: string;
  page_number: number;
  x: number;
  y: number;
  width: number;
  height: number;
  menu_item_id: string;
  label: string | null;
};

type PinchState = { distance: number; zoom: number };
const MIN_ZOOM = 0.6;
const DEFAULT_ZOOM = 0.85;
const MAX_ZOOM = 3;

export function PdfMenuViewer({
  url,
  parts = [],
  pageCount,
  links,
  items,
  onSelect,
  cartCount,
  onCart,
  showCart,
}: {
  url: string;
  parts?: string[];
  pageCount: number;
  links: PdfLink[];
  items: DinerItem[];
  onSelect: (item: DinerItem) => void;
  cartCount: number;
  onCart: () => void;
  showCart: boolean;
}) {
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pdfRef = useRef<any>(null);
  const pinchRef = useRef<PinchState | null>(null);
  const itemById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const pageLinks = useMemo(() => links.filter((link) => link.page_number === page && itemById.has(link.menu_item_id)), [links, page, itemById]);
  const safePageCount = Math.max(1, pageCount || 1);

  useEffect(() => {
    setPage((value) => Math.min(Math.max(1, value), safePageCount));
  }, [safePageCount]);

  useEffect(() => {
    setZoom(DEFAULT_ZOOM);
  }, [page]);

  useEffect(() => {
    let disposed = false;
    async function loadDocument() {
      setLoading(true);
      setError(null);
      try {
        const bytes = await fetchPdfBytes(url, parts);
        const pdf = await openPdf(bytes);
        if (disposed) return;
        pdfRef.current = pdf;
        const actualPage = Math.min(page, pdf.numPages);
        if (actualPage !== page) {
          setPage(actualPage);
          return;
        }
        if (canvasRef.current) await renderPdfPage(pdf, actualPage, canvasRef.current, 1600);
        if (actualPage < pdf.numPages) void pdf.getPage(actualPage + 1);
      } catch (reason) {
        if (!disposed) setError(reason instanceof Error ? reason.message : "The menu could not be loaded.");
      } finally {
        if (!disposed) setLoading(false);
      }
    }
    void loadDocument();
    return () => { disposed = true; };
  }, [url, parts, page]);

  function go(delta: number) {
    const max = pdfRef.current?.numPages ?? safePageCount;
    setPage((value) => Math.max(1, Math.min(max, value + delta)));
  }

  function changeZoom(delta: number) {
    setZoom((value) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number((value + delta).toFixed(2)))));
  }

  function pinchDistance(touches: React.TouchList) {
    if (touches.length < 2) return 0;
    const a = touches[0];
    const b = touches[1];
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  }

  return (
    <section className="mx-auto w-full max-w-4xl px-0 pb-24 sm:px-4">
      <div className="sticky top-0 z-20 mb-2 flex items-center justify-between gap-2 border-b bg-background/95 px-2 py-2 backdrop-blur-xl">
        <div className="flex items-center gap-1">
          <Button size="icon" variant="outline" disabled={page <= 1 || loading} onClick={() => go(-1)} aria-label="Previous page"><Minus className="size-4" /></Button>
          <span className="min-w-16 text-center text-xs font-semibold tabular-nums">{page} / {safePageCount}</span>
          <Button size="icon" variant="outline" disabled={page >= safePageCount || loading} onClick={() => go(1)} aria-label="Next page"><Plus className="size-4" /></Button>
        </div>

        <div className="flex items-center gap-1">
          <Button size="icon" variant="ghost" disabled={zoom <= MIN_ZOOM} onClick={() => changeZoom(-0.25)} aria-label="Zoom out"><ZoomOut className="size-4" /></Button>
          <span className="w-10 text-center text-[11px] font-semibold tabular-nums">{Math.round(zoom * 100)}%</span>
          <Button size="icon" variant="ghost" disabled={zoom >= MAX_ZOOM} onClick={() => changeZoom(0.25)} aria-label="Zoom in"><ZoomIn className="size-4" /></Button>
          {showCart && cartCount > 0 ? <Button size="sm" onClick={onCart}><ShoppingBag className="size-4" /> {cartCount}</Button> : null}
        </div>
      </div>

      <div
        className="relative max-h-[calc(100vh-100px)] w-full overflow-auto bg-white touch-pan-x touch-pan-y overscroll-contain"
        onTouchStart={(event) => {
          const distance = pinchDistance(event.touches);
          if (distance > 0) pinchRef.current = { distance, zoom };
        }}
        onTouchMove={(event) => {
          const distance = pinchDistance(event.touches);
          const start = pinchRef.current;
          if (!start || !distance) return;
          event.preventDefault();
          setZoom(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, start.zoom * (distance / start.distance))));
        }}
        onTouchEnd={(event) => {
          if (event.touches.length < 2) pinchRef.current = null;
        }}
      >
        <div
          className="relative mx-auto w-full origin-top"
          style={{
            transform: `scale(${zoom})`,
            transformOrigin: "top center",
            marginBottom: `${Math.max(0, (zoom - 1) * 100)}%`,
          }}
        >
          <canvas ref={canvasRef} className="relative z-0 block h-auto w-full select-none" draggable={false} />
          {!error && loading ? <div className="absolute inset-0 grid place-items-center bg-white/20"><Loader2 className="size-6 animate-spin opacity-40" /></div> : null}
          {error ? <div className="absolute inset-0 z-20 grid place-items-center bg-background p-8 text-center text-sm text-muted-foreground">{error}</div> : null}
          {!error ? <div className="pointer-events-none absolute inset-0 z-10">
            {pageLinks.map((link) => {
              const item = itemById.get(link.menu_item_id);
              if (!item) return null;
              return <button key={link.id} type="button" aria-label={`Add ${item.name_en || item.name_ar}`} onClick={() => onSelect(item)} className="pointer-events-auto absolute cursor-pointer touch-manipulation rounded-sm border border-transparent bg-transparent p-0 outline-none focus-visible:border-primary focus-visible:bg-primary/10 active:bg-primary/10" style={{ left: `${link.x * 100}%`, top: `${link.y * 100}%`, width: `${link.width * 100}%`, height: `${link.height * 100}%` }}><span className="sr-only">{item.name_en || item.name_ar}</span></button>;
            })}
          </div> : null}
        </div>
      </div>
    </section>
  );
}
