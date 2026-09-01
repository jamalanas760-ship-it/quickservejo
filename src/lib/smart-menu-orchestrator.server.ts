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
  variationSeed: z.string().max(100).optional(),
});

const CREATIVE_SYSTEM = `You are QuickServe Creative Director, a world-class hospitality designer with 25+ years of experience across restaurant branding, editorial design, food photography, typography, packaging, digital products and premium menu systems.

ONE UNIFIED DESIGNER: Figma, Canva and Adobe are internal creative disciplines. Never expose provider choices and never let a provider become a visual template.
- Figma discipline: editable layers, grids, constraints, component logic and responsive structure.
- Canva discipline: practical editable content, page systems, safe margins and easy restaurant-team changes.
- Adobe discipline: art-directed photography, retouching, lighting, texture, compositing and polished finishing.
- Creative Director discipline: decide which combination is right for THIS prompt/reference and synthesize it into one coherent visual system.

INPUT PRIORITY:
1. Explicit user instructions.
2. Attached reference image(s), if present.
3. Restaurant brand/content data.
4. Creative variation seed.
Never replace explicit instructions with a default QuickServe style.

If references exist, perform a visual reverse-engineering pass before designing. If the user asks for exact/same/recreate, optimize for high visual fidelity. If the user asks for a new variation, deliberately change the composition strategy while preserving the requested attributes.

The generated JSON must explicitly encode the requested font family/class, typography hierarchy, layout family, exact/derived colors, spacing, imagery treatment, style details and motion whenever those are inferable from the prompt/reference. Do not hide these decisions only in prose.

Never return the same result because the prompt is similar. Use the variation seed as a creative seed. A new seed should be able to change composition, hierarchy, typography pairing, color relationship, hero treatment, image crop, decorative language and motion without breaking restaurant usability.

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

    const apiKey = process.env["OPENAI_API_KEY"];
    if (!apiKey) throw new Error("AI menu designer is not configured. Add OPENAI_API_KEY to the server environment.");

    const references = data.references ?? [];
    const seed = data.variationSeed ?? `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const prompt = [
      ART_DIRECTION,
      DESIGN_SCHEMA,
      `CREATIVE VARIATION SEED: ${seed}. Treat this as a genuine creative seed. Do not produce a memorized/default composition.`,
      `Restaurant: ${restaurant.name}`,
      `Language: ${data.language}`,
      `Currency: ${restaurant.currency ?? "JOD"}`,
      `Brand colours: primary ${restaurant.primary_color ?? "unknown"}; accent ${restaurant.accent_color ?? "unknown"}`,
      restaurant.description_en ? `English identity: ${restaurant.description_en}` : "",
      restaurant.description_ar ? `Arabic identity: ${restaurant.description_ar}` : "",
      `Menu content sample: ${JSON.stringify(items ?? []).slice(0, 16000)}`,
      data.brief ? `USER CREATIVE PROMPT (FOLLOW THIS): ${data.brief}` : "USER CREATIVE PROMPT: none — make a fresh art-directed decision from the restaurant identity.",
      data.direction ? `USER PREFERRED PERSONALITY: ${data.direction}` : "",
      references.length ? "REFERENCE IMAGE MODE: inspect every attached image. Extract and encode layout, typography, font personality, colors, spacing, imagery, crops, shapes, texture, decorative details, animation cues and visual rhythm. Reconstruct the visual system as editable elements. If the user asked for exact recreation, prioritize fidelity over stylistic invention." : "ORIGINAL MODE: invent a new visual language from the user prompt and restaurant identity.",
      references.length ? "REFERENCE FIDELITY TEST: the returned composition must visibly resemble the reference's structure and styling, not just its colors. Do not use the reference as a background image." : "",
      "OUTPUT TEST: concept 1, 2 and 3 must differ in structure when variation is requested. Do not merely recolor, swap one font, or change a border radius. Include meaningful differences in layout, typography, image treatment, hierarchy and motion.",
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
        creativeStack: { figma: "Editable layer + responsive system", canva: "Editable content/page schema", adobe: "Photography + texture + finishing direction" },
      })),
      pipeline: [
        "Understand the user's prompt/reference",
        references.length ? "Reverse-engineer visual DNA" : "Invent visual language",
        "Choose typography, layout, color and imagery from the brief",
        "Art-direct composition and motion",
        "Build editable responsive layers",
        "Humanize and run visual fidelity checks",
      ],
    };
  });
