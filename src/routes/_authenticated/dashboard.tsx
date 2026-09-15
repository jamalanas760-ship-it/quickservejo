import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Clock3,
  ClipboardList,
  Receipt,
  RotateCcw,
  Settings2,
  ShoppingBag,
  Table2,
  Users,
  UtensilsCrossed,
} from "lucide-react";
import { toast } from "sonner";

import { AppHeader } from "@/components/nav/AppHeader";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useAccess, useSupabaseSession } from "@/hooks/useSession";
import { useRestaurant } from "@/hooks/useSuperAdmin";
import { useWorkspaceMembers, useWorkspaceReport, useWorkspaceScope } from "@/hooks/useWorkspace";
import { humanError } from "@/lib/errors";
import { formatDateTime, formatMoney, formatNumber } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { ROLE_LABELS } from "@/lib/permissions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Home — QuickServe" }, { name: "description", content: "QuickServe restaurant workspace overview." }] }),
  component: DashboardPage,
});

type HomeSectionId = "hero" | "metrics" | "quick" | "members" | "activity";
type HomeLayout = { order: HomeSectionId[]; hidden: HomeSectionId[] };
const DEFAULT_HOME_ORDER: HomeSectionId[] = ["hero", "metrics", "quick", "members", "activity"];
const HOME_SECTION_IDS = new Set<HomeSectionId>(DEFAULT_HOME_ORDER);

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function readHomeLayout(theme: unknown): HomeLayout {
  const workspace = objectValue(objectValue(theme).workspace);
  const raw = objectValue(workspace.homeDashboard);
  const saved = Array.isArray(raw.order) ? raw.order.filter((value): value is HomeSectionId => HOME_SECTION_IDS.has(value as HomeSectionId)) : [];
  const order = [...saved, ...DEFAULT_HOME_ORDER.filter((id) => !saved.includes(id))];
  const hidden = Array.isArray(raw.hidden) ? raw.hidden.filter((value): value is HomeSectionId => HOME_SECTION_IDS.has(value as HomeSectionId)) : [];
  return { order, hidden };
}

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
  const qc = useQueryClient();
  const currency = scope.currency;
  const r = report.data;
  const user = session.data?.user;
  const meta = user?.user_metadata as { full_name?: string; name?: string } | undefined;
  const currentMembership = (access.data ?? []).find((row) => row.restaurant_id === rid) ?? null;
  const canCustomize = Boolean(rid && (access.isSuperAdmin || currentMembership?.role === "restaurant_admin"));
  const displayName = meta?.full_name || meta?.name || currentMembership?.name || user?.email?.split("@")[0] || (ar ? "مرحباً" : "there");
  const savedLayout = useMemo(() => readHomeLayout(restaurant.data?.menu_theme), [restaurant.data?.menu_theme]);
  const [layout, setLayout] = useState<HomeLayout>(savedLayout);
  const [draft, setDraft] = useState<HomeLayout>(savedLayout);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [savingLayout, setSavingLayout] = useState(false);

  useEffect(() => {
    setLayout(savedLayout);
    if (!customizeOpen) setDraft(savedLayout);
  }, [savedLayout, customizeOpen]);

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
    { label: ar ? "متوسط وقت الطلب" : "Average Order Time", value: "—", icon: Clock3, tone: "gray" },
  ] as const;

  const quick = rid ? [
    { to: `/manage/${rid}/analytics`, label: ar ? "التحليلات" : "Analytics", hint: ar ? "عرض الرؤى" : "View insights", icon: BarChart3 },
    { to: `/manage/${rid}/orders`, label: ar ? "الطلبات" : "Orders", hint: ar ? "متابعة الطلبات" : "Track orders", icon: ClipboardList },
    { to: `/manage/${rid}`, label: ar ? "القائمة" : "Menu", hint: ar ? "تحديث القائمة" : "Update menu", icon: UtensilsCrossed },
    { to: `/manage/${rid}/tables`, label: ar ? "الطاولات" : "Tables", hint: ar ? "إدارة الطاولات" : "Manage tables", icon: Table2 },
    { to: `/manage/${rid}/staff`, label: ar ? "الفريق" : "Team", hint: ar ? "إدارة الفريق" : "Manage staff", icon: Users },
  ] : [];

  function moveDraft(id: HomeSectionId, delta: number) {
    setDraft((current) => {
      const order = [...current.order];
      const index = order.indexOf(id);
      const target = index + delta;
      if (index < 0 || target < 0 || target >= order.length) return current;
      [order[index], order[target]] = [order[target]!, order[index]!];
      return { ...current, order };
    });
  }
  function setVisible(id: HomeSectionId, visible: boolean) {
    setDraft((current) => ({ ...current, hidden: visible ? current.hidden.filter((value) => value !== id) : [...new Set([...current.hidden, id])] }));
  }
  async function saveHomeLayout() {
    if (!rid) return;
    setSavingLayout(true);
    try {
      const current = await supabase.from("restaurants").select("menu_theme").eq("id", rid).single();
      if (current.error) throw current.error;
      const theme = objectValue(current.data.menu_theme);
      const workspace = objectValue(theme.workspace);
      const { error } = await supabase.from("restaurants").update({ menu_theme: { ...theme, workspace: { ...workspace, homeDashboard: draft } } }).eq("id", rid);
      if (error) throw error;
      setLayout(draft);
      setCustomizeOpen(false);
      await qc.invalidateQueries({ queryKey: ["platform"] });
      toast.success(ar ? "تم حفظ تخطيط الصفحة الرئيسية" : "Home layout saved");
    } catch (error) {
      toast.error(humanError(error, lang));
    } finally {
      setSavingLayout(false);
    }
  }

  const labels: Record<HomeSectionId, { en: string; ar: string; hintEn: string; hintAr: string }> = {
    hero: { en: "Welcome banner", ar: "واجهة الترحيب", hintEn: "Cover image, greeting and restaurant context", hintAr: "الغلاف والترحيب ومعلومات المطعم" },
    metrics: { en: "KPI cards", ar: "بطاقات المؤشرات", hintEn: "Sales, orders, tables and service metrics", hintAr: "المبيعات والطلبات والطاولات ومؤشرات الخدمة" },
    quick: { en: "Quick Access", ar: "الوصول السريع", hintEn: "Analytics, orders, menu, tables and team", hintAr: "التحليلات والطلبات والقائمة والطاولات والفريق" },
    members: { en: "Workspace Members", ar: "أعضاء مساحة العمل", hintEn: "Team overview and status", hintAr: "ملخص الفريق وحالته" },
    activity: { en: "Recent Activity", ar: "النشاط الأخير", hintEn: "Latest restaurant orders and activity", hintAr: "أحدث الطلبات والنشاط" },
  };

  function renderSection(id: HomeSectionId) {
    if (layout.hidden.includes(id)) return null;
    if (id === "hero") return <section key={id} className="qs-hero-card">
      <img src={hero} alt="" className="qs-hero-media" loading="eager" />
      <div className="qs-hero-overlay" />
      <div className="relative z-10 flex min-h-[220px] flex-col justify-between p-6 text-white sm:p-8">
        <div><p className="text-[10px] font-bold uppercase tracking-[.28em] text-white/70">QuickServe</p><h1 className="mt-3 max-w-2xl font-display text-[clamp(2rem,3vw,3.2rem)] font-bold leading-[1.03] tracking-[-.05em]">{ar ? `أهلاً بعودتك، ${displayName}` : `Welcome back, ${displayName}`} 👋</h1><p className="mt-2 text-sm text-white/78">{ar ? `هذا ما يحدث في ${restaurant.data?.name ?? scope.restaurantName ?? "مطعمك"} اليوم.` : `Here’s what’s happening at ${restaurant.data?.name ?? scope.restaurantName ?? "your restaurant"} today.`}</p></div>
        <div className="mt-6 flex flex-wrap gap-2 text-xs font-semibold"><span className="rounded-xl border border-white/20 bg-black/20 px-3 py-2 backdrop-blur-sm">{today}</span><span className="rounded-xl border border-white/20 bg-black/20 px-3 py-2 backdrop-blur-sm">{restaurant.data?.name ?? scope.restaurantName ?? (ar ? "المطعم" : "Restaurant")}</span></div>
      </div>
    </section>;
    if (id === "metrics") return report.isPending || tableCount.isPending ? <div key={id} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map((index) => <Skeleton key={index} className="h-[116px] rounded-2xl" />)}</div> : <section key={id} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{metrics.map(({ label, value, icon: Icon, tone }) => <article key={label} className="qs-stat flex items-center gap-4"><span className={`grid size-11 shrink-0 place-items-center rounded-full ${tone === "orange" ? "bg-orange-50 text-[#ff5a0a] dark:bg-orange-950/30" : tone === "green" ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30" : tone === "blue" ? "bg-blue-50 text-blue-600 dark:bg-blue-950/30" : "bg-slate-100 text-slate-600 dark:bg-slate-800"}`}><Icon className="size-5" /></span><div className="min-w-0"><p className="text-[11px] font-semibold text-muted-foreground">{label}</p><p className="mt-1 truncate font-display text-[24px] font-bold tracking-[-.035em]">{value}</p></div></article>)}</section>;
    if (id === "quick") return <section key={id}><div className="mb-3 flex items-end justify-between gap-3"><h2 className="qs-section-title text-lg">{ar ? "وصول سريع" : "Quick Access"}</h2><p className="hidden text-xs text-muted-foreground sm:block">{ar ? "كل ما تحتاجه في مكان واحد." : "Everything you need, right here."}</p></div><div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">{quick.map(({ to, label, hint, icon: Icon }, index) => <Link key={to} to={to as never} className={`qs-quick-tile ${index === 0 ? "border-orange-300 bg-orange-50/50 dark:bg-orange-950/10" : ""}`}><span className="qs-quick-icon"><Icon className="size-5" /></span><span><strong className="block text-sm">{label}</strong><span className="mt-1 block text-[11px] text-muted-foreground">{hint}</span></span><ChevronRight className="ms-auto size-4 text-muted-foreground" /></Link>)}</div></section>;
    if (id === "members") return <section key={id} className="qs-card overflow-hidden"><div className="flex items-center justify-between border-b border-border px-5 py-4"><h2 className="qs-section-title text-lg">{ar ? "أعضاء مساحة العمل" : "Workspace Members"}</h2>{rid ? <Link to="/manage/$restaurantId/staff" params={{ restaurantId: rid }} className="text-xs font-bold text-[#ff5a0a]">{ar ? "إدارة" : "Manage"} →</Link> : null}</div><div className="p-4 sm:p-5">{members.isPending ? <Skeleton className="h-20 rounded-xl" /> : <div className="grid gap-2 md:grid-cols-2">{(members.data ?? []).slice(0, 4).map((member) => <div key={member.id} className="flex items-center gap-3 rounded-xl border border-border px-3 py-3"><span className="grid size-10 shrink-0 place-items-center rounded-full bg-muted font-bold">{member.name.slice(0, 1).toUpperCase()}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold">{member.name}</span><span className="text-[11px] text-muted-foreground">{ROLE_LABELS[member.role]?.[lang] ?? member.role}</span></span><span className={`size-2 rounded-full ${member.is_active ? "bg-emerald-500" : "bg-slate-400"}`} /></div>)}{(members.data ?? []).length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground md:col-span-2">{ar ? "لا يوجد أعضاء بعد." : "No workspace members yet."}</p> : null}</div>}</div></section>;
    return <section key={id} className="qs-card overflow-hidden"><div className="flex items-center justify-between border-b border-border px-5 py-4"><h2 className="qs-section-title text-lg">{ar ? "النشاط الأخير" : "Recent Activity"}</h2>{rid ? <Link to="/manage/$restaurantId/orders" params={{ restaurantId: rid }} className="text-xs font-bold text-[#ff5a0a]">{ar ? "عرض الكل" : "View all"}</Link> : null}</div><div className="divide-y divide-border">{(r?.recent ?? []).map((order, index) => <div key={order.id} className="flex items-center gap-3 px-5 py-3.5"><span className={`grid size-9 shrink-0 place-items-center rounded-full ${index % 3 === 0 ? "bg-emerald-50 text-emerald-600" : index % 3 === 1 ? "bg-blue-50 text-blue-600" : "bg-violet-50 text-violet-600"}`}><Receipt className="size-4" /></span><span className="min-w-0 flex-1"><strong className="block truncate text-sm">{ar ? "طلب" : "Order"} {order.order_number}</strong><span className="block truncate text-[11px] text-muted-foreground">{order.status} · {order.table ? `${ar ? "طاولة" : "Table"} ${order.table}` : ar ? "خارجي" : "Takeaway"}</span></span><span className="shrink-0 text-[10px] text-muted-foreground">{formatDateTime(order.created_at, lang)}</span></div>)}{(r?.recent ?? []).length === 0 ? <p className="px-5 py-10 text-center text-sm text-muted-foreground">{ar ? "لا يوجد نشاط بعد." : "No recent activity yet."}</p> : null}</div></section>;
  }

  return <div className="min-h-dvh bg-background">
    <AppHeader />
    <main className="qs-page space-y-5">
      {canCustomize ? <div className="flex justify-end"><button type="button" className="qs-button-secondary" onClick={() => { setDraft(layout); setCustomizeOpen(true); }}><Settings2 className="size-4" />{ar ? "تخصيص الصفحة الرئيسية" : "Customize Home"}</button></div> : null}
      {layout.order.map(renderSection)}
    </main>

    <Dialog open={customizeOpen} onOpenChange={(open) => { if (!savingLayout) setCustomizeOpen(open); }}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-hidden sm:max-w-2xl">
        <DialogHeader><DialogTitle>{ar ? "تخصيص الصفحة الرئيسية" : "Customize Home"}</DialogTitle><DialogDescription>{ar ? "اختر الأقسام الظاهرة ورتبها حسب طريقة عمل فريقك. يتم حفظ التخطيط لهذا المطعم فقط." : "Choose which sections are visible and arrange them around your team's workflow. This layout is saved only for this restaurant."}</DialogDescription></DialogHeader>
        <div className="max-h-[60dvh] space-y-2 overflow-y-auto pe-1">{draft.order.map((id, index) => {
          const item = labels[id];
          const visible = !draft.hidden.includes(id);
          return <div key={id} className={cn("flex min-h-[76px] items-center gap-3 rounded-2xl border border-border bg-card p-3 transition", !visible && "opacity-60")}><div className="min-w-0 flex-1"><strong className="block text-sm">{ar ? item.ar : item.en}</strong><span className="mt-1 block text-xs leading-5 text-muted-foreground">{ar ? item.hintAr : item.hintEn}</span></div><div className="flex shrink-0 items-center gap-1"><Switch checked={visible} onCheckedChange={(value) => setVisible(id, value)} aria-label={ar ? item.ar : item.en} /><button type="button" disabled={index === 0} onClick={() => moveDraft(id, -1)} className="grid size-11 place-items-center rounded-xl hover:bg-muted disabled:opacity-25" aria-label={ar ? "تحريك لأعلى" : "Move up"}><ChevronUp className="size-4" /></button><button type="button" disabled={index === draft.order.length - 1} onClick={() => moveDraft(id, 1)} className="grid size-11 place-items-center rounded-xl hover:bg-muted disabled:opacity-25" aria-label={ar ? "تحريك لأسفل" : "Move down"}><ChevronDown className="size-4" /></button></div></div>;
        })}</div>
        <div className="flex items-center justify-between gap-3 rounded-xl bg-muted/40 p-3"><span className="text-xs text-muted-foreground">{ar ? "يمكنك استعادة ترتيب QuickServe الافتراضي في أي وقت." : "You can restore the QuickServe default layout at any time."}</span><Button type="button" variant="ghost" className="shrink-0" onClick={() => setDraft({ order: [...DEFAULT_HOME_ORDER], hidden: [] })}><RotateCcw className="size-4" />{ar ? "الافتراضي" : "Defaults"}</Button></div>
        <DialogFooter><Button variant="ghost" disabled={savingLayout} onClick={() => setCustomizeOpen(false)}>{ar ? "إلغاء" : "Cancel"}</Button><Button disabled={savingLayout} onClick={() => void saveHomeLayout()}>{savingLayout ? (ar ? "جارٍ الحفظ…" : "Saving…") : (ar ? "حفظ التخطيط" : "Save Layout")}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </div>;
}
