import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, ExternalLink, Upload, Trash2, CheckCircle2, QrCode } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { humanError } from "@/lib/errors";
import { qrDataUrl, downloadDataUrl } from "@/lib/qr";

const MAX_PDF_BYTES = 20 * 1024 * 1024;

export function PdfMenuManager({ restaurantId }: { restaurantId: string }) {
  const { lang } = useI18n();
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [qr, setQr] = useState<string | null>(null);

  const restaurant = useQuery({
    queryKey: ["restaurant-pdf-menu", restaurantId],
    queryFn: async () => {
      const { data, error } = await (supabase.from("restaurants" as any) as any)
        .select("id,name,slug,menu_pdf_url,menu_pdf_name,menu_pdf_updated_at")
        .eq("id", restaurantId)
        .single();
      if (error) throw error;
      return data as {
        id: string;
        name: string;
        slug: string;
        menu_pdf_url: string | null;
        menu_pdf_name: string | null;
        menu_pdf_updated_at: string | null;
      };
    },
  });

  async function uploadPdf(file: File) {
    if (file.type !== "application/pdf") {
      toast.error(lang === "ar" ? "يرجى اختيار ملف PDF فقط." : "Please select a PDF file.");
      return;
    }
    if (file.size > MAX_PDF_BYTES) {
      toast.error(lang === "ar" ? "الحد الأقصى لحجم الملف 20MB." : "Maximum PDF size is 20MB.");
      return;
    }
    setBusy(true);
    setProgress(10);
    try {
      const path = `${restaurantId}/${crypto.randomUUID()}.pdf`;
      const { error: uploadError } = await supabase.storage
        .from("menu-pdfs")
        .upload(path, file, { contentType: "application/pdf", upsert: false, cacheControl: "3600" });
      if (uploadError) throw uploadError;
      setProgress(65);
      const { data: publicData } = supabase.storage.from("menu-pdfs").getPublicUrl(path);
      const { error: updateError } = await (supabase.from("restaurants" as any) as any)
        .update({ menu_pdf_url: publicData.publicUrl, menu_pdf_name: file.name, menu_pdf_updated_at: new Date().toISOString() })
        .eq("id", restaurantId);
      if (updateError) throw updateError;
      setProgress(100);
      await qc.invalidateQueries({ queryKey: ["restaurant-pdf-menu", restaurantId] });
      toast.success(lang === "ar" ? "تم رفع قائمة PDF بنجاح." : "PDF menu uploaded successfully.");
    } catch (error) {
      toast.error(humanError(error, lang));
    } finally {
      setBusy(false);
      window.setTimeout(() => setProgress(0), 700);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function removePdf() {
    if (!restaurant.data?.menu_pdf_url) return;
    setBusy(true);
    try {
      const { error } = await (supabase.from("restaurants" as any) as any)
        .update({ menu_pdf_url: null, menu_pdf_name: null, menu_pdf_updated_at: null })
        .eq("id", restaurantId);
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["restaurant-pdf-menu", restaurantId] });
      setQr(null);
      toast.success(lang === "ar" ? "تمت إزالة قائمة PDF." : "PDF menu removed.");
    } catch (error) {
      toast.error(humanError(error, lang));
    } finally {
      setBusy(false);
    }
  }

  async function createQr() {
    if (!restaurant.data) return;
    setQr(await qrDataUrl(`${window.location.origin}/r/${restaurant.data.slug}`));
  }

  if (restaurant.isPending) return <div className="h-64 animate-pulse rounded-3xl bg-muted" />;
  if (restaurant.isError || !restaurant.data) return <div className="rounded-3xl border p-6">Unable to load restaurant.</div>;

  const current = restaurant.data;
  return (
    <div className="space-y-6">
      <header>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Badge variant="secondary" className="mb-3 rounded-full">QuickServe PDF Ordering</Badge>
            <h1 className="text-3xl font-bold tracking-tight">Digital Menu & QR Ordering</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              Upload the restaurant&apos;s existing PDF menu. QuickServe keeps the original menu available to customers while connecting it to the existing interactive cart and table ordering flow.
            </p>
          </div>
          <Button onClick={() => inputRef.current?.click()} disabled={busy}>
            <Upload className="size-4" /> {current.menu_pdf_url ? "Replace PDF" : "Upload PDF"}
          </Button>
          <input ref={inputRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) void uploadPdf(file); }} />
        </div>
      </header>

      {progress > 0 && <Progress value={progress} className="h-2" />}

      <section className="grid gap-5 lg:grid-cols-[1.35fr_.65fr]">
        <article className="overflow-hidden rounded-3xl border bg-card shadow-sm">
          <div className="flex items-center justify-between border-b p-5">
            <div className="flex items-center gap-3"><FileText className="size-5" /><div><h2 className="font-semibold">Original PDF Menu</h2><p className="text-xs text-muted-foreground">The restaurant&apos;s source menu</p></div></div>
            {current.menu_pdf_url && <Badge className="gap-1 rounded-full"><CheckCircle2 className="size-3" /> Active</Badge>}
          </div>
          {current.menu_pdf_url ? (
            <div className="bg-muted/30 p-3 sm:p-5"><iframe title={`${current.name} PDF menu`} src={current.menu_pdf_url} className="h-[680px] w-full rounded-2xl border bg-background" /></div>
          ) : (
            <div className="grid min-h-72 place-items-center p-8 text-center"><div><FileText className="mx-auto size-10 text-muted-foreground" /><h3 className="mt-4 font-semibold">No PDF uploaded yet</h3><p className="mt-2 max-w-md text-sm text-muted-foreground">Upload the exact menu your restaurant already uses. Customers will see it from the QR ordering experience.</p><Button className="mt-5" onClick={() => inputRef.current?.click()}>Upload menu PDF</Button></div></div>
          )}
        </article>

        <aside className="space-y-5">
          <article className="rounded-3xl border bg-card p-5 shadow-sm">
            <h2 className="font-semibold">Customer experience</h2>
            <div className="mt-4 space-y-4 text-sm">
              {["Scan the restaurant QR code", "Open the original PDF menu", "Browse the interactive orderable menu", "Add items and modifiers to cart", "Send the order directly to the restaurant"].map((step, index) => <div key={step} className="flex gap-3"><span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{index + 1}</span><span className="pt-1">{step}</span></div>)}
            </div>
          </article>

          <article className="rounded-3xl border bg-card p-5 shadow-sm">
            <h2 className="font-semibold">Public menu QR</h2>
            <p className="mt-2 text-sm text-muted-foreground">Use this QR for a general restaurant menu. Table QR codes remain available in Tables.</p>
            <Button variant="outline" className="mt-4 w-full" onClick={() => void createQr()}><QrCode className="size-4" /> Generate QR preview</Button>
            {qr && <div className="mt-4 rounded-2xl bg-muted p-4"><img src={qr} alt="Restaurant menu QR code" className="mx-auto size-52" /><Button variant="ghost" className="mt-2 w-full" onClick={() => downloadDataUrl(qr, `${current.slug}-menu-qr.png`)}>Download QR</Button></div>}
          </article>

          {current.menu_pdf_url && <article className="rounded-3xl border bg-card p-5 shadow-sm"><div className="flex gap-2"><Button asChild variant="outline" className="flex-1"><a href={current.menu_pdf_url} target="_blank" rel="noreferrer"><ExternalLink className="size-4" /> Open PDF</a></Button><Button variant="outline" size="icon" onClick={() => void removePdf()} disabled={busy} aria-label="Remove PDF"><Trash2 className="size-4" /></Button></div><p className="mt-3 truncate text-xs text-muted-foreground">{current.menu_pdf_name}</p></article>}
        </aside>
      </section>
    </div>
  );
}
