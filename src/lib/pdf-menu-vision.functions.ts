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

const productSchema = z.object({
  name_en: z.string().max(180).default(""),
  name_ar: z.string().max(180).default(""),
  description_en: z.string().max(600).nullable().default(null),
  description_ar: z.string().max(600).nullable().default(null),
  price: z.number().nullable().default(null),
  currency: z.string().max(8).nullable().default(null),
  category: z.string().max(120).nullable().default(null),
  confidence: z.number().min(0).max(1),
  bbox: z.object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    width: z.number().min(0).max(1),
    height: z.number().min(0).max(1),
  }),
});

type Product = z.infer<typeof productSchema>;

async function authorizeRestaurant(context: { supabase: any; userId: string }, restaurantId: string) {
  const owner = await context.supabase.rpc("is_platform_owner");
  if (owner.error) throw owner.error;
  if (owner.data === true) return;

  const result = await context.supabase
    .from("staff")
    .select("role")
    .eq("restaurant_id", restaurantId)
    .eq("auth_user_id", context.userId)
    .eq("is_active", true);
  if (result.error) throw result.error;

  const allowed = (result.data ?? []).some((row: { role: string }) => row.role === "restaurant_admin" || row.role === "manager");
  if (!allowed) throw new Error("Forbidden");
}

function getOutputText(payload: any): string {
  if (typeof payload?.output_text === "string") return payload.output_text;
  const output = Array.isArray(payload?.output) ? payload.output : [];
  const parts: string[] = [];
  for (const item of output) {
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const part of content) {
      if (part?.type === "output_text" && typeof part?.text === "string") parts.push(part.text);
    }
  }
  return parts.join("");
}

function normalizeProduct(value: unknown): Product | null {
  const parsed = productSchema.safeParse(value);
  if (!parsed.success) return null;
  const product = parsed.data;
  if (product.confidence < 0.7) return null;
  if (!product.name_en.trim() && !product.name_ar.trim()) return null;
  if (isPlaceholder(product.name_en) || isPlaceholder(product.name_ar)) return null;
  if (product.bbox.width <= 0 || product.bbox.height <= 0) return null;
  return product;
}

function isPlaceholder(value: string): boolean {
  return /^(detected item|menu item|item|product|unknown|undefined|null)$/i.test(value.trim());
}

export const extractPdfVisualProducts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => inputSchema.parse(input))
  .handler(async ({ data, context }) => {
    await authorizeRestaurant(context, data.restaurantId);

    const apiKey = process.env["OPENAI_API_KEY"] ?? process.env["OPENAI_API_KEYS"];
    if (!apiKey?.trim()) return { products: [], ai: false };

    const prompt = [
      "Analyze this complete restaurant menu page image.",
      "Identify ONLY genuine purchasable food or beverage products.",
      "Reject section headings, ingredients, toppings, modifiers, sizes by themselves, allergens, nutrition, contact details, page numbers and decorative text.",
      "Group each product title, description and explicit price into one product using their visual position.",
      "Support English, Arabic and mixed-language menus. Preserve text as shown; do not translate.",
      "Never invent a name, description, price, category or other information.",
      "If price is absent or unreadable, return null.",
      "Return a bounding box covering the complete clickable product block, normalized from 0 to 1 relative to the entire page.",
      "Return JSON only with a products array.",
      `Page ${data.pageNumber}; dimensions ${data.pageWidth} x ${data.pageHeight}.`,
    ].join("\n");

    try {
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey.trim()}`,
        },
        body: JSON.stringify({
          model: process.env["OPENAI_MENU_VISION_MODEL"] || process.env["OPENAI_MENU_MODEL"] || "gpt-5-mini",
          input: [{
            role: "user",
            content: [
              { type: "input_text", text: prompt },
              { type: "input_image", image_url: data.imageDataUrl, detail: "high" },
            ],
          }],
          store: false,
          max_output_tokens: 16000,
          text: { format: { type: "json_object" } },
        }),
      });

      if (!response.ok) return { products: [], ai: false };

      const payload = await response.json();
      const text = getOutputText(payload);
      if (!text) return { products: [], ai: false };

      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        return { products: [], ai: false };
      }

      const rawProducts = Array.isArray((parsed as { products?: unknown })?.products)
        ? (parsed as { products: unknown[] }).products
        : [];

      const products: Array<{
        candidate_id: string;
        page_number: number;
        text: string;
        x: number;
        y: number;
        width: number;
        height: number;
        confidence: number;
        product: Product;
      }> = [];

      for (let index = 0; index < rawProducts.length; index += 1) {
        const product = normalizeProduct(rawProducts[index]);
        if (!product) continue;
        const textParts = [
          product.name_en,
          product.name_ar,
          product.description_en,
          product.description_ar,
          product.price == null ? "" : `${product.price} ${product.currency ?? ""}`,
        ].filter(Boolean);
        products.push({
          candidate_id: `p${data.pageNumber}-vision${index}`,
          page_number: data.pageNumber,
          text: textParts.join(" | "),
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
