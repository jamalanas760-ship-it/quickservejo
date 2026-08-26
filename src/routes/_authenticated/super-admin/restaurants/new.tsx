import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { humanError } from "@/lib/errors";
import { slugify } from "@/lib/format";
import { logAudit } from "@/lib/audit";
import { useSubscriptionPlans } from "@/hooks/useSuperAdmin";

export const Route = createFileRoute("/_authenticated/super-admin/restaurants/new")({
  head: () => ({
    meta: [
      { title: "Create restaurant — QuickServe admin" },
      {
        name: "description",
        content:
          "Onboard a new restaurant tenant on QuickServe: branding, localization, charges, subscription plan and starter tables.",
      },
      { property: "og:title", content: "Create restaurant — QuickServe admin" },
      {
        property: "og:description",
        content: "Guided onboarding for a new QuickServe restaurant tenant.",
      },
    ],
  }),
  component: NewRestaurantPage,
});

const CURRENCIES = ["SAR", "AED", "KWD", "QAR", "BHD", "OMR", "EGP", "USD", "EUR", "GBP"];
const TIMEZONES = [
  "Asia/Riyadh",
  "Asia/Dubai",
  "Asia/Kuwait",
  "Asia/Qatar",
  "Asia/Bahrain",
  "Africa/Cairo",
  "Europe/London",
  "UTC",
];

type Form = {
  name: string;
  slug: string;
  phone: string;
  email: string;
  address_en: string;
  address_ar: string;
  description_en: string;
  description_ar: string;
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  default_language: string;
  currency: string;
  timezone: string;
  tax_rate: string;
  service_charge: string;
  subscription_plan: string;
  subscription_status: string;
  tableCount: string;
};

const STEP_KEYS = [
  "sa.wizard.basic",
  "sa.wizard.branding",
  "sa.wizard.localization",
  "sa.wizard.charges",
  "sa.wizard.subscription",
  "sa.wizard.setup",
] as const;

function NewRestaurantPage() {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const plans = useSubscriptionPlans();

  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<Form>({
    name: "",
    slug: "",
    phone: "",
    email: "",
    address_en: "",
    address_ar: "",
    description_en: "",
    description_ar: "",
    primary_color: "#111827",
    secondary_color: "#f5f5f4",
    accent_color: "#f59e0b",
    default_language: "en",
    currency: "SAR",
    timezone: "Asia/Riyadh",
    tax_rate: "15",
    service_charge: "0",
    subscription_plan: "free",
    subscription_status: "trialing",
    tableCount: "0",
  });

  const set = <K extends keyof Form>(key: K, value: Form[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const canContinue = step !== 0 || (form.name.trim().length > 1 && form.slug.trim().length > 1);

  async function handleCreate() {
    setBusy(true);
    try {
      const { data: restaurant, error } = await supabase
        .from("restaurants")
        .insert({
          name: form.name.trim(),
          slug: slugify(form.slug || form.name),
          phone: form.phone.trim() || null,
          email: form.email.trim() || null,
          address_en: form.address_en.trim() || null,
          address_ar: form.address_ar.trim() || null,
          description_en: form.description_en.trim() || null,
          description_ar: form.description_ar.trim() || null,
          primary_color: form.primary_color,
          secondary_color: form.secondary_color,
          accent_color: form.accent_color,
          default_language: form.default_language,
          currency: form.currency,
          timezone: form.timezone,
          tax_rate: Number(form.tax_rate) || 0,
          service_charge: Number(form.service_charge) || 0,
          subscription_plan: form.subscription_plan as never,
          subscription_status: form.subscription_status as never,
        })
        .select("id, name, slug")
        .single();
      if (error) throw error;

      // Default operational settings for the new tenant.
      const settings = await supabase
        .from("restaurant_settings")
        .insert({ restaurant_id: restaurant.id });
      if (settings.error) throw settings.error;

      const count = Math.min(Number(form.tableCount) || 0, 200);
      if (count > 0) {
        const tables = Array.from({ length: count }, (_, i) => ({
          restaurant_id: restaurant.id,
          table_number: String(i + 1),
          qr_token: crypto.randomUUID(),
        }));
        const inserted = await supabase.from("restaurant_tables").insert(tables);
        if (inserted.error) throw inserted.error;
      }

      await logAudit("restaurant.created", {
        restaurantId: restaurant.id,
        entity: "restaurants",
        entityId: restaurant.id,
        metadata: { name: restaurant.name, slug: restaurant.slug, tables: count },
      });

      await queryClient.invalidateQueries({ queryKey: ["platform"] });
      toast.success(t("sa.created.title"));
      navigate({
        to: "/super-admin/restaurants/$restaurantId",
        params: { restaurantId: restaurant.id },
      });
    } catch (error) {
      toast.error(humanError(error, lang));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm">
          <Link to="/super-admin/restaurants">← {t("sa.rest.title")}</Link>
        </Button>
        <h1 className="mt-2 text-2xl font-semibold">{t("sa.wizard.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("sa.wizard.step")} {step + 1} {t("sa.wizard.of")} {STEP_KEYS.length} —{" "}
          {t(STEP_KEYS[step]!)}
        </p>
        <Progress className="mt-3" value={((step + 1) / STEP_KEYS.length) * 100} />
      </div>

      <div className="panel space-y-4 p-6">
        {step === 0 && (
          <>
            <Field label={t("sa.field.name")}>
              <Input
                value={form.name}
                onChange={(e) => {
                  set("name", e.target.value);
                  if (!form.slug) set("slug", slugify(e.target.value));
                }}
                required
              />
            </Field>
            <Field label={t("sa.field.slug")} hint="/r/your-restaurant">
              <Input
                value={form.slug}
                onChange={(e) => set("slug", slugify(e.target.value))}
                required
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("sa.field.phone")}>
                <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} />
              </Field>
              <Field label={t("sa.field.email")}>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => set("email", e.target.value)}
                />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("sa.field.addressEn")}>
                <Input value={form.address_en} onChange={(e) => set("address_en", e.target.value)} />
              </Field>
              <Field label={t("sa.field.addressAr")}>
                <Input value={form.address_ar} onChange={(e) => set("address_ar", e.target.value)} />
              </Field>
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <p className="text-sm text-muted-foreground">
              {lang === "ar"
                ? "يمكن رفع الشعار وصورة الغلاف بعد إنشاء المطعم."
                : "Logo and cover image can be uploaded right after the restaurant is created."}
            </p>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label={t("sa.field.primary")}>
                <Input
                  type="color"
                  value={form.primary_color}
                  onChange={(e) => set("primary_color", e.target.value)}
                />
              </Field>
              <Field label={t("sa.field.secondary")}>
                <Input
                  type="color"
                  value={form.secondary_color}
                  onChange={(e) => set("secondary_color", e.target.value)}
                />
              </Field>
              <Field label={t("sa.field.accent")}>
                <Input
                  type="color"
                  value={form.accent_color}
                  onChange={(e) => set("accent_color", e.target.value)}
                />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("sa.field.descEn")}>
                <Textarea
                  value={form.description_en}
                  onChange={(e) => set("description_en", e.target.value)}
                  rows={3}
                />
              </Field>
              <Field label={t("sa.field.descAr")}>
                <Textarea
                  value={form.description_ar}
                  onChange={(e) => set("description_ar", e.target.value)}
                  rows={3}
                />
              </Field>
            </div>
          </>
        )}

        {step === 2 && (
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label={t("sa.field.language")}>
              <Select
                value={form.default_language}
                onValueChange={(v) => set("default_language", v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="ar">العربية</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label={t("sa.field.currency")}>
              <Select value={form.currency} onValueChange={(v) => set("currency", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label={t("sa.field.timezone")}>
              <Select value={form.timezone} onValueChange={(v) => set("timezone", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIMEZONES.map((tz) => (
                    <SelectItem key={tz} value={tz}>
                      {tz}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
        )}

        {step === 3 && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("sa.field.tax")}>
              <Input
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={form.tax_rate}
                onChange={(e) => set("tax_rate", e.target.value)}
              />
            </Field>
            <Field label={t("sa.field.service")}>
              <Input
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={form.service_charge}
                onChange={(e) => set("service_charge", e.target.value)}
              />
            </Field>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("sa.field.plan")}>
                <Select
                  value={form.subscription_plan}
                  onValueChange={(v) => set("subscription_plan", v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["free", "basic", "professional", "enterprise"].map((p) => (
                      <SelectItem key={p} value={p}>
                        {p}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label={t("sa.field.subStatus")}>
                <Select
                  value={form.subscription_status}
                  onValueChange={(v) => set("subscription_status", v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["trialing", "active", "past_due", "cancelled", "suspended"].map((p) => (
                      <SelectItem key={p} value={p}>
                        {p}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
            {plans.data?.find((p) => p.plan === form.subscription_plan) ? (
              <p className="text-xs text-muted-foreground">
                {t("sa.subs.limits")}:{" "}
                {(() => {
                  const p = plans.data.find((x) => x.plan === form.subscription_plan)!;
                  const fmt = (v: number | null) => v ?? t("sa.subs.unlimited");
                  return `${t("sa.stat.activeTables")} ${fmt(p.max_tables)} · ${t("sa.menu.products")} ${fmt(p.max_products)} · ${t("sa.stat.staff")} ${fmt(p.max_staff)}`;
                })()}
              </p>
            ) : null}
          </div>
        )}

        {step === 5 && (
          <div className="space-y-4">
            <p className="text-sm">{t("sa.wizard.createTables")}</p>
            <Field label={t("sa.wizard.tableCount")}>
              <Input
                type="number"
                min="0"
                max="200"
                value={form.tableCount}
                onChange={(e) => set("tableCount", e.target.value)}
              />
            </Field>
            <p className="text-xs text-muted-foreground">
              {lang === "ar"
                ? "سيتم توليد رمز QR فريد لكل طاولة تلقائياً."
                : "A unique QR code is generated automatically for every table."}
            </p>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between">
        <Button variant="ghost" disabled={step === 0 || busy} onClick={() => setStep(step - 1)}>
          {t("sa.wizard.back")}
        </Button>
        {step < STEP_KEYS.length - 1 ? (
          <Button disabled={!canContinue} onClick={() => setStep(step + 1)}>
            {t("sa.wizard.next")}
          </Button>
        ) : (
          <Button disabled={busy} onClick={() => void handleCreate()}>
            {t("sa.wizard.create")}
          </Button>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
