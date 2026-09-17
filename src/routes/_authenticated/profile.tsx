import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import {
  Bell,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  LogOut,
  Mail,
  Loader2,
  Pencil,
  Palette,
  ShieldCheck,
  SlidersHorizontal,
  Store,
  User,
  UserRound,
} from "lucide-react";

import { AppHeader } from "@/components/nav/AppHeader";
import { ProfileAvatarEditor } from "@/components/profile/ProfileAvatarEditor";
import { RestaurantProfileSettings } from "@/components/profile/RestaurantProfileSettings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { useAccess, useSupabaseSession } from "@/hooks/useSession";
import { useRestaurant } from "@/hooks/useSuperAdmin";
import { useWorkspaceScope } from "@/hooks/useWorkspace";
import { supabase } from "@/integrations/supabase/client";
import { avatarPresetUrl } from "@/lib/avatar-presets";
import { formatDate } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { ROLE_LABELS } from "@/lib/permissions";
import { cn } from "@/lib/utils";

type Notifications = {
  newOrders: boolean;
  tableAlerts: boolean;
  system: boolean;
  marketing: boolean;
  sound: boolean;
  orderSounds: boolean;
  tableSounds: boolean;
};
type ProfileSection = "profile" | "notifications" | "organization";

const DEFAULT_NOTIF: Notifications = {
  newOrders: true,
  tableAlerts: true,
  system: true,
  marketing: false,
  sound: true,
  orderSounds: true,
  tableSounds: false,
};

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({ meta: [{ title: "Profile & Settings — QuickServe" }] }),
  component: ProfilePage,
});

function ProfilePage() {
  const { lang } = useI18n();
  const ar = lang === "ar";
  const navigate = useNavigate();
  const qc = useQueryClient();
  const access = useAccess();
  const session = useSupabaseSession();
  const scope = useWorkspaceScope();
  const rid = scope.restaurantId;
  const { data: restaurant } = useRestaurant(rid ?? "");
  const [section, setSection] = useState<ProfileSection>("profile");
  const [notif, setNotif] = useState<Notifications>(DEFAULT_NOTIF);

  const user = session.data?.user;
  const meta = user?.user_metadata as { full_name?: string; name?: string; avatar_url?: string; avatar_preset?: string } | undefined;
  const membership = rid ? access.membershipFor(rid) : (access.data ?? []).find((row) => row.restaurant_id) ?? null;
  const displayName = meta?.full_name || meta?.name || membership?.name || user?.email?.split("@")[0] || (ar ? "المستخدم" : "User");
  const email = user?.email ?? "—";
  const role = access.isSuperAdmin ? "super_admin" : membership?.role;
  const roleLabel = role && role in ROLE_LABELS ? ROLE_LABELS[role as keyof typeof ROLE_LABELS][lang] : (ar ? "عضو" : "Member");
  const restaurantName = restaurant?.name ?? scope.restaurantName ?? "—";
  const notifKey = `quickserve.notifications:${user?.id ?? "guest"}`;
  const canManageRestaurant = Boolean(rid && (access.isSuperAdmin || membership?.role === "restaurant_admin"));
  const avatar = membership?.avatar_url || avatarPresetUrl(membership?.avatar_preset) || meta?.avatar_url || avatarPresetUrl(meta?.avatar_preset ?? null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(notifKey);
      if (raw) setNotif({ ...DEFAULT_NOTIF, ...JSON.parse(raw) });
    } catch {
      setNotif(DEFAULT_NOTIF);
    }
  }, [notifKey]);

  useEffect(() => {
    if (section === "organization" && !canManageRestaurant) setSection("profile");
  }, [canManageRestaurant, section]);

  function toggle(key: keyof Notifications, value: boolean) {
    const next = {
      ...notif,
      [key]: value,
      ...(key === "sound" && !value ? { orderSounds: false, tableSounds: false } : {}),
    };
    setNotif(next);
    try {
      localStorage.setItem(notifKey, JSON.stringify(next));
    } catch {
      // Local preferences are best effort only.
    }
  }

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const operationalRows: [keyof Notifications, string, string, string, string][] = [
    ["newOrders", "Order Notifications", "إشعارات الطلبات", "Get notified when new orders arrive", "تلقي تنبيه عند وصول طلب جديد"],
    ["tableAlerts", "Table Alerts", "تنبيهات الطاولات", "Get notified about table status changes", "تلقي تنبيه عند تغيّر حالة الطاولة"],
    ["system", "System Updates", "تحديثات النظام", "Important system announcements", "إعلانات النظام المهمة"],
    ["marketing", "Product News", "أخبار المنتج", "Tips, features and product updates", "نصائح وميزات وتحديثات المنتج"],
  ];
  const soundRows: [keyof Notifications, string, string, string, string][] = [
    ["sound", "Notification Sounds", "أصوات التنبيه", "Master sound control for enabled alerts", "التحكم الرئيسي بأصوات التنبيهات"],
    ["orderSounds", "Order Sounds", "أصوات الطلبات", "Play a sound for new orders", "تشغيل صوت للطلبات الجديدة"],
    ["tableSounds", "Table Alert Sounds", "أصوات تنبيهات الطاولة", "Play a sound for table changes", "تشغيل صوت لتغييرات الطاولات"],
  ];

  const navItems = [
    { id: "profile" as const, icon: UserRound, label: ar ? "الملف الشخصي" : "Personal profile", hint: ar ? "الصورة وبيانات الحساب" : "Identity and account details" },
    { id: "notifications" as const, icon: Bell, label: ar ? "الإشعارات" : "Notifications", hint: ar ? "التنبيهات والأصوات" : "Alerts and sound preferences" },
    ...(canManageRestaurant ? [{ id: "organization" as const, icon: Store, label: ar ? "المؤسسة والمظهر" : "Organization & appearance", hint: ar ? "الهوية والألوان والغلاف" : "Brand, colors and cover" }] : []),
  ];

  return <div className="min-h-dvh bg-background">
    <AppHeader />
    <main className="qs-page space-y-5 pb-10">
      <section className="relative overflow-hidden rounded-[28px] border border-border bg-card">
        <div className="absolute inset-x-0 top-0 h-28 bg-[radial-gradient(circle_at_18%_0%,rgba(255,90,10,.15),transparent_55%)]" />
        <div className="relative flex flex-col gap-5 p-5 sm:p-7 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center">
            <div className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-[24px] border border-border bg-background shadow-sm">
              {avatar ? <img src={avatar} alt="" className="size-full object-cover" /> : <span className="font-display text-2xl font-black text-[#ff5a0a]">{displayName.slice(0, 1).toUpperCase()}</span>}
            </div>
            <div className="min-w-0">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-orange-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[.12em] text-[#ff5a0a]">{ar ? "مساحة الحساب" : "Account workspace"}</span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[10px] font-bold text-emerald-600"><CheckCircle2 className="size-3" />{ar ? "نشط" : "Active"}</span>
              </div>
              <h1 className="truncate font-display text-[clamp(1.8rem,3vw,2.6rem)] font-bold tracking-[-.045em]">{displayName}</h1>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5"><Mail className="size-3.5" />{email}</span>
                <span className="inline-flex items-center gap-1.5"><ShieldCheck className="size-3.5" />{roleLabel}</span>
                <span className="inline-flex items-center gap-1.5"><Building2 className="size-3.5" />{restaurantName}</span>
              </div>
            </div>
          </div>
          <Button variant="outline" className="self-start rounded-xl lg:self-auto" onClick={() => void signOut()}><LogOut className="size-4" />{ar ? "تسجيل الخروج" : "Sign out"}</Button>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[280px_minmax(0,1fr)] xl:items-start">
        <aside className="xl:sticky xl:top-24">
          <div className="qs-card p-2.5">
            <div className="px-3 pb-2 pt-2">
              <p className="text-[10px] font-bold uppercase tracking-[.2em] text-muted-foreground">{ar ? "الإعدادات" : "Settings"}</p>
            </div>
            <nav className="grid gap-1 sm:grid-cols-3 xl:grid-cols-1" aria-label={ar ? "أقسام الملف الشخصي" : "Profile sections"}>
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = section === item.id;
                return <button key={item.id} type="button" onClick={() => setSection(item.id)} className={cn("group flex min-h-[68px] items-center gap-3 rounded-2xl px-3.5 py-3 text-start transition", active ? "bg-[#ff5a0a] text-white shadow-sm" : "hover:bg-muted/70")}>
                  <span className={cn("grid size-9 shrink-0 place-items-center rounded-xl", active ? "bg-white/16 text-white" : "bg-muted text-muted-foreground group-hover:text-foreground")}><Icon className="size-4.5" /></span>
                  <span className="min-w-0 flex-1"><strong className="block text-xs">{item.label}</strong><span className={cn("mt-0.5 hidden text-[10px] leading-4 sm:block xl:block", active ? "text-white/75" : "text-muted-foreground")}>{item.hint}</span></span>
                  <ChevronRight className={cn("size-4 shrink-0 transition", ar && "rotate-180", active ? "text-white/80" : "text-muted-foreground")} />
                </button>;
              })}
            </nav>
          </div>

          <div className="mt-3 hidden rounded-2xl border border-border bg-muted/20 p-4 xl:block">
            <div className="flex items-center gap-2 text-xs font-bold"><ShieldCheck className="size-4 text-emerald-600" />{ar ? "حساب آمن" : "Secure account"}</div>
            <p className="mt-2 text-[11px] leading-5 text-muted-foreground">{ar ? "يمكن لمدير المطعم تعديل اسمه، بينما تبقى بيانات الصلاحيات والحساب الأخرى محمية." : "Restaurant Managers can edit their name while access and account-scope details remain protected."}</p>
          </div>
        </aside>

        <div className="min-w-0">
          {section === "profile" ? <PersonalSection ar={ar} lang={lang} rid={rid} displayName={displayName} email={email} roleLabel={roleLabel} restaurantName={restaurantName} createdAt={user?.created_at} userId={user?.id ?? null} membershipId={membership?.id ?? null} canEditName={Boolean(access.isSuperAdmin || membership?.role === "restaurant_admin")} /> : null}
          {section === "notifications" ? <NotificationsSection ar={ar} notif={notif} operationalRows={operationalRows} soundRows={soundRows} toggle={toggle} /> : null}
          {section === "organization" && rid && canManageRestaurant ? <OrganizationSection ar={ar} restaurantId={rid} /> : null}
        </div>
      </div>
    </main>
  </div>;
}

function PersonalSection({ ar, lang, rid, displayName, email, roleLabel, restaurantName, createdAt, userId, membershipId, canEditName }: { ar: boolean; lang: "ar" | "en"; rid: string | null; displayName: string; email: string; roleLabel: string; restaurantName: string; createdAt: string | undefined; userId: string | null; membershipId: string | null; canEditName: boolean }) {
  const qc = useQueryClient();
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(displayName);
  const [savingName, setSavingName] = useState(false);

  useEffect(() => {
    if (!editingName) setNameDraft(displayName);
  }, [displayName, editingName]);

  async function saveName() {
    if (!canEditName || !userId || savingName) return;
    const nextName = nameDraft.trim().replace(/\s+/g, " ");
    if (nextName.length < 2) {
      toast.error(ar ? "أدخل اسماً من حرفين على الأقل." : "Enter a name with at least 2 characters.");
      return;
    }
    if (nextName.length > 80) {
      toast.error(ar ? "الاسم طويل جداً. الحد الأقصى 80 حرفاً." : "The name is too long. Maximum 80 characters.");
      return;
    }
    if (nextName === displayName) {
      setEditingName(false);
      return;
    }

    setSavingName(true);
    try {
      const { error: authError } = await supabase.auth.updateUser({ data: { full_name: nextName, name: nextName } });
      if (authError) throw authError;

      if (membershipId) {
        const { error: staffError } = await (supabase.from("staff") as any).update({ name: nextName }).eq("id", membershipId).eq("auth_user_id", userId);
        if (staffError) throw staffError;
      }

      await Promise.all([
        qc.invalidateQueries({ queryKey: ["auth", "session"] }),
        qc.invalidateQueries({ queryKey: ["staff", "memberships"] }),
      ]);
      setEditingName(false);
      toast.success(ar ? "تم تحديث الاسم بنجاح." : "Name updated successfully.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : (ar ? "تعذر تحديث الاسم." : "Unable to update the name."));
    } finally {
      setSavingName(false);
    }
  }

  return <div className="space-y-5">
    <SectionHeading icon={<UserRound className="size-5" />} title={ar ? "الملف الشخصي" : "Personal profile"} description={ar ? "حدّث صورتك واسمك وراجع معلومات حسابك من مكان واحد." : "Update your profile image and name, and review your account information in one place."} />
    <section className="qs-card overflow-hidden">
      <div className="p-4 sm:p-6"><ProfileAvatarEditor restaurantId={rid} /></div>
    </section>
    <section className="qs-card overflow-hidden">
      <div className="border-b border-border px-5 py-4 sm:px-6"><h2 className="text-sm font-bold">{ar ? "تفاصيل الحساب" : "Account details"}</h2><p className="mt-1 text-xs text-muted-foreground">{canEditName ? (ar ? "يمكنك تعديل اسمك. البريد الإلكتروني والدور والمطعم للعرض فقط." : "You can edit your name. Email, role and restaurant remain read-only.") : (ar ? "هذه البيانات مرتبطة بحسابك وصلاحياتك الحالية." : "These details reflect your current account and access scope.")}</p></div>
      <div className="grid gap-px bg-border sm:grid-cols-2">
        {canEditName ? <EditableNameTile ar={ar} value={nameDraft} editing={editingName} saving={savingName} onEdit={() => { setNameDraft(displayName); setEditingName(true); }} onCancel={() => { setNameDraft(displayName); setEditingName(false); }} onChange={setNameDraft} onSave={() => void saveName()} /> : <InfoTile icon={<User className="size-4" />} label={ar ? "الاسم الكامل" : "Full name"} value={displayName} />}
        <InfoTile icon={<Mail className="size-4" />} label={ar ? "البريد الإلكتروني" : "Email address"} value={email} />
        <InfoTile icon={<ShieldCheck className="size-4" />} label={ar ? "الدور" : "Role"} value={roleLabel} />
        <InfoTile icon={<Building2 className="size-4" />} label={ar ? "المطعم" : "Restaurant"} value={restaurantName} />
        <InfoTile icon={<CheckCircle2 className="size-4" />} label={ar ? "حالة الحساب" : "Account status"} value={ar ? "نشط" : "Active"} accent />
        <InfoTile icon={<CalendarDays className="size-4" />} label={ar ? "عضو منذ" : "Member since"} value={createdAt ? formatDate(createdAt, lang) : "—"} />
      </div>
    </section>
  </div>;
}

function EditableNameTile({ ar, value, editing, saving, onEdit, onCancel, onChange, onSave }: { ar: boolean; value: string; editing: boolean; saving: boolean; onEdit: () => void; onCancel: () => void; onChange: (value: string) => void; onSave: () => void }) {
  return <div className="min-h-[92px] bg-card p-4 sm:p-5">
    <div className="flex items-center gap-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-orange-500/10 text-[#ff5a0a]"><User className="size-4" /></span>
      <div className="min-w-0 flex-1">
        <span className="block text-[10px] font-bold uppercase tracking-[.12em] text-muted-foreground">{ar ? "الاسم الكامل" : "Full name"}</span>
        {editing ? <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
          <Input autoFocus value={value} maxLength={80} disabled={saving} onChange={(event) => onChange(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); onSave(); } if (event.key === "Escape") onCancel(); }} className="h-10 min-w-0 flex-1 rounded-xl" aria-label={ar ? "الاسم الكامل" : "Full name"} />
          <div className="flex gap-2"><Button type="button" size="sm" className="rounded-xl" disabled={saving} onClick={onSave}>{saving ? <Loader2 className="size-4 animate-spin" /> : null}{ar ? "حفظ" : "Save"}</Button><Button type="button" size="sm" variant="outline" className="rounded-xl" disabled={saving} onClick={onCancel}>{ar ? "إلغاء" : "Cancel"}</Button></div>
        </div> : <div className="mt-1.5 flex items-center justify-between gap-3"><strong className="truncate text-sm">{value}</strong><button type="button" onClick={onEdit} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[10px] font-bold text-[#ff5a0a] transition hover:bg-orange-500/10"><Pencil className="size-3.5" />{ar ? "تعديل" : "Edit"}</button></div>}
      </div>
    </div>
  </div>;
}

function NotificationsSection({ ar, notif, operationalRows, soundRows, toggle }: { ar: boolean; notif: Notifications; operationalRows: [keyof Notifications, string, string, string, string][]; soundRows: [keyof Notifications, string, string, string, string][]; toggle: (key: keyof Notifications, value: boolean) => void }) {
  return <div className="space-y-5">
    <SectionHeading icon={<Bell className="size-5" />} title={ar ? "الإشعارات والتنبيهات" : "Notifications & alerts"} description={ar ? "نظّم التنبيهات التشغيلية والأصوات بدون ازدحام. يتم حفظ كل تغيير تلقائياً." : "Organize operational alerts and sounds without clutter. Every change saves automatically."} />
    <div className="grid gap-5 2xl:grid-cols-2">
      <PreferenceGroup title={ar ? "التنبيهات التشغيلية" : "Operational alerts"} subtitle={ar ? "ما الذي تريد أن يتم تنبيهك بشأنه؟" : "Choose what deserves your attention."} rows={operationalRows} notif={notif} ar={ar} toggle={toggle} />
      <PreferenceGroup title={ar ? "الصوت والسلوك" : "Sound & behavior"} subtitle={ar ? "تحكم في أصوات التنبيه حسب نوع الحدث." : "Control alert sounds by event type."} rows={soundRows} notif={notif} ar={ar} toggle={toggle} />
    </div>
  </div>;
}

function OrganizationSection({ ar, restaurantId }: { ar: boolean; restaurantId: string }) {
  return <div className="space-y-5">
    <SectionHeading icon={<Store className="size-5" />} title={ar ? "المؤسسة والمظهر" : "Organization & appearance"} description={ar ? "إدارة هوية المطعم والشعارات وصورة الغلاف ونظام ألوان التطبيق ضمن مساحة منظمة واحدة." : "Manage restaurant identity, logos, cover image and application colors in one organized workspace."} />
    <div className="flex flex-wrap gap-2 rounded-2xl border border-border bg-muted/20 p-3 text-[10px] font-bold text-muted-foreground">
      <span className="inline-flex items-center gap-1.5 rounded-full bg-card px-3 py-2"><Building2 className="size-3.5" />{ar ? "هوية المطعم" : "Restaurant identity"}</span>
      <span className="inline-flex items-center gap-1.5 rounded-full bg-card px-3 py-2"><Palette className="size-3.5" />{ar ? "نظام الألوان" : "Color system"}</span>
      <span className="inline-flex items-center gap-1.5 rounded-full bg-card px-3 py-2"><SlidersHorizontal className="size-3.5" />{ar ? "معاينة مباشرة" : "Live preview"}</span>
    </div>
    <RestaurantProfileSettings restaurantId={restaurantId} />
  </div>;
}

function PreferenceGroup({ title, subtitle, rows, notif, ar, toggle }: { title: string; subtitle: string; rows: [keyof Notifications, string, string, string, string][]; notif: Notifications; ar: boolean; toggle: (key: keyof Notifications, value: boolean) => void }) {
  return <section className="qs-card overflow-hidden">
    <div className="border-b border-border px-5 py-4"><h2 className="text-sm font-bold">{title}</h2><p className="mt-1 text-xs text-muted-foreground">{subtitle}</p></div>
    <div className="divide-y divide-border">
      {rows.map(([key, en, arabic, hintEn, hintAr], index) => <div key={key} className="flex min-h-[82px] items-center gap-4 px-4 py-3.5 sm:px-5">
        <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl", index % 3 === 0 ? "bg-orange-500/10 text-[#ff5a0a]" : index % 3 === 1 ? "bg-emerald-500/10 text-emerald-600" : "bg-blue-500/10 text-blue-600")}><Bell className="size-4" /></span>
        <span className="min-w-0 flex-1"><strong className="block text-sm">{ar ? arabic : en}</strong><span className="mt-1 block text-xs leading-5 text-muted-foreground">{ar ? hintAr : hintEn}</span></span>
        <Switch checked={notif[key]} onCheckedChange={(value) => toggle(key, value)} aria-label={ar ? arabic : en} />
      </div>)}
    </div>
  </section>;
}

function SectionHeading({ icon, title, description }: { icon: ReactNode; title: string; description: string }) {
  return <header className="flex items-start gap-3">
    <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-orange-500/10 text-[#ff5a0a]">{icon}</span>
    <div><h2 className="font-display text-xl font-bold tracking-[-.025em]">{title}</h2><p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">{description}</p></div>
  </header>;
}

function InfoTile({ icon, label, value, accent }: { icon: ReactNode; label: string; value: string; accent?: boolean }) {
  return <div className="flex min-h-[92px] items-center gap-3 bg-card p-4 sm:p-5">
    <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-muted/70 text-muted-foreground">{icon}</span>
    <span className="min-w-0"><span className="block text-[10px] font-bold uppercase tracking-[.12em] text-muted-foreground">{label}</span><strong className={cn("mt-1.5 block truncate text-sm", accent && "text-emerald-600")}>{value}</strong></span>
  </div>;
}
