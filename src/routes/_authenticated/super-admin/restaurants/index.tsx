import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Building2, Download, Ellipsis, Filter, MapPin, Plus, Search, Store, UsersRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useRestaurantsWithStats } from "@/hooks/useSuperAdmin";
import { useI18n } from "@/lib/i18n";
import { formatMoney, formatNumber } from "@/lib/format";
import { healthOf } from "@/lib/health";
import { downloadCsv } from "@/lib/erp";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/super-admin/restaurants/")({
  head: () => ({ meta: [{ title: "Restaurants / Branches — QuickServe" }] }),
  component: RestaurantsPage,
});

function RestaurantsPage() {
  const { lang } = useI18n();
  const ar = lang === "ar";
  const restaurants = useRestaurantsWithStats();
  const [term, setTerm] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "setup" | "inactive">("all");

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
      return [restaurant.name, restaurant.slug, restaurant.address_en, restaurant.address_ar, restaurant.email, restaurant.phone].filter(Boolean).join(" ").toLowerCase().includes(needle);
    });
  }, [data, status, term]);

  function exportCsv() {
    downloadCsv("quickserve-restaurants.csv", ["Name", "Slug", "Status", "Plan", "Orders", "Revenue", "Currency", "Health"], filtered.map((restaurant) => [restaurant.name, restaurant.slug, restaurant.is_active && !restaurant.archived_at ? "active" : "inactive", restaurant.subscription_plan, restaurant.orderCount, restaurant.revenue, restaurant.currency, `${healthOf(restaurant).percent}%`]));
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div><h1 className="qs-page-title">{ar ? "المطاعم / الفروع" : "Restaurants / Branches"}</h1><p className="qs-page-subtitle">{ar ? "إدارة مواقع المطاعم والإعدادات والأداء." : "Manage restaurant locations, settings, and performance."}</p></div>
        <div className="flex items-center gap-3"><div className="hidden rounded-xl border border-border bg-card px-4 py-2.5 text-xs italic text-muted-foreground xl:block">“More locations. More happy guests.”</div><Link to="/super-admin/restaurants/new" className="qs-button-primary"><Plus className="size-4" />{ar ? "إضافة مطعم" : "Add Branch"}</Link></div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric icon={<Store className="size-5" />} value={String(data.length)} label={ar ? "إجمالي الفروع" : "Total Branches"} detail={ar ? "على المنصة" : "on platform"} tone="orange" />
        <Metric icon={<span className="size-3 rounded-full bg-emerald-500" />} value={String(activeCount)} label={ar ? "فروع نشطة" : "Active Branches"} detail={`${data.length ? Math.round((activeCount / data.length) * 100) : 0}%`} tone="green" />
        <Metric icon={<span className="size-3 rounded-full bg-amber-400" />} value={String(setupCount)} label={ar ? "قيد الإعداد" : "Under Setup"} detail={ar ? "تحتاج إكمال" : "needs setup"} tone="amber" />
        <Metric icon={<span className="size-3 rounded-full bg-red-500" />} value={String(inactiveCount)} label={ar ? "غير نشطة" : "Inactive"} detail={ar ? "موقوفة أو مؤرشفة" : "inactive or archived"} tone="red" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_330px]">
        <section className="qs-card overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 border-b border-border p-4">
            <div className="flex rounded-lg bg-muted p-1 text-xs font-semibold">
              {(["all", "active", "setup", "inactive"] as const).map((key) => <button key={key} type="button" onClick={() => setStatus(key)} className={cn("rounded-md px-3 py-2 capitalize", status === key ? "bg-card text-[#ff5a0a] shadow-sm" : "text-muted-foreground")}>{key === "all" ? (ar ? "الكل" : "All Branches") : key === "active" ? (ar ? "نشطة" : "Active") : key === "setup" ? (ar ? "إعداد" : "Setup") : (ar ? "غير نشطة" : "Inactive")}</button>)}
            </div>
            <div className="relative ms-auto min-w-[220px] flex-1 sm:max-w-[340px]"><Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={term} onChange={(event) => setTerm(event.target.value)} placeholder={ar ? "ابحث في الفروع..." : "Search branches..."} className="h-10 ps-9" /></div>
            <button type="button" className="qs-button-secondary min-h-10"><Filter className="size-4" />{ar ? "تصفية" : "Filter"}</button>
            <button type="button" onClick={exportCsv} className="qs-button-secondary min-h-10"><Download className="size-4" /></button>
          </div>

          {restaurants.isPending ? <Skeleton className="m-4 h-[520px] rounded-xl" /> : (
            <div className="qs-scroll overflow-x-auto">
              <table className="qs-table min-w-[900px]"><thead><tr><th>{ar ? "الفرع / الموقع" : "Branch / Location"}</th><th>{ar ? "الكود" : "Code"}</th><th>{ar ? "الحالة" : "Status"}</th><th>{ar ? "الخطة" : "Plan"}</th><th>{ar ? "الطلبات" : "Orders"}</th><th>{ar ? "المبيعات" : "Revenue"}</th><th>{ar ? "الإعداد" : "Health"}</th><th>{ar ? "إجراءات" : "Actions"}</th></tr></thead><tbody>{filtered.map((restaurant) => { const active = restaurant.is_active && !restaurant.archived_at; const health = healthOf(restaurant); return <tr key={restaurant.id}><td><div className="flex items-center gap-3"><span className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-xl bg-muted">{restaurant.logo_url ? <img src={restaurant.logo_url} alt="" className="size-full object-cover" loading="lazy" /> : <Store className="size-5 text-[#ff5a0a]" />}</span><div className="min-w-0"><Link to="/super-admin/restaurants/$restaurantId" params={{ restaurantId: restaurant.id }} className="truncate font-bold hover:underline">{restaurant.name}</Link><p className="max-w-[220px] truncate text-[10px] text-muted-foreground">{lang === "ar" ? restaurant.address_ar || restaurant.address_en || `/${restaurant.slug}` : restaurant.address_en || restaurant.address_ar || `/${restaurant.slug}`}</p></div></div></td><td className="font-mono text-xs text-muted-foreground">{restaurant.slug.toUpperCase().slice(0,8)}</td><td><span className={cn("qs-status", active ? "bg-emerald-500/12 text-emerald-600" : "bg-red-500/12 text-red-600")}><span className={cn("size-1.5 rounded-full", active ? "bg-emerald-500" : "bg-red-500")} />{active ? (ar ? "نشط" : "Active") : (ar ? "غير نشط" : "Inactive")}</span></td><td className="capitalize">{restaurant.subscription_plan}</td><td className="font-bold tabular-nums">{formatNumber(restaurant.orderCount, lang)}</td><td className="font-bold tabular-nums">{formatMoney(restaurant.revenue, restaurant.currency, lang)}</td><td><span className="text-xs font-semibold">{health.percent}%</span><div className="mt-1 h-1.5 w-20 rounded-full bg-muted"><div className="h-full rounded-full bg-[#ff5a0a]" style={{ width: `${health.percent}%` }} /></div></td><td><Link to="/super-admin/restaurants/$restaurantId" params={{ restaurantId: restaurant.id }} className="grid size-8 place-items-center rounded-lg border border-border hover:bg-muted"><Ellipsis className="size-4" /></Link></td></tr>; })}</tbody></table>
              {filtered.length === 0 ? <p className="p-12 text-center text-sm text-muted-foreground">{ar ? "لا توجد فروع مطابقة." : "No matching branches."}</p> : null}
            </div>
          )}
        </section>

        <aside className="space-y-4">
          <section className="qs-card overflow-hidden"><div className="flex items-center justify-between border-b border-border px-4 py-3"><h2 className="qs-section-title flex items-center gap-2"><MapPin className="size-4" />{ar ? "مواقع الفروع" : "Branch Locations"}</h2><span className="text-xs text-blue-600">{ar ? "عرض الكل" : "View all"} →</span></div><div className="relative min-h-[265px] overflow-hidden bg-[#17232d] p-5 text-white"><div className="absolute inset-0 opacity-20 [background-image:linear-gradient(35deg,transparent_45%,#7c8a95_46%,#7c8a95_48%,transparent_49%),linear-gradient(145deg,transparent_45%,#7c8a95_46%,#7c8a95_48%,transparent_49%)] [background-size:70px_70px]" /><div className="relative space-y-3">{data.slice(0,7).map((restaurant, index) => <Link key={restaurant.id} to="/super-admin/restaurants/$restaurantId" params={{ restaurantId: restaurant.id }} className="flex items-center gap-2 rounded-lg bg-white/[.06] px-3 py-2 text-xs hover:bg-white/[.1]"><MapPin className="size-4 shrink-0 text-[#ff5a0a]" /><span className="min-w-0 flex-1 truncate">{restaurant.name}</span><span className="text-white/45">{index + 1}</span></Link>)}</div></div></section>
          <section className="qs-card p-5"><div className="flex items-center gap-4"><div className="grid size-20 place-items-center rounded-full" style={{ background: `conic-gradient(#22c55e ${data.length ? (activeCount/data.length)*100 : 0}%, var(--muted) 0)` }}><div className="grid size-14 place-items-center rounded-full bg-card text-center"><span className="font-display text-lg font-bold">{data.length ? Math.round((activeCount/data.length)*100) : 0}%</span></div></div><div><p className="font-bold">{ar ? "الفروع النشطة" : "Active Branches"}</p><p className="mt-1 text-xs text-muted-foreground">{activeCount} {ar ? "من" : "of"} {data.length}</p><div className="mt-3 space-y-1 text-[10px] text-muted-foreground"><p><i className="me-1 inline-block size-2 rounded-full bg-emerald-500" />{ar ? "نشطة" : "Active"}: {activeCount}</p><p><i className="me-1 inline-block size-2 rounded-full bg-amber-400" />{ar ? "إعداد" : "Setup"}: {setupCount}</p><p><i className="me-1 inline-block size-2 rounded-full bg-red-500" />{ar ? "غير نشطة" : "Inactive"}: {inactiveCount}</p></div></div></div></section>
          <section className="qs-card p-5"><div className="flex gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-full bg-orange-50 text-[#ff5a0a]"><Building2 className="size-5" /></span><div><p className="font-bold">{ar ? "هل تريد التوسع؟" : "Looking to expand?"}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{ar ? "أنشئ فرعاً جديداً وابدأ إدارته خلال دقائق." : "Set up a new branch in minutes and start managing it immediately."}</p><Link to="/super-admin/restaurants/new" className="qs-button-secondary mt-4 min-h-9">{ar ? "إضافة فرع" : "Add New Branch"} →</Link></div></div></section>
        </aside>
      </div>
    </div>
  );
}

function Metric({ icon, value, label, detail, tone }: { icon: React.ReactNode; value: string; label: string; detail: string; tone: "orange" | "green" | "amber" | "red" }) {
  const toneClass = tone === "orange" ? "bg-orange-500/12 text-orange-600" : tone === "green" ? "bg-emerald-500/12 text-emerald-600" : tone === "amber" ? "bg-amber-500/12 text-amber-600" : "bg-red-500/12 text-red-600";
  return <div className="qs-stat flex items-center gap-4"><span className={`grid size-12 place-items-center rounded-full ${toneClass}`}>{icon}</span><div><p className="font-display text-2xl font-bold">{value}</p><p className="text-xs font-semibold text-muted-foreground">{label}</p><p className="mt-1 text-[10px] text-muted-foreground">{detail}</p></div></div>;
}
