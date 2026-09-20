import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { History, IdCard, KeyRound, MoreHorizontal, Plus, Search, ShieldCheck, Trash2, UserRound, UsersRound } from "lucide-react";
import { toast } from "sonner";

import { MasterEyebrow, MasterKpi, MasterPageHeader } from "@/components/app/MasterPage";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useAccess, useSupabaseSession } from "@/hooks/useSession";
import { useRestaurantSeatUsage } from "@/hooks/useRestaurantSeatUsage";
import { supabase } from "@/integrations/supabase/client";
import { avatarPresetUrl } from "@/lib/avatar-presets";
import { humanError } from "@/lib/errors";
import { useI18n } from "@/lib/i18n";
import { PERMISSION_GROUPS, ROLE_LABELS, roleHasCapability, type AppRole, type Capability, type PermissionOverrides } from "@/lib/permissions";
import { qrDataUrl } from "@/lib/qr";
import { getStaffAccess } from "@/lib/staff-auth.functions";
import { inviteStaffMember, removeStaffMember, updateStaffMember } from "@/lib/staff.functions";
import { cn } from "@/lib/utils";

const ROLES: AppRole[] = ["restaurant_admin", "operations_manager", "manager", "kitchen", "waiter", "cashier", "host", "inventory", "procurement", "accountant"];
const ROLE_NAMES: Record<AppRole, { en: string; ar: string }> = ROLE_LABELS;
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
type StaffTab = "all" | "admins" | "staff";
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
type Editing = StaffRow & { password: string; confirmPassword: string; permission_overrides: PermissionOverrides };
type AuditRow = { id: string; action: string; entity: string | null; created_at: string; metadata: unknown };

export function StaffManagerAdvanced({ restaurantId }: { restaurantId: string }) {
  const { t, lang } = useI18n();
  const ar = lang === "ar";
  const accessHook = useAccess();
  const session = useSupabaseSession();
  const currentUserId = session.data?.user.id ?? null;
  const isSuperAdmin = accessHook.isSuperAdmin;
  const assignableRoles = isSuperAdmin ? ROLES : ROLES.filter((role) => role !== "restaurant_admin");
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
  const [editing, setEditing] = useState<Editing | null>(null);
  const [drawerTab, setDrawerTab] = useState<DrawerTab>("permissions");
  const [pendingDelete, setPendingDelete] = useState<StaffRow | null>(null);
  const [credentials, setCredentials] = useState<any>(null);
  const [access, setAccess] = useState<any>(null);
  const [badge, setBadge] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", email: "", role: "waiter" as AppRole });
  const [presenceNow, setPresenceNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setPresenceNow(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, []);

  const staff = useQuery<StaffRow[]>({
    queryKey: ["platform", "staff", restaurantId],
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
    queryFn: async () => {
      const { data, error } = await (supabase.from("staff") as any).select("*").eq("restaurant_id", restaurantId).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as StaffRow[];
    },
  });
  useEffect(() => {
    const channel = supabase.channel(`team-presence:${restaurantId}`).on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "staff", filter: `restaurant_id=eq.${restaurantId}` },
      () => void qc.invalidateQueries({ queryKey: ["platform", "staff", restaurantId] }),
    ).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [qc, restaurantId]);
  const audit = useQuery<AuditRow[]>({
    queryKey: ["platform", "staff-audit", restaurantId, editing?.auth_user_id],
    enabled: Boolean(editing && drawerTab === "log"),
    queryFn: async () => {
      if (!editing) return [];
      const { data, error } = await supabase.from("audit_logs").select("id, action, entity, created_at, metadata").eq("restaurant_id", restaurantId).eq("actor_user_id", editing.auth_user_id).order("created_at", { ascending: false }).limit(30);
      if (error) throw error;
      return (data ?? []) as AuditRow[];
    },
  });
  const admins = (staff.data ?? []).filter((row) => row.role === "restaurant_admin").length;
  const staffOnly = (staff.data ?? []).length - admins;
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (staff.data ?? []).filter((row) => {
      const isAdmin = row.role === "restaurant_admin";
      if (tab === "admins" && !isAdmin) return false;
      if (tab === "staff" && isAdmin) return false;
      if (roleFilter !== "all" && row.role !== roleFilter) return false;
      if (statusFilter === "active" && !row.is_active) return false;
      if (statusFilter === "inactive" && row.is_active) return false;
      return !q || `${row.name} ${row.email ?? ""} ${row.role}`.toLowerCase().includes(q);
    });
  }, [search, tab, roleFilter, statusFilter, staff.data]);

  async function refresh() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["platform"] }),
      qc.invalidateQueries({ queryKey: ["staff"] }),
      qc.invalidateQueries({ queryKey: ["seats", restaurantId] }),
    ]);
  }
  function isOwnRestaurantManager(member: StaffRow) {
    return !isSuperAdmin && member.role === "restaurant_admin" && Boolean(currentUserId) && member.auth_user_id === currentUserId;
  }
  function startEdit(member: StaffRow) {
    setEditing({ ...member, password: "", confirmPassword: "", permission_overrides: { ...(member.permission_overrides ?? {}) } });
    setDrawerTab(isOwnRestaurantManager(member) ? "profile" : "permissions");
  }
  function permissionEnabled(cap: Capability) {
    if (!editing) return false;
    return roleHasCapability(editing.role, cap) && editing.permission_overrides?.[cap] !== false;
  }
  function setPermission(cap: Capability, value: boolean) {
    if (!editing || !roleHasCapability(editing.role, cap)) return;
    setEditing({ ...editing, permission_overrides: { ...editing.permission_overrides, [cap]: value } });
  }
  async function create() {
    if (seatsFull) {
      toast.error(ar ? "تم الوصول إلى حد المستخدمين لهذا المطعم." : "This restaurant has reached its user limit.");
      return;
    }
    setBusy(true);
    try {
      const result = await invite({ data: { restaurantId, email: form.email.trim(), name: form.name.trim(), role: form.role } });
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
      toast.error(ar ? "الاسم طويل جداً. الحد الأقصى 80 حرفاً." : "The name is too long. Maximum 80 characters.");
      return;
    }
    const ownRestaurantManager = isOwnRestaurantManager(editing);
    if (!ownRestaurantManager) {
      if (password && password.length < 8) {
        toast.error(ar ? "كلمة المرور 8 أحرف على الأقل." : "Password must be at least 8 characters.");
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
        const { error: staffError } = await (supabase as any).rpc("update_own_display_name", { _staff_id: editing.id, _name: nextName });
        if (staffError) throw staffError;
        const { error: metadataError } = await supabase.auth.updateUser({ data: { full_name: nextName, name: nextName } });
        if (metadataError) console.warn("Display-name metadata sync skipped:", metadataError.message);
        await Promise.all([
          refresh(),
          qc.invalidateQueries({ queryKey: ["auth", "session"] }),
          qc.invalidateQueries({ queryKey: ["staff", "memberships"] }),
        ]);
        setEditing(null);
        toast.success(ar ? "تم تحديث اسم مدير المطعم" : "Restaurant Manager name updated");
        return;
      }
      await update({ data: { staffId: editing.id, name: nextName, email: editing.email?.trim() || undefined, role: editing.role, isActive: editing.is_active, permissionOverrides: editing.permission_overrides, ...(password ? { password } : {}) } });
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
      setBadge(result.badgeCode ? await qrDataUrl(`${location.origin}/staff/badge/${result.badgeCode}`, 420) : null);
    } catch (error) {
      toast.error(humanError(error, lang));
    }
  }

  return <div className="space-y-5">
    <MasterPageHeader
      eyebrow={<MasterEyebrow icon={UsersRound}>{ar ? "الفريق والوصول" : "Team & access"}</MasterEyebrow>}
      title={ar ? "الفريق والأدوار" : "Staff & Roles"}
      description={ar ? "أدر الفريق، الصلاحيات، حالة الوصول والنشاط من مكان واحد واضح." : "Manage people, permissions, access state and activity from one organized workspace."}
      actions={<Button disabled={seats.isPending||seatsFull} onClick={()=>setAddOpen(true)}><Plus className="size-4"/>{seatsFull?(ar?"اكتمل الحد":"Limit reached"):(ar?"إضافة عضو":"Invite Member")}</Button>}
    />

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <MasterKpi icon={UsersRound} label={ar?"إجمالي الفريق":"Total Staff"} value={String((staff.data??[]).length)} hint={seatLimit==null?(ar?"غير محدود":"Unlimited"):`${seatsUsed}/${seatLimit} seats`} tone="blue"/>
      <MasterKpi icon={ShieldCheck} label={ar?"المدراء":"Admins"} value={String(admins)} hint={ar?"وصول إداري":"Admin access"} tone="green"/>
      <MasterKpi icon={UserRound} label={ar?"الموظفون":"Staff"} value={String(staffOnly)} hint={ar?"أدوار تشغيلية":"Operational roles"} tone="purple"/>
      <MasterKpi icon={UserRound} label={ar?"نشطون الآن":"Active Access"} value={String((staff.data??[]).filter(member=>member.is_active).length)} hint={ar?"حسابات مفعلة":"Enabled accounts"} tone="orange"/>
    </section>

    <section className="qs-card min-w-0 overflow-hidden">
      <div className="border-b border-border px-4 pt-3">
        <div className="flex gap-6 overflow-x-auto text-xs font-semibold">{([["all", ar ? "كل الفريق" : "All Staff", (staff.data ?? []).length], ["admins", ar ? "المدراء" : "Admins", admins], ["staff", ar ? "الموظفون" : "Staff", staffOnly]] as const).map(([id, label, count]) => <button key={id} type="button" onClick={() => setTab(id)} className={cn("relative min-h-11 shrink-0 px-1", tab === id ? "text-[#ff5a0a]" : "text-muted-foreground")}>{label} <span className="ms-1 rounded-full bg-muted px-2 py-0.5 text-[10px]">{count}</span>{tab === id ? <span className="absolute inset-x-0 bottom-0 h-0.5 bg-[#ff5a0a]" /> : null}</button>)}</div>
      </div>
      <div className="grid gap-3 border-b border-border p-4 lg:grid-cols-[minmax(0,1fr)_180px_180px]">
        <div className="relative"><Search className="pointer-events-none absolute start-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={ar ? "ابحث بالاسم أو البريد أو الدور..." : "Search by name, email or role..."} className="h-11 ps-10" /></div>
        <Select value={roleFilter} onValueChange={setRoleFilter}><SelectTrigger className="h-11"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{ar ? "كل الأدوار" : "All Roles"}</SelectItem>{ROLES.map((role) => <SelectItem key={role} value={role}>{ROLE_NAMES[role][lang]}</SelectItem>)}</SelectContent></Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}><SelectTrigger className="h-11"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{ar ? "كل الحالات" : "All Status"}</SelectItem><SelectItem value="active">{t("common.active")}</SelectItem><SelectItem value="inactive">{t("common.inactive")}</SelectItem></SelectContent></Select>
      </div>
      {staff.isPending ? <Skeleton className="m-4 h-[420px] rounded-xl" /> : <>
        <div className="hidden overflow-x-auto md:block"><table className="qs-table min-w-[760px]"><thead><tr><th>#</th><th>{ar ? "الموظف" : "Staff Member"}</th><th>{ar ? "البريد" : "Email"}</th><th>{ar ? "الدور" : "Role"}</th><th>{ar ? "الحالة" : "Status"}</th><th>{ar ? "آخر نشاط" : "Last Active"}</th><th>{ar ? "إجراءات" : "Actions"}</th></tr></thead><tbody>{rows.map((member, index) => {
          const locked = member.role === "restaurant_admin" && !isSuperAdmin && !isOwnRestaurantManager(member);
          const avatar = member.avatar_url || avatarPresetUrl(member.avatar_preset);
          return <tr key={member.id}><td className="text-muted-foreground">#{String(index + 1).padStart(3, "0")}</td><td><button type="button" disabled={locked} onClick={() => !locked && startEdit(member)} className="flex items-center gap-3 text-start"><span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-full bg-muted font-bold">{avatar ? <img src={avatar} alt="" className="size-full object-cover" /> : member.name.slice(0, 1).toUpperCase()}</span><span className="font-bold">{member.name}</span></button></td><td className="text-muted-foreground">{member.email ?? "—"}</td><td><span className={cn("qs-status", ROLE_TONE[member.role])}>{ROLE_NAMES[member.role][lang]}</span></td><td><span className={cn("qs-status", member.is_active ? "bg-emerald-500/12 text-emerald-600" : "bg-slate-500/12 text-slate-500")}><i className={cn("size-1.5 rounded-full", member.is_active ? "bg-emerald-500" : "bg-slate-400")} />{member.is_active ? t("common.active") : t("common.inactive")}</span></td><td className="text-muted-foreground">{formatLastSeen(member.last_seen_at, ar, presenceNow)}</td><td><button type="button" disabled={locked} onClick={() => !locked && startEdit(member)} className="grid size-9 place-items-center rounded-lg bg-muted/40 hover:bg-muted" aria-label={ar ? "تعديل" : "Edit"}><MoreHorizontal className="size-4" /></button></td></tr>;
        })}</tbody></table></div>
        <div className="space-y-2 p-3 md:hidden">{rows.map((member) => {
          const locked = member.role === "restaurant_admin" && !isSuperAdmin && !isOwnRestaurantManager(member);
          const avatar = member.avatar_url || avatarPresetUrl(member.avatar_preset);
          return <button key={member.id} type="button" disabled={locked} onClick={() => !locked && startEdit(member)} className="flex w-full items-center gap-3 rounded-xl border border-border bg-card p-3 text-start"><span className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-full bg-muted font-bold">{avatar ? <img src={avatar} alt="" className="size-full object-cover" /> : member.name.slice(0, 1).toUpperCase()}</span><span className="min-w-0 flex-1"><strong className="block truncate text-sm">{member.name}</strong><span className="mt-1 flex items-center gap-2"><span className={cn("qs-status", ROLE_TONE[member.role])}>{ROLE_NAMES[member.role][lang]}</span><span className={cn("size-2 rounded-full", member.is_active ? "bg-emerald-500" : "bg-slate-400")} /></span></span><MoreHorizontal className="size-4 text-muted-foreground" /></button>;
        })}</div>
      </>}
    </section>

    <Dialog open={Boolean(editing)} onOpenChange={(open) => { if (!open && !busy) setEditing(null); }}>
      <DialogContent className="flex h-[min(880px,calc(100dvh-1.5rem))] w-[calc(100vw-1.5rem)] max-w-[1100px] flex-col gap-0 overflow-hidden p-0 sm:max-w-[1100px]">
        {editing ? <>
          {(() => { const ownRestaurantManager = isOwnRestaurantManager(editing); return <>
          <div className="border-b border-border px-4 py-4 sm:px-6">
            <div className="flex min-w-0 items-center gap-3 pe-8">
              <span className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-full bg-muted text-lg font-bold ring-1 ring-border">{(editing.avatar_url || avatarPresetUrl(editing.avatar_preset)) ? <img src={(editing.avatar_url || avatarPresetUrl(editing.avatar_preset)) ?? undefined} alt="" className="size-full object-cover" /> : editing.name.slice(0, 1).toUpperCase()}</span>
              <div className="min-w-0 flex-1"><h2 className="truncate font-display text-lg font-bold sm:text-xl">{editing.name}</h2><p className="truncate text-xs text-muted-foreground">{editing.email}</p></div>
              <span className={cn("hidden shrink-0 rounded-full px-3 py-1.5 text-xs font-bold sm:inline-flex", editing.is_active ? "bg-emerald-500/10 text-emerald-600" : "bg-muted text-muted-foreground")}>{editing.is_active ? t("common.active") : t("common.inactive")}</span>
            </div>
          </div>

          <div className="flex shrink-0 overflow-x-auto border-b border-border px-2 sm:px-4">{(ownRestaurantManager ? [["profile", ar ? "الاسم" : "Manager name", UserRound]] as const : [["permissions", ar ? "الصلاحيات" : "Permissions", ShieldCheck], ["profile", ar ? "الملف" : "Profile", UserRound], ["log", ar ? "سجل الوصول" : "Access Log", History]] as const).map(([id, label, Icon]) => <button key={id} type="button" onClick={() => setDrawerTab(id)} className={cn("relative flex min-h-14 min-w-[140px] flex-1 items-center justify-center gap-2 px-3 text-sm font-semibold", drawerTab === id ? "text-[#ff5a0a]" : "text-muted-foreground hover:text-foreground")}><Icon className="size-4" />{label}{drawerTab === id ? <span className="absolute inset-x-4 bottom-0 h-0.5 rounded-full bg-[#ff5a0a]" /> : null}</button>)}</div>

          <div className="min-h-0 flex-1 overflow-y-auto bg-muted/10 p-4 sm:p-6">
            {drawerTab === "permissions" ? <div className="grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
              <div className="space-y-4">
                <section className="rounded-2xl border border-border bg-card p-4 shadow-sm"><h3 className="mb-4 text-sm font-bold">{ar ? "الدور والوصول" : "Role & access"}</h3><div className="space-y-4"><Field label={ar ? "الدور" : "Role"}><Select value={editing.role} onValueChange={(value) => setEditing({ ...editing, role: value as AppRole, permission_overrides: {} })}><SelectTrigger className="h-11"><SelectValue /></SelectTrigger><SelectContent>{assignableRoles.map((role) => <SelectItem key={role} value={role}>{ROLE_NAMES[role][lang]}</SelectItem>)}</SelectContent></Select></Field><label className="flex min-h-12 items-center justify-between rounded-xl border border-border px-3"><span><strong className="block text-xs">{ar ? "وصول نشط" : "Active access"}</strong><span className="mt-0.5 block text-[10px] text-muted-foreground">{ar ? "السماح بتسجيل الدخول" : "Allow sign in"}</span></span><Switch checked={editing.is_active} onCheckedChange={(value) => setEditing({ ...editing, is_active: value })} /></label></div></section>
                <section className="rounded-2xl border border-border bg-card p-4 shadow-sm"><div className="mb-3 flex items-center gap-2"><KeyRound className="size-4 text-[#ff5a0a]" /><h3 className="text-sm font-bold">{ar ? "أمان الحساب" : "Account security"}</h3></div><div className="space-y-3"><Field label={ar ? "كلمة مرور جديدة" : "New Password"}><Input type="password" autoComplete="new-password" value={editing.password} placeholder={ar ? "اتركها فارغة بدون تغيير" : "Leave blank to keep current"} onChange={(event) => setEditing({ ...editing, password: event.target.value })} /></Field><Field label={ar ? "تأكيد كلمة المرور" : "Confirm Password"}><Input type="password" autoComplete="new-password" value={editing.confirmPassword} onChange={(event) => setEditing({ ...editing, confirmPassword: event.target.value })} /></Field><p className="text-[10px] leading-4 text-muted-foreground">{ar ? "الحد الأدنى 8 أحرف. اترك الحقلين فارغين للإبقاء على كلمة المرور الحالية." : "Minimum 8 characters. Leave both fields blank to keep the current password."}</p></div></section>
              </div>
              <section className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5"><div className="mb-4"><h3 className="text-sm font-bold">{ar ? "الصلاحيات المتقدمة" : "Advanced permissions"}</h3><p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">{ar ? "خصص صلاحيات هذا المستخدم ضمن حدود دوره. لا يمكن منح صلاحية أعلى من حدود الأمان في الخادم." : "Customize this user inside the selected role's secure ceiling. A toggle can restrict access, but cannot grant privileges beyond the server-side role."}</p></div><div className="grid gap-3 md:grid-cols-2">{PERMISSION_GROUPS.map((group) => <section key={group.id} className="rounded-xl border border-border bg-muted/10 p-3.5"><h4 className="mb-3 text-xs font-bold">{ar ? group.ar : group.en}</h4><div className="space-y-3">{group.items.map((item) => {
                const supported = roleHasCapability(editing.role, item.capability);
                return <label key={item.capability} className={cn("flex min-h-9 items-center justify-between gap-3 text-xs", !supported && "opacity-45")}><span className="leading-4">{ar ? item.ar : item.en}</span><Switch disabled={!supported} checked={permissionEnabled(item.capability)} onCheckedChange={(value) => setPermission(item.capability, value)} /></label>;
              })}</div></section>)}</div></section>
            </div> : drawerTab === "profile" ? <div className="mx-auto max-w-3xl space-y-5">
              <section className="rounded-2xl border border-border bg-card p-5 shadow-sm"><h3 className="text-base font-bold">{ownRestaurantManager ? (ar ? "اسم مدير المطعم" : "Restaurant Manager name") : (ar ? "معلومات المستخدم" : "User profile")}</h3><p className="mt-1 text-xs text-muted-foreground">{ownRestaurantManager ? (ar ? "يمكنك تعديل اسمك هنا فقط. البريد والدور والصلاحيات تبقى محمية." : "Edit your name here. Email, role and permissions remain protected.") : (ar ? "يمكن تعديل الاسم والبريد وحفظهما مع بقية التغييرات." : "Edit the name and email here; they are saved with the rest of the changes.")}</p><div className="mt-5 grid gap-4 sm:grid-cols-2"><Field label={ar ? "الاسم" : "Name"}><Input value={editing.name} maxLength={80} onChange={(event) => setEditing({ ...editing, name: event.target.value })} /></Field>{ownRestaurantManager ? <Read label={ar ? "البريد الإلكتروني" : "Email"} value={editing.email ?? "—"} /> : <Field label={ar ? "البريد الإلكتروني" : "Email"}><Input type="email" value={editing.email ?? ""} onChange={(event) => setEditing({ ...editing, email: event.target.value })} /></Field>}<Read label={ar ? "الدور" : "Role"} value={ROLE_NAMES[editing.role][lang]} /><Read label={ar ? "تاريخ الإضافة" : "Joined"} value={new Date(editing.created_at).toLocaleDateString(ar ? "ar-JO" : "en-US")} /></div>{!ownRestaurantManager ? <button type="button" className="qs-button-secondary mt-5 w-full sm:w-auto" onClick={() => void openAccess(editing.id)}><IdCard className="size-4" />{ar ? "عرض بطاقة الوصول" : "View Staff Access"}</button> : null}</section>
            </div> : <div className="mx-auto max-w-3xl"><section className="rounded-2xl border border-border bg-card p-5 shadow-sm"><div className="mb-4"><h3 className="text-base font-bold">{ar ? "سجل الوصول والنشاط" : "Access & activity log"}</h3><p className="mt-1 text-xs text-muted-foreground">{ar ? "آخر الأحداث المسجلة لهذا المستخدم." : "Latest recorded events for this user."}</p></div>{audit.isPending ? <Skeleton className="h-48 rounded-xl" /> : audit.isError ? <p className="rounded-xl bg-muted p-4 text-sm text-muted-foreground">{ar ? "تعذر تحميل سجل الوصول." : "Access log is unavailable for this account."}</p> : (audit.data ?? []).length ? <div className="space-y-2">{(audit.data ?? []).map((row) => <div key={row.id} className="rounded-xl border border-border p-3"><div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between"><strong className="text-xs">{row.action}</strong><span className="text-[10px] text-muted-foreground">{new Date(row.created_at).toLocaleString(ar ? "ar-JO" : "en-US")}</span></div><p className="mt-1 text-[10px] text-muted-foreground">{row.entity ?? (ar ? "النظام" : "System")}</p></div>)}</div> : <p className="rounded-xl bg-muted/40 p-8 text-center text-sm text-muted-foreground">{ar ? "لا يوجد نشاط مسجل لهذا المستخدم بعد." : "No recorded activity for this user yet."}</p>}</section></div>}
          </div>

          <div className="safe-bottom shrink-0 border-t border-border bg-card p-3 sm:p-4"><div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center"><button type="button" className="qs-button-secondary min-h-11 sm:min-w-28" disabled={busy} onClick={() => setEditing(null)}>{t("common.cancel")}</button>{!ownRestaurantManager ? <><button type="button" className="qs-button-secondary min-h-11 sm:min-w-28" disabled={busy} onClick={() => void openAccess(editing.id)}><IdCard className="size-4" />{ar ? "الوصول" : "Access"}</button><button type="button" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold text-destructive hover:bg-destructive/10 sm:ms-auto" disabled={busy} onClick={() => setPendingDelete(editing)}><Trash2 className="size-4" />{ar ? "حذف" : "Delete"}</button></> : <span className="hidden sm:block sm:flex-1" />}<button type="button" className="qs-button-primary min-h-11 sm:min-w-44" disabled={busy} onClick={() => void saveEdit()}>{busy ? (ar ? "جارٍ الحفظ…" : "Saving…") : ownRestaurantManager ? (ar ? "حفظ الاسم" : "Save name") : (ar ? "حفظ التغييرات" : "Save Changes")}</button></div></div>
          </>; })()}
        </> : null}
      </DialogContent>
    </Dialog>

    <Dialog open={addOpen} onOpenChange={setAddOpen}><DialogContent className="sm:max-w-lg"><DialogHeader><DialogTitle>{ar ? "إضافة عضو فريق" : "Add Team Member"}</DialogTitle><DialogDescription>{seatLimit == null ? (ar ? "أضف مستخدماً جديداً للفريق." : "Add a new member to this restaurant.") : `${seatsUsed} / ${seatLimit} ${ar ? "مستخدمين" : "users"}`}</DialogDescription></DialogHeader><div className="space-y-4"><Field label={ar ? "الاسم" : "Name"}><Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></Field><Field label={ar ? "البريد الإلكتروني" : "Email"}><Input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></Field><Field label={ar ? "الدور" : "Role"}><Select value={form.role} onValueChange={(value) => setForm({ ...form, role: value as AppRole })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{assignableRoles.map((role) => <SelectItem key={role} value={role}>{ROLE_NAMES[role][lang]}</SelectItem>)}</SelectContent></Select></Field></div><DialogFooter><Button variant="ghost" onClick={() => setAddOpen(false)}>{t("common.cancel")}</Button><Button disabled={busy || !form.name.trim() || !form.email.trim() || seatsFull} onClick={() => void create()}>{ar ? "إضافة" : "Add Member"}</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={Boolean(credentials)} onOpenChange={(value) => !value && setCredentials(null)}><DialogContent><DialogHeader><DialogTitle>{ar ? "بيانات الدخول" : "Login credentials"}</DialogTitle><DialogDescription>{credentials?.email}</DialogDescription></DialogHeader><div className="rounded-xl bg-muted p-4 font-mono text-sm">{credentials?.password ?? (ar ? "تم ربط الحساب الموجود" : "Existing account linked")}</div><DialogFooter><Button onClick={() => setCredentials(null)}>{t("common.close")}</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={Boolean(pendingDelete)} onOpenChange={(value) => !value && setPendingDelete(null)}><DialogContent><DialogHeader><DialogTitle>{ar ? "حذف المستخدم؟" : "Delete team member?"}</DialogTitle><DialogDescription>{pendingDelete?.name}</DialogDescription></DialogHeader><DialogFooter><Button variant="ghost" onClick={() => setPendingDelete(null)}>{t("common.cancel")}</Button><Button variant="destructive" disabled={busy} onClick={() => void del()}>{t("common.delete")}</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={Boolean(access)} onOpenChange={(value) => !value && setAccess(null)}><DialogContent className="max-w-sm"><DialogHeader><DialogTitle>{ar ? "وصول الموظف" : "Staff access"}</DialogTitle><DialogDescription>{access?.name}</DialogDescription></DialogHeader>{badge ? <img src={badge} alt="Staff badge" className="mx-auto size-56 rounded-xl" /> : <div className="rounded-xl bg-muted p-5 text-center text-sm text-muted-foreground">{ar ? "لا توجد بطاقة مفعلة." : "No active badge available."}</div>}<DialogFooter><Button onClick={() => setAccess(null)}>{t("common.close")}</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div className="space-y-1.5"><Label className="text-xs font-bold">{label}</Label>{children}</div>; }
function Read({ label, value }: { label: string; value: string }) { return <div className="flex min-h-11 items-center justify-between gap-4 rounded-xl border border-border px-4 py-3"><span className="text-xs font-semibold text-muted-foreground">{label}</span><strong className="truncate text-sm">{value}</strong></div>; }
function Stat({ icon, value, label, tone, detail }: { icon: React.ReactNode; value: number; label: string; tone: "blue" | "green" | "cyan"; detail: string }) { const bg = tone === "green" ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30" : tone === "cyan" ? "bg-cyan-50 text-cyan-600 dark:bg-cyan-950/30" : "bg-blue-50 text-blue-600 dark:bg-blue-950/30"; return <div className="qs-stat flex items-center gap-4"><span className={cn("grid size-11 place-items-center rounded-full", bg)}>{icon}</span><div><p className="font-display text-2xl font-bold">{value}</p><p className="text-xs font-semibold text-muted-foreground">{label}</p><p className="mt-1 text-[10px] text-muted-foreground">{detail}</p></div></div>; }

function formatLastSeen(value: string | null | undefined, ar: boolean, nowMs = Date.now()) {
  if (!value) return ar ? "لم يظهر بعد" : "No activity yet";
  const date = new Date(value);
  const diff = nowMs - date.getTime();
  if (!Number.isFinite(diff)) return "—";
  if (diff <= 90_000) return ar ? "متصل الآن" : "Online now";
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return ar ? `قبل ${minutes} د` : `${minutes} min ago`;
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return ar ? `اليوم ${date.toLocaleTimeString("ar-JO", { hour: "2-digit", minute: "2-digit" })}` : `Today ${date.toLocaleTimeString("en-JO", { hour: "2-digit", minute: "2-digit" })}`;
  return date.toLocaleString(ar ? "ar-JO" : "en-JO", { dateStyle: "medium", timeStyle: "short" });
}
