import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const inputSchema = z.object({ restaurantId: z.string().uuid(), pageNumber: z.number().int().positive(), pageWidth: z.number().positive(), pageHeight: z.number().positive(), imageDataUrl: z.string().startsWith("data:image/").max(12_000_000), selectionOnly: z.boolean().optional().default(false), selectedText: z.string().max(12000).optional().default("") });
const productSchema = z.object({ name_en: z.string().max(180).default(""), name_ar: z.string().max(180).default(""), description_en: z.string().max(700).nullable().default(null), description_ar: z.string().max(700).nullable().default(null), price: z.number().nullable().default(null), currency: z.string().max(12).nullable().default(null), category: z.string().max(120).nullable().default(null), confidence: z.number().min(0).max(1).default(.5), bbox: z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1), width: z.number().min(0).max(1), height: z.number().min(0).max(1) }) });
type Product = z.infer<typeof productSchema>;

async function authorize(context: { supabase: any; userId: string }, restaurantId: string) {
  const owner = await context.supabase.rpc("is_platform_owner");
  if (owner.error) throw owner.error;
  if (owner.data === true) return;
  const result = await context.supabase.from("staff").select("role").eq("restaurant_id", restaurantId).eq("auth_user_id", context.userId).eq("is_active", true);
  if (result.error) throw result.error;
  if (!(result.data ?? []).some((row: any) => row.role === "restaurant_admin" || row.role === "manager")) throw new Error("Forbidden");
}

function textFromResponse(payload: any) {
  if (typeof payload?.output_text === "string") return payload.output_text;
  if (!Array.isArray(payload?.output)) return "";
  return payload.output.flatMap((item: any) => Array.isArray(item?.content) ? item.content.filter((part: any) => part?.type === "output_text").map((part: any) => String(part.text ?? "")) : []).join("");
}

function parseProducts(payload: any): Product[] {
  let text = textFromResponse(payload).trim();
  if (text.startsWith("```")) text = text.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  try {
    const parsed = JSON.parse(text) as { products?: unknown };
    const raw = Array.isArray(parsed.products) ? parsed.products : [];
    return raw.map((item) => productSchema.safeParse(item)).filter((result) => result.success).map((result) => result.data as Product).filter((product) => product.name_en.trim() || product.name_ar.trim());
  } catch { return []; }
}

function localTextRecovery(text: string): Product | null {
  const lines = text.split(/\n/).map((line) => line.replace(/\s+/g, " ").trim()).filter(Boolean);
  if (!lines.length) return null;
  let price: number | null = null;
  for (const line of lines) {
    const match = line.match(/(?:([A-Za-z$€£]+)\s*)?(\d+(?:[.,]\d{1,2})?)(?:\s*([A-Za-z$€£]+))?/);
    if (!match) continue;
    const value = Number(match[2].replace(",", "."));
    if (Number.isFinite(value)) { price = value; break; }
  }
  const clean = lines.map((line) => line.replace(/(?:\d+(?:[.,]\d{1,2})?\s*(?:jd|jod|aed|sar|usd|eur|€|\$|£)|(?:jd|jod|aed|sar|usd|eur)\s*\d|\d+[.,]\d{2})/gi, "").trim()).filter(Boolean);
  if (!clean.length) return null;
  const isArabic = (value: string) => /[\u0600-\u06FF]/.test(value);
  const englishLines = clean.filter((line) => !isArabic(line));
  const arabicLines = clean.filter((line) => isArabic(line));
  const titleEn = englishLines[0] ?? "";
  const titleAr = arabicLines[0] ?? "";
  const descriptionEn = englishLines.slice(1).join(" ") || null;
  const descriptionAr = arabicLines.slice(1).join(" ") || null;
  return { name_en: titleEn, name_ar: titleAr, description_en: descriptionEn, description_ar: descriptionAr, price, currency: "JOD", category: null, confidence: .78, bbox: { x: 0, y: 0, width: 1, height: 1 } };
}

async function callVision(apiKey: string, model: string, prompt: string, imageDataUrl: string, structured: boolean) {
  const body: any = { model, input: [{ role: "user", content: [{ type: "input_text", text: prompt }, { type: "input_image", image_url: imageDataUrl }] }], store: false, max_output_tokens: 3000 };
  if (structured) body.text = { format: { type: "json_object" } };
  const response = await fetch("https://api.openai.com/v1/responses", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` }, body: JSON.stringify(body) });
  if (!response.ok) { const detail = await response.text().catch(() => ""); throw new Error(`Vision API ${response.status}${detail ? `: ${detail.slice(0, 500)}` : ""}`); }
  return response.json();
}

export const extractPdfVisualProducts = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((input: unknown) => inputSchema.parse(input)).handler(async ({ data, context }) => {
  await authorize(context, data.restaurantId);
  const apiKey = (process.env["OPENAI_API_KEY"] ?? process.env["OPENAI_API_KEYS"] ?? "").trim();
  const source = data.selectedText.trim();
  if (!apiKey) {
    const local = localTextRecovery(source);
    return { products: local ? [{ candidate_id: `p${data.pageNumber}-local-${Date.now()}`, page_number: data.pageNumber, text: source, x: 0, y: 0, width: 1, height: 1, confidence: local.confidence, product: local }] : [], ai: false, reason: "missing_api_key" };
  }

  const model = process.env["OPENAI_MENU_VISION_MODEL"] || process.env["OPENAI_MENU_MODEL"] || "gpt-5.6-luna";
  const prompt = `You are a professional restaurant-menu OCR and bilingual data-entry assistant. The manager selected exactly ONE product area from the original PDF. The image is authoritative. Read every visible character carefully, including small Arabic and English text, decorative fonts, punctuation, decimal prices, and text with unusual spacing. Use the PDF text hint only to resolve characters; never let it override the image.

Return exactly ONE product for the selected area when it contains a purchasable menu item. Do not return a category heading, ingredient, allergen, restaurant information, page number, or modifier by itself.

TITLE RULES:
- name_en must contain the product title in English. If the PDF shows English, transcribe it accurately. If it shows only Arabic, translate the title faithfully into natural English without adding information.
- name_ar must contain the product title in Arabic. If the PDF shows Arabic, transcribe it accurately. If it shows only English, translate the title faithfully into natural Arabic without adding information.
- If both languages are printed, preserve each printed language instead of translating it.
- Never put the description into either title field.

DESCRIPTION RULES:
- description_en is ONLY the English descriptive text that belongs to this product, excluding title and price. If the PDF has no English description, return null.
- description_ar is ONLY the Arabic descriptive text that belongs to this product, excluding title and price. If the PDF has no Arabic description, return null.
- If a description exists in only one language, translate it faithfully into the other language so both fields are useful. Do not invent ingredients or claims.

PRICE/CURRENCY:
- Read the exact numeric price belonging to this selected product. Never guess.
- This restaurant uses Jordanian Dinar only. Always return currency as "JOD" regardless of whether the PDF prints JD, JOD, د.أ, or no currency symbol.
- Return price as a number, e.g. 3.5, not a string. If truly unreadable or absent, use null.

The selected area may contain a bilingual layout where Arabic is right-to-left and English is left-to-right. Do not mix the two languages into one field. Preserve the meaning and wording as closely as possible. bbox must always be the full selected area: {x:0,y:0,width:1,height:1}. Return JSON only in this exact shape:
{"products":[{"name_en":"","name_ar":"","description_en":null,"description_ar":null,"price":null,"currency":"JOD","category":null,"confidence":0.0,"bbox":{"x":0,"y":0,"width":1,"height":1}}]}

PDF text hint (secondary only): ${source || "(none)"}`;

  let products: Product[] = [];
  let reason = "no_product_found";
  try {
    products = parseProducts(await callVision(apiKey, model, prompt, data.imageDataUrl, true));
    reason = products.length ? "read" : "empty";
  } catch (error) {
    reason = error instanceof Error ? error.message : "vision_failed";
    try { products = parseProducts(await callVision(apiKey, model, prompt, data.imageDataUrl, false)); if (products.length) reason = "read-retry"; } catch (retryError) { reason = retryError instanceof Error ? retryError.message : reason; }
  }
  if (!products.length && source) { const recovered = localTextRecovery(source); if (recovered) products = [recovered]; }

  const result = products.filter((product) => product.name_en.trim() || product.name_ar.trim()).map((product, index) => ({ candidate_id: `p${data.pageNumber}-vision-${Date.now()}-${index}`, page_number: data.pageNumber, text: [product.name_en, product.name_ar, product.description_en, product.description_ar, product.price == null ? "" : `${product.price} JOD`].filter(Boolean).join(" | "), x: 0, y: 0, width: 1, height: 1, confidence: product.confidence, product: { ...product, currency: "JOD" } }));
  return { products: result, ai: result.length > 0, reason: result.length ? "read" : reason };
});
