type PickObject = { userData: Record<string, unknown>; parent?: PickObject | null };
type Selection = { kind: "table" | "element" | "zone" | "entrance"; id: string };

/** Prefer visible furniture, then its generous touch area, then floor zones. */
export function pickFloorObject(hits: readonly { object: PickObject }[]): Selection | null {
  let chosen: Selection | null = null, best = Infinity;
  for (const hit of hits) {
    let object: PickObject | null | undefined = hit.object, proxy = false;
    while (object) {
      if (object.userData.selectionRing) break;
      proxy ||= Boolean(object.userData.pickProxy);
      const { kind, id } = object.userData;
      if (["table", "element", "zone", "entrance"].includes(String(kind)) && typeof id === "string") {
        const priority = kind === "table" || kind === "element" ? (proxy ? 1 : 0) : kind === "entrance" ? 2 : 3;
        if (priority < best) { best = priority; chosen = { kind: kind as Selection["kind"], id }; }
        break;
      }
      object = object.parent;
    }
  }
  return chosen;
}
