import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  CalendarClock,
  CalendarPlus,
  CalendarX2,
  ChevronLeft,
  ChevronRight,
  History,
  IdCard,
  KeyRound,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  UserRound,
  UsersRound,
} from "lucide-react";
import { toast } from "sonner";

import { MasterEyebrow, MasterKpi, MasterPageHeader } from "@/components/app/MasterPage";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useAccess, useSupabaseSession } from "@/hooks/useSession";
import { useRestaurantSeatUsage } from "@/hooks/useRestaurantSeatUsage";
import { assignRecurringStaffShifts, assignStaffShift, cancelStaffShiftAssignment } from "@/hooks/useOperations";
import { supabase } from "@/integrations/supabase/client";
import { avatarPresetUrl } from "@/lib/avatar-presets";
import { humanError } from "@/lib/errors";
import { useI18n } from "@/lib/i18n";
import {
  PERMISSION_GROUPS,
  ROLE_LABELS,
  roleHasCapability,
  type AppRole,
  type Capability,
  type PermissionOverrides,
} from "@/lib/permissions";
import { qrDataUrl } from "@/lib/qr";
import { getStaffAccess } from "@/lib/staff-auth.functions";
import { inviteStaffMember, removeStaffMember, updateStaffMember } from "@/lib/staff.functions";
import { cn } from "@/lib/utils";

const ROLES: AppRole[] = [
  "restaurant_admin",
  "operations_manager",
  "manager",
  "kitchen",
  "waiter",
  "cashier",
  "host",
  "inventory",
  "procurement",
  "accountant",
];
const ROLE_NAMES: Record<AppRole, { en: string; ar: string }> = ROLE_LABELS;
const TEAM_SHIFT_WEEKDAYS = [
  { value: 0, en: "Sun", ar: "الأحد" },
  { value: 1, en: "Mon", ar: "الاثنين" },
  { value: 2, en: "Tue", ar: "الثلاثاء" },
  { value: 3, en: "Wed", ar: "الأربعاء" },
  { value: 4, en: "Thu", ar: "الخميس" },
  { value: 5, en: "Fri", ar: "الجمعة" },
  { value: 6, en: "Sat", ar: "السبت" },
] as const;
const ROLE_TONE: Record<string, string> = {
  restaurant_admin: "bg-orange-500/12 text-orange-600",
  operations_manager: "bg-sky-500/12 text-sky-600",
  manager: "bg-blue-500/12 text-blue-600",
  kitchen: "bg-rose-500/12 text-rose-600",
  waiter: "bg-violet-500/12 text-violet-600",
  cashier: "bg-emerald-500/12 text-emerald-600",
  host: "bg-cyan-500/12 text-cyan-600",
  inventory: "bg-indigo-500/12 text-indigo-600",
  procurement: "bg-amber-500/12 text-amber-700",
  accountant: "bg-teal-500/12 text-teal-600",
};
type StaffTab = "all" | "on_shift" | "off_shift" | "leave";
type DrawerTab = "permissions" | "profile" | "log";
type StaffRow = {
  id: string;
  auth_user_id: string;
  created_at: string;
  email: string | null;
  is_active: boolean;
  name: string;
  restaurant_id: string | null;
  role: AppRole;
  updated_at: string;
  avatar_url?: string | null;
  avatar_preset?: string | null;
  permission_overrides?: PermissionOverrides | null;
  last_seen_at?: string | null;
};
type Editing = StaffRow & {
  password: string;
  confirmPassword: string;
  permission_overrides: PermissionOverrides;
};
type AuditRow = {
  id: string;
  action: string;
  entity: string | null;
  created_at: string;
  metadata: unknown;
};
type StaffScheduleRow = {
  id: string;
  name: string;
  shift_date: string;
  planned_start: string | null;
  planned_end: string | null;
  status: string;
};
type StaffAssignmentRow = {
  id: string;
  shift_id: string;
  staff_id: string;
  starts_at: string | null;
  ends_at: string | null;
  status: string;
};
type StaffTimeRow = { staff_id: string; clock_in: string; clock_out: string | null };
type StaffLeaveRow = { staff_id: string; start_date: string; end_date: string; status: string };
type StaffScheduleSummary = {
  name: string;
  start: string | null;
  end: string | null;
  status: string;
  shiftDate: string;
  phase: "upcoming" | "active" | "completed" | "late" | "missed";
  count: number;
  distance: number;
  attendance: "on_time" | "late" | "left_early" | "overtime" | "not_clocked";
  attendanceMinutes: number;
  attendanceAt: string | null;
};
type StaffCancelableShift = {
  assignmentId: string;
  shiftId: string;
  name: string;
  shiftDate: string;
  start: string | null;
  end: string | null;
  status: string;
  distance: number;
};

export function StaffManagerAdvanced({ restaurantId }: { restaurantId: string }) {
  const { t, lang } = useI18n();
  const ar = lang === "ar";
  const accessHook = useAccess();
  const session = useSupabaseSession();
  const currentUserId = session.data?.user.id ?? null;
  const isSuperAdmin = accessHook.isSuperAdmin;
  const canManageShifts = accessHook.canFor(restaurantId, "manage_shifts");
  const assignableRoles = isSuperAdmin
    ? ROLES
    : ROLES.filter((role) => role !== "restaurant_admin");
  const qc = useQueryClient();
  const seats = useRestaurantSeatUsage(restaurantId);
  const seatLimit = seats.data?.limit ?? null;
  const seatsUsed = seats.data?.used ?? 0;
  const seatsFull = seatLimit !== null && seatsUsed >= seatLimit;
  const invite = useServerFn(inviteStaffMember);
  const update = useServerFn(updateStaffMember);
  const remove = useServerFn(removeStaffMember);
  const readAccess = useServerFn(getStaffAccess);
  const [addOpen, setAddOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<StaffTab>("all");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [teamPage, setTeamPage] = useState(1);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [drawerTab, setDrawerTab] = useState<DrawerTab>("permissions");
  const [pendingDelete, setPendingDelete] = useState<StaffRow | null>(null);
  const [credentials, setCredentials] = useState<any>(null);
  const [access, setAccess] = useState<any>(null);
  const [badge, setBadge] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", email: "", role: "waiter" as AppRole });
  const [presenceNow, setPresenceNow] = useState(() => Date.now());
  const timezone = useQuery<string>({
    queryKey: ["restaurant-timezone", restaurantId],
    staleTime: 30 * 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase.from("restaurants") as any)
        .select("timezone")
        .eq("id", restaurantId)
        .single();
      if (error) throw error;
      return String(data?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
    },
  });
  const restaurantTimezone = timezone.data || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const scheduleDayKey = dateKeyInTimeZone(new Date(presenceNow), restaurantTimezone);
  const [shiftMember, setShiftMember] = useState<StaffRow | null>(null);
  const [cancelShiftTarget, setCancelShiftTarget] = useState<{
    member: StaffRow;
    shift: StaffCancelableShift;
  } | null>(null);

  useEffect(() => {
    const refreshClock = () => setPresenceNow(Date.now());
    const handleVisibility = () => {
      if (document.visibilityState === "visible") refreshClock();
    };
    const timer = window.setInterval(refreshClock, 15_000);
    window.addEventListener("focus", refreshClock);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshClock);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  const staff = useQuery<StaffRow[]>({
    queryKey: ["platform", "staff", restaurantId],
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
    queryFn: async () => {
      const { data, error } = await (supabase.from("staff") as any)
        .select("*")
        .eq("restaurant_id", restaurantId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as StaffRow[];
    },
  });
  const schedule = useQuery<{
    shifts: StaffScheduleRow[];
    assignments: StaffAssignmentRow[];
    time: StaffTimeRow[];
    leave: StaffLeaveRow[];
  }>({
    queryKey: ["platform", "staff-schedule", restaurantId, scheduleDayKey],
    refetchInterval: 20_000,
    refetchIntervalInBackground: false,
    queryFn: async () => {
      // Keep persisted recurring rules materialized before resolving "Today's Shift".
      // This is idempotent and also repairs any missing future occurrence.
      const { error: refreshError } = await (supabase as any).rpc("refresh_recurring_staff_schedules", {
        _restaurant_id: restaurantId,
        _horizon_days: 84,
      });
      if (refreshError && !String(refreshError.message ?? "").includes("Could not find the function")) throw refreshError;

      const today = scheduleDayKey;
      const historyStart = addLocalDays(today, -7);
      const horizon = addLocalDays(today, 60);
      const since = new Date(presenceNow - 7 * 86_400_000).toISOString();
      const [shiftsResult, assignmentsResult, timeResult, leaveResult] = await Promise.all([
        (supabase.from("shifts" as any) as any)
          .select("id,name,shift_date,planned_start,planned_end,status")
          .eq("restaurant_id", restaurantId)
          .is("deleted_at", null)
          .gte("shift_date", historyStart)
          .lte("shift_date", horizon)
          .order("shift_date", { ascending: true }),
        (supabase.from("shift_assignments" as any) as any)
          .select("id,shift_id,staff_id,starts_at,ends_at,status")
          .eq("restaurant_id", restaurantId),
        (supabase.from("staff_time_entries" as any) as any)
          .select("staff_id,clock_in,clock_out")
          .eq("restaurant_id", restaurantId)
          .gte("clock_in", since),
        (supabase.from("staff_leave_requests" as any) as any)
          .select("staff_id,start_date,end_date,status")
          .eq("restaurant_id", restaurantId)
          .eq("status", "approved")
          .lte("start_date", today)
          .gte("end_date", today),
      ]);
      for (const result of [shiftsResult, assignmentsResult, timeResult, leaveResult])
        if (result.error) throw result.error;
      return {
        shifts: (shiftsResult.data ?? []) as StaffScheduleRow[],
        assignments: (assignmentsResult.data ?? []) as StaffAssignmentRow[],
        time: (timeResult.data ?? []) as StaffTimeRow[],
        leave: (leaveResult.data ?? []) as StaffLeaveRow[],
      };
    },
  });
  useEffect(() => {
    const channel = supabase
      .channel(`team-presence:${restaurantId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "staff",
          filter: `restaurant_id=eq.${restaurantId}`,
        },
        () => void qc.invalidateQueries({ queryKey: ["platform", "staff", restaurantId] }),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [qc, restaurantId]);

  useEffect(() => {
    const refreshSchedule = () => {
      void Promise.all([
        qc.invalidateQueries({ queryKey: ["platform", "staff-schedule", restaurantId] }),
        qc.invalidateQueries({ queryKey: ["operations", "shifts", restaurantId] }),
        qc.invalidateQueries({ queryKey: ["operations", "shift-assignments", restaurantId] }),
      ]);
    };
    const channel = supabase
      .channel(`team-schedule-live:${restaurantId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "shifts", filter: `restaurant_id=eq.${restaurantId}` }, refreshSchedule)
      .on("postgres_changes", { event: "*", schema: "public", table: "shift_assignments", filter: `restaurant_id=eq.${restaurantId}` }, refreshSchedule)
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [qc, restaurantId]);
  const audit = useQuery<AuditRow[]>({
    queryKey: ["platform", "staff-audit", restaurantId, editing?.auth_user_id],
    enabled: Boolean(editing && drawerTab === "log"),
    queryFn: async () => {
      if (!editing) return [];
      const { data, error } = await supabase
        .from("audit_logs")
        .select("id, action, entity, created_at, metadata")
        .eq("restaurant_id", restaurantId)
        .eq("actor_user_id", editing.auth_user_id)
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return (data ?? []) as AuditRow[];
    },
  });
  const admins = (staff.data ?? []).filter((row) => row.role === "restaurant_admin").length;
  const staffOnly = (staff.data ?? []).length - admins;
  const scheduleByStaff = useMemo(() => {
    const result = new Map<string, StaffScheduleSummary>();
    const shiftsById = new Map((schedule.data?.shifts ?? []).map((shift) => [shift.id, shift]));
    const now = presenceNow;

    for (const assignment of schedule.data?.assignments ?? []) {
      if (assignment.status === "released") continue;
      const shift = shiftsById.get(assignment.shift_id);
      if (!shift) continue;

      const start = assignment.starts_at ?? shift.planned_start;
      const end = assignment.ends_at ?? shift.planned_end;
      const startMs = start ? new Date(start).getTime() : Number.NaN;
      const endMs = end ? new Date(end).getTime() : Number.NaN;
      const startsToday = Number.isFinite(startMs) && dateKeyInTimeZone(new Date(startMs), restaurantTimezone) === scheduleDayKey;
      const endsToday = Number.isFinite(endMs) && dateKeyInTimeZone(new Date(Math.max(startMs || 0, endMs - 1)), restaurantTimezone) === scheduleDayKey;
      const shiftDateToday = shift.shift_date === scheduleDayKey;
      const activeAcrossMidnight = Number.isFinite(startMs) && Number.isFinite(endMs) && startMs <= now && endMs >= now;
      if (!shiftDateToday && !startsToday && !endsToday && !activeAcrossMidnight) continue;

      const existing = result.get(assignment.staff_id);
      const entry = (schedule.data?.time ?? []).find(
        (time) =>
          time.staff_id === assignment.staff_id &&
          (!Number.isFinite(endMs) || new Date(time.clock_in).getTime() <= endMs) &&
          (!time.clock_out || !Number.isFinite(startMs) || new Date(time.clock_out).getTime() >= startMs),
      );
      const attendance = scheduleAttendance(start, end, entry);
      const actualStartMs = entry ? new Date(entry.clock_in).getTime() : Number.NaN;
      const actualEndMs = entry?.clock_out ? new Date(entry.clock_out).getTime() : now;
      const attendanceMinutes =
        attendance === "late" && Number.isFinite(actualStartMs) && Number.isFinite(startMs)
          ? Math.max(0, Math.round((actualStartMs - startMs) / 60_000))
          : attendance === "left_early" && Number.isFinite(actualEndMs) && Number.isFinite(endMs)
            ? Math.max(0, Math.round((endMs - actualEndMs) / 60_000))
            : attendance === "overtime" && Number.isFinite(actualEndMs) && Number.isFinite(endMs)
              ? Math.max(0, Math.round((actualEndMs - endMs) / 60_000))
              : 0;
      const attendanceAt = entry?.clock_in ?? null;
      const completed = shift.status === "closed" || Boolean(entry?.clock_out);
      const active = Boolean(entry && !entry.clock_out) || (Number.isFinite(startMs) && Number.isFinite(endMs) && startMs <= now && endMs >= now && assignment.status === "present");
      const late = !entry && Number.isFinite(startMs) && Number.isFinite(endMs) && now >= startMs + 15 * 60_000 && now <= endMs;
      const missed = !entry && Number.isFinite(endMs) && endMs < now;
      const phase: StaffScheduleSummary["phase"] = completed ? "completed" : active ? "active" : late ? "late" : missed ? "missed" : "upcoming";
      const distance = Number.isFinite(startMs) && Number.isFinite(endMs) ? (now < startMs ? startMs - now : now > endMs ? now - endMs : 0) : 0;
      const count = (existing?.count ?? 0) + 1;

      if (!existing || phase === "active" || distance < existing.distance) {
        result.set(assignment.staff_id, {
          name: shift.name,
          start,
          end,
          status: assignment.status,
          shiftDate: shift.shift_date,
          phase,
          count,
          distance,
          attendance,
          attendanceMinutes,
          attendanceAt,
        });
      } else {
        result.set(assignment.staff_id, { ...existing, count });
      }
    }
    return result;
  }, [presenceNow, restaurantTimezone, schedule.data, scheduleDayKey]);
  const cancellableShiftByStaff = useMemo(() => {
    const result = new Map<string, StaffCancelableShift>();
    const shiftsById = new Map((schedule.data?.shifts ?? []).map((shift) => [shift.id, shift]));
    const now = presenceNow;
    const today = localDateKey(new Date(now));
    for (const assignment of schedule.data?.assignments ?? []) {
      if (assignment.status === "released") continue;
      const shift = shiftsById.get(assignment.shift_id);
      if (!shift || shift.status === "closed") continue;
      const start = assignment.starts_at ?? shift.planned_start;
      const end = assignment.ends_at ?? shift.planned_end;
      const endMs = end ? new Date(end).getTime() : Number.NaN;
      const stillActiveOrUpcoming = Number.isFinite(endMs)
        ? endMs >= now
        : shift.shift_date >= today;
      if (!stillActiveOrUpcoming) continue;
      const startMs = start
        ? new Date(start).getTime()
        : new Date(`${shift.shift_date}T00:00:00`).getTime();
      const distance = Number.isFinite(startMs) && startMs > now ? startMs - now : 0;
      const existing = result.get(assignment.staff_id);
      if (!existing || distance < existing.distance) {
        result.set(assignment.staff_id, {
          assignmentId: assignment.id,
          shiftId: shift.id,
          name: shift.name,
          shiftDate: shift.shift_date,
          start,
          end,
          status: assignment.status,
          distance,
        });
      }
    }
    return result;
  }, [presenceNow, schedule.data]);

  const openClockByStaff = useMemo(() => {
    const result = new Map<string, StaffTimeRow>();
    for (const entry of schedule.data?.time ?? []) {
      if (!entry.clock_out && !result.has(entry.staff_id)) result.set(entry.staff_id, entry);
    }
    return result;
  }, [schedule.data?.time]);
  const leaveStaffIds = useMemo(
    () => new Set((schedule.data?.leave ?? []).map((row) => row.staff_id)),
    [schedule.data?.leave],
  );
  const activeTeam = (staff.data ?? []).filter((row) => row.is_active);
  const onShiftNow = activeTeam.filter((row) => openClockByStaff.has(row.id)).length;
  const onLeaveNow = activeTeam.filter((row) => leaveStaffIds.has(row.id)).length;
  const offShiftNow = Math.max(0, activeTeam.length - onShiftNow - onLeaveNow);
  const scheduledToday = activeTeam.filter((row) => scheduleByStaff.has(row.id)).length;
  const notClockedToday = activeTeam.filter((row) => scheduleByStaff.has(row.id) && !openClockByStaff.has(row.id) && !leaveStaffIds.has(row.id)).length;
  const attendancePercent = scheduledToday ? Math.min(100, Math.round((onShiftNow / scheduledToday) * 100)) : 0;
  const shiftDistribution = activeTeam.reduce(
    (acc, member) => {
      const scheduleInfo = scheduleByStaff.get(member.id);
      if (!scheduleInfo?.start) return acc;
      const hour = new Date(scheduleInfo.start).getHours();
      if (hour < 12) acc.morning += 1;
      else if (hour < 17) acc.afternoon += 1;
      else if (hour < 22) acc.evening += 1;
      else acc.night += 1;
      return acc;
    },
    { morning: 0, afternoon: 0, evening: 0, night: 0 },
  );
  const maxDistribution = Math.max(1, shiftDistribution.morning, shiftDistribution.afternoon, shiftDistribution.evening, shiftDistribution.night);
  const upcomingTeamShifts = activeTeam
    .map((member) => ({ member, schedule: scheduleByStaff.get(member.id) }))
    .filter((item): item is { member: StaffRow; schedule: StaffScheduleSummary } => item.schedule != null && item.schedule.phase !== "missed" && item.schedule.phase !== "completed")
    .sort((a, b) => new Date(a.schedule.start ?? 0).getTime() - new Date(b.schedule.start ?? 0).getTime())
    .slice(0, 4);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (staff.data ?? []).filter((row) => {
      const isClocked = openClockByStaff.has(row.id);
      const isOnLeave = leaveStaffIds.has(row.id);
      if (tab === "on_shift" && !isClocked) return false;
      if (tab === "off_shift" && (isClocked || isOnLeave)) return false;
      if (tab === "leave" && !isOnLeave) return false;
      if (roleFilter !== "all" && row.role !== roleFilter) return false;
      if (statusFilter === "active" && !row.is_active) return false;
      if (statusFilter === "inactive" && row.is_active) return false;
      return !q || `${row.name} ${row.email ?? ""} ${row.role}`.toLowerCase().includes(q);
    });
  }, [leaveStaffIds, openClockByStaff, roleFilter, search, staff.data, statusFilter, tab]);

  const TEAM_PAGE_SIZE = 8;
  const teamPageCount = Math.max(1, Math.ceil(rows.length / TEAM_PAGE_SIZE));
  const currentTeamPage = Math.min(teamPage, teamPageCount);
  const visibleRows = rows.slice((currentTeamPage - 1) * TEAM_PAGE_SIZE, currentTeamPage * TEAM_PAGE_SIZE);
  const firstVisibleIndex = rows.length ? (currentTeamPage - 1) * TEAM_PAGE_SIZE + 1 : 0;
  const lastVisibleIndex = Math.min(rows.length, currentTeamPage * TEAM_PAGE_SIZE);

  useEffect(() => {
    setTeamPage(1);
  }, [search, roleFilter, statusFilter, tab]);

  useEffect(() => {
    if (teamPage > teamPageCount) setTeamPage(teamPageCount);
  }, [teamPage, teamPageCount]);

  async function refresh() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["platform"] }),
      qc.invalidateQueries({ queryKey: ["staff"] }),
      qc.invalidateQueries({ queryKey: ["seats", restaurantId] }),
    ]);
  }
  function isOwnRestaurantManager(member: StaffRow) {
    return (
      !isSuperAdmin &&
      member.role === "restaurant_admin" &&
      Boolean(currentUserId) &&
      member.auth_user_id === currentUserId
    );
  }
  function startEdit(member: StaffRow) {
    setEditing({
      ...member,
      password: "",
      confirmPassword: "",
      permission_overrides: { ...(member.permission_overrides ?? {}) },
    });
    setDrawerTab(isOwnRestaurantManager(member) ? "profile" : "permissions");
  }
  function permissionEnabled(cap: Capability) {
    if (!editing) return false;
    return roleHasCapability(editing.role, cap) && editing.permission_overrides?.[cap] !== false;
  }
  function setPermission(cap: Capability, value: boolean) {
    if (!editing || !roleHasCapability(editing.role, cap)) return;
    setEditing({
      ...editing,
      permission_overrides: { ...editing.permission_overrides, [cap]: value },
    });
  }
  async function create() {
    if (seatsFull) {
      toast.error(
        ar
          ? "تم الوصول إلى حد المستخدمين لهذا المطعم."
          : "This restaurant has reached its user limit.",
      );
      return;
    }
    setBusy(true);
    try {
      const result = await invite({
        data: { restaurantId, email: form.email.trim(), name: form.name.trim(), role: form.role },
      });
      setCredentials(result);
      setAddOpen(false);
      setForm({ name: "", email: "", role: "waiter" });
      await refresh();
      toast.success(ar ? "تمت إضافة الموظف" : "Team member added");
    } catch (error) {
      toast.error(humanError(error, lang));
    } finally {
      setBusy(false);
    }
  }
  async function saveEdit() {
    if (!editing) return;
    const password = editing.password.trim();
    const nextName = editing.name.trim().replace(/\s+/g, " ");
    if (!nextName) {
      toast.error(ar ? "الاسم مطلوب." : "Name is required.");
      return;
    }
    if (nextName.length > 80) {
      toast.error(
        ar
          ? "الاسم طويل جداً. الحد الأقصى 80 حرفاً."
          : "The name is too long. Maximum 80 characters.",
      );
      return;
    }
    const ownRestaurantManager = isOwnRestaurantManager(editing);
    if (!ownRestaurantManager) {
      if (password && password.length < 8) {
        toast.error(
          ar ? "كلمة المرور 8 أحرف على الأقل." : "Password must be at least 8 characters.",
        );
        return;
      }
      if (password !== editing.confirmPassword) {
        toast.error(ar ? "كلمتا المرور غير متطابقتين." : "Passwords do not match.");
        return;
      }
    }
    setBusy(true);
    try {
      if (ownRestaurantManager) {
        const { error: staffError } = await (supabase as any).rpc("update_own_display_name", {
          _staff_id: editing.id,
          _name: nextName,
        });
        if (staffError) throw staffError;
        const { error: metadataError } = await supabase.auth.updateUser({
          data: { full_name: nextName, name: nextName },
        });
        if (metadataError)
          console.warn("Display-name metadata sync skipped:", metadataError.message);
        await Promise.all([
          refresh(),
          qc.invalidateQueries({ queryKey: ["auth", "session"] }),
          qc.invalidateQueries({ queryKey: ["staff", "memberships"] }),
        ]);
        setEditing(null);
        toast.success(ar ? "تم تحديث اسم مدير المطعم" : "Restaurant Manager name updated");
        return;
      }
      await update({
        data: {
          staffId: editing.id,
          name: nextName,
          email: editing.email?.trim() || undefined,
          role: editing.role,
          isActive: editing.is_active,
          permissionOverrides: editing.permission_overrides,
          ...(password ? { password } : {}),
        },
      });
      await refresh();
      setEditing(null);
      toast.success(ar ? "تم حفظ التغييرات" : "Changes saved");
    } catch (error) {
      toast.error(humanError(error, lang));
    } finally {
      setBusy(false);
    }
  }

  async function del() {
    if (!pendingDelete) return;
    setBusy(true);
    try {
      await remove({ data: { staffId: pendingDelete.id } });
      await refresh();
      setPendingDelete(null);
      setEditing(null);
      toast.success(ar ? "تم حذف المستخدم" : "Team member deleted");
    } catch (error) {
      toast.error(humanError(error, lang));
    } finally {
      setBusy(false);
    }
  }
  async function openAccess(id: string) {
    try {
      const result = await readAccess({ data: { staffId: id } });
      setAccess(result);
      setBadge(
        result.badgeCode
          ? await qrDataUrl(`${location.origin}/staff/badge/${result.badgeCode}`, 420)
          : null,
      );
    } catch (error) {
      toast.error(humanError(error, lang));
    }
  }

  return (
    <div className="qs-workforce-screen qs-workforce-team qs-approved-team-page qs-viewport-fill flex h-full min-h-0 flex-col gap-4">
      <div className="qs-approved-team-layout grid min-h-0 flex-1 gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(300px,.55fr)]">
        <div className="flex min-h-0 min-w-0 flex-col gap-4">
      <div className="qs-workforce-hero qs-approved-page-hero">
      <MasterPageHeader
        eyebrow={
          <MasterEyebrow icon={UsersRound}>{ar ? "إدارة الفريق" : "Team management"}</MasterEyebrow>
        }
        title={ar ? "الفريق" : "Team"}
        description={
          ar
            ? "أدر فريق المطعم، الورديات، الحضور والصلاحيات من مساحة عمل حديثة واحدة."
            : "Manage your staff, assign shifts, track live attendance and keep every role organized."
        }
        actions={
          <Button className="min-w-32 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md" disabled={seats.isPending || seatsFull} onClick={() => setAddOpen(true)}>
            <Plus className="size-4" />
            {seatsFull ? (ar ? "اكتمل الحد" : "Limit reached") : ar ? "إضافة موظف" : "Add staff"}
          </Button>
        }
      />
      </div>

      <section className="qs-workforce-kpis grid gap-3 sm:grid-cols-2 xl:grid-cols-4 [&>article]:transition-all [&>article]:duration-200 [&>article:hover]:-translate-y-0.5 [&>article:hover]:shadow-md">
        <MasterKpi icon={UsersRound} label={ar ? "إجمالي الفريق" : "Total Staff"} value={String((staff.data ?? []).length)} hint={seatLimit == null ? (ar ? "غير محدود" : "Unlimited seats") : `${seatsUsed}/${seatLimit} seats`} tone="blue" />
        <MasterKpi icon={CalendarClock} label={ar ? "على رأس العمل" : "On Shift Now"} value={String(onShiftNow)} hint={ar ? "حضور حي الآن" : "Live attendance"} tone="green" />
        <MasterKpi icon={UserRound} label={ar ? "خارج الوردية" : "Off Shift"} value={String(offShiftNow)} hint={ar ? "متاحون خارج الدوام" : "Not clocked in"} tone="slate" />
        <MasterKpi icon={CalendarPlus} label={ar ? "في إجازة" : "On Leave"} value={String(onLeaveNow)} hint={ar ? "إجازة معتمدة اليوم" : "Approved today"} tone={onLeaveNow ? "purple" : "orange"} />
      </section>

      <section className="qs-workforce-board qs-card qs-viewport-fill flex min-h-0 min-w-0 flex-col overflow-hidden">
        <div className="border-b border-border bg-muted/10 p-3">
          <div className="flex w-full gap-1 overflow-x-auto rounded-xl bg-muted/50 p-1 lg:w-auto lg:max-w-fit">
            {(
              [
                ["all", ar ? "كل الفريق" : "All Staff", (staff.data ?? []).length],
                ["on_shift", ar ? "على رأس العمل" : "On Shift", onShiftNow],
                ["off_shift", ar ? "خارج الوردية" : "Off Shift", offShiftNow],
                ["leave", ar ? "إجازة" : "On Leave", onLeaveNow],
              ] as const
            ).map(([id, label, count]) => (
              <button key={id} type="button" onClick={() => setTab(id)} className={cn(
                "inline-flex min-h-9 shrink-0 items-center gap-2 rounded-lg px-3 text-xs font-bold transition-all duration-200",
                tab === id ? "bg-card text-[#e85d2a] shadow-sm ring-1 ring-border" : "text-muted-foreground hover:bg-card/60 hover:text-foreground",
              )}>
                {label}
                <span className={cn("rounded-full px-2 py-0.5 text-[10px]", tab === id ? "bg-orange-500/10 text-[#cf4818]" : "bg-background text-muted-foreground")}>{count}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="grid gap-2.5 border-b border-border bg-card p-3 lg:grid-cols-[minmax(0,1fr)_160px_160px]">
          <div className="relative">
            <Search className="pointer-events-none absolute start-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={ar ? "ابحث بالاسم أو البريد أو الدور..." : "Search staff, role or email..."} className="h-11 rounded-xl ps-10 pe-3.5" />
          </div>
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className="h-10 rounded-xl"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">{ar ? "كل الأدوار" : "All Roles"}</SelectItem>{ROLES.map((role) => <SelectItem key={role} value={role}>{ROLE_NAMES[role][lang]}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-10 rounded-xl"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">{ar ? "كل الحالات" : "All Status"}</SelectItem><SelectItem value="active">{t("common.active")}</SelectItem><SelectItem value="inactive">{t("common.inactive")}</SelectItem></SelectContent>
          </Select>
        </div>
        {staff.isPending ? (
          <Skeleton className="m-4 h-[420px] rounded-xl" />
        ) : (
          <>
            <div className="qs-team-table-wrap hidden min-h-0 flex-1 overflow-hidden xl:block">
              <table className="qs-team-table qs-table w-full min-w-[1180px] table-fixed">
                <colgroup><col className="w-[5%]" /><col className="w-[19%]" /><col className="w-[13%]" /><col className="w-[9%]" /><col className="w-[16%]" /><col className="w-[14%]" /><col className="w-[11%]" /><col className="w-[13%]" /></colgroup>
                <thead><tr><th>#</th><th>{ar ? "الموظف" : "Staff Member"}</th><th>{ar ? "الدور" : "Role"}</th><th>{ar ? "الحالة" : "Status"}</th><th>{ar ? "وردية اليوم" : "Today's Shift"}</th><th>{ar ? "الحالة الحية" : "Live Status"}</th><th>{ar ? "آخر نشاط" : "Last Active"}</th><th className="text-center">{ar ? "إجراءات" : "Actions"}</th></tr></thead>
                <tbody>
                  {visibleRows.map((member, pageIndex) => {
                    const index = (currentTeamPage - 1) * TEAM_PAGE_SIZE + pageIndex;
                    const locked = member.role === "restaurant_admin" && !isSuperAdmin && !isOwnRestaurantManager(member);
                    const avatar = member.avatar_url || avatarPresetUrl(member.avatar_preset);
                    const scheduleInfo = scheduleByStaff.get(member.id);
                    const cancelShiftInfo = cancellableShiftByStaff.get(member.id);
                    const clockEntry = openClockByStaff.get(member.id);
                    const isOnLeave = leaveStaffIds.has(member.id);
                    return (
                      <tr key={member.id} className="qs-workforce-row group transition-colors hover:bg-orange-500/[0.025]">
                        <td className="text-muted-foreground">#{String(index + 1).padStart(3, "0")}</td>
                        <td><button type="button" disabled={locked} onClick={() => !locked && startEdit(member)} className="flex min-w-0 items-center gap-3 text-start"><span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-full bg-muted font-bold ring-1 ring-border transition group-hover:ring-orange-200">{avatar ? <img src={avatar} alt="" className="size-full object-cover" /> : member.name.slice(0, 1).toUpperCase()}</span><span className="min-w-0"><strong className="block truncate text-sm font-bold">{member.name}</strong><span className="mt-0.5 block truncate text-[10px] text-muted-foreground">{member.email ?? "—"}</span></span></button></td>
                        <td><span className={cn("qs-status", ROLE_TONE[member.role])}>{ROLE_NAMES[member.role][lang]}</span></td>
                        <td><span className={cn("qs-status", member.is_active ? "bg-emerald-500/12 text-emerald-600" : "bg-slate-500/12 text-slate-500")}><i className={cn("size-1.5 rounded-full", member.is_active ? "bg-emerald-500 animate-pulse" : "bg-slate-400")} />{member.is_active ? t("common.active") : t("common.inactive")}</span></td>
                        <td><StaffShiftSummaryCell schedule={scheduleInfo} ar={ar} /></td>
                        <td><StaffLiveStatus clockEntry={clockEntry} schedule={scheduleInfo} onLeave={isOnLeave} now={presenceNow} ar={ar} /></td>
                        <td><StaffLastActive value={member.last_seen_at} ar={ar} now={presenceNow} /></td>
                        <td><StaffRowActions member={member} locked={locked} canManageShifts={canManageShifts} canCancelShift={canManageShifts && Boolean(cancelShiftInfo)} ar={ar} onEdit={() => startEdit(member)} onAssign={() => setShiftMember(member)} onCancel={() => cancelShiftInfo && setCancelShiftTarget({ member, shift: cancelShiftInfo })} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="qs-team-pagination hidden items-center justify-between border-t border-border bg-card px-4 py-3 xl:flex">
              <p className="text-[11px] font-medium text-muted-foreground">{ar ? `عرض ${firstVisibleIndex}–${lastVisibleIndex} من ${rows.length} أعضاء` : `Showing ${firstVisibleIndex}–${lastVisibleIndex} of ${rows.length} team members`}</p>
              <div className="flex items-center gap-1.5">
                <button type="button" className="qs-team-page-button" disabled={currentTeamPage <= 1} onClick={() => setTeamPage((page) => Math.max(1, page - 1))} aria-label={ar ? "الصفحة السابقة" : "Previous page"}><ChevronLeft className="size-4" /></button>
                {Array.from({ length: teamPageCount }, (_, page) => page + 1).slice(Math.max(0, currentTeamPage - 3), Math.max(0, currentTeamPage - 3) + 3).map((page) => <button key={page} type="button" className={cn("qs-team-page-button", page === currentTeamPage && "is-active")} onClick={() => setTeamPage(page)}>{page}</button>)}
                <button type="button" className="qs-team-page-button" disabled={currentTeamPage >= teamPageCount} onClick={() => setTeamPage((page) => Math.min(teamPageCount, page + 1))} aria-label={ar ? "الصفحة التالية" : "Next page"}><ChevronRight className="size-4" /></button>
              </div>
            </div>
            <div className="space-y-2 p-3 xl:hidden">
              {visibleRows.map((member) => {
                const locked =
                  member.role === "restaurant_admin" &&
                  !isSuperAdmin &&
                  !isOwnRestaurantManager(member);
                const avatar = member.avatar_url || avatarPresetUrl(member.avatar_preset);
                const scheduleInfo = scheduleByStaff.get(member.id);
                const cancelShiftInfo = cancellableShiftByStaff.get(member.id);
                const clockEntry = openClockByStaff.get(member.id);
                const isOnLeave = leaveStaffIds.has(member.id);
                return (
                  <div
                    key={member.id}
                    className="flex w-full items-center gap-3 rounded-xl border border-border bg-card p-3 text-start"
                  >
                    <div className="min-w-0 flex-1">
                      <button
                        type="button"
                        disabled={locked}
                        onClick={() => !locked && startEdit(member)}
                        className="flex w-full min-w-0 items-center gap-3 text-start"
                      >
                        <span className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-full bg-muted font-bold">
                          {avatar ? (
                            <img src={avatar} alt="" className="size-full object-cover" />
                          ) : (
                            member.name.slice(0, 1).toUpperCase()
                          )}
                        </span>
                        <span className="min-w-0 flex-1">
                          <strong className="block truncate text-sm">{member.name}</strong>
                          <span className="mt-1 flex flex-wrap items-center gap-2">
                            <span className={cn("qs-status", ROLE_TONE[member.role])}>
                              {ROLE_NAMES[member.role][lang]}
                            </span>
                            <span
                              className={cn(
                                "size-2 rounded-full",
                                member.is_active ? "bg-emerald-500" : "bg-slate-400",
                              )}
                            />
                          </span>
                        </span>
                      </button>
                      <div className="mt-3 grid gap-3 border-t border-border/70 pt-3 sm:grid-cols-3">
                        <StaffLiveStatus
                          clockEntry={clockEntry}
                          schedule={scheduleInfo}
                          onLeave={isOnLeave}
                          now={presenceNow}
                          ar={ar}
                        />
                        <StaffLastActive value={member.last_seen_at} ar={ar} now={presenceNow} />
                        <StaffShiftCell
                          schedule={scheduleInfo}
                          canAssign={canManageShifts && member.is_active}
                          canCancel={canManageShifts && Boolean(cancelShiftInfo)}
                          ar={ar}
                          onAssign={() => setShiftMember(member)}
                          onCancel={() =>
                            cancelShiftInfo &&
                            setCancelShiftTarget({ member, shift: cancelShiftInfo })
                          }
                        />
                      </div>
                    </div>
                    <StaffActions
                      member={member}
                      locked={locked}
                      canManageShifts={canManageShifts}
                      canCancelShift={canManageShifts && Boolean(cancelShiftInfo)}
                      ar={ar}
                      onEdit={() => startEdit(member)}
                      onAssign={() => setShiftMember(member)}
                      onCancel={() =>
                        cancelShiftInfo &&
                        setCancelShiftTarget({ member, shift: cancelShiftInfo })
                      }
                    />
                  </div>
                );
              })}
            </div>
          </>
        )}
      </section>
        </div>

        <aside className="qs-team-insights hidden min-h-0 min-w-0 flex-col gap-4 xl:flex">
          <section className="qs-card qs-team-attendance-card p-4">
            <div className="flex items-start justify-between gap-3">
              <div><h3 className="text-sm font-extrabold">{ar ? "حضور اليوم" : "Today's Attendance"}</h3><p className="mt-1 text-[10px] font-medium text-muted-foreground">{formatScheduleDayLabel(scheduleDayKey, ar)}</p></div>
              <span className="qs-live-badge">{ar ? "مباشر" : "Live"}</span>
            </div>
            <div className="mt-4 grid grid-cols-[112px_minmax(0,1fr)] items-center gap-4">
              <div className="qs-attendance-donut relative grid size-28 place-items-center rounded-full" style={{ background: `conic-gradient(#16c784 0 ${attendancePercent}%, #edf1f7 ${attendancePercent}% 100%)` }}>
                <div className="grid size-[78px] place-items-center rounded-full bg-card text-center shadow-inner"><span><strong className="block text-2xl font-black tabular-nums">{attendancePercent}%</strong><small className="text-[9px] font-semibold text-muted-foreground">{ar ? "حاضر" : "Present"}</small></span></div>
              </div>
              <div className="space-y-2 text-[10px]">
                <div className="flex items-center justify-between gap-2"><span className="flex items-center gap-2 text-muted-foreground"><i className="size-2 rounded-full bg-emerald-500" />{ar ? "على رأس العمل" : "On Shift"}</span><strong>{onShiftNow}</strong></div>
                <div className="flex items-center justify-between gap-2"><span className="flex items-center gap-2 text-muted-foreground"><i className="size-2 rounded-full bg-orange-400" />{ar ? "لم يسجل" : "Not Clocked In"}</span><strong>{notClockedToday}</strong></div>
                <div className="flex items-center justify-between gap-2"><span className="flex items-center gap-2 text-muted-foreground"><i className="size-2 rounded-full bg-violet-500" />{ar ? "إجازة" : "Day Off"}</span><strong>{onLeaveNow}</strong></div>
              </div>
            </div>
          </section>

          <section className="qs-card p-4">
            <div className="flex items-start justify-between gap-3"><div><h3 className="text-sm font-extrabold">{ar ? "توزيع الورديات" : "Shift Distribution"}</h3><p className="mt-1 text-[10px] text-muted-foreground">{ar ? "حسب وقت بداية وردية اليوم" : "By today's shift start"}</p></div><strong className="text-2xl font-black">{scheduledToday}</strong></div>
            <div className="mt-5 grid grid-cols-4 gap-3">
              {([
                ["morning", ar ? "صباح" : "Morning", "#3b82f6"],
                ["afternoon", ar ? "ظهر" : "Afternoon", "#10b981"],
                ["evening", ar ? "مساء" : "Evening", "#f59e0b"],
                ["night", ar ? "ليل" : "Night", "#8b5cf6"],
              ] as const).map(([key, label, color]) => {
                const value = shiftDistribution[key];
                const height = Math.max(14, Math.round((value / maxDistribution) * 54));
                return <div key={key} className="text-center"><div className="mx-auto flex h-16 w-7 items-end justify-center rounded-full bg-muted/45 p-1"><span className="w-full rounded-full" style={{ height, background: color }} /></div><strong className="mt-2 block text-sm">{value}</strong><span className="block text-[9px] text-muted-foreground">{label}</span></div>;
              })}
            </div>
          </section>

          <section className="qs-card min-h-0 flex-1 overflow-hidden">
            <div className="flex items-center justify-between border-b border-border p-4"><div><h3 className="text-sm font-extrabold">{ar ? "الورديات القادمة" : "Upcoming Shifts"}</h3><p className="mt-1 text-[10px] text-muted-foreground">{ar ? "أقرب أعضاء الفريق للعمل" : "Next team members scheduled"}</p></div><span className="rounded-full bg-orange-500/10 px-2 py-1 text-[9px] font-bold text-orange-700">{upcomingTeamShifts.length}</span></div>
            <div className="divide-y divide-border">
              {upcomingTeamShifts.length ? upcomingTeamShifts.map(({ member, schedule }) => {
                const avatar = member.avatar_url || avatarPresetUrl(member.avatar_preset);
                return <div key={member.id} className="flex items-center gap-3 p-3"><span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-full bg-muted font-bold">{avatar ? <img src={avatar} alt="" className="size-full object-cover" /> : member.name.slice(0,1).toUpperCase()}</span><span className="min-w-0 flex-1"><strong className="block truncate text-xs">{member.name}</strong><span className="mt-0.5 block truncate text-[10px] text-muted-foreground">{ROLE_NAMES[member.role][lang]} · {formatTodayShiftRange(schedule.start, schedule.end, ar)}</span></span><span className={cn("rounded-full px-2 py-1 text-[9px] font-bold", schedule.phase === "active" ? "bg-emerald-500/10 text-emerald-700" : "bg-orange-500/10 text-orange-700")}>{schedule.phase === "active" ? (ar ? "على رأس العمل" : "On Shift") : (ar ? "قادمة" : "Upcoming")}</span></div>;
              }) : <div className="p-6 text-center text-xs text-muted-foreground">{ar ? "لا توجد ورديات قادمة اليوم." : "No upcoming shifts today."}</div>}
            </div>
          </section>
        </aside>
      </div>

      <Dialog
        open={Boolean(editing)}
        onOpenChange={(open) => {
          if (!open && !busy) setEditing(null);
        }}
      >
        <DialogContent className="flex h-[min(880px,calc(100dvh-1.5rem))] w-[calc(100vw-1.5rem)] max-w-[1100px] flex-col gap-0 overflow-hidden p-0 sm:max-w-[1100px]">
          {editing ? (
            <>
              {(() => {
                const ownRestaurantManager = isOwnRestaurantManager(editing);
                return (
                  <>
                    <div className="border-b border-border px-4 py-4 sm:px-6">
                      <div className="flex min-w-0 items-center gap-3 pe-8">
                        <span className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-full bg-muted text-lg font-bold ring-1 ring-border">
                          {editing.avatar_url || avatarPresetUrl(editing.avatar_preset) ? (
                            <img
                              src={
                                (editing.avatar_url || avatarPresetUrl(editing.avatar_preset)) ??
                                undefined
                              }
                              alt=""
                              className="size-full object-cover"
                            />
                          ) : (
                            editing.name.slice(0, 1).toUpperCase()
                          )}
                        </span>
                        <div className="min-w-0 flex-1">
                          <h2 className="truncate font-display text-lg font-bold sm:text-xl">
                            {editing.name}
                          </h2>
                          <p className="truncate text-xs text-muted-foreground">{editing.email}</p>
                        </div>
                        <span
                          className={cn(
                            "hidden shrink-0 rounded-full px-3 py-1.5 text-xs font-bold sm:inline-flex",
                            editing.is_active
                              ? "bg-emerald-500/10 text-emerald-600"
                              : "bg-muted text-muted-foreground",
                          )}
                        >
                          {editing.is_active ? t("common.active") : t("common.inactive")}
                        </span>
                      </div>
                    </div>

                    <div className="flex shrink-0 overflow-x-auto border-b border-border px-2 sm:px-4">
                      {(ownRestaurantManager
                        ? ([["profile", ar ? "الاسم" : "Manager name", UserRound]] as const)
                        : ([
                            ["permissions", ar ? "الصلاحيات" : "Permissions", ShieldCheck],
                            ["profile", ar ? "الملف" : "Profile", UserRound],
                            ["log", ar ? "سجل الوصول" : "Access Log", History],
                          ] as const)
                      ).map(([id, label, Icon]) => (
                        <button
                          key={id}
                          type="button"
                          onClick={() => setDrawerTab(id)}
                          className={cn(
                            "relative flex min-h-14 min-w-[140px] flex-1 items-center justify-center gap-2 px-3 text-sm font-semibold",
                            drawerTab === id
                              ? "text-[#e85d2a]"
                              : "text-muted-foreground hover:text-foreground",
                          )}
                        >
                          <Icon className="size-4" />
                          {label}
                          {drawerTab === id ? (
                            <span className="absolute inset-x-4 bottom-0 h-0.5 rounded-full bg-[#e85d2a]" />
                          ) : null}
                        </button>
                      ))}
                    </div>

                    <div className="min-h-0 flex-1 overflow-y-auto bg-muted/10 p-4 sm:p-6">
                      {drawerTab === "permissions" ? (
                        <div className="grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
                          <div className="space-y-4">
                            <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                              <h3 className="mb-4 text-sm font-bold">
                                {ar ? "الدور والوصول" : "Role & access"}
                              </h3>
                              <div className="space-y-4">
                                <Field label={ar ? "الدور" : "Role"}>
                                  <Select
                                    value={editing.role}
                                    onValueChange={(value) =>
                                      setEditing({
                                        ...editing,
                                        role: value as AppRole,
                                        permission_overrides: {},
                                      })
                                    }
                                  >
                                    <SelectTrigger className="h-10">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {assignableRoles.map((role) => (
                                        <SelectItem key={role} value={role}>
                                          {ROLE_NAMES[role][lang]}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </Field>
                                <label className="flex min-h-12 items-center justify-between rounded-xl border border-border px-3">
                                  <span>
                                    <strong className="block text-xs">
                                      {ar ? "وصول نشط" : "Active access"}
                                    </strong>
                                    <span className="mt-0.5 block text-[10px] text-muted-foreground">
                                      {ar ? "السماح بتسجيل الدخول" : "Allow sign in"}
                                    </span>
                                  </span>
                                  <Switch
                                    checked={editing.is_active}
                                    onCheckedChange={(value) =>
                                      setEditing({ ...editing, is_active: value })
                                    }
                                  />
                                </label>
                              </div>
                            </section>
                            <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                              <div className="mb-3 flex items-center gap-2">
                                <KeyRound className="size-4 text-[#e85d2a]" />
                                <h3 className="text-sm font-bold">
                                  {ar ? "أمان الحساب" : "Account security"}
                                </h3>
                              </div>
                              <div className="space-y-3">
                                <Field label={ar ? "كلمة مرور جديدة" : "New Password"}>
                                  <Input
                                    type="password"
                                    autoComplete="new-password"
                                    value={editing.password}
                                    placeholder={
                                      ar ? "اتركها فارغة بدون تغيير" : "Leave blank to keep current"
                                    }
                                    onChange={(event) =>
                                      setEditing({ ...editing, password: event.target.value })
                                    }
                                  />
                                </Field>
                                <Field label={ar ? "تأكيد كلمة المرور" : "Confirm Password"}>
                                  <Input
                                    type="password"
                                    autoComplete="new-password"
                                    value={editing.confirmPassword}
                                    onChange={(event) =>
                                      setEditing({
                                        ...editing,
                                        confirmPassword: event.target.value,
                                      })
                                    }
                                  />
                                </Field>
                                <p className="text-[10px] leading-4 text-muted-foreground">
                                  {ar
                                    ? "الحد الأدنى 8 أحرف. اترك الحقلين فارغين للإبقاء على كلمة المرور الحالية."
                                    : "Minimum 8 characters. Leave both fields blank to keep the current password."}
                                </p>
                              </div>
                            </section>
                          </div>
                          <section className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
                            <div className="mb-4">
                              <h3 className="text-sm font-bold">
                                {ar ? "الصلاحيات المتقدمة" : "Advanced permissions"}
                              </h3>
                              <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">
                                {ar
                                  ? "خصص صلاحيات هذا المستخدم ضمن حدود دوره. لا يمكن منح صلاحية أعلى من حدود الأمان في الخادم."
                                  : "Customize this user inside the selected role's secure ceiling. A toggle can restrict access, but cannot grant privileges beyond the server-side role."}
                              </p>
                            </div>
                            <div className="grid gap-3 md:grid-cols-2">
                              {PERMISSION_GROUPS.map((group) => (
                                <section
                                  key={group.id}
                                  className="rounded-xl border border-border bg-muted/10 p-3.5"
                                >
                                  <h4 className="mb-3 text-xs font-bold">
                                    {ar ? group.ar : group.en}
                                  </h4>
                                  <div className="space-y-3">
                                    {group.items.map((item) => {
                                      const supported = roleHasCapability(
                                        editing.role,
                                        item.capability,
                                      );
                                      return (
                                        <label
                                          key={item.capability}
                                          className={cn(
                                            "flex min-h-9 items-center justify-between gap-3 text-xs",
                                            !supported && "opacity-45",
                                          )}
                                        >
                                          <span className="leading-4">
                                            {ar ? item.ar : item.en}
                                          </span>
                                          <Switch
                                            disabled={!supported}
                                            checked={permissionEnabled(item.capability)}
                                            onCheckedChange={(value) =>
                                              setPermission(item.capability, value)
                                            }
                                          />
                                        </label>
                                      );
                                    })}
                                  </div>
                                </section>
                              ))}
                            </div>
                          </section>
                        </div>
                      ) : drawerTab === "profile" ? (
                        <div className="mx-auto max-w-3xl space-y-5">
                          <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                            <h3 className="text-base font-bold">
                              {ownRestaurantManager
                                ? ar
                                  ? "اسم مدير المطعم"
                                  : "Restaurant Manager name"
                                : ar
                                  ? "معلومات المستخدم"
                                  : "User profile"}
                            </h3>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {ownRestaurantManager
                                ? ar
                                  ? "يمكنك تعديل اسمك هنا فقط. البريد والدور والصلاحيات تبقى محمية."
                                  : "Edit your name here. Email, role and permissions remain protected."
                                : ar
                                  ? "يمكن تعديل الاسم والبريد وحفظهما مع بقية التغييرات."
                                  : "Edit the name and email here; they are saved with the rest of the changes."}
                            </p>
                            <div className="mt-5 grid gap-4 sm:grid-cols-2">
                              <Field label={ar ? "الاسم" : "Name"}>
                                <Input
                                  value={editing.name}
                                  maxLength={80}
                                  onChange={(event) =>
                                    setEditing({ ...editing, name: event.target.value })
                                  }
                                />
                              </Field>
                              {ownRestaurantManager ? (
                                <Read
                                  label={ar ? "البريد الإلكتروني" : "Email"}
                                  value={editing.email ?? "—"}
                                />
                              ) : (
                                <Field label={ar ? "البريد الإلكتروني" : "Email"}>
                                  <Input
                                    type="email"
                                    value={editing.email ?? ""}
                                    onChange={(event) =>
                                      setEditing({ ...editing, email: event.target.value })
                                    }
                                  />
                                </Field>
                              )}
                              <Read
                                label={ar ? "الدور" : "Role"}
                                value={ROLE_NAMES[editing.role][lang]}
                              />
                              <Read
                                label={ar ? "تاريخ الإضافة" : "Joined"}
                                value={new Date(editing.created_at).toLocaleDateString(
                                  ar ? "ar-JO" : "en-US",
                                )}
                              />
                            </div>
                            {!ownRestaurantManager ? (
                              <button
                                type="button"
                                className="qs-button-secondary mt-5 w-full sm:w-auto"
                                onClick={() => void openAccess(editing.id)}
                              >
                                <IdCard className="size-4" />
                                {ar ? "عرض بطاقة الوصول" : "View Staff Access"}
                              </button>
                            ) : null}
                          </section>
                        </div>
                      ) : (
                        <div className="mx-auto max-w-3xl">
                          <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                            <div className="mb-4">
                              <h3 className="text-base font-bold">
                                {ar ? "سجل الوصول والنشاط" : "Access & activity log"}
                              </h3>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {ar
                                  ? "آخر الأحداث المسجلة لهذا المستخدم."
                                  : "Latest recorded events for this user."}
                              </p>
                            </div>
                            {audit.isPending ? (
                              <Skeleton className="h-48 rounded-xl" />
                            ) : audit.isError ? (
                              <p className="rounded-xl bg-muted p-4 text-sm text-muted-foreground">
                                {ar
                                  ? "تعذر تحميل سجل الوصول."
                                  : "Access log is unavailable for this account."}
                              </p>
                            ) : (audit.data ?? []).length ? (
                              <div className="space-y-2">
                                {(audit.data ?? []).map((row) => (
                                  <div key={row.id} className="rounded-xl border border-border p-3">
                                    <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                                      <strong className="text-xs">{row.action}</strong>
                                      <span className="text-[10px] text-muted-foreground">
                                        {new Date(row.created_at).toLocaleString(
                                          ar ? "ar-JO" : "en-US",
                                        )}
                                      </span>
                                    </div>
                                    <p className="mt-1 text-[10px] text-muted-foreground">
                                      {row.entity ?? (ar ? "النظام" : "System")}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="rounded-xl bg-muted/40 p-8 text-center text-sm text-muted-foreground">
                                {ar
                                  ? "لا يوجد نشاط مسجل لهذا المستخدم بعد."
                                  : "No recorded activity for this user yet."}
                              </p>
                            )}
                          </section>
                        </div>
                      )}
                    </div>

                    <div className="safe-bottom shrink-0 border-t border-border bg-card p-3 sm:p-4">
                      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
                        <button
                          type="button"
                          className="qs-button-secondary min-h-11 sm:min-w-28"
                          disabled={busy}
                          onClick={() => setEditing(null)}
                        >
                          {t("common.cancel")}
                        </button>
                        {!ownRestaurantManager ? (
                          <>
                            <button
                              type="button"
                              className="qs-button-secondary min-h-11 sm:min-w-28"
                              disabled={busy}
                              onClick={() => void openAccess(editing.id)}
                            >
                              <IdCard className="size-4" />
                              {ar ? "الوصول" : "Access"}
                            </button>
                            <button
                              type="button"
                              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold text-destructive hover:bg-destructive/10 sm:ms-auto"
                              disabled={busy}
                              onClick={() => setPendingDelete(editing)}
                            >
                              <Trash2 className="size-4" />
                              {ar ? "حذف" : "Delete"}
                            </button>
                          </>
                        ) : (
                          <span className="hidden sm:block sm:flex-1" />
                        )}
                        <button
                          type="button"
                          className="qs-button-primary min-h-11 sm:min-w-44"
                          disabled={busy}
                          onClick={() => void saveEdit()}
                        >
                          {busy
                            ? ar
                              ? "جارٍ الحفظ…"
                              : "Saving…"
                            : ownRestaurantManager
                              ? ar
                                ? "حفظ الاسم"
                                : "Save name"
                              : ar
                                ? "حفظ التغييرات"
                                : "Save Changes"}
                        </button>
                      </div>
                    </div>
                  </>
                );
              })()}
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{ar ? "إضافة عضو فريق" : "Add Team Member"}</DialogTitle>
            <DialogDescription>
              {seatLimit == null
                ? ar
                  ? "أضف مستخدماً جديداً للفريق."
                  : "Add a new member to this restaurant."
                : `${seatsUsed} / ${seatLimit} ${ar ? "مستخدمين" : "users"}`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Field label={ar ? "الاسم" : "Name"}>
              <Input
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
              />
            </Field>
            <Field label={ar ? "البريد الإلكتروني" : "Email"}>
              <Input
                type="email"
                value={form.email}
                onChange={(event) => setForm({ ...form, email: event.target.value })}
              />
            </Field>
            <Field label={ar ? "الدور" : "Role"}>
              <Select
                value={form.role}
                onValueChange={(value) => setForm({ ...form, role: value as AppRole })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {assignableRoles.map((role) => (
                    <SelectItem key={role} value={role}>
                      {ROLE_NAMES[role][lang]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAddOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              disabled={busy || !form.name.trim() || !form.email.trim() || seatsFull}
              onClick={() => void create()}
            >
              {ar ? "إضافة" : "Add Member"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(credentials)} onOpenChange={(value) => !value && setCredentials(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{ar ? "بيانات الدخول" : "Login credentials"}</DialogTitle>
            <DialogDescription>{credentials?.email}</DialogDescription>
          </DialogHeader>
          <div className="rounded-xl bg-muted p-4 font-mono text-sm">
            {credentials?.password ?? (ar ? "تم ربط الحساب الموجود" : "Existing account linked")}
          </div>
          <DialogFooter>
            <Button onClick={() => setCredentials(null)}>{t("common.close")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(pendingDelete)}
        onOpenChange={(value) => !value && setPendingDelete(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{ar ? "حذف المستخدم؟" : "Delete team member?"}</DialogTitle>
            <DialogDescription>{pendingDelete?.name}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPendingDelete(null)}>
              {t("common.cancel")}
            </Button>
            <Button variant="destructive" disabled={busy} onClick={() => void del()}>
              {t("common.delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(access)} onOpenChange={(value) => !value && setAccess(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{ar ? "وصول الموظف" : "Staff access"}</DialogTitle>
            <DialogDescription>{access?.name}</DialogDescription>
          </DialogHeader>
          {badge ? (
            <img src={badge} alt="Staff badge" className="mx-auto size-56 rounded-xl" />
          ) : (
            <div className="rounded-xl bg-muted p-5 text-center text-sm text-muted-foreground">
              {ar ? "لا توجد بطاقة مفعلة." : "No active badge available."}
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setAccess(null)}>{t("common.close")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {shiftMember ? (
        <AssignStaffShiftDialog
          key={shiftMember.id}
          member={shiftMember}
          restaurantId={restaurantId}
          shifts={schedule.data?.shifts ?? []}
          assignments={schedule.data?.assignments ?? []}
          todayKey={scheduleDayKey}
          ar={ar}
          lang={lang}
          onClose={() => setShiftMember(null)}
        />
      ) : null}
      {cancelShiftTarget ? (
        <CancelStaffShiftDialog
          key={cancelShiftTarget.shift.assignmentId}
          member={cancelShiftTarget.member}
          shift={cancelShiftTarget.shift}
          restaurantId={restaurantId}
          ar={ar}
          lang={lang}
          onClose={() => setCancelShiftTarget(null)}
        />
      ) : null}
    </div>
  );
}

function StaffShiftSummaryCell({ schedule, ar }: { schedule: StaffScheduleSummary | undefined; ar: boolean }) {
  if (!schedule) return <span className="text-xs text-muted-foreground">{ar ? "لا توجد وردية اليوم" : "No shift today"}</span>;
  const phaseLabel =
    schedule.phase === "active" ? (ar ? "الآن" : "On shift")
      : schedule.phase === "late" ? (ar ? "متأخر" : "Late")
        : schedule.phase === "completed" ? (ar ? "مكتملة" : "Completed")
          : schedule.phase === "missed" ? (ar ? "فاتت" : "Missed")
            : (ar ? "قادمة" : "Upcoming");
  const phaseTone =
    schedule.phase === "active" ? "bg-emerald-500/10 text-emerald-700"
      : schedule.phase === "late" ? "bg-orange-500/10 text-orange-700"
        : schedule.phase === "completed" ? "bg-slate-500/10 text-slate-600"
          : schedule.phase === "missed" ? "bg-rose-500/10 text-rose-700"
            : "bg-blue-500/10 text-blue-700";
  return <div className="flex min-w-0 items-center gap-2"><span className="grid size-7 shrink-0 place-items-center rounded-lg bg-orange-500/10 text-[#e85d2a]"><CalendarClock className="size-3.5" /></span><div className="min-w-0"><div className="flex min-w-0 items-center gap-1.5"><strong className="truncate text-xs">{schedule.name}</strong><span className={cn("shrink-0 rounded-full px-1.5 py-0.5 text-[8px] font-bold", phaseTone)}>{phaseLabel}</span></div><p className="mt-0.5 truncate text-[10px] text-muted-foreground">{formatTodayShiftRange(schedule.start, schedule.end, ar)}{schedule.count > 1 ? ` · +${schedule.count - 1}` : ""}</p></div></div>;
}

function StaffLiveStatus({ clockEntry, schedule, onLeave, now, ar }: { clockEntry: StaffTimeRow | undefined; schedule: StaffScheduleSummary | undefined; onLeave: boolean; now: number; ar: boolean }) {
  if (onLeave) {
    return (
      <div className="qs-live-status-card qs-live-status-leave">
        <span className="qs-live-status-icon"><UserRound className="size-3.5" /></span>
        <span className="min-w-0">
          <strong>{ar ? "في إجازة" : "On leave"}</strong>
          <small>{ar ? "اليوم" : "Today"}</small>
        </span>
      </div>
    );
  }
  if (clockEntry) {
    const seconds = Math.max(0, Math.floor((now - new Date(clockEntry.clock_in).getTime()) / 1000));
    const clockedAt = new Date(clockEntry.clock_in).toLocaleTimeString(ar ? "ar-JO" : "en-JO", { hour: "2-digit", minute: "2-digit" });
    return (
      <div className="qs-live-status-card qs-live-status-on">
        <span className="qs-live-status-icon"><ShieldCheck className="size-3.5" /></span>
        <span className="min-w-0">
          <strong>{ar ? "على رأس العمل" : "On shift"} <i /></strong>
          <b>{formatTeamDuration(seconds, ar)}</b>
          <small>{ar ? `سجل الحضور ${clockedAt}` : `Clocked in ${clockedAt}`}</small>
        </span>
      </div>
    );
  }
  if (schedule?.attendance === "late") {
    return (
      <div className="qs-live-status-card qs-live-status-alert">
        <span className="qs-live-status-icon"><History className="size-3.5" /></span>
        <span className="min-w-0">
          <strong>{ar ? "متأخر" : "Late"}</strong>
          <b>{schedule.attendanceMinutes > 0 ? `${schedule.attendanceMinutes} ${ar ? "د" : "min"}` : "—"}</b>
          <small>{schedule.start ? (ar ? `بدأت الوردية ${formatTeamTime(schedule.start, true)}` : `Shift started ${formatTeamTime(schedule.start, false)}`) : (ar ? "تأخر عن بداية الوردية" : "Late for scheduled start")}</small>
        </span>
      </div>
    );
  }
  if (schedule?.attendance === "left_early") {
    return (
      <div className="qs-live-status-card qs-live-status-alert">
        <span className="qs-live-status-icon"><History className="size-3.5" /></span>
        <span className="min-w-0">
          <strong>{ar ? "غادر مبكراً" : "Left early"}</strong>
          <b>{schedule.attendanceMinutes > 0 ? `${schedule.attendanceMinutes} ${ar ? "د" : "min"}` : ""}</b>
          <small>{ar ? "قبل نهاية الوردية" : "Before scheduled end"}</small>
        </span>
      </div>
    );
  }
  if (schedule?.attendance === "overtime") {
    return (
      <div className="qs-live-status-card qs-live-status-break">
        <span className="qs-live-status-icon"><History className="size-3.5" /></span>
        <span className="min-w-0">
          <strong>{ar ? "وقت إضافي" : "Overtime"}</strong>
          <b>{schedule.attendanceMinutes > 0 ? `${schedule.attendanceMinutes} ${ar ? "د" : "min"}` : ""}</b>
          <small>{ar ? "بعد نهاية الوردية" : "Beyond scheduled end"}</small>
        </span>
      </div>
    );
  }
  if (schedule?.attendance === "on_time") {
    return (
      <div className="qs-live-status-card qs-live-status-done">
        <span className="qs-live-status-icon"><ShieldCheck className="size-3.5" /></span>
        <span className="min-w-0">
          <strong>{ar ? "ضمن الوقت" : "On time"}</strong>
          <small>{ar ? "حضور مكتمل" : "Attendance recorded"}</small>
        </span>
      </div>
    );
  }
  if (schedule) {
    return (
      <div className="qs-live-status-card qs-live-status-off">
        <span className="qs-live-status-icon"><CalendarClock className="size-3.5" /></span>
        <span className="min-w-0">
          <strong>{ar ? "لم تبدأ الوردية" : "Not started"}</strong>
          <small>{schedule.start ? (ar ? `تبدأ ${formatTeamTime(schedule.start, true)}` : `Starts ${formatTeamTime(schedule.start, false)}`) : (ar ? "بانتظار تسجيل الحضور" : "Waiting for clock in")}</small>
        </span>
      </div>
    );
  }
  return (
    <div className="qs-live-status-card qs-live-status-off">
      <span className="qs-live-status-icon"><History className="size-3.5" /></span>
      <span className="min-w-0">
        <strong>{ar ? "خارج الوردية" : "Off shift"}</strong>
        <small>{ar ? "غير مسجل حالياً" : "Not clocked in"}</small>
      </span>
    </div>
  );
}

function StaffLastActive({ value, ar, now }: { value: string | null | undefined; ar: boolean; now: number }) {
  if (!value) {
    return (
      <div className="qs-last-active qs-last-active-idle">
        <span className="qs-last-active-icon"><History className="size-3.5" /></span>
        <span className="min-w-0">
          <strong>{ar ? "لا يوجد نشاط" : "No activity"}</strong>
          <small>{ar ? "لم يُسجل نشاط بعد" : "Nothing recorded yet"}</small>
        </span>
      </div>
    );
  }

  const date = new Date(value);
  const diff = now - date.getTime();
  if (!Number.isFinite(diff)) {
    return (
      <div className="qs-last-active qs-last-active-idle">
        <span className="qs-last-active-icon"><History className="size-3.5" /></span>
        <span className="min-w-0"><strong>—</strong><small>{ar ? "وقت غير متاح" : "Time unavailable"}</small></span>
      </div>
    );
  }

  if (diff <= 90_000) {
    return (
      <div className="qs-last-active qs-last-active-online">
        <span className="qs-last-active-icon"><ShieldCheck className="size-3.5" /></span>
        <span className="min-w-0">
          <strong>{ar ? "متصل الآن" : "Online now"} <i /></strong>
          <small>{ar ? "نشاط مباشر" : "Live activity"}</small>
        </span>
      </div>
    );
  }

  const minutes = Math.max(0, Math.floor(diff / 60_000));
  if (minutes < 60) {
    return (
      <div className="qs-last-active qs-last-active-recent">
        <span className="qs-last-active-icon"><History className="size-3.5" /></span>
        <span className="min-w-0">
          <strong>{ar ? `قبل ${minutes} د` : `${minutes} min ago`}</strong>
          <small>{ar ? "نشاط حديث" : "Recent activity"}</small>
        </span>
      </div>
    );
  }

  const sameDay = date.toDateString() === new Date(now).toDateString();
  const time = date.toLocaleTimeString(ar ? "ar-JO" : "en-JO", { hour: "2-digit", minute: "2-digit" });
  if (sameDay) {
    return (
      <div className="qs-last-active qs-last-active-today">
        <span className="qs-last-active-icon"><History className="size-3.5" /></span>
        <span className="min-w-0">
          <strong>{ar ? "اليوم" : "Today"}</strong>
          <small>{time}</small>
        </span>
      </div>
    );
  }

  const day = date.toLocaleDateString(ar ? "ar-JO" : "en-JO", { month: "short", day: "numeric" });
  return (
    <div className="qs-last-active qs-last-active-idle">
      <span className="qs-last-active-icon"><History className="size-3.5" /></span>
      <span className="min-w-0">
        <strong>{day}</strong>
        <small>{time}</small>
      </span>
    </div>
  );
}

function StaffRowActions({ member, locked, canManageShifts, canCancelShift, ar, onEdit, onAssign, onCancel }: { member: StaffRow; locked: boolean; canManageShifts: boolean; canCancelShift: boolean; ar: boolean; onEdit: () => void; onAssign: () => void; onCancel: () => void }) {
  const canAssign = canManageShifts && member.is_active;
  const shiftButton = <button type="button" className="qs-team-action-button qs-team-action-shift" title={ar ? "إدارة الوردية" : "Manage shift"} onClick={canCancelShift ? undefined : onAssign}><CalendarPlus className="size-4" /><span>{ar?"وردية":"Shift"}</span></button>;
  return <div className="qs-team-actions qs-team-actions-clean">
    {canAssign ? (canCancelShift ? <DropdownMenu><DropdownMenuTrigger asChild>{shiftButton}</DropdownMenuTrigger><DropdownMenuContent align="end" className="min-w-44">
      <DropdownMenuItem onSelect={() => window.setTimeout(onAssign, 0)}><CalendarPlus className="size-4" />{ar ? "تعديل الوردية" : "Change shift"}</DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => window.setTimeout(onCancel, 0)}><CalendarX2 className="size-4" />{ar ? "إلغاء الوردية" : "Cancel shift"}</DropdownMenuItem>
    </DropdownMenuContent></DropdownMenu> : shiftButton) : canCancelShift ? <button type="button" className="qs-team-action-button qs-team-action-cancel" onClick={onCancel}><CalendarX2 className="size-4" /><span>{ar?"إلغاء":"Cancel"}</span></button> : null}
    {!locked ? <button type="button" className="qs-team-action-button qs-team-action-edit" title={ar ? "تعديل الموظف" : "Edit member"} onClick={onEdit}><Pencil className="size-4" /><span>{ar?"تعديل":"Edit"}</span></button> : null}
  </div>;
}

function StaffShiftCell({
  schedule,
  canAssign,
  canCancel,
  ar,
  onAssign,
  onCancel,
}: {
  schedule: StaffScheduleSummary | undefined;
  canAssign: boolean;
  canCancel: boolean;
  ar: boolean;
  onAssign: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="flex min-h-12 w-full min-w-[190px] items-center justify-between gap-3 text-start">
      <div className="min-w-0 flex-1">
        {schedule ? (
          <>
            <div className="flex min-w-0 items-center gap-1.5">
              <CalendarClock className="size-3.5 shrink-0 text-[#e85d2a]" />
              <strong className="truncate text-xs">{schedule.name}</strong>
            </div>
            <p className="mt-1 truncate text-[10px] text-muted-foreground">
              {formatTodayShiftWindow(schedule.start, ar)}
              {schedule.count > 1 ? ` · +${schedule.count - 1}` : ""}
            </p>
            <span
              className={cn(
                "mt-1 inline-flex rounded-full px-2 py-0.5 text-[9px] font-bold",
                scheduleTone(schedule.attendance),
              )}
            >
              {scheduleLabel(schedule.attendance, ar)}
            </span>
          </>
        ) : (
          <p className="text-[10px] text-muted-foreground">
            {ar ? "لا توجد وردية" : "No shift assigned"}
          </p>
        )}
      </div>
      {canAssign || canCancel ? (
        <div className="flex shrink-0 items-center gap-1">
          {canAssign ? (
            <Button
              type="button"
              size="sm"
              variant={schedule ? "outline" : "default"}
              className="h-9 min-w-[92px] shrink-0 gap-1 whitespace-nowrap px-2.5 text-xs"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onAssign();
              }}
            >
              <CalendarPlus className="size-3.5" />
              {schedule ? (ar ? "تعديل" : "Change") : ar ? "إضافة" : "Add shift"}
            </Button>
          ) : null}
          {canCancel ? (
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-9 shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
              aria-label={ar ? "إلغاء الوردية" : "Cancel shift"}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onCancel();
              }}
            >
              <CalendarX2 className="size-4" />
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function StaffActions({
  member,
  locked,
  canManageShifts,
  canCancelShift,
  ar,
  onEdit,
  onAssign,
  onCancel,
}: {
  member: StaffRow;
  locked: boolean;
  canManageShifts: boolean;
  canCancelShift: boolean;
  ar: boolean;
  onEdit: () => void;
  onAssign: () => void;
  onCancel: () => void;
}) {
  const canAssign = canManageShifts && member.is_active;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={locked && !canAssign && !canCancelShift}
          className="grid size-9 place-items-center rounded-lg bg-muted/40 transition hover:bg-muted disabled:opacity-40"
          aria-label={ar ? `إجراءات ${member.name}` : `${member.name} actions`}
        >
          <MoreHorizontal className="size-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        {canAssign ? (
          <DropdownMenuItem onSelect={() => window.setTimeout(onAssign, 0)}>
            <CalendarPlus className="size-4" />
            {ar ? "إضافة وردية" : "Assign shift"}
          </DropdownMenuItem>
        ) : null}
        {canCancelShift ? (
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onSelect={() => window.setTimeout(onCancel, 0)}
          >
            <CalendarX2 className="size-4" />
            {ar ? "إلغاء الوردية" : "Cancel shift"}
          </DropdownMenuItem>
        ) : null}
        {(canAssign || canCancelShift) && !locked ? <DropdownMenuSeparator /> : null}
        {!locked ? (
          <DropdownMenuItem onSelect={onEdit}>
            <Pencil className="size-4" />
            {ar ? "تعديل المستخدم" : "Edit member"}
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function AssignStaffShiftDialog({
  member,
  restaurantId,
  shifts,
  assignments,
  todayKey,
  ar,
  lang,
  onClose,
}: {
  member: StaffRow;
  restaurantId: string;
  shifts: StaffScheduleRow[];
  assignments: StaffAssignmentRow[];
  todayKey: string;
  ar: boolean;
  lang: "en" | "ar";
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const today = todayKey;
  const available = shifts.filter(
    (shift) =>
      shift.status !== "closed" &&
      shift.shift_date >= today &&
      !assignments.some(
        (assignment) => assignment.shift_id === shift.id && assignment.staff_id === member.id,
      ),
  );
  const [mode, setMode] = useState<"existing" | "new">(available.length ? "existing" : "new");
  const [newMode, setNewMode] = useState<"single" | "recurring">("single");
  const [shiftId, setShiftId] = useState(available[0]?.id ?? "");
  const [name, setName] = useState(ar ? "وردية خدمة" : "Service shift");
  const [date, setDate] = useState(today);
  const [rangeEnd, setRangeEnd] = useState(() => addLocalDays(today, 83));
  const [weekdays, setWeekdays] = useState<number[]>([0, 1, 2, 3, 4]);
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("17:00");
  const overnight = Boolean(start && end && end <= start);
  const invalidRange = newMode === "recurring" && rangeEnd < date;
  const todayWeekday = new Date(`${today}T12:00:00`).getDay();
  const todayIncluded =
    newMode === "recurring" &&
    date <= today &&
    rangeEnd >= today &&
    weekdays.includes(todayWeekday);

  function toggleWeekday(day: number) {
    setWeekdays((current) =>
      current.includes(day) ? current.filter((value) => value !== day) : [...current, day].sort(),
    );
  }

  const save = async () => {
    if (mode === "existing") {
      const shift = available.find((row) => row.id === shiftId);
      if (!shift) throw new Error(ar ? "اختر وردية متاحة." : "Choose an available shift.");
      if (hasShiftConflict(member.id, shift.planned_start, shift.planned_end, assignments, shifts))
        throw new Error(
          ar
            ? "تتداخل هذه الوردية مع وردية أخرى لهذا الموظف."
            : "This shift overlaps another assignment for this team member.",
        );
      await assignStaffShift({
        restaurant_id: restaurantId,
        staff_id: member.id,
        shift_id: shift.id,
      });
      return { assigned: 1, skipped: 0, recurring: false };
    }

    if (!name.trim() || !date || !start || !end)
      throw new Error(
        ar ? "أكمل اسم الوردية والتاريخ والوقت." : "Complete the shift name, date and time.",
      );

    if (newMode === "recurring") {
      if (!rangeEnd || invalidRange)
        throw new Error(ar ? "اختر نطاق تاريخ صحيحاً." : "Choose a valid date range.");
      if (!weekdays.length)
        throw new Error(ar ? "اختر يوم عمل واحداً على الأقل." : "Choose at least one workday.");
      const result = await assignRecurringStaffShifts({
        restaurant_id: restaurantId,
        staff_id: member.id,
        name: name.trim(),
        start_date: date,
        end_date: rangeEnd,
        weekdays,
        planned_start: start,
        planned_end: end,
      });
      return { assigned: result.assigned, skipped: result.skipped, recurring: true };
    }

    const plannedStart = localDateTimeIso(date, start);
    const plannedEnd = localDateTimeIso(date, end, overnight ? 1 : 0);
    if (hasShiftConflict(member.id, plannedStart, plannedEnd, assignments, shifts))
      throw new Error(
        ar
          ? "يتداخل هذا الوقت مع وردية أخرى لهذا الموظف."
          : "This time overlaps another assignment for this team member.",
      );
    await assignStaffShift({
      restaurant_id: restaurantId,
      staff_id: member.id,
      name: name.trim(),
      shift_date: date,
      planned_start: plannedStart,
      planned_end: plannedEnd,
    });
    return { assigned: 1, skipped: 0, recurring: false };
  };

  const mutation = useMutation({
    mutationFn: save,
    onSuccess: async (result) => {
      if (result.recurring) {
        const { error: refreshError } = await (supabase as any).rpc("refresh_recurring_staff_schedules", {
          _restaurant_id: restaurantId,
          _horizon_days: 84,
        });
        if (refreshError && !String(refreshError.message ?? "").includes("Could not find the function")) {
          toast.error(humanError(refreshError, lang));
        }
      }
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["platform", "staff-schedule", restaurantId] }),
        qc.invalidateQueries({ queryKey: ["operations", "shifts", restaurantId] }),
        qc.invalidateQueries({ queryKey: ["operations", "shift-assignments", restaurantId] }),
      ]);
      await qc.refetchQueries({ queryKey: ["platform", "staff-schedule", restaurantId], type: "active" });
      if (result.recurring) {
        toast.success(
          ar
            ? `تم تعيين ${result.assigned} ورديات لـ ${member.name}${result.skipped ? ` · تم تخطي ${result.skipped} مكررة` : ""}`
            : `${result.assigned} shifts assigned to ${member.name}${result.skipped ? ` · ${result.skipped} duplicate(s) skipped` : ""}`,
        );
      } else {
        toast.success(ar ? `تمت إضافة وردية ${member.name}` : `Shift assigned to ${member.name}`);
      }
      onClose();
    },
    onError: (error) => toast.error(humanError(error, lang)),
  });

  const newReady =
    Boolean(name.trim() && date && start && end) &&
    (newMode === "single" || Boolean(rangeEnd && weekdays.length && !invalidRange));
  const selectedDaysLabel =
    newMode === "single"
      ? date
      : weekdays.length === 5 && [0, 1, 2, 3, 4].every((day) => weekdays.includes(day))
        ? ar ? "الأحد–الخميس" : "Sun–Thu"
        : weekdays.length === 2 && weekdays.includes(5) && weekdays.includes(6)
          ? ar ? "عطلة الأسبوع" : "Weekend"
          : TEAM_SHIFT_WEEKDAYS.filter((day) => weekdays.includes(day.value))
              .map((day) => (ar ? day.ar : day.en))
              .join(" · ");
  const previewWindow = formatTimeInput(start, ar) + " – " + formatTimeInput(end, ar);

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !mutation.isPending) onClose(); }}>
      <DialogContent className="flex max-h-[min(92dvh,860px)] w-[calc(100vw-1.5rem)] max-w-none flex-col overflow-hidden p-0 sm:max-w-[680px]">
        <div className="border-b border-border bg-muted/15 px-5 py-4">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="grid size-9 place-items-center rounded-xl bg-orange-500/10 text-[#e85d2a]"><CalendarPlus className="size-4" /></span>
              {ar ? `إضافة وردية لـ ${member.name}` : `Assign shift to ${member.name}`}
            </DialogTitle>
            <DialogDescription>
              {ar ? "اختر وردية موجودة أو أنشئ وردية مفردة أو جدول عمل متكرر بأيام تختارها." : "Choose an existing shift, a single work window, or a recurring weekly schedule."}
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5">
          <div className="grid grid-cols-2 rounded-xl border border-border bg-muted/25 p-1">
            <button type="button" disabled={!available.length} onClick={() => setMode("existing")} className={cn("min-h-10 rounded-lg px-3 text-sm font-bold transition", mode === "existing" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground", !available.length && "cursor-not-allowed opacity-45")}>
              {ar ? "وردية موجودة" : "Existing shift"}
            </button>
            <button type="button" onClick={() => setMode("new")} className={cn("min-h-10 rounded-lg px-3 text-sm font-bold transition", mode === "new" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground")}>
              {ar ? "جدول جديد" : "New schedule"}
            </button>
          </div>

          {mode === "existing" ? (
            <Field label={ar ? "الوردية المتاحة" : "Available shift"}>
              <Select value={shiftId} onValueChange={setShiftId}>
                <SelectTrigger className="h-12"><SelectValue placeholder={ar ? "اختر وردية" : "Choose a shift"} /></SelectTrigger>
                <SelectContent>{available.map((shift) => <SelectItem key={shift.id} value={shift.id}>{shift.name} · {formatShiftOption(shift, ar)}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 rounded-xl border border-border bg-muted/20 p-1">
                <button type="button" onClick={() => setNewMode("single")} className={cn("min-h-10 rounded-lg px-3 text-xs font-bold transition sm:text-sm", newMode === "single" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground")}>{ar ? "يوم واحد" : "Single day"}</button>
                <button type="button" onClick={() => { setNewMode("recurring"); if (rangeEnd <= date) setRangeEnd(addLocalDays(date, 83)); }} className={cn("min-h-10 rounded-lg px-3 text-xs font-bold transition sm:text-sm", newMode === "recurring" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground")}>{ar ? "أيام متكررة" : "Recurring days"}</button>
              </div>

              <Field label={ar ? "اسم الوردية" : "Shift name"}>
                <Input value={name} maxLength={80} onChange={(event) => setName(event.target.value)} placeholder={ar ? "مثال: وردية المساء" : "e.g. Evening service"} />
              </Field>

              {newMode === "single" ? (
                <Field label={ar ? "التاريخ" : "Date"}><Input type="date" value={date} min={today} onChange={(event) => setDate(event.target.value)} /></Field>
              ) : (
                <>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label={ar ? "من تاريخ" : "Start date"}><Input type="date" value={date} min={today} onChange={(event) => { const next = event.target.value; setDate(next); if (rangeEnd < next) setRangeEnd(addLocalDays(next, 83)); }} /></Field>
                    <Field label={ar ? "إلى تاريخ" : "End date"}><Input type="date" value={rangeEnd} min={date} onChange={(event) => setRangeEnd(event.target.value)} /></Field>
                  </div>

                  <section className="rounded-2xl border border-border bg-muted/10 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div><h3 className="text-sm font-bold">{ar ? "أيام العمل" : "Workdays"}</h3><p className="mt-1 text-xs text-muted-foreground">{ar ? "حدد أيام الدوام بدقة، مثل الأحد إلى الخميس، أو اختر عطلة نهاية الأسبوع." : "Pick the exact workdays, such as Sunday–Thursday, weekends, or any custom combination."}</p></div>
                      <div className="flex flex-wrap gap-1.5">
                        <Button type="button" size="sm" variant="outline" onClick={() => setWeekdays([0, 1, 2, 3, 4])}>{ar ? "الأحد–الخميس" : "Sun–Thu"}</Button>
                        <Button type="button" size="sm" variant="outline" onClick={() => setWeekdays([5, 6])}>{ar ? "عطلة الأسبوع" : "Weekend"}</Button>
                        <Button type="button" size="sm" variant="outline" onClick={() => setWeekdays([0, 1, 2, 3, 4, 5, 6])}>{ar ? "كل الأيام" : "Every day"}</Button>
                      </div>
                    </div>
                    <div className="mt-4 grid grid-cols-4 gap-2 sm:grid-cols-7">
                      {TEAM_SHIFT_WEEKDAYS.map((day) => {
                        const selected = weekdays.includes(day.value);
                        return <button key={day.value} type="button" aria-pressed={selected} onClick={() => toggleWeekday(day.value)} className={cn("min-h-10 rounded-xl border px-2 text-xs font-bold transition", selected ? "border-[#e85d2a] bg-orange-500/10 text-[#cf4818]" : "border-border bg-card text-muted-foreground hover:text-foreground")}>{ar ? day.ar : day.en}</button>;
                      })}
                    </div>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs font-semibold text-muted-foreground">{ar ? `${weekdays.length} أيام بالأسبوع محددة` : `${weekdays.length} day(s) per week selected`}</p>
                      {date <= today && rangeEnd >= today ? <span className={cn("rounded-full px-2.5 py-1 text-[10px] font-bold", todayIncluded ? "bg-emerald-500/10 text-emerald-700" : "bg-slate-500/10 text-slate-600")}>{todayIncluded ? (ar ? "وردية اليوم ستظهر فوراً" : "Today will appear immediately") : (ar ? "اليوم غير محدد" : "Today is not selected")}</span> : null}
                    </div>
                  </section>
                  {invalidRange ? <p className="rounded-xl bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-700 dark:text-red-300">{ar ? "تاريخ النهاية يجب أن يكون بعد تاريخ البداية." : "End date must be on or after the start date."}</p> : null}
                </>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={ar ? "وقت البداية" : "Start time"}><Input type="time" value={start} onChange={(event) => setStart(event.target.value)} /></Field>
                <Field label={ar ? "وقت النهاية" : "End time"}><Input type="time" value={end} onChange={(event) => setEnd(event.target.value)} /></Field>
              </div>
              {overnight ? <p className="rounded-xl bg-blue-500/10 px-3 py-2 text-xs font-semibold text-blue-700 dark:text-blue-300">{ar ? "ستنتهي كل وردية في اليوم التالي." : "Each shift ends the following day."}</p> : null}
            </div>
          )}

          <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3.5">
            <span className="grid size-10 place-items-center rounded-full bg-orange-500/10 font-bold text-[#d94a19]">{member.name.slice(0, 1).toUpperCase()}</span>
            <div className="min-w-0"><strong className="block truncate text-sm">{member.name}</strong><span className="text-xs text-muted-foreground">{ROLE_NAMES[member.role][lang]}</span></div>
          </div>

          {mode === "new" && newReady ? (
            <div className="qs-shift-preview-card">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-orange-500/12 text-[#e85d2a]"><CalendarPlus className="size-4" /></span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <strong className="text-sm">{ar ? "معاينة الجدول" : "Schedule preview"}</strong>
                  <span className="qs-live-dot"><i />{ar ? "معاينة حية" : "Live preview"}</span>
                </div>
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  {selectedDaysLabel} · {previewWindow}
                  {newMode === "recurring" ? " · " + weekdays.length + " " + (ar ? "أيام بالأسبوع" : "days per week") : ""}
                </p>
              </div>
            </div>
          ) : null}
        </div>

        <DialogFooter className="sticky bottom-0 z-20 grid grid-cols-2 gap-2 border-t border-border bg-card/95 px-5 py-4 shadow-[0_-18px_34px_-28px_rgba(15,23,42,.45)] backdrop-blur sm:flex sm:justify-end">
          <Button type="button" variant="outline" className="min-w-24" disabled={mutation.isPending} onClick={onClose}>{ar ? "إلغاء" : "Cancel"}</Button>
          <Button type="button" className="min-w-36 shadow-md" disabled={mutation.isPending || (mode === "existing" ? !shiftId : !newReady)} onClick={() => mutation.mutate()}>
            <CalendarPlus className="size-4" />
            {mutation.isPending ? (ar ? "جارٍ الحفظ…" : "Saving…") : mode === "new" && newMode === "recurring" ? (ar ? "تعيين الجدول" : "Assign schedule") : (ar ? "إضافة الوردية" : "Assign shift")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CancelStaffShiftDialog({
  member,
  shift,
  restaurantId,
  ar,
  lang,
  onClose,
}: {
  member: StaffRow;
  shift: StaffCancelableShift;
  restaurantId: string;
  ar: boolean;
  lang: "en" | "ar";
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: () =>
      cancelStaffShiftAssignment({
        restaurant_id: restaurantId,
        assignment_id: shift.assignmentId,
      }),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["platform", "staff-schedule", restaurantId] }),
        qc.invalidateQueries({ queryKey: ["operations", "shifts", restaurantId] }),
        qc.invalidateQueries({ queryKey: ["operations", "shift-assignments", restaurantId] }),
      ]);
      toast.success(ar ? `تم إلغاء وردية ${member.name}` : `Shift cancelled for ${member.name}`);
      onClose();
    },
    onError: (error) => toast.error(humanError(error, lang)),
  });
  const windowLabel = shift.start ? formatScheduleWindow(shift.start, ar) : shift.shiftDate;

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !mutation.isPending) onClose();
      }}
    >
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="grid size-9 place-items-center rounded-xl bg-destructive/10 text-destructive">
              <CalendarX2 className="size-4" />
            </span>
            {ar ? "إلغاء الوردية؟" : "Cancel shift?"}
          </DialogTitle>
          <DialogDescription>
            {ar
              ? `سيتم إلغاء تعيين ${member.name} من وردية ${shift.name} (${windowLabel}). لن يتم حذف الوردية نفسها.`
              : `Remove ${member.name} from ${shift.name} (${windowLabel}). The shift itself will not be deleted.`}
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-xl border border-border bg-muted/20 p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <strong className="block truncate text-sm">{shift.name}</strong>
              <span className="mt-1 block text-xs text-muted-foreground">{windowLabel}</span>
            </div>
            <span className="rounded-full bg-muted px-2.5 py-1 text-[10px] font-bold capitalize text-muted-foreground">
              {shift.status}
            </span>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={mutation.isPending} onClick={onClose}>
            {ar ? "رجوع" : "Keep shift"}
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            <CalendarX2 className="size-4" />
            {mutation.isPending
              ? ar
                ? "جارٍ الإلغاء…"
                : "Cancelling…"
              : ar
                ? "إلغاء الوردية"
                : "Cancel shift"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-bold">{label}</Label>
      {children}
    </div>
  );
}
function Read({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-4 rounded-xl border border-border px-4 py-3">
      <span className="text-xs font-semibold text-muted-foreground">{label}</span>
      <strong className="truncate text-sm">{value}</strong>
    </div>
  );
}
function Stat({
  icon,
  value,
  label,
  tone,
  detail,
}: {
  icon: React.ReactNode;
  value: number;
  label: string;
  tone: "blue" | "green" | "cyan";
  detail: string;
}) {
  const bg =
    tone === "green"
      ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30"
      : tone === "cyan"
        ? "bg-cyan-50 text-cyan-600 dark:bg-cyan-950/30"
        : "bg-blue-50 text-blue-600 dark:bg-blue-950/30";
  return (
    <div className="qs-stat flex items-center gap-4">
      <span className={cn("grid size-11 place-items-center rounded-full", bg)}>{icon}</span>
      <div>
        <p className="font-display text-2xl font-bold">{value}</p>
        <p className="text-xs font-semibold text-muted-foreground">{label}</p>
        <p className="mt-1 text-[10px] text-muted-foreground">{detail}</p>
      </div>
    </div>
  );
}

function formatTeamTime(value: string, ar: boolean) {
  return new Date(value).toLocaleTimeString(ar ? "ar-JO" : "en-JO", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatTeamDuration(seconds: number, ar: boolean) {
  const totalMinutes = Math.max(0, Math.floor(seconds / 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return ar ? `${hours}س ${minutes}د` : `${hours}h ${minutes}m`;
}

function formatLastSeen(value: string | null | undefined, ar: boolean, nowMs = Date.now()) {
  if (!value) return ar ? "لا يوجد نشاط" : "No activity";
  const date = new Date(value);
  const diff = nowMs - date.getTime();
  if (!Number.isFinite(diff)) return "—";
  if (diff <= 90_000) return ar ? "متصل الآن" : "Online now";
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return ar ? `قبل ${minutes} د` : `${minutes} min ago`;
  const now = new Date();
  if (date.toDateString() === now.toDateString())
    return ar
      ? `اليوم ${date.toLocaleTimeString("ar-JO", { hour: "2-digit", minute: "2-digit" })}`
      : `Today ${date.toLocaleTimeString("en-JO", { hour: "2-digit", minute: "2-digit" })}`;
  return date.toLocaleString(ar ? "ar-JO" : "en-JO", { dateStyle: "medium", timeStyle: "short" });
}

type ScheduleAttendance = "on_time" | "late" | "left_early" | "overtime" | "not_clocked";

function scheduleAttendance(
  start: string | null,
  end: string | null,
  entry: StaffTimeRow | undefined,
): ScheduleAttendance {
  if (!start || !end || !entry) return "not_clocked";
  const plannedStart = new Date(start).getTime();
  const plannedEnd = new Date(end).getTime();
  const actualStart = new Date(entry.clock_in).getTime();
  const actualEnd = entry.clock_out ? new Date(entry.clock_out).getTime() : Date.now();
  if (actualEnd - plannedEnd >= 30 * 60_000) return "overtime";
  if (entry.clock_out && plannedEnd - actualEnd >= 15 * 60_000) return "left_early";
  if (actualStart - plannedStart >= 15 * 60_000) return "late";
  return "on_time";
}

function scheduleLabel(status: ScheduleAttendance, ar: boolean) {
  return status === "overtime"
    ? ar
      ? "وقت إضافي"
      : "Overtime"
    : status === "left_early"
      ? ar
        ? "غادر مبكراً"
        : "Left early"
      : status === "late"
        ? ar
          ? "متأخر"
          : "Late"
        : status === "on_time"
          ? ar
            ? "ضمن الوقت"
            : "On time"
          : ar
            ? "لم يسجل"
            : "Not clocked";
}

function scheduleTone(status: ScheduleAttendance) {
  return status === "overtime"
    ? "bg-amber-500/10 text-amber-700"
    : status === "left_early"
      ? "bg-rose-500/10 text-rose-700"
      : status === "late"
        ? "bg-orange-500/10 text-orange-700"
        : status === "on_time"
          ? "bg-emerald-500/10 text-emerald-700"
          : "bg-muted text-muted-foreground";
}

function localDateKey(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatTimeInput(value: string, ar: boolean) {
  if (!value) return "—";
  const parts = value.split(":").map(Number);
  const date = new Date(2000, 0, 1, parts[0] || 0, parts[1] || 0);
  return date.toLocaleTimeString(ar ? "ar-JO" : "en-US", { hour: "2-digit", minute: "2-digit" });
}

function localDateTimeIso(date: string, time: string, addDays = 0) {
  const value = new Date(`${date}T${time}:00`);
  if (addDays) value.setDate(value.getDate() + addDays);
  if (Number.isNaN(value.getTime())) throw new Error("Invalid shift date or time.");
  return value.toISOString();
}

function addLocalDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00`);
  value.setDate(value.getDate() + days);
  return localDateKey(value);
}

function formatScheduleWindow(value: string | null, ar: boolean) {
  if (!value) return ar ? "الوقت غير محدد" : "Time not set";
  return new Date(value).toLocaleString(ar ? "ar-JO" : "en-JO", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatTodayShiftWindow(value: string | null, ar: boolean) {
  if (!value) return ar ? "اليوم" : "Today";
  const time = new Date(value).toLocaleTimeString(ar ? "ar-JO" : "en-JO", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return ar ? `اليوم · ${time}` : `Today · ${time}`;
}

function formatScheduleDayLabel(value: string, ar: boolean) {
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(ar ? "ar-JO" : "en-JO", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatTodayShiftRange(start: string | null, end: string | null, ar: boolean) {
  if (!start && !end) return ar ? "اليوم" : "Today";
  const locale = ar ? "ar-JO" : "en-JO";
  const fmt = (value: string | null) => value ? new Date(value).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" }) : "—";
  return `${ar ? "اليوم" : "Today"} · ${fmt(start)}–${fmt(end)}`;
}

function dateKeyInTimeZone(value: Date, timeZone: string) {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(value);
    const year = parts.find((part) => part.type === "year")?.value;
    const month = parts.find((part) => part.type === "month")?.value;
    const day = parts.find((part) => part.type === "day")?.value;
    if (year && month && day) return `${year}-${month}-${day}`;
  } catch {}
  return localDateKey(value);
}

function formatShiftOption(shift: StaffScheduleRow, ar: boolean) {
  if (!shift.planned_start) return shift.shift_date;
  const start = new Date(shift.planned_start);
  const end = shift.planned_end ? new Date(shift.planned_end) : null;
  const locale = ar ? "ar-JO" : "en-JO";
  const date = start.toLocaleDateString(locale, { month: "short", day: "numeric" });
  const startTime = start.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  const endTime = end?.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" }) ?? "—";
  return `${date}, ${startTime}–${endTime}`;
}

function hasShiftConflict(
  staffId: string,
  start: string | null,
  end: string | null,
  assignments: StaffAssignmentRow[],
  shifts: StaffScheduleRow[],
) {
  if (!start || !end) return false;
  const candidateStart = new Date(start).getTime();
  const candidateEnd = new Date(end).getTime();
  if (!Number.isFinite(candidateStart) || !Number.isFinite(candidateEnd)) return false;
  const shiftsById = new Map(shifts.map((shift) => [shift.id, shift]));
  return assignments.some((assignment) => {
    if (assignment.staff_id !== staffId || assignment.status === "released") return false;
    const shift = shiftsById.get(assignment.shift_id);
    // Ignore stale assignments whose shift was deleted/archived, and completed shifts.
    // Only live schedule rows are eligible to block a new assignment.
    if (!shift || shift.status === "closed") return false;
    const assignedStart = new Date(assignment.starts_at ?? shift.planned_start ?? "").getTime();
    const assignedEnd = new Date(assignment.ends_at ?? shift.planned_end ?? "").getTime();
    return (
      Number.isFinite(assignedStart) &&
      Number.isFinite(assignedEnd) &&
      candidateStart < assignedEnd &&
      candidateEnd > assignedStart
    );
  });
}
