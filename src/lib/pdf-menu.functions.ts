import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const MODEL = "google/gemini-3.7-flash";
const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

export type ExtractedItem = {
  name_en: string;
  name_ar: string;
  description_en: string;
  price: number;
  category_en: string;
  category_ar: string;
};

const extractedItemSchema = z.object({
  name_en: z.string().min(1).max(160),
  name_ar: z.string().max(160).optional().default(""),
  description_en: z.string().max(400).optional().default(""),
  price: z.coerce.number().min(0).max(100000),
  category_en: z.string().max(120).optional().default("Menu"),
  category_ar: z.string().max(120).optional().default(""),
});

const analyzeSchema = z.object({ restaurantId: z.string().uuid() });

const importSchema = z.object({
  restaurantId: z.string().uuid(),
  items: z.array(extractedItemSchema).min(1).max(300),
});

/** Streams the gateway response so long PDF reads are never severed mid-flight. */
async function callGateway(body: unknown): Promise<string> {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("AI is not configured for this workspace.");
  const response = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ ...(body as object), stream: true }),
  });
  if (!response.ok || !response.body) {
    const detail = await response.text().catch(() => "");
    if (response.status === 429) throw new Error("The menu reader is busy right now. Please try again in a moment.");
    if (response.status === 402) throw new Error("AI credits are exhausted. Add credits to keep reading menus.");
    throw new Error(detail.slice(0, 300) || `Menu reading failed (${response.status}).`);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const json = JSON.parse(payload) as { choices?: { delta?: { content?: string } }[] };
        text += json.choices?.[0]?.delta?.content ?? "";
      } catch {
        // partial chunk; ignored
      }
    }
  }
  return text;
}

function parseItems(raw: string): ExtractedItem[] {
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  const slice = start >= 0 && end > start ? raw.slice(start, end + 1) : raw;
  let parsed: unknown;
  try {
    parsed = JSON.parse(slice);
  } catch {
    throw new Error("The menu could not be read automatically. Try a clearer PDF.");
  }
  const rows = z.array(extractedItemSchema).safeParse(parsed);
  if (!rows.success) throw new Error("The menu could not be read automatically. Try a clearer PDF.");
  return rows.data.map((row) => ({
    ...row,
    name_ar: row.name_ar || row.name_en,
    category_en: row.category_en || "Menu",
    category_ar: row.category_ar || row.category_en || "Menu",
  }));
}

/** Reads the uploaded PDF menu and returns every product it can detect. */
export const analyzePdfMenu = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => analyzeSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: restaurant, error } = await context.supabase
      .from("restaurants")
      .select("id, name, currency, menu_pdf_url")
      .eq("id", data.restaurantId)
      .maybeSingle();
    if (error) throw error;
    const pdfUrl = (restaurant as { menu_pdf_url?: string | null } | null)?.menu_pdf_url;
    if (!restaurant || !pdfUrl) throw new Error("Upload a PDF menu first.");

    const file = await fetch(pdfUrl);
    if (!file.ok) throw new Error("The stored PDF menu could not be downloaded.");
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.byteLength === 0) throw new Error("The stored PDF menu is empty.");
    let binary = "";
    for (let i = 0; i < bytes.length; i += 8192) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    }
    const base64 = btoa(binary);

    const raw = await callGateway({
      model: MODEL,
      messages: [
        {
          role: "system",
          content:
            "You extract restaurant menu products from PDF menus. Reply with ONLY a JSON array, no prose, no markdown fences. Each element: {\"name_en\",\"name_ar\",\"description_en\",\"price\",\"category_en\",\"category_ar\"}. price is a plain number in the menu's currency (no symbols). Keep the exact wording used in the menu. If Arabic is present use it for name_ar, otherwise repeat the English name. Never invent items or prices; skip anything without a readable price.",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Extract every orderable product from this menu for ${(restaurant as { name: string }).name}. Currency: ${(restaurant as { currency?: string }).currency ?? "JOD"}.`,
            },
            {
              type: "file",
              file: { filename: "menu.pdf", file_data: `data:application/pdf;base64,${base64}` },
            },
          ],
        },
      ],
    });

    return { items: parseItems(raw) };
  });

/** Creates the selected products (and their categories) in the live menu. */
export const importPdfMenuItems = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => importSchema.parse(input))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase;
    const { data: existing, error: catError } = await supabase
      .from("menu_categories")
      .select("id, name_en, display_order")
      .eq("restaurant_id", data.restaurantId);
    if (catError) throw catError;

    const byName = new Map<string, string>();
    for (const row of (existing ?? []) as { id: string; name_en: string }[]) {
      byName.set(row.name_en.trim().toLowerCase(), row.id);
    }
    let order = ((existing ?? []) as { display_order: number }[]).reduce((max, r) => Math.max(max, r.display_order ?? 0), 0);

    const wanted = new Map<string, { name_en: string; name_ar: string }>();
    for (const item of data.items) {
      const key = item.category_en.trim().toLowerCase();
      if (!byName.has(key) && !wanted.has(key)) {
        wanted.set(key, { name_en: item.category_en.trim(), name_ar: item.category_ar.trim() || item.category_en.trim() });
      }
    }

    if (wanted.size > 0) {
      const rows = [...wanted.entries()].map(([, value]) => ({
        restaurant_id: data.restaurantId,
        name_en: value.name_en,
        name_ar: value.name_ar,
        display_order: ++order,
        is_active: true,
      }));
      const { data: created, error } = await supabase.from("menu_categories").insert(rows).select("id, name_en");
      if (error) throw error;
      for (const row of (created ?? []) as { id: string; name_en: string }[]) {
        byName.set(row.name_en.trim().toLowerCase(), row.id);
      }
    }

    const itemRows = data.items.map((item, index) => ({
      restaurant_id: data.restaurantId,
      category_id: byName.get(item.category_en.trim().toLowerCase()) ?? null,
      name_en: item.name_en.trim(),
      name_ar: (item.name_ar || item.name_en).trim(),
      description_en: item.description_en.trim() || null,
      description_ar: null,
      price: Number(item.price.toFixed(2)),
      is_available: true,
      display_order: index + 1,
    }));

    const { error: insertError } = await supabase.from("menu_items").insert(itemRows);
    if (insertError) throw insertError;

    return { imported: itemRows.length, categories: wanted.size };
  });
