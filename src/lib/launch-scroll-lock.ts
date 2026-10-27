type LockState = { tokens: Set<symbol>; release: () => void };
const states = new WeakMap<Document, LockState>();
const scrollKeys = new Set([
  "ArrowDown",
  "ArrowUp",
  "ArrowLeft",
  "ArrowRight",
  "PageDown",
  "PageUp",
  "Home",
  "End",
  " ",
]);

/** Lock background input while one or more launch views are visible. */
export function acquireLaunchScrollLock(doc: Document): () => void {
  let state = states.get(doc);
  if (!state) {
    const blockScroll = (event: Event) => event.preventDefault();
    const blockKey = (event: KeyboardEvent) => {
      if (scrollKeys.has(event.key)) event.preventDefault();
    };
    doc.documentElement.setAttribute("data-qs-launch-lock", "");
    doc.addEventListener("wheel", blockScroll, { capture: true, passive: false });
    doc.addEventListener("touchmove", blockScroll, { capture: true, passive: false });
    doc.addEventListener("keydown", blockKey, { capture: true });
    state = {
      tokens: new Set(),
      release: () => {
        doc.documentElement.removeAttribute("data-qs-launch-lock");
        doc.removeEventListener("wheel", blockScroll, { capture: true });
        doc.removeEventListener("touchmove", blockScroll, { capture: true });
        doc.removeEventListener("keydown", blockKey, { capture: true });
      },
    };
    states.set(doc, state);
  }
  const token = Symbol("launch-view");
  state.tokens.add(token);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const current = states.get(doc);
    if (!current) return;
    current.tokens.delete(token);
    if (current.tokens.size === 0) {
      current.release();
      states.delete(doc);
    }
  };
}
