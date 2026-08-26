import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Bell, Building2, LogOut, Mail, Palette, Shield, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { StaffHeader } from "@/components/staff/StaffHeader";
import { ImageUploader } from "@/components/media/ImageUploader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAccess } from "@/hooks/useSession";
import { useWorkspaceMembers, useWorkspaceScope } from "@/hooks/useWorkspace";
import { useRestaurant } from "@/hooks/useSuperAdmin";
import { useI18n } from "@/lib/i18n";
import { humanError } from "@/lib/errors";
import { ROLE_LABELS, type AppRole } from "@/lib/permissions";
import type { Database } from "@/integrations/supabase/types";

type RestaurantUpdate = Database["public"]["Tables"]["restaurants"]["Update"];

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({
    meta: [
      { title: "Profile & settings — QuickServe" },
      {
        name: "description",
        content:
          "Your QuickServe account: organisation settings, roles and permissions, notifications, brand palette and logo.",
      },
      { property: "og:title", content: "Profile & settings — QuickServe" },
      {
        property: "og:description",
        content: "Organisation settings, permissions, notifications and branding.",
      },
    ],
  }),
  component: ProfilePage,
});

const NOTIF_KEY = "quickserve.notifications";
const ROLES: AppRole[] = ["restaurant_admin", "manager", "kitchen", "waiter", "cashier"];

type Notifications = { newOrders: boolean; waiterCalls: boolean; sound: boolean; daily: boolean };
const DEFAULT_NOTIF: Notifications = {
  newOrders: true,
  waiterCalls: true,
  sound: true,
  daily: false,
};

function ProfilePage() {
  const { t, lang, toggleLang } = useI18n();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const access = useAccess();
  const scope = useWorkspaceScope();
  const restaurantId = scope.restaurantId;
  const { data: restaurant } = useRestaurant(restaurantId ?? "");
  const members = useWorkspaceMembers(restaurantId);
  const [email, setEmail] = useState<string | null>(null);
  const [notif, setNotif] = useState<Notifications>(DEFAULT_NOTIF);

  const [org, setOrg] = useState({ name: "", phone: "", currency: "JOD", tax: "0" });
  const [colors, setColors] = useState({ primary: "#f59323", accent: "#111111", background: "#ffffff" });
  const [saving, setSaving] = useState(false);

  const canManage =
    access.isSuperAdmin ||
    (access.data ?? []).some(
      (m) =>
        m.restaurant_id === restaurantId &&
        (m.role === "restaurant_admin" || m.role === "manager"),
    );

  useEffect(() => {
    void supabase.auth.getUser().then(({ data: u }) => setEmail(u.user?.email ?? null));
    try {
      const raw = window.localStorage.getItem(NOTIF_KEY);
      if (raw) setNotif({ ...DEFAULT_NOTIF, ...(JSON.parse(raw) as Partial<Notifications>) });
    } catch {
      /* defaults are fine */
    }
  }, []);

  useEffect(() => {
    if (!restaurant) return;
    setOrg({
      name: restaurant.name,
      phone: restaurant.phone ?? "",
      currency: restaurant.currency,
      tax: String(restaurant.tax_rate ?? 0),
    });
    setColors({
      primary: restaurant.primary_color,
      accent: restaurant.accent_color,
      background: restaurant.background_color,
    });
  }, [restaurant]);

  function setNotification(key: keyof Notifications, value: boolean) {
    const next = { ...notif, [key]: value };
    setNotif(next);
    window.localStorage.setItem(NOTIF_KEY, JSON.stringify(next));
  }

  async function saveRestaurant(patch: RestaurantUpdate) {
    if (!restaurantId) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("restaurants").update(patch).eq("id", restaurantId);
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ["platform", "restaurant", restaurantId] });
      toast.success(lang === "ar" ? "تم الحفظ" : "Saved");
    } catch (error) {
      toast.error(humanError(error, lang));
    } finally {
      setSaving(false);
    }
  }

  async function changeRole(staffId: string, role: AppRole) {
    try {
      const { error } = await supabase.from("staff").update({ role }).eq("id", staffId);
      if (error) throw error;
      await members.refetch();
      toast.success(lang === "ar" ? "تم تحديث الصلاحية" : "Role updated");
    } catch (error) {
      toast.error(humanError(error, lang));
    }
  }

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const memberships = (access.data ?? []).filter((m) => m.restaurant_id);

  return (
    <div className="min-h-screen bg-background">
      <StaffHeader title={lang === "ar" ? "الملف الشخصي" : "Profile"} />
      <main className="mx-auto w-full max-w-3xl space-y-5 px-4 py-6 sm:px-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {lang === "ar" ? "الملف الشخصي والإعدادات" : "Profile & settings"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {lang === "ar"
              ? "حسابك، مؤسستك، الصلاحيات، التنبيهات والهوية البصرية."
              : "Your account, organisation, permissions, notifications and branding."}
          </p>
        </div>

        {/* Account */}
        <section className="panel space-y-3 p-5">
          <div className="flex items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
              <Mail className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">
                {lang === "ar" ? "البريد الإلكتروني" : "Email"}
              </p>
              <p className="truncate text-sm font-medium">{email ?? "—"}</p>
            </div>
          </div>
          {access.isSuperAdmin ? (
            <div className="flex items-center gap-2 text-sm">
              <Shield className="size-4 text-primary" />
              <span>{ROLE_LABELS.super_admin[lang]}</span>
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2 pt-1">
            {memberships.map((m) => (
              <Badge key={m.id} variant="secondary">
                {m.restaurant?.name} · {ROLE_LABELS[m.role][lang]}
              </Badge>
            ))}
            {memberships.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("dash.noAccess")}</p>
            ) : null}
          </div>
        </section>

        {/* Organisation settings */}
        {restaurantId ? (
          <section className="panel space-y-4 p-5">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Building2 className="size-4 text-primary" />
              {lang === "ar" ? "إعدادات المؤسسة" : "Organisation settings"}
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>{lang === "ar" ? "اسم المطعم" : "Restaurant name"}</Label>
                <Input
                  value={org.name}
                  disabled={!canManage}
                  onChange={(e) => setOrg({ ...org, name: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{lang === "ar" ? "الهاتف" : "Phone"}</Label>
                <Input
                  value={org.phone}
                  disabled={!canManage}
                  onChange={(e) => setOrg({ ...org, phone: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{lang === "ar" ? "العملة" : "Currency"}</Label>
                <Select
                  value={org.currency}
                  onValueChange={(v) => setOrg({ ...org, currency: v })}
                  disabled={!canManage}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["JOD", "SAR", "AED", "USD", "EUR"].map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{lang === "ar" ? "نسبة الضريبة %" : "Tax rate %"}</Label>
                <Input
                  type="number"
                  inputMode="decimal"
                  value={org.tax}
                  disabled={!canManage}
                  onChange={(e) => setOrg({ ...org, tax: e.target.value })}
                />
              </div>
            </div>
            {canManage ? (
              <Button
                size="sm"
                disabled={saving}
                onClick={() =>
                  void saveRestaurant({
                    name: org.name.trim(),
                    phone: org.phone.trim() || null,
                    currency: org.currency,
                    tax_rate: Number(org.tax) || 0,
                  })
                }
              >
                {lang === "ar" ? "حفظ" : "Save changes"}
              </Button>
            ) : (
              <p className="text-xs text-muted-foreground">
                {lang === "ar" ? "للعرض فقط بصلاحيتك الحالية." : "Read-only for your role."}
              </p>
            )}
          </section>
        ) : null}

        {/* Branding: logo + palette */}
        {restaurantId ? (
          <section className="panel space-y-4 p-5">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Palette className="size-4 text-primary" />
              {lang === "ar" ? "الشعار والألوان" : "Logo & colour palette"}
            </h2>
            <ImageUploader
              restaurantId={restaurantId}
              kind="logo"
              value={restaurant?.logo_url ?? null}
              onChange={(url) => void saveRestaurant({ logo_url: url })}
              label={lang === "ar" ? "شعار المطعم" : "Restaurant logo"}
            />
            <div className="grid gap-3 sm:grid-cols-3">
              {(
                [
                  ["primary", lang === "ar" ? "اللون الأساسي" : "Primary"],
                  ["accent", lang === "ar" ? "اللون المميز" : "Accent"],
                  ["background", lang === "ar" ? "الخلفية" : "Background"],
                ] as const
              ).map(([key, label]) => (
                <div key={key} className="space-y-1.5">
                  <Label>{label}</Label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      aria-label={label}
                      className="size-10 shrink-0 cursor-pointer rounded-lg border bg-background"
                      value={colors[key]}
                      disabled={!canManage}
                      onChange={(e) => setColors({ ...colors, [key]: e.target.value })}
                    />
                    <Input
                      value={colors[key]}
                      disabled={!canManage}
                      onChange={(e) => setColors({ ...colors, [key]: e.target.value })}
                    />
                  </div>
                </div>
              ))}
            </div>
            {canManage ? (
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  disabled={saving}
                  onClick={() =>
                    void saveRestaurant({
                      primary_color: colors.primary,
                      accent_color: colors.accent,
                      background_color: colors.background,
                    })
                  }
                >
                  {lang === "ar" ? "تطبيق الألوان" : "Apply palette"}
                </Button>
                <Button asChild size="sm" variant="outline">
                  <Link to="/manage/$restaurantId/design" params={{ restaurantId }}>
                    {lang === "ar" ? "مصمّم القائمة بالذكاء الاصطناعي" : "AI menu designer"}
                  </Link>
                </Button>
              </div>
            ) : null}
          </section>
        ) : null}

        {/* Permissions */}
        {restaurantId ? (
          <section className="panel space-y-3 p-5">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <ShieldCheck className="size-4 text-primary" />
              {lang === "ar" ? "المستخدمون والصلاحيات" : "Users & permissions"}
            </h2>
            {members.isPending ? (
              <Skeleton className="h-20 rounded-lg" />
            ) : (members.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {lang === "ar" ? "لا يوجد أعضاء بعد." : "No members yet."}
              </p>
            ) : (
              <ul className="divide-y">
                {(members.data ?? []).map((m) => (
                  <li key={m.id} className="flex items-center gap-3 py-2.5">
                    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                      {m.name?.slice(0, 1).toUpperCase() ?? "?"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{m.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{m.email ?? "—"}</p>
                    </div>
                    {canManage ? (
                      <Select
                        value={m.role}
                        onValueChange={(v) => void changeRole(m.id, v as AppRole)}
                      >
                        <SelectTrigger className="w-36 shrink-0">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ROLES.map((role) => (
                            <SelectItem key={role} value={role}>
                              {ROLE_LABELS[role][lang]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Badge variant="secondary">{ROLE_LABELS[m.role][lang]}</Badge>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {canManage ? (
              <Button asChild size="sm" variant="outline">
                <Link to="/manage/$restaurantId/staff" params={{ restaurantId }}>
                  {lang === "ar" ? "إدارة الفريق" : "Manage team"}
                </Link>
              </Button>
            ) : null}
          </section>
        ) : null}

        {/* Notifications */}
        <section className="panel space-y-1 p-5">
          <h2 className="flex items-center gap-2 pb-2 text-sm font-semibold">
            <Bell className="size-4 text-primary" />
            {lang === "ar" ? "إعدادات التنبيهات" : "Notification settings"}
          </h2>
          {(
            [
              ["newOrders", lang === "ar" ? "طلبات جديدة" : "New orders"],
              ["waiterCalls", lang === "ar" ? "نداء النادل" : "Waiter calls"],
              ["sound", lang === "ar" ? "صوت التنبيه" : "Alert sound"],
              ["daily", lang === "ar" ? "ملخص يومي" : "Daily summary"],
            ] as const
          ).map(([key, label]) => (
            <div key={key} className="flex items-center justify-between gap-3 py-2">
              <span className="text-sm">{label}</span>
              <Switch
                checked={notif[key]}
                onCheckedChange={(v) => setNotification(key, v)}
                aria-label={label}
              />
            </div>
          ))}
        </section>

        <section className="panel flex flex-wrap gap-2 p-5">
          <Button variant="outline" onClick={toggleLang}>
            {t("common.language")}
          </Button>
          <Button variant="destructive" onClick={() => void signOut()}>
            <LogOut className="size-4" />
            {t("nav.signOut")}
          </Button>
        </section>
      </main>
    </div>
  );
}
