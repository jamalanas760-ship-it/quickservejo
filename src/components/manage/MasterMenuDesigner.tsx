import { lazy, Suspense } from "react";
import { FileText, UtensilsCrossed, Palette, ExternalLink } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useRestaurant } from "@/hooks/useSuperAdmin";
import { useI18n } from "@/lib/i18n";

const PdfEditor = lazy(() => import("./PdfMenuManagerV2").then(m => ({ default: m.PdfMenuManagerV2 })));
const Products = lazy(() => import("./MenuManager").then(m => ({ default: m.MenuManager })));
const Appearance = lazy(() => import("./RestaurantAppearance").then(m => ({ default: m.RestaurantAppearance })));

export function MasterMenuDesigner({ restaurantId }: { restaurantId: string }) {
  const { lang } = useI18n();
  const ar = lang === "ar";
  const restaurant = useRestaurant(restaurantId);
  return <section className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><h2 className="text-2xl font-semibold tracking-tight">{ar ? "مساحة تصميم القائمة" : "Menu workspace"}</h2>
        <p className="mt-2 max-w-xl text-sm text-muted-foreground">{ar ? "اربط الأصناف بقائمتك الأصلية أو أنشئ قائمة بالصور. خصص الهوية والأسعار من مكان واحد." : "Make your original menu clickable, or build a product catalog. Manage your brand and pricing in one place."}</p></div>
      {restaurant.data ? <Button asChild variant="outline"><Link to="/m/$slug" params={{ slug: restaurant.data.slug }} target="_blank"><ExternalLink className="size-4" />{ar ? "معاينة القائمة" : "Preview menu"}</Link></Button> : null}
    </div>
    <Tabs defaultValue="pdf" dir={ar ? "rtl" : "ltr"}>
      <TabsList className="grid h-auto w-full grid-cols-3 p-1.5">
        <TabsTrigger value="pdf" className="min-h-12 gap-2 whitespace-normal"><FileText className="size-4 shrink-0" />{ar ? "القائمة الأصلية PDF" : "Original PDF"}</TabsTrigger>
        <TabsTrigger value="products" className="min-h-12 gap-2 whitespace-normal"><UtensilsCrossed className="size-4 shrink-0" />{ar ? "كتالوج المنتجات" : "Product catalog"}</TabsTrigger>
        <TabsTrigger value="appearance" className="min-h-12 gap-2 whitespace-normal"><Palette className="size-4 shrink-0" />{ar ? "الهوية والأسعار" : "Brand & pricing"}</TabsTrigger>
      </TabsList>
      <Suspense fallback={<Skeleton className="mt-6 h-80 rounded-2xl" />}>
        <TabsContent value="pdf" className="mt-6"><PdfEditor restaurantId={restaurantId} /></TabsContent>
        <TabsContent value="products" className="mt-6"><Products restaurantId={restaurantId} /></TabsContent>
        <TabsContent value="appearance" className="mt-6"><Appearance restaurantId={restaurantId} /></TabsContent>
      </Suspense>
    </Tabs>
  </section>;
}
