import type { UnifiedDesignGraph } from "@/lib/unified-design-graph";

export type ProviderStatus = {
  id: "figma" | "canva" | "adobe";
  configured: boolean;
  mode: "native" | "plugin-bridge" | "disabled";
  capability: string;
};

function env(name: string) {
  return process.env[name]?.trim() || "";
}

export function getDesignProviderStatus(): ProviderStatus[] {
  return [
    {
      id: "figma",
      configured: Boolean(env("FIGMA_ACCESS_TOKEN") || env("FIGMA_OAUTH_ACCESS_TOKEN")),
      mode: "plugin-bridge",
      capability: "Editable layers, typography, geometry, variables and design-system handoff",
    },
    {
      id: "canva",
      configured: Boolean(env("CANVA_ACCESS_TOKEN")),
      mode: "native",
      capability: "Create/editable design shells, asset sync and export workflows",
    },
    {
      id: "adobe",
      configured: Boolean(env("ADOBE_CLIENT_ID") && env("ADOBE_CLIENT_SECRET")),
      mode: "native",
      capability: "Image finishing, smart-object workflows, compositing and creative production",
    },
  ];
}

/**
 * Figma's REST API is intentionally not used as a fake write API. Figma documents
 * that the Plugin API is the real-time read/write surface for the current file,
 * while REST is primarily for external access. We therefore emit a plugin-ready
 * operation graph that can be applied to the open Figma file without losing layers.
 */
export function buildFigmaPluginPayload(graph: UnifiedDesignGraph) {
  return {
    protocol: "quickserve.figma.bridge.v1",
    action: "replace-selection-with-design-graph",
    designId: graph.id,
    canvas: graph.canvas,
    elements: graph.elements,
    responsive: graph.responsive,
    motion: graph.motion,
  };
}

/** Canva Connect: create an editable design shell when a user OAuth access token is configured. */
export async function createCanvaDesignShell(graph: UnifiedDesignGraph) {
  const token = env("CANVA_ACCESS_TOKEN");
  if (!token) return { configured: false as const, skipped: true as const, reason: "CANVA_ACCESS_TOKEN missing" };

  const response = await fetch("https://api.canva.com/rest/v1/designs", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type: "type_and_asset",
      design_type: {
        type: "custom",
        width: Math.max(40, Math.min(8000, Math.round(graph.canvas.width))),
        height: Math.max(40, Math.min(8000, Math.round(graph.canvas.height))),
      },
      title: `QuickServe — ${graph.id}`,
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Canva design creation failed (${response.status}): ${JSON.stringify(payload).slice(0, 800)}`);
  }

  return { configured: true as const, skipped: false as const, design: payload.design ?? payload };
}

/**
 * Adobe credentials are intentionally kept server-side. The actual Photoshop
 * v2 job is represented as a provider plan because Adobe requires a source asset
 * and Firefly Services credentials before a composite can be executed.
 */
export function buildAdobeProductionPlan(graph: UnifiedDesignGraph) {
  const configured = Boolean(env("ADOBE_CLIENT_ID") && env("ADOBE_CLIENT_SECRET"));
  return {
    configured,
    endpoint: "https://image.adobe.io/v2/create-composite",
    api: "Adobe Photoshop API v2 / Firefly Services",
    operations: [
      "preserve source/reference imagery",
      "apply image crop and placement from DesignGraph",
      "apply finishing/texture direction",
      "keep generated output linked to the selected QuickServe concept",
    ],
  };
}

export async function orchestrateProviderBridge(graph: UnifiedDesignGraph) {
  const statuses = getDesignProviderStatus();
  const canva = await createCanvaDesignShell(graph).catch((error: unknown) => ({
    configured: true as const,
    skipped: false as const,
    error: error instanceof Error ? error.message : "Canva integration failed",
  }));

  return {
    graph,
    providers: statuses,
    figma: buildFigmaPluginPayload(graph),
    canva,
    adobe: buildAdobeProductionPlan(graph),
  };
}
