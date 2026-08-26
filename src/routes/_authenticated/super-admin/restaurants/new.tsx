import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
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

const CURRENCIES = ["JOD", "SAR", "AED", "KWD", "QAR", "BHD", "OMR", "EGP", "USD", "EUR", "GBP"];
const TIMEZONES = [
  "Asia/Amman",
  "Asia/Riyadh",
  "Asia/Dubai",
  "Asia/Kuwait",
  "Asia/Qatar",
  "Asia/Bahrain",
  "Africa/Cairo",
  "Europe/London",
  "UTC",
];

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
  wantsTables: "yes" | "no";
  tableCount: string;
};

type Errors = { [K in keyof Form]?: string | undefined };

const STEP_KEYS = [
  "sa.wizard.basic",
  "sa.wizard.branding",
  "sa.wizard.localization",
  "sa.wizard.charges",
  "sa.wizard.subscription",
  "sa.wizard.setup",
] as const;

type Created = { id: string; name: string; slug: string };

function NewRestaurantPage() {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const plans = useSubscriptionPlans();

  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [slugState, setSlugState] = useState<"idle" | "free" | "taken">("idle");
  const [errors, setErrors] = useState<Errors>({});
  const [created, setCreated] = useState<Created | null>(null);
  const [slugTouched, setSlugTouched] = useState(false);
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
    default_language: "ar",
    currency: "JOD",
    timezone: "Asia/Amman",
    tax_rate: "0",
    service_charge: "0",
    subscription_plan: "free",
    subscription_status: "trialing",
    wantsTables: "no",
    tableCount: "5",
  });

  const set = <K extends keyof Form>(key: K, value: Form[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));
  };

  /** Debounced slug availability check — never fires on every keystroke. */
  const slugRef = useRef(form.slug);
  slugRef.current = form.slug;
  useEffect(() => {
    const slug = form.slug.trim();
    setSlugState("idle");
    if (!slug || !SLUG_RE.test(slug)) return;
    const timer = setTimeout(() => {
      void (async () => {
        const { data, error } = await supabase.rpc("restaurant_slug_available", { _slug: slug });
        if (error || slugRef.current.trim() !== slug) return;
        setSlugState(data ? "free" : "taken");
        if (!data) setErrors((prev) => ({ ...prev, slug: t("sa.err.slugTaken") }));
      })();
    }, 600);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.slug]);

  function validateStep(current: number): Errors {
    const next: Errors = {};
    if (current === 0) {
      if (form.name.trim().length < 2) next.name = t("sa.err.nameRequired");
      const slug = form.slug.trim();
      if (!slug) next.slug = t("sa.err.slugRequired");
      else if (!SLUG_RE.test(slug)) next.slug = t("sa.err.slugFormat");
      if (form.email.trim() && !EMAIL_RE.test(form.email.trim())) next.email = t("sa.err.email");
    }
    if (current === 3) {
      const tax = Number(form.tax_rate);
      if (!Number.isFinite(tax) || tax < 0 || tax > 100) next.tax_rate = t("sa.err.tax");
      const svc = Number(form.service_charge);
      if (!Number.isFinite(svc) || svc < 0 || svc > 100)
        next.service_charge = t("sa.err.service");
    }
    if (current === 5 && form.wantsTables === "yes") {
      const count = Number(form.tableCount);
      if (!Number.isInteger(count) || count < 1 || count > 200)
        next.tableCount = t("sa.err.tables");
    }
    return next;
  }

  async function handleNext() {
    const found = validateStep(step);
    if (Object.keys(found).length > 0) {
      setErrors(found);
      return;
    }
    if (step === 0) {
      // Confirm slug uniqueness before advancing (uses the cached result when known).
      if (slugState !== "free") {
        setChecking(true);
        try {
          const { data, error } = await supabase.rpc("restaurant_slug_available", {
            _slug: form.slug.trim(),
          });
          if (error) throw error;
          if (!data) {
            setSlugState("taken");
            setErrors({ slug: t("sa.err.slugTaken") });
            return;
          }
          setSlugState("free");
        } catch (error) {
          toast.error(humanError(error, lang));
          return;
        } finally {
          setChecking(false);
        }
      }
    }
    setErrors({});
    setStep((s) => Math.min(s + 1, STEP_KEYS.length - 1));
  }

  async function handleCreate() {
    for (let i = 0; i < STEP_KEYS.length; i++) {
      const found = validateStep(i);
      if (Object.keys(found).length > 0) {
        setErrors(found);
        setStep(i);
        return;
      }
    }
    setBusy(true);
    try {
      const tableCount = form.wantsTables === "yes" ? Number(form.tableCount) : 0;
      const { data, error } = await supabase.rpc("create_restaurant_with_setup", {
        _payload: {
          name: form.name.trim(),
          slug: form.slug.trim(),
          phone: form.phone.trim(),
          email: form.email.trim(),
          address_en: form.address_en.trim(),
          address_ar: form.address_ar.trim(),
          description_en: form.description_en.trim(),
          description_ar: form.description_ar.trim(),
          primary_color: form.primary_color,
          secondary_color: form.secondary_color,
          accent_color: form.accent_color,
          default_language: form.default_language,
          currency: form.currency,
          timezone: form.timezone,
          tax_rate: String(Number(form.tax_rate) || 0),
          service_charge: String(Number(form.service_charge) || 0),
          subscription_plan: form.subscription_plan,
          subscription_status: form.subscription_status,
        },
        _table_count: tableCount,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) throw new Error("Unable to create restaurant. Please try again.");

      await queryClient.invalidateQueries({ queryKey: ["platform"] });
      toast.success(t("sa.created.title"));
      setCreated({ id: row.id, name: row.name, slug: row.slug });
    } catch (error) {
      if (import.meta.env.DEV) console.error("[create restaurant]", error);
      toast.error(humanError(error, lang));
    } finally {
      setBusy(false);
    }
  }

  if (created) {
    const tables = form.wantsTables === "yes" ? Number(form.tableCount) : 0;
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="panel space-y-4 p-6">
          <h1 className="text-2xl font-semibold">{t("sa.created.title")}</h1>
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <Row label={t("sa.field.name")} value={created.name} />
            <Row label={t("sa.field.slug")} value={`/r/${created.slug}`} />
            <Row label={t("sa.rest.col.status")} value={form.subscription_status} />
            <Row label={t("sa.field.plan")} value={form.subscription_plan} />
          </dl>
          <div>
            <p className="mb-1 text-xs text-muted-foreground">
              {t("sa.created.progress")} — {tables > 0 ? 50 : 25}%
            </p>
            <Progress value={tables > 0 ? 50 : 25} />
          </div>
          <div className="flex flex-wrap gap-2 pt-2">
            <Button asChild>
              <Link
                to="/super-admin/restaurants/$restaurantId"
                params={{ restaurantId: created.id }}
              >
                {t("sa.created.open")}
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link
                to="/super-admin/restaurants/$restaurantId/menu"
                params={{ restaurantId: created.id }}
              >
                {t("sa.created.menu")}
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link
                to="/super-admin/restaurants/$restaurantId/tables"
                params={{ restaurantId: created.id }}
              >
                {t("sa.created.tables")}
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link
                to="/super-admin/restaurants/$restaurantId/tables"
                params={{ restaurantId: created.id }}
              >
                {t("sa.created.qr")}
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link
                to="/super-admin/restaurants/$restaurantId/staff"
                params={{ restaurantId: created.id }}
              >
                {t("sa.created.staff")}
              </Link>
            </Button>
          </div>
        </div>
        <Button variant="ghost" onClick={() => navigate({ to: "/super-admin/restaurants" })}>
          ← {t("sa.rest.title")}
        </Button>
      </div>
    );
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
            <Field label={t("sa.field.name")} error={errors.name}>
              <Input
                value={form.name}
                onChange={(e) => {
                  const value = e.target.value;
                  setErrors((prev) => ({ ...prev, name: undefined }));
                  setForm((prev) => ({
                    ...prev,
                    name: value,
                    slug: slugTouched ? prev.slug : slugify(value),
                  }));
                }}
                aria-invalid={!!errors.name}
              />
            </Field>
            <Field
              label={t("sa.field.slug")}
              hint={
                checking
                  ? t("sa.slug.checking")
                  : slugState === "free"
                    ? t("sa.slug.available")
                    : "/r/your-restaurant"
              }
              error={errors.slug}
            >
              <Input
                value={form.slug}
                onChange={(e) => {
                  setSlugTouched(true);
                  set(
                    "slug",
                    e.target.value
                      .toLowerCase()
                      .replace(/[^a-z0-9-\s]/g, "")
                      .replace(/\s/g, "-"),
                  );
                }}
                aria-invalid={!!errors.slug}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("sa.field.phone")}>
                <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} />
              </Field>
              <Field label={t("sa.field.email")} error={errors.email}>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => set("email", e.target.value)}
                  aria-invalid={!!errors.email}
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
                ? "يمكن رفع الشعار وصورة الغلاف بعد إنشاء المطعم — هذه الخطوة اختيارية."
                : "Logo and cover image can be uploaded right after the restaurant is created — this step is optional."}
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
                  <SelectItem value="ar">العربية</SelectItem>
                  <SelectItem value="en">English</SelectItem>
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
            <Field label={t("sa.field.tax")} error={errors.tax_rate}>
              <Input
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={form.tax_rate}
                onChange={(e) => set("tax_rate", e.target.value)}
                aria-invalid={!!errors.tax_rate}
              />
            </Field>
            <Field label={t("sa.field.service")} error={errors.service_charge}>
              <Input
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={form.service_charge}
                onChange={(e) => set("service_charge", e.target.value)}
                aria-invalid={!!errors.service_charge}
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
            <p className="text-sm font-medium">{t("sa.wizard.createTables")}</p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={form.wantsTables === "yes" ? "default" : "outline"}
                size="sm"
                onClick={() => set("wantsTables", "yes")}
              >
                {t("sa.wizard.yes")}
              </Button>
              <Button
                type="button"
                variant={form.wantsTables === "no" ? "default" : "outline"}
                size="sm"
                onClick={() => set("wantsTables", "no")}
              >
                {t("sa.wizard.no")}
              </Button>
            </div>
            {form.wantsTables === "yes" ? (
              <Field label={t("sa.wizard.tableCount")} error={errors.tableCount}>
                <Input
                  type="number"
                  min="1"
                  max="200"
                  value={form.tableCount}
                  onChange={(e) => set("tableCount", e.target.value)}
                  aria-invalid={!!errors.tableCount}
                />
              </Field>
            ) : null}
            <p className="text-xs text-muted-foreground">
              {lang === "ar"
                ? "سيتم توليد رمز QR فريد لكل طاولة تلقائياً، ويمكن إضافة الطاولات لاحقاً."
                : "A unique QR code is generated automatically for every table. You can also add tables later."}
            </p>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between">
        <Button variant="ghost" disabled={step === 0 || busy} onClick={() => setStep(step - 1)}>
          {t("sa.wizard.back")}
        </Button>
        {step < STEP_KEYS.length - 1 ? (
          <Button disabled={checking} onClick={() => void handleNext()}>
            {checking ? t("sa.slug.checking") : t("sa.wizard.next")}
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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string | undefined;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
      {error ? (
        <p className="text-xs font-medium text-destructive">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
