import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const inputSchema = z.object({
  restaurantId: z.string().uuid(),
  pageNumber: z.number().int().positive(),
  pageWidth: z.number().positive(),
  pageHeight: z.number().positive(),
  imageDataUrl: z.string().startsWith("data:image/").max(8_000_000),
});

const rowSchema = z.object({
  name_en: z.string().max(180),
  name_ar: z.string().max(180),
  description_en: z.string().max(600).nullable(),
  description_ar: z.string().max(600).nullable(),
  price: z.number().nullable(),
  currency: z.string().max(8).nullable(),
  category: z.string().max(120).nullable().optional(),
  confidence: z.number().min(0).max(1),
  bbox: z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1), width: z.number().min(0).max(1), height: z.number().min(0).max(1) }),
});

async function authorizeRestaurant(context: { supabase: any; userId: string }, restaurantId: string) {
  const owner = await context.supabase.rpc("is_platform_owner");
  if (owner.error) throw owner.error;
  if (owner.data) return;
  const { data: rows, error } = await context.supabase.from("staff").select("role").eq("restaurant_id", restaurantId).eq("auth_user_id", context.userId).eq("is_active", true);
  if (error) throw error;
  if (!(rows ?? []).some((row: { role: string }) => row.role === "restaurant_admin" || row.role === "manager")) throw new Error("Forbidden");
}

export const extractPdfVisualProducts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => inputSchema.parse(input))
  .handler(async ({ data, context }) => {
    await authorizeRestaurant(context, data.restaurantId);
    const apiKey = process.env["OPENAI_API_KEY"] ?? process.env["OPENAI_API_KEYS"];
    if (!apiKey?.trim()) return { products: [], ai: false };

    const prompt = [
      "Analyze this single restaurant menu page visually. This page may be a scanned/image PDF.",
      "Identify ONLY genuinely purchasable food or beverage products.",
      "Do not return section headings, ingredients, toppings, modifiers, sizes by themselves, allergens, nutrition, restaurant metadata, addresses, phone numbers, or decorative text.",
      "For every product, read its visible title, explicit price and description when present. Preserve Arabic and English exactly as shown; do not translate.",
      "Group a product's title, description and price even when they are spatially separated. Use the complete visual product region as the bounding box.",
      "Do not guess. If a field is not readable or not present, use null/empty and reduce confidence.",
      "Coordinates must be normalized from 0 to 1 relative to the complete page.",
      "Return JSON only: {products:[{name_en,name_ar,description_en,description_ar,price,currency,category,confidence,bbox:{x,y,width,height}}]}",
      `Page number: ${data.pageNumber}; page dimensions: ${data.pageWidth} x ${data.pageHeight}.`,
    ].join("\n");

    try {
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey.trim()}` },
        body: JSON.stringify({
          model: process.env["OPENAI_MENU_VISION_MODEL"] || process.env["OPENAI_MENU_MODEL"] || "gpt-5-mini",
          input: [{ role: "user", content: [{ type: "input_text", text: prompt }, { type: "input_image", image_url: data.imageDataUrl, detail: "high" }] }],
          store: false,
          max_output_tokens: 16000,
          text: { format: { type: "json_object" } },
        }),
      });
      if (!response.ok) return { products: [], ai: false };
      const payload = (await response.json()) as { output_text?: string; output?: Array<{ content?: Array<{ type?: string; text?: string }> }> };
      const text = payload.output_text || (payload.output ?? []).flatMap((item) => item.content ?? []).filter((part) => part.type === "output_text").map((part) => part.text ?? "").join("");
      const parsed = JSON.parse(text) as { products?: unknown };
      const products = Array.isArray(parsed.products) ? parsed.products.map((row) => rowSchema.safeParse(row)).filter((result) => result.success).map((result) => result.data).filter((row) => row.confidence >= 0.7 && (row.name_en.trim() || row.name_ar.trim())).map((row, index) => ({ candidate_id: `p${data.pageNumber}-vision${index}`, page_number: data.pageNumber, text: [row.name_en, row.name_ar, row.description_en, row.description_ar, row.price == null ? "" : `${row.price} ${row.currency ?? ""}`].filter(Boolean).join(" | "), x: row.bbox.x, y: row.bbox.y, width: row.bbox.width, height: row.bbox.height, confidence: row.confidence, product: row }))) : [];
      return { products, ai: true };
    } catch {
      return { products: [], ai: false };
    }
  });
