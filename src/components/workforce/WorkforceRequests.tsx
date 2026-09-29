import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BriefcaseBusiness,
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileText,
  HeartPulse,
  Paperclip,
  Plane,
  Plus,
  ShieldCheck,
  Upload,
  UserRoundCheck,
  UsersRound,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { humanError } from "@/lib/errors";
import { cn } from "@/lib/utils";

type RequestStatus = "pending" | "approved" | "rejected" | "cancelled";
type PermissionType = "personal" | "lateness" | "work";
type LeaveType = "annual" | "sick" | "hajj" | "bereavement";
type FamilyDegree = "first_degree" | "second_degree";

type PermissionRequest = {
  id: string;
  staff_id: string;
  permission_type: PermissionType;
  request_date: string;
  start_time: string | null;
  end_time: string | null;
  expected_arrival_time: string | null;
  reason: string;
  attachment_path: string | null;
  attachment_name: string | null;
  attachment_mime: string | null;
  status: RequestStatus;
  review_note: string | null;
  created_at: string;
};

type LeaveRequest = {
  id: string;
  staff_id: string;
  leave_type: LeaveType;
  family_degree: FamilyDegree | null;
  start_date: string;
  end_date: string;
  reason: string;
  attachment_path: string | null;
  attachment_name: string | null;
  attachment_mime: string | null;
  status: RequestStatus;
  review_note: string | null;
  created_at: string;
};

type WorkforceMemberLite = {
  id: string;
  name: string;
  is_active: boolean;
};

const PERMISSION_LABELS: Record<PermissionType, { en: string; ar: string }> = {
  personal: { en: "Personal permission", ar: "إذن شخصي" },
  lateness: { en: "Lateness permission", ar: "إذن تأخير" },
  work: { en: "Work permission", ar: "إذن عمل" },
};

const LEAVE_LABELS: Record<LeaveType, { en: string; ar: string }> = {
  annual: { en: "Annual Leave", ar: "إجازة سنوية" },
  sick: { en: "Sick Leave", ar: "إجازة مرضية" },
  hajj: { en: "Hajj Leave", ar: "إجازة حج" },
  bereavement: { en: "Bereavement Leave", ar: "إجازة وفاة" },
};

function requestStatusTone(status: RequestStatus) {
  if (status === "approved") return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  if (status === "rejected") return "bg-red-500/10 text-red-700 dark:text-red-300";
  if (status === "cancelled") return "bg-slate-500/10 text-slate-600 dark:text-slate-300";
  return "bg-amber-500/10 text-amber-700 dark:text-amber-300";
}

function permissionIcon(type: PermissionType) {
  if (type === "lateness") return Clock3;
  if (type === "work") return BriefcaseBusiness;
  return UserRoundCheck;
}

function leaveIcon(type: LeaveType) {
  if (type === "sick") return HeartPulse;
  if (type === "hajj") return Plane;
  if (type === "bereavement") return UsersRound;
  return CalendarDays;
}

function safeFileName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(-120) || "attachment";
}

function shortTime(value: string | null) {
  return value ? value.slice(0, 5) : "—";
}

export function WorkforceRequests({
  restaurantId,
  currentStaffId,
  canManage,
  members,
  ar,
  lang,
}: {
  restaurantId: string;
  currentStaffId: string;
  canManage: boolean;
  members: WorkforceMemberLite[];
  ar: boolean;
  lang: "en" | "ar";
}) {
  const qc = useQueryClient();
  const [view, setView] = useState<"all" | "permissions" | "leaves">("all");
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<"permission" | "leave">("permission");
  const [permissionType, setPermissionType] = useState<PermissionType>("personal");
  const [leaveType, setLeaveType] = useState<LeaveType>("annual");
  const [familyDegree, setFamilyDegree] = useState<FamilyDegree>("first_degree");
  const [requestDate, setRequestDate] = useState(() => new Date().toLocaleDateString("en-CA"));
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [expectedArrival, setExpectedArrival] = useState("09:30");
  const [leaveStart, setLeaveStart] = useState(() => new Date().toLocaleDateString("en-CA"));
  const [leaveEnd, setLeaveEnd] = useState(() => new Date().toLocaleDateString("en-CA"));
  const [reason, setReason] = useState("");
  const [attachment, setAttachment] = useState<File | null>(null);

  const query = useQuery<{ permissions: PermissionRequest[]; leaves: LeaveRequest[] }>({
    queryKey: ["workforce", "requests", restaurantId],
    refetchInterval: 20_000,
    queryFn: async () => {
      const [permissionRes, leaveRes] = await Promise.all([
        (supabase.from("staff_permission_requests" as any) as any)
          .select("id,staff_id,permission_type,request_date,start_time,end_time,expected_arrival_time,reason,attachment_path,attachment_name,attachment_mime,status,review_note,created_at")
          .eq("restaurant_id", restaurantId)
          .order("created_at", { ascending: false })
          .limit(300),
        (supabase.from("staff_leave_requests" as any) as any)
          .select("id,staff_id,leave_type,family_degree,start_date,end_date,reason,attachment_path,attachment_name,attachment_mime,status,review_note,created_at")
          .eq("restaurant_id", restaurantId)
          .order("created_at", { ascending: false })
          .limit(300),
      ]);
      if (permissionRes.error) throw permissionRes.error;
      if (leaveRes.error) throw leaveRes.error;
      return {
        permissions: (permissionRes.data ?? []) as PermissionRequest[],
        leaves: (leaveRes.data ?? []) as LeaveRequest[],
      };
    },
  });

  const memberName = (id: string) => members.find((member) => member.id === id)?.name ?? (ar ? "عضو فريق" : "Team member");
  const permissions = (query.data?.permissions ?? []).filter((request) => canManage || request.staff_id === currentStaffId);
  const leaves = (query.data?.leaves ?? []).filter((request) => canManage || request.staff_id === currentStaffId);
  const pending = permissions.filter((request) => request.status === "pending").length + leaves.filter((request) => request.status === "pending").length;
  const withAttachment = permissions.filter((request) => request.attachment_path).length + leaves.filter((request) => request.attachment_path).length;

  const rows = useMemo(() => {
    const permissionRows = permissions.map((request) => ({ kind: "permission" as const, created_at: request.created_at, request }));
    const leaveRows = leaves.map((request) => ({ kind: "leave" as const, created_at: request.created_at, request }));
    const all = view === "permissions" ? permissionRows : view === "leaves" ? leaveRows : [...permissionRows, ...leaveRows];
    return all.sort((a, b) => b.created_at.localeCompare(a.created_at));
  }, [leaves, permissions, view]);

  async function uploadAttachment(file: File) {
    if (file.size > 10 * 1024 * 1024) throw new Error(ar ? "حجم المرفق يجب ألا يتجاوز 10 ميغابايت." : "Attachment must be 10 MB or smaller.");
    const allowed = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
    if (!allowed.includes(file.type)) throw new Error(ar ? "المرفق يجب أن يكون PDF أو صورة." : "Attachment must be a PDF or image.");
    const path = `${restaurantId}/requests/${currentStaffId}/${Date.now()}-${safeFileName(file.name)}`;
    const { error } = await supabase.storage.from("workforce-documents").upload(path, file, {
      upsert: false,
      contentType: file.type,
      cacheControl: "3600",
    });
    if (error) throw error;
    return { path, name: file.name, mime: file.type };
  }

  const submit = useMutation({
    mutationFn: async () => {
      let uploaded: { path: string; name: string; mime: string } | null = null;
      try {
        if (attachment) uploaded = await uploadAttachment(attachment);
        if (kind === "permission") {
          const { error } = await (supabase as any).rpc("submit_workforce_permission_request", {
            _restaurant_id: restaurantId,
            _permission_type: permissionType,
            _request_date: requestDate,
            _start_time: permissionType === "lateness" ? null : startTime,
            _end_time: permissionType === "lateness" ? null : endTime,
            _expected_arrival_time: permissionType === "lateness" ? expectedArrival : null,
            _reason: reason.trim(),
            _attachment_path: uploaded?.path ?? null,
            _attachment_name: uploaded?.name ?? null,
            _attachment_mime: uploaded?.mime ?? null,
          });
          if (error) throw error;
        } else {
          const { error } = await (supabase as any).rpc("submit_workforce_leave_request", {
            _restaurant_id: restaurantId,
            _leave_type: leaveType,
            _family_degree: leaveType === "bereavement" ? familyDegree : null,
            _start: leaveStart,
            _end: leaveEnd,
            _reason: reason.trim(),
            _attachment_path: uploaded?.path ?? null,
            _attachment_name: uploaded?.name ?? null,
            _attachment_mime: uploaded?.mime ?? null,
          });
          if (error) throw error;
        }
      } catch (error) {
        if (uploaded?.path) await supabase.storage.from("workforce-documents").remove([uploaded.path]);
        throw error;
      }
    },
    onSuccess: async () => {
      setOpen(false);
      setReason("");
      setAttachment(null);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["workforce", "requests", restaurantId] }),
        qc.invalidateQueries({ queryKey: ["operational-counters", restaurantId] }),
        qc.invalidateQueries({ queryKey: ["notifications"] }),
      ]);
      toast.success(ar ? "تم إرسال الطلب للمراجعة" : "Request submitted for review");
    },
    onError: (error) => toast.error(humanError(error, lang)),
  });

  const review = useMutation({
    mutationFn: async ({ requestKind, id, status }: { requestKind: "permission" | "leave"; id: string; status: "approved" | "rejected" }) => {
      const rpc = requestKind === "permission" ? "review_workforce_permission_request" : "review_workforce_leave_request";
      const { error } = await (supabase as any).rpc(rpc, { _request_id: id, _status: status, _note: null });
      if (error) throw error;
    },
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["workforce", "requests", restaurantId] }),
        qc.invalidateQueries({ queryKey: ["operational-counters", restaurantId] }),
        qc.invalidateQueries({ queryKey: ["notifications"] }),
      ]);
      toast.success(ar ? "تم تحديث الطلب" : "Request updated");
    },
    onError: (error) => toast.error(humanError(error, lang)),
  });

  async function openAttachment(path: string) {
    const { data, error } = await supabase.storage.from("workforce-documents").createSignedUrl(path, 300);
    if (error || !data?.signedUrl) {
      toast.error(error ? humanError(error, lang) : (ar ? "تعذر فتح المرفق" : "Could not open attachment"));
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  const permissionInvalid =
    !requestDate ||
    reason.trim().length < 3 ||
    (permissionType === "lateness" ? !expectedArrival : !startTime || !endTime || endTime <= startTime);
  const leaveInvalid =
    !leaveStart ||
    !leaveEnd ||
    leaveEnd < leaveStart ||
    reason.trim().length < 3 ||
    (leaveType === "bereavement" && !familyDegree) ||
    (leaveType === "sick" && !attachment);
  const invalid = kind === "permission" ? permissionInvalid : leaveInvalid;

  function resetForKind(next: "permission" | "leave") {
    setKind(next);
    setReason("");
    setAttachment(null);
  }

  return (
    <section className="qs-workforce-requests space-y-4">
      <div className="qs-workforce-request-hero qs-card overflow-hidden">
        <div className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2">
              <span className="grid size-9 place-items-center rounded-xl bg-orange-500/10 text-[#e85d2a]"><ShieldCheck className="size-4" /></span>
              <div><h2 className="font-display text-xl font-bold">{ar ? "الطلبات والأذونات" : "Requests & permissions"}</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">{ar ? "إدارة الأذونات والإجازات مع الأسباب والمرفقات وسير موافقة واضح." : "Manage permissions and leave with reasons, attachments and a clear approval workflow."}</p></div>
            </div>
          </div>
          <Button className="min-h-11 gap-2 shadow-sm" onClick={() => setOpen(true)}><Plus className="size-4" />{ar ? "طلب جديد" : "New request"}</Button>
        </div>
        <div className="grid border-t border-border sm:grid-cols-2 xl:grid-cols-4">
          <RequestMetric label={ar ? "بانتظار المراجعة" : "Pending review"} value={pending} icon={Clock3} tone="orange" />
          <RequestMetric label={ar ? "الأذونات" : "Permissions"} value={permissions.length} icon={UserRoundCheck} tone="blue" />
          <RequestMetric label={ar ? "الإجازات" : "Leave requests"} value={leaves.length} icon={CalendarDays} tone="green" />
          <RequestMetric label={ar ? "مع مرفقات" : "With attachments"} value={withAttachment} icon={Paperclip} tone="purple" />
        </div>
      </div>

      <div className="qs-card overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="inline-flex rounded-xl border border-border bg-muted/35 p-1">
            {([
              ["all", ar ? "الكل" : "All"],
              ["permissions", ar ? "الأذونات" : "Permissions"],
              ["leaves", ar ? "الإجازات" : "Leaves"],
            ] as const).map(([id, label]) => <button key={id} type="button" onClick={() => setView(id)} className={cn("min-h-9 rounded-lg px-3 text-xs font-bold transition", view === id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>{label}</button>)}
          </div>
          <p className="text-[10px] font-semibold text-muted-foreground">{canManage ? (ar ? "عرض طلبات الفريق حسب الصلاحية" : "Team requests, filtered by your access") : (ar ? "طلباتك فقط" : "Your requests only")}</p>
        </div>

        {query.isPending ? <div className="space-y-2 p-4">{Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-20 animate-pulse rounded-2xl bg-muted/50" />)}</div> :
          rows.length ? <div className="divide-y divide-border">{rows.slice(0, 40).map((row) => {
            if (row.kind === "permission") {
              const request = row.request;
              const Icon = permissionIcon(request.permission_type);
              return <RequestRow
                key={`permission-${request.id}`}
                icon={Icon}
                title={PERMISSION_LABELS[request.permission_type][lang]}
                staff={memberName(request.staff_id)}
                meta={request.permission_type === "lateness" ? `${request.request_date} · ${ar ? "الوصول المتوقع" : "Expected"} ${shortTime(request.expected_arrival_time)}` : `${request.request_date} · ${shortTime(request.start_time)}–${shortTime(request.end_time)}`}
                reason={request.reason}
                status={request.status}
                attachmentName={request.attachment_name}
                onAttachment={request.attachment_path ? () => void openAttachment(request.attachment_path!) : undefined}
                canReview={canManage && request.status === "pending"}
                pending={review.isPending}
                onApprove={() => review.mutate({ requestKind: "permission", id: request.id, status: "approved" })}
                onReject={() => review.mutate({ requestKind: "permission", id: request.id, status: "rejected" })}
                ar={ar}
              />;
            }
            const request = row.request;
            const Icon = leaveIcon(request.leave_type);
            const family = request.leave_type === "bereavement" && request.family_degree ? (request.family_degree === "first_degree" ? (ar ? "الدرجة الأولى" : "1st degree") : (ar ? "الدرجة الثانية" : "2nd degree")) : null;
            return <RequestRow
              key={`leave-${request.id}`}
              icon={Icon}
              title={LEAVE_LABELS[request.leave_type][lang]}
              staff={memberName(request.staff_id)}
              meta={`${request.start_date} → ${request.end_date}${family ? ` · ${family}` : ""}`}
              reason={request.reason}
              status={request.status}
              attachmentName={request.attachment_name}
              onAttachment={request.attachment_path ? () => void openAttachment(request.attachment_path!) : undefined}
              canReview={canManage && request.status === "pending"}
              pending={review.isPending}
              onApprove={() => review.mutate({ requestKind: "leave", id: request.id, status: "approved" })}
              onReject={() => review.mutate({ requestKind: "leave", id: request.id, status: "rejected" })}
              ar={ar}
            />;
          })}</div> : <div className="grid min-h-52 place-items-center p-6 text-center"><div><span className="mx-auto grid size-11 place-items-center rounded-2xl bg-muted text-muted-foreground"><FileText className="size-5" /></span><h3 className="mt-3 text-sm font-bold">{ar ? "لا توجد طلبات بعد" : "No requests yet"}</h3><p className="mt-1 text-xs text-muted-foreground">{ar ? "أنشئ أول طلب إذن أو إجازة من هنا." : "Create your first permission or leave request here."}</p></div></div>}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="qs-workforce-request-dialog max-h-[92dvh] w-[calc(100vw-1.5rem)] max-w-[660px] overflow-hidden p-0">
          <DialogHeader className="border-b border-border bg-card px-5 py-4">
            <DialogTitle className="font-display text-lg font-bold">{ar ? "إنشاء طلب جديد" : "Create new request"}</DialogTitle>
            <DialogDescription>{ar ? "اختر نوع الطلب وأضف التفاصيل والمرفق قبل الإرسال." : "Choose the request type, add the details and attach supporting documentation if needed."}</DialogDescription>
          </DialogHeader>

          <div className="qs-workforce-request-scroll max-h-[calc(92dvh-150px)] space-y-5 overflow-y-auto px-5 py-5">
            <div className="grid grid-cols-2 rounded-2xl border border-border bg-muted/30 p-1">
              <button type="button" onClick={() => resetForKind("permission")} className={cn("min-h-11 rounded-xl text-sm font-bold transition", kind === "permission" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground")}>{ar ? "إذن" : "Permission"}</button>
              <button type="button" onClick={() => resetForKind("leave")} className={cn("min-h-11 rounded-xl text-sm font-bold transition", kind === "leave" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground")}>{ar ? "إجازة" : "Leave"}</button>
            </div>

            {kind === "permission" ? <>
              <Field label={ar ? "نوع الإذن" : "Permission type"}><Select value={permissionType} onValueChange={(value) => setPermissionType(value as PermissionType)}><SelectTrigger className="min-h-11"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="personal">{PERMISSION_LABELS.personal[lang]}</SelectItem><SelectItem value="lateness">{PERMISSION_LABELS.lateness[lang]}</SelectItem><SelectItem value="work">{PERMISSION_LABELS.work[lang]}</SelectItem></SelectContent></Select></Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={ar ? "التاريخ" : "Date"}><Input type="date" className="min-h-11" value={requestDate} onChange={(event) => setRequestDate(event.target.value)} /></Field>
                {permissionType === "lateness" ? <Field label={ar ? "وقت الوصول المتوقع" : "Expected arrival"}><Input type="time" className="min-h-11" value={expectedArrival} onChange={(event) => setExpectedArrival(event.target.value)} /></Field> : null}
                {permissionType !== "lateness" ? <><Field label={ar ? "من" : "From"}><Input type="time" className="min-h-11" value={startTime} onChange={(event) => setStartTime(event.target.value)} /></Field><Field label={ar ? "إلى" : "To"}><Input type="time" className="min-h-11" value={endTime} onChange={(event) => setEndTime(event.target.value)} /></Field></> : null}
              </div>
            </> : <>
              <Field label={ar ? "نوع الإجازة" : "Leave type"}><Select value={leaveType} onValueChange={(value) => setLeaveType(value as LeaveType)}><SelectTrigger className="min-h-11"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="annual">{LEAVE_LABELS.annual[lang]}</SelectItem><SelectItem value="sick">{LEAVE_LABELS.sick[lang]}</SelectItem><SelectItem value="hajj">{LEAVE_LABELS.hajj[lang]}</SelectItem><SelectItem value="bereavement">{LEAVE_LABELS.bereavement[lang]}</SelectItem></SelectContent></Select></Field>
              {leaveType === "bereavement" ? <Field label={ar ? "درجة القرابة" : "Family degree"}><Select value={familyDegree} onValueChange={(value) => setFamilyDegree(value as FamilyDegree)}><SelectTrigger className="min-h-11"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="first_degree">{ar ? "الدرجة الأولى" : "1st Degree Family"}</SelectItem><SelectItem value="second_degree">{ar ? "الدرجة الثانية" : "2nd Degree Family"}</SelectItem></SelectContent></Select></Field> : null}
              <div className="grid gap-4 sm:grid-cols-2"><Field label={ar ? "من تاريخ" : "Start date"}><Input type="date" className="min-h-11" value={leaveStart} onChange={(event) => { const next = event.target.value; setLeaveStart(next); if (leaveEnd < next) setLeaveEnd(next); }} /></Field><Field label={ar ? "إلى تاريخ" : "End date"}><Input type="date" min={leaveStart} className="min-h-11" value={leaveEnd} onChange={(event) => setLeaveEnd(event.target.value)} /></Field></div>
            </>}

            <Field label={ar ? "السبب" : "Reason"}><Textarea rows={4} className="min-h-24" value={reason} onChange={(event) => setReason(event.target.value)} placeholder={ar ? "اكتب سبب الطلب بوضوح..." : "Explain the request clearly..."} /></Field>

            <div className="rounded-2xl border border-dashed border-border bg-muted/20 p-4">
              <div className="flex items-start gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-orange-500/10 text-[#e85d2a]"><Upload className="size-4" /></span>
                <div className="min-w-0 flex-1"><Label htmlFor="workforce-request-file" className="text-sm font-bold">{ar ? "المرفق" : "Attachment"}</Label><p className="mt-1 text-[11px] leading-5 text-muted-foreground">{leaveType === "sick" && kind === "leave" ? (ar ? "مطلوب للإجازة المرضية. PDF أو صورة بحد أقصى 10 ميغابايت." : "Required for Sick Leave. PDF or image, max 10 MB.") : (ar ? "اختياري: PDF أو صورة بحد أقصى 10 ميغابايت." : "Optional: PDF or image, max 10 MB.")}</p><Input id="workforce-request-file" type="file" accept=".pdf,image/jpeg,image/png,image/webp" className="mt-3 min-h-11" onChange={(event) => setAttachment(event.target.files?.[0] ?? null)} />{attachment ? <p className="mt-2 flex items-center gap-2 truncate text-[11px] font-semibold text-foreground"><Paperclip className="size-3.5 shrink-0" />{attachment.name}</p> : null}</div>
              </div>
            </div>
          </div>

          <DialogFooter className="border-t border-border bg-card px-5 py-4">
            <Button variant="outline" disabled={submit.isPending} onClick={() => setOpen(false)}>{ar ? "إلغاء" : "Cancel"}</Button>
            <Button disabled={invalid || submit.isPending} onClick={() => submit.mutate()}>{submit.isPending ? (ar ? "جارٍ الإرسال…" : "Submitting…") : (ar ? "إرسال للمراجعة" : "Submit for review")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function RequestMetric({ label, value, icon: Icon, tone }: { label: string; value: number; icon: typeof CalendarDays; tone: "orange" | "blue" | "green" | "purple" }) {
  const toneClass = tone === "orange" ? "bg-orange-500/10 text-orange-600" : tone === "blue" ? "bg-blue-500/10 text-blue-600" : tone === "green" ? "bg-emerald-500/10 text-emerald-600" : "bg-violet-500/10 text-violet-600";
  return <div className="flex min-w-0 items-center gap-3 border-t border-border p-4 sm:border-t-0 sm:border-e"><span className={cn("grid size-9 shrink-0 place-items-center rounded-xl", toneClass)}><Icon className="size-4" /></span><span className="min-w-0"><span className="block truncate text-[10px] font-bold uppercase tracking-[.05em] text-muted-foreground">{label}</span><strong className="mt-0.5 block font-display text-xl">{value}</strong></span></div>;
}

function RequestRow({
  icon: Icon,
  title,
  staff,
  meta,
  reason,
  status,
  attachmentName,
  onAttachment,
  canReview,
  pending,
  onApprove,
  onReject,
  ar,
}: {
  icon: typeof CalendarDays;
  title: string;
  staff: string;
  meta: string;
  reason: string;
  status: RequestStatus;
  attachmentName: string | null;
  onAttachment?: () => void;
  canReview: boolean;
  pending: boolean;
  onApprove: () => void;
  onReject: () => void;
  ar: boolean;
}) {
  return <article className="qs-workforce-request-row grid gap-3 p-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto] lg:items-center">
    <div className="flex min-w-0 items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-orange-500/[.08] text-[#e85d2a]"><Icon className="size-4" /></span><span className="min-w-0"><strong className="block truncate text-sm">{title}</strong><span className="mt-1 block truncate text-[11px] font-semibold text-muted-foreground">{staff} · {meta}</span><p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{reason}</p></span></div>
    <div className="flex min-w-0 flex-wrap items-center gap-2">{onAttachment ? <button type="button" onClick={onAttachment} className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-[10px] font-bold text-muted-foreground transition hover:text-foreground"><Paperclip className="size-3.5 shrink-0" /><span className="truncate">{attachmentName || (ar ? "عرض المرفق" : "View attachment")}</span></button> : <span className="text-[10px] text-muted-foreground">{ar ? "بدون مرفق" : "No attachment"}</span>}<span className={cn("rounded-full px-2.5 py-1 text-[9px] font-bold capitalize", requestStatusTone(status))}>{status}</span></div>
    {canReview ? <div className="flex items-center gap-2 lg:justify-end"><Button size="sm" variant="outline" disabled={pending} onClick={onReject}><XCircle className="size-4 text-red-600" />{ar ? "رفض" : "Reject"}</Button><Button size="sm" disabled={pending} onClick={onApprove}><CheckCircle2 className="size-4" />{ar ? "اعتماد" : "Approve"}</Button></div> : null}
  </article>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div className="space-y-2"><Label>{label}</Label>{children}</div>;
}
