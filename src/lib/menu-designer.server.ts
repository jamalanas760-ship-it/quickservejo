/** Server-only AI menu designer helpers. */

const OPENAI_URL = "https://api.openai.com/v1/responses";
export const MENU_MODEL = "gpt-5.6-luna";

export const DESIGN_SCHEMA = `Return {"designs":[d1,d2,d3]} and nothing else.
Each design must contain the existing MenuTheme keys plus a composition object.
composition = {version:2,concept:string,artDirection:string,referenceAnalysis?:{matchLevel:string,layout:string,typography:string,color:string,imagery:string,details:string},background:{color:string,texture:string},elements:[...],responsive?:{mobile:string,tablet:string,desktop:string},motion?:{entrance:string,hover:string,scroll:string}}.
Each element = {id:string,type:title|eyebrow|image|copy|category|product|price|shape,x:number,y:number,w:number,h:number,rotation?:number,opacity?:number,text?:string,image?:string,color?:string,fontSize?:number,fontFamily?:string,fontWeight?:number,letterSpacing?:number,lineHeight?:number,align?:left|center|right,shape?:square|rounded|circle|organic,z?:number,animation?:string}.
Coordinates are percentages of the artboard. Elements must form a real visual composition, not a card list.
Also set theme keys with these exact allowed values: template = classic|midnight|street|cafe|bold|chalkboard|sketch|bifold|editorial|breakfast|bakery|poster|coffeehouse|emerald|script|retro|brush|nautical|ornate|tiles|wellness|duotone|gastro|terracotta|maroon|cocoa|playful; layout = list|grid|magazine|columns|gallery|mosaic|spotlight|rail|ticket|duo|triptych|panel; hero = cover|gradient|minimal|chalk|stamp|ribbon|blob|sidebar|medallion|spine|banner.
The composition and theme together are the editable design source of truth.`;

export const ART_DIRECTION = `You are QuickServe's elite restaurant art director, visual designer and design-systems expert with 25+ years of real hospitality, editorial, branding, typography, food-photography and digital-menu experience.

CORE RULE: THE USER'S INPUT IS THE SOURCE OF TRUTH.
If the user supplies a prompt, obey its actual visual instructions. If the user supplies an image, inspect that image carefully and reproduce its visual structure. Do not silently fall back to a house template.

PROMPT INTERPRETATION:
- Treat every visual instruction as an editable design requirement: font/typeface character, font weight, typography hierarchy, layout, grid, columns, alignment, spacing, colors, gradients, texture, borders, shadows, imagery, image crop, shapes, decorative details, animation, interaction, density, RTL/LTR behavior and overall style.
- If the user asks to change one property, change that property and preserve everything else unless a dependent adjustment is necessary.
- If the user asks for a completely different design, change the composition strategy, typography, image treatment and visual rhythm, not just the palette.
- Never answer a creative prompt with the same default composition.

IMAGE REFERENCE INTERPRETATION:
- Treat an attached image as the visual source of truth, not generic inspiration.
- Inspect canvas ratio, placement relationships, dominant/secondary colors, apparent font class, weight, letter spacing, line height, hierarchy, grid, margins, padding, alignment, image positions, crop ratios, radii, strokes, shadows, texture, decorative motifs, section treatment, price treatment, rhythm and negative space.
- Reconstruct those relationships as editable elements in composition.
- When the user says exact/same/recreate/copy, maximize visual fidelity to the reference: match structure, proportions, spacing, typography personality, colors, image treatment and decorative details as closely as the available editable schema allows.
- Never put the reference screenshot behind the menu. Never merely copy its dominant color. Rebuild its design system.
- Preserve the restaurant's real menu content while following the reference's hierarchy and approximate text-length rhythm.

HUMAN / REALISTIC DESIGN BAR:
- Make the result look designed by an excellent human designer, not generated from a SaaS template.
- Avoid repetitive rounded cards, generic centered headers, excessive pills, symmetrical grids and predictable logo-at-top layouts unless the prompt/reference asks for them.
- Use editorial asymmetry, intentional negative space, varied scale, believable typographic contrast, art-directed food imagery, subtle material texture, imperfect-but-controlled details and strong visual rhythm when appropriate.
- Food imagery must feel photographed and commercially art-directed: believable lighting, depth, crop, perspective and surface context.
- Typography must have a reason. Select a font class and hierarchy that matches the visual brief.
- Arabic must have correct RTL hierarchy and natural spacing. Bilingual menus need a deliberate bilingual system.
- Animation must be intentional and subtle; select entrance, hover and scroll behavior from the requested visual language rather than always using the same animation.

DIVERSITY RULE:
Every generation must be meaningfully different unless the user explicitly requests an exact recreation. Do not use a fixed set of archetypes. Invent the visual direction from the current prompt/reference, restaurant identity, content density and variation seed. A new variation must be allowed to change layout family, typography family, hero strategy, image treatment, spacing system, decorative language, animation and color relationship.

QUALITY CHECK BEFORE RETURNING:
1. Does it visibly answer the user's prompt/reference?
2. Did every explicitly requested property actually change?
3. Is the composition materially different when variation was requested?
4. Does it look publishable by a premium restaurant?
5. Are all meaningful parts editable?

Return JSON only.`;

function localDesignFallback(input: unknown[]): string {
  const raw = JSON.stringify(input).toLowerCase();
  const dark = /dark|black|midnight|luxury|premium|dramatic/.test(raw);
  const warm = /coffee|cafe|bakery|warm|terracotta|brown|cream/.test(raw);
  const arabic = /arabic|rtl|عربي|مطعم/.test(raw);
  const seed = Math.floor(Math.random() * 1000000);
  const palettes = dark
    ? [{ bg: "#101010", text: "#F7F2E8", accent: "#D9A441" }, { bg: "#191614", text: "#FFF8EE", accent: "#C56A3A" }, { bg: "#0D1720", text: "#F4F0E8", accent: "#7FA99B" }]
    : warm
      ? [{ bg: "#F3E8D5", text: "#241B16", accent: "#9A5A32" }, { bg: "#FFF8EC", text: "#2A211C", accent: "#C27A43" }, { bg: "#E9DED0", text: "#2B2420", accent: "#6B584A" }]
      : [{ bg: "#F7F7F4", text: "#171717", accent: "#C4472D" }, { bg: "#EEF2F5", text: "#111827", accent: "#2563EB" }, { bg: "#FFFDF8", text: "#27211D", accent: "#6D4C41" }];
  const layouts = ["editorial", "magazine", "spotlight"];
  const families = ["Georgia, serif", "Inter, sans-serif", "Arial, sans-serif"];
  const designs = palettes.map((p, i) => ({
    template: dark ? "midnight" : warm ? "cafe" : ["editorial", "bold", "poster"][i],
    layout: layouts[i],
    hero: ["cover", "minimal", "banner"][i],
    composition: {
      version: 2,
      concept: `Local no-credit concept ${i + 1}`,
      artDirection: `Generated locally from the user's brief${arabic ? " with RTL-ready hierarchy" : ""}; variation ${seed + i}.`,
      background: { color: p.bg, texture: i === 0 ? "subtle paper grain" : i === 1 ? "soft studio texture" : "clean matte" },
      elements: [
        { id: "eyebrow", type: "eyebrow", x: 7, y: 7, w: 45, h: 4, text: "MENU", color: p.accent, fontSize: 2.2, fontFamily: families[i], fontWeight: 700, letterSpacing: 0.2, lineHeight: 1.1, align: "left", z: 3 },
        { id: "title", type: "title", x: 7, y: 13, w: 70, h: 12, text: arabic ? "قائمة الطعام" : "Our Menu", color: p.text, fontSize: 6.5, fontFamily: families[i], fontWeight: 800, letterSpacing: -0.1, lineHeight: 1, align: "left", z: 3 },
        { id: "hero", type: "image", x: i === 1 ? 55 : 7, y: i === 1 ? 9 : 29, w: i === 1 ? 38 : 86, h: i === 1 ? 30 : 23, color: p.accent, shape: i === 2 ? "organic" : "rounded", z: 1, animation: "fade-up" },
        { id: "category", type: "category", x: 7, y: i === 1 ? 44 : 56, w: 50, h: 6, text: arabic ? "الأطباق الرئيسية" : "SIGNATURE DISHES", color: p.accent, fontSize: 3, fontFamily: families[i], fontWeight: 700, letterSpacing: 0.12, lineHeight: 1.1, align: "left", z: 3 },
        { id: "copy", type: "copy", x: 7, y: i === 1 ? 51 : 64, w: 78, h: 12, text: arabic ? "وصف مختصر للأطباق المميزة" : "Freshly prepared dishes with a carefully art-directed presentation.", color: p.text, fontSize: 2.5, fontFamily: families[i], fontWeight: 400, letterSpacing: 0, lineHeight: 1.4, align: "left", z: 3 },
        { id: "price", type: "price", x: 75, y: i === 1 ? 51 : 64, w: 18, h: 7, text: "5.90 JOD", color: p.accent, fontSize: 3.2, fontFamily: families[i], fontWeight: 800, letterSpacing: 0, lineHeight: 1, align: "right", z: 3 },
      ],
      responsive: { mobile: "Stack imagery above content; preserve 7% safe margins; never overflow horizontally.", tablet: "Use two-column editorial balance where space permits.", desktop: "Preserve art-directed negative space and hierarchy." },
      motion: { entrance: "fade-up", hover: "subtle-lift", scroll: "gentle-reveal" },
    },
  }));
  return JSON.stringify({ designs });
}

export async function callMenuDesigner(input: unknown[], apiKey?: string): Promise<string> {
  // No Lovable AI credits are required. When no OpenAI server secret is available,
  // return a fully editable local composition instead of throwing a configuration error.
  if (!apiKey) return localDesignFallback(input);

  const response = await fetch(OPENAI_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: MENU_MODEL, input, store: false, max_output_tokens: 8000 }),
  });

  const raw = await response.text();
  let payload: { output_text?: string; error?: { message?: string; code?: string } } = {};
  try { payload = JSON.parse(raw) as typeof payload; } catch { payload = {}; }

  if (!response.ok) {
    console.error("OpenAI menu designer error", response.status, payload.error?.message ?? raw.slice(0, 500));
    // Keep the designer usable even when OpenAI is unavailable/rate-limited.
    if (response.status === 401 || response.status === 403 || response.status === 429) return localDesignFallback(input);
    throw new Error(payload.error?.message || "OpenAI menu generation is temporarily unavailable.");
  }

  if (typeof payload.output_text === "string" && payload.output_text.trim()) return payload.output_text;
  const output = (payload as unknown as { output?: Array<{ content?: Array<{ type?: string; text?: string }> }> }).output ?? [];
  const text = output.flatMap((item) => item.content ?? []).filter((part) => part.type === "output_text" && typeof part.text === "string").map((part) => part.text as string).join("");
  if (!text.trim()) return localDesignFallback(input);
  return text;
}

export function extractDesigns(text: string): Record<string, unknown>[] {
  const cleaned = text.replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) return [];
  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1)) as { designs?: unknown };
    return Array.isArray(parsed.designs) ? parsed.designs.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object") : [];
  } catch { return []; }
}
