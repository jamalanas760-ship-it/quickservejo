import { lazy, Suspense, useState } from "react";
import { ExternalLink, FileText, Image as ImageIcon, Layers3, Package, Tags, UtensilsCrossed } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { MasterEyebrow, MasterPageHeader } from "@/components/app/MasterPage";
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
    <section className="qs-viewport-fill flex h-full min-h-0 flex-col gap-4">
      <MasterPageHeader
        eyebrow={<MasterEyebrow icon={UtensilsCrossed}>{ar ? "استوديو القائمة" : "Menu Studio"}</MasterEyebrow>}
        title={ar ? "إدارة القائمة" : "Menu Management"}
        description={ar ? "أدر العناصر والفئات والأسعار والهوية من مساحة عمل واحدة واضحة." : "Manage items, categories, pricing and presentation from one focused workspace."}
        actions={restaurant.data ? <Link to="/m/$slug" params={{ slug: restaurant.data.slug }} target="_blank" rel="noreferrer" className="qs-button-secondary"><ExternalLink className="size-4" />{ar ? "معاينة القائمة" : "Preview Menu"}</Link> : null}
      />

      <div className="grid gap-3 lg:grid-cols-2">
        <button type="button" aria-pressed={workflow === "standard"} onClick={() => setWorkflow("standard")} className={cn("flex min-h-[68px] items-center gap-3 rounded-[12px] border bg-card px-4 py-3 text-start shadow-[var(--qs-shadow-card)] transition", workflow === "standard" ? "border-[#e85d2a] bg-orange-500/[.035]" : "border-border hover:bg-muted/30")}>
          <span className={cn("grid size-10 shrink-0 place-items-center rounded-[10px]", workflow === "standard" ? "bg-orange-100 text-[#cf4818] dark:bg-orange-950/30" : "bg-muted text-muted-foreground")}><UtensilsCrossed className="size-4" /></span><span><strong className={cn("block text-sm", workflow === "standard" && "text-[#cf4818]")}>{ar ? "القائمة العادية" : "Standard Menu"}</strong><span className="mt-1 block text-xs text-muted-foreground">{ar ? "أنشئ وخصص قائمتك الإلكترونية" : "Build and customize your menu online"}</span></span>
        </button>
        <button type="button" aria-pressed={workflow === "pdf"} onClick={() => setWorkflow("pdf")} className={cn("flex min-h-[68px] items-center gap-3 rounded-[12px] border bg-card px-4 py-3 text-start shadow-[var(--qs-shadow-card)] transition", workflow === "pdf" ? "border-[#e85d2a] bg-orange-500/[.035]" : "border-border hover:bg-muted/30")}>
          <span className={cn("grid size-10 shrink-0 place-items-center rounded-[10px]", workflow === "pdf" ? "bg-orange-100 text-[#cf4818] dark:bg-orange-950/30" : "bg-muted text-muted-foreground")}><FileText className="size-4" /></span><span><strong className={cn("block text-sm", workflow === "pdf" && "text-[#cf4818]")}>{ar ? "قائمة PDF" : "PDF Menu"}</strong><span className="mt-1 block text-xs text-muted-foreground">{ar ? "ارفع قائمة PDF تفاعلية" : "Upload a clickable PDF menu"}</span></span>
        </button>
      </div>

      <div className="qs-viewport-fill min-h-0 overflow-hidden"><Suspense fallback={<Skeleton className="h-full rounded-xl" />}>
        {workflow === "pdf" ? <PdfEditor restaurantId={restaurantId} /> : (
          <div className="grid h-full min-h-0 min-w-0 gap-4 xl:grid-cols-[190px_minmax(0,1fr)]">
            <aside className="qs-card h-full min-h-0 overflow-hidden">
              <nav className="grid gap-1 p-1.5 sm:grid-cols-2 xl:grid-cols-1">
                {standardSections.map(({ id, icon: Icon, en, ar: arabic, hint }) => (
                  <button key={id} type="button" onClick={() => setSection(id)} aria-current={section === id ? "page" : undefined} className={cn("flex min-h-14 w-full items-start gap-2.5 rounded-[10px] px-3 py-2.5 text-start transition", section === id ? "bg-[#fff1ec] text-[#cf4818]" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground")}>
                    <Icon className="mt-0.5 size-[18px] shrink-0" /><span className="min-w-0"><strong className="block text-sm">{ar ? arabic : en}</strong><span className="mt-0.5 block text-xs leading-4 opacity-70">{hint}</span></span>
                  </button>
                ))}
              </nav>
            </aside>

            <main className="qs-scroll-region min-h-0 min-w-0">
              {section === "design" ? <Appearance restaurantId={restaurantId} /> : (
                <div className="space-y-3">
                  <div className="flex items-center gap-2"><span className="grid size-9 place-items-center rounded-full bg-orange-50 text-[#e85d2a] dark:bg-orange-950/30"><Layers3 className="size-4" /></span><div><h2 className="font-display text-lg font-bold">{ar ? standardSections.find((item) => item.id === section)?.ar : standardSections.find((item) => item.id === section)?.en}</h2><p className="text-xs text-muted-foreground">{ar ? "تعديل القائمة العادية فقط — منتجات PDF تبقى منفصلة." : "Standard Menu only — PDF hotspot products remain separate."}</p></div></div>
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
