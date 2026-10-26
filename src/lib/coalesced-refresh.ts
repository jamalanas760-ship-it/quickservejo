/** Coalesce bursts without starving refresh during a continuous event stream. */
export function createCoalescedRefresh(refresh: () => void, delay = 750) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return {
    schedule() {
      if (timer !== undefined) return;
      timer = setTimeout(() => { timer = undefined; refresh(); }, delay);
    },
    cancel() { if (timer !== undefined) clearTimeout(timer); timer = undefined; },
  };
}
