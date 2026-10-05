import { ActionMenu } from "@/components/app/ActionMenu";
import { MasterActionSurface } from "@/components/app/MasterPage";
import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, CheckCircle2, Clock3, History, RotateCcw, Save, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { useRestaurant, type RestaurantRow } from "@/hooks/useSuperAdmin";
import { useAccess } from "@/hooks/useSession";
import { useI18n } from "@/lib/i18n";
import { readAppearance } from "@/lib/restaurant-appearance";
import { humanError } from "@/lib/errors";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ImageUploader } from "@/components/media/ImageUploader";
import { cn } from "@/lib/utils";

type DesignVersion = {
  id: string;
  version_number: number;
  status: "draft" | "scheduled" | "published" | "archived" | "cancelled";
  note: string | null;
  scheduled_for: string | null;
  published_at: string | null;
  source: string;
  created_at: string;
};

export function RestaurantAppearance({ restaurantId }: { restaurantId: string }) {
  const restaurant = useRestaurant(restaurantId);
  const access = useAccess();
  if (restaurant.isPending || access.isPending) return <Skeleton className="h-80 rounded-2xl" />;
  if (!access.isSuperAdmin && access.membershipFor(restaurantId)?.role !== "restaurant_admin") return <p>Only restaurant administrators can change appearance.</p>;
  if (!restaurant.data) return <p>{humanError(restaurant.error)}</p>;
  return <AppearanceForm key={`${restaurantId}:${restaurant.data.updated_at}`} restaurant={restaurant.data} />;
}

function AppearanceForm({ restaurant }: { restaurant: RestaurantRow }) {
  const { lang } = useI18n();
  const ar = lang === "ar";
  const qc = useQueryClient();
  const [brand, setBrand] = useState(() => readAppearance(restaurant.menu_theme));
  const [form, setForm] = useState({
    logo_url: restaurant.logo_url,
    cover_image_url: restaurant.cover_image_url,
    primary_color: restaurant.primary_color,
    accent_color: restaurant.accent_color,
    background_color: restaurant.background_color,
    text_color: restaurant.text_color,
    tax_rate: String(restaurant.tax_rate),
    service_charge: String(restaurant.service_charge),
  });
  const [note, setNote] = useState("");
  const [scheduledFor, setScheduledFor] = useState(() => new Date(Date.now() + 60 * 60_000).toISOString().slice(0, 16));
  const field = <K extends keyof typeof form>(key: K, value: typeof form[K]) => setForm((prev) => ({ ...prev, [key]: value }));

  const versions = useQuery<DesignVersion[]>({
    queryKey: ["menu-design-versions", restaurant.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("menu_design_versions")
        .select("id,version_number,status,note,scheduled_for,published_at,source,created_at")
        .eq("restaurant_id", restaurant.id)
        .order("version_number", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as DesignVersion[];
    },
  });

  function validateRates() {
    const tax = Number(form.tax_rate);
    const service = Number(form.service_charge);
    if (![tax, service].every((n) => Number.isFinite(n) && n >= 0 && n <= 100)) throw new Error("Rates must be between 0 and 100%.");
    return { tax, service };
  }

  async function buildSnapshot() {
    const { tax, service } = validateRates();
    const current = await supabase.from("restaurants").select("menu_theme").eq("id", restaurant.id).single();
    if (current.error) throw current.error;
    const theme = current.data.menu_theme && typeof current.data.menu_theme === "object" && !Array.isArray(current.data.menu_theme)
      ? current.data.menu_theme as Record<string, unknown>
      : {};
    const existingWorkspace = theme.workspace && typeof theme.workspace === "object" && !Array.isArray(theme.workspace)
      ? theme.workspace as Record<string, unknown>
      : {};
    const menuTheme = { ...theme, workspace: { ...existingWorkspace, ...brand } };

    return {
      ...form,
      background_color: brand.lightBackground,
      tax_rate: String(tax),
      service_charge: String(service),
      menu_theme: menuTheme,
    };
  }

  async function createDraft() {
    const snapshot = await buildSnapshot();
    const { data, error } = await (supabase as any).rpc("save_menu_design_draft", {
      _restaurant_id: restaurant.id,
      _snapshot: snapshot,
      _note: note.trim() || null,
    });
    if (error) throw error;
    return String(data);
  }

  async function refreshAfterLifecycleChange() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["menu-design-versions", restaurant.id] }),
      qc.invalidateQueries({ queryKey: ["platform"] }),
      qc.invalidateQueries({ queryKey: ["staff", "memberships"] }),
      qc.invalidateQueries({ queryKey: ["diner"] }),
      qc.invalidateQueries({ queryKey: ["pdf-diner"] }),
    ]);
  }

  const saveDraft = useMutation({
    mutationFn: createDraft,
    onSuccess: async () => {
      await refreshAfterLifecycleChange();
      setNote("");
      toast.success(ar ? "تم حفظ نسخة مسودة بدون تغيير القائمة المباشرة" : "Draft version saved without changing the live menu");
    },
    onError: (error) => toast.error(humanError(error, lang)),
  });

  const publishNow = useMutation({
    mutationFn: async () => {
      const versionId = await createDraft();
      const { error } = await (supabase as any).rpc("publish_menu_design_version", { _version_id: versionId });
      if (error) throw error;
      return versionId;
    },
    onSuccess: async () => {
      await refreshAfterLifecycleChange();
      setNote("");
      toast.success(ar ? "تم نشر التصميم وأصبح مباشراً" : "Design published and is now live");
    },
    onError: (error) => toast.error(humanError(error, lang)),
  });

  const schedule = useMutation({
    mutationFn: async () => {
      const publishAt = new Date(scheduledFor);
      if (!Number.isFinite(publishAt.getTime()) || publishAt.getTime() <= Date.now()) throw new Error("Scheduled publish time must be in the future.");
      const versionId = await createDraft();
      const { error } = await (supabase as any).rpc("schedule_menu_design_version", {
        _version_id: versionId,
        _scheduled_for: publishAt.toISOString(),
      });
      if (error) throw error;
      return versionId;
    },
    onSuccess: async () => {
      await refreshAfterLifecycleChange();
      setNote("");
      toast.success(ar ? "تمت جدولة نشر التصميم" : "Design publish scheduled");
    },
    onError: (error) => toast.error(humanError(error, lang)),
  });

  const rollback = useMutation({
    mutationFn: async (versionId: string) => {
      const { error } = await (supabase as any).rpc("rollback_menu_design_version", {
        _version_id: versionId,
        _note: ar ? "استعادة من سجل الإصدارات" : "Rollback from version history",
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      await refreshAfterLifecycleChange();
      toast.success(ar ? "تمت استعادة النسخة ونشرها كإصدار جديد" : "Version restored and published as a new version");
    },
    onError: (error) => toast.error(humanError(error, lang)),
  });

  const deleteVersion = useMutation({
    mutationFn: async (version: DesignVersion) => {
      if (version.status === "published") throw new Error("The live published version cannot be deleted.");
      const confirmed = window.confirm(ar ? `حذف الإصدار v${version.version_number} نهائياً؟` : `Delete version v${version.version_number} permanently?`);
      if (!confirmed) return "cancelled";
      const { error } = await (supabase as any).rpc("delete_menu_design_version", { _version_id: version.id });
      if (error) throw error;
      return "deleted";
    },
    onSuccess: async (result) => {
      if (result !== "deleted") return;
      await refreshAfterLifecycleChange();
      toast.success(ar ? "تم حذف الإصدار" : "Design version deleted");
    },
    onError: (error) => toast.error(humanError(error, lang)),
  });

  const deleteAllVersions = useMutation({
    mutationFn: async () => {
      const confirmed = window.confirm(
        ar
          ? "حذف كل الإصدارات غير المباشرة نهائياً؟ سيبقى الإصدار المباشر الحالي محفوظاً."
          : "Delete all non-live design versions permanently? The current live version will be kept.",
      );
      if (!confirmed) return false;
      const { error } = await (supabase as any).rpc("delete_all_menu_design_versions", {
        _restaurant_id: restaurant.id,
      });
      if (error) throw error;
      return true;
    },
    onSuccess: async (deleted) => {
      if (!deleted) return;
      await refreshAfterLifecycleChange();
      toast.success(ar ? "تم حذف سجل الإصدارات" : "Design history deleted");
    },
    onError: (error) => toast.error(humanError(error, lang)),
  });

  const cancelSchedule = useMutation({
    mutationFn: async (versionId: string) => {
      const { error } = await (supabase as any).rpc("cancel_scheduled_menu_design", { _version_id: versionId });
      if (error) throw error;
    },
    onSuccess: refreshAfterLifecycleChange,
    onError: (error) => toast.error(humanError(error, lang)),
  });

  function submitPublish(event: FormEvent) {
    event.preventDefault();
    publishNow.mutate();
  }

  const busy = saveDraft.isPending || publishNow.isPending || schedule.isPending || rollback.isPending || cancelSchedule.isPending || deleteVersion.isPending || deleteAllVersions.isPending;

  return (
    <form onSubmit={submitPublish} className="qs-menu-appearance grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0 space-y-3">
        <section className="panel qs-menu-brand-editor p-4 sm:p-5">
          <h3 className="text-lg font-semibold">{ar ? "هوية المطعم" : "Brand identity"}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{ar ? "خصص شعارك وصورة الغلاف والألوان ثم احفظ مسودة أو انشر." : "Make your menu feel like your restaurant. Save a draft or publish when ready."}</p>
          <div className="qs-menu-upload-grid mt-5 grid gap-5 sm:grid-cols-[140px_minmax(0,1fr)]">
            <ImageUploader restaurantId={restaurant.id} kind="logo" value={form.logo_url} onChange={(url) => field("logo_url", url)} label={ar ? "شعار المطعم" : "Restaurant logo"} retainRemovedFile />
            <ImageUploader restaurantId={restaurant.id} kind="cover" value={form.cover_image_url} onChange={(url) => field("cover_image_url", url)} label={ar ? "صورة الغلاف" : "Cover image"} aspect="wide" retainRemovedFile />
          </div>
          <div className="mt-5 border-t pt-4">
            <h4 className="text-sm font-semibold">{ar ? "ألوان القائمة العادية" : "Standard menu colors"}</h4>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {([{key:"primary", en:"Brand", ar:"الهوية"}, {key:"accent", en:"Accent", ar:"الثانوي"}, {key:"bg", en:"Background", ar:"الخلفية"}, {key:"text", en:"Text", ar:"النص"}] as const).map((color) => {
                const paletteKey = brand.guestMenuMode === "dark" ? "guestMenuDark" : "guestMenuLight";
                return <label key={color.key} className="qs-menu-color-field"><span>{ar ? color.ar : color.en}</span><div><input type="color" aria-label={ar ? color.ar : color.en} value={brand[paletteKey][color.key]} onChange={(e) => setBrand((prev) => ({...prev, [paletteKey]: {...prev[paletteKey], [color.key]: e.target.value}}))} /><small>{brand[paletteKey][color.key].toUpperCase()}</small></div></label>;
              })}
            </div>
          </div>
          <details className="qs-menu-home-dashboard mt-5 border-t pt-4">
            <summary className="cursor-pointer text-sm font-semibold">{ar ? "الرئيسية ولوحة التحكم" : "Home & dashboard"}</summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="space-y-2 text-sm"><span>{ar ? "عنوان الرئيسية" : "Home heading"}</span><Input maxLength={100} value={brand.homeTitle} placeholder={restaurant.name} onChange={(e) => setBrand((p) => ({ ...p, homeTitle: e.target.value }))} /></label>
              <label className="space-y-2 text-sm"><span>{ar ? "عنوان لوحة التحكم" : "Dashboard heading"}</span><Input maxLength={100} value={brand.dashboardTitle} placeholder={restaurant.name} onChange={(e) => setBrand((p) => ({ ...p, dashboardTitle: e.target.value }))} /></label>
            </div>
          </details>
        </section>

        <section className="panel space-y-2.5 p-4">
          <h3 className="font-semibold">{ar ? "إدارة النشر" : "Publishing"}</h3>
          <Input maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder={ar ? "ملاحظة للإصدار (اختياري)" : "Version note (optional)"} />
          <div className="flex items-center gap-2"><ActionMenu ar={ar} label={ar?"خيارات النشر":"Publishing options"} actions={[{label:ar?"حفظ مسودة":"Save Draft",icon:Save,disabled:busy,onSelect:()=>saveDraft.mutate()}]}/>
          <Button className="min-h-10 w-full bg-[#e85d2a] text-white hover:bg-[#e94f00]" disabled={busy} type="submit"><Send className="size-4" />{publishNow.isPending ? (ar ? "جارٍ النشر…" : "Publishing…") : (ar ? "نشر الآن" : "Publish Now")}</Button></div>
          <details className="rounded-xl border border-dashed p-3"><summary className="cursor-pointer text-xs font-semibold">{ar ? "نشر مجدول" : "Scheduled publish"}</summary>
            <label className="text-xs font-semibold">{ar ? "نشر مجدول" : "Scheduled publish"}<Input type="datetime-local" className="mt-2" value={scheduledFor} onChange={(e) => setScheduledFor(e.target.value)} /></label>
            <Button type="button" variant="outline" className="mt-2 w-full" disabled={busy} onClick={() => schedule.mutate()}><CalendarClock className="size-4" />{ar ? "جدولة النشر" : "Schedule Publish"}</Button>
          </details>
          <p className="text-[10px] leading-4 text-muted-foreground">{ar ? "حفظ المسودة لا يغيّر القائمة المباشرة. النشر فقط هو الذي يحدّث تجربة الضيف." : "Saving a draft never changes the live menu. Only publishing updates the diner experience."}</p>
        </section>
        <section className="panel p-3.5 sm:p-4">
          <div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2"><History className="size-4 text-[#e85d2a]" /><h3 className="text-lg font-semibold">{ar ? "سجل إصدارات التصميم" : "Design version history"}</h3></div><Button type="button" size="sm" variant="ghost" className="text-destructive hover:bg-destructive/10 hover:text-destructive" disabled={busy || (versions.data ?? []).every((version) => version.status === "published")} onClick={() => deleteAllVersions.mutate()}><Trash2 className="size-3" />{ar ? "حذف الكل" : "Delete all"}</Button></div>
          <p className="mt-1 text-xs text-muted-foreground">{ar ? "يمكنك استعادة أي إصدار سابق بدون حذف التاريخ." : "Restore any prior version without deleting history."}</p>
          {versions.isPending ? <Skeleton className="mt-4 h-52 rounded-xl" /> : versions.isError ? <p className="mt-4 text-sm text-destructive">{humanError(versions.error, lang)}</p> : (
            <div className="mt-3 max-h-[260px] divide-y divide-border overflow-y-auto pe-1">
              {(versions.data ?? []).map((version) => (
                <div key={version.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <strong className="text-sm">v{version.version_number}</strong>
                      <span className={cn(
                        "rounded-full px-2 py-1 text-[9px] font-bold capitalize",
                        version.status === "published" ? "bg-emerald-500/10 text-emerald-700"
                          : version.status === "scheduled" ? "bg-blue-500/10 text-blue-700"
                          : version.status === "draft" ? "bg-amber-500/10 text-amber-700"
                          : "bg-muted text-muted-foreground",
                      )}>
                        {version.status === "published" ? <CheckCircle2 className="me-1 inline size-3" /> : version.status === "scheduled" ? <Clock3 className="me-1 inline size-3" /> : null}
                        {version.status}
                      </span>
                    </div>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {version.note || (ar ? "بدون ملاحظة" : "No note")}
                      {" · "}
                      {new Date(version.created_at).toLocaleString(ar ? "ar-JO" : "en-US")}
                    </p>
                    {version.scheduled_for ? <p className="mt-1 text-[10px] text-blue-700">{ar ? "موعد النشر: " : "Publishes: "}{new Date(version.scheduled_for).toLocaleString(ar ? "ar-JO" : "en-US")}</p> : null}
                  </div>
                  <MasterActionSurface threshold={1} className="flex flex-wrap gap-2">
                    {version.status === "scheduled" ? <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => cancelSchedule.mutate(version.id)}>{ar ? "إلغاء الجدولة" : "Unschedule"}</Button> : null}
                    {version.status === "archived" || version.status === "published" ? <Button type="button" size="sm" variant="outline" disabled={busy || version.status === "published"} onClick={() => rollback.mutate(version.id)}><RotateCcw className="size-3" />{ar ? "استعادة" : "Restore"}</Button> : null}
                    {version.status !== "published" ? <Button type="button" size="sm" variant="ghost" className="text-destructive hover:bg-destructive/10 hover:text-destructive" disabled={busy} onClick={() => deleteVersion.mutate(version)}><Trash2 className="size-3" />{ar ? "حذف" : "Delete"}</Button> : null}
                  </MasterActionSurface>
                </div>
              ))}
              {(versions.data ?? []).length === 0 ? <p className="py-8 text-center text-xs text-muted-foreground">{ar ? "لا توجد إصدارات بعد" : "No design versions yet"}</p> : null}
            </div>
          )}
        </section>
      </div>

      <aside className="min-w-0 space-y-3 xl:sticky xl:top-20 xl:self-start">
        <section className="panel overflow-hidden">
          <div className="flex items-center justify-between border-b px-4 py-3"><h3 className="text-sm font-semibold">{ar ? "معاينة الهوية" : "Brand preview"}</h3><span className="text-[10px] text-muted-foreground">{ar ? "مسودة" : "Draft"}</span></div>
          <div className="qs-menu-draft-preview" style={{backgroundColor: brand[brand.guestMenuMode === "dark" ? "guestMenuDark" : "guestMenuLight"].bg, color: brand[brand.guestMenuMode === "dark" ? "guestMenuDark" : "guestMenuLight"].text}}>
            <div className="qs-menu-brand-preview" style={form.cover_image_url ? { backgroundImage: `linear-gradient(180deg,rgba(13,12,10,.08),rgba(13,12,10,.62)),url(${form.cover_image_url})` } : undefined}>
              <span className="qs-menu-brand-preview-badge">{ar ? "معاينة مباشرة" : "Live preview"}</span>
              <div>{form.logo_url ? <img src={form.logo_url} alt="" className="mb-3 size-12 rounded-lg bg-white object-contain p-1" /> : null}<strong>{restaurant.name}</strong><small>{ar ? restaurant.description_ar : restaurant.description_en}</small></div>
            </div>
            <div className="space-y-3 p-4"><h4 className="font-semibold">{ar ? "مرحباً بضيوفنا" : "Welcome to our menu"}</h4><div className="h-2 w-3/4 rounded-full bg-current opacity-10"/><div className="h-2 w-1/2 rounded-full bg-current opacity-10"/><span className="inline-block rounded-lg px-4 py-2 text-xs font-semibold" style={{backgroundColor:brand[brand.guestMenuMode === "dark" ? "guestMenuDark" : "guestMenuLight"].primary,color:brand[brand.guestMenuMode === "dark" ? "guestMenuDark" : "guestMenuLight"].primaryText}}>{ar ? "استكشف القائمة" : "Explore menu"}</span><p className="text-[10px] opacity-60">{ar ? "معاينة للهوية فقط. افتح معاينة القائمة للاطلاع على المنتجات." : "Brand preview only. Open Preview Menu to see your products."}</p></div>
          </div>
        </section>

        <section className="panel space-y-3 p-4">
          <h3 className="font-semibold">{ar ? "نوع قائمة الضيف" : "Guest menu type"}</h3>
          <p className="text-sm leading-6 text-muted-foreground">{ar ? "اختر القائمة العادية أو PDF. تبقى البيانات منفصلة ومحفوظة." : "Choose Standard Menu or Clickable PDF. Both data sets remain separate and preserved."}</p>
          {(["pdf","products"] as const).map((mode) => <label key={mode} className="flex min-h-10 cursor-pointer items-center gap-2.5 rounded-[10px] border p-2.5 text-sm"><input type="radio" name="menuMode" checked={brand.menuMode === mode} onChange={() => setBrand((p) => ({ ...p, menuMode: mode }))} /><span>{mode === "pdf" ? (ar ? "قائمة PDF التفاعلية" : "Clickable PDF Menu") : (ar ? "القائمة العادية" : "Standard Menu")}</span></label>)}
        </section>

        <section className="panel space-y-3 p-4">
          <h3 className="font-semibold">{ar ? "الضرائب والخدمة" : "Tax & service"}</h3>
          <label className="block space-y-2 text-sm"><span>{ar ? "الضريبة %" : "Tax %"}</span><Input required type="number" min="0" max="100" step="0.01" value={form.tax_rate} onChange={(e) => field("tax_rate", e.target.value)} /></label>
          <label className="block space-y-2 text-sm"><span>{ar ? "الخدمة %" : "Service %"}</span><Input required type="number" min="0" max="100" step="0.01" value={form.service_charge} onChange={(e) => field("service_charge", e.target.value)} /></label>
        </section>


      </aside>
    </form>
  );
}
