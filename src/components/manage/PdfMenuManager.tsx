import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, ExternalLink, Upload, Trash2, CheckCircle2, QrCode, Sparkles, Printer } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { humanError } from "@/lib/errors";
import { qrDataUrl, downloadDataUrl, printQrCards, tableMenuUrl } from "@/lib/qr";
import { analyzePdfMenu, importPdfMenuItems, type ExtractedItem } from "@/lib/pdf-menu.functions";

const MAX_PDF_BYTES = 20 * 1024 * 1024;

type RestaurantPdfState = {
  id: string;
  name: string;
  slug: string;
  menu_pdf_url?: string | null;
  menu_pdf_name?: string | null;
  menu_pdf_updated_at?: string | null;
};

type Detected = ExtractedItem & { selected: boolean };

export function PdfMenuManager({ restaurantId }: { restaurantId: string }) {
  const { lang } = useI18n();
  const ar = lang === "ar";
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [qr, setQr] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [detected, setDetected] = useState<Detected[] | null>(null);
  const [importing, setImporting] = useState(false);

  const restaurant = useQuery<RestaurantPdfState>({
    queryKey: ["restaurant-pdf-menu", restaurantId],
    enabled: Boolean(restaurantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("restaurants")
        .select("*")
        .eq("id", restaurantId)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Restaurant not found.");
      return data as unknown as RestaurantPdfState;
    },
  });

  const tables = useQuery({
    queryKey: ["platform", "tables", restaurantId],
    enabled: Boolean(restaurantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("restaurant_tables")
        .select("table_number, table_name, qr_token, is_active")
        .eq("restaurant_id", restaurantId)
        .order("table_number", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  async function uploadPdf(file: File) {
    if (file.type !== "application/pdf") {
      toast.error(ar ? "يرجى اختيار ملف PDF فقط." : "Please select a PDF file.");
      return;
    }
    if (file.size > MAX_PDF_BYTES) {
      toast.error(ar ? "الحد الأقصى لحجم الملف 20MB." : "Maximum PDF size is 20MB.");
      return;
    }

    setBusy(true);
    setProgress(10);
    try {
      const path = `${restaurantId}/${crypto.randomUUID()}.pdf`;
      const { error: uploadError } = await supabase.storage
        .from("menu-pdfs")
        .upload(path, file, { contentType: "application/pdf", upsert: false, cacheControl: "31536000" });
      if (uploadError) throw uploadError;

      setProgress(65);
      const { data: publicData } = supabase.storage.from("menu-pdfs").getPublicUrl(path);
      const { error: updateError } = await supabase
        .from("restaurants")
        .update({
          menu_pdf_url: publicData.publicUrl,
          menu_pdf_name: file.name,
          menu_pdf_updated_at: new Date().toISOString(),
        } as never)
        .eq("id", restaurantId);
      if (updateError) throw updateError;

      setProgress(100);
      await qc.invalidateQueries({ queryKey: ["restaurant-pdf-menu", restaurantId] });
      toast.success(ar ? "تم رفع قائمة PDF بنجاح." : "PDF menu uploaded successfully.");
      void readMenu();
    } catch (error) {
      toast.error(humanError(error, lang));
    } finally {
      setBusy(false);
      window.setTimeout(() => setProgress(0), 700);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function readMenu() {
    setReading(true);
    try {
      const result = await analyzePdfMenu({ data: { restaurantId } });
      if (!result.items.length) {
        toast.error(ar ? "لم يتم العثور على أصناف في هذا الملف." : "No products were found in this PDF.");
        return;
      }
      setDetected(result.items.map((item) => ({ ...item, selected: true })));
    } catch (error) {
      toast.error(humanError(error, lang));
    } finally {
      setReading(false);
    }
  }

  async function importSelected() {
    if (!detected) return;
    const items = detected.filter((d) => d.selected).map(({ selected: _s, ...rest }) => rest);
    if (!items.length) {
      toast.error(ar ? "اختر صنفاً واحداً على الأقل." : "Select at least one item.");
      return;
    }
    setImporting(true);
    try {
      const result = await importPdfMenuItems({ data: { restaurantId, items } });
      toast.success(ar ? `تمت إضافة ${result.imported} صنفاً إلى القائمة.` : `${result.imported} items added to the orderable menu.`);
      setDetected(null);
    } catch (error) {
      toast.error(humanError(error, lang));
    } finally {
      setImporting(false);
    }
  }

  async function createQr() {
    if (!restaurant.data) return;
    setQr(await qrDataUrl(`${window.location.origin}/m/${restaurant.data.slug}`));
  }

  async function printTableQrs() {
    const current = restaurant.data;
    if (!current) return;
    const rows = (tables.data ?? []).filter((t) => t.is_active);
    if (!rows.length) {
      toast.error(ar ? "أضف طاولات أولاً من صفحة الطاولات." : "Add tables first from the Tables page.");
      return;
    }
    await printQrCards(
      current.name,
      ar ? "امسح للاطلاع على القائمة والطلب" : "Scan to view the menu and order",
      rows.map((t) => ({ table_number: t.table_number, table_name: t.table_name, url: `${window.location.origin}/m/${current.slug}?t=${t.qr_token}` })),
      { back: ar ? "← رجوع" : "← Back", print: ar ? "طباعة" : "Print" },
    );
  }

  if (restaurant.isPending) return <div className="h-64 animate-pulse rounded-3xl bg-muted" />;
  if (restaurant.isError || !restaurant.data) {
    return (
      <div className="rounded-3xl border border-destructive/20 bg-destructive/5 p-6">
        <h2 className="font-semibold">{ar ? "تعذر تحميل المطعم" : "Unable to load restaurant"}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{humanError(restaurant.error, lang)}</p>
      </div>
    );
  }

  const current = restaurant.data;
  const selectedCount = detected?.filter((d) => d.selected).length ?? 0;
  const activeTables = (tables.data ?? []).filter((t) => t.is_active).length;

  return (
    <div className="space-y-6">
      <header>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Badge variant="secondary" className="mb-3 rounded-full">QuickServe PDF Ordering</Badge>
            <h1 className="text-3xl font-bold tracking-tight">Digital Menu &amp; QR Ordering</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              Upload the restaurant&apos;s existing PDF menu. QuickServe keeps the original design exactly as it is, reads the products from it, and adds a tap-to-add clicker so diners can order straight to the kitchen.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {current.menu_pdf_url ? (
              <Button variant="outline" disabled={reading} onClick={() => void readMenu()}>
                <Sparkles className="size-4" /> {reading ? (ar ? "جارٍ قراءة القائمة…" : "Reading menu…") : (ar ? "اقرأ الأصناف" : "Read items from PDF")}
              </Button>
            ) : null}
            <Button onClick={() => inputRef.current?.click()} disabled={busy}>
              <Upload className="size-4" /> {current.menu_pdf_url ? "Replace PDF" : "Upload PDF"}
            </Button>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void uploadPdf(file);
            }}
          />
        </div>
      </header>

      {progress > 0 && <Progress value={progress} className="h-2" />}

      <section className="grid gap-5 lg:grid-cols-[1.35fr_.65fr]">
        <article className="overflow-hidden rounded-3xl border bg-card shadow-sm">
          <div className="flex items-center justify-between border-b p-5">
            <div className="flex items-center gap-3">
              <FileText className="size-5" />
              <div>
                <h2 className="font-semibold">Original PDF Menu</h2>
                <p className="text-xs text-muted-foreground">Exactly as uploaded by the restaurant</p>
              </div>
            </div>
            {current.menu_pdf_url && <Badge className="gap-1 rounded-full"><CheckCircle2 className="size-3" /> Active</Badge>}
          </div>
          {current.menu_pdf_url ? (
            <div className="bg-muted/30 p-3 sm:p-5">
              <iframe
                title={`${current.name} PDF menu`}
                src={current.menu_pdf_url}
                className="h-[680px] w-full rounded-2xl border bg-background"
              />
            </div>
          ) : (
            <div className="grid min-h-72 place-items-center p-8 text-center">
              <div>
                <FileText className="mx-auto size-10 text-muted-foreground" />
                <h3 className="mt-4 font-semibold">No PDF uploaded yet</h3>
                <p className="mt-2 max-w-md text-sm text-muted-foreground">Upload the exact menu your restaurant already uses. Customers will see it from the QR menu page, with an add-to-cart clicker on top.</p>
                <Button className="mt-5" onClick={() => inputRef.current?.click()}>Upload menu PDF</Button>
              </div>
            </div>
          )}
        </article>

        <aside className="space-y-5">
          <article className="rounded-3xl border bg-card p-5 shadow-sm">
            <h2 className="font-semibold">Customer experience</h2>
            <div className="mt-4 space-y-4 text-sm">
              {["Scan the table QR", "See the original PDF menu", "Tap + on any item to add it", "Review the cart", "Order lands in the kitchen display"].map((step, index) => (
                <div key={step} className="flex gap-3">
                  <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{index + 1}</span>
                  <span className="pt-1">{step}</span>
                </div>
              ))}
            </div>
          </article>

          <article className="rounded-3xl border bg-card p-5 shadow-sm">
            <h2 className="font-semibold">Table QR codes</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {activeTables} active {activeTables === 1 ? "table" : "tables"}. Each QR opens this PDF menu for that exact table, so orders arrive tagged with the table number.
            </p>
            <Button variant="outline" className="mt-4 w-full" onClick={() => void printTableQrs()}>
              <Printer className="size-4" /> Print all table QR codes
            </Button>
          </article>

          <article className="rounded-3xl border bg-card p-5 shadow-sm">
            <h2 className="font-semibold">Public menu QR</h2>
            <p className="mt-2 text-sm text-muted-foreground">This QR opens the menu without a table (browse only).</p>
            <Button variant="outline" className="mt-4 w-full" disabled={!current.menu_pdf_url} onClick={() => void createQr()}>
              <QrCode className="size-4" /> Generate QR preview
            </Button>
            {qr && (
              <div className="mt-4 rounded-2xl bg-muted p-4">
                <img src={qr} alt="Restaurant menu QR code" className="mx-auto size-52" />
                <Button variant="ghost" className="mt-2 w-full" onClick={() => downloadDataUrl(qr, `${current.slug}-menu-qr.png`)}>Download QR</Button>
              </div>
            )}
          </article>

          {current.menu_pdf_url && (
            <article className="rounded-3xl border bg-card p-5 shadow-sm">
              <div className="flex gap-2">
                <Button asChild variant="outline" className="flex-1">
                  <a href={current.menu_pdf_url} target="_blank" rel="noreferrer"><ExternalLink className="size-4" /> Open PDF</a>
                </Button>
                <Button variant="outline" size="icon" onClick={() => void removePdf()} disabled={busy} aria-label="Remove PDF"><Trash2 className="size-4" /></Button>
              </div>
              <p className="mt-3 truncate text-xs text-muted-foreground">{current.menu_pdf_name}</p>
            </article>
          )}
        </aside>
      </section>

      <Dialog open={detected !== null} onOpenChange={(o) => !o && setDetected(null)}>
        <DialogContent className="flex max-h-[88vh] max-w-2xl flex-col">
          <DialogHeader>
            <DialogTitle>{ar ? "الأصناف المقروءة من القائمة" : "Products found in the PDF"}</DialogTitle>
            <DialogDescription>
              {ar ? "اختر الأصناف التي تريد أن يستطيع العملاء طلبها، وعدّل الأسعار إذا لزم." : "Choose the products diners can order, and adjust any price before importing."}
            </DialogDescription>
          </DialogHeader>
          <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
            <div className="mb-3 flex items-center justify-between text-sm">
              <span className="font-medium">{selectedCount}/{detected?.length ?? 0} {ar ? "محدد" : "selected"}</span>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={() => setDetected((prev) => prev?.map((d) => ({ ...d, selected: true })) ?? prev)}>{ar ? "تحديد الكل" : "Select all"}</Button>
                <Button size="sm" variant="ghost" onClick={() => setDetected((prev) => prev?.map((d) => ({ ...d, selected: false })) ?? prev)}>{ar ? "إلغاء الكل" : "Clear"}</Button>
              </div>
            </div>
            <div className="space-y-2">
              {(detected ?? []).map((item, index) => (
                <div key={`${item.name_en}-${index}`} className="flex items-center gap-3 rounded-2xl border p-3">
                  <Checkbox
                    checked={item.selected}
                    onCheckedChange={(checked) =>
                      setDetected((prev) => prev?.map((d, i) => (i === index ? { ...d, selected: checked === true } : d)) ?? prev)
                    }
                    aria-label={item.name_en}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{item.name_en}</p>
                    <p className="truncate text-xs text-muted-foreground">{item.category_en}{item.description_en ? ` · ${item.description_en}` : ""}</p>
                  </div>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={String(item.price)}
                    onChange={(e) =>
                      setDetected((prev) => prev?.map((d, i) => (i === index ? { ...d, price: Number(e.target.value) || 0 } : d)) ?? prev)
                    }
                    className="w-24 shrink-0"
                    aria-label={`${item.name_en} price`}
                  />
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDetected(null)}>{ar ? "إلغاء" : "Cancel"}</Button>
            <Button disabled={importing || selectedCount === 0} onClick={() => void importSelected()}>
              {ar ? "إضافة إلى القائمة القابلة للطلب" : `Add ${selectedCount} items to the menu`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );

  async function removePdf() {
    if (!restaurant.data?.menu_pdf_url) return;
    setBusy(true);
    try {
      const { error } = await supabase
        .from("restaurants")
        .update({ menu_pdf_url: null, menu_pdf_name: null, menu_pdf_updated_at: null } as never)
        .eq("id", restaurantId);
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["restaurant-pdf-menu", restaurantId] });
      setQr(null);
      toast.success(ar ? "تمت إزالة قائمة PDF." : "PDF menu removed.");
    } catch (error) {
      toast.error(humanError(error, lang));
    } finally {
      setBusy(false);
    }
  }
}
