import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { IdCard, MoreVertical, Pencil, Plus, Search, Trash2, UsersRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { useAccess } from "@/hooks/useSession";
import { useRestaurantSeatUsage } from "@/hooks/useRestaurantSeatUsage";
import { humanError } from "@/lib/errors";
import { ACCESS_LEVEL_LABELS, accessLevelFor, ROLE_LABELS, type AppRole } from "@/lib/permissions";
import { inviteStaffMember, removeStaffMember, updateStaffMember } from "@/lib/staff.functions";
import { formatDate } from "@/lib/format";
import { getStaffAccess } from "@/lib/staff-auth.functions";
import { qrDataUrl } from "@/lib/qr";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const ROLES: AppRole[] = ["restaurant_admin", "manager", "kitchen", "waiter", "cashier"];
const STAFF_LABELS = {
  ...ROLE_LABELS,
  kitchen: { en: "Kitchen", ar: "المطبخ" },
  waiter: { en: "Server", ar: "الصالة" },
  cashier: { en: "Cashier", ar: "الكاشير" },
};
const ROLE_TONE: Record<string, string> = {
  restaurant_admin: "bg-orange-500/12 text-orange-600 dark:text-orange-400",
  manager: "bg-orange-500/12 text-orange-600 dark:text-orange-400",
  kitchen: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400",
  waiter: "bg-violet-500/12 text-violet-600 dark:text-violet-400",
  cashier: "bg-blue-500/12 text-blue-600 dark:text-blue-400",
};

export function StaffManager({ restaurantId }: { restaurantId: string }) {
  const { t, lang } = useI18n();
  const { isSuperAdmin } = useAccess();
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
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [credentials, setCredentials] = useState<any>(null);
  const [editing, setEditing] = useState<any>(null);
  const [pending, setPending] = useState<any>(null);
  const [access, setAccess] = useState<any>(null);
  const [badge, setBadge] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", email: "", role: "waiter" as AppRole });

  const staff = useQuery({
    queryKey: ["platform", "staff", restaurantId],
    queryFn: async () => {
      const { data, error } = await supabase.from("staff").select("*").eq("restaurant_id", restaurantId).order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (staff.data ?? []).filter((row) => !q || `${row.name} ${row.email ?? ""} ${row.role}`.toLowerCase().includes(q));
  }, [search, staff.data]);
  const activeCount = (staff.data ?? []).filter((row) => row.is_active).length;
  const inactiveCount = (staff.data ?? []).length - activeCount;

  async function refresh() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["platform"] }),
      qc.invalidateQueries({ queryKey: ["staff"] }),
      qc.invalidateQueries({ queryKey: ["seats", restaurantId] }),
    ]);
  }

  async function create() {
    if (seatsFull) { toast.error(lang === "ar" ? "تم الوصول إلى حد المستخدمين لهذا المطعم." : "This restaurant has reached its user limit."); return; }
    setBusy(true);
    try {
      const result = await invite({ data: { restaurantId, email: form.email.trim(), name: form.name.trim(), role: form.role } });
      setCredentials(result); setOpen(false); setForm({ name: "", email: "", role: "waiter" }); await refresh(); toast.success(t("sa.staff.invited"));
    } catch (error) { toast.error(humanError(error, lang)); } finally { setBusy(false); }
  }

  async function saveEdit() {
    if (!editing) return;
    const newPassword = String(editing.password ?? "");
    const confirmPassword = String(editing.confirmPassword ?? "");
    if (newPassword && newPassword.length < 8) { toast.error(lang === "ar" ? "يجب أن تتكون كلمة المرور من 8 أحرف على الأقل." : "Password must be at least 8 characters."); return; }
    if (newPassword !== confirmPassword) { toast.error(lang === "ar" ? "كلمتا المرور غير متطابقتين." : "Passwords do not match."); return; }
    setBusy(true);
    try {
      await update({ data: { staffId: editing.id, name: editing.name, email: editing.email, role: editing.role, isActive: editing.is_active, ...(newPassword ? { password: newPassword } : {}) } });
      setEditing(null); await refresh(); toast.success(lang === "ar" ? "تم حفظ التغييرات" : "Staff changes saved");
    } catch (error) { toast.error(humanError(error, lang)); } finally { setBusy(false); }
  }

  async function del(id: string) { try { await remove({ data: { staffId: id } }); await refresh(); setPending(null); toast.success(t("sa.staff.deleted")); } catch (error) { toast.error(humanError(error, lang)); } }
  async function openAccess(id: string) { try { const result = await readAccess({ data: { staffId: id } }); setAccess(result); setBadge(result.badgeCode ? await qrDataUrl(`${location.origin}/staff/badge/${result.badgeCode}`, 420) : null); } catch (error) { toast.error(humanError(error, lang)); } }
  const startEdit = (member: any) => setEditing({ ...member, password: "", confirmPassword: "" });

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div><h1 className="qs-page-title">{lang === "ar" ? "إدارة الفريق" : "Staff Management"}</h1><p className="qs-page-subtitle">{lang === "ar" ? "إدارة فريقك والصلاحيات وتشغيل المطعم بسلاسة." : "Manage your team, set permissions, and keep your restaurant running smoothly."}</p></div>
        <button type="button" className="qs-button-primary sm:w-auto" disabled={seats.isPending || seatsFull} onClick={() => setOpen(true)}><Plus className="size-4" />{seatsFull ? (lang === "ar" ? "اكتمل الحد" : "Limit reached") : (lang === "ar" ? "دعوة موظف" : "Invite Staff")}</button>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard icon={<UsersRound className="size-5" />} value={String((staff.data ?? []).length)} label={lang === "ar" ? "إجمالي الفريق" : "Total Staff"} detail={seatLimit == null ? (lang === "ar" ? "غير محدود" : "Unlimited seats") : `${seatsUsed} / ${seatLimit} seats`} tone="orange" />
        <StatCard icon={<span className="size-2.5 rounded-full bg-emerald-500" />} value={String(activeCount)} label={lang === "ar" ? "نشط" : "Active Staff"} detail={`${Math.round(((staff.data ?? []).length ? activeCount / (staff.data ?? []).length : 0) * 100)}% of total`} tone="green" />
        <StatCard icon={<span className="size-2.5 rounded-full bg-slate-400" />} value={String(inactiveCount)} label={lang === "ar" ? "غير نشط" : "Inactive Staff"} detail={`${Math.round(((staff.data ?? []).length ? inactiveCount / (staff.data ?? []).length : 0) * 100)}% of total`} tone="gray" />
      </div>

      <div className={editing ? "grid gap-4 xl:grid-cols-[minmax(0,1fr)_410px]" : "grid gap-4"}>
        <section className="qs-card min-w-0 overflow-hidden">
          <div className="grid gap-3 border-b border-border p-4 sm:grid-cols-[minmax(0,1fr)_160px_150px_auto]">
            <div className="relative"><Search className="pointer-events-none absolute start-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={lang === "ar" ? "ابحث بالاسم أو البريد أو الدور..." : "Search staff by name, email, or role..."} className="qs-control h-11 ps-11" /></div>
            <button type="button" className="qs-control hidden items-center justify-between px-3 text-xs font-semibold sm:flex">{lang === "ar" ? "كل الأدوار" : "All Roles"}<span>⌄</span></button>
            <button type="button" className="qs-control hidden items-center justify-between px-3 text-xs font-semibold sm:flex">{lang === "ar" ? "كل الحالات" : "All Status"}<span>⌄</span></button>
            <button type="button" className="hidden size-11 place-items-center rounded-xl border border-border bg-card sm:grid" aria-label={lang === "ar" ? "خيارات إضافية" : "More options"}><MoreVertical className="size-4" /></button>
          </div>

          {staff.isPending ? <Skeleton className="m-4 h-[420px] rounded-xl" /> : (
            <>
              <div className="space-y-3 p-3 md:hidden">
                {rows.map((member) => { const locked = member.role === "restaurant_admin" && !isSuperAdmin; return <article key={member.id} className="rounded-2xl border border-border bg-card p-4 shadow-sm"><div className="flex items-start gap-3"><span className="grid size-11 shrink-0 place-items-center rounded-full bg-orange-50 font-display text-sm font-bold text-[#ff5a0a] dark:bg-orange-950/30">{String(member.name ?? "S").slice(0,1).toUpperCase()}</span><div className="min-w-0 flex-1"><p className="truncate font-bold">{member.name}</p><p className="truncate text-xs text-muted-foreground">{member.email ?? "—"}</p><div className="mt-2 flex flex-wrap gap-2"><span className={`qs-status ${ROLE_TONE[member.role] ?? "bg-muted text-muted-foreground"}`}>{STAFF_LABELS[member.role]?.[lang] ?? member.role}</span><span className={`qs-status ${member.is_active ? "bg-emerald-500/12 text-emerald-600" : "bg-slate-500/12 text-slate-500"}`}>{member.is_active ? t("common.active") : t("common.inactive")}</span></div></div></div><div className="mt-4 grid grid-cols-[1fr_auto_auto] gap-2"><button type="button" disabled={locked} onClick={() => startEdit(member)} className="qs-button-primary min-h-11" aria-label={lang === "ar" ? `تعديل ${member.name}` : `Edit ${member.name}`}><Pencil className="size-4" />{lang === "ar" ? "تعديل المستخدم" : "Edit User"}</button><button type="button" disabled={locked} onClick={() => void openAccess(member.id)} className="grid min-h-11 min-w-11 place-items-center rounded-xl border border-border" aria-label={lang === "ar" ? "الوصول" : "Access"}><IdCard className="size-4" /></button><button type="button" disabled={locked} onClick={() => setPending(member)} className="grid min-h-11 min-w-11 place-items-center rounded-xl text-destructive hover:bg-destructive/10" aria-label={lang === "ar" ? "حذف" : "Delete"}><Trash2 className="size-4" /></button></div><p className="mt-3 text-[10px] text-muted-foreground">{lang === "ar" ? "أضيف" : "Added"}: {formatDate(member.created_at, lang)}</p></article>; })}
                {rows.length === 0 ? <p className="p-8 text-center text-sm text-muted-foreground">{lang === "ar" ? "لا يوجد موظفون مطابقون." : "No matching staff members."}</p> : null}
              </div>

              <div className="qs-scroll hidden overflow-x-auto md:block">
                <table className="qs-table min-w-[760px]"><thead><tr><th>{lang === "ar" ? "الموظف" : "Staff Member"}</th><th>{lang === "ar" ? "الدور" : "Role"}</th><th>{lang === "ar" ? "الحالة" : "Status"}</th><th>{lang === "ar" ? "تاريخ الإضافة" : "Added"}</th><th>{lang === "ar" ? "إجراءات" : "Actions"}</th></tr></thead><tbody>{rows.map((member) => { const locked = member.role === "restaurant_admin" && !isSuperAdmin; return <tr key={member.id}><td><div className="flex items-center gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-full bg-orange-50 font-display text-xs font-bold text-[#ff5a0a]">{String(member.name ?? "S").slice(0,1).toUpperCase()}</span><div className="min-w-0"><p className="truncate font-bold">{member.name}</p><p className="truncate text-[10px] text-muted-foreground">{member.email ?? "—"}</p></div></div></td><td><span className={`qs-status ${ROLE_TONE[member.role] ?? "bg-muted text-muted-foreground"}`}>{STAFF_LABELS[member.role]?.[lang] ?? member.role}</span></td><td><span className={`qs-status ${member.is_active ? "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400" : "bg-slate-500/12 text-slate-500"}`}>{member.is_active ? t("common.active") : t("common.inactive")}</span></td><td className="text-muted-foreground">{formatDate(member.created_at, lang)}</td><td><div className="flex items-center gap-1.5"><button type="button" disabled={locked} onClick={() => startEdit(member)} className="grid size-9 place-items-center rounded-lg border border-border hover:bg-muted disabled:opacity-40" aria-label={lang === "ar" ? `تعديل ${member.name}` : `Edit ${member.name}`} title={lang === "ar" ? "تعديل المستخدم" : "Edit user"}><Pencil className="size-4" /></button><button type="button" disabled={locked} onClick={() => void openAccess(member.id)} className="grid size-9 place-items-center rounded-lg border border-border hover:bg-muted disabled:opacity-40" aria-label="Access"><IdCard className="size-4" /></button><button type="button" disabled={locked} onClick={() => setPending(member)} className="grid size-9 place-items-center rounded-lg text-destructive hover:bg-destructive/10 disabled:opacity-40" aria-label="Delete"><Trash2 className="size-4" /></button></div></td></tr>; })}</tbody></table>
                {rows.length === 0 ? <p className="p-10 text-center text-sm text-muted-foreground">{lang === "ar" ? "لا يوجد موظفون مطابقون." : "No matching staff members."}</p> : null}
              </div>
            </>
          )}
          <div className="flex items-center justify-between border-t border-border px-4 py-3 text-xs text-muted-foreground"><span>{lang === "ar" ? `عرض ${rows.length} موظف` : `Showing ${rows.length} staff members`}</span><span className="font-semibold">{ACCESS_LEVEL_LABELS[accessLevelFor("manager")][lang]}</span></div>
        </section>

        {editing ? <><button type="button" aria-label={lang === "ar" ? "إغلاق محرر المستخدم" : "Close user editor"} onClick={() => setEditing(null)} className="fixed inset-0 z-40 bg-black/35 backdrop-blur-[1px] xl:hidden" /><aside className="qs-drawer qs-card fixed inset-x-0 bottom-0 z-50 max-h-[92dvh] overflow-y-auto rounded-t-3xl xl:sticky xl:top-24 xl:z-auto xl:max-h-none xl:self-start xl:rounded-[var(--radius-ui)]"><div className="sticky top-0 z-10 flex items-start justify-between border-b border-border bg-card/95 p-5 backdrop-blur"><div><p className="text-xs text-muted-foreground">‹ {lang === "ar" ? "الفريق" : "Staff"}</p><h2 className="mt-1 font-display text-xl font-bold">{lang === "ar" ? "تعديل الموظف" : "Edit Staff Member"}</h2></div><button type="button" onClick={() => setEditing(null)} className="grid size-11 place-items-center rounded-xl hover:bg-muted" aria-label={t("common.close")}>×</button></div><div className="space-y-4 p-5"><div className="flex items-center gap-3"><span className="grid size-16 place-items-center rounded-full bg-orange-50 font-display text-xl font-bold text-[#ff5a0a]">{String(editing.name ?? "S").slice(0,1).toUpperCase()}</span><div><p className="font-bold">{editing.name}</p><p className="text-xs text-muted-foreground">{editing.email}</p></div></div><Field label={lang === "ar" ? "الاسم الكامل" : "Full Name"}><Input value={editing.name ?? ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} className="h-11" /></Field><Field label={lang === "ar" ? "البريد الإلكتروني" : "Email Address"}><Input type="email" value={editing.email ?? ""} onChange={(e) => setEditing({ ...editing, email: e.target.value })} className="h-11" /></Field><Field label={lang === "ar" ? "الدور" : "Role"}><Select value={editing.role} onValueChange={(value) => setEditing({ ...editing, role: value as AppRole })}><SelectTrigger className="h-11"><SelectValue /></SelectTrigger><SelectContent>{assignableRoles.map((role) => <SelectItem key={role} value={role}>{STAFF_LABELS[role][lang]}</SelectItem>)}</SelectContent></Select></Field><label className="flex items-center justify-between rounded-xl border border-border p-3"><span><span className="block text-sm font-bold">{lang === "ar" ? "وصول نشط" : "Active Access"}</span><span className="mt-0.5 block text-[10px] text-muted-foreground">{lang === "ar" ? "السماح لهذا الموظف باستخدام النظام" : "Allow this staff member to access the system"}</span></span><input type="checkbox" checked={editing.is_active} onChange={(e) => setEditing({ ...editing, is_active: e.target.checked })} className="size-5 accent-[#ff5a0a]" /></label><Field label={lang === "ar" ? "كلمة المرور الجديدة" : "New Password"}><Input type="password" autoComplete="new-password" value={editing.password ?? ""} onChange={(e) => setEditing({ ...editing, password: e.target.value })} className="h-11" /></Field><Field label={lang === "ar" ? "تأكيد كلمة المرور" : "Confirm Password"}><Input type="password" autoComplete="new-password" value={editing.confirmPassword ?? ""} onChange={(e) => setEditing({ ...editing, confirmPassword: e.target.value })} className="h-11" /></Field><div className="rounded-xl bg-orange-50 px-3 py-3 text-[11px] leading-5 text-orange-800 dark:bg-orange-950/30 dark:text-orange-300">{lang === "ar" ? "اترك حقلي كلمة المرور فارغين للإبقاء على كلمة المرور الحالية. الحد الأدنى 8 أحرف." : "Leave password fields blank to keep the current password. New passwords require at least 8 characters."}</div></div><div className="safe-bottom sticky bottom-0 z-10 grid grid-cols-2 gap-3 border-t border-border bg-card/95 p-5 backdrop-blur"><button type="button" onClick={() => setEditing(null)} className="qs-button-secondary">{t("common.cancel")}</button><button type="button" onClick={() => void saveEdit()} disabled={busy} className="qs-button-primary">{busy ? (lang === "ar" ? "جارٍ الحفظ…" : "Saving…") : (lang === "ar" ? "حفظ التغييرات" : "Save Changes")}</button></div></aside></> : null}
      </div>

      <Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogHeader><DialogTitle>{lang === "ar" ? "دعوة موظف" : "Invite Staff"}</DialogTitle><DialogDescription>{seatLimit == null ? (lang === "ar" ? "يمكنك إضافة أعضاء جدد." : "Add a new team member.") : `${seatsUsed} / ${seatLimit} seats used.`}</DialogDescription></DialogHeader><div className="space-y-4"><Field label={lang === "ar" ? "الاسم" : "Name"}><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field><Field label={lang === "ar" ? "البريد الإلكتروني" : "Email"}><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field><Field label={lang === "ar" ? "الدور" : "Role"}><Select value={form.role} onValueChange={(value) => setForm({ ...form, role: value as AppRole })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{assignableRoles.map((role) => <SelectItem key={role} value={role}>{STAFF_LABELS[role][lang]}</SelectItem>)}</SelectContent></Select></Field></div><DialogFooter><Button variant="ghost" onClick={() => setOpen(false)}>{t("common.cancel")}</Button><Button disabled={busy || !form.name.trim() || !form.email.trim() || seatsFull} onClick={() => void create()}>{busy ? (lang === "ar" ? "جارٍ الإنشاء…" : "Creating…") : t("common.create")}</Button></DialogFooter></DialogContent></Dialog>
      <Dialog open={!!credentials} onOpenChange={(value) => !value && setCredentials(null)}><DialogContent><DialogHeader><DialogTitle>{lang === "ar" ? "بيانات الدخول" : "Login credentials"}</DialogTitle><DialogDescription>{credentials?.email}</DialogDescription></DialogHeader><div className="rounded-xl bg-muted p-4 font-mono text-sm">{credentials?.password ?? "Password unchanged"}</div><DialogFooter><Button onClick={() => setCredentials(null)}>{t("common.close")}</Button></DialogFooter></DialogContent></Dialog>
      <Dialog open={!!pending} onOpenChange={(value) => !value && setPending(null)}><DialogContent><DialogHeader><DialogTitle>{lang === "ar" ? "حذف الموظف؟" : "Delete staff member?"}</DialogTitle><DialogDescription>{pending?.name}</DialogDescription></DialogHeader><DialogFooter><Button variant="ghost" onClick={() => setPending(null)}>{t("common.cancel")}</Button><Button variant="destructive" onClick={() => pending && void del(pending.id)}>{t("common.delete")}</Button></DialogFooter></DialogContent></Dialog>
      <Dialog open={!!access} onOpenChange={(value) => !value && setAccess(null)}><DialogContent className="max-w-sm"><DialogHeader><DialogTitle>{lang === "ar" ? "وصول الموظف" : "Staff access"}</DialogTitle><DialogDescription>{access?.name}</DialogDescription></DialogHeader>{badge ? <img src={badge} alt="Staff badge" className="mx-auto size-56 rounded-xl" /> : <div className="rounded-xl bg-muted p-5 text-center text-sm text-muted-foreground">{lang === "ar" ? "لا توجد بطاقة مفعّلة." : "No active badge available."}</div>}<DialogFooter><Button onClick={() => setAccess(null)}>{t("common.close")}</Button></DialogFooter></DialogContent></Dialog>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div className="space-y-1.5"><Label className="text-xs font-bold">{label}</Label>{children}</div>; }
function StatCard({ icon, value, label, detail, tone }: { icon: React.ReactNode; value: string; label: string; detail: string; tone: "orange" | "green" | "gray" }) { const bg = tone === "orange" ? "bg-orange-50 text-[#ff5a0a] dark:bg-orange-950/30" : tone === "green" ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30" : "bg-slate-100 text-slate-500 dark:bg-slate-800"; return <div className="qs-stat flex items-center gap-4"><span className={`grid size-12 place-items-center rounded-full ${bg}`}>{icon}</span><div><p className="font-display text-2xl font-bold">{value}</p><p className="text-xs font-semibold text-muted-foreground">{label}</p><p className="mt-1 text-[10px] text-muted-foreground">{detail}</p></div></div>; }
