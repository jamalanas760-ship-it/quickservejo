import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { IdCard, MoreVertical, Plus, Search, ShieldCheck, Trash2, UserRound, UsersRound, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useAccess } from "@/hooks/useSession";
import { useRestaurantSeatUsage } from "@/hooks/useRestaurantSeatUsage";
import { supabase } from "@/integrations/supabase/client";
import { avatarPresetUrl } from "@/lib/avatar-presets";
import { humanError } from "@/lib/errors";
import { useI18n } from "@/lib/i18n";
import { ROLE_LABELS, type AppRole } from "@/lib/permissions";
import { qrDataUrl } from "@/lib/qr";
import { getStaffAccess } from "@/lib/staff-auth.functions";
import { inviteStaffMember, removeStaffMember, updateStaffMember } from "@/lib/staff.functions";
import { cn } from "@/lib/utils";

const ROLES: AppRole[] = ["restaurant_admin", "manager", "kitchen", "waiter", "cashier"];
const STAFF_LABELS = { ...ROLE_LABELS, kitchen: { en: "Kitchen", ar: "المطبخ" }, waiter: { en: "Server", ar: "الصالة" }, cashier: { en: "Cashier", ar: "الكاشير" } };
const ROLE_TONE: Record<string, string> = { restaurant_admin: "bg-orange-500/12 text-orange-600", manager: "bg-orange-500/12 text-orange-600", kitchen: "bg-emerald-500/12 text-emerald-600", waiter: "bg-blue-500/12 text-blue-600", cashier: "bg-violet-500/12 text-violet-600" };
type StaffTab = "all" | "admins" | "staff";
type StaffRow = { id:string; auth_user_id:string; created_at:string; email:string|null; is_active:boolean; name:string; restaurant_id:string|null; role:AppRole; updated_at:string; avatar_url?:string|null; avatar_preset?:string|null };

export function StaffManager({ restaurantId }: { restaurantId: string }) {
  const { t, lang } = useI18n();
  const ar = lang === "ar";
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
  const [tab, setTab] = useState<StaffTab>("all");
  const [editing, setEditing] = useState<any>(null);
  const [pending, setPending] = useState<any>(null);
  const [credentials, setCredentials] = useState<any>(null);
  const [access, setAccess] = useState<any>(null);
  const [badge, setBadge] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", email: "", role: "waiter" as AppRole });

  const staff = useQuery<StaffRow[]>({
    queryKey: ["platform", "staff", restaurantId],
    queryFn: async () => {
      const { data, error } = await supabase.from("staff").select("*").eq("restaurant_id", restaurantId).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as StaffRow[];
    },
  });
  const admins = (staff.data ?? []).filter((row) => row.role === "restaurant_admin" || row.role === "manager").length;
  const staffOnly = (staff.data ?? []).length - admins;
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (staff.data ?? []).filter((row) => {
      const isAdmin = row.role === "restaurant_admin" || row.role === "manager";
      if (tab === "admins" && !isAdmin) return false;
      if (tab === "staff" && isAdmin) return false;
      return !q || `${row.name} ${row.email ?? ""} ${row.role}`.toLowerCase().includes(q);
    });
  }, [search, staff.data, tab]);

  async function refresh() { await Promise.all([qc.invalidateQueries({ queryKey: ["platform"] }), qc.invalidateQueries({ queryKey: ["staff"] }), qc.invalidateQueries({ queryKey: ["seats", restaurantId] })]); }
  async function create() {
    if (seatsFull) { toast.error(ar ? "تم الوصول إلى حد المستخدمين لهذا المطعم." : "This restaurant has reached its user limit."); return; }
    setBusy(true);
    try { const result = await invite({ data: { restaurantId, email: form.email.trim(), name: form.name.trim(), role: form.role } }); setCredentials(result); setOpen(false); setForm({ name: "", email: "", role: "waiter" }); await refresh(); toast.success(ar ? "تمت إضافة الموظف" : "Staff member added"); }
    catch (error) { toast.error(humanError(error, lang)); } finally { setBusy(false); }
  }
  async function saveEdit() {
    if (!editing) return;
    const password = String(editing.password ?? "");
    if (password && password.length < 8) { toast.error(ar ? "كلمة المرور 8 أحرف على الأقل." : "Password must be at least 8 characters."); return; }
    if (password !== String(editing.confirmPassword ?? "")) { toast.error(ar ? "كلمتا المرور غير متطابقتين." : "Passwords do not match."); return; }
    setBusy(true);
    try { await update({ data: { staffId: editing.id, name: editing.name, email: editing.email, role: editing.role, isActive: editing.is_active, ...(password ? { password } : {}) } }); await refresh(); setEditing(null); toast.success(ar ? "تم حفظ التغييرات" : "Changes saved"); }
    catch (error) { toast.error(humanError(error, lang)); } finally { setBusy(false); }
  }
  async function del(id: string) { try { await remove({ data: { staffId: id } }); await refresh(); setPending(null); setEditing(null); toast.success(ar ? "تم حذف المستخدم" : "Staff member deleted"); } catch (error) { toast.error(humanError(error, lang)); } }
  async function openAccess(id: string) { try { const result = await readAccess({ data: { staffId: id } }); setAccess(result); setBadge(result.badgeCode ? await qrDataUrl(`${location.origin}/staff/badge/${result.badgeCode}`, 420) : null); } catch (error) { toast.error(humanError(error, lang)); } }
  const startEdit = (member: StaffRow) => setEditing({ ...member, password: "", confirmPassword: "" });

  return <div className="space-y-5">
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><h1 className="qs-page-title">{ar ? "الفريق والأدوار" : "Staff & Roles"}</h1><p className="qs-page-subtitle">{ar ? "أدر فريقك، عيّن الأدوار، وتحكم بالوصول." : "Manage your team, assign roles, and control access to keep your restaurant running smoothly."}</p></div><button type="button" className="qs-button-primary" disabled={seats.isPending || seatsFull} onClick={() => setOpen(true)}><Plus className="size-4" />{seatsFull ? (ar ? "اكتمل الحد" : "Limit reached") : (ar ? "إضافة موظف" : "Add Staff")}</button></header>
    <section className="grid gap-3 sm:grid-cols-3"><Stat icon={<UsersRound className="size-5" />} value={(staff.data ?? []).length} label={ar ? "إجمالي الفريق" : "Total Staff"} tone="blue" detail={seatLimit == null ? (ar ? "غير محدود" : "Unlimited") : `${seatsUsed}/${seatLimit}`} /><Stat icon={<ShieldCheck className="size-5" />} value={admins} label={ar ? "المشرفون" : "Admins"} tone="green" detail={ar ? "وصول إداري" : "Admin access"} /><Stat icon={<UserRound className="size-5" />} value={staffOnly} label={ar ? "الموظفون" : "Staff"} tone="cyan" detail={ar ? "أدوار تشغيلية" : "Task-focused roles"} /></section>
    <div className={editing ? "grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]" : "grid gap-4"}>
      <section className="qs-card min-w-0 overflow-hidden">
        <div className="border-b border-border px-4 pt-3"><div className="flex gap-6 text-xs font-semibold">{([['all',ar?'كل الفريق':'All Staff',(staff.data??[]).length],['admins',ar?'المشرفون':'Admins',admins],['staff',ar?'الموظفون':'Staff',staffOnly]] as const).map(([id,label,count]) => <button key={id} type="button" onClick={() => setTab(id)} className={cn("relative min-h-11 px-1", tab===id ? "text-[#ff5a0a]" : "text-muted-foreground")}><span>{label} ({count})</span>{tab===id ? <span className="absolute inset-x-0 bottom-0 h-0.5 bg-[#ff5a0a]" />:null}</button>)}</div></div>
        <div className="grid gap-3 border-b border-border p-4 sm:grid-cols-[minmax(0,1fr)_150px_150px]"><div className="relative"><Search className="pointer-events-none absolute start-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(e)=>setSearch(e.target.value)} placeholder={ar?"ابحث بالاسم أو البريد...":"Search staff by name or email..."} className="h-11 ps-10" /></div><button type="button" className="qs-control hidden px-3 text-start text-xs font-semibold sm:block">{ar?"كل الأدوار":"All Roles"}⌄</button><button type="button" className="qs-control hidden px-3 text-start text-xs font-semibold sm:block">{ar?"كل الحالات":"All Status"}⌄</button></div>
        {staff.isPending ? <Skeleton className="m-4 h-[420px] rounded-xl" /> : <><div className="hidden overflow-x-auto md:block"><table className="qs-table min-w-[720px]"><thead><tr><th>{ar?"الاسم":"Name"}</th><th>{ar?"الدور":"Role"}</th><th>{ar?"الحالة":"Status"}</th><th>{ar?"آخر نشاط":"Last Active"}</th><th /></tr></thead><tbody>{rows.map((member)=>{const locked=member.role==='restaurant_admin'&&!isSuperAdmin; const avatar=member.avatar_url||avatarPresetUrl(member.avatar_preset); return <tr key={member.id} onClick={()=>!locked&&startEdit(member)} className={cn("cursor-pointer",editing?.id===member.id&&"bg-orange-500/[.05]")}><td><div className="flex items-center gap-3"><span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-full bg-muted font-bold">{avatar?<img src={avatar} alt="" className="size-full object-cover" />:member.name.slice(0,1).toUpperCase()}</span><div className="min-w-0"><p className="truncate font-bold">{member.name}</p><p className="truncate text-[10px] text-muted-foreground">{member.email??'—'}</p></div></div></td><td><span className={`qs-status ${ROLE_TONE[member.role]??'bg-muted text-muted-foreground'}`}>{STAFF_LABELS[member.role]?.[lang]??member.role}</span></td><td><span className={`qs-status ${member.is_active?'bg-emerald-500/12 text-emerald-600':'bg-slate-500/12 text-slate-500'}`}><i className={`size-1.5 rounded-full ${member.is_active?'bg-emerald-500':'bg-slate-400'}`} />{member.is_active?t('common.active'):t('common.inactive')}</span></td><td className="text-muted-foreground">{member.is_active?(ar?'الآن':'Now'):'—'}</td><td onClick={(e)=>e.stopPropagation()}><button type="button" className="grid size-9 place-items-center rounded-lg hover:bg-muted" onClick={()=>!locked&&startEdit(member)} disabled={locked}><MoreVertical className="size-4" /></button></td></tr>})}</tbody></table></div><div className="space-y-2 p-3 md:hidden">{rows.map((member)=>{const avatar=member.avatar_url||avatarPresetUrl(member.avatar_preset);return <button key={member.id} type="button" onClick={()=>startEdit(member)} className="flex w-full items-center gap-3 rounded-xl border border-border p-3 text-start"><span className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-full bg-muted font-bold">{avatar?<img src={avatar} alt="" className="size-full object-cover" />:member.name.slice(0,1).toUpperCase()}</span><span className="min-w-0 flex-1"><strong className="block truncate text-sm">{member.name}</strong><span className="mt-1 flex items-center gap-2"><span className={`qs-status ${ROLE_TONE[member.role]??'bg-muted'}`}>{STAFF_LABELS[member.role]?.[lang]??member.role}</span><i className={`size-2 rounded-full ${member.is_active?'bg-emerald-500':'bg-slate-400'}`} /></span></span><MoreVertical className="size-4 text-muted-foreground" /></button>})}</div></>}
      </section>
      {editing ? <aside className="qs-right-panel fixed inset-x-2 bottom-[calc(5.2rem+env(safe-area-inset-bottom))] z-50 max-h-[82dvh] overflow-y-auto xl:sticky xl:top-24 xl:bottom-auto xl:max-h-[calc(100dvh-7rem)]"><div className="qs-panel-header sticky top-0 z-10 bg-card/96 backdrop-blur"><div className="flex min-w-0 items-center gap-3"><span className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-full bg-muted text-lg font-bold">{(editing.avatar_url||avatarPresetUrl(editing.avatar_preset))?<img src={editing.avatar_url||avatarPresetUrl(editing.avatar_preset)} alt="" className="size-full object-cover" />:String(editing.name??'S').slice(0,1).toUpperCase()}</span><div className="min-w-0"><h2 className="truncate font-display text-lg font-bold">{editing.name}</h2><p className="truncate text-xs text-muted-foreground">{editing.email}</p><p className="mt-1 text-[10px] font-semibold text-emerald-600">● {editing.is_active?(ar?'نشط':'Active'):(ar?'غير نشط':'Inactive')}</p></div></div><button type="button" onClick={()=>setEditing(null)} className="grid size-9 place-items-center rounded-lg hover:bg-muted"><X className="size-4" /></button></div><div className="p-5"><div className="border-b border-border pb-3 text-xs font-bold text-[#ff5a0a]">{ar?'الدور والصلاحيات':'Role & Permissions'}</div><div className="mt-4 space-y-4"><Field label={ar?'الدور':'Role'}><Select value={editing.role} onValueChange={(value)=>setEditing({...editing,role:value as AppRole})}><SelectTrigger className="h-11"><SelectValue /></SelectTrigger><SelectContent>{assignableRoles.map((role)=><SelectItem key={role} value={role}>{STAFF_LABELS[role][lang]}</SelectItem>)}</SelectContent></Select></Field><Permission label={ar?'عرض الطلبات':'View Orders'} checked /><Permission label={ar?'إدارة الطاولات':'Manage Tables'} checked={['restaurant_admin','manager','waiter'].includes(editing.role)} /><Permission label={ar?'عرض القائمة':'View Menu'} checked /><Permission label={ar?'تعديل القائمة':'Edit Menu'} checked={['restaurant_admin','manager'].includes(editing.role)} /><Permission label={ar?'عرض التحليلات':'View Analytics'} checked={['restaurant_admin','manager'].includes(editing.role)} /><label className="flex items-center justify-between rounded-xl border border-border p-3"><span className="text-sm font-semibold">{ar?'وصول نشط':'Active access'}</span><input type="checkbox" checked={editing.is_active} onChange={(e)=>setEditing({...editing,is_active:e.target.checked})} className="size-5 accent-[#ff5a0a]" /></label><Field label={ar?'كلمة مرور جديدة':'New Password'}><Input type="password" autoComplete="new-password" value={editing.password??''} onChange={(e)=>setEditing({...editing,password:e.target.value})} /></Field><Field label={ar?'تأكيد كلمة المرور':'Confirm Password'}><Input type="password" autoComplete="new-password" value={editing.confirmPassword??''} onChange={(e)=>setEditing({...editing,confirmPassword:e.target.value})} /></Field></div></div><div className="safe-bottom sticky bottom-0 grid grid-cols-2 gap-2 border-t border-border bg-card/96 p-4 backdrop-blur"><button type="button" className="qs-button-secondary" onClick={()=>setEditing(null)}>{t('common.cancel')}</button><button type="button" className="qs-button-primary" disabled={busy} onClick={()=>void saveEdit()}>{busy?(ar?'جارٍ الحفظ…':'Saving…'):(ar?'حفظ التغييرات':'Save Changes')}</button><button type="button" className="qs-button-secondary" onClick={()=>void openAccess(editing.id)}><IdCard className="size-4" />{ar?'الوصول':'Access'}</button><button type="button" className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold text-destructive hover:bg-destructive/10" onClick={()=>setPending(editing)}><Trash2 className="size-4" />{ar?'حذف':'Delete'}</button></div></aside>:null}
    </div>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogHeader><DialogTitle>{ar?'إضافة موظف':'Add Staff'}</DialogTitle><DialogDescription>{seatLimit==null?(ar?'أضف عضواً جديداً للفريق.':'Add a new team member.'):`${seatsUsed} / ${seatLimit} seats used.`}</DialogDescription></DialogHeader><div className="space-y-4"><Field label={ar?'الاسم':'Name'}><Input value={form.name} onChange={(e)=>setForm({...form,name:e.target.value})} /></Field><Field label={ar?'البريد الإلكتروني':'Email'}><Input type="email" value={form.email} onChange={(e)=>setForm({...form,email:e.target.value})} /></Field><Field label={ar?'الدور':'Role'}><Select value={form.role} onValueChange={(value)=>setForm({...form,role:value as AppRole})}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{assignableRoles.map((role)=><SelectItem key={role} value={role}>{STAFF_LABELS[role][lang]}</SelectItem>)}</SelectContent></Select></Field></div><DialogFooter><Button variant="ghost" onClick={()=>setOpen(false)}>{t('common.cancel')}</Button><Button disabled={busy||!form.name.trim()||!form.email.trim()||seatsFull} onClick={()=>void create()}>{ar?'إضافة موظف':'Add Staff'}</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={!!credentials} onOpenChange={(value)=>!value&&setCredentials(null)}><DialogContent><DialogHeader><DialogTitle>{ar?'بيانات الدخول':'Login credentials'}</DialogTitle><DialogDescription>{credentials?.email}</DialogDescription></DialogHeader><div className="rounded-xl bg-muted p-4 font-mono text-sm">{credentials?.password??'Password unchanged'}</div><DialogFooter><Button onClick={()=>setCredentials(null)}>{t('common.close')}</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={!!pending} onOpenChange={(value)=>!value&&setPending(null)}><DialogContent><DialogHeader><DialogTitle>{ar?'حذف الموظف؟':'Delete staff member?'}</DialogTitle><DialogDescription>{pending?.name}</DialogDescription></DialogHeader><DialogFooter><Button variant="ghost" onClick={()=>setPending(null)}>{t('common.cancel')}</Button><Button variant="destructive" onClick={()=>pending&&void del(pending.id)}>{t('common.delete')}</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={!!access} onOpenChange={(value)=>!value&&setAccess(null)}><DialogContent className="max-w-sm"><DialogHeader><DialogTitle>{ar?'وصول الموظف':'Staff access'}</DialogTitle><DialogDescription>{access?.name}</DialogDescription></DialogHeader>{badge?<img src={badge} alt="Staff badge" className="mx-auto size-56 rounded-xl" />:<div className="rounded-xl bg-muted p-5 text-center text-sm text-muted-foreground">{ar?'لا توجد بطاقة مفعلة.':'No active badge available.'}</div>}<DialogFooter><Button onClick={()=>setAccess(null)}>{t('common.close')}</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}

function Field({ label, children }: { label:string; children:React.ReactNode }) { return <div className="space-y-1.5"><Label className="text-xs font-bold">{label}</Label>{children}</div>; }
function Permission({ label, checked }: { label:string; checked:boolean }) { return <label className="flex items-center gap-3"><input type="checkbox" checked={checked} readOnly className="size-4 accent-[#ff5a0a]" /><span className="text-sm font-semibold">{label}</span></label>; }
function Stat({ icon, value, label, tone, detail }: { icon:React.ReactNode; value:number; label:string; tone:"blue"|"green"|"cyan"; detail:string }) { const bg=tone==='green'?'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30':tone==='cyan'?'bg-cyan-50 text-cyan-600 dark:bg-cyan-950/30':'bg-blue-50 text-blue-600 dark:bg-blue-950/30'; return <div className="qs-stat flex items-center gap-4"><span className={`grid size-11 place-items-center rounded-full ${bg}`}>{icon}</span><div><p className="font-display text-2xl font-bold">{value}</p><p className="text-xs font-semibold text-muted-foreground">{label}</p><p className="mt-1 text-[10px] text-emerald-600">↗ 0% <span className="text-muted-foreground">{detail}</span></p></div></div>; }
