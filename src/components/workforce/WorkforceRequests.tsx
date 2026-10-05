import { MasterActionSurface } from "@/components/app/MasterPage";
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

import { RequestDatePicker, RequestTimePicker } from "@/components/workforce/RequestPickers";
import { WorkforceButton as Button } from "@/components/workforce/WorkforceButton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { humanError } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { Inspector, SearchField } from "./WorkforcePrimitives";
import { DetailRow } from "@/components/operations/DetailSheet";

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
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(-120) || "attachment"
  );
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
  const [statusFilter, setStatusFilter] = useState<RequestStatus | "all">("pending");
  const [search, setSearch] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
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
          .select(
            "id,staff_id,permission_type,request_date,start_time,end_time,expected_arrival_time,reason,attachment_path,attachment_name,attachment_mime,status,review_note,created_at",
          )
          .eq("restaurant_id", restaurantId)
          .order("created_at", { ascending: false })
          .limit(300),
        (supabase.from("staff_leave_requests" as any) as any)
          .select(
            "id,staff_id,leave_type,family_degree,start_date,end_date,reason,attachment_path,attachment_name,attachment_mime,status,review_note,created_at",
          )
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

  const memberName = (id: string) =>
    members.find((member) => member.id === id)?.name ?? (ar ? "عضو فريق" : "Team member");
  const permissions = (query.data?.permissions ?? []).filter(
    (request) => canManage || request.staff_id === currentStaffId,
  );
  const leaves = (query.data?.leaves ?? []).filter(
    (request) => canManage || request.staff_id === currentStaffId,
  );
  const pending =
    permissions.filter((request) => request.status === "pending").length +
    leaves.filter((request) => request.status === "pending").length;
  const withAttachment =
    permissions.filter((request) => request.attachment_path).length +
    leaves.filter((request) => request.attachment_path).length;

  const rows = useMemo(() => {
    const permissionRows = permissions.map((request) => ({
      kind: "permission" as const,
      created_at: request.created_at,
      request,
    }));
    const leaveRows = leaves.map((request) => ({
      kind: "leave" as const,
      created_at: request.created_at,
      request,
    }));
    const all =
      view === "permissions"
        ? permissionRows
        : view === "leaves"
          ? leaveRows
          : [...permissionRows, ...leaveRows];
    return all.sort((a, b) => b.created_at.localeCompare(a.created_at));
  }, [leaves, permissions, view]);

  async function uploadAttachment(file: File) {
    if (file.size > 10 * 1024 * 1024)
      throw new Error(
        ar ? "حجم المرفق يجب ألا يتجاوز 10 ميغابايت." : "Attachment must be 10 MB or smaller.",
      );
    const allowed = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
    if (!allowed.includes(file.type))
      throw new Error(
        ar ? "المرفق يجب أن يكون PDF أو صورة." : "Attachment must be a PDF or image.",
      );
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
        if (uploaded?.path)
          await supabase.storage.from("workforce-documents").remove([uploaded.path]);
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
    mutationFn: async ({
      requestKind,
      id,
      status,
    }: {
      requestKind: "permission" | "leave";
      id: string;
      status: "approved" | "rejected";
    }) => {
      const rpc =
        requestKind === "permission"
          ? "review_workforce_permission_request"
          : "review_workforce_leave_request";
      const { error } = await (supabase as any).rpc(rpc, {
        _request_id: id,
        _status: status,
        _note: null,
      });
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
    const { data, error } = await supabase.storage
      .from("workforce-documents")
      .createSignedUrl(path, 300);
    if (error || !data?.signedUrl) {
      toast.error(
        error ? humanError(error, lang) : ar ? "تعذر فتح المرفق" : "Could not open attachment",
      );
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  const permissionInvalid =
    !requestDate ||
    reason.trim().length < 3 ||
    (permissionType === "lateness"
      ? !expectedArrival
      : !startTime || !endTime || endTime <= startTime);
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

  const visibleRows = rows.filter(
    (row) =>
      (statusFilter === "all" || row.request.status === statusFilter) &&
      memberName(row.request.staff_id).toLowerCase().includes(search.toLowerCase()),
  );
  const selected = rows.find((row) => `${row.kind}-${row.request.id}` === selectedKey);
  const requestTitle = (row: (typeof rows)[number]) =>
    row.kind === "permission"
      ? PERMISSION_LABELS[row.request.permission_type][lang]
      : LEAVE_LABELS[row.request.leave_type][lang];
  const requestDateLabel = (row: (typeof rows)[number]) =>
    row.kind === "permission"
      ? `${row.request.request_date} · ${row.request.permission_type === "lateness" ? shortTime(row.request.expected_arrival_time) : `${shortTime(row.request.start_time)}–${shortTime(row.request.end_time)}`}`
      : `${row.request.start_date} → ${row.request.end_date}`;
  const statusLabel = (status: RequestStatus) =>
    ({
      pending: ar ? "بانتظار المراجعة" : "Pending",
      approved: ar ? "معتمد" : "Approved",
      rejected: ar ? "مرفوض" : "Rejected",
      cancelled: ar ? "ملغى" : "Cancelled",
    })[status];
  return (
    <section className="qs-workforce-requests space-y-4">
      <div className="wf-toolbar">
        <div>
          <h2>{ar ? "الطلبات" : "Requests"}</h2>
          <p className="wf-note">
            {ar
              ? "مراجعة الأذونات والإجازات والمرفقات."
              : "Review permissions, leave, and supporting documents."}
          </p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus className="size-4" />
          {ar ? "طلب جديد" : "New request"}
        </Button>
      </div>
      <div className={cn("wf-detail-layout", selected && "has-detail")}>
        <section className="wf-panel">
          <div className="wf-toolbar">
            <div className="wf-filter-tabs">
              {(["pending", "approved", "rejected", "all"] as const).map((status) => (
                <button
                  key={status}
                  aria-pressed={statusFilter === status}
                  onClick={() => setStatusFilter(status)}
                >
                  {status === "all" ? (ar ? "الكل" : "All") : statusLabel(status)}{" "}
                  <small>
                    {rows.filter((row) => status === "all" || row.request.status === status).length}
                  </small>
                </button>
              ))}
            </div>
            <SearchField value={search} onChange={setSearch} ar={ar} />
          </div>
          <div className="wf-toolbar">
            <div className="wf-filter-tabs">
              {(
                [
                  ["all", ar ? "الكل" : "All types"],
                  ["permissions", ar ? "الأذونات" : "Permissions"],
                  ["leaves", ar ? "الإجازات" : "Leaves"],
                ] as const
              ).map(([id, label]) => (
                <button key={id} aria-pressed={view === id} onClick={() => setView(id)}>
                  {label}
                </button>
              ))}
            </div>
            <small>
              {canManage
                ? ar
                  ? "طلبات الفريق"
                  : "Team requests"
                : ar
                  ? "طلباتك فقط"
                  : "Your requests only"}
            </small>
          </div>
          {query.isError ? (
            <p role="alert" className="wf-empty">
              {ar ? "تعذر تحميل الطلبات." : "Requests could not be loaded."}
            </p>
          ) : query.isPending ? (
            <p className="wf-empty">{ar ? "جارٍ التحميل…" : "Loading requests…"}</p>
          ) : (
            <div className="wf-table-scroll">
              <table className="wf-table">
                <thead>
                  <tr>
                    {[
                      ar ? "عضو الفريق" : "Team member",
                      ar ? "نوع الطلب" : "Request type",
                      ar ? "الفترة" : "Date / time",
                      ar ? "مرفق" : "Attachment",
                      ar ? "الحالة" : "Status",
                    ].map((v) => (
                      <th key={v}>{v}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((row) => {
                    const r = row.request,
                      key = `${row.kind}-${r.id}`;
                    return (
                      <tr key={key} className={selectedKey === key ? "is-selected" : ""}>
                        <td data-label={ar ? "عضو الفريق" : "Team member"}>
                          <button className="wf-person-button" onClick={() => setSelectedKey(key)}>
                            <span className="wf-person">
                              <span className="wf-avatar">
                                {memberName(r.staff_id)
                                  .split(" ")
                                  .map((v) => v[0])
                                  .slice(0, 2)
                                  .join("")}
                              </span>
                              <strong>{memberName(r.staff_id)}</strong>
                            </span>
                          </button>
                        </td>
                        <td data-label={ar ? "نوع الطلب" : "Request type"}>
                          {requestTitle(row)}
                          {row.kind === "leave" && row.request.leave_type === "bereavement" ? (
                            <small className="block">
                              {row.request.family_degree === "first_degree"
                                ? ar
                                  ? "الدرجة الأولى"
                                  : "1st degree"
                                : ar
                                  ? "الدرجة الثانية"
                                  : "2nd degree"}
                            </small>
                          ) : null}
                        </td>
                        <td data-label={ar ? "الفترة" : "Date / time"}>{requestDateLabel(row)}</td>
                        <td data-label={ar ? "المرفق" : "Attachment"}>
                          {r.attachment_path ? (
                            <button
                              aria-label={ar ? "عرض المرفق" : "View attachment"}
                              className="wf-attachment-link"
                              onClick={() => void openAttachment(r.attachment_path!)}
                            >
                              <Paperclip className="size-3.5" />
                              {ar ? "مرفق" : "1 file"}
                            </button>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td data-label={ar ? "الحالة" : "Status"}>
                          <span className={cn("wf-pill", requestStatusTone(r.status))}>
                            {statusLabel(r.status)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {!query.isPending && !query.isError && !visibleRows.length ? (
            <p className="wf-empty">
              {ar ? "لا طلبات في هذا الفلتر." : "No requests in this view."}
            </p>
          ) : null}
        </section>
        {selected ? (
          <Inspector
            title={ar ? "تفاصيل الطلب" : "Request details"}
            onClose={() => setSelectedKey(null)}
            footer={
              canManage && selected.request.status === "pending" ? (
                <MasterActionSurface threshold={1} className="wf-review-actions">
                  <Button
                    variant="outline"
                    disabled={review.isPending}
                    onClick={() =>
                      review.mutate({
                        requestKind: selected.kind,
                        id: selected.request.id,
                        status: "rejected",
                      })
                    }
                  >
                    {ar ? "رفض" : "Reject"}
                  </Button>
                  <Button
                    disabled={review.isPending}
                    onClick={() =>
                      review.mutate({
                        requestKind: selected.kind,
                        id: selected.request.id,
                        status: "approved",
                      })
                    }
                  >
                    {ar ? "اعتماد" : "Approve"}
                  </Button>
                </MasterActionSurface>
              ) : undefined
            }
          >
            <div className="wf-inspector-person">
              <strong>{memberName(selected.request.staff_id)}</strong>
              <p>{requestTitle(selected)}</p>
            </div>
            <DetailRow label={ar ? "الفترة" : "Date / time"} value={requestDateLabel(selected)} />
            <DetailRow
              label={ar ? "الحالة" : "Status"}
              value={
                <span className={cn("wf-pill", requestStatusTone(selected.request.status))}>
                  {statusLabel(selected.request.status)}
                </span>
              }
            />
            <div className="wf-reason">
              <small>{ar ? "السبب" : "Reason"}</small>
              <p>{selected.request.reason}</p>
            </div>
            {selected.request.attachment_path ? (
              <Button
                variant="outline"
                className="w-full"
                onClick={() => void openAttachment(selected.request.attachment_path!)}
              >
                <Paperclip className="size-3.5" />
                <span className="truncate">
                  {selected.request.attachment_name || (ar ? "عرض المرفق" : "View attachment")}
                </span>
              </Button>
            ) : null}
            <DetailRow
              label={ar ? "ملاحظة المراجعة" : "Review note"}
              value={selected.request.review_note}
            />
          </Inspector>
        ) : null}
      </div>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!submit.isPending) setOpen(next);
        }}
      >
        <DialogContent
          className="qs-workforce-request-dialog wf-form-dialog max-h-[92dvh] w-[calc(100vw-1.5rem)] sm:max-w-[620px] overflow-hidden p-0"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <DialogHeader className="border-b border-border bg-card px-5 py-4">
            <DialogTitle className="font-display text-lg font-bold">
              {ar ? "إنشاء طلب جديد" : "New request"}
            </DialogTitle>
            <DialogDescription>
              {ar
                ? "اختر نوع الطلب وأضف التفاصيل والمرفق قبل الإرسال."
                : "Add the details for your manager to review."}
            </DialogDescription>
          </DialogHeader>

          <div className="qs-workforce-request-scroll min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
            <div className="wf-filter-tabs wf-form-tabs">
              <button
                type="button"
                onClick={() => resetForKind("permission")}
                aria-pressed={kind === "permission"}
              >
                {ar ? "إذن" : "Permission"}
              </button>
              <button
                type="button"
                onClick={() => resetForKind("leave")}
                aria-pressed={kind === "leave"}
              >
                {ar ? "إجازة" : "Leave"}
              </button>
            </div>

            {kind === "permission" ? (
              <>
                <Field label={ar ? "نوع الإذن" : "Permission type"}>
                  <Select
                    value={permissionType}
                    onValueChange={(value) => setPermissionType(value as PermissionType)}
                  >
                    <SelectTrigger className="min-h-11">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="personal">{PERMISSION_LABELS.personal[lang]}</SelectItem>
                      <SelectItem value="lateness">{PERMISSION_LABELS.lateness[lang]}</SelectItem>
                      <SelectItem value="work">{PERMISSION_LABELS.work[lang]}</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <div className="flex flex-col gap-4">
                  <RequestDatePicker
                    label={ar ? "التاريخ" : "Date"}
                    value={requestDate}
                    onChange={setRequestDate}
                    ar={ar}
                  />
                  {permissionType === "lateness" ? (
                    <RequestTimePicker
                      label={ar ? "وقت الوصول المتوقع" : "Expected arrival"}
                      value={expectedArrival}
                      onChange={setExpectedArrival}
                      ar={ar}
                    />
                  ) : (
                    <>
                      <div className="grid grid-cols-2 gap-3">
                        <RequestTimePicker
                          label={ar ? "من" : "From"}
                          value={startTime}
                          onChange={setStartTime}
                          ar={ar}
                        />
                        <RequestTimePicker
                          label={ar ? "إلى" : "To"}
                          value={endTime}
                          onChange={setEndTime}
                          ar={ar}
                        />
                      </div>
                      {endTime <= startTime ? (
                        <p role="status" className="text-xs text-destructive">
                          {ar
                            ? "اختر وقت انتهاء بعد وقت البداية."
                            : "Choose an end time after the start time."}
                        </p>
                      ) : null}
                    </>
                  )}
                </div>
              </>
            ) : (
              <>
                <Field label={ar ? "نوع الإجازة" : "Leave type"}>
                  <Select
                    value={leaveType}
                    onValueChange={(value) => setLeaveType(value as LeaveType)}
                  >
                    <SelectTrigger className="min-h-11">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="annual">{LEAVE_LABELS.annual[lang]}</SelectItem>
                      <SelectItem value="sick">{LEAVE_LABELS.sick[lang]}</SelectItem>
                      <SelectItem value="hajj">{LEAVE_LABELS.hajj[lang]}</SelectItem>
                      <SelectItem value="bereavement">{LEAVE_LABELS.bereavement[lang]}</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                {leaveType === "bereavement" ? (
                  <Field label={ar ? "درجة القرابة" : "Family degree"}>
                    <Select
                      value={familyDegree}
                      onValueChange={(value) => setFamilyDegree(value as FamilyDegree)}
                    >
                      <SelectTrigger className="min-h-11">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="first_degree">
                          {ar ? "الدرجة الأولى" : "1st Degree Family"}
                        </SelectItem>
                        <SelectItem value="second_degree">
                          {ar ? "الدرجة الثانية" : "2nd Degree Family"}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                ) : null}
                <div className="grid gap-4 sm:grid-cols-2">
                  <RequestDatePicker
                    label={ar ? "من تاريخ" : "Start date"}
                    value={leaveStart}
                    onChange={(next) => {
                      setLeaveStart(next);
                      if (leaveEnd < next) setLeaveEnd(next);
                    }}
                    ar={ar}
                  />
                  <RequestDatePicker
                    label={ar ? "إلى تاريخ" : "End date"}
                    value={leaveEnd}
                    onChange={setLeaveEnd}
                    min={leaveStart}
                    ar={ar}
                  />
                </div>
              </>
            )}

            {kind === "leave" ? (
              <div className="wf-duration">
                <Clock3 className="size-4" />
                {Math.max(
                  0,
                  Math.round(
                    (new Date(`${leaveEnd}T12:00:00`).getTime() -
                      new Date(`${leaveStart}T12:00:00`).getTime()) /
                      86400000,
                  ) + 1,
                )}{" "}
                {ar ? "أيام" : "days"}
              </div>
            ) : permissionType !== "lateness" && endTime > startTime ? (
              <div className="wf-duration">
                <Clock3 className="size-4" />
                {(() => {
                  const mins = (v: string) => Number(v.slice(0, 2)) * 60 + Number(v.slice(3, 5));
                  const n = mins(endTime) - mins(startTime);
                  return `${Math.floor(n / 60)}${ar ? "س" : "h"} ${n % 60}${ar ? "د" : "m"}`;
                })()}
              </div>
            ) : null}
            <Field label={ar ? "السبب" : "Reason"}>
              <Textarea
                rows={4}
                className="min-h-24"
                maxLength={2000}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder={ar ? "اكتب سبب الطلب بوضوح..." : "Explain the request clearly..."}
              />
            </Field>

            <div className="rounded-2xl border border-dashed border-border bg-muted/20 p-4">
              <div className="flex items-start gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-orange-500/10 text-[#e85d2a]">
                  <Upload className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <Label htmlFor="workforce-request-file" className="text-sm font-bold">
                    {ar ? "المرفق" : "Attachment"}
                  </Label>
                  <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
                    {leaveType === "sick" && kind === "leave"
                      ? ar
                        ? "مطلوب للإجازة المرضية. PDF أو صورة بحد أقصى 10 ميغابايت."
                        : "Required for Sick Leave. PDF or image, max 10 MB."
                      : ar
                        ? "اختياري: PDF أو صورة بحد أقصى 10 ميغابايت."
                        : "Optional: PDF or image, max 10 MB."}
                  </p>
                  <Input
                    id="workforce-request-file"
                    type="file"
                    accept=".pdf,image/jpeg,image/png,image/webp"
                    className="mt-3 min-h-11"
                    onChange={(event) => setAttachment(event.target.files?.[0] ?? null)}
                  />
                  {attachment ? (
                    <p className="mt-2 flex items-center gap-2 truncate text-[11px] font-semibold text-foreground">
                      <Paperclip className="size-3.5 shrink-0" />
                      {attachment.name}
                      <button
                        type="button"
                        className="text-destructive"
                        onClick={() => setAttachment(null)}
                      >
                        {ar ? "إزالة" : "Remove"}
                      </button>
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="wf-form-footer border-t border-border bg-card px-5 py-4">
            <small>{ar ? "سيتم إرساله للمراجعة." : "Will be submitted for review."}</small>
            <Button variant="outline" disabled={submit.isPending} onClick={() => setOpen(false)}>
              {ar ? "إلغاء" : "Cancel"}
            </Button>
            <Button disabled={invalid || submit.isPending} onClick={() => submit.mutate()}>
              {submit.isPending
                ? ar
                  ? "جارٍ الإرسال…"
                  : "Submitting…"
                : ar
                  ? "إرسال للمراجعة"
                  : "Submit request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function RequestMetric({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  icon: typeof CalendarDays;
  tone: "orange" | "blue" | "green" | "purple";
}) {
  const toneClass =
    tone === "orange"
      ? "bg-orange-500/10 text-orange-600"
      : tone === "blue"
        ? "bg-blue-500/10 text-blue-600"
        : tone === "green"
          ? "bg-emerald-500/10 text-emerald-600"
          : "bg-violet-500/10 text-violet-600";
  return (
    <div className="flex min-w-0 items-center gap-3 border-t border-border p-4 sm:border-t-0 sm:border-e">
      <span className={cn("grid size-9 shrink-0 place-items-center rounded-xl", toneClass)}>
        <Icon className="size-4" />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[10px] font-bold uppercase tracking-[.05em] text-muted-foreground">
          {label}
        </span>
        <strong className="mt-0.5 block font-display text-xl">{value}</strong>
      </span>
    </div>
  );
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
  onAttachment: (() => void) | undefined;
  canReview: boolean;
  pending: boolean;
  onApprove: () => void;
  onReject: () => void;
  ar: boolean;
}) {
  return (
    <article className="qs-workforce-request-row grid gap-3 p-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto] lg:items-center">
      <div className="flex min-w-0 items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-orange-500/[.08] text-[#e85d2a]">
          <Icon className="size-4" />
        </span>
        <span className="min-w-0">
          <strong className="block truncate text-sm">{title}</strong>
          <span className="mt-1 block truncate text-[11px] font-semibold text-muted-foreground">
            {staff} · {meta}
          </span>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{reason}</p>
        </span>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        {onAttachment ? (
          <button
            type="button"
            onClick={onAttachment}
            className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-[10px] font-bold text-muted-foreground transition hover:text-foreground"
          >
            <Paperclip className="size-3.5 shrink-0" />
            <span className="truncate">
              {attachmentName || (ar ? "عرض المرفق" : "View attachment")}
            </span>
          </button>
        ) : (
          <span className="text-[10px] text-muted-foreground">
            {ar ? "بدون مرفق" : "No attachment"}
          </span>
        )}
        <span
          className={cn(
            "rounded-full px-2.5 py-1 text-[9px] font-bold capitalize",
            requestStatusTone(status),
          )}
        >
          {status}
        </span>
      </div>
      {canReview ? (
        <div className="flex items-center gap-2 lg:justify-end">
          <Button size="sm" variant="outline" disabled={pending} onClick={onReject}>
            <XCircle className="size-4 text-red-600" />
            {ar ? "رفض" : "Reject"}
          </Button>
          <Button size="sm" disabled={pending} onClick={onApprove}>
            <CheckCircle2 className="size-4" />
            {ar ? "اعتماد" : "Approve"}
          </Button>
        </div>
      ) : null}
    </article>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
