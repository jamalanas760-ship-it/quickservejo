import { UtensilsCrossed } from "@/components/nav/QuickServeIcons";
import { lazy, Suspense, useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { BookOpenText, CheckCircle2, ExternalLink, FileText, Image as ImageIcon, Layers3, Moon, Package, Sun, Tags} from "lucide-react";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import { MasterEyebrow, MasterPageHeader } from "@/components/app/MasterPage";
import { Skeleton } from "@/components/ui/skeleton";
import { useRestaurant } from "@/hooks/useSuperAdmin";
import { supabase } from "@/integrations/supabase/client";
import { humanError } from "@/lib/errors";
import { useI18n } from "@/lib/i18n";
import { readAppearance } from "@/lib/restaurant-appearance";
import { cn } from "@/lib/utils";

const PdfEditor = lazy(() => import("./PdfMenuManagerModern").then((module) => ({ default: module.PdfMenuManagerModern })));
const Products = lazy(() => import("./MenuCatalogMaster").then((module) => ({ default: module.MenuCatalogMaster })));
const Appearance = lazy(() => import("./RestaurantAppearance").then((module) => ({ default: module.RestaurantAppearance })));

type Workflow = "standard" | "pdf";
type StandardSection = "design" | "categories" | "products" | "pricing";

export function MasterMenuDesigner({ restaurantId }: { restaurantId: string }) {
  const { lang } = useI18n();
  const ar = lang === "ar";
  const restaurant = useRestaurant(restaurantId);
  const [workflow, setWorkflow] = useState<Workflow>("standard");
  const [section, setSection] = useState<StandardSection>("design");
  const [pdfEditorOpen, setPdfEditorOpen] = useState(false);
  const appearance = readAppearance(restaurant.data?.menu_theme);

  const saveWorkflow = useMutation({
    mutationFn: async (nextWorkflow: Workflow) => {
      return nextWorkflow;
    },
    onMutate: (nextWorkflow) => {
      const previous = workflow;
      setWorkflow(nextWorkflow);
      setPdfEditorOpen(false);
      return { previous };
    },
    onError: (error, _nextWorkflow, context) => {
      setWorkflow(context?.previous ?? "standard");
      toast.error(humanError(error, lang));
    },
    onSuccess: async (nextWorkflow) => {
      toast.success(nextWorkflow === "standard"
        ? (ar ? "تم اختيار القائمة العادية" : "Standard Menu selected")
        : (ar ? "تم اختيار قائمة PDF التفاعلية" : "Clickable PDF Menu selected"));
    },
  });

  const standardSections = [
    { id: "design" as const, icon: ImageIcon, en: "Design & Branding", ar: "التصميم والهوية", hint: ar ? "الشعار وإعدادات المؤسسة" : "Logo and organization settings" },
    { id: "categories" as const, icon: Tags, en: "Categories", ar: "الفئات", hint: ar ? "تنظيم القائمة" : "Organize your menu" },
    { id: "products" as const, icon: Package, en: "Products", ar: "المنتجات", hint: ar ? "إضافة وإدارة المنتجات" : "Add and manage items" },
    { id: "pricing" as const, icon: Tags, en: "Pricing & Options", ar: "الأسعار والخيارات", hint: ar ? "الأسعار والتوفر والتحضير" : "Price, availability and prep" },
  ];

  return (
    <section className="qs-menu-studio-master qs-menu-studio-redesign flex min-h-0 flex-col gap-4">
      <MasterPageHeader
        eyebrow={<MasterEyebrow icon={UtensilsCrossed}>{ar ? "استوديو القائمة" : "Menu Studio"}</MasterEyebrow>}
        title={ar ? "إدارة القائمة" : "Menu Management"}
        description={ar ? "أنشئ وأدر قائمة مطعمك بعناصر جميلة وفئات وأسعار واضحة." : "Create and manage your restaurant menu with beautiful items, categories and pricing."}
        actions={restaurant.data ? <div className="qs-menu-header-actions flex flex-wrap items-center gap-2">
          <span className="qs-live-menu-pill"><i />{ar ? "القائمة مباشرة" : "Live Menu"}</span>
          {workflow === "standard" ? <StandardMenuModeControl restaurant={restaurant.data} /> : null}
          {workflow === "standard"
            ? <Link to="/r/$slug" params={{ slug: restaurant.data.slug }} search={{ preview: "1" as const }} target="_blank" rel="noreferrer" className="qs-menu-preview-button qs-button-secondary"><ExternalLink className="size-4" />{ar ? "معاينة القائمة" : "Preview Menu"}</Link>
            : <Link to="/m/$slug" params={{ slug: restaurant.data.slug }} target="_blank" rel="noreferrer" className="qs-menu-preview-button qs-button-secondary"><ExternalLink className="size-4" />{ar ? "معاينة القائمة" : "Preview Menu"}</Link>}

        </div> : null}
      />

      <div className="qs-menu-workflow-grid grid gap-3 lg:grid-cols-2">
        <button type="button" aria-pressed={workflow === "standard"} disabled={saveWorkflow.isPending} onClick={() => workflow !== "standard" && saveWorkflow.mutate("standard")} className={cn("qs-menu-workflow-card group relative flex min-h-[84px] items-center gap-3 overflow-hidden rounded-[14px] border bg-card px-4 py-3 text-start shadow-[var(--qs-shadow-card)] transition disabled:cursor-wait disabled:opacity-70", workflow === "standard" ? "is-active border-primary/70 bg-primary/[.045]" : "border-border hover:bg-muted/30")}>
          <span className={cn("qs-menu-type-icon relative z-10 grid size-11 shrink-0 place-items-center overflow-hidden rounded-[11px]", workflow === "standard" ? "is-active bg-primary/10 text-primary" : "bg-primary/[.07] text-primary")}><BookOpenText className="size-5" strokeWidth={1.9} /></span>
          <span className="relative z-10 min-w-0 flex-1"><strong className={cn("block text-sm", workflow === "standard" && "text-primary")}>{ar ? "القائمة العادية" : "Standard Menu"}</strong><span className="mt-1 block text-xs text-muted-foreground">{ar ? "أنشئ وخصص قائمتك الإلكترونية" : "Build and customize your menu online"}</span></span>
          {(appearance.standardMenuCardImage ?? restaurant.data?.cover_image_url ?? "/menu-studio-interior.webp") ? <span className="qs-menu-workflow-image" style={{ backgroundImage: `linear-gradient(90deg,transparent,rgba(255,255,255,.08)),url(${appearance.standardMenuCardImage ?? restaurant.data?.cover_image_url ?? "/menu-studio-interior.webp"})` }} /> : null}
          {workflow === "standard" ? <CheckCircle2 className="relative z-10 size-5 shrink-0 text-primary" /> : null}
        </button>
        <button type="button" aria-pressed={workflow === "pdf"} disabled={saveWorkflow.isPending} onClick={() => workflow !== "pdf" && saveWorkflow.mutate("pdf")} className={cn("qs-menu-workflow-card group relative flex min-h-[84px] items-center gap-3 overflow-hidden rounded-[14px] border bg-card px-4 py-3 text-start shadow-[var(--qs-shadow-card)] transition disabled:cursor-wait disabled:opacity-70", workflow === "pdf" ? "is-active border-primary/70 bg-primary/[.045]" : "border-border hover:bg-muted/30")}>
          <span className={cn("qs-menu-type-icon relative z-10 grid size-11 shrink-0 place-items-center overflow-hidden rounded-[11px]", workflow === "pdf" ? "is-active bg-primary/10 text-primary" : "bg-primary/[.07] text-primary")}><FileText className="size-5" strokeWidth={1.9} /></span>
          <span className="relative z-10 min-w-0 flex-1"><strong className={cn("block text-sm", workflow === "pdf" && "text-primary")}>{ar ? "قائمة PDF تفاعلية" : "Clickable PDF"}</strong><span className="mt-1 block text-xs text-muted-foreground">{ar ? "ارفع قائمة PDF تفاعلية" : "Upload a clickable PDF menu"}</span></span>
          {(appearance.pdfMenuCardImage ?? appearance.standardMenuCardImage ?? restaurant.data?.cover_image_url ?? "/menu-studio-interior.webp") ? <span className="qs-menu-workflow-image" style={{ backgroundImage: `linear-gradient(90deg,transparent,rgba(255,255,255,.08)),url(${appearance.pdfMenuCardImage ?? appearance.standardMenuCardImage ?? restaurant.data?.cover_image_url ?? "/menu-studio-interior.webp"})` }} /> : null}
          {workflow === "pdf" ? <CheckCircle2 className="relative z-10 size-5 shrink-0 text-primary" /> : null}
        </button>
      </div>

      <div className="min-h-0 min-w-0"><Suspense fallback={<Skeleton className="h-full rounded-xl" />}>
        {workflow === "pdf" ? (pdfEditorOpen ? <PdfEditor restaurantId={restaurantId} /> : (
          <div className="qs-card flex h-full min-h-[240px] flex-col items-center justify-center gap-4 p-6 text-center">
            <span className="grid size-12 place-items-center rounded-xl bg-orange-100 text-[#cf4818] dark:bg-orange-950/30"><FileText className="size-5" /></span>
            <div className="max-w-md">
              <h2 className="font-display text-lg font-bold">{ar ? "تم اختيار قائمة PDF التفاعلية" : "Clickable PDF Menu selected"}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{ar ? "افتح محرر PDF عندما تكون جاهزاً لرفع الملف وتحديد المناطق القابلة للنقر. تبقى منتجات القائمة العادية منفصلة." : "Open the PDF editor when you're ready to upload the file and mark clickable areas. Standard Menu products stay separate."}</p>
            </div>
            <button type="button" onClick={() => setPdfEditorOpen(true)} className="qs-button-primary"><FileText className="size-4" />{ar ? "فتح محرر PDF" : "Open PDF editor"}</button>
          </div>
        )) : (
          <div className="qs-menu-studio-workspace grid min-h-0 min-w-0 gap-4">
            <aside className="qs-menu-studio-nav qs-card min-w-0 overflow-hidden">
              <nav aria-label={ar ? "أقسام القائمة" : "Menu sections"} className="qs-menu-tab-rail">
                {standardSections.map(({ id, icon: Icon, en, ar: arabic }) => (
                  <button key={id} type="button" onClick={() => setSection(id)} aria-current={section === id ? "page" : undefined} className={cn("flex min-h-11 shrink-0 items-center gap-2 rounded-lg px-4 py-2 text-start transition", section === id ? "bg-[#fff1ec] text-[#cf4818]" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground")}>
                    <Icon className="mt-0.5 size-[18px] shrink-0" /><span className="min-w-0"><strong className="block text-sm">{ar ? arabic : en}</strong></span>
                  </button>
                ))}
              </nav>
            </aside>

            <main className="qs-menu-studio-content min-h-0 min-w-0">
              {section === "design" ? <Appearance restaurantId={restaurantId} /> : (
                <div className="space-y-3">
                  <div className="flex items-center gap-2"><span className="grid size-9 place-items-center rounded-full bg-orange-50 text-primary dark:bg-orange-950/30"><Layers3 className="size-4" /></span><div><h2 className="font-display text-lg font-bold">{ar ? standardSections.find((item) => item.id === section)?.ar : standardSections.find((item) => item.id === section)?.en}</h2><p className="text-xs text-muted-foreground">{ar ? "تعديل القائمة العادية فقط — منتجات PDF تبقى منفصلة." : "Standard Menu only — PDF hotspot products remain separate."}</p></div></div>
                  <Products restaurantId={restaurantId} mode={section} />
                </div>
              )}
            </main>
          </div>
        )}
      </Suspense></div>
    </section>
  );
}

function StandardMenuModeControl({ restaurant }: { restaurant: NonNullable<ReturnType<typeof useRestaurant>["data"]> }) {
  const { lang } = useI18n();
  const ar = lang === "ar";
  const queryClient = useQueryClient();
  const persistedMode = readAppearance(restaurant.menu_theme).guestMenuMode;
  const [mode, setMode] = useState<"light" | "dark">(persistedMode);

  useEffect(() => setMode(persistedMode), [persistedMode]);

  const saveMode = useMutation({
    mutationFn: async (nextMode: "light" | "dark") => {
      const rawTheme = restaurant.menu_theme && typeof restaurant.menu_theme === "object" && !Array.isArray(restaurant.menu_theme)
        ? restaurant.menu_theme as Record<string, unknown>
        : {};
      const rawWorkspace = rawTheme.workspace && typeof rawTheme.workspace === "object" && !Array.isArray(rawTheme.workspace)
        ? rawTheme.workspace as Record<string, unknown>
        : {};
      const menuTheme = { ...rawTheme, workspace: { ...rawWorkspace, guestMenuMode: nextMode } };
      const { error } = await supabase.from("restaurants").update({ menu_theme: menuTheme }).eq("id", restaurant.id);
      if (error) throw error;
      return nextMode;
    },
    onMutate: (nextMode) => {
      const previous = mode;
      setMode(nextMode);
      return { previous };
    },
    onError: (error, _nextMode, context) => {
      setMode(context?.previous ?? persistedMode);
      toast.error(humanError(error, lang));
    },
    onSuccess: async (nextMode) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["platform", "restaurant", restaurant.id] }),
        queryClient.invalidateQueries({ queryKey: ["diner"] }),
        queryClient.invalidateQueries({ queryKey: ["pdf-diner"] }),
      ]);
      toast.success(nextMode === "dark"
        ? (ar ? "تم تفعيل المظهر الداكن للقائمة" : "Standard Menu set to dark mode")
        : (ar ? "تم تفعيل المظهر الفاتح للقائمة" : "Standard Menu set to light mode"));
    },
  });

  return (
    <div className="qs-menu-mode-control flex min-h-11 items-center gap-1 rounded-xl border border-border bg-card p-1 shadow-sm" role="group" aria-label={ar ? "مظهر القائمة العادية" : "Standard Menu appearance"}>
      <span className="hidden px-2 text-[10px] font-bold uppercase tracking-[.08em] text-muted-foreground sm:inline">{ar ? "المظهر" : "Appearance"}</span>
      {(["light", "dark"] as const).map((option) => {
        const selected = mode === option;
        const Icon = option === "light" ? Sun : Moon;
        return <button key={option} type="button" aria-pressed={selected} disabled={saveMode.isPending} onClick={() => option !== mode && saveMode.mutate(option)} className={cn("inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold transition", selected ? "bg-[#fff1ec] text-[#cf4818] shadow-sm ring-1 ring-orange-200 dark:bg-orange-950/35 dark:text-orange-300 dark:ring-orange-900/60" : "text-muted-foreground hover:bg-muted hover:text-foreground")}><Icon className="size-3.5" /><span>{option === "light" ? (ar ? "فاتح" : "Light") : (ar ? "داكن" : "Dark")}</span></button>;
      })}
    </div>
  );
}
