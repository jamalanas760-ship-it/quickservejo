import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function TableVisitReleaseDialog({ target, busy, ar, onDismiss, onConfirm }: {
  target: {id:string; table_number:string} | null; busy:boolean; ar:boolean; onDismiss:()=>void; onConfirm:()=>void;
}) {
  return (
<Dialog open={!!target} onOpenChange={open => { if (!open && !busy) onDismiss(); }}>
        <DialogContent className="sm:max-w-md" style={{ height: "auto", bottom: "auto" }} dir={ar ? "rtl" : "ltr"} onOpenAutoFocus={event => event.preventDefault()}>
          <DialogHeader>
            <DialogTitle>{ar ? "إنهاء الزيارة وتحرير الطاولة؟" : "End visit & release table?"}</DialogTitle>
            <DialogDescription>{ar ? `الطاولة ${target?.table_number ?? ""} · أكد مغادرة الضيوف وأن الطاولة جاهزة.` : `Table ${target?.table_number ?? ""} · Confirm the guests have left and the table is ready.`}</DialogDescription>
          </DialogHeader>
          <div className="rounded-2xl border bg-muted/40 p-4 text-sm space-y-3">
            <p>{ar ? "سيتم إنهاء الحجز الجالس فقط. تبقى الطلبات والمبالغ غير المدفوعة في صفحة الطلبات دون تغيير." : "The seated booking will be completed. Orders and unpaid balances stay unchanged on the Orders page."}</p>
            <p>{ar ? "إذا كان هناك حجز قريب، تصبح الطاولة محجوزة تلقائياً." : "An upcoming booking will automatically keep the table reserved."}</p>
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" className="min-h-12" disabled={busy} onClick={()=>onDismiss()}>{ar ? "إلغاء" : "Cancel"}</Button>
            <Button type="button" className="min-h-12" disabled={busy} onClick={onConfirm}>{busy ? (ar ? "جارٍ التحرير…" : "Releasing…") : (ar ? "إنهاء الزيارة وتحرير" : "End visit & release")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
  );
}
