import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  Camera,
  Globe,
  Clock3,
  Bell,
  ChevronRight,
  LockKeyhole,
  LogOut,
  ShieldCheck,
  Store,
  UserRound,
  UsersRound,
} from "lucide-react";
import {
  AppearancePreferences,
  LanguagePreference,
} from "@/components/profile/AppearancePreferences";
import { MasterPageHeader } from "@/components/app/MasterPage";
import { ActionMenu } from "@/components/app/ActionMenu";
import { AppHeader } from "@/components/nav/AppHeader";
import { ProfileAvatarEditor } from "@/components/profile/ProfileAvatarEditor";
import { AccountCoverEditor } from "@/components/profile/AccountCoverEditor";
import { RestaurantProfileSettings } from "@/components/profile/RestaurantProfileSettings";
import { NotificationSettings } from "@/components/profile/NotificationSettings";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useAccess, useSupabaseSession } from "@/hooks/useSession";
import { useRestaurant } from "@/hooks/useSuperAdmin";
import { useWorkspaceScope } from "@/hooks/useWorkspace";
import { supabase } from "@/integrations/supabase/client";
import { avatarPresetUrl, roleAvatarUrl } from "@/lib/avatar-presets";
import { useI18n } from "@/lib/i18n";
import { ROLE_LABELS } from "@/lib/permissions";
import { humanError } from "@/lib/errors";
import { toast } from "sonner";
import "@/components/profile/profile-studio.css";
import "@/components/profile/personal-profile.css";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({ meta: [{ title: "Profile & Settings — QuickServe" }] }),
  component: ProfilePage,
});
function ProfilePage() {
  const { lang } = useI18n(),
    ar = lang === "ar";
  const navigate = useNavigate(),
    qc = useQueryClient(),
    access = useAccess(),
    session = useSupabaseSession(),
    scope = useWorkspaceScope();
  const rid = scope.restaurantId,
    { data: restaurant } = useRestaurant(rid ?? "");
  const [section, setSection] = useState<
    "profile" | "preferences" | "security" | "notifications" | "organization"
  >("profile");
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [timeZone, setTimeZone] = useState("—");
  useEffect(() => {
    setTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
  }, []);
  const [signingOut, setSigningOut] = useState(false);
  const user = session.data?.user,
    meta = user?.user_metadata;
  const membership = rid
    ? access.membershipFor(rid)
    : ((access.data ?? []).find((row) => row.restaurant_id) ?? null);
  const displayName =
    meta?.full_name ||
    meta?.name ||
    membership?.name ||
    user?.email?.split("@")[0] ||
    (ar ? "المستخدم" : "User");
  const role = access.isSuperAdmin ? "super_admin" : membership?.role;
  const roleLabel =
    role && role in ROLE_LABELS
      ? ROLE_LABELS[role as keyof typeof ROLE_LABELS][lang]
      : ar
        ? "عضو"
        : "Member";
  const restaurantName = restaurant?.name ?? scope.restaurantName ?? "—";
  const canManageRestaurant = Boolean(rid && access.canFor(rid, "manage_restaurant"));
  const personalCoverEligible = Boolean(membership && membership.role !== "restaurant_admin");
  const avatar =
    membership?.avatar_url ||
    avatarPresetUrl(membership?.avatar_preset) ||
    meta?.avatar_url ||
    avatarPresetUrl(meta?.avatar_preset) ||
    roleAvatarUrl(role);
  async function signOut() {
    setSigningOut(true);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      await qc.cancelQueries();
      qc.clear();
      await navigate({ to: "/auth", replace: true });
    } catch (error) {
      toast.error(humanError(error, lang));
      setSigningOut(false);
    }
  }
  const navItems = [
    {
      id: "profile" as const,
      icon: UserRound,
      label: ar ? "المعلومات الشخصية" : "Personal information",
    },
    { id: "preferences" as const, icon: Globe, label: ar ? "التفضيلات" : "Preferences" },
    { id: "security" as const, icon: ShieldCheck, label: ar ? "الأمان" : "Security" },
    {
      id: "organization" as const,
      icon: Store,
      label: ar ? "المؤسسة والمظهر" : "Organization & appearance",
    },
  ].filter((item) => item.id !== "organization" || canManageRestaurant);
  return (
    <div className="min-h-dvh bg-background">
      <AppHeader />
      <main className="ps-page qs-profile-redesign" dir={ar ? "rtl" : "ltr"}>
        <MasterPageHeader
          title={ar ? "ملفي الشخصي" : "My profile"}
          description={
            ar
              ? "بياناتك وتفضيلاتك وأمان حسابك."
              : "Your details, preferences and account security."
          }
          actions={
            <ActionMenu
              ar={ar}
              actions={[
                {
                  label: ar ? "تسجيل الخروج" : "Sign out",
                  icon: LogOut,
                  disabled: signingOut,
                  onSelect: () => void signOut(),
                },
              ]}
            />
          }
        />
        <section className="ps-card qp-hero">
          <svg
            className="qp-waves"
            viewBox="0 0 1200 200"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <defs>
              <linearGradient id="qp-orange">
                <stop stopColor="#ffe4cc" />
                <stop offset="1" stopColor="#ff6509" />
              </linearGradient>
            </defs>
            <path fill="url(#qp-orange)" d="M0 0H1200V60C990 230 850 205 640 110S240 20 0 80Z" />
            <path fill="#ffb66c" opacity=".45" d="M0 0H850C650 150 490 170 280 95S70 30 0 65Z" />
            <path
              fill="#fff2e5"
              opacity=".7"
              d="M120 0H550C640 70 760 130 900 150C600 180 430 50 120 0Z"
            />
          </svg>
          <button
            type="button"
            className="qp-avatar"
            onClick={() => setAvatarOpen(true)}
            aria-label={ar ? "تغيير الصورة الشخصية" : "Change profile picture"}
          >
            {avatar ? (
              <img src={avatar} alt="" />
            ) : (
              <span className="ps-initial">{displayName.slice(0, 1).toUpperCase()}</span>
            )}
            <span className="qp-camera">
              <Camera />
            </span>
          </button>
          <div className="qp-identity">
            <h2>{displayName}</h2>
            <p>{roleLabel}</p>
            <span>
              <Store />
              {restaurantName}
            </span>
          </div>
          <button
            type="button"
            className="ps-button qp-change-avatar"
            onClick={() => setAvatarOpen(true)}
          >
            <Camera />
            {ar ? "تغيير الصورة" : "Change avatar"}
          </button>
        </section>
        <nav className="qp-tabs" aria-label={ar ? "أقسام الملف الشخصي" : "Profile sections"}>
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-current={section === item.id ? "page" : undefined}
              className={section === item.id ? "is-active" : ""}
              onClick={() => setSection(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <div className="ps-content">
          {section === "profile" ? (
            <>
              <div className="qp-details-grid">
                <PersonalInformation
                  key={user?.id ?? "loading"}
                  name={displayName}
                  email={user?.email}
                  metadata={meta}
                  ready={Boolean(user)}
                  ar={ar}
                />
                <section className="ps-card qp-overview">
                  <h2>{ar ? "نظرة عامة على الحساب" : "Account overview"}</h2>
                  <p>{ar ? "تفاصيل حسابك وإعداداته." : "Your account details and settings."}</p>
                  <dl>
                    {[
                      { icon: UserRound, label: ar ? "الدور" : "Role", value: roleLabel },
                      { icon: Store, label: ar ? "المطعم" : "Restaurant", value: restaurantName },
                      {
                        icon: Globe,
                        label: ar ? "اللغة" : "Language",
                        value: ar ? "العربية" : "English",
                      },
                      {
                        icon: Clock3,
                        label: ar ? "المنطقة الزمنية" : "Time zone",
                        value: timeZone,
                      },
                    ].map((item) => (
                      <div key={item.label}>
                        <dt>
                          <item.icon />
                          {item.label}
                        </dt>
                        <dd>{item.value}</dd>
                      </div>
                    ))}
                  </dl>
                  {canManageRestaurant && rid ? (
                    <Link
                      className="ps-link"
                      to="/manage/$restaurantId/staff"
                      params={{ restaurantId: rid }}
                    >
                      <UsersRound />
                      {ar ? "إدارة الفريق" : "Manage team"}
                      <ChevronRight />
                    </Link>
                  ) : null}
                </section>
              </div>
              <section className="ps-card qp-preferences">
                <h2>{ar ? "التفضيلات" : "Preferences"}</h2>
                <p>
                  {ar
                    ? "إدارة مظهر التطبيق والإشعارات."
                    : "Manage your app experience and notification settings."}
                </p>
                <div className="qp-preference-row">
                  <div>
                    <strong>{ar ? "مظهر التطبيق" : "App theme"}</strong>
                    <AppearancePreferences ar={ar} />
                  </div>
                  <button
                    type="button"
                    className="qp-notification-link"
                    onClick={() => setSection("notifications")}
                  >
                    <Bell />
                    <span>
                      <strong>{ar ? "الإشعارات" : "Notifications"}</strong>
                      <small>
                        {ar
                          ? "اختر الإشعارات التي تريد تلقيها."
                          : "Choose what you want to be notified about."}
                      </small>
                    </span>
                    <ChevronRight />
                  </button>
                </div>
              </section>
            </>
          ) : null}
          {section === "preferences" ? (
            <section className="ps-card">
              <h2>{ar ? "التفضيلات" : "Preferences"}</h2>
              <div className="qp-preferences-panel">
                <AppearancePreferences ar={ar} />
                <LanguagePreference ar={ar} />
                <button
                  type="button"
                  className="ps-button"
                  onClick={() => setSection("notifications")}
                >
                  <Bell />
                  {ar ? "إعدادات الإشعارات" : "Notification settings"}
                </button>
                {personalCoverEligible ? <AccountCoverEditor restaurantId={rid} /> : null}
              </div>
            </section>
          ) : null}
          {section === "security" ? (
            <section className="ps-card ps-security">
              <ShieldCheck />
              <div>
                <h2>{ar ? "أمان الحساب" : "Account security"}</h2>
                <p>
                  {ar
                    ? "حافظ على كلمة مرور قوية لحماية حسابك."
                    : "Keep your account protected with a strong password."}
                </p>
              </div>
              <PasswordEditor email={user?.email} ar={ar} />
            </section>
          ) : null}
          {section === "notifications" ? <NotificationSettings userId={user?.id} ar={ar} /> : null}
          {section === "organization" && canManageRestaurant ? (
            <>
              <header className="ps-section-title">
                <span>
                  <Store />
                </span>
                <div>
                  <h2>{ar ? "المؤسسة والمظهر" : "Organization & appearance"}</h2>
                  <p>
                    {ar
                      ? "خصص هوية المطعم ومظهر مساحة العمل."
                      : "Customize your restaurant’s brand, appearance and regional settings."}
                  </p>
                </div>
              </header>
              {rid && canManageRestaurant ? (
                <RestaurantProfileSettings restaurantId={rid} />
              ) : (
                <>
                  {personalCoverEligible ? <AccountCoverEditor restaurantId={rid} /> : null}
                  <section className="ps-card">
                    <h2>{ar ? "إعدادات المؤسسة" : "Organization settings"}</h2>
                    <p className="mt-2">
                      {ar
                        ? "تُدار هوية المطعم وإعداداته من قبل مدير المطعم."
                        : "Restaurant branding and settings are managed by your Restaurant Manager."}
                    </p>
                  </section>
                </>
              )}
            </>
          ) : null}
        </div>
        <Dialog open={avatarOpen} onOpenChange={setAvatarOpen}>
          <DialogContent className="ps-page qp-avatar-dialog">
            <DialogHeader>
              <DialogTitle>{ar ? "تغيير الصورة الشخصية" : "Change avatar"}</DialogTitle>
              <DialogDescription>
                {ar ? "ارفع صورة أو اختر شخصيتك." : "Upload a photo or choose your avatar."}
              </DialogDescription>
            </DialogHeader>
            <ProfileAvatarEditor restaurantId={rid} />
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
function PersonalInformation({
  name,
  email,
  metadata,
  ready,
  ar,
}: {
  name: string;
  email: string | undefined;
  metadata: Record<string, unknown> | undefined;
  ready: boolean;
  ar: boolean;
}) {
  const qc = useQueryClient();
  const { lang } = useI18n();
  const initial = useMemo(
    () => ({
      first: String(metadata?.first_name ?? name.split(" ")[0] ?? ""),
      last: String(metadata?.last_name ?? name.split(" ").slice(1).join(" ")),
      phone: String(metadata?.contact_phone ?? ""),
    }),
    [name, metadata?.first_name, metadata?.last_name, metadata?.contact_phone],
  );
  const [draft, setDraft] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (!dirty) setDraft(initial);
  }, [initial, dirty]);
  return (
    <section className="ps-card qp-information">
      <h2>{ar ? "المعلومات الشخصية" : "Personal information"}</h2>
      <p>{ar ? "حافظ على تحديث بياناتك الشخصية." : "Keep your personal details up to date."}</p>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          if (busy || !ready) return;
          setBusy(true);
          try {
            const { error } = await supabase.auth.updateUser({
              data: {
                first_name: draft.first.trim(),
                last_name: draft.last.trim(),
                full_name: [draft.first.trim(), draft.last.trim()].filter(Boolean).join(" "),
                contact_phone: draft.phone.trim(),
              },
            });
            if (error) throw error;
            await qc.invalidateQueries({ queryKey: ["auth", "session"] });
            setDirty(false);
            toast.success(ar ? "تم حفظ البيانات" : "Profile updated");
          } catch (error) {
            toast.error(humanError(error, lang));
          } finally {
            setBusy(false);
          }
        }}
      >
        <fieldset disabled={busy || !ready} className="qp-form-fields">
          {(
            [
              ["first", ar ? "الاسم الأول" : "First name", "given-name"],
              ["last", ar ? "اسم العائلة" : "Last name", "family-name"],
            ] as const
          ).map(([key, label, autocomplete]) => (
            <label key={key} className="ps-field">
              {label}
              <input
                required={key === "first"}
                maxLength={100}
                autoComplete={autocomplete}
                value={draft[key]}
                onChange={(e) => {
                  setDraft({ ...draft, [key]: e.target.value });
                  setDirty(true);
                }}
              />
            </label>
          ))}
          <label className="ps-field">
            {ar ? "البريد الإلكتروني" : "Email address"}
            <input type="email" value={email ?? ""} readOnly aria-describedby="qp-email-help" />
            <small id="qp-email-help">
              {ar
                ? "بريد تسجيل الدخول تديره المؤسسة."
                : "Sign-in email is managed by your organization."}
            </small>
          </label>
          <label className="ps-field">
            {ar ? "رقم الهاتف" : "Phone number"}
            <input
              type="tel"
              dir="ltr"
              autoComplete="tel"
              maxLength={30}
              value={draft.phone}
              onChange={(e) => {
                setDraft({ ...draft, phone: e.target.value });
                setDirty(true);
              }}
            />
          </label>
        </fieldset>
        <div className="qp-form-actions">
          <button
            type="submit"
            className="ps-button ps-primary"
            disabled={busy || !dirty || !ready}
          >
            {busy ? (ar ? "جارٍ الحفظ…" : "Saving…") : ar ? "حفظ التغييرات" : "Save changes"}
          </button>
          <button
            type="button"
            className="ps-button"
            disabled={busy || !dirty}
            onClick={() => {
              setDraft(initial);
              setDirty(false);
            }}
          >
            {ar ? "إلغاء" : "Cancel"}
          </button>
        </div>
      </form>
    </section>
  );
}
function PasswordEditor({ email, ar }: { email: string | undefined; ar: boolean }) {
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [current, setCurrent] = useState(""),
    [password, setPassword] = useState(""),
    [confirm, setConfirm] = useState("");
  const { lang } = useI18n();
  function close(value: boolean) {
    if (busy) return;
    setOpen(value);
    setCurrent("");
    setPassword("");
    setConfirm("");
  }
  return (
    <>
      <button type="button" className="ps-button" onClick={() => setOpen(true)}>
        <LockKeyhole />
        {ar ? "تغيير كلمة المرور" : "Change password"}
      </button>
      <Dialog open={open} onOpenChange={close}>
        <DialogContent
          onOpenAutoFocus={(event) => event.preventDefault()}
          className="ps-dialog max-w-sm"
        >
          <DialogHeader>
            <DialogTitle>{ar ? "تغيير كلمة المرور" : "Change password"}</DialogTitle>
            <DialogDescription>
              {ar
                ? "أكد كلمة مرورك الحالية ثم اختر كلمة مرور جديدة."
                : "Confirm your current password, then choose a new one."}
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              if (!email || busy) return;
              if (password !== confirm) {
                toast.error(ar ? "كلمتا المرور غير متطابقتين" : "Passwords do not match");
                return;
              }
              setBusy(true);
              try {
                const auth = await supabase.auth.signInWithPassword({ email, password: current });
                if (auth.error) throw auth.error;
                const { error } = await supabase.auth.updateUser({ password });
                if (error) throw error;
                setOpen(false);
                setCurrent("");
                setPassword("");
                setConfirm("");
                toast.success(ar ? "تم تحديث كلمة المرور" : "Password updated");
              } catch (error) {
                toast.error(humanError(error, lang));
              } finally {
                setBusy(false);
              }
            }}
          >
            <div className="ps-password-fields">
              {[
                [
                  ar ? "كلمة المرور الحالية" : "Current password",
                  current,
                  setCurrent,
                  "current-password",
                ],
                [
                  ar ? "كلمة المرور الجديدة" : "New password",
                  password,
                  setPassword,
                  "new-password",
                ],
                [
                  ar ? "تأكيد كلمة المرور" : "Confirm password",
                  confirm,
                  setConfirm,
                  "new-password",
                ],
              ].map(([label, value, setter, autocomplete], i) => (
                <label key={i} className="ps-field">
                  {label as string}
                  <input
                    type="password"
                    required
                    minLength={i ? 8 : 1}
                    autoComplete={autocomplete as string}
                    value={value as string}
                    onChange={(event) => (setter as (v: string) => void)(event.target.value)}
                    disabled={busy}
                  />
                </label>
              ))}
            </div>
            <button className="ps-button ps-primary" type="submit" disabled={busy || !email}>
              {busy
                ? ar
                  ? "جارٍ الحفظ…"
                  : "Saving…"
                : ar
                  ? "تحديث كلمة المرور"
                  : "Update password"}
            </button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
