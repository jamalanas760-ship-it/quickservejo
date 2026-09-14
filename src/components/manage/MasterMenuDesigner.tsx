import { lazy, Suspense } from "react";
import { ExternalLink, FileText, Palette, Upload, UtensilsCrossed } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { useRestaurant } from "@/hooks/useSuperAdmin";
import { useI18n } from "@/lib/i18n";

const PdfEditor = lazy(() => import("./PdfMenuManagerV2").then((module) => ({ default: module.PdfMenuManagerV2 })));
const Products = lazy(() => import("./MenuManager").then((module) => ({ default: module.MenuManager })));
const Appearance = lazy(() => import("./RestaurantAppearance").then((module) => ({ default: module.RestaurantAppearance })));

export function MasterMenuDesigner({ restaurantId }: { restaurantId: string }) {
  const { lang } = useI18n();
  const ar = lang === "ar";
  const restaurant = useRestaurant(restaurantId);

  return (
    <section className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div><h1 className="qs-page-title">{ar ? "إدارة القائمة" : "Menu Management"}</h1><p className="qs-page-subtitle">{ar ? "أنشئ وعدّل ونظّم عناصر قائمتك، أو اجعل ملف PDF الأصلي قابلاً للطلب." : "Create, edit, and organize menu items, or make your original PDF menu clickable."}</p></div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="qs-button-secondary"><Upload className="size-4 text-[#ff5a0a]" />{ar ? "استيراد القائمة" : "Import Menu"}</button>
          {restaurant.data ? <Link to="/m/$slug" params={{ slug: restaurant.data.slug }} target="_blank" className="qs-button-primary"><ExternalLink className="size-4" />{ar ? "معاينة القائمة" : "Preview Menu"}</Link> : null}
        </div>
      </header>

      <Tabs defaultValue="products" dir={ar ? "rtl" : "ltr"}>
        <TabsList className="grid h-auto w-full max-w-[720px] grid-cols-3 rounded-xl border border-border bg-card p-1 shadow-sm">
          <TabsTrigger value="products" className="min-h-11 gap-2 rounded-lg data-[state=active]:bg-[#ff5a0a] data-[state=active]:text-white"><UtensilsCrossed className="size-4" />{ar ? "عناصر القائمة" : "Menu Items"}</TabsTrigger>
          <TabsTrigger value="pdf" className="min-h-11 gap-2 rounded-lg data-[state=active]:bg-[#ff5a0a] data-[state=active]:text-white"><FileText className="size-4" />{ar ? "القائمة الأصلية PDF" : "Original PDF"}</TabsTrigger>
          <TabsTrigger value="appearance" className="min-h-11 gap-2 rounded-lg data-[state=active]:bg-[#ff5a0a] data-[state=active]:text-white"><Palette className="size-4" />{ar ? "الهوية والأسعار" : "Brand & Pricing"}</TabsTrigger>
        </TabsList>
        <Suspense fallback={<Skeleton className="mt-5 h-[620px] rounded-2xl" />}>
          <TabsContent value="products" className="mt-5"><Products restaurantId={restaurantId} /></TabsContent>
          <TabsContent value="pdf" className="mt-5"><PdfEditor restaurantId={restaurantId} /></TabsContent>
          <TabsContent value="appearance" className="mt-5"><Appearance restaurantId={restaurantId} /></TabsContent>
        </Suspense>
      </Tabs>
    </section>
  );
}
