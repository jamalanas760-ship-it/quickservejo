import { useQuery } from "@tanstack/react-query";
import { FileText, Maximize2, ShoppingCart } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";

export function PublicPdfMenu({ slug }: { slug: string }) {
  const [open, setOpen] = useState(false);
  const menu = useQuery({
    queryKey: ["public-pdf-menu", slug],
    queryFn: async () => {
      const { data, error } = await (supabase.from("restaurants" as any) as any)
        .select("name,menu_pdf_url,menu_pdf_name")
        .eq("slug", slug)
        .eq("is_active", true)
        .maybeSingle();
      if (error) throw error;
      return data as { name: string; menu_pdf_url: string | null; menu_pdf_name: string | null } | null;
    },
    staleTime: 60_000,
  });

  const pdfUrl = menu.data?.menu_pdf_url;
  if (!pdfUrl) return null;

  return (
    <section className="mx-auto mt-4 max-w-3xl px-4">
      <div className="overflow-hidden rounded-3xl border bg-card shadow-sm">
        <div className="flex items-center gap-3 border-b p-4 sm:p-5">
          <div className="grid size-10 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary"><FileText className="size-5" /></div>
          <div className="min-w-0 flex-1"><h2 className="font-semibold">Original Menu</h2><p className="truncate text-xs text-muted-foreground">{menu.data?.menu_pdf_name ?? "PDF menu"}</p></div>
          <Button size="sm" onClick={() => setOpen(true)}><Maximize2 className="size-4" /> View PDF</Button>
        </div>
        <div className="bg-muted/20 p-2 sm:p-3">
          <iframe title={`${menu.data?.name ?? "Restaurant"} original menu`} src={pdfUrl} className="h-[420px] w-full rounded-2xl border bg-background" />
        </div>
        <div className="flex items-center gap-2 border-t p-4 text-sm text-muted-foreground">
          <ShoppingCart className="size-4 shrink-0" /> Select any item in the orderable menu below to add it to your cart.
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="h-[92vh] max-w-5xl p-3 sm:p-5">
          <DialogHeader><DialogTitle>Original Menu</DialogTitle><DialogDescription>Restaurant source menu</DialogDescription></DialogHeader>
          <iframe title="Full PDF menu" src={pdfUrl} className="min-h-0 flex-1 rounded-2xl border bg-background" />
        </DialogContent>
      </Dialog>
    </section>
  );
}
