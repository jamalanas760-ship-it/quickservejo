import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { ImageUploader } from "@/components/media/ImageUploader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useRestaurant } from "@/hooks/useSuperAdmin";
import { useI18n } from "@/lib/i18n";
import { humanError } from "@/lib/errors";
import { logAudit } from "@/lib/audit";

export const Route = createFileRoute(
  "/_authenticated/super-admin/restaurants/$restaurantId/edit",
)({
  head: () => ({
    meta: [
      { title: "Edit restaurant — QuickServe admin" },
      {
        name: "description",
        content: "Update branding, contact details, localization and charges for a tenant.",
      },
      { property: "og:title", content: "Edit restaurant — QuickServe admin" },
      {
        property: "og:description",
        content: "Tenant configuration for a QuickServe restaurant.",
      },
    ],
  }),
  component: EditRestaurantPage,
});

type Form = {
  name: string;
  slug: string;
  email: string;
  phone: string;
  description_en: string;
  description_ar: string;
  address_en: string;
  address_ar: string;
  logo_url: string | null;
  cover_image_url: string | null;
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  theme: string;
  default_language: string;
  currency: string;
  timezone: string;
  tax_rate: string;
  service_charge: string;
  is_active: boolean;
};

function EditRestaurantPage() {
  const { restaurantId } = Route.useParams();
  const { t, lang } = useI18n();
  const queryClient = useQueryClient();
  const { data: restaurant, isPending } = useRestaurant(restaurantId);
  const [form, setForm] = useState<Form | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!restaurant || form) return;
    setForm({
      name: restaurant.name,
      slug: restaurant.slug,
      email: restaurant.email ?? "",
      phone: restaurant.phone ?? "",
      description_en: restaurant.description_en ?? "",
      description_ar: restaurant.description_ar ?? "",
      address_en: restaurant.address_en ?? "",
      address_ar: restaurant.address_ar ?? "",
      logo_url: restaurant.logo_url,
      cover_image_url: restaurant.cover_image_url,
      primary_color: restaurant.primary_color,
      secondary_color: restaurant.secondary_color,
      accent_color: restaurant.accent_color,
      theme: restaurant.theme,
      default_language: restaurant.default_language,
      currency: restaurant.currency,
      timezone: restaurant.timezone,
      tax_rate: String(restaurant.tax_rate),
      service_charge: String(restaurant.service_charge),
      is_active: restaurant.is_active,
    });
  }, [restaurant, form]);

  function set<K extends keyof Form>(key: K, value: Form[K]) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  async function save() {
    if (!form) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("restaurants")
        .update({
          name: form.name.trim(),
          slug: form.slug.trim(),
          email: form.email.trim() || null,
          phone: form.phone.trim() || null,
          description_en: form.description_en.trim() || null,
          description_ar: form.description_ar.trim() || null,
          address_en: form.address_en.trim() || null,
          address_ar: form.address_ar.trim() || null,
          logo_url: form.logo_url,
          cover_image_url: form.cover_image_url,
          primary_color: form.primary_color,
          secondary_color: form.secondary_color,
          accent_color: form.accent_color,
          theme: form.theme,
          default_language: form.default_language,
          currency: form.currency,
          timezone: form.timezone,
          tax_rate: Number(form.tax_rate) || 0,
          service_charge: Number(form.service_charge) || 0,
          is_active: form.is_active,
        })
        .eq("id", restaurantId);
      if (error) throw error;
      await logAudit("restaurant.updated", {
        restaurantId,
        entity: "restaurants",
        entityId: restaurantId,
      });
      await queryClient.invalidateQueries({ queryKey: ["platform"] });
      toast.success(t("common.saved"));
    } catch (error) {
      toast.error(humanError(error, lang));
    } finally {
      setSaving(false);
    }
  }

  if (isPending || !form) {
    return <Skeleton className="h-96 rounded-xl" />;
  }

  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <section className="panel space-y-4 p-6">
        <h2 className="font-semibold">{t("sa.wizard.basic")}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("sa.field.name")}>
            <Input value={form.name} onChange={(e) => set("name", e.target.value)} required />
          </Field>
          <Field label={t("sa.field.slug")}>
            <Input value={form.slug} onChange={(e) => set("slug", e.target.value)} required />
          </Field>
          <Field label={t("sa.field.email")}>
            <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
          </Field>
          <Field label={t("sa.field.phone")}>
            <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} />
          </Field>
          <Field label={t("sa.field.descEn")}>
            <Textarea
              value={form.description_en}
              onChange={(e) => set("description_en", e.target.value)}
            />
          </Field>
          <Field label={t("sa.field.descAr")}>
            <Textarea
              dir="rtl"
              value={form.description_ar}
              onChange={(e) => set("description_ar", e.target.value)}
            />
          </Field>
          <Field label={t("sa.field.addressEn")}>
            <Input value={form.address_en} onChange={(e) => set("address_en", e.target.value)} />
          </Field>
          <Field label={t("sa.field.addressAr")}>
            <Input
              dir="rtl"
              value={form.address_ar}
              onChange={(e) => set("address_ar", e.target.value)}
            />
          </Field>
        </div>
      </section>

      <section className="panel space-y-4 p-6">
        <h2 className="font-semibold">{t("sa.wizard.branding")}</h2>
        <div className="grid gap-6 sm:grid-cols-2">
          <ImageUploader
            restaurantId={restaurantId}
            kind="logo"
            value={form.logo_url}
            onChange={(url) => set("logo_url", url)}
            label={t("sa.field.logo")}
          />
          <ImageUploader
            restaurantId={restaurantId}
            kind="cover"
            value={form.cover_image_url}
            onChange={(url) => set("cover_image_url", url)}
            label={t("sa.field.cover")}
            aspect="wide"
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-4">
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
          <Field label={t("sa.field.theme")}>
            <Select value={form.theme} onValueChange={(v) => set("theme", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="light">Light</SelectItem>
                <SelectItem value="dark">Dark</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>
      </section>

      <section className="panel space-y-4 p-6">
        <h2 className="font-semibold">{t("sa.wizard.localization")}</h2>
        <div className="grid gap-4 sm:grid-cols-4">
          <Field label={t("sa.field.language")}>
            <Select value={form.default_language} onValueChange={(v) => set("default_language", v)}>
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
            <Input value={form.currency} onChange={(e) => set("currency", e.target.value)} />
          </Field>
          <Field label={t("sa.field.timezone")}>
            <Input value={form.timezone} onChange={(e) => set("timezone", e.target.value)} />
          </Field>
          <div className="flex items-end gap-3">
            <Switch
              id="active"
              checked={form.is_active}
              onCheckedChange={(v) => set("is_active", v)}
            />
            <Label htmlFor="active">{t("common.active")}</Label>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("sa.field.tax")}>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={form.tax_rate}
              onChange={(e) => set("tax_rate", e.target.value)}
            />
          </Field>
          <Field label={t("sa.field.service")}>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={form.service_charge}
              onChange={(e) => set("service_charge", e.target.value)}
            />
          </Field>
        </div>
      </section>

      <div className="flex justify-end">
        <Button type="submit" disabled={saving}>
          {t("common.save")}
        </Button>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
