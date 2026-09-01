import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ART_DIRECTION, DESIGN_SCHEMA, callMenuDesigner, extractDesigns } from "@/lib/menu-designer.server";

const inputSchema = z.object({
  restaurantId: z.string().uuid(),
  brief: z.string().max(6000).optional(),
  references: z.array(z.string().max(6_000_000)).max(5).optional(),
  language: z.enum(["en", "ar"]).default("en"),
  direction: z.string().max(500).optional(),
});

const CREATIVE_SYSTEM = `You are QuickServe Creative Director, a world-class hospitality designer with 25+ years of experience across restaurant branding, editorial design, food photography, typography, packaging, digital products and premium menu systems.

You are not a template recoloring engine. Your job is to create a believable, human-designed menu with a strong point of view.

Use a coordinated creative stack internally:
1. FIGMA MINDSET — think in real editable frames, grids, auto-layout, constraints, components and responsive rules.
2. CANVA MINDSET — think in practical editable pages, safe margins, reusable content fields and fast restaurant-team editing.
3. ADOBE MINDSET — art-direct photography, texture, retouching, image treatment, visual depth and polished finishing.
4. AI CREATIVE DIRECTOR — synthesize the three disciplines into one coherent design. Never expose them as separate choices to the user.

Humanization rules:
- Avoid generic SaaS/template aesthetics.
- Avoid predictable centered cards and repeated rounded rectangles unless the concept genuinely needs them.
- Use asymmetry, intentional negative space, editorial rhythm, imperfect-but-controlled details and varied scale when appropriate.
- Make typography feel selected by a designer, not randomly assigned.
- Treat food photography as art direction: crop, light, angle, background, depth and negative space must serve the composition.
- Preserve brand authenticity and cuisine context.
- For Arabic, use proper RTL hierarchy and typography; for bilingual menus, create a deliberate bilingual composition instead of simply duplicating text.
- Design for real restaurants: prices and item names must remain readable, scannable and operationally editable.
- Every generated direction must have a different composition strategy, not merely a different color palette.

When a reference image is provided, analyze its visual DNA first: composition, grid, hierarchy, proportions, typography relationships, crop logic, spacing, materials, decorative language, contrast and rhythm. Reconstruct the underlying editable system, not a flattened screenshot. Then create an original result that is faithful to the requested reference mode while remaining editable.

Return JSON only.`;

export const orchestrateSmartMenuDesign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => inputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const owner = await supabase.rpc("is_platform_owner");
    if (owner.error) throw owner.error;
    if (!owner.data) {
      const { data: rows, error } = await supabase.from("staff").select("role").eq("restaurant_id", data.restaurantId).eq("auth_user_id", userId).eq("is_active", true);
      if (error) throw error;
      if (!(rows ?? []).some((row) => row.role === "restaurant_admin" || row.role === "manager")) throw new Error("Forbidden");
    }

    const [{ data: restaurant, error: restaurantError }, { data: items, error: itemsError }] = await Promise.all([
      supabase.from("restaurants").select("name,description_en,description_ar,primary_color,accent_color,currency,logo_url,cover_image_url").eq("id", data.restaurantId).single(),
      supabase.from("menu_items").select("name_en,name_ar,description_en,description_ar,price,image_url").eq("restaurant_id", data.restaurantId).eq("is_available", true).order("display_order", { ascending: true }).limit(30),
    ]);
    if (restaurantError) throw restaurantError;
    if (itemsError) throw itemsError;

    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("AI menu designer is not configured.");

    const references = data.references ?? [];
    const prompt = [
      ART_DIRECTION,
      DESIGN_SCHEMA,
      "UNIFIED CREATIVE STACK: Figma + Canva + Adobe are internal creative disciplines, not user-selectable providers. Synthesize their strongest capabilities into one design system.",
      `Restaurant: ${restaurant.name}`,
      `Currency: ${restaurant.currency ?? "JOD"}`,
      `Brand colours: primary ${restaurant.primary_color ?? "unknown"}; accent ${restaurant.accent_color ?? "unknown"}`,
      restaurant.description_en ? `English identity: ${restaurant.description_en}` : "",
      restaurant.description_ar ? `Arabic identity: ${restaurant.description_ar}` : "",
      `Menu content sample: ${JSON.stringify(items ?? []).slice(0, 16000)}`,
      data.brief ? `Creative brief: ${data.brief}` : "No explicit brief: make a strong contemporary restaurant-art-direction decision.",
      data.direction ? `Preferred creative direction: ${data.direction}` : "",
      references.length ? "REFERENCE MODE: use the attached images as visual DNA. First infer their design system, then reconstruct it as editable layers and improve it without losing the defining character." : "ORIGINAL MODE: invent a fresh visual language and information architecture.",
      "Generate exactly 3 radically different concepts. Each must be practical for a live QR menu and must include editable structure, image-art-direction guidance, typography system, responsive behavior and a humanization rationale.",
    ].filter(Boolean).join("\n\n");

    const content: unknown[] = [{ type: "input_text", text: prompt }];
    for (const image of references) content.push({ type: "input_image", image_url: image, detail: "high" });

    const text = await callMenuDesigner([
      { role: "system", content: [{ type: "input_text", text: CREATIVE_SYSTEM }] },
      { role: "user", content },
    ], apiKey);

    const designs = extractDesigns(text).slice(0, 3);
    if (!designs.length) throw new Error("The creative director returned no valid designs.");

    return {
      concepts: designs.map((design, index) => ({
        id: `concept-${index + 1}`,
        theme: JSON.stringify(design),
        creativeStack: {
          figma: "Editable layer + responsive system",
          canva: "Editable content/page schema",
          adobe: "Photography + texture + finishing direction",
        },
      })),
      pipeline: [
        "Understand restaurant identity",
        references.length ? "Analyze visual DNA" : "Establish original visual language",
        "Art-direct food imagery",
        "Compose editorial hierarchy",
        "Build editable responsive system",
        "Humanize and quality-check",
      ],
    };
  });
