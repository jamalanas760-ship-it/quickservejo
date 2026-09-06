import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Minus, Plus, ShoppingBag } from "lucide-react";

import { Button } from "@/components/ui/button";
import { openPdf, renderPdfPage } from "@/lib/pdf-menu";
import type { DinerItem } from "@/lib/diner";

type PdfLink = { id: string; page_number: number; x: number; y: number; width: number; height: number; menu_item_id: string; label: string | null };

export function PdfMenuViewer({
  url,
  pageCount,
  links,
  items,
  onSelect,
  cartCount,
  onCart,
  showCart,
}: {
  url: string;
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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const itemById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const pageLinks = links.filter((link) => link.page_number === page && itemById.has(link.menu_item_id));

  useEffect(() => {
    let disposed = false;
    async function render() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error("The menu PDF could not be loaded.");
        const pdf = await openPdf(await response.arrayBuffer());
        if (!disposed && canvasRef.current) await renderPdfPage(pdf, page, canvasRef.current, 1400);
      } catch (reason) {
        if (!disposed) setError(reason instanceof Error ? reason.message : "The menu could not be loaded.");
      } finally {
        if (!disposed) setLoading(false);
      }
    }
    void render();
    return () => { disposed = true; };
  }, [url, page]);

  return <section className="mx-auto w-full max-w-4xl px-2 pb-24 sm:px-4">
    <div className="sticky top-0 z-20 mb-3 flex items-center justify-between gap-2 border-b bg-background/90 px-1 py-2 backdrop-blur-xl">
      <div className="flex items-center gap-2"><Button size="icon" variant="outline" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}><Minus className="size-4"/></Button><span className="min-w-20 text-center text-xs font-semibold tabular-nums">Page {page} / {pageCount}</span><Button size="icon" variant="outline" disabled={page >= pageCount} onClick={() => setPage((value) => value + 1)}><Plus className="size-4"/></Button></div>
      {showCart && cartCount > 0 ? <Button size="sm" onClick={onCart}><ShoppingBag className="size-4"/> Cart ({cartCount})</Button> : null}
    </div>
    <div className="relative mx-auto w-full overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-black/5">
      <canvas ref={canvasRef} className="block h-auto w-full"/>
      {loading ? <div className="absolute inset-0 grid place-items-center bg-white/70 backdrop-blur-sm"><Loader2 className="size-7 animate-spin"/></div> : null}
      {error ? <div className="absolute inset-0 grid place-items-center bg-background p-8 text-center text-sm text-muted-foreground">{error}</div> : null}
      {!loading && !error ? <div className="absolute inset-0">{pageLinks.map((link) => { const item = itemById.get(link.menu_item_id); if (!item) return null; return <button key={link.id} type="button" aria-label={`Add ${item.name_en}`} onClick={() => onSelect(item)} className="absolute rounded-md border-2 border-transparent bg-transparent transition hover:border-primary/50 hover:bg-primary/5 active:bg-primary/10" style={{ left: `${link.x * 100}%`, top: `${link.y * 100}%`, width: `${link.width * 100}%`, height: `${link.height * 100}%` }}><span className="sr-only">{item.name_en}</span></button>; })}</div> : null}
    </div>
    {links.length === 0 ? <div className="mt-4 rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">This menu is visible, but no products have been linked yet.</div> : null}
  </section>;
}
