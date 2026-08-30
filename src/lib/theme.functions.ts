import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const generateSchema = z.object({
  restaurantId: z.string().uuid(),
  brief: z.string().max(2400).optional(),
  base: z.string().max(80).optional(),
  tweak: z.string().max(500).optional(),
  images: z.array(z.string().max(6_000_000).refine((v) => v.startsWith("data:image/") || v.startsWith("https://"), "Unsupported image")).max(5).optional(),
});

const SCHEMA = `Return an object {"designs":[d1,d2,d3]} and nothing else. Each design must contain exactly these keys: template (classic|midnight|street|cafe|bold|chalkboard|sketch|bifold|editorial|breakfast|bakery|poster|coffeehouse|emerald|script|retro|brush|nautical|ornate|tiles|wellness), bg, surface, text, muted, primary, primaryText, accent (6-digit hex), bodyFont and headingFont (sans|serif|rounded|mono|display|condensed|script), layout (list|grid|magazine|columns|gallery|mosaic|spotlight|rail|ticket), hero (cover|gradient|minimal|chalk|stamp|ribbon|blob|sidebar), radius (0-32 integer), showImages (boolean), imageShape (rounded|circle|square), showIcons (boolean), buttonStyle (solid|pill|soft|outline), cardStyle (flat|elevated|outline|glass), bgStyle (solid|gradient|dots|glow), density (compact|comfortable|airy), animation (none|fade|rise|pop|slide), texture (none|chalk|paper|grain), decor (none|veg|fastfood|bakery|shapes|ornate|coffee|seafood), sectionStyle (plain|boxed|rule|tab|ribbon), priceStyle (inline|right|leader), columns (1 or 2), upperTitles (boolean), scriptAccent (boolean), tagline (max 5 words).`;

const ART_DIRECTION = `You are the creative director of an elite restaurant menu studio. Build designs that look human-made, premium, realistic and print-ready rather than like a SaaS template. Study reference images deeply: composition, hierarchy, typography, image crops, spacing, texture, framing, decorative language and colour relationships. Recreate the design DNA faithfully when references are supplied, then improve it creatively without copying logos or protected text.

Use a decisive art direction. Prefer 2-3 core colours. Use strong display typography paired with a readable body font. Make one clear visual focal point. Use realistic food photography whenever showImages is true. Prefer circle, rounded, square and organic visual language through hero/decor/layout combinations. Use paper, chalk or grain texture when appropriate. Use leader prices for editorial/printed menus and right-aligned prices for modern menus. Motion must be subtle and purposeful: fade/rise for premium, pop/slide for street food. Keep everything highly legible on mobile QR menus and in Arabic RTL as well as English LTR. Avoid generic cards, default gradients and repetitive layouts. Produce three genuinely different creative directions, not recolours.`;

function extractOutputText(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const value = payload as { output_text?: unknown; output?: Array<{ content?: Array<{ text?: string; type?: string }> }> };
  if (typeof value.output_text === "string") return value.output_text;
  return (value.output ?? []).flatMap((item) => item.content ?? []).filter((item) => item.type === "output_text" && typeof item.text === "string").map((item) => item.text as string).join("\n");
}

function extractDesigns(text: string): Record<string, unknown>[] {
  const cleaned = text.replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) return [];
  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1)) as { designs?: unknown };
    return Array.isArray(parsed.designs) ? parsed.designs.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object") : [];
  } catch {
    return [];
  }
}

async function callOpenAI(messages: unknown[], apiKey: string): Promise<string> {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: process.env["OPENAI_MENU_MODEL"] || "gpt-5.6-luna", input: messages, max_output_tokens: 6000 }),
  });

  if (!response.ok) {
    const details = await response.text();
    console.error("OpenAI menu designer error", response.status, details.slice(0, 500));
    if (response.status === 401) throw new Error("OpenAI API key is invalid or not configured");
    if (response.status === 429) throw new Error("OpenAI rate limit reached. Please try again shortly");
    if (response.status === 402) throw new Error("OpenAI billing is not available for this project");
    throw new Error("AI menu generation is temporarily unavailable");
  }

  return extractOutputText(await response.json());
}

export const generateMenuTheme = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => generateSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const owner = await supabase.rpc("is_platform_owner");
    if (owner.error) throw owner.error;
    if (!owner.data) {
      const { data: rows, error } = await supabase.from("staff").select("role").eq("restaurant_id", data.restaurantId).eq("auth_user_id", userId).eq("is_active", true);
      if (error) throw error;
      const allowed = (rows ?? []).some((row) => row.role === "restaurant_admin" || row.role === "manager");
      if (!allowed) throw new Error("Forbidden");
    }

    const { data: restaurant, error: restaurantError } = await supabase.from("restaurants").select("name, description_en, description_ar, primary_color, accent_color").eq("id", data.restaurantId).single();
    if (restaurantError) throw restaurantError;

    const apiKey = process.env["OPENAI_API_KEY"];
    if (!apiKey) throw new Error("AI menu designer is not configured. Add OPENAI_API_KEY to the server environment.");

    const prompt = [
      ART_DIRECTION,
      SCHEMA,
      `Restaurant: ${restaurant.name}`,
      restaurant.description_en ? `English description: ${restaurant.description_en}` : "",
      restaurant.description_ar ? `Arabic description: ${restaurant.description_ar}` : "",
      `Existing brand colours: primary ${restaurant.primary_color}, accent ${restaurant.accent_color}`,
      data.base ? `Selected visual direction: ${data.base}` : "",
      data.brief ? `Owner creative brief: ${data.brief}` : "",
      data.tweak ? `Refinement: ${data.tweak}` : "",
      data.images?.length ? "Reference images are attached. Treat them as high-priority visual references for layout, palette, typography, texture and photographic treatment." : "",
    ].filter(Boolean).join("\n\n");

    const userContent: unknown[] = [{ type: "input_text", text: prompt }];
    for (const image of data.images ?? []) userContent.push({ type: "input_image", image_url: image, detail: "high" });

    const text = await callOpenAI([
      { role: "system", content: [{ type: "input_text", text: "You are a world-class hospitality art director. Output valid JSON only." }] },
      { role: "user", content: userContent },
    ], apiKey);

    const designs = extractDesigns(text);
    if (designs.length === 0) throw new Error("The AI returned an invalid menu design. Please try again.");
    return { variants: designs.slice(0, 3).map((design) => JSON.stringify(design)) };
  });
