import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const generateSchema = z.object({
  restaurantId: z.string().uuid(),
  brief: z.string().max(1200).optional(),
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

/**
 * Generates a diner-menu theme from the restaurant's own identity using the
 * Lovable AI gateway. Returns raw JSON that the client normalizes through
 * `parseMenuTheme`, so a malformed model answer can never break the menu.
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
      data.images?.length
        ? "Inspiration images are attached — extract their palette, typography feel, spacing and mood."
        : "",
    ]
      .filter(Boolean)
      .join("\n");

    const userContent: unknown[] = [{ type: "text", text: prompt }];
    for (const url of data.images ?? []) {
      userContent.push({ type: "image_url", image_url: { url } });
    }

    const SCHEMA =
      "template (classic|midnight|street|cafe|bold), bg, surface, text, muted, primary, primaryText, accent " +
      "(all 6-digit hex like #1a1a1a), bodyFont and headingFont (sans|serif|rounded|mono|display), " +
      "layout (list|grid|magazine), hero (cover|gradient|minimal), radius (0-32 integer), " +
      "showImages (boolean), imageShape (rounded|circle|square), showIcons (boolean), " +
      "buttonStyle (solid|pill|soft|outline), cardStyle (flat|elevated|outline|glass), " +
      "bgStyle (solid|gradient|dots|glow), density (compact|comfortable|airy), " +
      "animation (none|fade|rise|pop|slide)";

    const CRAFT =
      "Craft bar: 25+ years of art direction across hospitality branding, editorial design and motion. " +
      "Treat the menu as a brand surface, not a form: commit to one decisive direction, " +
      "derive the palette from the cuisine and mood (never generic purple-on-white, never muddy greys), " +
      "keep WCAG AA contrast between text/surface and primary/primaryText, pair typography with radius, " +
      "card style, background texture and density so they tell the same story, and choose an entrance " +
      "animation that matches the energy (calm rooms fade, energetic street food pops or slides). " +
      "Dark themes need luminous accents; light themes need warmth and depth instead of flat white.";

    const draftSystem =
      "You are the lead designer of a mobile QR restaurant menu. " +
      CRAFT +
      " Reply ONLY with a JSON object using exactly these keys: " +
      SCHEMA +
      ". No prose, no markdown fences.";

    async function ask(model: string, messages: unknown[]) {
      return fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model, messages }),
      });
    }

    function extractJson(text: string): Record<string, unknown> | null {
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) return null;
      try {
        const parsed = JSON.parse(match[0]);
        return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
      } catch {
        return null;
      }
    }

    async function content(model: string, messages: unknown[]): Promise<string | null> {
      const response = await ask(model, messages);
      if (!response.ok) {
        if (response.status === 429) throw new Error("AI rate limit reached, try again shortly");
        console.error("AI gateway error", model, response.status, await response.text());
        return null;
      }
      const payload = (await response.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      return payload.choices?.[0]?.message?.content ?? null;
    }

    // Pass 1 — Claude art-directs the concept from the brand, brief and references.
    const draftMessages = [
      { role: "system", content: draftSystem },
      { role: "user", content: userContent },
    ];
    let draft =
      extractJson((await content("anthropic/claude-sonnet-4-5", draftMessages)) ?? "") ??
      extractJson((await content("google/gemini-3-pro", draftMessages)) ?? "");
    if (!draft) throw new Error("Theme generation is unavailable right now");

    // Pass 2 — GPT critiques and refines Claude's concept as a design director:
    // contrast, hierarchy, motion and coherence get one more expert pass.
    const refineSystem =
      "You are the design director reviewing a junior-free, senior concept for a mobile QR menu. " +
      CRAFT +
      " You receive the current design JSON. Fix contrast failures, weak or clashing accents, " +
      "incoherent typography/radius/card/background pairings and mismatched motion, and push the " +
      "result to portfolio quality without losing the concept's identity. " +
      "Reply ONLY with the improved JSON object using exactly these keys: " +
      SCHEMA +
      ". No prose, no markdown fences.";
    const refined = extractJson(
      (await content("openai/gpt-5", [
        { role: "system", content: refineSystem },
        {
          role: "user",
          content: [
            ...(userContent as { type: string }[]),
            { type: "text", text: `Current design JSON:\n${JSON.stringify(draft)}` },
          ],
        },
      ])) ?? "",
    );

    // The refined design wins when it arrives; Claude's concept ships otherwise.
    return { themeJson: JSON.stringify({ ...draft, ...(refined ?? {}) }) };
  });
