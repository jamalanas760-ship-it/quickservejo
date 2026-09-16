import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  ChevronRight,
  Clock3,
  ClipboardList,
  Home,
  Receipt,
  ShoppingBag,
  Table2,
  Users,
  UtensilsCrossed,
} from "lucide-react";

import { AppHeader } from "@/components/nav/AppHeader";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useAccess, useSupabaseSession } from "@/hooks/useSession";
import { useRestaurant } from "@/hooks/useSuperAdmin";
import { useWorkspaceMembers, useWorkspaceReport, useWorkspaceScope } from "@/hooks/useWorkspace";
import { formatDateTime, formatMoney, formatNumber } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { ROLE_LABELS } from "@/lib/permissions";
import { avatarPresetUrl } from "@/lib/avatar-presets";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Home — QuickServe" }, { name: "description", content: "QuickServe restaurant workspace overview." }] }),
  component: DashboardPage,
});

function DashboardPage() {
  const { lang } = useI18n();
  const ar = lang === "ar";
  const access = useAccess();
  const session = useSupabaseSession();
  const scope = useWorkspaceScope();
  const rid = scope.restaurantId;
  const report = useWorkspaceReport(rid);
  const members = useWorkspaceMembers(rid);
  const restaurant = useRestaurant(rid ?? "");
  const currency = scope.currency;
  const r = report.data;
  const user = session.data?.user;
  const meta = user?.user_metadata as { full_name?: string; name?: string } | undefined;
  const currentMembership = (access.data ?? []).find((row) => row.restaurant_id === rid) ?? null;
  const displayName = meta?.full_name || meta?.name || currentMembership?.name || user?.email?.split("@")[0] || (ar ? "مرحباً" : "there");

  const tableCount = useQuery({
    queryKey: ["workspace", "active-table-count", rid],
    enabled: Boolean(rid),
    staleTime: 30_000,
    queryFn: async () => {
      const { count, error } = await supabase.from("restaurant_tables").select("id", { count: "exact", head: true }).eq("restaurant_id", rid!).eq("is_active", true);
      if (error) throw error;
      return count ?? 0;
    },
  });

  const today = new Intl.DateTimeFormat(ar ? "ar-JO" : "en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" }).format(new Date());
  const hero = restaurant.data?.cover_image_url || "/signin-restaurant.webp";

  const metrics = [
    { label: ar ? "مبيعات اليوم" : "Sales Today", value: formatMoney(r?.salesToday ?? 0, currency, lang), icon: ShoppingBag, tone: "orange" },
    { label: ar ? "إجمالي الطلبات" : "Total Orders", value: formatNumber(r?.ordersToday ?? 0, lang), icon: ClipboardList, tone: "green" },
    { label: ar ? "الطاولات المفتوحة" : "Open Tables", value: String(tableCount.data ?? 0), icon: Table2, tone: "blue" },
    { label: ar ? "متوسط وقت الطلب" : "Average Order Time", value: "0 min", icon: Clock3, tone: "gray" },
  ] as const;

  const quick = rid ? [
    { to: `/manage/${rid}/analytics`, label: ar ? "التحليلات" : "Analytics", hint: ar ? "عرض الرؤى" : "View insights", icon: BarChart3 },
    { to: `/manage/${rid}/orders`, label: ar ? "الطلبات" : "Orders", hint: ar ? "متابعة الطلبات" : "Track orders", icon: ClipboardList },
    { to: `/manage/${rid}`, label: ar ? "القائمة" : "Menu", hint: ar ? "تحديث القائمة" : "Update menu", icon: UtensilsCrossed },
    { to: `/manage/${rid}/tables`, label: ar ? "الطاولات" : "Tables", hint: ar ? "إدارة الطاولات" : "Manage tables", icon: Table2 },
    { to: `/manage/${rid}/staff`, label: ar ? "الفريق" : "Team", hint: ar ? "إدارة الفريق" : "Manage team", icon: UsersRound },
  ] : [];

  return (
    <div className="min-h-dvh bg-background">
      <AppHeader />
      <main className="qs-page space-y-5">
        <section className="qs-hero-card">
          <img src={hero} alt="" className="qs-hero-media" loading="eager" />
          <div className="qs-hero-overlay" />
          <div className="relative z-10 flex min-h-[220px] flex-col justify-between p-6 text-white sm:p-8">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[.28em] text-white/70">QuickServe</p>
              <h1 className="mt-3 max-w-2xl font-display text-[clamp(2rem,3vw,3.2rem)] font-bold leading-[1.03] tracking-[-.05em]">{ar ? `أهلاً بعودتك، ${displayName}` : `Welcome back, ${displayName}`} 👋</h1>
              <p className="mt-2 text-sm text-white/78">{ar ? `هذا ما يحدث في ${restaurant.data?.name ?? scope.restaurantName ?? "مطعمك"} اليوم.` : `Here’s what’s happening at ${restaurant.data?.name ?? scope.restaurantName ?? "your restaurant"} today.`}</p>
            </div>
            <div className="mt-6 flex flex-wrap gap-2 text-xs font-semibold">
              <span className="rounded-xl border border-white/20 bg-black/20 px-3 py-2 backdrop-blur-sm">{today}</span>
              <span className="rounded-xl border border-white/20 bg-black/20 px-3 py-2 backdrop-blur-sm">{restaurant.data?.name ?? scope.restaurantName ?? (ar ? "المطعم" : "Restaurant")}</span>
            </div>
          </div>
        </section>

        {report.isPending || tableCount.isPending ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[0,1,2,3].map((i) => <Skeleton key={i} className="h-[116px] rounded-2xl" />)}</div>
        ) : (
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {metrics.map(({ label, value, icon: Icon, tone }) => (
              <article key={label} className="qs-stat flex items-center gap-4">
                <span className={`grid size-11 shrink-0 place-items-center rounded-full ${tone === "orange" ? "bg-orange-50 text-[#ff5a0a] dark:bg-orange-950/30" : tone === "green" ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30" : tone === "blue" ? "bg-blue-50 text-blue-600 dark:bg-blue-950/30" : "bg-slate-100 text-slate-600 dark:bg-slate-800"}`}><Icon className="size-5" /></span>
                <div className="min-w-0"><p className="text-[11px] font-semibold text-muted-foreground">{label}</p><p className="mt-1 truncate font-display text-[24px] font-bold tracking-[-.035em]">{value}</p><p className="mt-1 text-[10px] font-semibold text-emerald-600">↗ 0% <span className="font-normal text-muted-foreground">{ar ? "مقارنة بالأمس" : "vs. yesterday"}</span></p></div>
              </article>
            ))}
          </section>
        )}

        <section>
          <div className="mb-3 flex items-end justify-between gap-3"><div><h2 className="qs-section-title text-lg">{ar ? "وصول سريع" : "Quick Access"}</h2></div><p className="hidden text-xs text-muted-foreground sm:block">{ar ? "كل ما تحتاجه في مكان واحد." : "Everything you need, right here."}</p></div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
            {quick.map(({ to, label, hint, icon: Icon }) => (
              <Link key={to} to={to as never} className="qs-quick-tile">
                <span className="qs-quick-icon"><Icon className="size-5" /></span>
                <span><strong className="block text-sm">{label}</strong><span className="mt-1 block text-[11px] text-muted-foreground">{hint}</span></span>
                <ChevronRight className="absolute hidden" />
              </Link>
            ))}
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-2">
          <div className="qs-card overflow-hidden">
            <div className="flex items-center justify-between border-b border-border px-5 py-4"><h2 className="qs-section-title text-lg">{ar ? "أعضاء مساحة العمل" : "Workspace Members"}</h2>{rid ? <Link to="/manage/$restaurantId/staff" params={{ restaurantId: rid }} className="text-xs font-bold text-[#ff5a0a]">{ar ? "إدارة" : "Manage"} →</Link> : null}</div>
            <div className="p-4 sm:p-5">
              {members.isPending ? <Skeleton className="h-20 rounded-xl" /> : (
                <div className="space-y-2">
                  {(members.data ?? []).slice(0, 4).map((member) => {
                    const avatar = member.avatar_url || avatarPresetUrl(member.avatar_preset);
                    return (
                    <div key={member.id} className="flex items-center gap-3 rounded-xl border border-border px-3 py-3">
                      <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-full bg-muted font-bold">{avatar ? <img src={avatar} alt="" className="size-full object-cover" loading="lazy" /> : member.name.slice(0,1).toUpperCase()}</span>
                      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold">{member.name}</span><span className="text-[11px] text-muted-foreground">{ROLE_LABELS[member.role]?.[lang] ?? member.role}</span></span>
                      <span className={`size-2 rounded-full ${member.is_active ? "bg-emerald-500" : "bg-slate-400"}`} />
                    </div>);
                  })}
                  {(members.data ?? []).length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">{ar ? "لا يوجد أعضاء بعد." : "No workspace members yet."}</p> : null}
                </div>
              )}
            </div>
          </div>

          <div className="qs-card overflow-hidden">
            <div className="flex items-center justify-between border-b border-border px-5 py-4"><h2 className="qs-section-title text-lg">{ar ? "النشاط الأخير" : "Recent Activity"}</h2>{rid ? <Link to="/manage/$restaurantId/orders" params={{ restaurantId: rid }} className="text-xs font-bold text-[#ff5a0a]">{ar ? "عرض الكل" : "View all"}</Link> : null}</div>
            <div className="divide-y divide-border">
              {(r?.recent ?? []).map((order, index) => (
                <div key={order.id} className="flex items-center gap-3 px-5 py-3.5">
                  <span className={`grid size-9 shrink-0 place-items-center rounded-full ${index % 3 === 0 ? "bg-emerald-50 text-emerald-600" : index % 3 === 1 ? "bg-blue-50 text-blue-600" : "bg-violet-50 text-violet-600"}`}><Receipt className="size-4" /></span>
                  <span className="min-w-0 flex-1"><strong className="block truncate text-sm">{ar ? "طلب" : "Order"} {order.order_number}</strong><span className="block truncate text-[11px] text-muted-foreground">{order.status} · {order.table ? `${ar ? "طاولة" : "Table"} ${order.table}` : ar ? "خارجي" : "Takeaway"}</span></span>
                  <span className="shrink-0 text-[10px] text-muted-foreground">{formatDateTime(order.created_at, lang)}</span>
                </div>
              ))}
              {(r?.recent ?? []).length === 0 ? <p className="px-5 py-10 text-center text-sm text-muted-foreground">{ar ? "لا يوجد نشاط بعد." : "No recent activity yet."}</p> : null}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
