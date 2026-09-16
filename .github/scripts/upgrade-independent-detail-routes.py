from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, content: str) -> None:
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content.rstrip() + "\n", encoding="utf-8")


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly one match, found {count}")
    return text.replace(old, new, 1)


# Home KPI cards now navigate to true independent URLs.
path = "src/routes/_authenticated/dashboard.tsx"
text = read(path)
text = replace_once(
    text,
    'href={`/dashboard?detail=${id}`}',
    'href={`/dashboard/${id}`}',
    "dashboard KPI link",
)
write(path, text)

# True non-nested dashboard detail route. The trailing underscore follows
# TanStack Router's file-route convention so /dashboard/:metric is not
# rendered inside dashboard.tsx and therefore does not require an Outlet there.
write(
    "src/routes/_authenticated/dashboard_/$metric.tsx",
    '''import { createFileRoute, redirect } from "@tanstack/react-router";

import { HomeMetricDetail, isHomeMetricId } from "@/components/dashboard/HomeMetricDetail";
import { useRestaurant } from "@/hooks/useSuperAdmin";
import { useWorkspaceScope } from "@/hooks/useWorkspace";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/dashboard_/$metric")({
  beforeLoad: ({ params }) => {
    if (!isHomeMetricId(params.metric)) throw redirect({ to: "/dashboard" });
  },
  component: DashboardMetricPage,
});

function DashboardMetricPage() {
  const { metric } = Route.useParams();
  const { lang } = useI18n();
  const ar = lang === "ar";
  const scope = useWorkspaceScope();
  const restaurantId = scope.restaurantId;
  const restaurant = useRestaurant(restaurantId ?? "");

  if (!restaurantId || !isHomeMetricId(metric)) {
    return (
      <div className="qs-page">
        <div className="qs-card p-8 text-center text-sm text-muted-foreground">
          {ar ? "اختر مطعماً لعرض تفاصيل المؤشر." : "Select a restaurant to view this metric."}
        </div>
      </div>
    );
  }

  return (
    <HomeMetricDetail
      metric={metric}
      restaurantId={restaurantId}
      restaurantName={restaurant.data?.name ?? scope.restaurantName ?? (ar ? "المطعم" : "Restaurant")}
      currency={scope.currency}
    />
  );
}
''',
)

# Analytics manager accepts a route-provided detail id while retaining the old
# search-param path as backwards compatibility for any saved links.
path = "src/components/manage/AnalyticsManagerPro.tsx"
text = read(path)
text = replace_once(
    text,
    'import { AnalyticsDetailPage, isAnalyticsDetailWidget } from "@/components/manage/AnalyticsDetailPage";',
    'import { AnalyticsDetailPage, isAnalyticsDetailWidget, type AnalyticsDetailWidgetId } from "@/components/manage/AnalyticsDetailPage";',
    "analytics detail import",
)
text = replace_once(
    text,
    'export function AnalyticsManagerPro({ restaurantId }: { restaurantId: string }) {',
    'export function AnalyticsManagerPro({ restaurantId, detailWidget: detailWidgetProp = null }: { restaurantId: string; detailWidget?: AnalyticsDetailWidgetId | null }) {',
    "analytics manager signature",
)
text = replace_once(
    text,
    '  const detailWidget = typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("detail");\n  if (isAnalyticsDetailWidget(detailWidget)) return <AnalyticsDetailPage widget={detailWidget} restaurantId={restaurantId} labels={labels} data={data} currency={currency} lang={lang} />;',
    '  const searchDetailWidget = typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("detail");\n  const detailWidget = detailWidgetProp ?? (isAnalyticsDetailWidget(searchDetailWidget) ? searchDetailWidget : null);\n  if (detailWidget) return <AnalyticsDetailPage widget={detailWidget} restaurantId={restaurantId} labels={labels} data={data} currency={currency} lang={lang} />;',
    "analytics detail selection",
)
text = replace_once(
    text,
    'href={`/manage/${restaurantId}/analytics?detail=${id}`}',
    'href={`/manage/${restaurantId}/analytics/${id}`}',
    "analytics widget detail link",
)
write(path, text)

# Analytics detail sub-navigation now switches between independent pages.
path = "src/components/manage/AnalyticsDetailPage.tsx"
text = read(path)
text = replace_once(
    text,
    'href={`${base}?detail=${id}`}',
    'href={`${base}/${id}`}',
    "analytics detail subnav",
)
write(path, text)

# True non-nested analytics detail route. It remains a child of the restaurant
# workspace shell, so tenant permissions, theming and AppHeader continue to apply.
write(
    "src/routes/_authenticated/manage/$restaurantId/analytics_/$widgetId.tsx",
    '''import { createFileRoute, redirect } from "@tanstack/react-router";

import { AnalyticsDetailPage, isAnalyticsDetailWidget } from "@/components/manage/AnalyticsDetailPage";
import { AnalyticsManagerPro } from "@/components/manage/AnalyticsManagerPro";

export const Route = createFileRoute("/_authenticated/manage/$restaurantId/analytics_/$widgetId")({
  beforeLoad: ({ params }) => {
    if (!isAnalyticsDetailWidget(params.widgetId)) {
      throw redirect({
        to: "/manage/$restaurantId/analytics",
        params: { restaurantId: params.restaurantId },
      });
    }
  },
  component: AnalyticsWidgetDetailPage,
});

function AnalyticsWidgetDetailPage() {
  const { restaurantId, widgetId } = Route.useParams();
  if (!isAnalyticsDetailWidget(widgetId)) return null;
  return <AnalyticsManagerPro restaurantId={restaurantId} detailWidget={widgetId} />;
}

// Keep this import referenced so the route and detail component stay coupled at
// compile time if the supported widget-id union changes.
void AnalyticsDetailPage;
''',
)

# Remove the compile-time-only component import workaround in favor of a type-safe
# helper import only; the route renders through AnalyticsManagerPro.
route_path = ROOT / "src/routes/_authenticated/manage/$restaurantId/analytics_/$widgetId.tsx"
route_text = route_path.read_text(encoding="utf-8")
route_text = route_text.replace(
    'import { AnalyticsDetailPage, isAnalyticsDetailWidget } from "@/components/manage/AnalyticsDetailPage";',
    'import { isAnalyticsDetailWidget } from "@/components/manage/AnalyticsDetailPage";',
)
route_text = route_text.replace('\n// Keep this import referenced so the route and detail component stay coupled at\n// compile time if the supported widget-id union changes.\nvoid AnalyticsDetailPage;\n', '\n')
route_path.write_text(route_text, encoding="utf-8")

# Regression assertions: all original requested areas must still be present.
assert 'setActiveZone("all");setSelectedZoneId(zone.id);' in read("src/components/manage/TablesManagerPro.tsx")
assert 'All Zones' in read("src/components/manage/TablesManagerPro.tsx")
assert 'ApplicationColorStudio' in read("src/components/manage/RestaurantAppearance.tsx")
assert '/dashboard/${id}' in read("src/routes/_authenticated/dashboard.tsx")
assert '/analytics/${id}' in read("src/components/manage/AnalyticsManagerPro.tsx")
assert 'analytics_/$widgetId' in read("src/routes/_authenticated/manage/$restaurantId/analytics_/$widgetId.tsx")

print("Independent QuickServe detail routes applied successfully.")
