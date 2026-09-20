import { supabase } from "@/integrations/supabase/client";

type PrintLang = "en" | "ar";

export type PrintOrderReceiptOptions = {
  orderId: string;
  lang: PrintLang;
  stationId?: string | null;
  includeTotals?: boolean;
};

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatAmount(value: unknown, currency: string, lang: PrintLang) {
  const amount = Number(value ?? 0);
  try {
    return new Intl.NumberFormat(lang === "ar" ? "ar-JO" : "en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: currency === "JOD" ? 3 : 2,
      maximumFractionDigits: currency === "JOD" ? 3 : 2,
    }).format(amount);
  } catch {
    return amount.toFixed(3) + " " + currency;
  }
}

function modifierLabel(value: unknown, lang: PrintLang) {
  if (!Array.isArray(value)) return "";
  return value.map((entry) => {
    if (!entry || typeof entry !== "object") return "";
    const row = entry as Record<string, unknown>;
    const preferred = lang === "ar" ? row.name_ar : row.name_en;
    return String(preferred ?? row.name_en ?? row.name_ar ?? row.name ?? "").trim();
  }).filter(Boolean).join(", ");
}

export async function printOrderReceipt(options: PrintOrderReceiptOptions) {
  if (typeof window === "undefined") throw new Error("Printing is only available in the browser");

  const popup = window.open("", "_blank", "width=440,height=760");
  if (!popup) throw new Error(options.lang === "ar" ? "اسمح بالنوافذ المنبثقة للطباعة" : "Allow pop-ups to print receipts");
  try { popup.opener = null; } catch { /* cross-browser */ }

  popup.document.write("<!doctype html><title>QuickServe</title><p style='font-family:system-ui;padding:24px'>Preparing receipt…</p>");

  try {
    const [orderRes, stationRes] = await Promise.all([
      (supabase as any)
        .from("orders")
        .select("id,restaurant_id,order_number,status,created_at,customer_notes,fulfillment_type,subtotal,tax_amount,service_amount,delivery_amount,discount_amount,tip_amount,total,currency,table:restaurant_tables(table_number,table_name),restaurant:restaurants(name,logo_url)")
        .eq("id", options.orderId)
        .maybeSingle(),
      options.stationId
        ? (supabase as any)
            .from("kitchen_stations")
            .select("id,name,print_width_mm")
            .eq("id", options.stationId)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);
    if (orderRes.error) throw orderRes.error;
    if (stationRes.error) throw stationRes.error;
    if (!orderRes.data) throw new Error("Order not found");

    let itemsQuery = (supabase as any)
      .from("order_items")
      .select("id,quantity,product_name_snapshot_en,product_name_snapshot_ar,notes,selected_modifiers,unit_price,total_price,kitchen_station_id,kitchen_station_name_snapshot")
      .eq("order_id", options.orderId)
      .order("created_at", { ascending: true });
    if (options.stationId) itemsQuery = itemsQuery.eq("kitchen_station_id", options.stationId);
    const itemsRes = await itemsQuery;
    if (itemsRes.error) throw itemsRes.error;

    const order = orderRes.data as any;
    const station = stationRes.data as any;
    const items = (itemsRes.data ?? []) as any[];
    const restaurant = order.restaurant ?? {};
    const table = order.table ?? null;
    const currency = String(order.currency || "JOD");
    const width = station?.print_width_mm === 58 ? 58 : 80;
    const ar = options.lang === "ar";
    const restaurantName = escapeHtml(restaurant.name || "QuickServe");
    const stationName = station?.name ? escapeHtml(station.name) : "";
    const orderNumber = escapeHtml(order.order_number);
    const tableLabel = table
      ? (ar ? "طاولة " : "Table ") + escapeHtml(table.table_name || table.table_number)
      : escapeHtml(order.fulfillment_type || (ar ? "طلب خارجي" : "Takeaway"));

    const itemHtml = items.map((item) => {
      const name = ar
        ? (item.product_name_snapshot_ar || item.product_name_snapshot_en)
        : (item.product_name_snapshot_en || item.product_name_snapshot_ar);
      const modifiers = modifierLabel(item.selected_modifiers, options.lang);
      return "<li class='item'><div class='item-main'><b class='qty'>×" + escapeHtml(item.quantity) + "</b><span class='name'>" + escapeHtml(name) + "</span>" +
        (options.includeTotals ? "<span class='price'>" + escapeHtml(formatAmount(item.total_price, currency, options.lang)) + "</span>" : "") +
        "</div>" +
        (modifiers ? "<div class='sub'>" + escapeHtml(modifiers) + "</div>" : "") +
        (item.notes ? "<div class='note'>⚠ " + escapeHtml(item.notes) + "</div>" : "") +
        (item.kitchen_station_name_snapshot && !stationName ? "<div class='station'>" + escapeHtml(item.kitchen_station_name_snapshot) + "</div>" : "") +
        "</li>";
    }).join("");

    const totals = options.includeTotals ? [
      [ar ? "المجموع الفرعي" : "Subtotal", order.subtotal],
      [ar ? "الضريبة" : "Tax", order.tax_amount],
      [ar ? "الخدمة" : "Service", order.service_amount],
      [ar ? "التوصيل" : "Delivery", order.delivery_amount],
      [ar ? "الخصم" : "Discount", Number(order.discount_amount) ? -Number(order.discount_amount) : 0],
      [ar ? "الإكرامية" : "Tip", order.tip_amount],
    ].filter((row) => Math.abs(Number(row[1] ?? 0)) > 0.0001).map((row) =>
      "<div class='total-row'><span>" + escapeHtml(row[0]) + "</span><span>" + escapeHtml(formatAmount(row[1], currency, options.lang)) + "</span></div>"
    ).join("") + "<div class='grand'><span>" + (ar ? "الإجمالي" : "Total") + "</span><span>" + escapeHtml(formatAmount(order.total, currency, options.lang)) + "</span></div>" : "";

    const html = "<!doctype html><html lang='" + options.lang + "' dir='" + (ar ? "rtl" : "ltr") + "'><head><meta charset='utf-8'><title>" +
      restaurantName + " · " + orderNumber + "</title><style>" +
      "@page{size:" + width + "mm auto;margin:3mm}*{box-sizing:border-box}body{margin:0 auto;width:" + (width - 6) + "mm;color:#111;font:12px/1.35 ui-monospace,SFMono-Regular,Consolas,monospace;background:#fff}" +
      ".head{text-align:center;padding-bottom:8px;border-bottom:1px dashed #555}.logo{max-width:34mm;max-height:18mm;object-fit:contain}.brand{font:700 17px/1.2 system-ui,sans-serif;margin:4px 0}.station-title{font-weight:800;font-size:13px;margin-top:3px}.meta{display:flex;justify-content:space-between;gap:8px;margin-top:5px;font-size:10px}.items{list-style:none;padding:0;margin:8px 0}.item{padding:7px 0;border-bottom:1px dashed #aaa}.item-main{display:flex;align-items:flex-start;gap:6px}.qty{min-width:20px}.name{flex:1;font-weight:700}.price{white-space:nowrap}.sub,.note,.station{font-size:10px;margin-top:2px;padding-inline-start:26px}.note{font-weight:700}.station{opacity:.7;text-transform:uppercase}.customer{margin:8px 0;padding:6px;border:1px dashed #777}.total-row,.grand{display:flex;justify-content:space-between;gap:8px;padding:2px 0}.grand{border-top:2px solid #111;margin-top:4px;padding-top:5px;font-weight:900;font-size:14px}.footer{text-align:center;margin-top:10px;padding-top:8px;border-top:1px dashed #555;font-size:9px}.no-print{display:block;margin:12px auto;padding:8px 14px;border:0;border-radius:8px;background:#111;color:#fff;font:600 12px system-ui;cursor:pointer}@media print{.no-print{display:none}}" +
      "</style></head><body><header class='head'>" +
      (restaurant.logo_url ? "<img class='logo' src='" + escapeHtml(restaurant.logo_url) + "' alt=''>" : "") +
      "<div class='brand'>" + restaurantName + "</div>" +
      (stationName ? "<div class='station-title'>" + stationName + "</div>" : "") +
      "<div class='meta'><span>" + (ar ? "طلب " : "Order ") + orderNumber + "</span><span>" + tableLabel + "</span></div>" +
      "<div class='meta'><span>" + escapeHtml(new Date(order.created_at).toLocaleString(ar ? "ar-JO" : "en-US")) + "</span><span>" + escapeHtml(order.status) + "</span></div>" +
      "</header><ol class='items'>" + (itemHtml || "<li class='item'>" + (ar ? "لا توجد عناصر لهذه المحطة" : "No items for this station") + "</li>") + "</ol>" +
      (order.customer_notes ? "<div class='customer'><b>" + (ar ? "ملاحظة العميل" : "Customer note") + ":</b><br>" + escapeHtml(order.customer_notes) + "</div>" : "") +
      totals +
      "<footer class='footer'>QuickServe · " + escapeHtml(orderNumber) + "</footer><button class='no-print' onclick='window.print()'>" + (ar ? "طباعة" : "Print") + "</button>" +
      "<script>setTimeout(function(){window.focus();window.print()},250)<\/script></body></html>";

    popup.document.open();
    popup.document.write(html);
    popup.document.close();
  } catch (error) {
    popup.close();
    throw error;
  }
}
