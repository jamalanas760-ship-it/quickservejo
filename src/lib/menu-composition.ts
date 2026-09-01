import type { CompositionElement } from "@/components/manage/SmartCompositionCanvas";

const DEFAULTS: Record<string, { x: number; y: number; w: number; h: number }> = {
  eyebrow: { x: 8, y: 7, w: 38, h: 7 }, title: { x: 8, y: 13, w: 62, h: 16 }, category: { x: 8, y: 34, w: 42, h: 8 }, product: { x: 8, y: 43, w: 56, h: 9 }, price: { x: 72, y: 43, w: 20, h: 9 }, image: { x: 66, y: 11, w: 27, h: 30 }, copy: { x: 8, y: 53, w: 58, h: 9 }, shape: { x: 4, y: 4, w: 92, h: 92 },
};
const finite = (value: unknown, fallback: number) => typeof value === "number" && Number.isFinite(value) ? value : fallback;
function looksLikePixels(elements: CompositionElement[]) { return elements.some((el) => Math.abs(el.x) > 100 || Math.abs(el.y) > 100 || Math.abs(el.w) > 100 || Math.abs(el.h) > 100); }
export function normalizeComposition(composition: unknown): { elements: CompositionElement[] } | undefined {
  if (!composition || typeof composition !== "object") return undefined;
  const raw = composition as { elements?: unknown };
  if (!Array.isArray(raw.elements)) return undefined;
  const source = raw.elements.filter((item): item is CompositionElement => Boolean(item) && typeof item === "object");
  if (!source.length) return { elements: [] };
  const pixels = looksLikePixels(source); const aw = 1200; const ah = 900;
  return { elements: source.map((item, index) => {
    const type = typeof item.type === "string" ? item.type : "copy"; const fallback = DEFAULTS[type] ?? { x: 8, y: 8 + index * 8, w: 48, h: 8 };
    const x = finite(item.x, fallback.x), y = finite(item.y, fallback.y), w = finite(item.w, fallback.w), h = finite(item.h, fallback.h);
    return { ...item, id: typeof item.id === "string" && item.id ? item.id : `layer-${index + 1}`, type, x: pixels ? x / aw * 100 : x, y: pixels ? y / ah * 100 : y, w: pixels ? w / aw * 100 : w, h: pixels ? h / ah * 100 : h, z: finite(item.z, index) };
  }) };
}
