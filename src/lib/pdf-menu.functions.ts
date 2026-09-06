import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const candidateSchema = z.object({
  id: z.string().max(80),
  page_number: z.number().int().positive(),
  text: z.string().max(1200),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().min(0).max(1),
  height: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1).optional(),
});

const extractionSchema = z.object({ restaurantId: z.string().uuid(), candidates: z.array(candidateSchema).max(500) });

const productSchema = z.object({
  candidate_id: z.string(),
  name_en: z.string().max(180),
  name_ar: z.string().max(180),
  description_en: z.string().max(600).nullable(),
  description_ar: z.string().max(600).nullable(),
  category: z.string().max(120).nullable().optional(),
  variants: z.array(z.object({ name: z.string().max(120), values: z.array(z.string().max(120)).max(30) })).max(20).optional(),
  options: z.array(z.object({ name: z.string().max(120), price: z.number().nullable() })).max(30).optional(),
  price: z.number().nullable(),
  currency: z.string().max(8).nullable(),
  confidence: z.number().min(0).max(1),
});

const verificationSchema = z.object({
  approved_candidate_ids: z.array(z.string()).max(500),
  rejected_candidate_ids: z.array(z.string()).max(500),
  corrections: z.array(z.object({
    candidate_id: z.string(),
    name_en: z.string().max(180),
    name_ar: z.string().max(180),
    description_en: z.string().max(600).nullable(),
    description_ar: z.string().max(600).nullable(),
    price: z.number().nullable(),
    currency: z.string().max(8).nullable(),
    confidence: z.number().min(0).max(1),
  })).max(500),
});

async function authorizeRestaurant(context: { supabase: any; userId: string }, restaurantId: string) {
  const owner = await context.supabase.rpc("is_platform_owner");
  if (owner.error) throw owner.error;
  if (owner.data) return;
  const { data: rows, error } = await context.supabase.from("staff").select("role").eq("restaurant_id", restaurantId).eq("auth_user_id", context.userId).eq("is_active", true);
  if (error) throw error;
  if (!(rows ?? []).some((row: { role: string }) => row.role === "restaurant_admin" || row.role === "manager")) throw new Error("Forbidden");
}

async function callOpenAI(apiKey: string, body: unknown): Promise<any | null> {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey.trim()}` },
    body: JSON.stringify({ model: process.env["OPENAI_MENU_MODEL"] || "gpt-5-mini", input: [{ role: "user", content: [{ type: "input_text", text: JSON.stringify(body) }] }], store: false, max_output_tokens: 24000, text: { format: { type: "json_object" } } }),
  });
  if (!response.ok) return null;
  const payload = (await response.json()) as { output_text?: string; output?: Array<{ content?: Array<{ type?: string; text?: string }> }> };
  const text = payload.output_text || (payload.output ?? []).flatMap((item) => item.content ?? []).filter((part) => part.type === "output_text").map((part) => part.text ?? "").join("");
  try { return JSON.parse(text); } catch { return null; }
}

function cleanProduct(row: unknown, inputIds: Set<string>) {
  const result = productSchema.safeParse(row);
  if (!result.success) return null;
  const product = result.data;
  if (!inputIds.has(product.candidate_id)) return null;
  if (product.confidence < 0.7 || (!product.name_en.trim() && !product.name_ar.trim())) return null;
  if (isPlaceholder(product.name_en) || isPlaceholder(product.name_ar)) return null;
  return {
    ...product,
    category: product.category?.trim() || null,
    variants: product.variants ?? [],
    options: product.options ?? [],
  };
}

export const extractPdfProducts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => extractionSchema.parse(input))
  .handler(async ({ data, context }) => {
    await authorizeRestaurant(context, data.restaurantId);
    const apiKey = process.env["OPENAI_API_KEY"] ?? process.env["OPENAI_API_KEYS"];
    if (!apiKey?.trim()) return { products: localFallback(data.candidates), ai: false, verified: false };

    const candidates = data.candidates.map((candidate) => ({
      ...candidate,
      normalized_text: candidate.text.replace(/\s+/g, " ").trim(),
    }));

    const extractionPrompt = {
      task: "Understand an entire restaurant menu and identify purchasable products from spatial text blocks.",
      rules: [
        "Return ONLY genuine purchasable food or beverage products.",
        "Do not treat category headings, ingredients, toppings, sauces, modifiers, sizes, allergens, nutrition, restaurant information, addresses, phones, page numbers, or decorative text as products.",
        "Group product title + its description + its explicit price into ONE product even when they are separate lines.",
        "Use spatial page/coordinate information and neighboring text to understand product boundaries.",
        "Preserve the original language. Support English, Arabic, and mixed menus. Do not translate.",
        "Extract category, variants/sizes and add-ons/options only when explicitly supported by the supplied text. Never invent them.",
        "A product may legitimately have no price. In that case price must be null rather than guessed.",
        "Do not invent a product name. Every candidate_id must come from the input.",
        "Confidence below 0.70 must be omitted; uncertain information should be null or omitted and the product confidence lowered.",
        "If two candidates describe the same product, return only the best candidate rather than duplicates.",
      ],
      output: "{products:[{candidate_id,name_en,name_ar,description_en,description_ar,category,variants:[{name,values}],options:[{name,price}],price,currency,confidence}]}",
      candidates,
    };

    try {
      const firstPass = await callOpenAI(apiKey, extractionPrompt);
      const inputIds = new Set(data.candidates.map((candidate) => candidate.id));
      const firstProducts = Array.isArray(firstPass?.products) ? firstPass.products.map((row: unknown) => cleanProduct(row, inputIds)).filter(Boolean) : [];

      // Mandatory second pass: challenge the first pass against the complete candidate set.
      // This catches duplicates, accidental headings, bad prices, and missed products.
      const verificationPrompt = {
        task: "Verify an AI restaurant-menu extraction against the original spatial candidate blocks.",
        rules: [
          "Check completeness: every genuine purchasable product represented by a candidate should be approved unless evidence is insufficient.",
          "Check duplicates: reject duplicate representations of the same product.",
          "Check product boundaries and association: title, description and price must belong together.",
          "Check that prices are explicitly present; never infer a price.",
          "Reject decorative text, category headings, ingredients, modifiers, sizes by themselves, allergens, nutrition and restaurant metadata.",
          "If the first pass is wrong, return a correction using the exact candidate_id and only information supported by that candidate.",
          "Do not invent missing information.",
        ],
        original_candidates: candidates,
        first_pass_products: firstProducts,
        output: "{approved_candidate_ids:[],rejected_candidate_ids:[],corrections:[{candidate_id,name_en,name_ar,description_en,description_ar,price,currency,confidence}]}",
      };
      const verification = verificationSchema.safeParse(await callOpenAI(apiKey, verificationPrompt));
      if (!verification.success) return { products: firstProducts, ai: true, verified: false };

      const rejected = new Set(verification.data.rejected_candidate_ids);
      const corrections = new Map(verification.data.corrections.map((row) => [row.candidate_id, row]));
      const verifiedProducts = firstProducts
        .filter((product: any) => verification.data.approved_candidate_ids.includes(product.candidate_id) && !rejected.has(product.candidate_id))
        .map((product: any) => corrections.get(product.candidate_id) ? { ...product, ...corrections.get(product.candidate_id) } : product)
        .filter((product: any) => product.confidence >= 0.7 && !isPlaceholder(product.name_en) && !isPlaceholder(product.name_ar));

      return { products: verifiedProducts, ai: true, verified: true };
    } catch {
      return { products: localFallback(data.candidates), ai: false, verified: false };
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
  return {
    candidate_id: candidate.id,
    name_en: valid && english ? name : "",
    name_ar: valid && arabic ? name : "",
    description_en: valid && description && /[A-Za-z]/.test(description) ? description : null,
    description_ar: valid && description && /[\u0600-\u06FF]/.test(description) ? description : null,
    category: null,
    variants: [],
    options: [],
    price: valid ? price : null,
    currency: valid ? currency : null,
    confidence: valid ? (price !== null || parts.length > 1 ? 0.76 : 0.7) : 0.05,
  };
}

function isPlaceholder(value: string): boolean {
  return /^(detected item|menu item|item|product|undefined|null)$/i.test(value.trim());
}

function isClearlyNonProduct(name: string): boolean {
  const normalized = name.toLowerCase().normalize("NFKD").replace(/[\u064B-\u065F\u0670]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  return ["menu", "food menu", "drinks", "beverages", "appetizers", "starters", "main course", "mains", "desserts", "salads", "sandwiches", "burgers", "pizza", "pasta", "garlic", "onion", "lettuce", "tomato", "cheese", "sauce", "ketchup", "mayo", "mayonnaise", "pickles", "parsley", "pepper", "salt", "olive oil", "thyme", "basil", "القائمة", "المقبلات", "السلطات", "السندويشات", "البرغر", "الحلويات", "المشروبات", "ثوم", "بصل", "خس", "طماطم", "جبنة", "صوص", "مخلل", "بقدونس"].includes(normalized) || /^(ingredients?|المكونات?)\s*[:：]/i.test(name);
}
