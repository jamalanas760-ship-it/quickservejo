import { lazy, Suspense } from "react";
import { ExternalLink, FileText, Layers3, Palette } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { useRestaurant } from "@/hooks/useSuperAdmin";
import { useI18n } from "@/lib/i18n";

const PdfEditor = lazy(() => import("./PdfMenuManagerV3").then((module) => ({ default: module.PdfMenuManagerV3 })));
const Products = lazy(() => import("./MenuCatalogMaster").then((module) => ({ default: module.MenuCatalogMaster })));
const Appearance = lazy(() => import("./RestaurantAppearance").then((module) => ({ default: module.RestaurantAppearance })));

export function MasterMenuDesigner({ restaurantId }: { restaurantId: string }) {
  const { lang } = useI18n();
  const ar = lang === "ar";
  const restaurant = useRestaurant(restaurantId);

  return (
    <section className="space-y-4">
      <header className="sticky top-[70px] z-30 -mx-3 border-b border-border/70 bg-background/95 px-3 py-3 backdrop-blur-xl sm:-mx-5 sm:px-5 lg:static lg:mx-0 lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="qs-page-title">{ar ? "القائمة" : "Menu"}</h1>
            <p className="qs-page-subtitle">{ar ? "المنتجات، PDF، والمظهر في مكان واحد." : "Products, clickable PDF, and appearance in one workspace."}</p>
          </div>
          {restaurant.data ? (
            <Link
              to="/m/$slug"
              params={{ slug: restaurant.data.slug }}
              target="_blank"
              className="qs-button-secondary shrink-0"
              aria-label={ar ? "معاينة قائمة الضيف" : "Preview guest menu"}
            >
              <ExternalLink className="size-4" /><span className="hidden sm:inline">{ar ? "معاينة" : "Preview"}</span>
            </Link>
          ) : null}
        </div>
      </header>

      <Tabs defaultValue="standard" dir={ar ? "rtl" : "ltr"}>
        <TabsList className="grid h-auto w-full grid-cols-3 gap-1 rounded-xl border border-border bg-card p-1 shadow-sm">
          <TabsTrigger value="standard" className="min-h-11 gap-2 rounded-lg px-2 text-xs sm:px-3 sm:text-sm data-[state=active]:bg-[#ff5a0a] data-[state=active]:text-white"><Layers3 className="size-4" /><span className="truncate">{ar ? "العادية" : "Products"}</span></TabsTrigger>
          <TabsTrigger value="pdf" className="min-h-11 gap-2 rounded-lg px-2 text-xs sm:px-3 sm:text-sm data-[state=active]:bg-[#ff5a0a] data-[state=active]:text-white"><FileText className="size-4" /><span className="truncate">PDF</span></TabsTrigger>
          <TabsTrigger value="appearance" className="min-h-11 gap-2 rounded-lg px-2 text-xs sm:px-3 sm:text-sm data-[state=active]:bg-[#ff5a0a] data-[state=active]:text-white"><Palette className="size-4" /><span className="truncate">{ar ? "المظهر" : "Appearance"}</span></TabsTrigger>
        </TabsList>

        <Suspense fallback={<Skeleton className="mt-4 h-[620px] rounded-2xl" />}>
          <TabsContent value="standard" className="mt-4"><Products restaurantId={restaurantId} /></TabsContent>
          <TabsContent value="pdf" className="mt-4"><PdfEditor restaurantId={restaurantId} /></TabsContent>
          <TabsContent value="appearance" className="mt-4"><Appearance restaurantId={restaurantId} /></TabsContent>
        </Suspense>
      </Tabs>
    </section>
  );
}