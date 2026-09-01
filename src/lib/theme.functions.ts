import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ART_DIRECTION, DESIGN_SCHEMA, MenuDesignerCreditsError, callMenuDesigner, extractDesigns } from "@/lib/menu-designer.server";
import { TEMPLATES, type MenuTheme } from "@/lib/menu-theme";

const generateSchema = z.object({
  restaurantId: z.string().uuid(),
  brief: z.string().max(6000).optional(),
  base: z.string().max(120).optional(),
  tweak: z.string().max(1200).optional(),
  provider: z.enum(["openai", "gemini", "claude", "adobe", "figma", "canva"]).optional(),
  images: z.array(z.string().max(6_000_000).refine((v) => v.startsWith("data:image/") || v.startsWith("https://"), "Unsupported image")).max(5).optional(),
});

const PROVIDER_GUIDANCE: Record<string, string> = {
  openai: "Use a structured hospitality art-direction workflow: hierarchy first, composition second, styling third, responsive behavior last. Produce meaningfully different concepts, not recolours.",
  gemini: "Treat attached images as visual evidence. Infer composition, typography relationships, material, crop logic, spacing and visual rhythm before synthesizing.",
  claude: "Prioritize editorial reasoning, accessibility, hierarchy and human-made character. Resolve ambiguity instead of producing generic UI.",
  adobe: "Prepare explicit photography, texture, palette, type, crop and print/digital art direction that can continue in Adobe tools.",
  figma: "Think in editable frames, layers, reusable components, auto-layout groups, constraints and responsive variants.",
  canva: "Think in editable pages and elements with clear page structure, safe margins, visual hierarchy and practical image placement.",
};

type FallbackTheme = MenuTheme & { composition: Record<string, unknown> };

function createFallbackVariants(restaurant: { name: string; primary_color: string | null; accent_color: string | null }): FallbackTheme[] {
  const palettes = [
    { key: "editorial" as const, concept: "Editorial restaurant menu", primary: restaurant.primary_color ?? TEMPLATES.editorial.theme.primary, accent: restaurant.accent_color ?? TEMPLATES.editorial.theme.accent },
    { key: "cafe" as const, concept: "Warm contemporary menu", primary: restaurant.primary_color ?? TEMPLATES.cafe.theme.primary, accent: restaurant.accent_color ?? TEMPLATES.cafe.theme.accent },
    { key: "street" as const, concept: "Bold modern food menu", primary: restaurant.primary_color ?? TEMPLATES.street.theme.primary, accent: restaurant.accent_color ?? TEMPLATES.street.theme.accent },
  ];

  return palettes.map(({ key, concept, primary, accent }, index) => {
    const base = TEMPLATES[key].theme;
    return {
      ...base,
      primary,
      accent,
      composition: {
        version: 2,
        concept: `${restaurant.name} — ${concept}`,
        artDirection: "Local editable fallback used because the AI gateway has no remaining credits. Replace with an AI-generated direction when credits are restored.",
        background: { color: base.bg, texture: base.texture },
        elements: [
          { id: `fallback-title-${index}`, type: "title", x: 8, y: 8, w: 84, h: 12, text: restaurant.name, fontSize: 36, fontFamily: base.headingFont, fontWeight: 700, color: base.text, z: 3 },
          { id: `fallback-category-${index}`, type: "category", x: 8, y: 25, w: 38, h: 7, text: "SIGNATURE", fontSize: 12, fontWeight: 700, color: primary, z: 3 },
          { id: `fallback-image-${index}`, type: "image", x: 52, y: 23, w: 40, h: 30, color: accent, shape: base.imageShape, z: 2 },
          { id: `fallback-copy-${index}`, type: "copy", x: 8, y: 36, w: 40, h: 16, text: "Fresh ingredients · Crafted with care", fontSize: 14, color: base.muted, z: 3 },
          { id: `fallback-price-${index}`, type: "price", x: 8, y: 57, w: 84, h: 8, text: "8.50 JOD", fontSize: 18, fontWeight: 700, color: primary, align: "right", z: 3 },
          { id: `fallback-rule-${index}`, type: "shape", x: 8, y: 68, w: 84, h: 1, color: primary, z: 1 },
        ],
        responsive: { mobile: "Single-column stack with preserved hierarchy", tablet: "Balanced two-zone composition", desktop: "Editorial asymmetric composition" },
        motion: { entrance: base.animation, hover: "none", scroll: "none" },
      },
    };
  });
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

    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("AI menu designer is not configured.");

    const provider = data.provider ?? "openai";
    const isReference = Boolean(data.images?.length);
    const prompt = [
      ART_DIRECTION,
      DESIGN_SCHEMA,
      `Target workflow: ${provider}`,
      PROVIDER_GUIDANCE[provider],
      `Restaurant: ${restaurant.name}`,
      restaurant.description_en ? `English description: ${restaurant.description_en}` : "",
      restaurant.description_ar ? `Arabic description: ${restaurant.description_ar}` : "",
      `Existing brand colours: primary ${restaurant.primary_color}, accent ${restaurant.accent_color}`,
      data.base ? `Selected direction: ${data.base}` : "",
      data.brief ? `Creative brief: ${data.brief}` : "",
      isReference ? "REFERENCE RECONSTRUCTION MODE: analyze every attached image as visual DNA. Reconstruct hierarchy, grid, alignment, typography relationships, image crops, negative space, decorative language and surface treatment. Match the composition closely while returning an editable design system. Do not flatten the screenshot into one image." : "CREATIVE MODE: invent a fresh composition with a distinct information architecture. Do not simply recolour or lightly modify a standard template.",
      data.tweak ? `Refinement: ${data.tweak}` : "",
      "Return 3 materially different, immediately usable menu design variants. Each variant must be a complete theme object compatible with the live composition preview.",
    ].filter(Boolean).join("\n\n");

    const userContent: unknown[] = [{ type: "input_text", text: prompt }];
    for (const image of data.images ?? []) userContent.push({ type: "input_image", image_url: image, detail: "high" });

    try {
      const text = await callMenuDesigner(
        [
          { role: "system", content: [{ type: "input_text", text: "You are a world-class hospitality art director with 25+ years of experience in restaurant branding, menu design, typography, editorial composition and digital product systems. Output valid JSON only. Be inventive, but practical and editable." }] },
          { role: "user", content: userContent },
        ],
        apiKey,
      );

      const designs = extractDesigns(text);
      if (designs.length === 0) throw new Error("The AI returned an invalid menu design. Please try again.");
      return { variants: designs.slice(0, 3).map((design) => JSON.stringify(design)), fallback: false };
    } catch (error) {
      if (!(error instanceof MenuDesignerCreditsError)) throw error;
      console.warn("AI menu designer credits exhausted; serving local editable fallback designs.");
      return {
        variants: createFallbackVariants(restaurant).map((theme) => JSON.stringify(theme)),
        fallback: true,
        message: "AI credits are exhausted. Editable local menu directions were loaded instead.",
      };
    }
  });
