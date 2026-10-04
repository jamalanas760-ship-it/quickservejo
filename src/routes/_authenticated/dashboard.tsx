import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { ArrowUp, ArrowDown } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  normalizeHomeLayout,
  defaultHomeLayout,
  moveHomeSection,
  HOME_LABELS,
  type HomeLayout,
} from "@/lib/home-layout";
import { HomeMetricDetail, isHomeMetricId } from "@/components/dashboard/HomeMetricDetail";
import { HomeOverview, type HomeOverviewProps } from "@/components/home/HomeOverview";
import { homePeriodRange, type HomePeriod } from "@/lib/home-period";
import { useHomeOverview } from "@/hooks/useHomeOverview";
import { AppHeader } from "@/components/nav/AppHeader";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useAccess, useSupabaseSession } from "@/hooks/useSession";
import { useRestaurant } from "@/hooks/useSuperAdmin";
import { useWorkspaceScope } from "@/hooks/useWorkspace";
import { humanError } from "@/lib/errors";
import { formatMoney } from "@/lib/format";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Home — QuickServe" },
      { name: "description", content: "QuickServe restaurant workspace overview." },
    ],
  }),
  component: DashboardPage,
});

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function readHomeLayout(theme: unknown): HomeLayout {
  return normalizeHomeLayout(objectValue(objectValue(theme).workspace).homeOverviewLayout);
}

function DashboardPage() {
  const { lang } = useI18n();
  const ar = lang === "ar";
  const access = useAccess();
  const session = useSupabaseSession();
  const scope = useWorkspaceScope();
  const rid = scope.restaurantId;
  const restaurant = useRestaurant(rid ?? "");
  const timezone = restaurant.data?.timezone || "Asia/Amman";
  const [period, setPeriod] = useState<HomePeriod>("today");
  const range = homePeriodRange(period, timezone);
  const periodReport = useQuery<{sales:number;orderCount:number;bookingCount:number;orders:HomeOverviewProps["orders"];bookings:HomeOverviewProps["bookings"]}>({
    queryKey: ["workspace", "home-period", rid, range.start, range.end],
    enabled: Boolean(rid), staleTime: 20_000, refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("home_period_overview", { _restaurant_id: rid, _start: range.start, _end: range.end });
      if (error) throw error;
      return data;
    },
  });
  const canStaff = Boolean(rid && access.canFor(rid, "manage_staff"));
  const canInventory = Boolean(rid && access.canFor(rid, "manage_inventory"));
  const home = useHomeOverview(rid, canStaff, canInventory);
  const qc = useQueryClient();
  const currency = restaurant.data?.currency || scope.currency;
  const r = periodReport.data;
  const user = session.data?.user;
  const meta = user?.user_metadata as { full_name?: string; name?: string } | undefined;
  const currentMembership = (access.data ?? []).find((row) => row.restaurant_id === rid) ?? null;
  const canCustomize = Boolean(
    rid && (access.isSuperAdmin || currentMembership?.role === "restaurant_admin"),
  );
  const displayName =
    meta?.full_name ||
    meta?.name ||
    currentMembership?.name ||
    user?.email?.split("@")[0] ||
    (ar ? "مرحباً" : "there");
  const savedLayout = useMemo(
    () => readHomeLayout(restaurant.data?.menu_theme),
    [restaurant.data?.menu_theme],
  );
  const [layout, setLayout] = useState<HomeLayout>(savedLayout);
  const [draft, setDraft] = useState<HomeLayout>(savedLayout);
  const [customize, setCustomize] = useState(false);
  const [savingLayout, setSavingLayout] = useState(false);

  useEffect(() => {
    setLayout(savedLayout);
    if (!customize) setDraft(savedLayout);
  }, [savedLayout, customize]);

  const tableStats = useQuery({
    queryKey: ["workspace", "table-stats", rid],
    enabled: Boolean(rid),
    staleTime: 5_000,
    refetchInterval: rid ? 10_000 : false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("restaurant_tables")
        .select("id,service_status")
        .eq("restaurant_id", rid!)
        .eq("is_active", true);
      if (error) throw error;
      const rows = (data ?? []) as unknown as { service_status?: string | null }[];
      const occupied = rows.filter((row) =>
        ["active", "reserved"].includes(String(row.service_status ?? "")),
      ).length;
      const available = rows.filter(
        (row) => !row.service_status || row.service_status === "free",
      ).length;
      return { total: rows.length, occupied, available };
    },
  });

  useEffect(() => {
    if (!rid) return;
    const channel = supabase
      .channel(`dashboard-table-status:${rid}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "restaurant_tables",
          filter: `restaurant_id=eq.${rid}`,
        },
        () => void qc.invalidateQueries({ queryKey: ["workspace", "table-stats", rid] }),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [qc, rid]);


  const detailMetric =
    typeof window === "undefined"
      ? null
      : new URLSearchParams(window.location.search).get("detail");
  if (rid && isHomeMetricId(detailMetric))
    return (
      <HomeMetricDetail
        metric={detailMetric}
        restaurantId={rid}
        restaurantName={
          restaurant.data?.name ?? scope.restaurantName ?? (ar ? "المطعم" : "Restaurant")
        }
        currency={currency}
      />
    );

  async function saveHomeLayout() {
    if (!rid) return;
    setSavingLayout(true);
    try {
      const current = await supabase
        .from("restaurants")
        .select("menu_theme")
        .eq("id", rid)
        .single();
      if (current.error) throw current.error;
      const theme = objectValue(current.data.menu_theme);
      const workspace = objectValue(theme.workspace);
      const { error } = await supabase
        .from("restaurants")
        .update({
          menu_theme: { ...theme, workspace: { ...workspace, homeOverviewLayout: draft } },
        })
        .eq("id", rid)
        .select("id")
        .single();
      if (error) throw error;
      setLayout(draft);
      setCustomize(false);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["platform"] }),
        qc.invalidateQueries({ queryKey: ["staff", "memberships"] }),
      ]);
      toast.success(ar ? "تم حفظ تخطيط الصفحة الرئيسية" : "Home layout saved");
    } catch (error) {
      toast.error(humanError(error, lang));
    } finally {
      setSavingLayout(false);
    }
  }

  const upcomingReservations = r?.bookings ?? [];
  {
    const value = (query: { isPending: boolean; isError: boolean }, number: number | undefined) =>
      query.isPending ? "…" : query.isError ? "—" : String(number ?? 0);
    return (
      <div className="qs-home-surface min-h-dvh bg-background">
        <AppHeader />
        <HomeOverview
          layout={customize ? draft : layout}
          name={displayName}
          lang={lang}
          currency={currency}
          restaurantId={rid}
          timeZone={timezone}
          period={period}
          onPeriodChange={setPeriod}
          periodHint={`${range.firstDay} – ${range.lastDay}`}
          sales={
            periodReport.isPending
              ? "…"
              : periodReport.isError
                ? "—"
                : formatMoney(r?.sales ?? 0, currency, lang)
          }
          salesHint={
            ar
              ? `${value(periodReport, r?.orderCount)} طلبات خلال الفترة`
              : `${value(periodReport, r?.orderCount)} orders in selected period`
          }
          orders={r?.orders ?? []}
          orderTotal={value(periodReport, r?.orderCount)}
          orderHint={
            periodReport.isError
              ? ar
                ? "تعذر تحميل الطلبات"
                : "Orders unavailable"
              : ar
                ? "خلال الفترة المحددة"
                : "In selected period"
          }
          orderState={
            periodReport.isPending
              ? ar
                ? "جارٍ تحميل الطلبات…"
                : "Loading orders…"
              : periodReport.isError
                ? ar
                  ? "تعذر تحميل الطلبات. أعد المحاولة من صفحة الطلبات."
                  : "Couldn't load orders. Try the orders page."
                : undefined
          }
          tables={`${value(tableStats, tableStats.data?.occupied)} / ${value(tableStats, tableStats.data?.total)}`}
          tableHint={
            ar
              ? `${value(tableStats, tableStats.data?.available)} طاولات متاحة`
              : `${value(tableStats, tableStats.data?.available)} tables available`
          }
          team={`${value(home.workforce, home.workforce.data?.present)} / ${value(home.workforce, home.workforce.data?.total)}`}
          teamHint={ar ? "على رأس العمل الآن" : "On shift now"}
          bookings={upcomingReservations}
          bookingTotal={value(periodReport, r?.bookingCount)}
          bookingState={
            periodReport.isPending
              ? ar
                ? "جارٍ تحميل الحجوزات…"
                : "Loading bookings…"
              : periodReport.isError
                ? ar
                  ? "تعذر تحميل الحجوزات. أعد المحاولة من صفحة الحجوزات."
                  : "Couldn't load bookings. Try the schedule page."
                : undefined
          }
          lowStock={value(home.inventory, home.inventory.data)}
          pendingRequests={value(home.workforce, home.workforce.data?.pending)}
          readyOrders={value(home.orders, home.orders.data?.ready)}
          canStaff={canStaff}
          canInventory={canInventory}
          canMenu={Boolean(rid && access.canFor(rid, "manage_menu"))}
          canAnalytics={Boolean(rid && access.canFor(rid, "view_analytics"))}
          onCustomize={
            canCustomize
              ? () => {
                  setDraft(layout);
                  setCustomize(true);
                }
              : undefined
          }
        />
        <Dialog
          open={customize}
          onOpenChange={(open) => {
            if (!savingLayout) setCustomize(open);
          }}
        >
          <DialogContent className="qs-home-editor">
            <DialogHeader>
              <DialogTitle>{ar ? "تخصيص لوحة المعلومات" : "Customize dashboard"}</DialogTitle>
              <DialogDescription>
                {ar
                  ? "رتّب الأقسام واختر ما يظهر في الصفحة الرئيسية الجديدة."
                  : "Arrange sections and choose what appears on your Home page."}
              </DialogDescription>
            </DialogHeader>
            <div className="qs-home-editor-sections">
              {draft.order.map((id, index) => (
                <div key={id} className="qs-home-editor-row">
                  <Switch
                    aria-label={ar ? HOME_LABELS[id].ar : HOME_LABELS[id].en}
                    checked={!draft.hidden.includes(id)}
                    disabled={savingLayout}
                    onCheckedChange={(visible) =>
                      setDraft((current) => ({
                        ...current,
                        hidden: visible
                          ? current.hidden.filter((item) => item !== id)
                          : [...current.hidden, id],
                      }))
                    }
                  />
                  <strong>{ar ? HOME_LABELS[id].ar : HOME_LABELS[id].en}</strong>
                  <Button
                    size="icon"
                    variant="outline"
                    disabled={savingLayout || index === 0}
                    aria-label={`${ar ? "تحريك لأعلى" : "Move up"}: ${ar ? HOME_LABELS[id].ar : HOME_LABELS[id].en}`}
                    onClick={() => setDraft((current) => moveHomeSection(current, id, -1))}
                  >
                    <ArrowUp className="size-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="outline"
                    disabled={savingLayout || index === draft.order.length - 1}
                    aria-label={`${ar ? "تحريك لأسفل" : "Move down"}: ${ar ? HOME_LABELS[id].ar : HOME_LABELS[id].en}`}
                    onClick={() => setDraft((current) => moveHomeSection(current, id, 1))}
                  >
                    <ArrowDown className="size-4" />
                  </Button>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {ar
                ? "تُحفظ التغييرات لمساحة عمل المطعم."
                : "Changes are saved for your restaurant workspace."}
            </p>
            <div className="qs-home-editor-actions">
              <Button
                variant="outline"
                disabled={savingLayout}
                onClick={() => setDraft(defaultHomeLayout())}
              >
                {ar ? "استعادة الافتراضي" : "Reset"}
              </Button>
              <Button variant="outline" disabled={savingLayout} onClick={() => setCustomize(false)}>
                {ar ? "إلغاء" : "Cancel"}
              </Button>
              <Button disabled={savingLayout} onClick={() => void saveHomeLayout()}>
                {savingLayout ? (ar ? "جارٍ الحفظ…" : "Saving…") : ar ? "حفظ" : "Save layout"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  }
}
