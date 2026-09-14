import { lazy, Suspense } from "react";
import { ExternalLink, FileText, Layers3, Palette, Settings2, UtensilsCrossed } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { useRestaurant } from "@/hooks/useSuperAdmin";
import { useI18n } from "@/lib/i18n";

const PdfEditor = lazy(() => import("./PdfMenuManagerV2").then((module) => ({ default: module.PdfMenuManagerV2 })));
const Products = lazy(() => import("./MenuCatalogMaster").then((module) => ({ default: module.MenuCatalogMaster })));
const Advanced = lazy(() => import("./MenuManager").then((module) => ({ default: module.MenuManager })));
const Appearance = lazy(() => import("./RestaurantAppearance").then((module) => ({ default: module.RestaurantAppearance })));

export function MasterMenuDesigner({ restaurantId }: { restaurantId: string }) {
  const { lang } = useI18n();
  const ar = lang === "ar";
  const restaurant = useRestaurant(restaurantId);

  return (
    <section className="space-y-5">
      <header className="sticky top-[70px] z-30 -mx-3 border-b border-border/70 bg-background/95 px-3 py-3 backdrop-blur-xl sm:-mx-5 sm:px-5 lg:static lg:mx-0 lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="qs-page-title">{ar ? "إدارة القائمة" : "Menu Management"}</h1>
            <p className="qs-page-subtitle">{ar ? "افصل بوضوح بين القائمة العادية والقائمة التفاعلية PDF." : "Clearly manage your Standard Menu and Clickable PDF Menu as separate workflows."}</p>
          </div>
          {restaurant.data ? (
            <Link to="/m/$slug" params={{ slug: restaurant.data.slug }} target="_blank" className="qs-button-primary w-full justify-center sm:w-auto">
              <ExternalLink className="size-4" />{ar ? "معاينة قائمة الضيف" : "Preview Guest Menu"}
            </Link>
          ) : null}
        </div>
      </header>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="qs-card p-4 sm:p-5">
          <div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-orange-500/12 text-[#ff5a0a]"><UtensilsCrossed className="size-5" /></span><div><h2 className="font-bold">{ar ? "القائمة العادية" : "Standard Menu"}</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">{ar ? "الفئات، المنتجات، الأسعار، الخيارات والمتغيرات." : "Categories, products, prices, variants, and options."}</p></div></div>
        </div>
        <div className="qs-card p-4 sm:p-5">
          <div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-blue-500/12 text-blue-600"><FileText className="size-5" /></span><div><h2 className="font-bold">{ar ? "قائمة PDF التفاعلية" : "Clickable PDF Menu"}</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">{ar ? "ملف PDF الأصلي، الصفحات، تحديد المناطق والـ Hotspots." : "Original PDF, pages, Select Area, and hotspot-linked products."}</p></div></div>
        </div>
      </div>

      <Tabs defaultValue="standard" dir={ar ? "rtl" : "ltr"}>
        <TabsList className="grid h-auto w-full grid-cols-2 gap-1 rounded-xl border border-border bg-card p-1 shadow-sm sm:grid-cols-4">
          <TabsTrigger value="standard" className="min-h-12 gap-2 rounded-lg px-3 data-[state=active]:bg-[#ff5a0a] data-[state=active]:text-white"><Layers3 className="size-4" />{ar ? "القائمة العادية" : "Standard Menu"}</TabsTrigger>
          <TabsTrigger value="pdf" className="min-h-12 gap-2 rounded-lg px-3 data-[state=active]:bg-[#ff5a0a] data-[state=active]:text-white"><FileText className="size-4" />{ar ? "قائمة PDF" : "PDF Menu"}</TabsTrigger>
          <TabsTrigger value="appearance" className="min-h-12 gap-2 rounded-lg px-3 data-[state=active]:bg-[#ff5a0a] data-[state=active]:text-white"><Palette className="size-4" />{ar ? "إعدادات المؤسسة" : "Organization Settings"}</TabsTrigger>
          <TabsTrigger value="advanced" className="min-h-12 gap-2 rounded-lg px-3 data-[state=active]:bg-[#ff5a0a] data-[state=active]:text-white"><Settings2 className="size-4" />{ar ? "متقدم" : "Advanced"}</TabsTrigger>
        </TabsList>

        <div className="mt-3 rounded-xl border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          {ar ? "القائمة العادية ومنتجات PDF منفصلتان. لن يتم دمج المنتجات بين المسارين تلقائياً." : "Standard Menu products and PDF-linked products are separate. Products are never silently merged between workflows."}
        </div>

        <Suspense fallback={<Skeleton className="mt-5 h-[620px] rounded-2xl" />}>
          <TabsContent value="standard" className="mt-5">
            <div className="mb-4 flex flex-wrap gap-2 text-xs font-semibold"><span className="rounded-full border border-orange-500/25 bg-orange-500/10 px-3 py-1.5 text-orange-600">{ar ? "الفئات" : "Categories"}</span><span className="rounded-full border px-3 py-1.5">{ar ? "المنتجات" : "Products"}</span><span className="rounded-full border px-3 py-1.5">{ar ? "الأسعار والخيارات" : "Pricing & Options"}</span></div>
            <Products restaurantId={restaurantId} />
          </TabsContent>
          <TabsContent value="pdf" className="mt-5">
            <div className="mb-4 flex flex-wrap gap-2 text-xs font-semibold"><span className="rounded-full border border-blue-500/25 bg-blue-500/10 px-3 py-1.5 text-blue-600">PDF</span><span className="rounded-full border px-3 py-1.5">{ar ? "الصفحات" : "Pages"}</span><span className="rounded-full border px-3 py-1.5">{ar ? "تحديد منطقة" : "Select Area"}</span><span className="rounded-full border px-3 py-1.5">Hotspots</span></div>
            <PdfEditor restaurantId={restaurantId} />
          </TabsContent>
          <TabsContent value="appearance" className="mt-5"><Appearance restaurantId={restaurantId} /></TabsContent>
          <TabsContent value="advanced" className="mt-5"><Advanced restaurantId={restaurantId} /></TabsContent>
        </Suspense>
      </Tabs>
    </section>
  );
}
