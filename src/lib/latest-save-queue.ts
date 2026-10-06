/** Serialize writes and replace waiting snapshots with the latest user intent. */
export function createLatestSaveQueue<T>(options: {
  save: (value: T) => Promise<void>;
  onError: (error: unknown, value: T) => void;
  onPendingChange: (pending: boolean) => void;
}) {
  let pending: { value: T } | null = null;
  let running = false;
  let settle: (() => void)[] = [];
  async function drain() {
    running = true;
    options.onPendingChange(true);
    while (pending) {
      const { value } = pending;
      pending = null;
      try { await options.save(value); }
      catch (error) {
        // A newer snapshot includes the failed change; let that write recover it.
        if (!pending) options.onError(error, value);
      }
    }
    running = false;
    options.onPendingChange(false);
    const waiting = settle;
    settle = [];
    waiting.forEach(resolve => resolve());
  }
  return {
    get isPending() { return running || pending !== null; },
    enqueue(value: T) {
      pending = { value };
      if (!running) void drain();
    },
    flush(): Promise<void> {
      return running || pending ? new Promise(resolve => settle.push(resolve)) : Promise.resolve();
    },
  };
}
