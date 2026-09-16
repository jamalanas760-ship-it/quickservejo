import { lazy, Suspense, useState } from "react";
import { ExternalLink, FileText, Image as ImageIcon, Layers3, Package, Tags, UtensilsCrossed } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Skeleton } from "@/components/ui/skeleton";
import { useRestaurant } from "@/hooks/useSuperAdmin";
import { useI18n } from "@/lib/i18n";
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

  const standardSections = [
    { id: "design" as const, icon: ImageIcon, en: "Design & Branding", ar: "التصميم والهوية", hint: ar ? "الشعار وإعدادات المؤسسة" : "Logo and organization settings" },
    { id: "categories" as const, icon: Tags, en: "Categories", ar: "الفئات", hint: ar ? "تنظيم القائمة" : "Organize your menu" },
    { id: "products" as const, icon: Package, en: "Products", ar: "المنتجات", hint: ar ? "إضافة وإدارة المنتجات" : "Add and manage items" },
    { id: "pricing" as const, icon: Tags, en: "Pricing & Options", ar: "الأسعار والخيارات", hint: ar ? "الأسعار والتوفر والتحضير" : "Price, availability and prep" },
  ];

  return (
    <section className="space-y-5">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div><h1 className="qs-page-title">{ar ? "إدارة القائمة" : "Menu Management"}</h1><p className="qs-page-subtitle">{ar ? "أنشئ وأدر طريقة ظهور قائمتك للضيوف." : "Create and manage how your menu appears to your guests."}</p></div>
        {restaurant.data ? <Link to="/m/$slug" params={{ slug: restaurant.data.slug }} target="_blank" className="qs-button-secondary"><ExternalLink className="size-4" />{ar ? "عرض القائمة المباشرة" : "View Live Menu"}</Link> : null}
      </header>

      <div className="grid gap-3 md:grid-cols-2">
        <button type="button" onClick={() => setWorkflow("standard")} className={cn("flex min-h-[76px] items-center gap-4 rounded-2xl border bg-card p-4 text-start transition", workflow === "standard" ? "border-[#ff5a0a] bg-orange-500/[.035] shadow-[0_8px_24px_rgba(255,90,10,.08)]" : "border-border hover:bg-muted/30")}>
          <span className={cn("grid size-11 shrink-0 place-items-center rounded-full", workflow === "standard" ? "bg-orange-100 text-[#ff5a0a] dark:bg-orange-950/30" : "bg-muted text-muted-foreground")}><UtensilsCrossed className="size-5" /></span><span><strong className={cn("block text-sm", workflow === "standard" && "text-[#ff5a0a]")}>{ar ? "القائمة العادية" : "Standard Menu"}</strong><span className="mt-1 block text-xs text-muted-foreground">{ar ? "أنشئ وخصص قائمتك الإلكترونية" : "Build and customize your menu online"}</span></span>
        </button>
        <button type="button" onClick={() => setWorkflow("pdf")} className={cn("flex min-h-[76px] items-center gap-4 rounded-2xl border bg-card p-4 text-start transition", workflow === "pdf" ? "border-[#ff5a0a] bg-orange-500/[.035] shadow-[0_8px_24px_rgba(255,90,10,.08)]" : "border-border hover:bg-muted/30")}>
          <span className={cn("grid size-11 shrink-0 place-items-center rounded-full", workflow === "pdf" ? "bg-orange-100 text-[#ff5a0a] dark:bg-orange-950/30" : "bg-muted text-muted-foreground")}><FileText className="size-5" /></span><span><strong className={cn("block text-sm", workflow === "pdf" && "text-[#ff5a0a]")}>{ar ? "قائمة PDF" : "PDF Menu"}</strong><span className="mt-1 block text-xs text-muted-foreground">{ar ? "ارفع قائمة PDF تفاعلية" : "Upload a clickable PDF menu"}</span></span>
        </button>
      </div>

      <Suspense fallback={<Skeleton className="h-[650px] rounded-2xl" />}>
        {workflow === "pdf" ? <PdfEditor restaurantId={restaurantId} /> : (
          <div className="grid min-w-0 gap-4 xl:grid-cols-[220px_minmax(0,1fr)]">
            <aside className="qs-card self-start overflow-hidden xl:sticky xl:top-24">
              <nav className="grid gap-1 p-2 sm:grid-cols-2 xl:grid-cols-1">
                {standardSections.map(({ id, icon: Icon, en, ar: arabic, hint }) => (
                  <button key={id} type="button" onClick={() => setSection(id)} aria-current={section === id ? "page" : undefined} className={cn("flex w-full items-start gap-3 rounded-xl px-3 py-3 text-start transition", section === id ? "bg-[#fff0e7] text-[#e34d00] dark:bg-orange-950/25" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground")}>
                    <Icon className="mt-0.5 size-[18px] shrink-0" /><span className="min-w-0"><strong className="block text-xs">{ar ? arabic : en}</strong><span className="mt-1 block text-[10px] leading-4 opacity-70">{hint}</span></span>
                  </button>
                ))}
              </nav>
            </aside>

            <main className="min-w-0">
              {section === "design" ? <Appearance restaurantId={restaurantId} /> : (
                <div className="space-y-3">
                  <div className="flex items-center gap-2"><span className="grid size-9 place-items-center rounded-full bg-orange-50 text-[#ff5a0a] dark:bg-orange-950/30"><Layers3 className="size-4" /></span><div><h2 className="font-display text-lg font-bold">{ar ? standardSections.find((item) => item.id === section)?.ar : standardSections.find((item) => item.id === section)?.en}</h2><p className="text-xs text-muted-foreground">{ar ? "تعديل القائمة العادية فقط — منتجات PDF تبقى منفصلة." : "Standard Menu only — PDF hotspot products remain separate."}</p></div></div>
                  <Products restaurantId={restaurantId} mode={section} />
                </div>
              )}
            </main>
          </div>
        )}
      </Suspense>
    </section>
  );
}
