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
  Palette,
  ShieldCheck,
  SlidersHorizontal,
  Store,
  UserRound,
} from "lucide-react";

import { AppHeader } from "@/components/nav/AppHeader";
import { ProfileAvatarEditor } from "@/components/profile/ProfileAvatarEditor";
import { AccountCoverEditor } from "@/components/profile/AccountCoverEditor";
import { RestaurantProfileSettings } from "@/components/profile/RestaurantProfileSettings";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
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
  const personalCoverEligible = Boolean(membership && membership.role !== "restaurant_admin");
  const avatar = membership?.avatar_url || avatarPresetUrl(membership?.avatar_preset) || meta?.avatar_url || avatarPresetUrl(meta?.avatar_preset ?? null);
  const accountCover = personalCoverEligible ? (membership?.cover_image_url ?? null) : null;
  const accountCoverX = Number(membership?.cover_position_x ?? 50);
  const accountCoverY = Number(membership?.cover_position_y ?? 50);
  const accountCoverZoom = Number(membership?.cover_zoom ?? 100);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(notifKey);
      if (raw) setNotif({ ...DEFAULT_NOTIF, ...JSON.parse(raw) });
    } catch {
      setNotif(DEFAULT_NOTIF);
    }
  }, [notifKey]);


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
    { id: "organization" as const, icon: Store, label: ar ? "المؤسسة والمظهر" : "Organization & appearance", hint: canManageRestaurant ? (ar ? "الهوية والألوان والغلاف" : "Brand, colors and cover") : (ar ? "غلاف حسابك" : "Your account cover") },
  ];

  return <div className="min-h-dvh bg-background">
    <AppHeader />
    <main className="qs-page qs-compact-page qs-viewport-page">
      <section className="relative overflow-hidden rounded-[14px] border border-border bg-card">
        {accountCover ? <><img src={accountCover} alt="" className="pointer-events-none absolute inset-0 size-full object-cover opacity-20" style={{ objectPosition: `${accountCoverX}% ${accountCoverY}%`, transform: `scale(${accountCoverZoom / 100})` }} /><div className="pointer-events-none absolute inset-0 bg-white/85" /></> : null}
        <div className="relative flex flex-col gap-4 p-5 sm:p-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center">
            <div className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-[20px] border border-border bg-background shadow-sm">
              {avatar ? <img src={avatar} alt="" className="size-full object-cover" /> : <span className="font-display text-2xl font-black text-[#e85d2a]">{displayName.slice(0, 1).toUpperCase()}</span>}
            </div>
            <div className="min-w-0">
              <span className="mb-2 inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700"><CheckCircle2 className="size-3.5" />{ar ? "حساب نشط" : "Active account"}</span>
              <h1 className="truncate font-display text-[clamp(1.65rem,2.5vw,2.2rem)] font-bold tracking-[-.045em]">{displayName}</h1>
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

      <div className="qs-viewport-fill grid min-h-0 gap-4 xl:grid-cols-[210px_minmax(0,1fr)] xl:items-stretch">
        <aside className="min-h-0">
          <div className="qs-card p-2.5">
            <div className="px-3 pb-2 pt-2">
              <p className="text-[10px] font-bold uppercase tracking-[.2em] text-muted-foreground">{ar ? "الإعدادات" : "Settings"}</p>
            </div>
            <nav className="grid gap-1 sm:grid-cols-3 xl:grid-cols-1" aria-label={ar ? "أقسام الملف الشخصي" : "Profile sections"}>
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = section === item.id;
                return <button key={item.id} type="button" onClick={() => setSection(item.id)} aria-current={active ? "page" : undefined} className={cn("group flex min-h-14 items-center gap-2.5 rounded-[9px] px-3 py-2 text-start transition", active ? "bg-foreground text-background shadow-sm" : "hover:bg-muted/70")}>
                  <span className={cn("grid size-7 shrink-0 place-items-center rounded-[8px]", active ? "bg-white/16 text-white" : "bg-muted text-muted-foreground group-hover:text-foreground")}><Icon className="size-4.5" /></span>
                  <span className="min-w-0 flex-1"><strong className="block text-xs">{item.label}</strong><span className={cn("mt-0.5 hidden text-[10px] leading-4 sm:block xl:block", active ? "text-white/75" : "text-muted-foreground")}>{item.hint}</span></span>
                  <ChevronRight className={cn("size-4 shrink-0 transition", ar && "rotate-180", active ? "text-white/80" : "text-muted-foreground")} />
                </button>;
              })}
            </nav>
          </div>

          <div className="mt-3 hidden rounded-2xl border border-border bg-muted/20 p-4 xl:block">
            <div className="flex items-center gap-2 text-xs font-bold"><ShieldCheck className="size-4 text-emerald-600" />{ar ? "حساب آمن" : "Secure account"}</div>
            <p className="mt-2 text-[11px] leading-5 text-muted-foreground">{ar ? "بيانات الحساب هنا للعرض. يتم تعديل اسم مدير المطعم من صفحة الفريق." : "Account identity is read-only here. Restaurant Manager names are edited from the Team page."}</p>
          </div>
        </aside>

        <div className="qs-scroll-region min-h-0 min-w-0">
          {section === "profile" ? <PersonalSection ar={ar} lang={lang} rid={rid} displayName={displayName} email={email} roleLabel={roleLabel} restaurantName={restaurantName} createdAt={user?.created_at} /> : null}
          {section === "notifications" ? <NotificationsSection ar={ar} notif={notif} operationalRows={operationalRows} soundRows={soundRows} toggle={toggle} /> : null}
          {section === "organization" && rid ? <OrganizationSection ar={ar} restaurantId={rid} canManageRestaurant={canManageRestaurant} showAccountCover={personalCoverEligible} /> : null}
        </div>
      </div>
    </main>
  </div>;
}

function PersonalSection({ ar, lang, rid, displayName, email, roleLabel, restaurantName, createdAt }: { ar: boolean; lang: "ar" | "en"; rid: string | null; displayName: string; email: string; roleLabel: string; restaurantName: string; createdAt: string | undefined }) {
  return <div className="space-y-4">
    <SectionHeading icon={<UserRound className="size-5" />} title={ar ? "الملف الشخصي" : "Personal profile"} description={ar ? "حدّث صورتك وراجع معلومات حسابك. يتم تعديل اسم مدير المطعم من صفحة الفريق." : "Update your profile image and review account details. Restaurant Manager names are managed from the Team page."} />
    <section className="qs-card overflow-hidden"><div className="p-3.5 sm:p-5"><ProfileAvatarEditor restaurantId={rid} /></div></section>
    <section className="qs-card overflow-hidden">
      <div className="border-b border-border px-5 py-4 sm:px-6"><h2 className="text-sm font-bold">{ar ? "تفاصيل الحساب" : "Account details"}</h2><p className="mt-1 text-xs text-muted-foreground">{ar ? "بيانات الهوية والدور هنا للعرض فقط. غيّر اسم مدير المطعم من صفحة الفريق." : "Identity and role details are read-only here. Change the Restaurant Manager name from Team."}</p></div>
      <div className="grid gap-px bg-border sm:grid-cols-2">
        <InfoTile icon={<UserRound className="size-4" />} label={ar ? "الاسم الكامل" : "Full name"} value={displayName} />
        <InfoTile icon={<Mail className="size-4" />} label={ar ? "البريد الإلكتروني" : "Email address"} value={email} />
        <InfoTile icon={<ShieldCheck className="size-4" />} label={ar ? "الدور" : "Role"} value={roleLabel} />
        <InfoTile icon={<Building2 className="size-4" />} label={ar ? "المطعم" : "Restaurant"} value={restaurantName} />
        <InfoTile icon={<CheckCircle2 className="size-4" />} label={ar ? "حالة الحساب" : "Account status"} value={ar ? "نشط" : "Active"} accent />
        <InfoTile icon={<CalendarDays className="size-4" />} label={ar ? "عضو منذ" : "Member since"} value={createdAt ? formatDate(createdAt, lang) : "—"} />
      </div>
    </section>
  </div>;
}

function NotificationsSection({ ar, notif, operationalRows, soundRows, toggle }: { ar: boolean; notif: Notifications; operationalRows: [keyof Notifications, string, string, string, string][]; soundRows: [keyof Notifications, string, string, string, string][]; toggle: (key: keyof Notifications, value: boolean) => void }) {
  return <div className="space-y-4">
    <SectionHeading icon={<Bell className="size-5" />} title={ar ? "الإشعارات والتنبيهات" : "Notifications & alerts"} description={ar ? "نظّم التنبيهات التشغيلية والأصوات بدون ازدحام. يتم حفظ كل تغيير تلقائياً." : "Organize operational alerts and sounds without clutter. Every change saves automatically."} />
    <div className="grid gap-3 2xl:grid-cols-2">
      <PreferenceGroup title={ar ? "التنبيهات التشغيلية" : "Operational alerts"} subtitle={ar ? "ما الذي تريد أن يتم تنبيهك بشأنه؟" : "Choose what deserves your attention."} rows={operationalRows} notif={notif} ar={ar} toggle={toggle} />
      <PreferenceGroup title={ar ? "الصوت والسلوك" : "Sound & behavior"} subtitle={ar ? "تحكم في أصوات التنبيه حسب نوع الحدث." : "Control alert sounds by event type."} rows={soundRows} notif={notif} ar={ar} toggle={toggle} />
    </div>
  </div>;
}

function OrganizationSection({ ar, restaurantId, canManageRestaurant, showAccountCover }: { ar: boolean; restaurantId: string; canManageRestaurant: boolean; showAccountCover: boolean }) {
  return <div className="space-y-4">
    <SectionHeading icon={<Store className="size-5" />} title={ar ? "المؤسسة والمظهر" : "Organization & appearance"} description={canManageRestaurant ? (ar ? "إدارة هوية المطعم وإعدادات الحساب من مساحة واحدة منظمة." : "Manage restaurant identity and your account appearance from one organized workspace.") : (ar ? "خصص غلاف حسابك فقط بدون التأثير على هوية المطعم أو إعداداته." : "Customize only your account cover without changing restaurant branding or settings.")} />
    {showAccountCover ? <AccountCoverEditor restaurantId={restaurantId} /> : null}
    {canManageRestaurant ? <>
      <div className="flex flex-wrap gap-2 rounded-2xl border border-border bg-muted/20 p-3 text-[10px] font-bold text-muted-foreground">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-card px-3 py-2"><Building2 className="size-3.5" />{ar ? "هوية المطعم" : "Restaurant identity"}</span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-card px-3 py-2"><Palette className="size-3.5" />{ar ? "نظام الألوان" : "Color system"}</span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-card px-3 py-2"><SlidersHorizontal className="size-3.5" />{ar ? "مظهر مساحة العمل" : "Workspace appearance"}</span>
      </div>
      <RestaurantProfileSettings restaurantId={restaurantId} />
    </> : <section className="rounded-2xl border border-border bg-muted/20 p-4 text-xs leading-5 text-muted-foreground">{ar ? "إعدادات الشعار والألوان والمطعم تبقى تحت إدارة مدير المطعم. هذا الحساب يستطيع تعديل غلافه الشخصي فقط." : "Restaurant logos, colors and organization settings remain controlled by the Restaurant Manager. This account can edit only its personal cover."}</section>}
  </div>;
}

function PreferenceGroup({ title, subtitle, rows, notif, ar, toggle }: { title: string; subtitle: string; rows: [keyof Notifications, string, string, string, string][]; notif: Notifications; ar: boolean; toggle: (key: keyof Notifications, value: boolean) => void }) {
  return <section className="qs-card overflow-hidden">
    <div className="border-b border-border px-5 py-4"><h2 className="text-sm font-bold">{title}</h2><p className="mt-1 text-xs text-muted-foreground">{subtitle}</p></div>
    <div className="divide-y divide-border">
      {rows.map(([key, en, arabic, hintEn, hintAr], index) => <div key={key} className="flex min-h-[64px] items-center gap-3 px-3.5 py-2.5 sm:px-4">
        <span className={cn("grid size-8 shrink-0 place-items-center rounded-[10px]", index % 3 === 0 ? "bg-orange-500/10 text-[#e85d2a]" : index % 3 === 1 ? "bg-emerald-500/10 text-emerald-600" : "bg-blue-500/10 text-blue-600")}><Bell className="size-4" /></span>
        <span className="min-w-0 flex-1"><strong className="block text-sm">{ar ? arabic : en}</strong><span className="mt-1 block text-xs leading-5 text-muted-foreground">{ar ? hintAr : hintEn}</span></span>
        <Switch checked={notif[key]} onCheckedChange={(value) => toggle(key, value)} aria-label={ar ? arabic : en} />
      </div>)}
    </div>
  </section>;
}

function SectionHeading({ icon, title, description }: { icon: ReactNode; title: string; description: string }) {
  return <header className="flex items-start gap-3">
    <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-orange-500/10 text-[#e85d2a]">{icon}</span>
    <div><h2 className="font-display text-xl font-bold tracking-[-.025em]">{title}</h2><p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">{description}</p></div>
  </header>;
}

function InfoTile({ icon, label, value, accent }: { icon: ReactNode; label: string; value: string; accent?: boolean }) {
  return <div className="flex min-h-[64px] items-center gap-3 bg-card p-3 sm:p-3.5">
    <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-muted/70 text-muted-foreground">{icon}</span>
    <span className="min-w-0"><span className="block text-[10px] font-bold uppercase tracking-[.12em] text-muted-foreground">{label}</span><strong className={cn("mt-1.5 block truncate text-sm", accent && "text-emerald-600")}>{value}</strong></span>
  </div>;
}
