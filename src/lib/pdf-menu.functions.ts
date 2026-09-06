import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const candidateSchema = z.object({
  id: z.string().max(80),
  page_number: z.number().int().positive(),
  text: z.string().max(800),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().min(0).max(1),
  height: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1).optional(),
});

const extractionSchema = z.object({ restaurantId: z.string().uuid(), candidates: z.array(candidateSchema).max(300) });

const extractedSchema = z.object({
  candidate_id: z.string(),
  name_en: z.string().max(180),
  name_ar: z.string().max(180),
  description_en: z.string().max(600).nullable(),
  description_ar: z.string().max(600).nullable(),
  price: z.number().nullable(),
  currency: z.string().max(8).nullable(),
  confidence: z.number().min(0).max(1),
});

async function authorizeRestaurant(context: { supabase: any; userId: string }, restaurantId: string) {
  const owner = await context.supabase.rpc("is_platform_owner");
  if (owner.error) throw owner.error;
  if (owner.data) return;
  const { data: rows, error } = await context.supabase.from("staff").select("role").eq("restaurant_id", restaurantId).eq("auth_user_id", context.userId).eq("is_active", true);
  if (error) throw error;
  if (!(rows ?? []).some((row: { role: string }) => row.role === "restaurant_admin" || row.role === "manager")) throw new Error("Forbidden");
}

/**
 * Extracts product metadata from the PDF item blocks only. Existing menu_items are
 * deliberately not provided to this function, so extraction can never invent a
 * product by copying a restaurant's current catalog.
 */
export const extractPdfProducts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => extractionSchema.parse(input))
  .handler(async ({ data, context }) => {
    await authorizeRestaurant(context, data.restaurantId);

    const fallback = data.candidates.map(extractLocally);
    const apiKey = process.env["OPENAI_API_KEY"] ?? process.env["OPENAI_API_KEYS"];
    if (!apiKey?.trim()) return { products: fallback, ai: false };

    const prompt = [
      "You are a high-accuracy restaurant menu document parser.",
      "Each candidate is ONE spatially grouped menu-item block produced from the PDF layout. Your job is to identify the product title, optional description, and optional price inside that SAME block.",
      "IMPORTANT: Do not treat every word as a product. Do not create products from ingredients, modifiers, category headings, labels, decorative text, contact details, or other non-purchasable text.",
      "Return exactly ONE structured record per candidate_id only when the block contains a plausible purchasable menu item. If the block is clearly not a product, return no record for that candidate_id.",
      "The first title-like line is normally the product name. Longer sentence-like lines are normally descriptions. A numeric amount with a currency marker, or a clear menu price, is the price.",
      "Keep Arabic and English exactly as represented in the PDF. Do not invent translations. If the same product name appears in both languages, populate both fields. If only one language is present, leave the other name field empty.",
      "Descriptions must be null unless an actual descriptive sentence/phrase is present in the block. Prices must be null unless an explicit price is visible in the block. Never guess missing values.",
      "Do not use outside knowledge and do not compare against an existing product catalog.",
      "Return JSON only: {products:[{candidate_id,name_en,name_ar,description_en,description_ar,price,currency,confidence}]}.",
      `Candidates: ${JSON.stringify(data.candidates)}`,
    ].join("\n\n");

    try {
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey.trim()}` },
        body: JSON.stringify({
          model: process.env["OPENAI_MENU_MODEL"] || "gpt-5-mini",
          input: [{ role: "user", content: [{ type: "input_text", text: prompt }] }],
          store: false,
          max_output_tokens: 12000,
          text: { format: { type: "json_object" } },
        }),
      });
      if (!response.ok) return { products: fallback, ai: false };
      const payload = (await response.json()) as { output_text?: string; output?: Array<{ content?: Array<{ type?: string; text?: string }> }> };
      const text = payload.output_text || (payload.output ?? []).flatMap((item) => item.content ?? []).filter((part) => part.type === "output_text").map((part) => part.text ?? "").join("");
      const parsed = JSON.parse(text) as { products?: unknown };
      const products = Array.isArray(parsed.products) ? parsed.products.flatMap((row) => {
        const result = extractedSchema.safeParse(row);
        return result.success ? [result.data] : [];
      }) : [];
      const byId = new Map(products.map((row) => [row.candidate_id, row]));
      return { products: fallback.map((row) => byId.get(row.candidate_id) ?? row), ai: true };
    } catch {
      return { products: fallback, ai: false };
    }
  });

function extractLocally(candidate: z.infer<typeof candidateSchema>) {
  const text = candidate.text.replace(/\s+/g, " ").trim();
  const lines = text.split(/\s*\|\s*|\s*\n\s*/).map((line) => line.trim()).filter(Boolean);
  const sourceLines = lines.length > 1 ? lines : [text];
  const priceMatch = text.match(/(?:\b(JOD|JD|AED|SAR|USD|EUR|€|\$|£)\s*)?(\d+(?:[.,]\d{1,2})?)(?:\s*(JOD|JD|AED|SAR|USD|EUR|€|\$|£))?/i);
  const price = priceMatch ? Number(priceMatch[2].replace(",", ".")) : null;
  const currency = priceMatch?.[1] ?? priceMatch?.[3] ?? null;
  const firstLine = (sourceLines[0] ?? text).replace(priceMatch?.[0] ?? "", "").trim();
  const name = firstLine.replace(/[|–—:-]+\s*$/, "").trim();
  const description = sourceLines.slice(1).filter((line) => !/^(?:\b(JOD|JD|AED|SAR|USD|EUR|€|\$|£)\s*)?\d+(?:[.,]\d{1,2})?(?:\s*(?:JOD|JD|AED|SAR|USD|EUR|€|\$|£))?$/i.test(line)).join(" ").trim();
  const arabic = /[\u0600-\u06FF]/.test(name);
  const english = /[A-Za-z]/.test(name);
  const valid = !isClearlyNonProduct(name) && (name.split(/\s+/).filter(Boolean).length >= 2 || price !== null);
  return {
    candidate_id: candidate.id,
    name_en: valid && english ? name : "",
    name_ar: valid && arabic ? name : "",
    description_en: valid && description && /[A-Za-z]/.test(description) ? description : null,
    description_ar: valid && description && /[\u0600-\u06FF]/.test(description) ? description : null,
    price: valid ? price : null,
    currency: valid ? currency : null,
    confidence: valid ? (price !== null ? 0.78 : 0.62) : 0.05,
  };
}

function isClearlyNonProduct(name: string): boolean {
  const normalized = name.toLowerCase().normalize("NFKD").replace(/[\u064B-\u065F\u0670]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  return [
    "menu", "food menu", "drinks", "beverages", "appetizers", "starters", "main course", "mains", "desserts", "salads", "sandwiches", "burgers", "pizza", "pasta",
    "garlic", "onion", "lettuce", "tomato", "cheese", "sauce", "ketchup", "mayo", "mayonnaise", "pickles", "parsley", "pepper", "salt", "olive oil", "thyme", "basil",
    "القائمة", "المقبلات", "السلطات", "السندويشات", "البرغر", "الحلويات", "المشروبات", "ثوم", "بصل", "خس", "طماطم", "جبنة", "صوص", "مخلل", "بقدونس",
  ].includes(normalized) || /^(ingredients?|المكونات?)\s*[:：]/i.test(name);
}
