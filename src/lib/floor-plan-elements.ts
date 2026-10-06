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
  "chair",
  "stool",
  "partition", "reception", "storage", "buffet", "bench", "planter",
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
  chair: ["Chair", "كرسي"],
  stool: ["Bar stool", "كرسي بار"],
  partition: ["Partition", "فاصل"], reception: ["Reception desk", "مكتب استقبال"], storage: ["Storage cabinet", "خزانة تخزين"], buffet: ["Buffet station", "بوفيه"], bench: ["Bench", "مقعد طويل"], planter: ["Planter", "حوض نباتات"],
};
export function rotateFloorObject(rotation: number, delta: number) {
  return ((rotation + delta + 180) % 360 + 360) % 360 - 180;
}
const bound = (value: unknown, fallback: number, min: number, max: number) => {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? Math.max(min, Math.min(max, numeric)) : fallback;
};
export function normalizeFloorElement(value: FloorElement): FloorElement {
  const width = bound(value.width, 10, 1, 80),
    height = bound(value.height, 10, 1, 80);
  const rotation = bound(value.rotation, 0, -180, 180);
  const radians = (rotation * Math.PI) / 180;
  const halfWidth = Math.min(
    50,
    (Math.abs(width * Math.cos(radians)) + Math.abs(height * Math.sin(radians))) / 2,
  );
  const halfHeight = Math.min(
    50,
    (Math.abs(width * Math.sin(radians)) + Math.abs(height * Math.cos(radians))) / 2,
  );
  return {
    ...value,
    label: value.label.slice(0, 60),
    width,
    height,
    x: bound(value.x, 50, halfWidth, 100 - halfWidth),
    y: bound(value.y, 50, halfHeight, 100 - halfHeight),
    rotation,
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
    chair: [5, 6],
    stool: [4, 5],
    partition: [18, 2], reception: [16, 8], storage: [10, 6], buffet: [24, 8], bench: [16, 5], planter: [12, 5],
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

/** Find an open place for a new object rather than stacking every addition at center. */
export function placeFloorElement(
  element: FloorElement,
  occupied: { x: number; y: number; width: number; height: number }[],
) {
  let best = { x: 50, y: 50 },
    score = Infinity;
  const margin = 1.5;
  const halfW = element.width / 2,
    halfH = element.height / 2;
  const startX = halfW + margin,
    endX = 100 - halfW - margin;
  const startY = halfH + margin,
    endY = 100 - halfH - margin;
  for (let x = startX; x <= endX; x += 5)
    for (let y = startY; y <= endY; y += 5) {
      let overlap = 0;
      for (const other of occupied) {
        const w = Math.max(
          0,
          Math.min(x + halfW + margin, other.x + other.width / 2) -
            Math.max(x - halfW - margin, other.x - other.width / 2),
        );
        const h = Math.max(
          0,
          Math.min(y + halfH + margin, other.y + other.height / 2) -
            Math.max(y - halfH - margin, other.y - other.height / 2),
        );
        overlap += w * h;
      }
      const candidate = overlap * 1000 + Math.hypot(x - 50, y - 50);
      if (candidate < score) {
        score = candidate;
        best = { x, y };
      }
    }
  return normalizeFloorElement({ ...element, ...best });
}
