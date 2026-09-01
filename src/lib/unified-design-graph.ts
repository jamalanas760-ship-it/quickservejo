export type DesignProvider = "openai" | "figma" | "canva" | "adobe" | "quickserve";

export type DesignElement = {
  id: string;
  type: string;
  x: number;
  y: number;
  w: number;
  h: number;
  z?: number;
  text?: string;
  image?: string;
  color?: string;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: number;
  letterSpacing?: number;
  lineHeight?: number;
  align?: "left" | "center" | "right";
  rotation?: number;
  opacity?: number;
  shape?: string;
  animation?: string;
};

export type UnifiedDesignGraph = {
  version: 1;
  id: string;
  source: {
    prompt: string;
    references: string[];
    analysis?: string;
    fidelity: "exact" | "refined" | "creative";
  };
  canvas: {
    width: number;
    height: number;
    ratio: number;
    background: string;
  };
  theme: Record<string, unknown>;
  elements: DesignElement[];
  responsive: {
    mobile: string;
    tablet: string;
    desktop: string;
  };
  motion: {
    entrance: string;
    hover: string;
    scroll: string;
  };
  providerPlan: {
    reasoning: "openai";
    editableLayers: "figma" | "quickserve";
    contentSystem: "canva" | "quickserve";
    imageFinishing: "adobe" | "quickserve";
  };
};

function numberOr(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function toUnifiedDesignGraph(
  design: any,
  source: { prompt: string; references?: string[]; analysis?: string },
  fidelity: "exact" | "refined" | "creative",
  id: string,
): UnifiedDesignGraph {
  const composition = design?.composition ?? {};
  const elements = Array.isArray(composition.elements) ? composition.elements : [];
  const canvasWidth = numberOr(composition.width, 1200);
  const canvasHeight = numberOr(composition.height, 1600);

  return {
    version: 1,
    id,
    source: {
      prompt: source.prompt,
      references: source.references ?? [],
      analysis: source.analysis,
      fidelity,
    },
    canvas: {
      width: canvasWidth,
      height: canvasHeight,
      ratio: canvasWidth / Math.max(canvasHeight, 1),
      background: composition.background?.color ?? design?.background ?? "#FFFFFF",
    },
    theme: design ?? {},
    elements: elements.map((element: any, index: number) => ({
      id: String(element.id ?? `element-${index + 1}`),
      type: String(element.type ?? "shape"),
      x: numberOr(element.x, 0),
      y: numberOr(element.y, 0),
      w: numberOr(element.w, 10),
      h: numberOr(element.h, 10),
      z: numberOr(element.z, index),
      text: typeof element.text === "string" ? element.text : undefined,
      image: typeof element.image === "string" ? element.image : undefined,
      color: typeof element.color === "string" ? element.color : undefined,
      fontFamily: typeof element.fontFamily === "string" ? element.fontFamily : undefined,
      fontSize: numberOr(element.fontSize, 16),
      fontWeight: numberOr(element.fontWeight, 400),
      letterSpacing: numberOr(element.letterSpacing, 0),
      lineHeight: numberOr(element.lineHeight, 1.2),
      align: element.align === "center" || element.align === "right" ? element.align : "left",
      rotation: numberOr(element.rotation, 0),
      opacity: numberOr(element.opacity, 1),
      shape: typeof element.shape === "string" ? element.shape : undefined,
      animation: typeof element.animation === "string" ? element.animation : undefined,
    })),
    responsive: {
      mobile: composition.responsive?.mobile ?? "Stack columns, preserve hierarchy, prevent horizontal overflow.",
      tablet: composition.responsive?.tablet ?? "Collapse secondary columns while preserving focal imagery.",
      desktop: composition.responsive?.desktop ?? "Preserve the authored composition and spacing system.",
    },
    motion: {
      entrance: composition.motion?.entrance ?? "soft-fade",
      hover: composition.motion?.hover ?? "subtle-lift",
      scroll: composition.motion?.scroll ?? "gentle-reveal",
    },
    providerPlan: {
      reasoning: "openai",
      editableLayers: "figma",
      contentSystem: "canva",
      imageFinishing: "adobe",
    },
  };
}
