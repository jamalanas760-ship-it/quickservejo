export const HOME_LABELS = {
  summary: { en: "Today's summary", ar: "ملخص اليوم" },
  orders: { en: "Orders overview", ar: "نظرة على الطلبات" },
  bookings: { en: "Today's bookings", ar: "حجوزات اليوم" },
  glance: { en: "At a glance", ar: "لمحة سريعة" },
  shortcuts: { en: "Workspace shortcuts", ar: "اختصارات مساحة العمل" },
};
export type HomeSectionId = keyof typeof HOME_LABELS;
export type HomeLayout = { order: HomeSectionId[]; hidden: HomeSectionId[] };
export function defaultHomeLayout(): HomeLayout {
  return { order: Object.keys(HOME_LABELS) as HomeSectionId[], hidden: [] };
}
export function normalizeHomeLayout(value: unknown): HomeLayout {
  const raw = value && typeof value === "object" ? (value as Partial<HomeLayout>) : {};
  const valid = (items: unknown) =>
    Array.isArray(items)
      ? [
          ...new Set(
            items.filter(
              (id): id is HomeSectionId => typeof id === "string" && Object.hasOwn(HOME_LABELS, id),
            ),
          ),
        ]
      : [];
  const order = valid(raw.order);
  return {
    order: [...order, ...defaultHomeLayout().order.filter((id) => !order.includes(id))],
    hidden: valid(raw.hidden),
  };
}
export function moveHomeSection(
  layout: HomeLayout,
  id: HomeSectionId,
  direction: -1 | 1,
): HomeLayout {
  const order = [...layout.order],
    index = order.indexOf(id),
    target = index + direction;
  if (index < 0 || target < 0 || target >= order.length) return layout;
  [order[index], order[target]] = [order[target]!, order[index]!];
  return { ...layout, order };
}
