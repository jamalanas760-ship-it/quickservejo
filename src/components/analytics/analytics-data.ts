export type AnalyticsOrder = {
  id: string;
  order_number: string;
  status: string;
  payment_status: string;
  total: number | string;
  table_id: string | null;
  fulfillment_type?: string;
  created_at: string;
};
export type AnalyticsItem = {
  order_id: string;
  menu_item_id: string | null;
  product_name_snapshot_en: string;
  product_name_snapshot_ar: string;
  quantity: number;
  total_price: number | string;
};
export type AnalyticsProduct = { id: string; image_url: string | null };

const calendarFormatters = new Map<string, Intl.DateTimeFormat>();
export function calendarKey(date: Date, timezone: string) {
  let formatter = calendarFormatters.get(timezone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    if (calendarFormatters.size >= 16) calendarFormatters.clear();
    calendarFormatters.set(timezone, formatter);
  }
  const parts = formatter.formatToParts(date);
  const value = (type: string) => parts.find((part) => part.type === type)!.value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}
function shiftKey(key: string, days: number) {
  const date = new Date(`${key}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
export function orderChannel(order: AnalyticsOrder) {
  if (order.fulfillment_type === "delivery") return "delivery";
  if (order.fulfillment_type === "pickup") return "pickup";
  return order.table_id ? "dine_in" : "pickup";
}
export function buildAnalytics(
  orders: AnalyticsOrder[],
  items: AnalyticsItem[],
  products: AnalyticsProduct[],
  days: number,
  timezone: string,
  lang: "ar" | "en",
  now = new Date(),
) {
  const ar = lang === "ar";
  const today = calendarKey(now, timezone);
  const start = shiftKey(today, 1 - days);
  const previousStart = shiftKey(start, -days);
  const inPeriod = orders.filter((order) => {
    const key = calendarKey(new Date(order.created_at), timezone);
    return key >= start && key <= today;
  });
  const live = inPeriod.filter((order) => order.status !== "cancelled");
  const previous = orders.filter((order) => {
    const key = calendarKey(new Date(order.created_at), timezone);
    return order.status !== "cancelled" && key >= previousStart && key < start;
  });
  const sum = (rows: AnalyticsOrder[]) =>
    rows.reduce((total, row) => total + Number(row.total || 0), 0);
  const revenue = sum(live);
  const collected = sum(live.filter((order) => order.payment_status === "paid"));
  const pending = sum(live.filter((order) => order.payment_status === "unpaid"));
  const refunded = sum(live.filter((order) => order.payment_status === "refunded"));
  const series = Array.from({ length: days }, (_, index) => {
    const key = shiftKey(start, index);
    return {
      key,
      label: new Intl.DateTimeFormat(ar ? "ar-JO" : "en-US", {
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      }).format(new Date(`${key}T12:00:00Z`)),
      sales: 0,
      orders: 0,
      previous: 0,
    };
  });
  const daily = new Map(series.map((row) => [row.key, row]));
  const peak = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    label: `${String(hour).padStart(2, "0")}:00`,
    orders: 0,
  }));
  const weekly = Array.from({ length: 7 }, (_, index) => ({
    day: (index + 1) % 7,
    label: new Intl.DateTimeFormat(ar ? "ar-JO" : "en-US", {
      weekday: "short",
      timeZone: "UTC",
    }).format(new Date(Date.UTC(2026, 0, 5 + index))),
    orders: 0,
    sales: 0,
    hours: Array.from({ length: 12 }, () => 0),
  }));
  const weekdayMap = new Map(weekly.map((row) => [row.day, row]));
  const hourFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    hourCycle: "h23",
  });
  for (const order of live) {
    const date = new Date(order.created_at);
    const key = calendarKey(date, timezone);
    const day = daily.get(key)!;
    day.sales += Number(order.total);
    day.orders += 1;
    const hour = Number(hourFormatter.format(date));
    peak[hour]!.orders += 1;
    const weekday = weekdayMap.get(new Date(`${key}T12:00:00Z`).getUTCDay())!;
    weekday.orders += 1;
    weekday.sales += Number(order.total);
    weekday.hours[Math.floor(hour / 2)]! += 1;
  }
  for (const order of previous) {
    const row = daily.get(shiftKey(calendarKey(new Date(order.created_at), timezone), days));
    if (row) row.previous += Number(order.total);
  }
  const orderIds = new Set(live.map((order) => order.id));
  const images = new Map(products.map((product) => [product.id, product.image_url]));
  const itemCounts = new Map<string, number>();
  const itemMap = new Map<
    string,
    { name: string; nameAr: string; qty: number; revenue: number; image: string | null }
  >();
  for (const item of items) {
    if (!orderIds.has(item.order_id)) continue;
    itemCounts.set(item.order_id, (itemCounts.get(item.order_id) || 0) + Number(item.quantity));
    const name =
      item.product_name_snapshot_en || item.product_name_snapshot_ar || (ar ? "منتج" : "Item");
    const key = item.menu_item_id || `${name}\u0000${item.product_name_snapshot_ar}`;
    const current = itemMap.get(key) || {
      name,
      nameAr: item.product_name_snapshot_ar || name,
      qty: 0,
      revenue: 0,
      image: item.menu_item_id ? images.get(item.menu_item_id) || null : null,
    };
    current.qty += Number(item.quantity);
    current.revenue += Number(item.total_price);
    itemMap.set(key, current);
  }
  const topProducts = [...itemMap.values()].sort((a, b) => b.qty - a.qty);
  const channelLabels = {
    dine_in: ar ? "داخل المطعم" : "Dine-in",
    pickup: ar ? "استلام" : "Pickup",
    delivery: ar ? "توصيل" : "Delivery",
  };
  const channels = Object.entries(channelLabels)
    .map(([key, name]) => ({
      name,
      value: live.filter((order) => orderChannel(order) === key).length,
    }))
    .filter((row) => row.value > 0);
  const recent = [...live].sort((a, b) => b.created_at.localeCompare(a.created_at));
  return {
    orders: live,
    revenue,
    collected,
    pending,
    refunded,
    collectionRate: revenue ? (collected / revenue) * 100 : 0,
    aov: live.length ? revenue / live.length : 0,
    paidRate: live.length
      ? (live.filter((order) => order.payment_status === "paid").length / live.length) * 100
      : 0,
    cancelRate: inPeriod.length ? ((inPeriod.length - live.length) / inPeriod.length) * 100 : 0,
    dineInShare: live.length
      ? (live.filter((order) => orderChannel(order) === "dine_in").length / live.length) * 100
      : 0,
    peakHour: peak.reduce((best, row) => (row.orders > best.orders ? row : best), peak[0]!),
    busiestDay: weekly.reduce((best, row) => (row.orders > best.orders ? row : best), weekly[0]!),
    topProduct: topProducts[0] || null,
    topProducts,
    itemCounts,
    channels,
    series,
    weekly,
    peak,
    recent,
    previousRevenue: sum(previous),
    previousOrders: previous.length,
    previousAov: previous.length ? sum(previous) / previous.length : 0,
  };
}
export function analyticsCsv(rows: Array<Array<string | number>>) {
  return (
    "\uFEFF" +
    rows
      .map((row) =>
        row
          .map((value) => {
            let text = String(value);
            if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
            return `"${text.replaceAll('"', '""')}"`;
          })
          .join(","),
      )
      .join("\r\n")
  );
}
