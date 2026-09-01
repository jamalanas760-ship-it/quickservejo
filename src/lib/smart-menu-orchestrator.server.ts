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

REFERENCE-FIRST WORKFLOW:
When an image is attached, do a deliberate visual reverse-engineering pass before generating anything. Inspect the image itself and infer: canvas ratio, visual anchors, bounding-box relationships, grid, margins, alignment, negative space, typography class/weight/scale, line rhythm, color roles, gradients, image crops, shapes, borders, shadows, texture, decorative motifs, section treatment, price treatment and motion cues. Encode those observations in referenceAnalysis and editable composition elements. Never use the screenshot as a background and never reduce it to a color palette.

PROMPT-FIRST WORKFLOW:
Treat every phrase in the user's prompt as a design requirement. Explicitly honor font personality, typography hierarchy, layout family, grid, columns, alignment, spacing, colors, imagery, crop, texture, shapes, decorative language, animation, interaction, density and RTL/LTR behavior. If the user asks for one change, preserve unrelated choices. If the user asks for a new design, change the composition strategy, not just colors.

THREE-CONCEPT ART-DIRECTION:
Return three genuinely different concepts when the request is for options:
CONCEPT 1 = highest-fidelity answer to the current prompt/reference; preserve the most important visual relationships.
CONCEPT 2 = intelligent reinterpretation; preserve the user's core intent but change composition, hierarchy and visual rhythm.
CONCEPT 3 = bold art-directed alternative; push layout, typography, imagery and decorative language while remaining usable for a restaurant.
If the user explicitly requests an exact recreation, Concept 1 must prioritize fidelity strongly and Concepts 2/3 should remain recognizably derived from the reference rather than becoming unrelated templates.

ANTI-REPETITION:
Never return a memorized/default QuickServe composition. The creative seed is mandatory. Use it to vary meaningful decisions: layout family, visual anchor, typography pairing, image placement/crop, spacing scale, color relationship, shape language, texture, decoration, motion and density. Two materially different prompts or reference images must not collapse into the same composition unless their visual requirements genuinely match.

REALISTIC HUMAN DESIGN BAR:
Make the result look designed by an excellent human designer, not generated from a SaaS template. Avoid repetitive rounded cards, generic centered headers, excessive pills, symmetrical grids and predictable logo-at-top layouts unless the prompt/reference asks for them. Use editorial asymmetry, intentional negative space, varied scale, believable typographic contrast, art-directed food imagery, subtle material texture and controlled imperfections when appropriate. Food imagery should feel photographed and commercially art-directed. Typography must have a reason. Arabic must have correct RTL hierarchy and natural spacing. Animation must be intentional and subtle.

OUTPUT CONTRACT:
The generated JSON must explicitly encode font family/class, typography hierarchy, layout family, colors, spacing, imagery treatment, style details, responsive behavior and motion whenever inferable. Do not hide decisions only in prose. Every meaningful visual part must be editable. Return JSON only.`;

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

    const apiKey = process.env["OPENAI_API_KEY"] ?? process.env["OPENAI_API_KEYS"];
    const references = data.references ?? [];
    const seed = data.variationSeed ?? `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const prompt = [
      ART_DIRECTION,
      DESIGN_SCHEMA,
      `CREATIVE VARIATION SEED: ${seed}. This seed is unique to the user's current prompt/reference set. Use it to make meaningful creative decisions, not cosmetic random changes.`,
      `Restaurant: ${restaurant.name}`,
      `Language: ${data.language}`,
      `Currency: ${restaurant.currency ?? "JOD"}`,
      `Brand colours: primary ${restaurant.primary_color ?? "unknown"}; accent ${restaurant.accent_color ?? "unknown"}`,
      restaurant.description_en ? `English identity: ${restaurant.description_en}` : "",
      restaurant.description_ar ? `Arabic identity: ${restaurant.description_ar}` : "",
      `Menu content sample: ${JSON.stringify(items ?? []).slice(0, 16000)}`,
      data.brief ? `USER CREATIVE PROMPT — FOLLOW LITERALLY: ${data.brief}` : "USER CREATIVE PROMPT: none — make a fresh art-directed decision from the restaurant identity.",
      data.direction ? `USER PREFERRED PERSONALITY: ${data.direction}` : "",
      references.length ? "REFERENCE IMAGE MODE: inspect every attached image at high detail. Extract the actual visual structure and rebuild it with editable elements. The reference is authoritative for layout/style when the user asks to match it." : "ORIGINAL MODE: invent a new visual language from the user's prompt and restaurant identity.",
      references.length ? "REFERENCE FIDELITY CHECK: Concept 1 must resemble the reference in structure, proportions, hierarchy, typography personality, spacing, image treatment, color roles and decorative details — not merely its colors." : "",
      "CONCEPT DIFFERENTIATION CHECK: Concepts 1/2/3 must have materially different composition strategies. Do not merely recolor, swap one font or change a border radius. Change visual anchors, layout, hierarchy, typography pairing, image treatment and rhythm according to the concept roles.",
      "FINAL QA: reject any concept that looks like a generic QuickServe template or ignores an explicit user instruction. Return only the three strongest valid editable designs.",
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
        "Parse prompt into explicit visual requirements",
        references.length ? "Reverse-engineer the attached reference image(s)" : "Invent a new visual language",
        "Generate three differentiated art directions",
        "Choose typography, layout, color, imagery and motion from the actual brief/reference",
        "Build editable responsive layers",
        "Run human-design, fidelity and anti-repetition QA",
      ],
    };
  });
