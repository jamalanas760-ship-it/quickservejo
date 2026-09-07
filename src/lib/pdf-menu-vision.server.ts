import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const inputSchema = z.object({ restaurantId: z.string().uuid(), pageNumber: z.number().int().positive(), pageWidth: z.number().positive(), pageHeight: z.number().positive(), imageDataUrl: z.string().startsWith("data:image/").max(12_000_000), selectionOnly: z.boolean().optional().default(false), selectedText: z.string().max(12000).optional().default("") });
const productSchema = z.object({ name_en: z.string().max(180).default(""), name_ar: z.string().max(180).default(""), description_en: z.string().max(700).nullable().default(null), description_ar: z.string().max(700).nullable().default(null), price: z.number().nullable().default(null), currency: z.string().max(12).nullable().default(null), category: z.string().max(120).nullable().default(null), confidence: z.number().min(0).max(1).default(.5), bbox: z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1), width: z.number().min(0).max(1), height: z.number().min(0).max(1) }) });
type Product = z.infer<typeof productSchema>;

async function authorize(context: { supabase: any; userId: string }, restaurantId: string) {
  const owner = await context.supabase.rpc("is_platform_owner"); if (owner.error) throw owner.error; if (owner.data === true) return;
  const result = await context.supabase.from("staff").select("role").eq("restaurant_id", restaurantId).eq("auth_user_id", context.userId).eq("is_active", true); if (result.error) throw result.error;
  if (!(result.data ?? []).some((row: any) => row.role === "restaurant_admin" || row.role === "manager")) throw new Error("Forbidden");
}
function textFromResponse(payload: any) { if (typeof payload?.output_text === "string") return payload.output_text; if (!Array.isArray(payload?.output)) return ""; return payload.output.flatMap((item: any) => Array.isArray(item?.content) ? item.content.filter((part: any) => part?.type === "output_text").map((part: any) => String(part.text ?? "")) : []).join(""); }
function parseProducts(payload: any): Product[] { let text = textFromResponse(payload).trim(); if (text.startsWith("```")) text = text.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim(); try { const parsed = JSON.parse(text) as { products?: unknown }; const raw = Array.isArray(parsed.products) ? parsed.products : []; return raw.map((item) => productSchema.safeParse(item)).filter((result) => result.success).map((result) => result.data as Product).filter((product) => product.name_en.trim() || product.name_ar.trim()); } catch { return []; } }
function localTextRecovery(text: string): Product | null { const lines = text.split(/\n/).map((line) => line.replace(/\s+/g, " ").trim()).filter(Boolean); if (!lines.length) return null; let price: number | null = null; for (const line of lines) { const match = line.match(/(?:([A-Za-z$€£]+)\s*)?(\d+(?:[.,]\d{1,2})?)(?:\s*([A-Za-z$€£]+))?/); if (!match) continue; const value = Number(match[2].replace(",", ".")); if (Number.isFinite(value)) { price = value; break; } } const clean = lines.map((line) => line.replace(/(?:\d+(?:[.,]\d{1,2})?\s*(?:jd|jod|aed|sar|usd|eur|€|\$|£)|(?:jd|jod|aed|sar|usd|eur)\s*\d|\d+[.,]\d{2})/gi, "").trim()).filter(Boolean); if (!clean.length) return null; const isArabic = (value: string) => /[\u0600-\u06FF]/.test(value); const englishLines = clean.filter((line) => !isArabic(line)); const arabicLines = clean.filter((line) => isArabic(line)); return { name_en: englishLines[0] ?? "", name_ar: arabicLines[0] ?? "", description_en: englishLines.slice(1).join(" ") || null, description_ar: arabicLines.slice(1).join(" ") || null, price, currency: "JOD", category: null, confidence: .72, bbox: { x: 0, y: 0, width: 1, height: 1 } }; }
async function callVision(apiKey: string, model: string, prompt: string, imageDataUrl: string, structured: boolean) { const body: any = { model, input: [{ role: "user", content: [{ type: "input_text", text: prompt }, { type: "input_image", image_url: imageDataUrl }] }], store: false, max_output_tokens: 3500, reasoning: { effort: "high" } }; if (structured) body.text = { format: { type: "json_object" } }; const response = await fetch("https://api.openai.com/v1/responses", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` }, body: JSON.stringify(body) }); if (!response.ok) { const detail = await response.text().catch(() => ""); throw new Error(`Vision API ${response.status}${detail ? `: ${detail.slice(0, 500)}` : ""}`); } return response.json(); }

export const extractPdfVisualProducts = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).validator((input: unknown) => inputSchema.parse(input)).handler(async ({ data, context }) => {
  await authorize(context, data.restaurantId);
  const apiKey = (process.env["OPENAI_API_KEY"] ?? process.env["OPENAI_API_KEYS"] ?? "").trim();
  const source = data.selectedText.trim();
  if (!apiKey) { const local = localTextRecovery(source); return { products: local ? [{ candidate_id: `p${data.pageNumber}-local-${Date.now()}`, page_number: data.pageNumber, text: source, x: 0, y: 0, width: 1, height: 1, confidence: local.confidence, product: local }] : [], ai: false, reason: "missing_api_key" }; }
  const model = process.env["OPENAI_MENU_VISION_MODEL"] || process.env["OPENAI_MENU_MODEL"] || "gpt-5.6-sol";
  const prompt = `You are an expert restaurant-menu document reader doing a single, high-accuracy data-entry task. The restaurant manager manually selected ONE product rectangle from an original menu PDF. You must read that selected product with extreme care and return one clean bilingual record.

The image is authoritative. Inspect visual typography, font size, weight, alignment, line spacing, separators, punctuation, decimal points, Arabic letter shapes, and the spatial relationship between title, description and price. The PDF text hint is secondary and exists only to resolve OCR characters. Never allow the hint to invent text that is not visible.

CRITICAL PRODUCT BOUNDARY RULE:
- The selected rectangle is the target product. Do NOT create or select another product.
- Nearby products may be visible because the manager drew a generous rectangle. Ignore neighboring products unless their text is clearly part of the selected product.
- A section/category heading, ingredient, allergen, nutrition fact, modifier, topping, sauce, restaurant contact information, page number, slogan, or decorative text is NOT a product title.
- A price is never a title.

VISUAL HIERARCHY:
1. Identify the visually dominant product title line(s), normally the largest/boldest/prominent line associated with the item.
2. Identify smaller body text that describes that same item. Keep it as description, not title.
3. Identify the exact price attached to that item using spatial proximity, alignment, separators and typography.
4. If there are two language columns, identify each language independently. If the item repeats in two languages, it is ONE product.

ENGLISH TITLE: transcribe the printed English title exactly. If absent but an Arabic title exists, translate only the title into natural English. Never put description, price, category or modifier text in name_en.
ARABIC TITLE: transcribe the printed Arabic title exactly. If absent but an English title exists, translate only the title into natural Arabic. Never put description, price, category or modifier text in name_ar.
ENGLISH DESCRIPTION: ONLY descriptive English body text belonging to this product. If absent, null. If only Arabic description exists, translate faithfully.
ARABIC DESCRIPTION: ONLY descriptive Arabic body text belonging to this product. If absent, null. If only English description exists, translate faithfully.
DESCRIPTION QUALITY: ingredient/preparation wording is description only when visibly presented as this product's description. Do not copy adjacent product text. Do not invent.
PRICE: read the exact numeric price; never guess. Accept 3.50, 3,5, 3 JD, JD 3, JOD 3 or د.أ 3. Return a JSON number or null. Currency is JOD.
LANGUAGE: preserve printed language where available; translate only the missing language. Never reverse Arabic characters.
QUALITY CHECK: title fields contain only titles; description fields contain only associated descriptive text; price is visually attached. If uncertain, use null rather than hallucinating.

Return JSON only: {"products":[{"name_en":"","name_ar":"","description_en":null,"description_ar":null,"price":null,"currency":"JOD","category":null,"confidence":0.0,"bbox":{"x":0,"y":0,"width":1,"height":1}}]}

SECONDARY PDF TEXT HINT:
${source || "(none)"}`;
  let products: Product[] = []; let reason = "no_product_found";
  try { products = parseProducts(await callVision(apiKey, model, prompt, data.imageDataUrl, true)); reason = products.length ? "read" : "empty"; } catch (error) { reason = error instanceof Error ? error.message : "vision_failed"; try { products = parseProducts(await callVision(apiKey, model, prompt, data.imageDataUrl, false)); if (products.length) reason = "read-retry"; } catch (retryError) { reason = retryError instanceof Error ? retryError.message : reason; } }
  if (!products.length && source) { const recovered = localTextRecovery(source); if (recovered) products = [recovered]; }
  const result = products.filter((product) => product.name_en.trim() || product.name_ar.trim()).slice(0, 1).map((product, index) => ({ candidate_id: `p${data.pageNumber}-vision-${Date.now()}-${index}`, page_number: data.pageNumber, text: [product.name_en, product.name_ar, product.description_en, product.description_ar, product.price == null ? "" : `${product.price} JOD`].filter(Boolean).join(" | "), x: 0, y: 0, width: 1, height: 1, confidence: product.confidence, product: { ...product, currency: "JOD" } }));
  return { products: result, ai: result.length > 0, reason: result.length ? "read" : reason };
});
