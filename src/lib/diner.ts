import { supabase } from "@/integrations/supabase/client";
import { parseMenuTheme, type MenuTheme } from "@/lib/menu-theme";

export type DinerModifier = { id: string; name_en: string; name_ar: string; price_delta: number };
export type DinerGroup = { id: string; name_en: string; name_ar: string; is_required: boolean; min_selection: number; max_selection: number; modifiers: DinerModifier[] };
export type DinerItem = { id: string; category_id: string | null; name_en: string; name_ar: string; description_en: string | null; description_ar: string | null; price: number; compare_at_price: number | null; image_url: string | null; is_featured: boolean; preparation_time: number; groups: DinerGroup[] };
export type DinerPdfLink = { id: string; page_number: number; x: number; y: number; width: number; height: number; menu_item_id: string; label: string | null };

export type DinerMenu = {
  restaurant: { id: string; name: string; slug: string; logo_url: string | null; cover_image_url: string | null; description_en: string | null; description_ar: string | null; currency: string; tax_rate: number; service_charge: number; primary_color: string; accent_color: string; menu_theme: MenuTheme };
  settings: { enable_orders: boolean; enable_waiter_calls: boolean; show_prices: boolean; allow_special_notes: boolean; minimum_order: number; enable_service_charge: boolean; estimated_preparation_time: number } | null;
  table: { id: string; table_number: string; table_name: string | null } | null;
  categories: { id: string; name_en: string; name_ar: string }[];
  items: DinerItem[];
  pdfMenu: { url: string; parts: string[]; fileName: string; pageCount: number; links: DinerPdfLink[] } | null;
};

/** Loads the public menu for a restaurant slug, plus the scanned table. */
export async function loadDinerMenu(slug: string, qrToken: string | null): Promise<DinerMenu> {
  const { data: restaurant, error } = await supabase
    .from("restaurants")
    .select("id, name, slug, logo_url, cover_image_url, description_en, description_ar, currency, tax_rate, service_charge, primary_color, accent_color, menu_theme")
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();
  if (error) throw error;
  if (!restaurant) throw new Error("Restaurant not found");

  const [settingsRes, tableRes, categoriesRes, itemsRes, groupsRes, modifiersRes, pdfDocumentRes] = await Promise.all([
    supabase.from("restaurant_settings").select("enable_orders, enable_waiter_calls, show_prices, allow_special_notes, minimum_order, enable_service_charge, estimated_preparation_time").eq("restaurant_id", restaurant.id).maybeSingle(),
    qrToken ? supabase.from("restaurant_tables").select("id, table_number, table_name").eq("restaurant_id", restaurant.id).eq("qr_token", qrToken).eq("is_active", true).maybeSingle() : Promise.resolve({ data: null, error: null }),
    supabase.from("menu_categories").select("id, name_en, name_ar").eq("restaurant_id", restaurant.id).eq("is_active", true).order("display_order", { ascending: true }),
    supabase.from("menu_items").select("id, category_id, name_en, name_ar, description_en, description_ar, price, compare_at_price, image_url, is_featured, preparation_time, is_available").eq("restaurant_id", restaurant.id).eq("is_available", true).order("display_order", { ascending: true }),
    supabase.from("modifier_groups").select("id, menu_item_id, name_en, name_ar, is_required, min_selection, max_selection").eq("restaurant_id", restaurant.id).eq("is_active", true).order("display_order", { ascending: true }),
    supabase.from("item_modifiers").select("id, group_id, name_en, name_ar, price_delta").eq("restaurant_id", restaurant.id).eq("is_active", true).order("display_order", { ascending: true }),
    (supabase as any).from("menu_pdf_documents").select("id, file_url, file_parts, file_name, page_count, is_active").eq("restaurant_id", restaurant.id).eq("is_active", true).maybeSingle(),
  ]);

  for (const result of [settingsRes, tableRes, categoriesRes, itemsRes, groupsRes, modifiersRes, pdfDocumentRes]) {
    if (result.error) throw result.error;
  }
  const groups = groupsRes.data ?? [];
  const modifiers = modifiersRes.data ?? [];
  const items: DinerItem[] = (itemsRes.data ?? []).map((item) => ({
    id: item.id, category_id: item.category_id, name_en: item.name_en, name_ar: item.name_ar,
    description_en: item.description_en, description_ar: item.description_ar, price: Number(item.price),
    compare_at_price: item.compare_at_price === null ? null : Number(item.compare_at_price), image_url: item.image_url,
    is_featured: item.is_featured, preparation_time: item.preparation_time,
    groups: groups.filter((g) => g.menu_item_id === item.id).map((g) => ({
      id: g.id, name_en: g.name_en, name_ar: g.name_ar, is_required: g.is_required, min_selection: g.min_selection, max_selection: g.max_selection,
      modifiers: modifiers.filter((m) => m.group_id === g.id).map((m) => ({ id: m.id, name_en: m.name_en, name_ar: m.name_ar, price_delta: Number(m.price_delta) })),
    })),
  }));

  const pdfDocument = pdfDocumentRes.data as { id: string; file_url: string; file_parts?: unknown; file_name: string; page_count: number; is_active: boolean } | null;
  let pdfLinks: DinerPdfLink[] = [];
  if (pdfDocument) {
    const { data, error: linkError } = await (supabase as any).from("menu_pdf_item_links").select("id, page_number, x, y, width, height, menu_item_id, label").eq("document_id", pdfDocument.id).eq("restaurant_id", restaurant.id).eq("is_active", true);
    if (linkError) throw linkError;
    const availableIds = new Set(items.map((item) => item.id));
    pdfLinks = (data ?? []).filter((link: DinerPdfLink) => availableIds.has(link.menu_item_id)).map((link: DinerPdfLink) => ({ ...link, x: Number(link.x), y: Number(link.y), width: Number(link.width), height: Number(link.height) }));
  }

  let menuTheme = parseMenuTheme(restaurant.menu_theme);
  if (typeof window !== "undefined" && window.location.hash.startsWith("#designer-preview:")) {
    try {
      const draft = window.localStorage.getItem(`quickserve:menu-preview:${restaurant.id}`);
      if (draft) menuTheme = parseMenuTheme(JSON.parse(draft));
    } catch {
      // Fall back to the persisted restaurant theme if preview storage is unavailable.
    }
  }

  const parts = Array.isArray(pdfDocument?.file_parts) ? pdfDocument.file_parts.filter((part): part is string => typeof part === "string" && part.length > 0) : [];
  return {
    restaurant: { ...restaurant, tax_rate: Number(restaurant.tax_rate), service_charge: Number(restaurant.service_charge), menu_theme: menuTheme },
    settings: settingsRes.data ? { ...settingsRes.data, minimum_order: Number(settingsRes.data.minimum_order) } : null,
    table: tableRes.data ?? null,
    categories: categoriesRes.data ?? [],
    items,
    pdfMenu: pdfDocument ? { url: pdfDocument.file_url, parts, fileName: pdfDocument.file_name, pageCount: Number(pdfDocument.page_count), links: pdfLinks } : null,
  };
}

export type CartLine = { key: string; itemId: string; name_en: string; name_ar: string; unitPrice: number; quantity: number; notes: string; modifiers: DinerModifier[] };
export type PlacedOrder = { order_id: string; order_number: string; public_token: string; total: number; currency: string };
export type PublicOrderReceipt = {
  order_number: string;
  status: string;
  payment_status: string;
  subtotal: number;
  tax_amount: number;
  service_amount: number;
  discount_amount: number;
  total: number;
  currency: string;
  created_at: string;
};

export async function placePublicOrder(input: { qrToken: string; lines: CartLine[]; notes: string }): Promise<PlacedOrder> {
  const { data, error } = await supabase.rpc("place_public_order", {
    _qr_token: input.qrToken,
    _items: input.lines.map((line) => ({ menu_item_id: line.itemId, quantity: line.quantity, notes: line.notes || null, modifier_ids: line.modifiers.map((m) => m.id) })),
    ...(input.notes ? { _notes: input.notes } : {}),
  });
  if (error) throw error;
  const row = (data as PlacedOrder[] | null)?.[0];
  if (!row) throw new Error("Order could not be placed");
  return { ...row, total: Number(row.total) };
}

export async function fetchPublicOrderStatus(token: string) {
  const { data, error } = await supabase.rpc("public_order_status", { _public_token: token });
  if (error) throw error;
  const row = (data as { order_number: string; status: string; payment_status: string; total: number; currency: string; created_at: string }[] | null)?.[0];
  return row ?? null;
}

export async function fetchPublicOrderReceipt(token: string): Promise<PublicOrderReceipt | null> {
  const { data, error } = await (supabase as any).rpc("public_order_receipt", { _public_token: token });
  if (error) throw error;
  const row = (data as PublicOrderReceipt[] | null)?.[0];
  if (!row) return null;
  return {
    ...row,
    subtotal: Number(row.subtotal),
    tax_amount: Number(row.tax_amount),
    service_amount: Number(row.service_amount),
    discount_amount: Number(row.discount_amount),
    total: Number(row.total),
  };
}

export async function callWaiter(qrToken: string, note: string) {
  const { error } = await supabase.rpc("public_call_waiter", { _qr_token: qrToken, ...(note ? { _note: note } : {}) });
  if (error) throw error;
}
