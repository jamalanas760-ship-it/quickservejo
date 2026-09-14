import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Archive, Download, ExternalLink, MapPin, MoreHorizontal, Pencil, Plus, Search, Store } from "lucide-react";
import { toast } from "sonner";

import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useRestaurantsWithStats } from "@/hooks/useSuperAdmin";
import { supabase } from "@/integrations/supabase/client";
import { downloadCsv } from "@/lib/erp";
import { humanError } from "@/lib/errors";
import { formatMoney, formatNumber } from "@/lib/format";
import { healthOf } from "@/lib/health";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/super-admin/restaurants/")({
  head: () => ({ meta: [{ title: "Restaurants / Branches — QuickServe" }] }),
  component: RestaurantsPage,
});

type LocationFields = {
  google_maps_url?: string | null;
  google_place_id?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

function locationFor(restaurant: { name: string; address_en: string | null; address_ar: string | null } & LocationFields) {
  const lat = Number(restaurant.latitude);
  const lng = Number(restaurant.longitude);
  const hasCoordinates = Number.isFinite(lat) && Number.isFinite(lng) && restaurant.latitude != null && restaurant.longitude != null;
  const query = hasCoordinates ? `${lat},${lng}` : restaurant.address_en || restaurant.address_ar || restaurant.name;
  const mapUrl = restaurant.google_maps_url?.trim() || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}${restaurant.google_place_id ? `&query_place_id=${encodeURIComponent(restaurant.google_place_id)}` : ""}`;
  const embedUrl = `https://www.google.com/maps?q=${encodeURIComponent(query)}&output=embed`;
  return { query, mapUrl, embedUrl };
}

function RestaurantsPage() {
  const { lang } = useI18n();
  const ar = lang === "ar";
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const restaurants = useRestaurantsWithStats();
  const [term, setTerm] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "setup" | "inactive">("all");
  const [mapRestaurantId, setMapRestaurantId] = useState<string | null>(null);

  const data = restaurants.data ?? [];
  const activeCount = data.filter((r) => r.is_active && !r.archived_at).length;
  const inactiveCount = data.filter((r) => !r.is_active || Boolean(r.archived_at)).length;
  const setupCount = data.filter((r) => healthOf(r).percent < 100 && r.is_active && !r.archived_at).length;

  const filtered = useMemo(() => {
    const needle = term.trim().toLowerCase();
    return data.filter((restaurant) => {
      const active = restaurant.is_active && !restaurant.archived_at;
      const setup = healthOf(restaurant).percent < 100 && active;
      if (status === "active" && !active) return false;
      if (status === "inactive" && active) return false;
      if (status === "setup" && !setup) return false;
      if (!needle) return true;
      return [restaurant.name, restaurant.slug, restaurant.address_en, restaurant.address_ar, restaurant.email, restaurant.phone]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [data, status, term]);

  const locationRestaurants = data.filter((restaurant) => restaurant.address_en || restaurant.address_ar || (restaurant as LocationFields).latitude != null || (restaurant as LocationFields).google_maps_url);
  const mapRestaurant = locationRestaurants.find((restaurant) => restaurant.id === mapRestaurantId) ?? locationRestaurants[0] ?? null;
  const currentLocation = mapRestaurant ? locationFor(mapRestaurant as typeof mapRestaurant & LocationFields) : null;

  function openRestaurant(id: string) {
    void navigate({ to: "/super-admin/restaurants/$restaurantId", params: { restaurantId: id } });
  }

  function exportCsv() {
    downloadCsv(
      "quickserve-restaurants.csv",
      ["Name", "Slug", "Status", "Plan", "Orders", "Revenue", "Currency", "Health"],
      filtered.map((restaurant) => [
        restaurant.name,
        restaurant.slug,
        restaurant.is_active && !restaurant.archived_at ? "active" : "inactive",
        restaurant.subscription_plan,
        restaurant.orderCount,
        restaurant.revenue,
        restaurant.currency,
        `${healthOf(restaurant).percent}%`,
      ]),
    );
  }

  async function archiveRestaurant(id: string, name: string) {
    const ok = window.confirm(ar ? `أرشفة ${name}؟ يمكن الاحتفاظ بالبيانات دون حذف دائم.` : `Archive ${name}? Data will be kept instead of being permanently deleted.`);
    if (!ok) return;
    try {
      const { error } = await supabase.from("restaurants").update({ archived_at: new Date().toISOString(), is_active: false }).eq("id", id);
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ["platform", "restaurants"] });
      toast.success(ar ? "تمت أرشفة الفرع" : "Branch archived");
    } catch (error) {
      toast.error(humanError(error, lang));
    }
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="qs-page-title">{ar ? "المطاعم / الفروع" : "Restaurants / Branches"}</h1>
          <p className="qs-page-subtitle">{ar ? "إدارة المواقع والحالة والأداء من مكان واحد." : "Manage locations, status, and performance in one place."}</p>
        </div>
        <Link to="/super-admin/restaurants/new" className="qs-button-primary w-fit"><Plus className="size-4" />{ar ? "إضافة فرع" : "Add Branch"}</Link>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric value={String(data.length)} label={ar ? "إجمالي الفروع" : "Total Branches"} tone="orange" />
        <Metric value={String(activeCount)} label={ar ? "نشطة" : "Active"} tone="green" />
        <Metric value={String(setupCount)} label={ar ? "قيد الإعداد" : "Setup"} tone="amber" />
        <Metric value={String(inactiveCount)} label={ar ? "غير نشطة" : "Inactive"} tone="red" />
      </div>

      <section className="qs-card overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-border p-4 lg:flex-row lg:items-center">
          <div className="no-scrollbar flex max-w-full overflow-x-auto rounded-xl bg-muted/70 p-1 text-xs font-semibold">
            {(["all", "active", "setup", "inactive"] as const).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setStatus(key)}
                className={cn("shrink-0 rounded-lg px-3 py-2 transition", status === key ? "bg-card text-[#ff5a0a] shadow-sm" : "text-muted-foreground hover:text-foreground")}
              >
                {key === "all" ? (ar ? "الكل" : "All") : key === "active" ? (ar ? "نشطة" : "Active") : key === "setup" ? (ar ? "إعداد" : "Setup") : (ar ? "غير نشطة" : "Inactive")}
              </button>
            ))}
          </div>
          <div className="relative min-w-0 flex-1 lg:ms-auto lg:max-w-sm">
            <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={term} onChange={(event) => setTerm(event.target.value)} placeholder={ar ? "ابحث في الفروع..." : "Search branches..."} className="h-10 ps-9" />
          </div>
          <button type="button" onClick={exportCsv} className="qs-button-secondary w-fit" aria-label={ar ? "تصدير" : "Export CSV"}><Download className="size-4" />{ar ? "تصدير" : "Export"}</button>
        </div>

        {restaurants.isPending ? <Skeleton className="m-4 h-[360px] rounded-xl" /> : (
          <>
            <div className="space-y-3 p-3 md:hidden">
              {filtered.map((restaurant) => {
                const active = restaurant.is_active && !restaurant.archived_at;
                const loc = locationFor(restaurant as typeof restaurant & LocationFields);
                return (
                  <article
                    key={restaurant.id}
                    role="link"
                    tabIndex={0}
                    onClick={() => openRestaurant(restaurant.id)}
                    onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openRestaurant(restaurant.id); } }}
                    className="group cursor-pointer rounded-2xl border border-border bg-card p-4 shadow-sm transition hover:border-primary/25 hover:shadow-md focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/10"
                  >
                    <div className="flex items-start gap-3">
                      <RestaurantLogo restaurant={restaurant} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start gap-2"><div className="min-w-0 flex-1"><p className="truncate font-bold">{restaurant.name}</p><p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{lang === "ar" ? restaurant.address_ar || restaurant.address_en || `/${restaurant.slug}` : restaurant.address_en || restaurant.address_ar || `/${restaurant.slug}`}</p></div><ActionMenu restaurant={restaurant} loc={loc} ar={ar} onArchive={archiveRestaurant} /></div>
                        <div className="mt-3 flex flex-wrap items-center gap-2"><Status active={active} ar={ar} /><span className="qs-status bg-muted text-muted-foreground">{restaurant.subscription_plan}</span></div>
                      </div>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-2 border-t border-border/70 pt-3 text-xs"><span><span className="text-muted-foreground">{ar ? "الطلبات" : "Orders"}</span><strong className="ms-1 tabular-nums">{formatNumber(restaurant.orderCount, lang)}</strong></span><span><span className="text-muted-foreground">{ar ? "المبيعات" : "Revenue"}</span><strong className="ms-1 tabular-nums">{formatMoney(restaurant.revenue, restaurant.currency, lang)}</strong></span></div>
                  </article>
                );
              })}
            </div>

            <div className="qs-scroll hidden overflow-x-auto md:block">
              <table className="qs-table min-w-[850px]">
                <thead><tr><th>{ar ? "الفرع / الموقع" : "Branch / Location"}</th><th>{ar ? "الكود" : "Code"}</th><th>{ar ? "الحالة" : "Status"}</th><th>{ar ? "الخطة" : "Plan"}</th><th>{ar ? "الطلبات" : "Orders"}</th><th>{ar ? "المبيعات" : "Revenue"}</th><th className="w-12" aria-label={ar ? "إجراءات" : "Actions"} /></tr></thead>
                <tbody>
                  {filtered.map((restaurant) => {
                    const active = restaurant.is_active && !restaurant.archived_at;
                    const loc = locationFor(restaurant as typeof restaurant & LocationFields);
                    return (
                      <tr
                        key={restaurant.id}
                        role="link"
                        tabIndex={0}
                        onClick={() => openRestaurant(restaurant.id)}
                        onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openRestaurant(restaurant.id); } }}
                        className="group cursor-pointer outline-none transition hover:bg-muted/45 focus-visible:bg-muted/60"
                      >
                        <td><div className="flex items-center gap-3"><RestaurantLogo restaurant={restaurant} small /><div className="min-w-0"><p className="truncate font-bold group-hover:text-[#ff5a0a]">{restaurant.name}</p><p className="max-w-[240px] truncate text-[10px] text-muted-foreground">{lang === "ar" ? restaurant.address_ar || restaurant.address_en || `/${restaurant.slug}` : restaurant.address_en || restaurant.address_ar || `/${restaurant.slug}`}</p></div></div></td>
                        <td className="font-mono text-xs text-muted-foreground">{restaurant.slug.toUpperCase().slice(0, 8)}</td>
                        <td><Status active={active} ar={ar} /></td>
                        <td className="capitalize">{restaurant.subscription_plan}</td>
                        <td className="font-bold tabular-nums">{formatNumber(restaurant.orderCount, lang)}</td>
                        <td className="font-bold tabular-nums">{formatMoney(restaurant.revenue, restaurant.currency, lang)}</td>
                        <td onClick={(event) => event.stopPropagation()}><ActionMenu restaurant={restaurant} loc={loc} ar={ar} onArchive={archiveRestaurant} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
        {filtered.length === 0 ? <p className="p-12 text-center text-sm text-muted-foreground">{ar ? "لا توجد فروع مطابقة." : "No matching branches."}</p> : null}
      </section>

      <section className="qs-card overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-4 py-3"><h2 className="qs-section-title flex items-center gap-2"><MapPin className="size-4" />{ar ? "مواقع الفروع" : "Branch Locations"}</h2>{mapRestaurant && currentLocation ? <a onClick={(e) => e.stopPropagation()} href={currentLocation.mapUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600">{ar ? "فتح الخريطة" : "Open map"}<ExternalLink className="size-3" /></a> : null}</div>
        {mapRestaurant && currentLocation ? <div className="grid lg:grid-cols-[1fr_300px]"><iframe key={mapRestaurant.id} title={`${mapRestaurant.name} map`} src={currentLocation.embedUrl} className="h-[300px] w-full border-0" loading="lazy" referrerPolicy="no-referrer-when-downgrade" /><div className="border-t border-border p-4 lg:border-s lg:border-t-0"><p className="font-bold">{mapRestaurant.name}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{lang === "ar" ? mapRestaurant.address_ar || mapRestaurant.address_en || currentLocation.query : mapRestaurant.address_en || mapRestaurant.address_ar || currentLocation.query}</p><div className="no-scrollbar mt-4 flex gap-2 overflow-x-auto lg:flex-col">{locationRestaurants.map((restaurant) => <button key={restaurant.id} type="button" onClick={() => setMapRestaurantId(restaurant.id)} className={cn("shrink-0 rounded-xl border px-3 py-2 text-start text-xs font-semibold transition", mapRestaurant.id === restaurant.id ? "border-[#ff5a0a]/40 bg-orange-500/10 text-[#ff5a0a]" : "border-border bg-card text-muted-foreground hover:text-foreground")}>{restaurant.name}</button>)}</div></div></div> : <div className="grid min-h-[220px] place-items-center p-6 text-center text-sm text-muted-foreground">{ar ? "أضف موقع Google Maps من إعدادات الفرع." : "Add a Google Maps location from branch settings."}</div>}
      </section>
    </div>
  );
}

function RestaurantLogo({ restaurant, small = false }: { restaurant: { logo_url: string | null }; small?: boolean }) {
  return <span className={cn("grid shrink-0 place-items-center overflow-hidden rounded-xl border border-border bg-muted", small ? "size-10" : "size-12")}>{restaurant.logo_url ? <img src={restaurant.logo_url} alt="" className="size-full object-cover" loading="lazy" /> : <Store className="size-5 text-[#ff5a0a]" />}</span>;
}

function Status({ active, ar }: { active: boolean; ar: boolean }) {
  return <span className={cn("qs-status", active ? "bg-emerald-500/12 text-emerald-600" : "bg-slate-500/12 text-slate-500")}><span className={cn("size-1.5 rounded-full", active ? "bg-emerald-500" : "bg-slate-400")} />{active ? (ar ? "نشط" : "Active") : (ar ? "غير نشط" : "Inactive")}</span>;
}

function ActionMenu({ restaurant, loc, ar, onArchive }: { restaurant: { id: string; name: string }; loc: { mapUrl: string }; ar: boolean; onArchive: (id: string, name: string) => Promise<void> }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" onClick={(event) => event.stopPropagation()} className="grid size-9 place-items-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground" aria-label={ar ? "خيارات الفرع" : "Branch options"}><MoreHorizontal className="size-4" /></button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44" onClick={(event) => event.stopPropagation()}>
        <DropdownMenuItem asChild><Link to="/super-admin/restaurants/$restaurantId" params={{ restaurantId: restaurant.id }}><Store className="size-4" />{ar ? "فتح" : "Open"}</Link></DropdownMenuItem>
        <DropdownMenuItem asChild><Link to="/super-admin/restaurants/$restaurantId/edit" params={{ restaurantId: restaurant.id }}><Pencil className="size-4" />{ar ? "تعديل / إعادة تسمية" : "Edit / Rename"}</Link></DropdownMenuItem>
        <DropdownMenuItem asChild><a href={loc.mapUrl} target="_blank" rel="noreferrer"><MapPin className="size-4" />{ar ? "عرض الخريطة" : "View Map"}</a></DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => void onArchive(restaurant.id, restaurant.name)}><Archive className="size-4" />{ar ? "حذف / أرشفة" : "Delete / Archive"}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Metric({ value, label, tone }: { value: string; label: string; tone: "orange" | "green" | "amber" | "red" }) {
  const toneClass = tone === "orange" ? "text-orange-600" : tone === "green" ? "text-emerald-600" : tone === "amber" ? "text-amber-600" : "text-red-600";
  return <div className="qs-stat flex items-center justify-between gap-3"><div><p className="text-xs font-semibold text-muted-foreground">{label}</p><p className="mt-1 font-display text-2xl font-bold">{value}</p></div><span className={cn("size-2.5 rounded-full", toneClass.replace("text-", "bg-"))} /></div>;
}
