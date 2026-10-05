import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Clock3, XCircle } from "lucide-react";
import { toast } from "sonner";
import { DetailSheet } from "@/components/operations/DetailSheet";
import { RequestDateTimePicker } from "./RequestPickers";
import { WorkforceButton as Button } from "./WorkforceButton";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { workforceInputTimestamp, workforceLocalInput } from "@/lib/workforce-hours";
import { humanError } from "@/lib/errors";

export type AutomaticClockOutCase = {
  id: string; staff_id: string; clock_in: string; clock_out: string;
  scheduled_end?: string | null; recorded_clock_out?: string | null; time_entry_id?: string | null;
};
type Resolution = "corrected_clock_out" | "overtime_approved" | "rejected";
export function AutomaticClockOutReview({ request, memberName, restaurantId, timeZone, currentStaffId, ar, lang, onClose }: {
  request: AutomaticClockOutCase; memberName: string; restaurantId: string; timeZone: string;
  currentStaffId: string; ar: boolean; lang: "ar" | "en"; onClose: () => void;
}) {
  const qc = useQueryClient();
  const [resolution, setResolution] = useState<Resolution>("corrected_clock_out");
  const [end, setEnd] = useState(() => workforceLocalInput(request.scheduled_end || request.clock_out, timeZone));
  const [note, setNote] = useState("");
  const ownCase = request.staff_id === currentStaffId;
  const stamp = (value?: string | null) => value ? new Date(value).toLocaleString(ar ? "ar-JO" : "en-GB", { timeZone, month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : ar ? "لم تسجل بصمة خروج بعد" : "No clock-out recorded yet";
  const endMs = workforceInputTimestamp(end,timeZone);
  const scheduledMs = Date.parse(request.scheduled_end || request.clock_out);
  const overtime = Number.isFinite(endMs) ? Math.max(0, Math.floor((endMs-scheduledMs)/60000)) : 0;
  const validEnd = Number.isFinite(endMs) && endMs > Date.parse(request.clock_in) && endMs <= Date.now()+300000 &&
    (resolution === "overtime_approved" ? endMs>scheduledMs : endMs<=scheduledMs);
  const ready = !ownCase && note.trim().length>=3 && note.trim().length<=500 && (resolution === "rejected" || validEnd);
  const review = useMutation({
    mutationFn: async () => {
      const {error} = await (supabase as any).rpc("review_automatic_clock_out", {
        _request_id:request.id, _resolution:resolution,
        _clock_out:resolution === "rejected" ? null : new Date(endMs).toISOString(),
        _note:note.trim(), _expected_clock_out:request.recorded_clock_out ?? null,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      await Promise.all([qc.invalidateQueries({queryKey:["workforce"]}),qc.invalidateQueries({queryKey:["notifications"]}),qc.invalidateQueries({queryKey:["platform","staff-schedule",restaurantId]}),qc.invalidateQueries({queryKey:["operations","time-clock"]})]);
      toast.success(ar ? "تم تسجيل قرار الموارد البشرية" : "HR decision recorded"); onClose();
    },
    onError: async (error: any) => {
      toast.error(humanError(error,lang));
      if(error?.code === "40001") { await qc.invalidateQueries({queryKey:["workforce"]}); onClose(); }
    },
  });
  const choices: {id:Resolution; en:string; ar:string; detailEn:string; detailAr:string; icon:typeof Clock3}[] = [
    {id:"corrected_clock_out",en:"Correct missing clock-out",ar:"تصحيح بصمة الخروج",detailEn:"Confirm the actual end time, up to the scheduled end.",detailAr:"تأكيد وقت المغادرة الفعلي حتى نهاية الوردية.",icon:CheckCircle2},
    {id:"overtime_approved",en:"Approve overtime",ar:"اعتماد وقت إضافي",detailEn:"Confirm when work finished after the scheduled end.",detailAr:"تأكيد وقت انتهاء العمل بعد نهاية الوردية.",icon:Clock3},
    {id:"rejected",en:"Reject this case",ar:"رفض الحالة",detailEn:"Keep the original attendance record unchanged.",detailAr:"الاحتفاظ بسجل الدوام الأصلي دون تعديل.",icon:XCircle},
  ];
  return <DetailSheet open onOpenChange={open => {if(!open && !review.isPending) onClose();}}
    title={ar ? "مراجعة خروج تلقائية" : "Automatic clock-out review"} description={memberName}
    footer={<div className="grid grid-cols-2 gap-2"><Button variant="outline" className="min-h-12 whitespace-normal" disabled={review.isPending} onClick={onClose}>{ar ? "المراجعة لاحقاً" : "Review later"}</Button><Button className="min-h-12 whitespace-normal" disabled={!ready || review.isPending} onClick={()=>review.mutate()}>{review.isPending ? (ar ? "جارٍ الحفظ…" : "Saving…") : ar ? "تأكيد قرار HR" : "Confirm HR decision"}</Button></div>}>
    <div className="space-y-4" dir={ar ? "rtl" : "ltr"}>
      <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4"><strong className="text-sm">{ar ? "تجاوزت الوردية فترة السماح 15 دقيقة" : "Detected after the 15-minute grace period"}</strong><p className="mt-1 text-xs leading-5 text-muted-foreground">{ar ? "قد يكون الموظف ما زال يعمل. لم يتغير سجل الدوام ولم يعتمد الوقت الإضافي تلقائياً." : "The employee may still be working. Attendance and overtime remain unchanged until HR decides."}</p></div>
      <dl className="grid gap-3 rounded-2xl border p-4 text-sm">{[[ar ? "الدخول الفعلي" : "Clocked in",request.clock_in],[ar ? "نهاية الوردية" : "Scheduled end",request.scheduled_end || request.clock_out],[ar ? "بصمة الخروج المسجلة" : "Recorded clock-out",request.recorded_clock_out]].map(([label,value])=><div key={label} className="min-w-0"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 break-words font-semibold">{stamp(value)}</dd></div>)}<p className="text-xs text-muted-foreground">{timeZone}</p></dl>
      <div className="grid gap-2" role="radiogroup" aria-label={ar ? "قرار HR" : "HR decision"}>{choices.map(choice=>{const Icon=choice.icon;return <button key={choice.id} type="button" role="radio" aria-checked={resolution===choice.id} disabled={review.isPending || ownCase} onClick={()=>{setResolution(choice.id);if(choice.id==="corrected_clock_out")setEnd(workforceLocalInput(request.scheduled_end || request.clock_out,timeZone));if(choice.id==="overtime_approved")setEnd(workforceLocalInput(request.recorded_clock_out || new Date().toISOString(),timeZone));}} className={`flex min-h-16 min-w-0 items-start gap-3 rounded-2xl border p-3 text-start ${resolution===choice.id ? "border-primary bg-primary/5" : "border-border bg-card"}`}><Icon className="mt-1 size-5 shrink-0 text-primary"/><span className="min-w-0"><strong className="block text-sm">{ar ? choice.ar : choice.en}</strong><span className="mt-1 block text-xs leading-5 text-muted-foreground">{ar ? choice.detailAr : choice.detailEn}</span></span></button>})}</div>
      {resolution!=="rejected" ? <><RequestDateTimePicker label={ar ? "وقت انتهاء العمل الفعلي" : "Actual work end time"} value={end} onChange={setEnd} timeZone={timeZone} ar={ar}/>{resolution==="overtime_approved" ? <p className="rounded-xl bg-primary/5 p-3 text-sm font-semibold">{ar ? `${overtime} دقيقة بعد نهاية الوردية` : `${overtime} minutes after scheduled end`}</p> : null}{!validEnd ? <p className="text-xs text-red-600">{ar ? "اختر وقتاً صحيحاً يتوافق مع القرار وليس في المستقبل." : "Choose a valid end time for this decision, not a future time."}</p> : null}</> : null}
      <div className="space-y-2"><Label htmlFor="auto-clockout-reason">{ar ? "سبب قرار HR (مطلوب)" : "HR reason (required)"}</Label><Textarea id="auto-clockout-reason" value={note} onChange={e=>setNote(e.target.value)} rows={3} maxLength={500} disabled={review.isPending} placeholder={ar ? "اذكر كيف تم تأكيد وقت المغادرة أو العمل الإضافي…" : "Explain how the departure time or overtime was verified…"}/></div>
      {ownCase ? <p className="text-xs text-muted-foreground">{ar ? "تحتاج هذه الحالة إلى مراجع آخر من HR." : "Another HR reviewer must decide your own attendance case."}</p> : null}
      <p className="text-xs leading-5 text-muted-foreground">{ar ? "القرار محفوظ للتدقيق. دقائق ما بعد الوردية لا تحدد أجر العمل الإضافي." : "Every decision is audited. Minutes after the shift do not determine overtime pay."}</p>
    </div>
  </DetailSheet>;
}
