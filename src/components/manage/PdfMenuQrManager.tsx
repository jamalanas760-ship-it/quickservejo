import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Check,
  Copy,
  Download,
  ExternalLink,
  FileText,
  QrCode,
  RefreshCw,
  Smartphone,
  Upload,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { qrDataUrl, tableMenuUrl, downloadDataUrl } from "@/lib/qr";

const MAX_FILE_SIZE = 20 * 1024 * 1024;
const BUCKET = "restaurant-pdf-menus";

type PdfMenu = {
  id: string;
  restaurant_id: string;
  file_name: string;
  file_path: string;
  file_url: string;
  file_size: number;
  is_active: boolean;
  created_at: string;
};

type Restaurant = { id: string; name: string; slug: string };
type RestaurantTable = { id: string; table_number: string; table_name: string | null; qr_token: string };

export function PdfMenuQrManager({ restaurantId }: { restaurantId: string }) {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [copied, setCopied] = useState(false);
  const [selectedTableId, setSelectedTableId] = useState<string>("all");

  const restaurantQuery = useQuery({
    queryKey: ["pdf-menu-restaurant", restaurantId],
    queryFn: async () => {
      const { data, error } = await (supabase.from("restaurants") as any)
        .select("id,name,slug")
        .eq("id", restaurantId)
        .single();
      if (error) throw error;
      return data as Restaurant;
    },
  });

  const menuQuery = useQuery({
    queryKey: ["restaurant-pdf-menu", restaurantId],
    queryFn: async () => {
      const { data, error } = await (supabase.from("restaurant_pdf_menus") as any)
        .select("id,restaurant_id,file_name,file_path,file_url,file_size,is_active,created_at")
        .eq("restaurant_id", restaurantId)
        .eq("is_active", true)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as PdfMenu | null;
    },
  });

  const tablesQuery = useQuery({
    queryKey: ["pdf-menu-tables", restaurantId],
    queryFn: async () => {
      const { data, error } = await (supabase.from("restaurant_tables") as any)
        .select("id,table_number,table_name,qr_token")
        .eq("restaurant_id", restaurantId)
        .order("table_number");
      if (error) throw error;
      return (data ?? []) as RestaurantTable[];
    },
  });

  const restaurant = restaurantQuery.data;
  const menu = menuQuery.data;
  const tables = tablesQuery.data ?? [];

  const genericUrl = useMemo(() => {
    if (!restaurant) return "";
    return `${window.location.origin}/m/${restaurant.slug}`;
  }, [restaurant]);

  const selectedTable = tables.find((table) => table.id === selectedTableId);
  const qrUrl = selectedTable
    ? tableMenuUrl(restaurant?.slug ?? "", selectedTable.qr_token)
    : genericUrl;

  async function uploadPdf(file: File) {
    if (file.type !== "application/pdf") {
      toast.error("Please upload a PDF menu.");
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      toast.error("PDF must be 20 MB or smaller.");
      return;
    }
    if (!restaurant) return;

    setUploading(true);
    setProgress(10);
    try {
      const safeName = file.name.toLowerCase().replace(/[^a-z0-9._-]+/g, "-");
      const path = `${restaurantId}/${crypto.randomUUID()}-${safeName}`;
      const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file, {
        contentType: "application/pdf",
        upsert: false,
        cacheControl: "31536000",
      });
      if (uploadError) throw uploadError;
      setProgress(70);

      const { data: publicData } = supabase.storage.from(BUCKET).getPublicUrl(path);
      const { error: deactivateError } = await (supabase.from("restaurant_pdf_menus") as any)
        .update({ is_active: false })
        .eq("restaurant_id", restaurantId)
        .eq("is_active", true);
      if (deactivateError) throw deactivateError;

      const { error: insertError } = await (supabase.from("restaurant_pdf_menus") as any).insert({
        restaurant_id: restaurantId,
        file_name: file.name,
        file_path: path,
        file_url: publicData.publicUrl,
        file_size: file.size,
        is_active: true,
      });
      if (insertError) throw insertError;

      setProgress(100);
      await queryClient.invalidateQueries({ queryKey: ["restaurant-pdf-menu", restaurantId] });
      toast.success("PDF menu published successfully.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not publish the PDF menu.");
    } finally {
      setTimeout(() => setProgress(0), 500);
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function generateQr() {
    if (!qrUrl) return;
    const label = selectedTable ? `table-${selectedTable.table_number}` : "restaurant-menu";
    try {
      const dataUrl = await qrDataUrl(qrUrl, 1024);
      downloadDataUrl(dataUrl, `${restaurant?.name ?? "quickserve"}-${label}-qr.png`);
      toast.success("QR code generated.");
    } catch {
      toast.error("Could not generate the QR code.");
    }
  }

  async function copyLink() {
    if (!qrUrl) return;
    await navigator.clipboard.writeText(qrUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  if (restaurantQuery.isPending || menuQuery.isPending || tablesQuery.isPending) {
    return <div className="p-6 text-sm text-muted-foreground">Loading PDF menu manager…</div>;
  }

  if (restaurantQuery.isError) {
    return <div className="p-6 text-sm text-destructive">Could not load this restaurant.</div>;
  }

  return (
    <div className="min-h-full bg-background">
      <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6 lg:p-8">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <QrCode className="size-4" /> Digital Menu & QR Ordering
            </div>
            <h1 className="text-3xl font-semibold tracking-tight">PDF Menu to QR</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              Keep your restaurant's menu exactly as designed. Upload the PDF, publish it instantly,
              and give every table a QR entry point into QuickServe ordering.
            </p>
          </div>
          <Badge variant={menu ? "default" : "secondary"} className="w-fit gap-1.5 px-3 py-1.5">
            <span className={`size-1.5 rounded-full ${menu ? "bg-emerald-500" : "bg-muted-foreground"}`} />
            {menu ? "Published" : "No PDF published"}
          </Badge>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.25fr_.75fr]">
          <Card className="overflow-hidden">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><FileText className="size-5" /> Menu source</CardTitle>
              <CardDescription>Upload a PDF up to 20 MB. The original file is preserved for your customers.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <input
                ref={inputRef}
                type="file"
                accept="application/pdf,.pdf"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void uploadPdf(file);
                }}
              />
              <button
                type="button"
                disabled={uploading}
                onClick={() => inputRef.current?.click()}
                className="group flex min-h-52 w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border bg-muted/20 px-6 text-center transition hover:border-primary/50 hover:bg-muted/40 disabled:cursor-wait"
              >
                <span className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary transition group-hover:scale-105">
                  <Upload className="size-6" />
                </span>
                <span className="font-semibold">{uploading ? "Publishing menu…" : "Upload your PDF menu"}</span>
                <span className="mt-1 text-sm text-muted-foreground">Drag & drop or choose a PDF file</span>
                <span className="mt-3 text-xs text-muted-foreground">PDF • max 20 MB</span>
              </button>
              {uploading ? <Progress value={progress} className="h-2" /> : null}

              {menu ? (
                <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-red-500/10 text-red-600"><FileText className="size-5" /></div>
                    <div className="min-w-0">
                      <p className="truncate font-medium">{menu.file_name}</p>
                      <p className="text-xs text-muted-foreground">{formatBytes(menu.file_size)} • Published {formatDate(menu.created_at)}</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" asChild><a href={menu.file_url} target="_blank" rel="noreferrer"><ExternalLink className="mr-1.5 size-4" /> Preview</a></Button>
                    <Button size="sm" onClick={() => inputRef.current?.click()}><RefreshCw className="mr-1.5 size-4" /> Replace</Button>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">
                  No PDF is live yet. Upload your current printed menu to create the QR ordering experience.
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="overflow-hidden">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><QrCode className="size-5" /> QR entry point</CardTitle>
              <CardDescription>Generate a QR for the whole restaurant or a specific table.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <label className="text-sm font-medium">QR destination</label>
              <select
                value={selectedTableId}
                onChange={(event) => setSelectedTableId(event.target.value)}
                className="h-11 w-full rounded-lg border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/20"
              >
                <option value="all">Restaurant menu — no table selected</option>
                {tables.map((table) => <option key={table.id} value={table.id}>Table {table.table_name || table.table_number} — ordering QR</option>)}
              </select>

              <div className="flex min-h-64 flex-col items-center justify-center rounded-2xl bg-muted/30 p-5">
                {qrUrl ? <QrPreview value={qrUrl} /> : <div className="text-center text-sm text-muted-foreground">Create a restaurant menu first.</div>}
              </div>

              <div className="flex gap-2">
                <Button className="flex-1" disabled={!qrUrl || !menu} onClick={() => void generateQr()}><Download className="mr-2 size-4" /> Download QR</Button>
                <Button variant="outline" size="icon" disabled={!qrUrl} onClick={() => void copyLink()} title="Copy menu link">{copied ? <Check className="size-4 text-emerald-600" /> : <Copy className="size-4" />}</Button>
              </div>
              <p className="break-all text-center text-[11px] text-muted-foreground">{qrUrl || "Your QR destination will appear here"}</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Smartphone className="size-5" /> Customer journey</CardTitle>
            <CardDescription>The PDF remains the visual source of truth; QuickServe provides the ordering layer.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-4">
              {[
                ["01", "Scan QR", "Customer scans the table QR."],
                ["02", "View menu", "The restaurant PDF opens instantly."],
                ["03", "Start ordering", "QuickServe's mobile menu uses the live restaurant items."],
                ["04", "Add to cart", "Customer submits directly to your existing order workflow."],
              ].map(([n, title, body]) => (
                <div key={n} className="rounded-xl border bg-muted/20 p-4">
                  <span className="text-xs font-semibold text-primary">{n}</span>
                  <p className="mt-2 font-medium">{title}</p>
                  <p className="mt-1 text-sm leading-5 text-muted-foreground">{body}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 flex items-start gap-3 rounded-xl bg-primary/5 p-4 text-sm">
              <X className="mt-0.5 size-4 shrink-0 text-primary" />
              <p className="text-muted-foreground"><strong className="text-foreground">Important:</strong> the PDF is intentionally not modified or recreated. It stays exactly as the restaurant supplied it, while QuickServe's existing interactive menu handles cart and order submission.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function QrPreview({ value }: { value: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useState(() => { void qrDataUrl(value, 420).then(setSrc).catch(() => setSrc(null)); });
  if (!src) return <div className="size-48 animate-pulse rounded-xl bg-muted" />;
  return <img src={src} alt="QuickServe menu QR code" className="size-48 rounded-xl bg-white p-2 shadow-sm" />;
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
function formatDate(value: string) { return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value)); }
