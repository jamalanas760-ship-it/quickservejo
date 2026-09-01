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

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function localDesignFallback(input: unknown[]): string {
  const raw = JSON.stringify(input);
  const lower = raw.toLowerCase();
  const hash = stableHash(raw);
  const dark = /dark|black|midnight|luxury|premium|dramatic|black background/.test(lower);
  const warm = /coffee|cafe|bakery|warm|terracotta|brown|cream|beige|earth/.test(lower);
  const light = /white|bright|clean|minimal|airy|light/.test(lower);
  const editorial = /editorial|magazine|newspaper|serif|fashion|luxury/.test(lower);
  const bold = /bold|poster|street|graffiti|experimental|playful|modern/.test(lower);
  const arabic = /arabic|rtl|عربي|مطعم|قائمة/.test(lower);
  const hasReference = /input_image|data:image|reference image|reference_image/.test(lower);

  const palettes = dark
    ? [["#101010", "#F7F2E8", "#D9A441"], ["#191614", "#FFF8EE", "#C56A3A"], ["#0D1720", "#F4F0E8", "#7FA99B"]]
    : warm
      ? [["#F3E8D5", "#241B16", "#9A5A32"], ["#FFF8EC", "#2A211C", "#C27A43"], ["#E9DED0", "#2B2420", "#6B584A"]]
      : light
        ? [["#FFFFFF", "#171717", "#B63A2B"], ["#F5F7F9", "#111827", "#2563EB"], ["#FAF8F3", "#27211D", "#6D4C41"]]
        : [["#F7F7F4", "#171717", "#C4472D"], ["#EEF2F5", "#111827", "#2563EB"], ["#FFFDF8", "#27211D", "#6D4C41"]];

  const layoutPool = editorial
    ? ["magazine", "columns", "duo"]
    : bold
      ? ["poster", "spotlight", "mosaic"]
      : ["editorial", "panel", "triptych"];
  const fontPool = editorial
    ? ["Georgia, serif", "Times New Roman, serif", "Garamond, serif"]
    : bold
      ? ["Arial Black, Arial, sans-serif", "Inter, sans-serif", "Impact, Arial, sans-serif"]
      : ["Inter, sans-serif", "Arial, sans-serif", "Georgia, serif"];
  const heroPool = ["cover", "sidebar", "banner", "minimal", "medallion", "blob"];
  const texturePool = ["subtle paper grain", "soft studio texture", "clean matte", "fine print grain", "warm tactile paper", "minimal noise"];
  const motions = ["fade-up", "gentle-reveal", "subtle-scale", "slide-in", "soft-fade", "none"];
  const offset = hash % 6;

  const designs = [0, 1, 2].map((index) => {
    const palette = palettes[(index + offset) % palettes.length];
    const layout = layoutPool[(index + Math.floor(hash / 7)) % layoutPool.length];
    const font = fontPool[(index + Math.floor(hash / 13)) % fontPool.length];
    const hero = heroPool[(index + Math.floor(hash / 17)) % heroPool.length];
    const motion = motions[(index + Math.floor(hash / 23)) % motions.length];
    const sideImage = (index + offset) % 2 === 1;
    const titleX = sideImage ? 7 : 8;
    const titleW = sideImage ? 45 : 82;
    const heroX = sideImage ? 57 : 8;
    const heroY = sideImage ? 10 : 29 + ((hash + index * 11) % 8);
    const heroW = sideImage ? 36 : 84;
    const heroH = sideImage ? 34 : 22;
    const concept = hasReference
      ? `Reference-aware local direction ${index + 1} — visual fingerprint ${hash % 10000}`
      : `Prompt-driven local direction ${index + 1} — visual fingerprint ${hash % 10000}`;

    return {
      template: dark ? "midnight" : warm ? "cafe" : bold ? ["poster", "bold", "street"][index] : ["editorial", "classic", "duotone"][index],
      layout,
      hero,
      composition: {
        version: 2,
        concept,
        artDirection: `Locally generated from the exact current prompt/reference fingerprint ${hash}. Layout=${layout}; typography=${font}; hero=${hero}.`,
        referenceAnalysis: hasReference ? {
          matchLevel: "reference-aware fallback; exact visual reconstruction requires an image-capable AI provider",
          layout: `${layout} direction selected from the reference input fingerprint`,
          typography: `${font} class selected from the request context`,
          color: `${palette[0]} / ${palette[1]} / ${palette[2]}`,
          imagery: "Reference input detected; editable image treatment varies per concept",
          details: "Every concept receives a distinct composition seed rather than a fixed template",
        } : undefined,
        background: { color: palette[0], texture: texturePool[(index + offset) % texturePool.length] },
        elements: [
          { id: "eyebrow", type: "eyebrow", x: titleX, y: 7, w: 42, h: 4, text: arabic ? "القائمة" : "MENU", color: palette[2], fontSize: 2.2 + (index % 2) * 0.3, fontFamily: font, fontWeight: 700, letterSpacing: 0.2, lineHeight: 1.1, align: "left", z: 3 },
          { id: "title", type: "title", x: titleX, y: 13, w: titleW, h: 12 + (index % 2) * 2, text: arabic ? "قائمة الطعام" : ["Our Menu", "Signature Menu", "The Table"][index], color: palette[1], fontSize: 5.6 + index * 0.8, fontFamily: font, fontWeight: 800, letterSpacing: -0.1, lineHeight: 1, align: "left", z: 3 },
          { id: "hero", type: "image", x: heroX, y: heroY, w: heroW, h: heroH, color: palette[2], shape: ["rounded", "square", "organic"][index], z: 1, animation: motion },
          { id: "category", type: "category", x: titleX, y: sideImage ? 50 : 56 + index * 2, w: 52, h: 6, text: arabic ? "الأطباق الرئيسية" : ["SIGNATURE DISHES", "FROM THE KITCHEN", "CHEF'S SELECTION"][index], color: palette[2], fontSize: 2.7 + index * 0.2, fontFamily: font, fontWeight: 700, letterSpacing: 0.12, lineHeight: 1.1, align: "left", z: 3 },
          { id: "copy", type: "copy", x: titleX, y: sideImage ? 57 : 64 + index * 2, w: sideImage ? 78 : 72 + index * 5, h: 12, text: arabic ? "وصف مختصر للأطباق المميزة" : ["Freshly prepared dishes with a carefully art-directed presentation.", "Seasonal ingredients, crafted with restraint and character.", "A considered menu built around flavor, texture and atmosphere."][index], color: palette[1], fontSize: 2.4 + (index % 2) * 0.3, fontFamily: font, fontWeight: 400, letterSpacing: 0, lineHeight: 1.4, align: "left", z: 3 },
          { id: "price", type: "price", x: sideImage ? 72 : 75 - index * 3, y: sideImage ? 57 : 64 + index * 2, w: 20, h: 7, text: `${5 + index}.90 JOD`, color: palette[2], fontSize: 3.1 + index * 0.2, fontFamily: font, fontWeight: 800, letterSpacing: 0, lineHeight: 1, align: "right", z: 3 },
        ],
        responsive: { mobile: "Stack imagery above content; preserve 7% safe margins; never overflow horizontally.", tablet: "Use the generated composition's chosen hierarchy with two-column balance where space permits.", desktop: "Preserve art-directed negative space and the selected layout family." },
        motion: { entrance: motion, hover: index === 1 ? "subtle-scale" : "subtle-lift", scroll: index === 2 ? "gentle-reveal" : "soft-fade" },
      },
    };
  });

  return JSON.stringify({ designs });
}

export async function callMenuDesigner(input: unknown[], apiKey?: string): Promise<string> {
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
