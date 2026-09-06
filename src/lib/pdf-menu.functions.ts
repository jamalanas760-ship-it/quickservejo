import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const candidateSchema = z.object({ id: z.string().max(80), page_number: z.number().int().positive(), text: z.string().max(1200), x: z.number().min(0).max(1), y: z.number().min(0).max(1), width: z.number().min(0).max(1), height: z.number().min(0).max(1), confidence: z.number().min(0).max(1).optional() });
const extractionSchema = z.object({ restaurantId: z.string().uuid(), candidates: z.array(candidateSchema).max(500) });
const extractedSchema = z.object({ candidate_id: z.string(), name_en: z.string().max(180), name_ar: z.string().max(180), description_en: z.string().max(600).nullable(), description_ar: z.string().max(600).nullable(), price: z.number().nullable(), currency: z.string().max(8).nullable(), confidence: z.number().min(0).max(1) });

async function authorizeRestaurant(context: { supabase: any; userId: string }, restaurantId: string) {
  const owner = await context.supabase.rpc("is_platform_owner");
  if (owner.error) throw owner.error;
  if (owner.data) return;
  const { data: rows, error } = await context.supabase.from("staff").select("role").eq("restaurant_id", restaurantId).eq("auth_user_id", context.userId).eq("is_active", true);
  if (error) throw error;
  if (!(rows ?? []).some((row: { role: string }) => row.role === "restaurant_admin" || row.role === "manager")) throw new Error("Forbidden");
}

export const extractPdfProducts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => extractionSchema.parse(input))
  .handler(async ({ data, context }) => {
    await authorizeRestaurant(context, data.restaurantId);
    const apiKey = process.env["OPENAI_API_KEY"] ?? process.env["OPENAI_API_KEYS"];
    if (!apiKey?.trim()) return { products: localFallback(data.candidates), ai: false };

    const prompt = [
      "You are a production-grade restaurant menu parser. Analyze the supplied spatial menu blocks in English, Arabic, or mixed English/Arabic.",
      "A product is a purchasable food or beverage item. Return ONLY genuine purchasable items.",
      "Never return category headings, section titles, ingredients, toppings, sauces, modifiers, sizes, allergens, nutrition facts, restaurant information, addresses, phone numbers, page numbers, decorative text, or isolated words that are clearly ingredients/labels.",
      "Each candidate is a spatial block and may contain a title, description, and price. You may use the block's line order and text to understand which text is the title versus description.",
      "Do not invent missing information. Extract the product title from the title-like text, the description only when a real description exists, and the price only when an explicit price is present in the block.",
      "Support Arabic and English independently: preserve the original script in name_en/name_ar and description_en/description_ar. If only Arabic exists, name_en must be empty. If only English exists, name_ar must be empty. Do not translate.",
      "A real product with no visible price is still valid. A one-word product name is valid when the surrounding block clearly identifies it as a purchasable item.",
      "Return one record per real product. candidate_id MUST exactly match an input candidate id. Never invent candidate ids.",
      "Confidence must reflect certainty: 0.90+ clear product, 0.70-0.89 likely product, below 0.70 ambiguous. Only return products with confidence >= 0.70.",
      "Return JSON only with this shape: {\"products\":[{\"candidate_id\":\"...\",\"name_en\":\"\",\"name_ar\":\"\",\"description_en\":null,\"description_ar\":null,\"price\":null,\"currency\":null,\"confidence\":0.95}]}",
      `INPUT BLOCKS:\n${JSON.stringify(data.candidates)}`,
    ].join("\n\n");

    try {
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey.trim()}` },
        body: JSON.stringify({ model: process.env["OPENAI_MENU_MODEL"] || "gpt-5-mini", input: [{ role: "user", content: [{ type: "input_text", text: prompt }] }], store: false, max_output_tokens: 16000, text: { format: { type: "json_object" } } }),
      });
      if (!response.ok) return { products: localFallback(data.candidates), ai: false };
      const payload = (await response.json()) as { output_text?: string; output?: Array<{ content?: Array<{ type?: string; text?: string }> }> };
      const text = payload.output_text || (payload.output ?? []).flatMap((item) => item.content ?? []).filter((part) => part.type === "output_text").map((part) => part.text ?? "").join("");
      const parsed = JSON.parse(text) as { products?: unknown };
      const inputIds = new Set(data.candidates.map((candidate) => candidate.id));
      const products = Array.isArray(parsed.products)
        ? parsed.products.flatMap((row) => {
            const result = extractedSchema.safeParse(row);
            if (!result.success) return [];
            const product = result.data;
            if (!inputIds.has(product.candidate_id) || product.confidence < 0.7) return [];
            if (!product.name_en.trim() && !product.name_ar.trim()) return [];
            if (isPlaceholder(product.name_en) || isPlaceholder(product.name_ar)) return [];
            return [product];
          })
        : [];
      // If AI succeeds but finds no products, do not silently turn arbitrary PDF
      // lines into products. This is safer than the old fallback behavior.
      return { products, ai: true };
    } catch {
      return { products: localFallback(data.candidates), ai: false };
    }
  });

function localFallback(candidates: z.infer<typeof candidateSchema>[]) {
  return candidates.map(extractLocally).filter((row) => row.confidence >= 0.7);
}

function extractLocally(candidate: z.infer<typeof candidateSchema>) {
  const text = candidate.text.replace(/\s+/g, " ").trim();
  const priceMatch = text.match(/(?:\b(JOD|JD|AED|SAR|USD|EUR|€|\$|£)\s*)?(\d+(?:[.,]\d{1,2})?)(?:\s*(JOD|JD|AED|SAR|USD|EUR|€|\$|£))?/i);
  const price = priceMatch ? Number(priceMatch[2].replace(",", ".")) : null;
  const currency = priceMatch?.[1] ?? priceMatch?.[3] ?? null;
  const stripped = priceMatch ? text.replace(priceMatch[0], "").replace(/[|–—:-]+\s*$/, "").trim() : text;
  const parts = stripped.split(/\s*\|\s*/).map((part) => part.trim()).filter(Boolean);
  const name = (parts[0] ?? stripped).trim();
  const description = parts.slice(1).join(" ").trim();
  const arabic = /[\u0600-\u06FF]/.test(name);
  const english = /[A-Za-z]/.test(name);
  const words = name.split(/\s+/).filter(Boolean).length;
  const valid = !isClearlyNonProduct(name) && (price !== null || parts.length > 1 || words >= 2);
  return { candidate_id: candidate.id, name_en: valid && english ? name : "", name_ar: valid && arabic ? name : "", description_en: valid && description && /[A-Za-z]/.test(description) ? description : null, description_ar: valid && description && /[\u0600-\u06FF]/.test(description) ? description : null, price: valid ? price : null, currency: valid ? currency : null, confidence: valid ? (price !== null || parts.length > 1 ? 0.76 : 0.7) : 0.05 };
}

function isPlaceholder(value: string): boolean {
  return /^(detected item|menu item|item|product|undefined|null)$/i.test(value.trim());
}

function isClearlyNonProduct(name: string): boolean {
  const normalized = name.toLowerCase().normalize("NFKD").replace(/[\u064B-\u065F\u0670]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  return ["menu", "food menu", "drinks", "beverages", "appetizers", "starters", "main course", "mains", "desserts", "salads", "sandwiches", "burgers", "pizza", "pasta", "garlic", "onion", "lettuce", "tomato", "cheese", "sauce", "ketchup", "mayo", "mayonnaise", "pickles", "parsley", "pepper", "salt", "olive oil", "thyme", "basil", "القائمة", "المقبلات", "السلطات", "السندويشات", "البرغر", "الحلويات", "المشروبات", "ثوم", "بصل", "خس", "طماطم", "جبنة", "صوص", "مخلل", "بقدونس"].includes(normalized) || /^(ingredients?|المكونات?)\s*[:：]/i.test(name);
}
