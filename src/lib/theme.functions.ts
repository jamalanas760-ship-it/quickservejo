import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ART_DIRECTION, DESIGN_SCHEMA, callMenuDesigner, extractDesigns } from "@/lib/menu-designer.server";

const generateSchema = z.object({
  restaurantId: z.string().uuid(),
  brief: z.string().max(2400).optional(),
  base: z.string().max(80).optional(),
  tweak: z.string().max(500).optional(),
  images: z
    .array(
      z
        .string()
        .max(6_000_000)
        .refine((v) => v.startsWith("data:image/") || v.startsWith("https://"), "Unsupported image"),
    )
    .max(5)
    .optional(),
});

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

    const { data: restaurant, error: restaurantError } = await supabase
      .from("restaurants")
      .select("name, description_en, description_ar, primary_color, accent_color")
      .eq("id", data.restaurantId)
      .single();
    if (restaurantError) throw restaurantError;

    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("AI menu designer is not configured.");

    const prompt = [
      ART_DIRECTION,
      DESIGN_SCHEMA,
      `Restaurant: ${restaurant.name}`,
      restaurant.description_en ? `English description: ${restaurant.description_en}` : "",
      restaurant.description_ar ? `Arabic description: ${restaurant.description_ar}` : "",
      `Existing brand colours: primary ${restaurant.primary_color}, accent ${restaurant.accent_color}`,
      data.base ? `Selected visual direction: ${data.base}` : "",
      data.brief ? `Owner creative brief: ${data.brief}` : "",
      data.tweak ? `Refinement: ${data.tweak}` : "",
      data.images?.length
        ? "Reference images are attached. Treat them as high-priority visual references for layout, palette, typography, texture and photographic treatment."
        : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    const userContent: unknown[] = [{ type: "input_text", text: prompt }];
    for (const image of data.images ?? []) {
      userContent.push({ type: "input_image", image_url: image, detail: "high" });
    }

    const text = await callMenuDesigner(
      [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text: "You are a world-class hospitality art director. Output valid JSON only.",
            },
          ],
        },
        { role: "user", content: userContent },
      ],
      apiKey,
    );

    const designs = extractDesigns(text);
    if (designs.length === 0) throw new Error("The AI returned an invalid menu design. Please try again.");
    return { variants: designs.slice(0, 3).map((design) => JSON.stringify(design)) };
  });
