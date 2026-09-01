import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ART_DIRECTION, DESIGN_SCHEMA, extractDesigns } from "@/lib/menu-designer.server";
import { callOpenAIMenuDesigner, DEFAULT_MENU_MODEL } from "@/lib/openai-menu-designer.server";

const schema = z.object({
  restaurantId: z.string().uuid(),
  element: z.enum(["hero", "typography", "category", "item-card", "price", "imagery", "background", "spacing"]),
  instruction: z.string().min(3).max(1600),
  currentTheme: z.string().min(2).max(30000),
});

export const refineSmartMenuElement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => schema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const owner = await supabase.rpc("is_platform_owner");
    if (owner.error) throw owner.error;
    if (!owner.data) {
      const { data: rows, error } = await supabase.from("staff").select("role").eq("restaurant_id", data.restaurantId).eq("auth_user_id", userId).eq("is_active", true);
      if (error) throw error;
      if (!(rows ?? []).some((row) => row.role === "restaurant_admin" || row.role === "manager")) throw new Error("Forbidden");
    }

    const apiKey = process.env["OPENAI_API_KEY"];
    if (!apiKey) throw new Error("AI menu designer is not configured. Add OPENAI_API_KEY to the server environment.");
    const model = process.env["OPENAI_MENU_MODEL"] || DEFAULT_MENU_MODEL;
    const prompt = [
      ART_DIRECTION,
      DESIGN_SCHEMA,
      "You are refining ONE selected part of an existing restaurant menu. Preserve everything else unless a tiny dependent adjustment is required for harmony.",
      `Selected element: ${data.element}`,
      `User instruction: ${data.instruction}`,
      `Current editable theme: ${data.currentTheme}`,
      "Return one complete valid theme object. Make the change visible, intentional and human-designed. Never flatten the design into an image."
    ].join("\n\n");

    const text = await callOpenAIMenuDesigner([
      { role: "system", content: [{ type: "input_text", text: "You are a senior restaurant art director. Preserve design intent, improve the selected element only, and return JSON only." }] },
      { role: "user", content: [{ type: "input_text", text: prompt }] },
    ], apiKey, model);
    const designs = extractDesigns(text);
    if (!designs.length) throw new Error("The refinement returned no valid design.");
    return { theme: JSON.stringify(designs[0]) };
  });
