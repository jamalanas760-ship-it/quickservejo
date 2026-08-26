import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const generateSchema = z.object({
  restaurantId: z.string().uuid(),
  brief: z.string().max(1200).optional(),
  /** Optional base template DNA the designs should build from. */
  base: z.string().max(40).optional(),
  /** Short refinement instruction, e.g. "make it darker", "more minimal". */
  tweak: z.string().max(200).optional(),
  /** Up to 3 inspiration images as data URLs (image/*) or https URLs. */
  images: z
    .array(
      z
        .string()
        .max(6_000_000)
        .refine((v) => v.startsWith("data:image/") || v.startsWith("https://"), {
          message: "Unsupported image",
        }),
    )
    .max(3)
    .optional(),
});

const SCHEMA =
  "template (classic|midnight|street|cafe|bold|chalkboard|sketch|bifold|editorial|breakfast|bakery|" +
  "poster|coffeehouse|emerald|script|retro|brush|nautical|ornate|tiles|wellness), " +
  "bg, surface, text, muted, primary, primaryText, accent (all 6-digit hex like #1a1a1a), " +
  "bodyFont and headingFont (sans|serif|rounded|mono|display|condensed|script), " +
  "layout (list|grid|magazine|columns), hero (cover|gradient|minimal|chalk|stamp|ribbon|blob|sidebar), " +
  "radius (0-32 integer), showImages (boolean), imageShape (rounded|circle|square), showIcons (boolean), " +
  "buttonStyle (solid|pill|soft|outline), cardStyle (flat|elevated|outline|glass), " +
  "bgStyle (solid|gradient|dots|glow), density (compact|comfortable|airy), " +
  "animation (none|fade|rise|pop|slide), texture (none|chalk|paper|grain), " +
  "decor (none|veg|fastfood|bakery|shapes|ornate|coffee|seafood), sectionStyle (plain|boxed|rule|tab|ribbon), " +
  "priceStyle (inline|right|leader), columns (1 or 2), upperTitles (boolean), " +
  "scriptAccent (boolean), tagline (short string, max 5 words, matching the brand language)";

const CRAFT =
  "Craft bar: 25+ years of art direction across hospitality branding, editorial design and motion. " +
  "Design magazine-quality menus, never generic templates. Theme DNA to draw from and blend: " +
  "dark chalkboard (chalk texture, boxed sections, veg line-art, orange/white on charcoal), " +
  "vintage sketch (kraft paper texture, condensed display type, fastfood line-art, mustard/brown), " +
  "dark bi-fold (black, two printed columns, leader-dot prices, circular photos), " +
  "clean minimal editorial (cream, oversized display wordmark, ribbon accent, hairline rules, huge whitespace), " +
  "bright modern breakfast (bold colour blob background, floating white card, full-bleed photo, script subhead), " +
  "dark bakery editorial (vertical sidebar wordmark, bordered accent boxes, bakery line-art, script tagline). " +
  "Rules: commit to ONE decisive direction; 2-3 colours max with one dominant; pair a strong display heading " +
  "font with a clean body font; keep WCAG AA contrast for text/surface and primary/primaryText; make " +
  "typography, radius, card style, texture, decoration, section framing and density tell the same story; " +
  "guarantee a strong hero, clearly separated sections, one visual focal point, consistent price alignment " +
  "and generous breathing room; choose motion that matches the energy (calm fades, street food pops/slides). " +
  "Photo-forward restaurants use showImages true with circle or full-width crops; illustration-forward ones " +
  "lean on texture plus decor line-art. Everything must read beautifully on a phone.";

/**
 * Generates three distinct professional menu design variations from the
 * restaurant's identity, an optional brief, tweak and inspiration images.
 * Returns raw JSON strings that the client normalizes through `parseMenuTheme`,
 * so a malformed model answer can never break the menu.
 */
export const generateMenuTheme = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => generateSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const owner = await supabase.rpc("is_platform_owner");
    if (owner.error) throw owner.error;
    if (!owner.data) {
      const { data: rows, error } = await supabase
        .from("staff")
        .select("role")
        .eq("restaurant_id", data.restaurantId)
        .eq("auth_user_id", userId)
        .eq("is_active", true);
      if (error) throw error;
      const allowed = (rows ?? []).some(
        (r) => r.role === "restaurant_admin" || r.role === "manager",
      );
      if (!allowed) throw new Error("Forbidden");
    }

    const { data: restaurant, error: restError } = await supabase
      .from("restaurants")
      .select("name, description_en, description_ar, primary_color, accent_color")
      .eq("id", data.restaurantId)
      .single();
    if (restError) throw restError;

    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("AI is not configured");

    const prompt = [
      `Restaurant name: ${restaurant.name}`,
      restaurant.description_en ? `Description: ${restaurant.description_en}` : "",
      restaurant.description_ar ? `Arabic description: ${restaurant.description_ar}` : "",
      `Brand colours: primary ${restaurant.primary_color}, accent ${restaurant.accent_color}`,
      data.brief ? `Owner brief: ${data.brief}` : "",
      data.base ? `Preferred base template DNA: ${data.base}` : "",
      data.tweak ? `Refinement requested: ${data.tweak}` : "",
      data.images?.length
        ? "Inspiration images are attached — reproduce their palette, typography feel, texture, decoration and layout structure faithfully, then push it further."
        : "",
      "Return three clearly different directions, not three recolours of one idea.",
    ]
      .filter(Boolean)
      .join("\n");

    const userContent: unknown[] = [{ type: "text", text: prompt }];
    for (const url of data.images ?? []) {
      userContent.push({ type: "image_url", image_url: { url } });
    }

    const system =
      "You are the lead designer of a mobile QR restaurant menu. " +
      CRAFT +
      ' Reply ONLY with JSON of the form {"designs":[d1,d2,d3]} where each design object uses exactly these keys: ' +
      SCHEMA +
      ". No prose, no markdown fences.";

    async function content(model: string, messages: unknown[]): Promise<string | null> {
      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model, messages }),
      });
      if (!response.ok) {
        if (response.status === 429) throw new Error("AI rate limit reached, try again shortly");
        if (response.status === 402) throw new Error("AI credits exhausted for this workspace");
        console.error("AI gateway error", model, response.status, await response.text());
        return null;
      }
      const payload = (await response.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      return payload.choices?.[0]?.message?.content ?? null;
    }

    function extractDesigns(text: string): Record<string, unknown>[] {
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) return [];
      try {
        const parsed = JSON.parse(match[0]) as {
          designs?: unknown;
        };
        const list = Array.isArray(parsed.designs) ? parsed.designs : [];
        return list.filter((d): d is Record<string, unknown> => Boolean(d) && typeof d === "object");
      } catch {
        return [];
      }
    }

    const messages = [
      { role: "system", content: system },
      { role: "user", content: userContent },
    ];

    let designs = extractDesigns((await content("google/gemini-3.1-pro-preview", messages)) ?? "");
    if (designs.length === 0) {
      designs = extractDesigns((await content("google/gemini-3.7-flash", messages)) ?? "");
    }
    if (designs.length === 0) throw new Error("Theme generation is unavailable right now");

    return { variants: designs.slice(0, 3).map((d) => JSON.stringify(d)) };
  });
