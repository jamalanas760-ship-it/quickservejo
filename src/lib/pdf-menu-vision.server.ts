import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const inputSchema = z.object({
  restaurantId: z.string().uuid(),
  pageNumber: z.number().int().positive(),
  pageWidth: z.number().positive(),
  pageHeight: z.number().positive(),
  imageDataUrl: z.string().startsWith("data:image/").max(12_000_000),
  selectionOnly: z.boolean().optional().default(false),
  selectedText: z.string().max(6000).optional().default(""),
});

const productSchema = z.object({
  name_en: z.string().max(180).default(""),
  name_ar: z.string().max(180).default(""),
  description_en: z.string().max(600).nullable().default(null),
  description_ar: z.string().max(600).nullable().default(null),
  price: z.number().nullable().default(null),
  currency: z.string().max(8).nullable().default(null),
  category: z.string().max(120).nullable().default(null),
  confidence: z.number().min(0).max(1),
  bbox: z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1), width: z.number().min(0).max(1), height: z.number().min(0).max(1) }),
});

function textFromResponse(payload: unknown): string {
  const value = payload as { output_text?: unknown; output?: unknown };
  if (typeof value.output_text === "string") return value.output_text;
  if (!Array.isArray(value.output)) return "";
  return value.output.flatMap((item) => {
    if (!item || typeof item !== "object" || !Array.isArray((item as any).content)) return [];
    return (item as any).content.filter((part: any) => part?.type === "output_text").map((part: any) => String(part.text ?? ""));
  }).join("");
}

async function authorize(context: { supabase: any; userId: string }, restaurantId: string) {
  const owner = await context.supabase.rpc("is_platform_owner");
  if (owner.error) throw owner.error;
  if (owner.data === true) return;
  const result = await context.supabase.from("staff").select("role").eq("restaurant_id", restaurantId).eq("auth_user_id", context.userId).eq("is_active", true);
  if (result.error) throw result.error;
  if (!(result.data ?? []).some((row: { role?: string }) => row.role === "restaurant_admin" || row.role === "manager")) throw new Error("Forbidden");
}

export const extractPdfVisualProducts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => inputSchema.parse(input))
  .handler(async ({ data, context }) => {
    await authorize(context, data.restaurantId);
    const apiKey = process.env["OPENAI_API_KEY"] ?? process.env["OPENAI_API_KEYS"];
    if (!apiKey?.trim()) return { products: [], ai: false };

    const sourceText = data.selectedText.trim();
    const prompt = data.selectionOnly
      ? `You are reading ONE manually selected restaurant menu product. The image is a high-resolution crop of the selected PDF area. Extract exactly one genuine purchasable product from it. Read the image carefully, including small prices and Arabic/English text. A PDF text extraction is also supplied below; use it as an OCR aid, but trust the image when the text extraction is incomplete or out of order.\n\nPDF TEXT FROM SELECTED AREA:\n${sourceText || "(none)"}\n\nRules:\n- Fill BOTH English and Arabic product title fields. Preserve the original language and accurately translate into the missing language.\n- Fill BOTH English and Arabic descriptions when a description is visible. If no description is visible, use null.\n- Extract the explicit price exactly; never guess. If unreadable or absent, use null.\n- Do not return a category heading, ingredient, topping, modifier, size, allergen, nutrition, restaurant information or decorative text.\n- Do not invent ingredients, prices, names or descriptions.\n- The selected crop is already the exact clickable area, so bbox must be x=0,y=0,width=1,height=1.\n- Return one product only when the selected area is a real menu item.\nJSON only: {\"products\":[{\"name_en\":\"\",\"name_ar\":\"\",\"description_en\":null,\"description_ar\":null,\"price\":null,\"currency\":null,\"category\":null,\"confidence\":0,\"bbox\":{\"x\":0,\"y\":0,\"width\":1,\"height\":1}}]}`
      : `Analyze this restaurant menu page image. Return ONLY genuine purchasable food or beverage products. Reject headings, ingredients, toppings, modifiers, standalone sizes, allergens, nutrition, contact details and decorative text. Group each product title, description and explicit price into one product. Fill BOTH English and Arabic fields: preserve visible text and accurately translate into the missing language. Never invent information. If price is absent or unreadable, use null. Return a complete clickable product bounding box normalized 0..1. JSON only: {\"products\":[{\"name_en\":\"\",\"name_ar\":\"\",\"description_en\":null,\"description_ar\":null,\"price\":null,\"currency\":null,\"category\":null,\"confidence\":0,\"bbox\":{\"x\":0,\"y\":0,\"width\":0,\"height\":0}}]}`;

    try {
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey.trim()}` },
        body: JSON.stringify({
          model: process.env["OPENAI_MENU_VISION_MODEL"] || process.env["OPENAI_MENU_MODEL"] || "gpt-5-mini",
          input: [{ role: "user", content: [{ type: "input_text", text: prompt }, { type: "input_image", image_url: data.imageDataUrl, detail: "high" }] }],
          store: false,
          max_output_tokens: 12000,
          text: { format: { type: "json_object" } },
        }),
      });
      if (!response.ok) return { products: [], ai: false };
      const text = textFromResponse(await response.json());
      if (!text) return { products: [], ai: false };
      const parsed = JSON.parse(text) as { products?: unknown };
      const raw = Array.isArray(parsed.products) ? parsed.products : [];
      const products = [];
      for (let i = 0; i < raw.length; i += 1) {
        const parsedProduct = productSchema.safeParse(raw[i]);
        if (!parsedProduct.success) continue;
        const product = parsedProduct.data;
        if (product.confidence < 0.7 || (!product.name_en.trim() && !product.name_ar.trim())) continue;
        products.push({
          candidate_id: `p${data.pageNumber}-vision-${Date.now()}-${i}`,
          page_number: data.pageNumber,
          text: [product.name_en, product.name_ar, product.description_en, product.description_ar, product.price == null ? "" : `${product.price} ${product.currency ?? ""}`].filter(Boolean).join(" | "),
          x: product.bbox.x,
          y: product.bbox.y,
          width: product.bbox.width,
          height: product.bbox.height,
          confidence: product.confidence,
          product,
        });
      }
      return { products, ai: true };
    } catch {
      return { products: [], ai: false };
    }
  });
