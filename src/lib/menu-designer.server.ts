/** Server-only AI menu designer helpers. */

const OPENAI_URL = "https://api.openai.com/v1/responses";
export const MENU_MODEL = "gpt-5.6-luna";

export const DESIGN_SCHEMA = `Return {"designs":[d1,d2,d3]} and nothing else.
Each design must contain MenuTheme keys plus composition.
composition = {version:3,concept:string,artDirection:string,languageMode:ar|en|bilingual,engine:"quickserve-ai-menu",referenceAnalysis?:object,background:{color:string,texture:string},brand?:object,elements:[],responsive?:object,motion?:object,contentBinding?:object}.
Each element = {id,type,x,y,w,h,text?,textAr?,textEn?,image?,dataKey?,color?,fontSize?,fontFamily?,fontWeight?,letterSpacing?,lineHeight?,align?,direction?,shape?,z?,animation?}.
Coordinates are percentages of the artboard. Elements must form a real visual composition, not a card list.
Preserve real Arabic and English fields, exact prices, real images and restaurant branding whenever available. Arabic is true RTL; English is true LTR; bilingual preserves both.
Allowed template values: classic|midnight|street|cafe|bold|chalkboard|sketch|bifold|editorial|breakfast|bakery|poster|coffeehouse|emerald|script|retro|brush|nautical|ornate|tiles|wellness|duotone|gastro|terracotta|maroon|cocoa|playful.
Allowed layout values: list|grid|magazine|columns|gallery|mosaic|spotlight|rail|ticket|duo|triptych|panel.
Allowed hero values: cover|gradient|minimal|chalk|stamp|ribbon|blob|sidebar|medallion|spine|banner.
The composition and theme together are the editable design source of truth.`;

export const ART_DIRECTION = `You are QuickServe's elite restaurant art director and design-systems expert.
USER INPUT IS THE SOURCE OF TRUTH. Follow the prompt and reference image rather than silently applying a generic template.
Build premium restaurant menus with guided style direction, brand-aware layouts, food imagery, typography hierarchy, multiple concepts, editable content, responsive behavior and print/digital awareness.
Arabic is native RTL. English is native LTR. Bilingual designs preserve real Arabic and English fields and never replace them with placeholders.
Use the restaurant name, logo, colors, currency, categories, item names, descriptions, prices and images supplied by QuickServe. Never replace real products with generic placeholders when real data exists.
For reference images, reconstruct hierarchy, grid, spacing, typography personality, colors, image crops, decorative language and negative space as editable elements. Never place the screenshot behind the menu.
Make the result look human-designed: avoid repetitive SaaS cards, generic centered headers and predictable grids unless requested. Use intentional hierarchy, negative space, varied scale and art-directed imagery.
Every requested variation must materially change composition, typography, image treatment, spacing or visual rhythm unless exact recreation is requested.
Return valid JSON only.`;

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function getString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
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

function collectEmbeddedJson(value: unknown, output: Record<string, unknown>[] = []): Record<string, unknown>[] {
  if (typeof value === "string") {
    const marker = value.indexOf("QUICKSERVE_MENU_DATA:");
    if (marker >= 0) {
      const candidate = value.slice(marker + "QUICKSERVE_MENU_DATA:".length).trim();
      try {
        const parsed = JSON.parse(candidate) as unknown;
        collectObjects(parsed, output);
      } catch {
        // Ignore malformed embedded metadata; the visual fallback still works.
      }
    }
  } else if (Array.isArray(value)) {
    for (const item of value) collectEmbeddedJson(item, output);
  } else if (value && typeof value === "object") {
    for (const item of Object.values(value as Record<string, unknown>)) collectEmbeddedJson(item, output);
  }
  return output;
}

function localDesignFallback(input: unknown[]): string {
  const raw = JSON.stringify(input);
  const lower = raw.toLowerCase();
  const hash = stableHash(raw);
  const objects = [...collectObjects(input), ...collectEmbeddedJson(input)];
  const dark = /dark|black|midnight|luxury|premium|dramatic/.test(lower);
  const warm = /coffee|cafe|bakery|warm|terracotta|brown|cream|beige|earth/.test(lower);
  const light = /white|bright|clean|minimal|airy|light/.test(lower);
  const editorial = /editorial|magazine|newspaper|serif|fashion|luxury/.test(lower);
  const bold = /bold|poster|street|graffiti|experimental|playful|modern/.test(lower);
  const arabicRequested = /arabic|rtl|عربي|مطعم|قائمة/.test(lower);
  const englishRequested = /english|ltr|menu|restaurant/.test(lower);
  const bilingual = /bilingual|arabic\s*\+\s*english|english\s*\+\s*arabic|ثنائي|عربي.*إنجليزي|إنجليزي.*عربي/.test(lower);
  const hasReference = /input_image|data:image|reference image|reference_image/.test(lower);

  const restaurant = objects.find((item) => getString(item["name"]) && ("primary_color" in item || "currency" in item || "description_en" in item)) ?? {};
  const restaurantName = getString(restaurant["name"]) || (arabicRequested ? "مطعمك" : "Your Restaurant");
  const primary = getString(restaurant["primary_color"]) || getString(restaurant["primaryColor"]);
  const secondary = getString(restaurant["secondary_color"]) || getString(restaurant["secondaryColor"]);
  const accent = getString(restaurant["accent_color"]) || getString(restaurant["accentColor"]);
  const logo = getString(restaurant["logo_url"]) || getString(restaurant["logo"]);
  const currency = getString(restaurant["currency"]) || "JOD";

  const menuArrays = objects.filter((item) => Array.isArray(item["items"]) || Array.isArray(item["menuItems"]) || Array.isArray(item["menu_items"]));
  const menuItems = menuArrays.flatMap((item) => {
    const value = Array.isArray(item["items"]) ? item["items"] : Array.isArray(item["menuItems"]) ? item["menuItems"] : item["menu_items"];
    return Array.isArray(value) ? value.filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object") : [];
  }).slice(0, 12);

  const palettes = (dark
    ? [["#101010", "#F7F2E8", accent || "#D9A441"], ["#191614", "#FFF8EE", accent || "#C56A3A"], ["#0D1720", "#F4F0E8", accent || "#7FA99B"]]
    : warm
      ? [[primary || "#F3E8D5", secondary || "#241B16", accent || "#9A5A32"], ["#FFF8EC", secondary || "#2A211C", accent || "#C27A43"], ["#E9DED0", secondary || "#2B2420", accent || "#6B584A"]]
      : light
        ? [[primary || "#FFFFFF", secondary || "#171717", accent || "#B63A2B"], ["#F5F7F9", "#111827", accent || "#2563EB"], ["#FAF8F3", "#27211D", accent || "#6D4C41"]]
        : [[primary || "#F7F7F4", secondary || "#171717", accent || "#C4472D"], ["#EEF2F5", "#111827", accent || "#2563EB"], ["#FFFDF8", "#27211D", accent || "#6D4C41"]]) as Array<[string, string, string]>;

  const layoutPool = editorial ? ["magazine", "columns", "duo"] : bold ? ["spotlight", "mosaic", "triptych"] : ["editorial", "panel", "triptych"];
  const fontPool = editorial ? ["Georgia, serif", "Times New Roman, serif", "Garamond, serif"] : bold ? ["Arial Black, Arial, sans-serif", "Inter, sans-serif", "Impact, Arial, sans-serif"] : ["Inter, sans-serif", "Arial, sans-serif", "Georgia, serif"];
  const heroPool = ["cover", "sidebar", "banner", "minimal", "medallion", "blob"];
  const texturePool = ["subtle paper grain", "soft studio texture", "clean matte", "fine print grain", "warm tactile paper", "minimal noise"];
  const motions = ["fade-up", "gentle-reveal", "subtle-scale", "slide-in", "soft-fade", "none"];
  const offset = hash % 6;
  const languageMode = bilingual ? "bilingual" : arabicRequested && !englishRequested ? "ar" : "en";
  const direction = languageMode === "ar" ? "rtl" : "ltr";
  const align = languageMode === "ar" ? "right" : "left";

  const makeItem = (item: Record<string, unknown>, index: number) => ({
    ar: getString(item["name_ar"]) || getString(item["nameAr"]) || `طبق ${index + 1}`,
    en: getString(item["name_en"]) || getString(item["nameEn"]) || `Dish ${index + 1}`,
    descAr: getString(item["description_ar"]) || getString(item["descriptionAr"]),
    descEn: getString(item["description_en"]) || getString(item["descriptionEn"]),
    price: getString(item["price"]) || "",
    image: getString(item["image_url"]) || getString(item["imageUrl"]) || undefined,
    key: `menu_items[${index}]`,
  });
  const items = (menuItems.length ? menuItems : [{ name_ar: "طبق مميز", name_en: "Signature Dish", description_ar: "طبق محضر بعناية", description_en: "A carefully prepared signature dish.", price: `5.90 ${currency}` }]).map(makeItem);

  const designs = [0, 1, 2].map((index) => {
    const palette = palettes[(index + offset) % palettes.length] ?? ["#FFFFFF", "#171717", "#C4472D"];
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
    const productX = languageMode === "ar" ? 46 : 8;
    const primaryItem = items[0] ?? { ar: "طبق مميز", en: "Signature Dish", descAr: "طبق محضر بعناية", descEn: "A carefully prepared signature dish.", price: `5.90 ${currency}`, image: undefined, key: "menu_items[0]" };

    const elements = [
      { id: "eyebrow", type: "eyebrow", x: titleX, y: 7, w: 42, h: 4, text: languageMode === "ar" ? "القائمة" : "MENU", color: palette[2], fontSize: 2.2 + (index % 2) * 0.3, fontFamily: font, fontWeight: 700, letterSpacing: 0.2, lineHeight: 1.1, align, direction, z: 3 },
      { id: "title", type: "title", x: titleX, y: 13, w: titleW, h: 12 + (index % 2) * 2, text: restaurantName, textAr: restaurantName, textEn: restaurantName, color: palette[1], fontSize: 5.6 + index * 0.8, fontFamily: font, fontWeight: 800, letterSpacing: -0.1, lineHeight: 1, align, direction, z: 3, dataKey: "restaurant.name" },
      { id: "hero", type: "image", x: heroX, y: heroY, w: heroW, h: heroH, image: primaryItem.image, color: palette[2], shape: ["rounded", "square", "organic"][index], z: 1, animation: motion, dataKey: primaryItem.image ? `${primaryItem.key}.image_url` : undefined },
      { id: "category", type: "category", x: titleX, y: sideImage ? 50 : 56 + index * 2, w: 52, h: 6, text: languageMode === "ar" ? "الأطباق الرئيسية" : "SIGNATURE DISHES", textAr: "الأطباق الرئيسية", textEn: "SIGNATURE DISHES", color: palette[2], fontSize: 2.7 + index * 0.2, fontFamily: font, fontWeight: 700, letterSpacing: 0.12, lineHeight: 1.1, align, direction, z: 3 },
      { id: "product-name", type: "product", x: productX, y: sideImage ? 57 : 64 + index * 2, w: sideImage ? 58 : 62, h: 9, text: languageMode === "ar" ? primaryItem.ar : primaryItem.en, textAr: primaryItem.ar, textEn: primaryItem.en, color: palette[1], fontSize: 3.2 + index * 0.2, fontFamily: font, fontWeight: 700, lineHeight: 1.2, align, direction, z: 3, dataKey: `${primaryItem.key}.name` },
      { id: "copy", type: "copy", x: productX, y: sideImage ? 66 : 73 + index * 2, w: sideImage ? 70 : 72, h: 12, text: languageMode === "ar" ? primaryItem.descAr : primaryItem.descEn, textAr: primaryItem.descAr, textEn: primaryItem.descEn, color: palette[1], fontSize: 2.4 + (index % 2) * 0.3, fontFamily: font, fontWeight: 400, lineHeight: 1.4, align, direction, z: 3, dataKey: `${primaryItem.key}.description` },
      { id: "price", type: "price", x: languageMode === "ar" ? 8 : 75 - index * 3, y: sideImage ? 57 : 64 + index * 2, w: 20, h: 7, text: primaryItem["price"] || `5.90 ${currency}`, color: palette[2], fontSize: 3.1 + index * 0.2, fontFamily: font, fontWeight: 800, lineHeight: 1, align: languageMode === "ar" ? "left" : "right", direction, z: 3, dataKey: `${primaryItem.key}.price` },
    ];

    return {
      template: dark ? "midnight" : warm ? "cafe" : bold ? (["poster", "bold", "street"][index] ?? "bold") : (["editorial", "classic", "duotone"][index] ?? "editorial"),
      layout,
      hero,
      composition: {
        version: 3,
        concept: hasReference ? `Reference-aware direction ${index + 1} — ${hash % 10000}` : `Prompt-driven direction ${index + 1} — ${hash % 10000}`,
        artDirection: `QuickServe-native menu direction ${index + 1}. Layout=${layout}; typography=${font}; hero=${hero}; language=${languageMode}.`,
        languageMode,
        engine: "quickserve-ai-menu",
        brand: { logo, primary: palette[0], secondary: palette[1], accent: palette[2] },
        background: { color: palette[0], texture: texturePool[(index + offset) % texturePool.length] },
        elements,
        responsive: { mobile: "Stack imagery above content; preserve safe margins; respect RTL/LTR; never overflow horizontally.", tablet: "Use generated hierarchy with balanced columns where space permits.", desktop: "Preserve art-directed negative space and selected layout family." },
        motion: { entrance: motion, hover: index === 1 ? "subtle-scale" : "subtle-lift", scroll: index === 2 ? "gentle-reveal" : "soft-fade" },
        contentBinding: { restaurantName: "restaurants.name", menuItems: "menu_items", languageRules: "Arabic=RTL, English=LTR, bilingual=both real fields preserved" },
      },
    };
  });

  return JSON.stringify({ designs });
}

export async function callMenuDesigner(input: unknown[], apiKey?: string, allowFallback = true): Promise<string> {
  if (!apiKey?.trim()) {
    if (!allowFallback) throw new Error("Real AI Menu Studio is not configured. Add OPENAI_API_KEY on the server; the studio will not pretend a deterministic fallback is AI.");
    return localDesignFallback(input);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(OPENAI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey.trim()}` },
      body: JSON.stringify({ model: process.env["OPENAI_MENU_MODEL"] || MENU_MODEL, input, store: false, max_output_tokens: 12000, text: { format: { type: "json_object" } } }),
      signal: controller.signal,
    });

    const raw = await response.text();
    let payload: { output_text?: string; error?: { message?: string; code?: string }; output?: Array<{ content?: Array<{ type?: string; text?: string }> }> } = {};
    try { payload = JSON.parse(raw) as typeof payload; } catch { payload = {}; }

    if (!response.ok) {
      console.error("OpenAI menu designer error", response.status, payload.error?.message ?? raw.slice(0, 500));
      if (!allowFallback) throw new Error(`OpenAI Menu Studio request failed (${response.status}): ${payload.error?.message ?? "unknown API error"}`);
      if (!allowFallback) throw new Error(`OpenAI Menu Studio request failed (${response.status}): ${payload.error?.message ?? "unknown API error"}`);
      if (!allowFallback) throw new Error(`OpenAI Menu Studio request failed (${response.status}): ${payload.error?.message ?? "unknown API error"}`);
      return localDesignFallback(input);
    }

    const text = typeof payload.output_text === "string" && payload.output_text.trim()
      ? payload.output_text
      : (payload.output ?? []).flatMap((item) => item.content ?? []).filter((part) => part.type === "output_text" && typeof part.text === "string").map((part) => part.text as string).join("");

    if (!text.trim() || extractDesigns(text).length === 0) {
      if (!allowFallback) throw new Error("OpenAI returned no valid menu design JSON. The AI result was rejected instead of showing a fake deterministic design.");
      return localDesignFallback(input);
    }
    return text;
  } catch (error) {
    console.error("OpenAI menu designer request failed", error instanceof Error ? error.message : error);
    if (!allowFallback) throw error instanceof Error ? error : new Error("OpenAI Menu Studio request failed");
    return localDesignFallback(input);
  } finally {
    clearTimeout(timeout);
  }
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
