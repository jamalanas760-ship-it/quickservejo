import { useEffect, useState, type RefObject } from "react";
import { Download, Printer } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { downloadDataUrl, printQrCards, qrDataUrl } from "@/lib/qr";

export type TableQrTarget = {
  table_number: string;
  table_name: string | null;
  menuUrl: string;
  restaurantName: string;
};

export function TableQrDialog({
  target,
  ar,
  onClose,
  triggerRef,
}: {
  target: TableQrTarget | null;
  ar: boolean;
  onClose: () => void;
  triggerRef: RefObject<HTMLButtonElement | null>;
}) {
  const [image, setImage] = useState<{ url: string; data: string } | null>(null);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const menuUrl = target?.menuUrl;
  useEffect(() => {
    if (!menuUrl) return;
    let cancelled = false;
    setImage(null);
    setFailedUrl(null);
    void qrDataUrl(menuUrl)
      .then((data) => {
        if (!cancelled) setImage({ url: menuUrl, data });
      })
      .catch(() => {
        if (!cancelled) setFailedUrl(menuUrl);
      });
    return () => {
      cancelled = true;
    };
  }, [menuUrl]);
  const qr = image && image.url === menuUrl ? image.data : null;
  async function print() {
    if (!target || !qr) return;
    try {
      const opened = await printQrCards(
        target.restaurantName,
        ar ? "امسح لفتح القائمة" : "Scan to open the menu",
        [{ ...target, url: target.menuUrl }],
        { back: ar ? "رجوع" : "Back", print: ar ? "طباعة" : "Print" },
      );
      if (!opened)
        toast.error(ar ? "اسمح بالنوافذ المنبثقة للطباعة." : "Allow pop-ups to print QR codes.");
    } catch {
      toast.error(
        ar ? "تعذرت طباعة الرمز. حاول مرة أخرى." : "Could not print the QR code. Please try again.",
      );
    }
  }
  return (
    <Dialog
      open={!!target}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        dir={ar ? "rtl" : "ltr"}
        className="sm:max-w-md"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          triggerRef.current?.focus({ preventScroll: true });
        }}
      >
        <DialogHeader className="text-start sm:text-start pe-8">
          <DialogTitle>
            {ar ? "رمز QR · طاولة" : "QR code · Table"} {target?.table_number}
          </DialogTitle>
          <DialogDescription>
            {target?.table_name || target?.restaurantName} ·{" "}
            {ar ? "امسح لفتح قائمة الضيف" : "Scan to open the guest menu"}
          </DialogDescription>
        </DialogHeader>
        <div className="grid justify-items-center gap-4 rounded-2xl border border-border bg-muted/30 p-5">
          <div className="grid aspect-square w-full max-w-64 place-items-center rounded-2xl border border-border bg-white p-3">
            {qr ? (
              <img
                src={qr}
                width={256}
                height={256}
                className="h-auto w-full"
                alt={
                  ar
                    ? `رمز قائمة الطاولة ${target?.table_number}`
                    : `Menu QR code for table ${target?.table_number}`
                }
              />
            ) : (
              <p role="status" className="text-center text-sm text-slate-600">
                {failedUrl === menuUrl
                  ? ar
                    ? "تعذر إنشاء الرمز. أغلق النافذة وحاول مرة أخرى."
                    : "Could not generate QR. Close and try again."
                  : ar
                    ? "جارٍ إنشاء الرمز..."
                    : "Generating QR..."}
              </p>
            )}
          </div>
          <a
            href={menuUrl}
            target="_blank"
            rel="noreferrer"
            className="text-sm font-semibold text-primary underline underline-offset-4"
          >
            {ar ? "معاينة القائمة" : "Preview menu"}
          </a>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            disabled={!qr}
            onClick={() => {
              if (qr && target) downloadDataUrl(qr, `table-${target.table_number}-qr.png`);
            }}
          >
            <Download className="size-4" />
            {ar ? "تنزيل QR" : "Download QR"}
          </Button>
          <Button type="button" className="min-h-11" disabled={!qr} onClick={() => void print()}>
            <Printer className="size-4" />
            {ar ? "طباعة QR" : "Print QR"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
