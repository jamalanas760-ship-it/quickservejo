import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const candidateSchema = z.object({ id: z.string().max(80), page_number: z.number().int().positive(), text: z.string().max(240), x: z.number().min(0).max(1), y: z.number().min(0).max(1), width: z.number().min(0).max(1), height: z.number().min(0).max(1) });
const productSchema = z.object({ id: z.string().uuid(), name_en: z.string().max(180), name_ar: z.string().max(180), price: z.number() });
const schema = z.object({ restaurantId: z.string().uuid(), candidates: z.array(candidateSchema).max(600), products: z.array(productSchema).max(500) });

export const analyzePdfMenu = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => schema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const owner = await supabase.rpc("is_platform_owner");
    if (owner.error) throw owner.error;
    if (!owner.data) {
      const { data: rows, error } = await supabase.from("staff").select("role").eq("restaurant_id", data.restaurantId).eq("auth_user_id", userId).eq("is_active", true);
      if (error) throw error;
      if (!(rows ?? []).some((row) => row.role === "restaurant_admin" || row.role === "manager")) throw new Error("Forbidden");
    }

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
