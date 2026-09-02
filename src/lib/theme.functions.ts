import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ART_DIRECTION, DESIGN_SCHEMA, callMenuDesigner, extractDesigns } from "@/lib/menu-designer.server";

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
      const allowed = (rows ?? []).some((row) => row.role === "restaurant_admin" || row.role === "manager");
      if (!allowed) throw new Error("Forbidden");
    }

    const [{ data: restaurant, error: restaurantError }, { data: menuItems, error: menuError }] = await Promise.all([
      supabase
        .from("restaurants")
        .select("name, logo_url, description_en, description_ar, primary_color, secondary_color, accent_color, currency")
        .eq("id", data.restaurantId)
        .single(),
      supabase
        .from("menu_items")
        .select("name_en, name_ar, description_en, description_ar, price, image_url")
        .eq("restaurant_id", data.restaurantId)
        .limit(30),
    ]);
    if (restaurantError) throw restaurantError;
    if (menuError) throw menuError;

    // Server-only secret. Never expose it to the browser or store it in GitHub.
    // The shared designer has a native fallback, so missing credentials never blank the studio.
    const apiKey = process.env["OPENAI_API_KEY"] ?? process.env["OPENAI_API_KEYS"];

    const provider = data.provider ?? "openai";
    const isReference = Boolean(data.images?.length);
    const menuData = {
      restaurant: {
        name: restaurant.name,
        logo_url: restaurant.logo_url,
        description_en: restaurant.description_en,
        description_ar: restaurant.description_ar,
        primary_color: restaurant.primary_color,
        secondary_color: restaurant.secondary_color,
        accent_color: restaurant.accent_color,
        currency: restaurant.currency,
      },
      items: menuItems ?? [],
    };

    const prompt = [
      ART_DIRECTION,
      DESIGN_SCHEMA,
      `Target workflow: ${provider}`,
      PROVIDER_GUIDANCE[provider],
      `Restaurant: ${restaurant.name}`,
      restaurant.description_en ? `English description: ${restaurant.description_en}` : "",
      restaurant.description_ar ? `Arabic description: ${restaurant.description_ar}` : "",
      `Existing brand colours: primary ${restaurant.primary_color}, secondary ${restaurant.secondary_color}, accent ${restaurant.accent_color}`,
      data.base ? `Selected direction: ${data.base}` : "",
      data.brief ? `Creative brief: ${data.brief}` : "",
      isReference
        ? "REFERENCE RECONSTRUCTION MODE: analyze every attached image as visual DNA. Reconstruct hierarchy, grid, alignment, typography relationships, image crops, negative space, decorative language and surface treatment. Match the composition closely while returning an editable design system. Do not flatten the screenshot into one image."
        : "CREATIVE MODE: invent a fresh composition with a distinct information architecture. Do not simply recolour or lightly modify a standard template.",
      data.tweak ? `Refinement: ${data.tweak}` : "",
      "Return 3 materially different, immediately usable menu design variants. Each variant must be a complete theme object compatible with the live composition preview.",
      "If Arabic is requested, use native RTL. If English is requested, use native LTR. If the brief asks for Arabic + English, preserve both languages as first-class content.",
      `QUICKSERVE_MENU_DATA:${JSON.stringify(menuData)}`,
    ].filter(Boolean).join("\n\n");

    const userContent: unknown[] = [{ type: "input_text", text: prompt }];
    for (const image of data.images ?? []) {
      userContent.push({ type: "input_image", image_url: image, detail: "high" });
    }

    const text = await callMenuDesigner(
      [
        {
          role: "system",
          content: [{
            type: "input_text",
            text: "You are a world-class hospitality art director with 25+ years of experience in restaurant branding, menu design, typography, editorial composition and digital product systems. Output valid JSON only. Be inventive, practical and editable.",
          }],
        },
        { role: "user", content: userContent },
      ],
      apiKey,
    );

    const designs = extractDesigns(text);
    if (designs.length === 0) {
      // callMenuDesigner normally guarantees a native fallback. Keep one final retry path
      // so a malformed provider response can never leave the Menu Designer with a blank state.
      const retry = await callMenuDesigner([{ role: "user", content: [{ type: "input_text", text: prompt }] }], undefined);
      const fallbackDesigns = extractDesigns(retry);
      if (fallbackDesigns.length === 0) throw new Error("Menu generation could not produce a valid design. Please try again.");
      return { variants: fallbackDesigns.slice(0, 3).map((design) => JSON.stringify(design)), fallback: true };
    }

    return {
      variants: designs.slice(0, 3).map((design) => JSON.stringify(design)),
      fallback: !apiKey,
    };
  });
