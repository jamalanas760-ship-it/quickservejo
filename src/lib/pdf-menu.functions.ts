import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const candidateSchema = z.object({ id: z.string().max(80), page_number: z.number().int().positive(), text: z.string().max(240), x: z.number().min(0).max(1), y: z.number().min(0).max(1), width: z.number().min(0).max(1), height: z.number().min(0).max(1) });
const productSchema = z.object({ id: z.string().uuid(), name_en: z.string().max(180), name_ar: z.string().max(180), price: z.number() });
const schema = z.object({ restaurantId: z.string().uuid(), candidates: z.array(candidateSchema).max(600), products: z.array(productSchema).max(500) });
const extractionSchema = z.object({ restaurantId: z.string().uuid(), candidates: z.array(candidateSchema).max(600) });
const extractedSchema = z.object({ candidate_id: z.string(), name_en: z.string().max(180), name_ar: z.string().max(180), description_en: z.string().max(600).nullable(), description_ar: z.string().max(600).nullable(), price: z.number().nullable(), currency: z.string().max(8).nullable(), confidence: z.number().min(0).max(1) });

async function authorizeRestaurant(context: { supabase: any; userId: string }, restaurantId: string) {
  const owner = await context.supabase.rpc("is_platform_owner");
  if (owner.error) throw owner.error;
  if (owner.data) return;
  const { data: rows, error } = await context.supabase.from("staff").select("role").eq("restaurant_id", restaurantId).eq("auth_user_id", context.userId).eq("is_active", true);
  if (error) throw error;
  if (!(rows ?? []).some((row: { role: string }) => row.role === "restaurant_admin" || row.role === "manager")) throw new Error("Forbidden");
}

/** Extract product fields from the PDF itself. It deliberately receives no existing products. */
export const extractPdfProducts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => extractionSchema.parse(input))
  .handler(async ({ data, context }) => {
    await authorizeRestaurant(context, data.restaurantId);
    const fallback = data.candidates.map(extractLocally);
    const apiKey = process.env["OPENAI_API_KEY"] ?? process.env["OPENAI_API_KEYS"];
    if (!apiKey?.trim()) return { products: fallback, ai: false };

    const prompt = [
      "You are extracting structured products from a restaurant menu PDF.",
      "Each candidate is text read directly from the PDF. Extract only information explicitly present in that candidate text.",
      "Do not invent, infer, translate into facts that are not present, or use any outside restaurant/product knowledge.",
      "A candidate may be a category/header or non-product line. Still return a best-effort product record; the restaurant owner decides whether it becomes clickable.",
      "For name_en/name_ar, preserve the language(s) actually present. If only Arabic exists, put the same Arabic text in name_ar and a faithful transliteration only when clearly possible; otherwise leave name_en empty.",
      "For descriptions, return null unless an actual description is present in the candidate text.",
      "For price, return only a number explicitly visible in the candidate. Return null when absent. Currency should be the explicit currency marker if present, otherwise null.",
      "Return JSON only as {products:[{candidate_id,name_en,name_ar,description_en,description_ar,price,currency,confidence}]}.",
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
      const products = Array.isArray(parsed.products) ? parsed.products.flatMap((row) => { const result = extractedSchema.safeParse(row); return result.success ? [result.data] : []; }) : [];
      const byId = new Map(products.map((row) => [row.candidate_id, row]));
      return { products: fallback.map((row) => byId.get(row.candidate_id) ?? row), ai: true };
    } catch {
      return { products: fallback, ai: false };
    }
  });

function extractLocally(candidate: z.infer<typeof candidateSchema>) {
  const text = candidate.text.replace(/\s+/g, " ").trim();
  const priceMatch = text.match(/(?:\b(JOD|JD|AED|SAR|USD|EUR|€|\$|£)\s*)?(\d+(?:[.,]\d{1,2})?)(?:\s*(JOD|JD|AED|SAR|USD|EUR|€|\$|£))?/i);
  const price = priceMatch ? Number(priceMatch[2].replace(",", ".")) : null;
  const currency = priceMatch?.[1] ?? priceMatch?.[3] ?? null;
  const name = priceMatch ? text.replace(priceMatch[0], "").replace(/[|–—:-]+\s*$/, "").trim() : text;
  const arabic = /[\u0600-\u06FF]/.test(name);
  const english = /[A-Za-z]/.test(name);
  return {
    candidate_id: candidate.id,
    name_en: english ? name : "",
    name_ar: arabic ? name : "",
    description_en: null,
    description_ar: null,
    price,
    currency,
    confidence: price !== null ? 0.8 : 0.55,
  };
}

export const analyzePdfMenu = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => schema.parse(input))
  .handler(async ({ data, context }) => {
    await authorizeRestaurant(context, data.restaurantId);

    const fallback = localMatches(data.candidates, data.products);
    const apiKey = process.env["OPENAI_API_KEY"] ?? process.env["OPENAI_API_KEYS"];
    if (!apiKey?.trim()) return { matches: fallback, ai: false };

    const prompt = [
      "You are a restaurant menu ingestion specialist.",
      "The candidate lines come from a real uploaded restaurant PDF. Identify which candidate lines are actual purchasable menu products and match them to the existing QuickServe products.",
      "Never invent products. Never match a category/header to a product. Prefer exact Arabic/English name matches, then close spelling/transliteration matches. Use price as supporting evidence when it appears in the candidate line.",
      "Return JSON only: {matches:[{candidate_id:string,menu_item_id:string,confidence:number}]}. Only return confidence >= 0.75.",
      `Existing products: ${JSON.stringify(data.products)}`,
      `PDF candidates: ${JSON.stringify(data.candidates)}`,
    ].join("\n\n");

    try {
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey.trim()}` },
        body: JSON.stringify({ model: process.env["OPENAI_MENU_MODEL"] || "gpt-5-mini", input: [{ role: "user", content: [{ type: "input_text", text: prompt }] }], store: false, max_output_tokens: 6000, text: { format: { type: "json_object" } } }),
      });
      if (!response.ok) return { matches: fallback, ai: false };
      const payload = (await response.json()) as { output_text?: string; output?: Array<{ content?: Array<{ type?: string; text?: string }> }> };
      const text = payload.output_text || (payload.output ?? []).flatMap((item) => item.content ?? []).filter((part) => part.type === "output_text").map((part) => part.text ?? "").join("");
      const parsed = JSON.parse(text) as { matches?: unknown };
      const matches = Array.isArray(parsed.matches) ? parsed.matches.filter((match): match is { candidate_id: string; menu_item_id: string; confidence: number } => {
        if (!match || typeof match !== "object") return false;
        const row = match as Record<string, unknown>;
        return typeof row.candidate_id === "string" && typeof row.menu_item_id === "string" && typeof row.confidence === "number" && row.confidence >= 0.75;
      }) : [];
      return { matches, ai: true };
    } catch {
      return { matches: fallback, ai: false };
    }
  });

function normalize(value: string): string {
  return value.toLowerCase().normalize("NFKD").replace(/[\u064B-\u065F\u0670]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function localMatches(candidates: z.infer<typeof candidateSchema>[], products: z.infer<typeof productSchema>[]) {
  return candidates.flatMap((candidate) => {
    const candidateText = normalize(candidate.text);
    let best: { id: string; score: number } | null = null;
    for (const product of products) {
      const names = [normalize(product.name_en), normalize(product.name_ar)].filter(Boolean);
      const score = names.reduce((max, name) => {
        if (name === candidateText) return Math.max(max, 0.98);
        if (candidateText.includes(name) || name.includes(candidateText)) return Math.max(max, 0.86);
        const tokens = name.split(" ").filter((token) => token.length > 2);
        const overlap = tokens.filter((token) => candidateText.includes(token)).length / Math.max(tokens.length, 1);
        return Math.max(max, overlap * 0.8);
      }, 0);
      if (!best || score > best.score) best = { id: product.id, score };
    }
    return best && best.score >= 0.72 ? [{ candidate_id: candidate.id, menu_item_id: best.id, confidence: best.score }] : [];
  });
}
