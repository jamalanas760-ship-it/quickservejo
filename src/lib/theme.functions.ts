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

    const systemPrompt =
      "You are Claude, a senior product designer specialising in mobile QR restaurant menus. " +
      "Reply ONLY with a JSON object using exactly these keys: " +
      "template (classic|midnight|street|cafe|bold), bg, surface, text, muted, primary, primaryText, accent " +
      "(all 6-digit hex like #1a1a1a), bodyFont and headingFont (sans|serif|rounded|mono|display), " +
      "layout (list|grid|magazine), hero (cover|gradient|minimal), radius (0-32 integer), " +
      "showImages (boolean), imageShape (rounded|circle|square), showIcons (boolean), " +
      "buttonStyle (solid|pill|soft|outline), cardStyle (flat|elevated|outline|glass), " +
      "bgStyle (solid|gradient|dots|glow), density (compact|comfortable|airy). " +
      "Design for thumb-first mobile reading: WCAG AA contrast between text and surface and between " +
      "primary and primaryText, a distinctive accent that is not generic purple-on-white, and a coherent " +
      "pairing of typography, radius, card style and background style. No prose, no markdown fences.";

    async function ask(model: string) {
      return fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userContent },
          ],
          temperature: 0.8,
        }),
      });
    }

    // Claude leads the design work; a fast fallback keeps the studio usable if
    // the Claude model is momentarily unavailable on the gateway.
    let response = await ask("anthropic/claude-sonnet-4-5");
    if (!response.ok && response.status !== 429) {
      console.error("Claude design error", response.status, await response.text());
      response = await ask("google/gemini-3.7-flash");
    }

    if (!response.ok) {
      if (response.status === 429) throw new Error("AI rate limit reached, try again shortly");
      console.error("AI gateway error", response.status, await response.text());
      throw new Error("Theme generation is unavailable right now");
    }


    const payload = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = payload.choices?.[0]?.message?.content ?? "";
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("Theme generation returned no design");

    try {
      JSON.parse(match[0]);
    } catch {
      throw new Error("Theme generation returned no design");
    }
    return { themeJson: match[0] };
  });
