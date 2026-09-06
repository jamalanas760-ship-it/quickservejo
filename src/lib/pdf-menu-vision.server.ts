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
  bbox: z.object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    width: z.number().min(0).max(1),
    height: z.number().min(0).max(1),
  }),
});

type Product = z.infer<typeof productSchema>;

function textFromResponse(payload: unknown): string {
  const value = payload as { output_text?: unknown; output?: unknown };
  if (typeof value.output_text === "string") return value.output_text;
  if (!Array.isArray(value.output)) return "";
  return value.output
    .flatMap((item) => {
      if (!item || typeof item !== "object" || !Array.isArray((item as any).content)) return [];
      return (item as any).content
        .filter((part: any) => part?.type === "output_text")
        .map((part: any) => String(part.text ?? ""));
    })
    .join("");
}

async function authorize(context: { supabase: any; userId: string }, restaurantId: string) {
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
  if (!(result.data ?? []).some((row: { role?: string }) => row.role === "restaurant_admin" || row.role === "manager")) {
    throw new Error("Forbidden");
  }
}

function extractPrice(text: string): { price: number | null; currency: string | null } {
  const match = text.match(/(?:([A-Za-z$€£]+)\s*)?(\d+(?:[.,]\d{1,2})?)(?:\s*([A-Za-z$€£]+))?/);
  if (!match) return { price: null, currency: null };
  const value = Number(match[2].replace(",", "."));
  if (!Number.isFinite(value)) return { price: null, currency: null };
  const currency = (match[1] || match[3] || "").toUpperCase() || null;
  return { price: value, currency };
}

function localTextRecovery(selectedText: string): Product | null {
  const lines = selectedText
    .split(/\n|(?<=\s{2,})/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length >= 2);
  if (!lines.length) return null;

  const priceLineIndex = lines.findIndex((line) => /(?:\d+(?:[.,]\d{1,2})?\s*(?:jd|jod|aed|sar|usd|eur|€|\$|£)|(?:jd|jod|aed|sar|usd|eur)\s*\d|\d+[.,]\d{2})/i.test(line));
  const priceSource = priceLineIndex >= 0 ? lines[priceLineIndex] : selectedText;
  const { price, currency } = extractPrice(priceSource);
  const withoutPrice = lines.map((line) => line.replace(/(?:\d+(?:[.,]\d{1,2})?\s*(?:jd|jod|aed|sar|usd|eur|€|\$|£)|(?:jd|jod|aed|sar|usd|eur)\s*\d|\d+[.,]\d{2})/gi, "").trim()).filter(Boolean);
  if (!withoutPrice.length) return null;

  const isArabic = (value: string) => /[\u0600-\u06FF]/.test(value);
  const title = withoutPrice[0];
  const description = withoutPrice.slice(1).join(" ") || null;
  const arabicTitle = isArabic(title) ? title : "";
  const englishTitle = isArabic(title) ? "" : title;
  const arabicDescription = description && isArabic(description) ? description : null;
  const englishDescription = description && !isArabic(description) ? description : null;

  return {
    name_en: englishTitle,
    name_ar: arabicTitle,
    description_en: englishDescription,
    description_ar: arabicDescription,
    price,
    currency,
    category: null,
    confidence: 0.72,
    bbox: { x: 0, y: 0, width: 1, height: 1 },
  };
}

async function callVision(apiKey: string, model: string, prompt: string, imageDataUrl: string): Promise<unknown> {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      input: [{
        role: "user",
        content: [
          { type: "input_text", text: prompt },
          { type: "input_image", image_url: imageDataUrl, detail: "high" },
        ],
      }],
      store: false,
      max_output_tokens: 5000,
      text: { format: { type: "json_object" } },
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Vision request failed (${response.status})${body ? `: ${body.slice(0, 300)}` : ""}`);
  }
  return response.json();
}

function parseProducts(payload: unknown): Product[] {
  const text = textFromResponse(payload);
  if (!text) return [];
  let parsed: { products?: unknown };
  try {
    parsed = JSON.parse(text) as { products?: unknown };
  } catch {
    return [];
  }
  const raw = Array.isArray(parsed.products) ? parsed.products : [];
  const products: Product[] = [];
  for (const item of raw) {
    const result = productSchema.safeParse(item);
    if (!result.success) continue;
    const product = result.data;
    if (!product.name_en.trim() && !product.name_ar.trim()) continue;
    products.push(product);
  }
  return products;
}

export const extractPdfVisualProducts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => inputSchema.parse(input))
  .handler(async ({ data, context }) => {
    await authorize(context, data.restaurantId);
    const apiKey = process.env["OPENAI_API_KEY"] ?? process.env["OPENAI_API_KEYS"];
    if (!apiKey?.trim()) return { products: [], ai: false, reason: "missing_api_key" };

    const sourceText = data.selectedText.trim();
    const model = process.env["OPENAI_MENU_VISION_MODEL"] || process.env["OPENAI_MENU_MODEL"] || "gpt-5.6-luna";

    const selectionPrompt = `You are the product-reading engine for a restaurant PDF ordering system.

The restaurant manager deliberately selected ONE rectangular area containing ONE menu product. Do not reject the selection merely because the crop is partial, stylized, bilingual, or difficult. Your job is to inspect the image carefully and recover the product information that is actually visible.

Read the image first. Then use the extracted PDF text below as a second OCR signal. Compare both sources and resolve disagreements by looking at the image.

PDF text from the selected area:
${sourceText || "(No machine-readable PDF text. The image is the primary source.)"}

Required behavior:
- Return exactly one product object when the selected area contains a product. Assume the manager selected a product area intentionally.
- Read the product title, description, price, currency, and any visible relevant details.
- Fill BOTH English and Arabic product title fields. If the menu shows only one language, accurately translate the title into the other language.
- Fill BOTH English and Arabic descriptions when a description is visible. If there is no description, use null for both descriptions.
- Preserve the meaning and do not invent ingredients or marketing claims.
- Read small prices carefully. Never invent a price. If the price is genuinely absent/unreadable, use null.
- Ignore decorative graphics, restaurant name, contact information, page numbers, category labels and standalone modifiers unless they belong to the selected product.
- The selected crop is already the clickable area, so bbox must be {x:0,y:0,width:1,height:1}.
- Confidence should reflect how clearly the product was read, not whether the crop is perfectly formatted.

Return JSON only in this exact shape:
{"products":[{"name_en":"","name_ar":"","description_en":null,"description_ar":null,"price":null,"currency":null,"category":null,"confidence":0.0,"bbox":{"x":0,"y":0,"width":1,"height":1}}]}`;

    const pagePrompt = `Analyze this restaurant menu page image and identify genuine purchasable food or beverage products. Use visual layout, typography, proximity, prices, and bilingual text to group each title, description and price into one product. Do not treat every line as a product. Fill English and Arabic fields, accurately translating when only one language is visible. Never invent a price. Return JSON only with a products array and normalized bounding boxes.`;

    try {
      let products: Product[] = [];
      let lastError: unknown = null;

      // First pass: focused product extraction. A selected area is an instruction to
      // inspect, not a reason to fall back to manual entry.
      try {
        const first = await callVision(apiKey.trim(), model, data.selectionOnly ? selectionPrompt : pagePrompt, data.imageDataUrl);
        products = parseProducts(first);
      } catch (error) {
        lastError = error;
      }

      // Second pass: recovery prompt. This deliberately relaxes rejection rules and
      // asks the model to transcribe before structuring, which is much more reliable
      // for small/stylized menu typography.
      if (!products.length && data.selectionOnly) {
        try {
          const recoveryPrompt = `Re-read this manually selected restaurant menu crop at maximum attention. The previous extraction failed. Do NOT refuse the task and do NOT ask for manual entry. Transcribe the visible product title, description and price first, then structure them into one product. If text is Arabic, provide a faithful English translation; if text is English, provide a faithful Arabic translation. If a field is not visible, use null/empty only for that field. Treat the selected crop as an intentional product selection. The PDF text hint is: ${sourceText || "none"}. Return only JSON: {"products":[{"name_en":"","name_ar":"","description_en":null,"description_ar":null,"price":null,"currency":null,"category":null,"confidence":0.0,"bbox":{"x":0,"y":0,"width":1,"height":1}}]}`;
          const second = await callVision(apiKey.trim(), model, recoveryPrompt, data.imageDataUrl);
          products = parseProducts(second);
        } catch (error) {
          lastError = error;
        }
      }

      // Deterministic PDF-text recovery is the final safety net for text PDFs.
      // It still returns what was actually present; it never fabricates a price.
      if (!products.length && data.selectionOnly && sourceText) {
        const recovered = localTextRecovery(sourceText);
        if (recovered) products = [recovered];
      }

      const accepted = products.filter((product) => product.name_en.trim() || product.name_ar.trim());
      const result = accepted.map((product, index) => ({
        candidate_id: `p${data.pageNumber}-vision-${Date.now()}-${index}`,
        page_number: data.pageNumber,
        text: [product.name_en, product.name_ar, product.description_en, product.description_ar, product.price == null ? "" : `${product.price} ${product.currency ?? ""}`].filter(Boolean).join(" | "),
        x: product.bbox.x,
        y: product.bbox.y,
        width: product.bbox.width,
        height: product.bbox.height,
        confidence: product.confidence,
        product,
      }));

      return {
        products: result,
        ai: result.length > 0,
        reason: result.length ? "read" : lastError instanceof Error ? lastError.message : "no_product_found",
      };
    } catch (error) {
      return { products: [], ai: false, reason: error instanceof Error ? error.message : "vision_failed" };
    }
  });
