export const FLOOR_ELEMENT_TYPES = [
  "wall",
  "door",
  "window",
  "tree",
  "plant",
  "toilet",
  "kitchen",
  "bar",
  "counter",
  "sofa",
] as const;
export type FloorElementType = (typeof FLOOR_ELEMENT_TYPES)[number];
export type FloorElement = {
  id: string;
  type: FloorElementType;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
};
export const FLOOR_ELEMENT_LABELS: Record<FloorElementType, [string, string]> = {
  wall: ["Wall", "جدار"],
  door: ["Door", "باب"],
  window: ["Window", "نافذة"],
  tree: ["Tree", "شجرة"],
  plant: ["Plant", "نبات"],
  toilet: ["Restroom", "دورة مياه"],
  kitchen: ["Kitchen", "مطبخ"],
  bar: ["Bar", "بار"],
  counter: ["Counter", "كاونتر"],
  sofa: ["Sofa", "أريكة"],
};
const bound = (value: unknown, fallback: number, min: number, max: number) => {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? Math.max(min, Math.min(max, numeric)) : fallback;
};
export function normalizeFloorElement(value: FloorElement): FloorElement {
  const width = bound(value.width, 10, 1, 80),
    height = bound(value.height, 10, 1, 80);
  return {
    ...value,
    label: value.label.slice(0, 60),
    width,
    height,
    x: bound(value.x, 50, width / 2, 100 - width / 2),
    y: bound(value.y, 50, height / 2, 100 - height / 2),
    rotation: bound(value.rotation, 0, -180, 180),
  };
}
export function parseFloorElements(value: unknown): FloorElement[] {
  if (!Array.isArray(value)) return [];
  const ids = new Set<string>();
  return value.slice(0, 250).flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const raw = entry as Record<string, unknown>;
    if (
      typeof raw.id !== "string" ||
      !raw.id ||
      ids.has(raw.id) ||
      !FLOOR_ELEMENT_TYPES.includes(raw.type as FloorElementType)
    )
      return [];
    ids.add(raw.id);
    return [
      normalizeFloorElement({
        id: raw.id,
        type: raw.type as FloorElementType,
        label: typeof raw.label === "string" ? raw.label : "",
        x: Number(raw.x),
        y: Number(raw.y),
        width: Number(raw.width),
        height: Number(raw.height),
        rotation: Number(raw.rotation),
      }),
    ];
  });
}
export function createFloorElement(type: FloorElementType, ar = false): FloorElement {
  const dimensions: Record<FloorElementType, [number, number]> = {
    wall: [28, 1.5],
    door: [8, 8],
    window: [16, 2],
    tree: [7, 10],
    plant: [5, 7],
    toilet: [12, 15],
    kitchen: [22, 18],
    bar: [25, 8],
    counter: [20, 7],
    sofa: [15, 8],
  };
  return {
    id: crypto.randomUUID(),
    type,
    label: FLOOR_ELEMENT_LABELS[type][ar ? 1 : 0],
    x: 50,
    y: 50,
    width: dimensions[type][0],
    height: dimensions[type][1],
    rotation: 0,
  };
}
export function moveFloorElement(
  element: FloorElement,
  dx: number,
  dy: number,
  snap: boolean,
  resize = false,
) {
  const round = (value: number) => (snap ? Math.round(value) : value);
  return normalizeFloorElement(
    resize
      ? { ...element, width: round(element.width + dx * 2), height: round(element.height + dy * 2) }
      : { ...element, x: round(element.x + dx), y: round(element.y + dy) },
  );
}
