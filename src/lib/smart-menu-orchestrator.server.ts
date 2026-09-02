import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ART_DIRECTION, DESIGN_SCHEMA, callMenuDesigner, extractDesigns } from "@/lib/menu-designer.server";
import { runMenuQualityGate } from "@/lib/menu-quality-gate.server";

const inputSchema = z.object({
  restaurantId: z.string().uuid(),
  brief: z.string().max(6000).optional(),
  references: z.array(z.string().max(6_000_000)).max(5).optional(),
  language: z.enum(["en", "ar"]).default("en"),
  direction: z.string().max(500).optional(),
  variationSeed: z.string().max(100).optional(),
});

const ANALYSIS_SCHEMA = `Return JSON only in this shape: {"referenceAnalysis":{"canvas":{"ratio":"","orientation":"","safeArea":""},"layout":{"family":"","grid":"","anchors":"","alignment":"","spacing":"","elementBounds":[{"name":"","x":0,"y":0,"w":0,"h":0}]},"typography":{"primaryClass":"","secondaryClass":"","weights":"","scale":"","tracking":"","lineHeight":"","alignment":"","rtl":""},"color":{"background":"","primary":"","secondary":"","accent":"","roles":"","contrast":""},"imagery":{"subjects":"","placement":"","crop":"","ratio":"","lighting":"","treatment":""},"shapeAndSurface":{"shapes":"","radii":"","borders":"","shadows":"","texture":"","decorativeMotifs":""},"contentRhythm":{"density":"","sectionOrder":"","priceTreatment":"","negativeSpace":""},"motion":{"entrance":"","hover":"","scroll":""},"visualDNA":"","fidelityPriorities":[""]}}`;

const ANALYSIS_SYSTEM = `You are a forensic visual design analyst for QuickServe. You are not designing yet. Your only job is to inspect the user's prompt and every attached reference image and create a detailed, implementation-ready visual specification.

Treat the reference image as evidence. Analyze the actual image rather than guessing from a generic restaurant-menu template. Measure relationships and proportions conceptually: canvas ratio, margins, grid, element bounding boxes, alignment, typography scale and personality, color roles, image crops, whitespace, shapes, borders, shadows, texture, decorative motifs and motion cues. Identify what is visually dominant and what must remain unchanged for an exact recreation.

Treat the user's written prompt as an explicit requirement list. Resolve conflicts by prioritizing explicit user instructions, then the reference image, then restaurant identity. Never invent a house style.

If the user requests exact/same/recreate/copy, identify the highest-fidelity constraints and state them as fidelity priorities. If a property cannot be known exactly from an image, describe the closest inferable class/range rather than pretending certainty.

The output will be handed to a second creative-design stage. Be concrete, structured and exhaustive. Do not generate a design or generic advice. Return JSON only.`;

const DESIGN_SYSTEM = `You are QuickServe Creative Director, a world-class hospitality designer with 25+ years of experience across restaurant branding, editorial design, food photography, typography, packaging, digital products and premium menu systems.

You receive TWO sources: (1) a forensic visual analysis and (2) the original user prompt/reference images. The analysis is a design blueprint, not optional commentary. Build from it.

ONE UNIFIED DESIGNER: Figma, Canva and Adobe are internal creative disciplines. Never expose provider choices and never let a provider become a visual template. Figma contributes editable layers/grids/constraints; Canva contributes practical editable content/page systems; Adobe contributes art direction, imagery, lighting, texture and finishing. Synthesize them into one coherent design.

NATIVE AI MENU GENERATOR CAPABILITY: QuickServe should provide the useful capabilities users expect from modern AI restaurant-menu generators: guided style direction, brand-aware layouts, food-image composition, typography hierarchy, multiple design directions, editable content, responsive output and print/digital awareness. This is native QuickServe functionality; never require an external generator, external credits, or provider-specific template.

BILINGUAL CONTENT CONTRACT:
- The primary presentation language is supplied in the runtime context below.
- Regardless of presentation language, preserve real Arabic and English menu fields whenever they exist.
- Use textAr/textEn on editable elements when both values are available.
- Arabic must use true RTL hierarchy and Arabic-compatible typography.
- English must use true LTR hierarchy and English typography.
- If the user asks for Arabic + English, bilingual, ثنائي اللغة, or both languages, design both languages as first-class content in the same menu.
- Never replace an existing Arabic or English database value with a generic placeholder or fabricated translation.
- Prices must remain exactly as supplied by the restaurant.

MASTER WORKFLOW:
1. Reconcile the user's prompt with the forensic reference analysis.
2. Convert the visual specification into editable coordinates, typography, colors, imagery and relationships.
3. Create three concepts.
4. Concept 1 = highest-fidelity reconstruction. If exact recreation was requested, this must be structurally and visually closest to the reference.
5. Concept 2 = refined professional version: preserve the reference DNA and user intent while improving hierarchy/usability where appropriate.
6. Concept 3 = creative art-directed alternative: preserve the core requirements but introduce a materially different composition.
7. Every meaningful visual property must be encoded in editable composition data, not hidden in prose.

ANTI-TEMPLATE RULE: never substitute a generic QuickServe template for the actual reference. Do not merely change colors, one font or border radius. Layout, hierarchy, typography pairing, image treatment, spacing, shape language and decorative details must respond to the current inputs.

EDITABILITY RULE: every important visible element must be represented as an editable element with coordinates, dimensions, typography, color, imagery treatment and z-order where possible. Preserve real restaurant menu content while following the analyzed visual hierarchy.

QUALITY GATE BEFORE RETURNING:
- Compare each concept against the analysis field-by-field.
- Verify explicit prompt requirements are present.
- Verify Concept 1 is the closest match.
- Verify Concept 2 is a meaningful refinement.
- Verify Concept 3 is meaningfully creative but still faithful to the core brief.
- Reject generic repeated layouts.
- Return only valid JSON matching DESIGN_SCHEMA.`;

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
    const baseContext = [
      `Restaurant: ${restaurant.name}`,
      `Primary presentation language: ${data.language}`,
      "Available content languages: Arabic + English. Preserve both real language fields whenever the database provides them.",
      "Bilingual design request: if the user asks for Arabic + English, bilingual, ثنائي اللغة, or both languages, render both languages as first-class content in the same design.",
      "Localization contract: Arabic=RTL; English=LTR; prices/numbers remain exactly as stored.",
      `Currency: ${restaurant.currency ?? "JOD"}`,
      `Brand colours: primary ${restaurant.primary_color ?? "unknown"}; accent ${restaurant.accent_color ?? "unknown"}`,
      restaurant.description_en ? `English identity: ${restaurant.description_en}` : "",
      restaurant.description_ar ? `Arabic identity: ${restaurant.description_ar}` : "",
      `Menu content sample: ${JSON.stringify(items ?? []).slice(0, 16000)}`,
      data.brief ? `USER CREATIVE PROMPT: ${data.brief}` : "USER CREATIVE PROMPT: none",
      data.direction ? `USER PREFERRED PERSONALITY: ${data.direction}` : "",
      `CREATIVE VARIATION SEED: ${seed}`,
    ].filter(Boolean).join("\n\n");

    let visualAnalysis = "No reference image was supplied. Build the visual specification from the user's prompt and restaurant identity.";
    if (references.length && apiKey) {
      const analysisContent: unknown[] = [{ type: "input_text", text: `${ANALYSIS_SCHEMA}\n\n${baseContext}\n\nAnalyze every attached reference image. Do not design yet.` }];
      for (const image of references) analysisContent.push({ type: "input_image", image_url: image, detail: "high" });
      const analysisText = await callMenuDesigner([
        { role: "system", content: [{ type: "input_text", text: ANALYSIS_SYSTEM }] },
        { role: "user", content: analysisContent },
      ], apiKey);
      visualAnalysis = analysisText;
    }

    const designPrompt = [
      DESIGN_SYSTEM,
      ART_DIRECTION,
      DESIGN_SCHEMA,
      baseContext,
      `FORENSIC VISUAL ANALYSIS — treat this as the implementation blueprint:\n${visualAnalysis}`,
      references.length ? "REFERENCE VERIFICATION: inspect the attached image(s) again and compare them against the forensic analysis before returning the concepts. Do not blindly trust an incorrect inference." : "ORIGINAL DESIGN MODE: there is no reference image; create from the prompt and restaurant identity.",
      "CONCEPT 1 REQUIREMENT: maximum fidelity. Match structure, proportions, hierarchy, typography personality, color roles, image treatment, spacing, shapes, texture and decorative details from the reference wherever inferable.",
      "CONCEPT 2 REQUIREMENT: refined fidelity. Keep the reference's visual DNA and explicit prompt requirements while improving professional hierarchy and usability without becoming a generic template.",
      "CONCEPT 3 REQUIREMENT: bold but relevant. Preserve the core brief/reference DNA while changing the composition strategy, visual rhythm and art direction materially.",
      "FINAL MASTER QA: perform an internal field-by-field comparison before output. Every explicit user request must be represented. Every important visual part must be editable. Return exactly three strongest designs as JSON only.",
    ].join("\n\n");

    const content: unknown[] = [{ type: "input_text", text: designPrompt }];
    for (const image of references) content.push({ type: "input_image", image_url: image, detail: "high" });

    const text = await callMenuDesigner([
      { role: "system", content: [{ type: "input_text", text: DESIGN_SYSTEM }] },
      { role: "user", content },
    ], apiKey);

    const initialDesigns = extractDesigns(text).slice(0, 3);
    if (!initialDesigns.length) throw new Error("The creative director returned no valid designs.");

    const exactReference = /\b(exact|same|recreate|copy|identical|match reference)\b/i.test(data.brief ?? "") && references.length > 0;
    const quality = await runMenuQualityGate({
      designs: initialDesigns,
      brief: data.brief ?? "",
      visualAnalysis,
      exactReference,
      apiKey,
    });
    const designs = quality.designs.slice(0, 3);

    return {
      concepts: designs.map((design, index) => ({
        id: `concept-${index + 1}`,
        theme: JSON.stringify(design),
        selectedByQualityGate: index === quality.winner,
        qualityScore: quality.scores.find((score) => score.concept === index + 1)?.score ?? null,
        creativeStack: { figma: "Editable layer + responsive system", canva: "Editable content/page schema", adobe: "Photography + texture + finishing direction" },
      })),
      analysis: visualAnalysis,
      qualityGate: { winner: quality.winner + 1, scores: quality.scores, criticalFixes: quality.criticalFixes },
      pipeline: [
        "Analyze the user's prompt and reference image(s)",
        "Build a forensic visual specification",
        "Cross-check the specification against the original pixels",
        "Generate three differentiated art directions",
        "Score concepts with an independent senior design critic",
        "Automatically refine the winning concept against concrete issues",
        "Let the user choose one concept before editing/saving",
      ],
    };
  });
