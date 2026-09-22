import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { ExternalLink, MapPin } from "lucide-react";
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
        content: "Update branding, location, contact details, localization and charges for a tenant.",
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
  google_maps_url: string;
  google_place_id: string;
  latitude: string;
  longitude: string;
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

function validMapsUrl(value: string) {
  if (!value.trim()) return true;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return url.protocol === "https:" && (
      host === "maps.google.com" ||
      host.endsWith(".google.com") ||
      host === "maps.app.goo.gl" ||
      host === "goo.gl"
    );
  } catch {
    return false;
  }
}

function EditRestaurantPage() {
  const { restaurantId } = Route.useParams();
  const { t, lang } = useI18n();
  const queryClient = useQueryClient();
  const { data: restaurant, isPending } = useRestaurant(restaurantId);
  const [form, setForm] = useState<Form | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!restaurant || form) return;
    const extra = restaurant as typeof restaurant & {
      google_maps_url?: string | null;
      google_place_id?: string | null;
      latitude?: number | null;
      longitude?: number | null;
    };
    setForm({
      name: restaurant.name,
      slug: restaurant.slug,
      email: restaurant.email ?? "",
      phone: restaurant.phone ?? "",
      description_en: restaurant.description_en ?? "",
      description_ar: restaurant.description_ar ?? "",
      address_en: restaurant.address_en ?? "",
      address_ar: restaurant.address_ar ?? "",
      google_maps_url: extra.google_maps_url ?? "",
      google_place_id: extra.google_place_id ?? "",
      latitude: extra.latitude == null ? "" : String(extra.latitude),
      longitude: extra.longitude == null ? "" : String(extra.longitude),
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

  const locationQuery = useMemo(() => {
    if (!form) return "";
    const lat = Number(form.latitude);
    const lng = Number(form.longitude);
    if (Number.isFinite(lat) && Number.isFinite(lng) && form.latitude && form.longitude) return `${lat},${lng}`;
    return form.address_en.trim() || form.address_ar.trim() || form.name.trim();
  }, [form]);
  const embedUrl = locationQuery ? `https://www.google.com/maps?q=${encodeURIComponent(locationQuery)}&output=embed` : "";
  const openMapsUrl = form?.google_maps_url.trim() || (locationQuery ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(locationQuery)}${form?.google_place_id.trim() ? `&query_place_id=${encodeURIComponent(form.google_place_id.trim())}` : ""}` : "");

  async function save() {
    if (!form) return;
    if (!validMapsUrl(form.google_maps_url)) {
      toast.error(lang === "ar" ? "أدخل رابط Google Maps صحيح وآمن." : "Enter a valid secure Google Maps URL.");
      return;
    }
    const latitude = form.latitude.trim() === "" ? null : Number(form.latitude);
    const longitude = form.longitude.trim() === "" ? null : Number(form.longitude);
    if ((latitude !== null && (!Number.isFinite(latitude) || latitude < -90 || latitude > 90)) ||
        (longitude !== null && (!Number.isFinite(longitude) || longitude < -180 || longitude > 180))) {
      toast.error(lang === "ar" ? "إحداثيات الموقع غير صحيحة." : "Location coordinates are invalid.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        slug: form.slug.trim(),
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        description_en: form.description_en.trim() || null,
        description_ar: form.description_ar.trim() || null,
        address_en: form.address_en.trim() || null,
        address_ar: form.address_ar.trim() || null,
        google_maps_url: form.google_maps_url.trim() || null,
        google_place_id: form.google_place_id.trim() || null,
        latitude,
        longitude,
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
      };
      const { error } = await (supabase.from("restaurants") as any).update(payload).eq("id", restaurantId);
      if (error) throw error;
      await logAudit("restaurant.updated", { restaurantId, entity: "restaurants", entityId: restaurantId });
      await queryClient.invalidateQueries({ queryKey: ["platform"] });
      toast.success(t("common.saved"));
    } catch (error) {
      toast.error(humanError(error, lang));
    } finally {
      setSaving(false);
    }
  }

  if (isPending || !form) return <Skeleton className="h-96 rounded-xl" />;

  return (
    <form className="space-y-6" onSubmit={(e) => { e.preventDefault(); void save(); }}>
      <section className="panel space-y-4 p-4 sm:p-6">
        <h2 className="font-semibold">{t("sa.wizard.basic")}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("sa.field.name")}><Input value={form.name} onChange={(e) => set("name", e.target.value)} required /></Field>
          <Field label={t("sa.field.slug")}><Input value={form.slug} onChange={(e) => set("slug", e.target.value)} required /></Field>
          <Field label={t("sa.field.email")}><Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} /></Field>
          <Field label={t("sa.field.phone")}><Input value={form.phone} onChange={(e) => set("phone", e.target.value)} /></Field>
          <Field label={t("sa.field.descEn")}><Textarea value={form.description_en} onChange={(e) => set("description_en", e.target.value)} /></Field>
          <Field label={t("sa.field.descAr")}><Textarea dir="rtl" value={form.description_ar} onChange={(e) => set("description_ar", e.target.value)} /></Field>
        </div>
      </section>

      <section className="panel space-y-5 p-4 sm:p-6">
        <div>
          <h2 className="flex items-center gap-2 font-semibold"><MapPin className="size-4 text-[#e85d2a]" />{lang === "ar" ? "موقع الفرع" : "Branch Location"}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{lang === "ar" ? "أضف العنوان ورابط Google Maps. ستظهر المعاينة تلقائياً." : "Add the address and Google Maps link. The map preview updates automatically."}</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("sa.field.addressEn")}><Input value={form.address_en} onChange={(e) => set("address_en", e.target.value)} /></Field>
          <Field label={t("sa.field.addressAr")}><Input dir="rtl" value={form.address_ar} onChange={(e) => set("address_ar", e.target.value)} /></Field>
          <Field label={lang === "ar" ? "رابط Google Maps" : "Google Maps link"}><Input type="url" inputMode="url" placeholder="https://maps.app.goo.gl/..." value={form.google_maps_url} onChange={(e) => set("google_maps_url", e.target.value)} aria-invalid={!validMapsUrl(form.google_maps_url)} /></Field>
          <Field label={lang === "ar" ? "Google Place ID (اختياري)" : "Google Place ID (optional)"}><Input value={form.google_place_id} onChange={(e) => set("google_place_id", e.target.value)} /></Field>
          <Field label={lang === "ar" ? "خط العرض" : "Latitude"}><Input type="number" inputMode="decimal" min="-90" max="90" step="any" placeholder="31.9539" value={form.latitude} onChange={(e) => set("latitude", e.target.value)} /></Field>
          <Field label={lang === "ar" ? "خط الطول" : "Longitude"}><Input type="number" inputMode="decimal" min="-180" max="180" step="any" placeholder="35.9106" value={form.longitude} onChange={(e) => set("longitude", e.target.value)} /></Field>
        </div>
        <div className="overflow-hidden rounded-2xl border border-border bg-muted/30">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card px-4 py-3">
            <div><p className="text-sm font-bold">{lang === "ar" ? "معاينة الموقع" : "Location preview"}</p><p className="text-xs text-muted-foreground">{locationQuery || (lang === "ar" ? "أدخل عنواناً لعرض الخريطة" : "Enter an address to preview the map")}</p></div>
            {openMapsUrl ? <a href={openMapsUrl} target="_blank" rel="noreferrer" className="qs-button-secondary min-h-10"><ExternalLink className="size-4" />{lang === "ar" ? "فتح في Google Maps" : "Open in Google Maps"}</a> : null}
          </div>
          {embedUrl ? <iframe title={lang === "ar" ? "خريطة موقع الفرع" : "Branch location map"} src={embedUrl} className="h-64 w-full border-0 sm:h-80" loading="lazy" referrerPolicy="no-referrer-when-downgrade" /> : <div className="grid h-48 place-items-center text-sm text-muted-foreground"><MapPin className="size-6" /></div>}
        </div>
      </section>

      <section className="panel space-y-4 p-4 sm:p-6">
        <h2 className="font-semibold">{t("sa.wizard.branding")}</h2>
        <div className="grid gap-6 sm:grid-cols-2">
          <ImageUploader restaurantId={restaurantId} kind="logo" value={form.logo_url} onChange={(url) => set("logo_url", url)} label={t("sa.field.logo")} />
          <ImageUploader restaurantId={restaurantId} kind="cover" value={form.cover_image_url} onChange={(url) => set("cover_image_url", url)} label={t("sa.field.cover")} aspect="wide" />
        </div>
        <div className="grid gap-4 sm:grid-cols-4">
          <Field label={t("sa.field.primary")}><Input type="color" value={form.primary_color} onChange={(e) => set("primary_color", e.target.value)} /></Field>
          <Field label={t("sa.field.secondary")}><Input type="color" value={form.secondary_color} onChange={(e) => set("secondary_color", e.target.value)} /></Field>
          <Field label={t("sa.field.accent")}><Input type="color" value={form.accent_color} onChange={(e) => set("accent_color", e.target.value)} /></Field>
          <Field label={t("sa.field.theme")}><Select value={form.theme} onValueChange={(v) => set("theme", v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="light">Light</SelectItem><SelectItem value="dark">Dark</SelectItem></SelectContent></Select></Field>
        </div>
      </section>

      <section className="panel space-y-4 p-4 sm:p-6">
        <h2 className="font-semibold">{t("sa.wizard.localization")}</h2>
        <div className="grid gap-4 sm:grid-cols-4">
          <Field label={t("sa.field.language")}><Select value={form.default_language} onValueChange={(v) => set("default_language", v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="en">English</SelectItem><SelectItem value="ar">العربية</SelectItem></SelectContent></Select></Field>
          <Field label={t("sa.field.currency")}><Input value={form.currency} onChange={(e) => set("currency", e.target.value)} /></Field>
          <Field label={t("sa.field.timezone")}><Input value={form.timezone} onChange={(e) => set("timezone", e.target.value)} /></Field>
          <div className="flex items-end gap-3"><Switch id="active" checked={form.is_active} onCheckedChange={(v) => set("is_active", v)} /><Label htmlFor="active">{t("common.active")}</Label></div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("sa.field.tax")}><Input type="number" min="0" step="0.01" value={form.tax_rate} onChange={(e) => set("tax_rate", e.target.value)} /></Field>
          <Field label={t("sa.field.service")}><Input type="number" min="0" step="0.01" value={form.service_charge} onChange={(e) => set("service_charge", e.target.value)} /></Field>
        </div>
      </section>

      <div className="safe-bottom sticky bottom-0 z-20 -mx-2 flex justify-end border-t border-border bg-background/95 p-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0">
        <Button type="submit" disabled={saving} className="min-h-11 w-full sm:w-auto">{saving ? (lang === "ar" ? "جارٍ الحفظ…" : "Saving…") : t("common.save")}</Button>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">{label}</Label>{children}</div>;
}
