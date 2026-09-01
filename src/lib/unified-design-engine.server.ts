import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { buildAdobeProductionPlan, buildFigmaPluginPayload, createCanvaDesignShell, getDesignProviderStatus } from "@/lib/design-provider-bridge.server";
import { toUnifiedDesignGraph } from "@/lib/unified-design-graph";

const inputSchema = z.object({
  restaurantId: z.string().uuid(),
  prompt: z.string().max(6000),
  references: z.array(z.string().max(6_000_000)).max(5).optional(),
  design: z.unknown(),
  fidelity: z.enum(["exact", "refined", "creative"]).default("exact"),
  syncCanva: z.boolean().default(false),
});

type CanvaResult = Awaited<ReturnType<typeof createCanvaDesignShell>>;

/**
 * One unified provider boundary for the selected QuickServe concept.
 * The UI never chooses Figma/Canva/Adobe individually; this engine decides
 * which provider capability is appropriate for the same DesignGraph.
 */
export const prepareUnifiedDesign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => inputSchema.parse(input))
  .handler(async ({ data }) => {
    const graph = toUnifiedDesignGraph(
      data.design,
      { prompt: data.prompt, references: data.references ?? [] },
      data.fidelity,
      `quickserve-${Date.now().toString(36)}`,
    );

    const providers = getDesignProviderStatus();
    const result: {
      graph: typeof graph;
      providers: typeof providers;
      figma: ReturnType<typeof buildFigmaPluginPayload>;
      adobe: ReturnType<typeof buildAdobeProductionPlan>;
      canva: CanvaResult | null;
    } = {
      graph,
      providers,
      figma: buildFigmaPluginPayload(graph),
      adobe: buildAdobeProductionPlan(graph),
      canva: null,
    };

    if (data.syncCanva) {
      result.canva = await createCanvaDesignShell(graph);
    }

    return result;
  });
