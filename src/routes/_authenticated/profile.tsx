import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  Bell,
  Building2,
  CheckCircle2,
  ChevronRight,
  LockKeyhole,
  LogOut,
  Mail,
  ShieldCheck,
  Store,
  UserRound,
  UsersRound,
} from "lucide-react";
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
  const [section, setSection] = useState<"profile" | "notifications" | "organization">("profile");
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
  const canManageRestaurant = Boolean(
    rid && access.canFor(rid, "manage_restaurant"),
  );
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
    { id: "profile" as const, icon: UserRound, label: ar ? "الملف الشخصي" : "Personal profile" },
    { id: "notifications" as const, icon: Bell, label: ar ? "الإشعارات" : "Notifications" },
    {
      id: "organization" as const,
      icon: Store,
      label: ar ? "المؤسسة والمظهر" : "Organization & appearance",
    },
  ];
  return (
    <div className="min-h-dvh bg-background">
      <AppHeader />
      <main className="ps-page">
        <div className="ps-layout">
          <aside className="ps-sidebar">
            <h1>{ar ? "الملف الشخصي والإعدادات" : "Profile & Settings"}</h1>
            <p>
              {ar
                ? "إدارة حسابك وتفضيلات مساحة العمل."
                : "Manage your account and workspace preferences."}
            </p>
            <nav className="ps-nav" aria-label={ar ? "أقسام الملف الشخصي" : "Profile sections"}>
              {navItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  aria-current={section === item.id ? "page" : undefined}
                  className={section === item.id ? "is-active" : ""}
                  onClick={() => setSection(item.id)}
                >
                  <item.icon />
                  <span>{item.label}</span>
                </button>
              ))}
            </nav>
          </aside>
          <div className="ps-content">
            {section === "profile" ? (
              <>
                <section className="ps-card ps-account">
                  {avatar ? (
                    <img src={avatar} alt="" />
                  ) : (
                    <span className="ps-initial">{displayName.slice(0, 1).toUpperCase()}</span>
                  )}
                  <div className="ps-account-identity">
                    <span className="ps-status">
                      <CheckCircle2 />
                      {ar ? "حساب نشط" : "Active account"}
                    </span>
                    <h2>{displayName}</h2>
                    <div className="ps-account-meta">
                      <span>
                        <Mail />
                        {user?.email ?? "—"}
                      </span>
                      <span>
                        <ShieldCheck />
                        {roleLabel}
                      </span>
                      <span>
                        <Building2 />
                        {restaurantName}
                      </span>
                    </div>
                  </div>
                  <button
                    className="ps-button"
                    disabled={signingOut}
                    onClick={() => void signOut()}
                  >
                    <LogOut />
                    {ar ? "تسجيل الخروج" : "Sign out"}
                  </button>
                </section>
                <div className="ps-personal">
                  <section className="ps-card">
                    <ProfileAvatarEditor restaurantId={rid} />
                  </section>
                  <div className="ps-detail-column">
                    <section className="ps-card">
                      <h2>{ar ? "تفاصيل الحساب" : "Account details"}</h2>
                      <p className="mt-1">
                        {ar
                          ? "تُدار بيانات حسابك من قبل المؤسسة."
                          : "Your account information is managed by your organization."}
                      </p>
                      <dl className="ps-details">
                        {[
                          [ar ? "الاسم" : "Name", displayName],
                          [ar ? "البريد الإلكتروني" : "Email", user?.email ?? "—"],
                          [ar ? "الدور" : "Role", roleLabel],
                          [ar ? "المطعم" : "Restaurant", restaurantName],
                        ].map(([label, value]) => (
                          <div key={label}>
                            <dt>{label}</dt>
                            <dd>{value}</dd>
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
                          <ChevronRight className={ar ? "rotate-180" : ""} />
                        </Link>
                      ) : null}
                    </section>
                    <section className="ps-card ps-security">
                      <ShieldCheck />
                      <div>
                        <h3>{ar ? "حساب آمن" : "Secure account"}</h3>
                        <p className="mt-1">
                          {ar
                            ? "حسابك نشط. حافظ على كلمة مرور قوية."
                            : "Your account is active. Keep your password secure."}
                        </p>
                      </div>
                      <PasswordEditor email={user?.email} ar={ar} />
                    </section>
                  </div>
                </div>
              </>
            ) : null}
            {section === "notifications" ? (
              <NotificationSettings userId={user?.id} ar={ar} />
            ) : null}
            {section === "organization" ? (
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
        </div>
      </main>
    </div>
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
