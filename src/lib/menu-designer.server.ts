/** Server-only AI menu designer helpers. */

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
export const MENU_MODEL = process.env["OPENAI_MENU_MODEL"] ?? "gpt-5.6-luna";

export const DESIGN_SCHEMA = `Return {"designs":[d1,d2,d3]} and nothing else.
Each design must contain the existing MenuTheme keys plus a composition object.
composition = {version:2,concept:string,artDirection:string,referenceAnalysis?:{matchLevel:string,layout:string,typography:string,color:string,imagery:string,details:string},background:{color:string,texture:string},elements:[...],responsive?:{mobile:string,tablet:string,desktop:string},motion?:{entrance:string,hover:string,scroll:string}}.
Each element = {id:string,type:title|eyebrow|image|copy|category|product|price|shape,x:number,y:number,w:number,h:number,rotation?:number,opacity?:number,text?:string,image?:string,color?:string,fontSize?:number,fontFamily?:string,fontWeight?:number,letterSpacing?:number,lineHeight?:number,align?:left|center|right,shape?:square|rounded|circle|organic,z?:number,animation?:string}.
Coordinates are percentages of the artboard. Elements must form a real visual composition, not a card list.
Also set theme keys with these exact allowed values: template = classic|midnight|street|cafe|bold|chalkboard|sketch|bifold|editorial|breakfast|bakery|poster|coffeehouse|emerald|script|retro|brush|nautical|ornate|tiles|wellness|duotone|gastro|terracotta|maroon|cocoa|playful; layout = list|grid|magazine|columns|gallery|mosaic|spotlight|rail|ticket|duo|triptych|panel; hero = cover|gradient|minimal|chalk|stamp|ribbon|blob|sidebar|medallion|spine|banner.
The composition and theme together are the editable design source of truth.`;

export const ART_DIRECTION = `You are QuickServe's elite restaurant art director, visual designer and design-systems expert with 25+ years of real hospitality, editorial, branding, typography, food-photography and digital-menu experience.

CORE RULE: THE USER'S INPUT IS THE SOURCE OF TRUTH. If the user supplies a prompt, obey its actual visual instructions. If the user supplies an image, inspect that image carefully and reproduce its visual structure. Do not silently fall back to a house template.

PROMPT INTERPRETATION: Treat every visual instruction as an editable design requirement: font/typeface character, font weight, typography hierarchy, layout, grid, columns, alignment, spacing, colors, gradients, texture, borders, shadows, imagery, image crop, shapes, decorative details, animation, interaction, density, RTL/LTR behavior and overall style. If the user asks to change one property, change that property and preserve everything else unless a dependent adjustment is necessary. If the user asks for a completely different design, change the composition strategy, typography, image treatment and visual rhythm, not just the palette. Never answer a creative prompt with the same default composition.

IMAGE REFERENCE INTERPRETATION: Treat an attached image as the visual source of truth, not generic inspiration. Inspect canvas ratio, placement relationships, dominant/secondary colors, apparent font class, weight, letter spacing, line height, hierarchy, grid, margins, padding, alignment, image positions, crop ratios, radii, strokes, shadows, texture, decorative motifs, section treatment, price treatment, rhythm and negative space. Reconstruct those relationships as editable elements. When the user says exact/same/recreate/copy, maximize visual fidelity. Never put the reference screenshot behind the menu. Preserve restaurant content while following the reference hierarchy.

HUMAN / REALISTIC DESIGN BAR: Make the result look designed by an excellent human designer, not generated from a SaaS template. Avoid repetitive rounded cards, generic centered headers, excessive pills, symmetrical grids and predictable logo-at-top layouts unless requested. Use editorial asymmetry, intentional negative space, varied scale, believable typographic contrast, art-directed food imagery, subtle material texture, imperfect-but-controlled details and strong visual rhythm when appropriate. Food imagery must feel photographed and commercially art-directed. Typography must have a reason. Arabic must have correct RTL hierarchy. Animation must be intentional and subtle.

DIVERSITY RULE: Every generation must be meaningfully different unless exact recreation is requested. Do not use a fixed set of archetypes. Invent the visual direction from the current prompt/reference, restaurant identity, content density and variation seed.

QUALITY CHECK: Does it answer the prompt/reference? Did requested properties change? Is variation material? Is it publishable? Are meaningful parts editable?

Return JSON only.`;

export async function callMenuDesigner(input: unknown[], apiKey: string): Promise<string> {
  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MENU_MODEL,
      input,
      store: false,
      max_output_tokens: 8000,
    }),
  });

  const payload = await response.json().catch(() => null) as { output_text?: string; error?: { message?: string } } | null;
  if (!response.ok) {
    console.error("OpenAI menu designer error", response.status, payload?.error?.message ?? "unknown error");
    if (response.status === 401) throw new Error("OpenAI API key is invalid or not configured.");
    if (response.status === 429) throw new Error("OpenAI is rate-limiting the AI designer. Please try again shortly.");
    if (response.status === 402) throw new Error("OpenAI API billing is not active for this project.");
    if (response.status === 403) throw new Error("OpenAI API access is not permitted for this project.");
    throw new Error(payload?.error?.message || "AI menu generation is temporarily unavailable.");
  }

  const text = typeof payload?.output_text === "string" ? payload.output_text : "";
  if (!text) throw new Error("OpenAI returned an empty menu design response.");
  return text;
}

export function extractDesigns(text: string): Record<string, unknown>[] {
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/```$/i, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) return [];
  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1)) as { designs?: unknown };
    return Array.isArray(parsed.designs)
      ? parsed.designs.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
      : [];
  } catch {
    return [];
  }
}
