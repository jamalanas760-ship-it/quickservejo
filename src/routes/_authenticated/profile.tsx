import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Bell, Building2, LogOut, Mail, ShieldCheck, User } from "lucide-react";

import { ProfileAvatarEditor } from "@/components/profile/ProfileAvatarEditor";
import { StaffHeader } from "@/components/staff/StaffHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useAccess, useSupabaseSession } from "@/hooks/useSession";
import { useRestaurant } from "@/hooks/useSuperAdmin";
import { useWorkspaceScope } from "@/hooks/useWorkspace";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { ROLE_LABELS } from "@/lib/permissions";

type Notifications = { newOrders: boolean; waiterCalls: boolean; sound: boolean; daily: boolean };
const DEFAULT_NOTIF: Notifications = { newOrders: true, waiterCalls: true, sound: true, daily: false };

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({ meta: [{ title: "Profile & alerts — QuickServe" }] }),
  component: ProfilePage,
});

function ProfilePage() {
  const { lang } = useI18n();
  const ar = lang === "ar";
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const access = useAccess();
  const session = useSupabaseSession();
  const scope = useWorkspaceScope();
  const restaurantId = scope.restaurantId;
  const { data: restaurant } = useRestaurant(restaurantId ?? "");
  const [notif, setNotif] = useState<Notifications>(DEFAULT_NOTIF);

  const user = session.data?.user;
  const meta = user?.user_metadata as { full_name?: string; name?: string } | undefined;
  const membership = restaurantId ? access.membershipFor(restaurantId) : (access.data ?? []).find((row) => row.restaurant_id) ?? null;
  const displayName = meta?.full_name || meta?.name || membership?.name || user?.email || (ar ? "المستخدم" : "User");
  const email = user?.email ?? "—";
  const role = access.isSuperAdmin ? "super_admin" : membership?.role;
  const roleLabel = role && role in ROLE_LABELS ? ROLE_LABELS[role as keyof typeof ROLE_LABELS][lang] : (ar ? "عضو" : "Member");
  const notifKey = `quickserve.notifications:${user?.id ?? "guest"}`;

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(notifKey);
      if (raw) setNotif({ ...DEFAULT_NOTIF, ...(JSON.parse(raw) as Partial<Notifications>) });
    } catch {
      setNotif(DEFAULT_NOTIF);
    }
  }, [notifKey]);

  function setNotification(key: keyof Notifications, value: boolean) {
    const next = { ...notif, [key]: value };
    setNotif(next);
    try { window.localStorage.setItem(notifKey, JSON.stringify(next)); } catch { /* no-op */ }
  }

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const alertRows: Array<{ key: keyof Notifications; en: string; ar: string; enHint: string; arHint: string }> = [
    { key: "newOrders", en: "New orders", ar: "طلبات جديدة", enHint: "Alert me when a new order arrives.", arHint: "نبهني عند وصول طلب جديد." },
    { key: "waiterCalls", en: "Waiter calls", ar: "طلبات النادل", enHint: "Alert me when a table asks for service.", arHint: "نبهني عندما تطلب طاولة الخدمة." },
    { key: "sound", en: "Notification sound", ar: "صوت التنبيه", enHint: "Play a sound for enabled alerts.", arHint: "تشغيل صوت للتنبيهات المفعلة." },
    { key: "daily", en: "Daily summary", ar: "الملخص اليومي", enHint: "Show a compact daily operations summary.", arHint: "عرض ملخص يومي مختصر للتشغيل." },
  ];

  return (
    <div className="min-h-screen bg-background pb-24 lg:pb-10">
      <StaffHeader title={ar ? "الملف الشخصي" : "My profile"} />
      <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-9 lg:px-8">
        <header className="flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold tracking-[-.035em] sm:text-3xl">{displayName}</h1>
              <Badge variant="secondary" className="rounded-full px-3">{roleLabel}</Badge>
            </div>
            <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground"><Mail className="size-4" />{email}</p>
          </div>
          <Button variant="outline" className="self-start rounded-xl sm:self-auto" onClick={() => void signOut()}><LogOut className="size-4" />{ar ? "تسجيل الخروج" : "Sign out"}</Button>
        </header>

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,.85fr)]">
          <section className="min-w-0">
            <div className="mb-3 flex items-center gap-2"><User className="size-[18px] text-[#ff5a0a]" /><h2 className="text-base font-bold">{ar ? "الصورة والهوية" : "Photo & identity"}</h2></div>
            <ProfileAvatarEditor restaurantId={restaurantId} />

            <div className="mt-5 overflow-hidden rounded-2xl border border-border bg-card">
              <ReadOnlyRow icon={<User className="size-4" />} label={ar ? "الاسم" : "Name"} value={displayName} />
              <ReadOnlyRow icon={<Mail className="size-4" />} label={ar ? "البريد الإلكتروني" : "Email"} value={email} />
              <ReadOnlyRow icon={<ShieldCheck className="size-4" />} label={ar ? "الدور" : "Role"} value={roleLabel} />
              <ReadOnlyRow icon={<Building2 className="size-4" />} label={ar ? "المطعم" : "Restaurant"} value={restaurant?.name ?? scope.restaurantName ?? "—"} last />
            </div>
            <p className="mt-3 text-xs leading-5 text-muted-foreground">{ar ? "بيانات الحساب والمطعم للعرض فقط. يمكنك تغيير الصورة الشخصية فقط من هذه الصفحة." : "Account and restaurant details are read-only here. Only your profile picture can be changed from this page."}</p>
          </section>

          <section className="min-w-0">
            <div className="mb-3 flex items-center gap-2"><Bell className="size-[18px] text-[#ff5a0a]" /><h2 className="text-base font-bold">{ar ? "التنبيهات" : "Alerts"}</h2></div>
            <div className="overflow-hidden rounded-2xl border border-border bg-card">
              {alertRows.map((row) => (
                <div key={row.key} className="flex min-h-[76px] items-center justify-between gap-4 border-b border-border px-4 py-3 last:border-0 sm:px-5">
                  <div className="min-w-0"><p className="text-sm font-semibold">{ar ? row.ar : row.en}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{ar ? row.arHint : row.enHint}</p></div>
                  <div className="flex shrink-0 items-center gap-2"><span className="hidden text-[10px] font-bold uppercase tracking-wide text-muted-foreground sm:inline">{notif[row.key] ? "ON" : "OFF"}</span><Switch checked={notif[row.key]} onCheckedChange={(value) => setNotification(row.key, value)} aria-label={ar ? row.ar : row.en} /></div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

function ReadOnlyRow({ icon, label, value, last }: { icon: React.ReactNode; label: string; value: string; last?: boolean }) {
  return (
    <div className={`grid grid-cols-[34px_minmax(90px,.65fr)_minmax(0,1.35fr)] items-center gap-2 px-4 py-3.5 sm:px-5 ${last ? "" : "border-b border-border"}`}>
      <span className="grid size-8 place-items-center rounded-lg bg-muted/60 text-muted-foreground">{icon}</span>
      <span className="text-xs font-semibold text-muted-foreground">{label}</span>
      <span className="truncate text-end text-sm font-semibold">{value}</span>
    </div>
  );
}
