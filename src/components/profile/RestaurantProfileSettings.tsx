import { GpsAttendanceSettings } from "./GpsAttendanceSettings";
import { capturePunchLocation } from "@/lib/geofence";
import { WorkspaceNavigation } from "@/components/profile/WorkspaceNavigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Save, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";

import {
  AppearancePreferences,
  LanguagePreference,
} from "@/components/profile/AppearancePreferences";
import { ProfileSwitch } from "@/components/profile/NotificationSettings";
import { ApplicationColorStudio } from "@/components/manage/ApplicationColorStudio";
import { ImageUploader } from "@/components/media/ImageUploader";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { useAccess } from "@/hooks/useSession";
import { useRestaurant } from "@/hooks/useSuperAdmin";
import { supabase } from "@/integrations/supabase/client";
import { humanError } from "@/lib/errors";
import { useI18n } from "@/lib/i18n";
import {
  readThemePreference,
  setThemePreference,
  type ThemePreference,
} from "@/lib/theme-preference";
import { readAppearance } from "@/lib/restaurant-appearance";

const SIDEBAR_TOOL_CHOICES = [
  { key: "orders", en: "Orders", ar: "الطلبات" },
  { key: "reservations", en: "Reservations", ar: "الحجوزات" },
  { key: "menu", en: "Menu", ar: "القائمة" },
  { key: "tables", en: "Tables", ar: "الطاولات" },
  { key: "my-work", en: "My Work", ar: "عملي" },
  { key: "shifts", en: "Shifts", ar: "الورديات" },
  { key: "automation", en: "Automation", ar: "الأتمتة" },
  { key: "erp", en: "ERP", ar: "ERP" },
  { key: "analytics", en: "Analytics", ar: "التحليلات" },
  { key: "daily-close", en: "Daily Close", ar: "إقفال اليوم" },
  { key: "team", en: "Team", ar: "الفريق" },
  { key: "guests", en: "Guests", ar: "الضيوف" },
  { key: "campaigns", en: "Campaigns", ar: "الحملات" },
  { key: "connect", en: "Connect", ar: "التكاملات" },
  { key: "devices", en: "Devices", ar: "الأجهزة" },
] as const;
const DEFAULT_SIDEBAR_TOOLS = ["orders", "reservations", "menu", "team", "analytics"] as const;

export function RestaurantProfileSettings({ restaurantId }: { restaurantId: string }) {
  const { lang } = useI18n();
  const ar = lang === "ar";
  const access = useAccess();
  const restaurant = useRestaurant(restaurantId);
  const qc = useQueryClient();
  const canEdit =
    access.isSuperAdmin || access.membershipFor(restaurantId)?.role === "restaurant_admin";

  if (restaurant.isPending || access.isPending)
    return <Skeleton className="h-[520px] rounded-2xl" />;
  if (!canEdit || !restaurant.data) return null;

  const item = restaurant.data;
  return (
    <RestaurantProfileSettingsForm
      key={`${restaurantId}:${item.updated_at}`}
      restaurant={item}
      ar={ar}
      lang={lang}
      qc={qc}
    />
  );
}

function RestaurantProfileSettingsForm({
  restaurant,
  ar,
  lang,
  qc,
}: {
  restaurant: any;
  ar: boolean;
  lang: "ar" | "en";
  qc: ReturnType<typeof useQueryClient>;
}) {
  const [brand, setBrand] = useState(() => readAppearance(restaurant.menu_theme));
  const [themePreference, setTheme] = useState<ThemePreference>("light");
  const [savedTheme, setSavedTheme] = useState<ThemePreference>("light");
  useEffect(() => {
    const initial = readThemePreference();
    setTheme(initial);
    setSavedTheme(initial);
  }, []);
  const initialForm = {
    contact_email:
      typeof restaurant.menu_theme?.contact_email === "string"
        ? restaurant.menu_theme.contact_email
        : "",
    latitude: restaurant.latitude == null ? "" : String(restaurant.latitude),
    longitude: restaurant.longitude == null ? "" : String(restaurant.longitude),
    geofence_radius_meters: restaurant.geofence_radius_meters ?? 100,
    name: restaurant.name as string,
    timezone: restaurant.timezone as string,
    logo_url: restaurant.logo_url as string | null,
    cover_image_url: restaurant.cover_image_url as string | null,
    primary_color: restaurant.primary_color as string,
    accent_color: restaurant.accent_color as string,
  };
  const [form, setForm] = useState(initialForm);
  const [locating, setLocating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [advancedTab, setAdvancedTab] = useState("navigation");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const advancedBody = useRef<HTMLDivElement>(null);
  const field = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((current) => ({ ...current, [key]: value }));
  const pinnedSidebarTools = brand.sidebarPinnedTools;
  const setPinnedSidebarTools = (items: string[]) =>
    setBrand((current) => ({ ...current, sidebarPinnedTools: items.slice(0, 5) }));

  async function save(event: FormEvent) {
    event.preventDefault();
    if (Boolean(form.latitude) !== Boolean(form.longitude)) {
      toast.error(ar ? "أدخل الإحداثيين معاً" : "Enter both coordinates");
      return;
    }
    setSaving(true);
    try {
      const current = await supabase
        .from("restaurants")
        .select("menu_theme")
        .eq("id", restaurant.id)
        .single();
      if (current.error) throw current.error;
      const theme =
        current.data.menu_theme &&
        typeof current.data.menu_theme === "object" &&
        !Array.isArray(current.data.menu_theme)
          ? (current.data.menu_theme as Record<string, unknown>)
          : {};
      const workspace =
        theme.workspace && typeof theme.workspace === "object" && !Array.isArray(theme.workspace)
          ? (theme.workspace as Record<string, unknown>)
          : {};
      const menuTheme = {
        ...theme,
        contact_email: form.contact_email.trim(),
        workspace: { ...workspace, ...brand },
      };
      const { data, error } = await supabase
        .from("restaurants")
        .update({
          latitude: form.latitude === "" ? null : Number(form.latitude),
          longitude: form.longitude === "" ? null : Number(form.longitude),
          geofence_radius_meters: form.geofence_radius_meters,
          name: form.name.trim(),
          timezone: form.timezone,
          logo_url: form.logo_url,
          cover_image_url: form.cover_image_url,
          primary_color: form.primary_color,
          accent_color: form.accent_color,
          background_color: brand.lightBackground,
          menu_theme: menuTheme,
        })
        .eq("id", restaurant.id)
        .select("id")
        .single();
      if (error) throw error;
      if (!data) throw new Error("No organization settings were updated");
      setThemePreference(themePreference);
      setSavedTheme(themePreference);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["platform"] }),
        qc.invalidateQueries({ queryKey: ["staff", "memberships"] }),
        qc.invalidateQueries({ queryKey: ["diner"] }),
        qc.invalidateQueries({ queryKey: ["pdf-diner"] }),
      ]);
      toast.success(
        ar ? "تم حفظ إعدادات المؤسسة والمظهر" : "Organization and appearance settings saved",
      );
    } catch (error) {
      toast.error(humanError(error, lang));
    } finally {
      setSaving(false);
    }
  }

  const colors = ["#ff5a1f", "#ef4444", "#287de8", "#16a56d", "#7c4dc4", "#e85a93"];
  const validColor = [
    form.primary_color,
    form.accent_color,
    brand.selectedNavColor,
    brand.topNavBackground,
    brand.topNavText,
    brand.sidebarBackground,
    brand.sidebarText,
    brand.lightBackground,
    brand.darkPrimaryColor,
    brand.darkAccentColor,
    brand.darkSelectedNavColor,
    brand.darkTopNavBackground,
    brand.darkTopNavText,
    brand.darkSidebarBackground,
    brand.darkSidebarText,
    brand.darkBackground,
  ].every((value) => /^#[0-9a-f]{6}$/i.test(value));
  const zones = Array.from(
    new Set([
      form.timezone,
      "Asia/Amman",
      "Asia/Riyadh",
      "Asia/Dubai",
      "Asia/Beirut",
      "Europe/London",
      "America/New_York",
      "UTC",
    ]),
  );
  return (
    <form
      id="organization-settings-form"
      onSubmit={save}
      onReset={() => {
        setTheme(savedTheme);
        setForm(initialForm);
        setBrand(readAppearance(restaurant.menu_theme));
      }}
      className="ps-organization-form space-y-4"
    >
      <div className="ps-org-grid simple-org-panel">
        <section className="simple-preference-section">
          <h2>{ar ? "تفاصيل المؤسسة" : "Organization details"}</h2>
          <div className="simple-org-fields">
            <label className="ps-field">
              {ar ? "اسم المطعم" : "Restaurant name"}
              <input
                required
                maxLength={120}
                value={form.name}
                onChange={(e) => field("name", e.target.value)}
              />
            </label>
            <label className="ps-field">
              {ar ? "بريد التواصل" : "Contact email"}
              <input
                type="email"
                maxLength={254}
                value={form.contact_email}
                onChange={(e) => field("contact_email", e.target.value)}
              />
            </label>
          </div>
        </section>
        <section className="simple-preference-section">
          <h2>{ar ? "الهوية" : "Branding"}</h2>
          <div className="simple-org-fields">
            <div className="ps-upload-logo">
              <ImageUploader
                restaurantId={restaurant.id}
                kind="logo"
                directUpload
                value={form.logo_url}
                onChange={(value) => field("logo_url", value)}
                label={ar ? "شعار المطعم" : "Restaurant logo"}
                retainRemovedFile
              />
            </div>
            <label className="ps-field">
              {ar ? "لون الهوية" : "Brand color"}
              <span className="simple-brand-color">
                <input
                  type="color"
                  aria-label={ar ? "لون الهوية" : "Brand color"}
                  value={
                    /^#[0-9a-f]{6}$/i.test(form.primary_color) ? form.primary_color : "#ff5a1f"
                  }
                  onChange={(e) => field("primary_color", e.target.value)}
                />
                <input
                  aria-label={ar ? "رمز اللون" : "Brand color hex"}
                  required
                  pattern="#[0-9a-fA-F]{6}"
                  maxLength={7}
                  value={form.primary_color}
                  onChange={(e) => field("primary_color", e.target.value)}
                />
              </span>
            </label>
          </div>
        </section>
        <section className="simple-preference-section">
          <h2>{ar ? "مظهر مساحة العمل" : "Workspace appearance"}</h2>
          <AppearancePreferences ar={ar} value={themePreference} onChange={setTheme} />
          {(
            [
              [
                "navigation",
                ar ? "التنقل" : "Navigation",
                ar ? "اختر تخطيط مساحة العمل." : "Choose your workspace layout.",
              ],
              [
                "colors",
                ar ? "الألوان" : "Colors",
                ar ? "خصص ألوان الواجهة." : "Adjust interface colors.",
              ],
              [
                "images",
                ar ? "صور الواجهة" : "Interface images",
                ar ? "صور الأدوات وبطاقات القائمة." : "Workspace tools and menu card images.",
              ],
            ] as const
          ).map(([tab, title, help]) => (
            <button
              key={tab}
              type="button"
              className="simple-disclosure"
              aria-haspopup="dialog"
              onClick={() => {
                setAdvancedTab(tab);
                setAdvancedOpen(true);
              }}
            >
              <span>
                <strong>{title}</strong>
                <small>{help}</small>
              </span>
              <ChevronRight />
            </button>
          ))}
        </section>
        <details className="simple-advanced">
          <summary>{ar ? "إعدادات إضافية" : "Additional settings"}</summary>
          <div className="simple-preference-section">
            <h3>{ar ? "الإعدادات الإقليمية" : "Regional settings"}</h3>
            <LanguagePreference ar={ar} />
            <label className="ps-field">
              {ar ? "المنطقة الزمنية" : "Time zone"}
              <select value={form.timezone} onChange={(e) => field("timezone", e.target.value)}>
                {zones.map((zone) => (
                  <option key={zone} value={zone}>
                    {zone}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="simple-preference-section ps-upload-cover">
            <ImageUploader
              restaurantId={restaurant.id}
              kind="cover"
              aspect="wide"
              value={form.cover_image_url}
              onChange={(value) => field("cover_image_url", value)}
              label={ar ? "غلاف المطعم" : "Restaurant cover"}
              retainRemovedFile
            />
          </div>
          <div className="simple-setting-row">
            <span>{ar ? "استخدام شعار المؤسسة" : "Use organization logo"}</span>
            <ProfileSwitch
              label={ar ? "استخدام شعار المؤسسة" : "Use organization logo"}
              checked={!brand.useQuickServeLogo}
              onChange={(value) =>
                setBrand((current) => ({ ...current, useQuickServeLogo: !value }))
              }
            />
          </div>
          <GpsAttendanceSettings
            ar={ar}
            latitude={form.latitude}
            longitude={form.longitude}
            radius={form.geofence_radius_meters}
            locating={locating}
            saving={saving}
            onLatitude={(value) => field("latitude", value)}
            onLongitude={(value) => field("longitude", value)}
            onRadius={(value) => field("geofence_radius_meters", value)}
            onLocate={async () => {
              setLocating(true);
              const location = await capturePunchLocation();
              setLocating(false);
              if (location.latitude == null || location.longitude == null) {
                toast.error(
                  ar
                    ? "تعذر الحصول على الموقع. اسمح بالوصول أو أدخل الإحداثيات يدوياً."
                    : "Location unavailable. Allow access or enter coordinates manually.",
                );
                return;
              }
              setForm((f) => ({
                ...f,
                latitude: String(location.latitude),
                longitude: String(location.longitude),
              }));
            }}
          />
        </details>
      </div>
      <Dialog
        open={advancedOpen}
        onOpenChange={(open) => {
          if (!saving) setAdvancedOpen(open);
        }}
      >
        <DialogContent
          placement="edge"
          className="ps-page ps-advanced-dialog"
          dir={ar ? "rtl" : "ltr"}
        >
          <DialogHeader>
            <DialogTitle>{ar ? "إعدادات مساحة العمل" : "Workspace settings"}</DialogTitle>
            <DialogDescription>
              {ar ? "خصص الصور والتنقل والألوان." : "Customize images, navigation and colors."}
            </DialogDescription>
          </DialogHeader>
          <Tabs
            value={advancedTab}
            dir={ar ? "rtl" : "ltr"}
            className="ps-workspace-tabs"
            onValueChange={(value) => {
              setAdvancedTab(value);
              advancedBody.current?.scrollTo({ top: 0 });
            }}
          >
            <TabsList
              className="ps-workspace-tab-list"
              aria-label={ar ? "أقسام مساحة العمل" : "Workspace sections"}
            >
              <TabsTrigger value="images">{ar ? "الصور" : "Images"}</TabsTrigger>
              <TabsTrigger value="navigation">{ar ? "التنقل" : "Navigation"}</TabsTrigger>
              <TabsTrigger value="colors">{ar ? "الألوان" : "Colors"}</TabsTrigger>
            </TabsList>
            <div className="ps-advanced-body" ref={advancedBody}>
              <TabsContent value="images" className="ps-workspace-panel">
                <h2>{ar ? "صور الواجهة" : "Interface images"}</h2>
                <p className="ps-workspace-help">
                  {ar
                    ? "اختر صور أدوات مساحة العمل وبطاقات القائمة."
                    : "Choose images for workspace tools and menu cards."}
                </p>
                <div className="ps-workspace-images">
                  <ImageUploader
                    restaurantId={restaurant.id}
                    kind="cover"
                    aspect="wide"
                    compact
                    value={brand.workspaceToolsImage}
                    onChange={(value) =>
                      setBrand((current) => ({ ...current, workspaceToolsImage: value }))
                    }
                    label={ar ? "أدوات مساحة العمل" : "Workspace tools"}
                    description={ar ? "صورة لوحة الاختصارات" : "Launcher panel image"}
                  />
                  <ImageUploader
                    restaurantId={restaurant.id}
                    kind="cover"
                    aspect="wide"
                    compact
                    value={brand.standardMenuCardImage}
                    onChange={(value) =>
                      setBrand((current) => ({ ...current, standardMenuCardImage: value }))
                    }
                    label={ar ? "القائمة العادية" : "Standard Menu"}
                    description={ar ? "صورة بطاقة القائمة" : "Menu card image"}
                  />
                  <ImageUploader
                    restaurantId={restaurant.id}
                    kind="cover"
                    aspect="wide"
                    compact
                    value={brand.pdfMenuCardImage}
                    onChange={(value) =>
                      setBrand((current) => ({ ...current, pdfMenuCardImage: value }))
                    }
                    label={ar ? "قائمة PDF" : "PDF Menu"}
                    description={ar ? "صورة بطاقة القائمة" : "Menu card image"}
                  />
                </div>
                <p className="ps-workspace-help">
                  {ar ? "أيقونات القائمة تتبع لون النظام." : "Menu icons follow your system color."}
                </p>
              </TabsContent>
              <TabsContent value="navigation" className="ps-workspace-panel">
                <section className="rounded-xl border border-border p-4 mb-4">
                  <h3 className="font-semibold">{ar ? "حركة التنقل" : "Navigation animation"}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {ar
                      ? "اختر حركة أدوات مساحة العمل وفتح وإغلاق القائمة الجانبية."
                      : "Choose how All Tools and the sidebar open and close."}
                  </p>
                  <label className="mt-3 grid gap-2 text-sm">
                    {ar ? "مستوى الحركة" : "Animation level"}
                    <select
                      className="min-h-11 w-full rounded-lg border border-border bg-background px-3"
                      value={brand.navigationMotion}
                      onChange={(event) =>
                        setBrand((current) => ({
                          ...current,
                          navigationMotion: event.target.value === "reduced" ? "reduced" : "full",
                        }))
                      }
                    >
                      <option value="full">{ar ? "كاملة" : "Full"}</option>
                      <option value="reduced">{ar ? "مخفّضة" : "Reduced"}</option>
                    </select>
                  </label>
                </section>
                <WorkspaceNavigation
                  ar={ar}
                  selected={pinnedSidebarTools}
                  choices={SIDEBAR_TOOL_CHOICES}
                  defaults={DEFAULT_SIDEBAR_TOOLS}
                  onChange={setPinnedSidebarTools}
                />
              </TabsContent>
              <TabsContent value="colors" forceMount className="ps-workspace-panel">
                <ApplicationColorStudio
                  ar={ar}
                  restaurantName={restaurant.name}
                  brand={brand}
                  setBrand={setBrand}
                  primaryColor={form.primary_color}
                  accentColor={form.accent_color}
                  setPrimaryColor={(value) => field("primary_color", value)}
                  setAccentColor={(value) => field("accent_color", value)}
                />
              </TabsContent>
            </div>
          </Tabs>
          <div className="ps-advanced-footer">
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={() => setAdvancedOpen(false)}
            >
              {ar ? "إغلاق" : "Close"}
            </Button>
            <Button
              type="submit"
              form="organization-settings-form"
              disabled={saving || !validColor || !form.name.trim()}
            >
              {saving ? (ar ? "جارٍ الحفظ…" : "Saving…") : ar ? "حفظ التغييرات" : "Save changes"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <div className="ps-actions">
        <small>
          {ar
            ? "تُطبق الهوية والألوان على مساحة هذا المطعم."
            : "Branding and colors apply to this restaurant workspace."}
        </small>
        <button type="reset" className="ps-button" disabled={saving}>
          {ar ? "إلغاء" : "Cancel"}
        </button>
        <Button
          type="submit"
          disabled={saving || !validColor || !form.name.trim()}
          className="ps-button ps-primary"
        >
          <Save className="size-4" />
          {saving ? (ar ? "جارٍ الحفظ…" : "Saving…") : ar ? "حفظ التغييرات" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
