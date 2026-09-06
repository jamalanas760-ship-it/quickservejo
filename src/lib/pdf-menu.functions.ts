import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const candidateSchema = z.object({ id: z.string().max(80), page_number: z.number().int().positive(), text: z.string().max(800), x: z.number().min(0).max(1), y: z.number().min(0).max(1), width: z.number().min(0).max(1), height: z.number().min(0).max(1), confidence: z.number().min(0).max(1).optional() });
const extractionSchema = z.object({ restaurantId: z.string().uuid(), candidates: z.array(candidateSchema).max(300) });
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
    const fallback = data.candidates.map(extractLocally).filter((row) => row.confidence >= 0.5);
    const apiKey = process.env["OPENAI_API_KEY"] ?? process.env["OPENAI_API_KEYS"];
    if (!apiKey?.trim()) return { products: fallback, ai: false };

    const prompt = [
      "You are a high-accuracy restaurant menu document parser.",
      "Each candidate is ONE spatially grouped menu-item block from the uploaded PDF. Identify only genuine purchasable menu items.",
      "Do NOT turn individual words, ingredients, modifiers, category headings, section titles, decorative text, nutrition/allergen text, contact information, addresses, phone numbers, or labels into products.",
      "If a candidate is not clearly a purchasable item, OMIT it completely from the response.",
      "For a real item, return ONE record with the title/name, optional description, and optional price from that SAME candidate block.",
      "The title is normally the first title-like line. Longer sentence-like text is the description. A visible numeric amount associated with the item is the price.",
      "Preserve Arabic and English exactly as present. Never invent a translation. If only one language is present, leave the other name field empty.",
      "Description must be null unless actually present. Price must be null unless explicitly visible. Never guess.",
      "Return JSON only: {products:[{candidate_id,name_en,name_ar,description_en,description_ar,price,currency,confidence}]}.",
      `Candidates: ${JSON.stringify(data.candidates)}`,
    ].join("\n\n");

    try {
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey.trim()}` },
        body: JSON.stringify({ model: process.env["OPENAI_MENU_MODEL"] || "gpt-5-mini", input: [{ role: "user", content: [{ type: "input_text", text: prompt }] }], store: false, max_output_tokens: 12000, text: { format: { type: "json_object" } } }),
      });
      if (!response.ok) return { products: fallback, ai: false };
      const payload = (await response.json()) as { output_text?: string; output?: Array<{ content?: Array<{ type?: string; text?: string }> }> };
      const text = payload.output_text || (payload.output ?? []).flatMap((item) => item.content ?? []).filter((part) => part.type === "output_text").map((part) => part.text ?? "").join("");
      const parsed = JSON.parse(text) as { products?: unknown };
      const products = Array.isArray(parsed.products) ? parsed.products.flatMap((row) => { const result = extractedSchema.safeParse(row); return result.success && result.data.confidence >= 0.5 ? [result.data] : []; }) : [];
      return { products: products.length ? products : fallback, ai: true };
    } catch {
      return { products: fallback, ai: false };
    }
  });

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
  const valid = !isClearlyNonProduct(name) && (words >= 2 || price !== null);
  return { candidate_id: candidate.id, name_en: valid && english ? name : "", name_ar: valid && arabic ? name : "", description_en: valid && description && /[A-Za-z]/.test(description) ? description : null, description_ar: valid && description && /[\u0600-\u06FF]/.test(description) ? description : null, price: valid ? price : null, currency: valid ? currency : null, confidence: valid ? (price !== null ? 0.78 : 0.62) : 0.05 };
}

function isClearlyNonProduct(name: string): boolean {
  const normalized = name.toLowerCase().normalize("NFKD").replace(/[\u064B-\u065F\u0670]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  return ["menu", "food menu", "drinks", "beverages", "appetizers", "starters", "main course", "mains", "desserts", "salads", "sandwiches", "burgers", "pizza", "pasta", "garlic", "onion", "lettuce", "tomato", "cheese", "sauce", "ketchup", "mayo", "mayonnaise", "pickles", "parsley", "pepper", "salt", "olive oil", "thyme", "basil", "القائمة", "المقبلات", "السلطات", "السندويشات", "البرغر", "الحلويات", "المشروبات", "ثوم", "بصل", "خس", "طماطم", "جبنة", "صوص", "مخلل", "بقدونس"].includes(normalized) || /^(ingredients?|المكونات?)\s*[:：]/i.test(name);
}
