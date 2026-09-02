/** Server-only AI menu designer helpers. */

const OPENAI_URL = "https://api.openai.com/v1/responses";
export const MENU_MODEL = "gpt-5.6-luna";

/**
 * Native QuickServe menu-generation contract inspired by the capabilities
 * users expect from modern AI menu generators, without depending on a
 * third-party generator or its credits/API.
 */
export const DESIGN_SCHEMA = `Return {"designs":[d1,d2,d3]} and nothing else.
Each design must contain the existing MenuTheme keys plus a composition object.
composition = {version:3,concept:string,artDirection:string,languageMode:ar|en|bilingual,engine:"quickserve-ai-menu",referenceAnalysis?:{matchLevel:string,layout:string,typography:string,color:string,imagery:string,details:string},background:{color:string,texture:string},brand?:{logo:string,primary:string,secondary:string,accent:string},elements:[...],responsive?:{mobile:string,tablet:string,desktop:string},motion?:{entrance:string,hover:string,scroll:string},contentBinding?:{restaurantName:string,menuItems:string,languageRules:string}}.
Each element = {id:string,type:title|eyebrow|image|copy|category|product|price|shape,x:number,y:number,w:number,h:number,rotation?:number,opacity?:number,text?:string,textAr?:string,textEn?:string,image?:string,dataKey?:string,color?:string,fontSize?:number,fontFamily?:string,fontWeight?:number,letterSpacing?:number,lineHeight?:number,align?:left|center|right,direction?:ltr|rtl,shape?:square|rounded|circle|organic,z?:number,animation?:string}.
Coordinates are percentages of the artboard. Elements must form a real visual composition, not a card list.
For bilingual menus, keep Arabic and English as first-class content fields and never replace one language with a machine-translated placeholder.
Use the restaurant's real menu data, prices, images and branding whenever they are available.
Also set theme keys with these exact allowed values: template = classic|midnight|street|cafe|bold|chalkboard|sketch|bifold|editorial|breakfast|bakery|poster|coffeehouse|emerald|script|retro|brush|nautical|ornate|tiles|wellness|duotone|gastro|terracotta|maroon|cocoa|playful; layout = list|grid|magazine|columns|gallery|mosaic|spotlight|rail|ticket|duo|triptych|panel; hero = cover|gradient|minimal|chalk|stamp|ribbon|blob|sidebar|medallion|spine|banner.
The composition and theme together are the editable design source of truth.`;

export const ART_DIRECTION = `You are QuickServe's elite restaurant art director, visual designer and design-systems expert with 25+ years of real hospitality, editorial, branding, typography, food-photography and digital-menu experience.

CORE RULE: THE USER'S INPUT IS THE SOURCE OF TRUTH.
If the user supplies a prompt, obey its actual visual instructions. If the user supplies an image, inspect that image carefully and reproduce its visual structure. Do not silently fall back to a house template.

NATIVE AI MENU GENERATOR BAR:
- Reproduce the useful capabilities users expect from premium AI restaurant-menu generators: guided style direction, brand-aware layouts, food-image composition, typography hierarchy, multiple design directions, editable content, responsive output and print/digital awareness.
- This is a QuickServe-native engine. Do not reference or depend on an external generator, external credits, or provider-specific templates.
- Build a coherent menu system that can be used for web/QR menus, mobile, desktop, print and social crops when the prompt asks for them.
- Treat restaurant data as structured content, not decorative placeholder copy.

BILINGUAL / LOCALIZATION RULES:
- Arabic is native RTL, never mirrored LTR.
- English is native LTR.
- Bilingual menus must contain both the real Arabic and English fields when those fields exist.
- Keep prices/numbers legible and consistent with the menu's writing direction.
- Do not invent Arabic translations when a real Arabic value exists.
- Do not invent English translations when a real English value exists.
- Select Arabic-compatible fonts or font fallbacks that render connected Arabic glyphs correctly.
- For Arabic-only designs, optimize hierarchy and spacing for RTL reading rather than simply flipping an English layout.
- For English-only designs, use deliberate LTR hierarchy.
- For bilingual designs, create a clear relationship between the two scripts without making either language look secondary or broken.

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

CONTENT / BRAND RULES:
- Use the restaurant name, logo, primary color, accent color, currency, categories, item names, descriptions, prices and product images supplied by QuickServe.
- Never replace real products with generic "Signature Dish" placeholders when real menu items are available.
- Every product element should carry a dataKey when it maps to a real menu field.
- Preserve the user's actual prices exactly; do not invent or round prices.
- Prefer real image URLs from the restaurant menu. If no image exists, create an intentional image-treatment element rather than pretending a placeholder is a real photo.

DIVERSITY RULE:
Every generation must be meaningfully different unless the user explicitly requests an exact recreation. Do not use a fixed set of archetypes. Invent the visual direction from the current prompt/reference, restaurant identity, content density and variation seed. A new variation must be allowed to change layout family, typography family, hero strategy, image treatment, spacing system, decorative language, animation and color relationship.

QUALITY CHECK BEFORE RETURNING:
1. Does it visibly answer the user's prompt/reference?
2. Did every explicitly requested property actually change?
3. Is the composition materially different when variation was requested?
4. Does it look publishable by a premium restaurant?
5. Are all meaningful parts editable?
6. Does Arabic render as real RTL and English as real LTR?
7. If bilingual, are both language fields preserved and visually intentional?
8. Are real restaurant products, prices, branding and images used instead of generic placeholders?

Return JSON only.`;

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function collectObjects(value: unknown, output: Record<string, unknown>[] = []): Record<string, unknown>[] {
  if (Array.isArray(value)) {
    for (const item of value) collectObjects(item, output);
  } else if (value && typeof value === "object") {
    output.push(value as Record<string, unknown>);
    for (const item of Object.values(value as Record<string, unknown>)) collectObjects(item, output);
  }
  return output;
}

function getString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function localDesignFallback(input: unknown[]): string {
  const raw = JSON.stringify(input);
  const lower = raw.toLowerCase();
  const hash = stableHash(raw);
  const objects = collectObjects(input);
  const dark = /dark|black|midnight|luxury|premium|dramatic|black background/.test(lower);
  const warm = /coffee|cafe|bakery|warm|terracotta|brown|cream|beige|earth/.test(lower);
  const light = /white|bright|clean|minimal|airy|light/.test(lower);
  const editorial = /editorial|magazine|newspaper|serif|fashion|luxury/.test(lower);
  const bold = /bold|poster|street|graffiti|experimental|playful|modern/.test(lower);
  const arabicRequested = /arabic|rtl|عربي|مطعم|قائمة/.test(lower);
  const englishRequested = /english|ltr|menu|restaurant/.test(lower);
  const bilingual = /bilingual|arabic\s*\+\s*english|english\s*\+\s*arabic|ثنائي|عربي.*إنجليزي|إنجليزي.*عربي/.test(lower);
  const hasReference = /input_image|data:image|reference image|reference_image/.test(lower);

  const restaurant = objects.find((item) => getString(item.name) && ("primary_color" in item || "currency" in item || "description_en" in item)) ?? {};
  const restaurantName = getString(restaurant.name) || (arabicRequested ? "مطعمك" : "Your Restaurant");
  const primary = getString(restaurant.primary_color) || getString(restaurant.primaryColor);
  const accent = getString(restaurant.accent_color) || getString(restaurant.accentColor);
  const currency = getString(restaurant.currency) || "JOD";
  const menuArrays = objects.filter((item) => Array.isArray(item.items) || Array.isArray(item.menuItems));
  const menuItems = menuArrays.flatMap((item) => {
    const value = Array.isArray(item.items) ? item.items : item.menuItems;
    return Array.isArray(value) ? value.filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object") : [];
  }).slice(0, 12);

  const palettes = (dark
    ? [["#101010", "#F7F2E8", accent || "#D9A441"], ["#191614", "#FFF8EE", accent || "#C56A3A"], ["#0D1720", "#F4F0E8", accent || "#7FA99B"]]
    : warm
      ? [[primary || "#F3E8D5", "#241B16", accent || "#9A5A32"], ["#FFF8EC", "#2A211C", accent || "#C27A43"], ["#E9DED0", "#2B2420", accent || "#6B584A"]]
      : light
        ? [[primary || "#FFFFFF", "#171717", accent || "#B63A2B"], ["#F5F7F9", "#111827", accent || "#2563EB"], ["#FAF8F3", "#27211D", accent || "#6D4C41"]]
        : [[primary || "#F7F7F4", "#171717", accent || "#C4472D"], ["#EEF2F5", "#111827", accent || "#2563EB"], ["#FFFDF8", "#27211D", accent || "#6D4C41"]]) as Array<[string, string, string]>;

  const layoutPool = editorial ? ["magazine", "columns", "duo"] : bold ? ["spotlight", "mosaic", "triptych"] : ["editorial", "panel", "triptych"];
  const fontPool = editorial ? ["Georgia, serif", "Times New Roman, serif", "Garamond, serif"] : bold ? ["Arial Black, Arial, sans-serif", "Inter, sans-serif", "Impact, Arial, sans-serif"] : ["Inter, sans-serif", "Arial, sans-serif", "Georgia, serif"];
  const heroPool = ["cover", "sidebar", "banner", "minimal", "medallion", "blob"];
  const texturePool = ["subtle paper grain", "soft studio texture", "clean matte", "fine print grain", "warm tactile paper", "minimal noise"];
  const motions = ["fade-up", "gentle-reveal", "subtle-scale", "slide-in", "soft-fade", "none"];
  const offset = hash % 6;
  const languageMode = bilingual ? "bilingual" : arabicRequested && !englishRequested ? "ar" : "en";
  const align = languageMode === "ar" ? "right" : "left";
  const direction = languageMode === "ar" ? "rtl" : "ltr";
  const firstItem = menuItems[0] ?? {};
  const itemAr = getString(firstItem.name_ar) || "طبق مميز";
  const itemEn = getString(firstItem.name_en) || "Signature Dish";
  const descriptionAr = getString(firstItem.description_ar) || "وصف الطبق";
  const descriptionEn = getString(firstItem.description_en) || "A carefully prepared signature dish.";
  const price = getString(firstItem.price) || `5.90 ${currency}`;
  const itemImage = getString(firstItem.image_url) || undefined;

  const designs = [0, 1, 2].map((index) => {
    const palette: [string, string, string] = palettes[(index + offset) % palettes.length] ?? ["#FFFFFF", "#171717", "#C4472D"];
    const layout = layoutPool[(index + Math.floor(hash / 7)) % layoutPool.length];
    const font = fontPool[(index + Math.floor(hash / 13)) % fontPool.length];
    const hero = heroPool[(index + Math.floor(hash / 17)) % heroPool.length];
    const motion = motions[(index + Math.floor(hash / 23)) % motions.length];
    const sideImage = (index + offset) % 2 === 1;
    const titleX = languageMode === "ar" ? (sideImage ? 48 : 10) : 8;
    const titleW = sideImage ? 45 : 82;
    const heroX = sideImage ? 57 : 8;
    const heroY = sideImage ? 10 : 29 + ((hash + index * 11) % 8);
    const heroW = sideImage ? 36 : 84;
    const heroH = sideImage ? 34 : 22;
    const concept = hasReference ? `Reference-aware native direction ${index + 1} — ${hash % 10000}` : `Prompt-driven native direction ${index + 1} — ${hash % 10000}`;
    const productX = languageMode === "ar" ? 46 : 8;

    return {
      template: dark ? "midnight" : warm ? "cafe" : bold ? ["poster", "bold", "street"][index] : ["editorial", "classic", "duotone"][index],
      layout,
      hero,
      composition: {
        version: 3,
        concept,
        artDirection: `QuickServe-native AI menu direction ${index + 1}. Layout=${layout}; typography=${font}; hero=${hero}; language=${languageMode}.`,
        languageMode,
        engine: "quickserve-ai-menu",
        brand: { logo: getString(restaurant.logo_url), primary: palette[0], secondary: palette[1], accent: palette[2] },
        background: { color: palette[0], texture: texturePool[(index + offset) % texturePool.length] },
        elements: [
          { id: "eyebrow", type: "eyebrow", x: titleX, y: 7, w: 42, h: 4, text: languageMode === "ar" ? "القائمة" : "MENU", color: palette[2], fontSize: 2.2 + (index % 2) * 0.3, fontFamily: font, fontWeight: 700, letterSpacing: 0.2, lineHeight: 1.1, align, direction, z: 3 },
          { id: "title", type: "title", x: titleX, y: 13, w: titleW, h: 12 + (index % 2) * 2, text: languageMode === "ar" ? restaurantName : restaurantName, textAr: restaurantName, textEn: restaurantName, color: palette[1], fontSize: 5.6 + index * 0.8, fontFamily: font, fontWeight: 800, letterSpacing: -0.1, lineHeight: 1, align, direction, z: 3, dataKey: "restaurant.name" },
          { id: "hero", type: "image", x: heroX, y: heroY, w: heroW, h: heroH, image: itemImage, color: palette[2], shape: ["rounded", "square", "organic"][index], z: 1, animation: motion, dataKey: itemImage ? "menu_items[0].image_url" : undefined },
          { id: "category", type: "category", x: titleX, y: sideImage ? 50 : 56 + index * 2, w: 52, h: 6, text: languageMode === "ar" ? "الأطباق الرئيسية" : "SIGNATURE DISHES", textAr: "الأطباق الرئيسية", textEn: "SIGNATURE DISHES", color: palette[2], fontSize: 2.7 + index * 0.2, fontFamily: font, fontWeight: 700, letterSpacing: 0.12, lineHeight: 1.1, align, direction, z: 3 },
          { id: "product-name", type: "product", x: productX, y: sideImage ? 57 : 64 + index * 2, w: sideImage ? 58 : 62, h: 9, text: languageMode === "ar" ? itemAr : itemEn, textAr: itemAr, textEn: itemEn, color: palette[1], fontSize: 3.2 + index * 0.2, fontFamily: font, fontWeight: 700, letterSpacing: 0, lineHeight: 1.2, align, direction, z: 3, dataKey: "menu_items[0].name" },
          { id: "copy", type: "copy", x: productX, y: sideImage ? 66 : 73 + index * 2, w: sideImage ? 70 : 72, h: 12, text: languageMode === "ar" ? descriptionAr : descriptionEn, textAr: descriptionAr, textEn: descriptionEn, color: palette[1], fontSize: 2.4 + (index % 2) * 0.3, fontFamily: font, fontWeight: 400, letterSpacing: 0, lineHeight: 1.4, align, direction, z: 3, dataKey: "menu_items[0].description" },
          { id: "price", type: "price", x: languageMode === "ar" ? 8 : 75 - index * 3, y: sideImage ? 57 : 64 + index * 2, w: 20, h: 7, text: price, color: palette[2], fontSize: 3.1 + index * 0.2, fontFamily: font, fontWeight: 800, letterSpacing: 0, lineHeight: 1, align: languageMode === "ar" ? "left" : "right", direction, z: 3, dataKey: "menu_items[0].price" },
        ],
        responsive: { mobile: "Stack imagery above content; preserve 7% safe margins; respect RTL/LTR direction; never overflow horizontally.", tablet: "Use the generated hierarchy with two-column balance where space permits; preserve bilingual readability.", desktop: "Preserve art-directed negative space, brand identity and the selected layout family." },
        motion: { entrance: motion, hover: index === 1 ? "subtle-scale" : "subtle-lift", scroll: index === 2 ? "gentle-reveal" : "soft-fade" },
        contentBinding: { restaurantName: "restaurants.name", menuItems: "menu_items", languageRules: "Arabic=RTL, English=LTR, bilingual=both real fields preserved" },
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