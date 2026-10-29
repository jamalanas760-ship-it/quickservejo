import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  Camera,
  Globe,
  Clock3,
  Sun,
  CheckCircle2,
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
import { SecuritySettings } from "@/components/profile/SecuritySettings";
import { ProfilePreferences } from "@/components/profile/ProfilePreferences";
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
import "@/components/profile/simple-settings.css";

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
      <main className="ps-page qs-profile-redesign qs-simple-settings" dir={ar ? "rtl" : "ltr"}>
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
          <span className="qp-active">
            <CheckCircle2 />
            {ar ? "نشط" : "Active"}
          </span>
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
                  roleLabel={roleLabel}
                  restaurantName={restaurantName}
                />
              </div>
            </>
          ) : null}
          {section === "preferences" ? (
            <>
              <ProfilePreferences
                userId={user?.id}
                onAdvanced={() => setSection("notifications")}
              />
              {personalCoverEligible ? (
                <details className="ps-card simple-advanced">
                  <summary>{ar ? "الغلاف الشخصي" : "Personal cover"}</summary>
                  <AccountCoverEditor restaurantId={rid} />
                </details>
              ) : null}
            </>
          ) : null}
          {section === "security" ? (
            <SecuritySettings
              restaurantId={rid}
              canEdit={access.isSuperAdmin || membership?.role === "restaurant_admin"}
              passwordAction={<PasswordEditor email={user?.email} ar={ar} />}
            />
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
  roleLabel,
  restaurantName,
}: {
  roleLabel: string;
  restaurantName: string;
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
          if (!draft.first.trim()) {
            toast.error(ar ? "أدخل الاسم الأول" : "Enter your first name");
            return;
          }
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
          <label className="ps-field qp-wide-field">
            {ar ? "البريد الإلكتروني" : "Email address"}
            <input type="email" value={email ?? ""} readOnly aria-describedby="qp-email-help" />
            <small id="qp-email-help">
              {ar
                ? "بريد تسجيل الدخول تديره المؤسسة."
                : "Sign-in email is managed by your organization."}
            </small>
          </label>
          <label className="ps-field qp-wide-field">
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
        <dl className="simple-account-summary">
          <div>
            <dt>{ar ? "الدور" : "Role"}</dt>
            <dd>{roleLabel}</dd>
          </div>
          <div>
            <dt>{ar ? "مساحة العمل" : "Workspace"}</dt>
            <dd>{restaurantName}</dd>
          </div>
        </dl>
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
                const { data, error } = await supabase.functions.invoke("quickserve-password", {
                  body: { currentPassword: current, password },
                });
                if (error) {
                  if (error.context instanceof Response) {
                    const payload = await error.context.json().catch(() => null);
                    throw new Error(payload?.error ?? error.message);
                  }
                  throw error;
                }
                if (!data?.ok) throw new Error("Password could not be updated");
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
                    maxLength={i ? 72 : 1024}
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
