import { supabase } from "@/integrations/supabase/client";

export type OfflineOrderStatus =
  | "new"
  | "accepted"
  | "preparing"
  | "ready"
  | "served"
  | "paid"
  | "cancelled";

type OrderStatusCommand = {
  id: string;
  kind: "order_status";
  restaurantId: string;
  orderId: string;
  status: OfflineOrderStatus;
  createdAt: string;
};

type OfflineCommand = OrderStatusCommand;

const KEY = "quickserve.offline.commands.v1";
const EVENT = "quickserve:offline-queue-changed";
let flushing: Promise<{ flushed: number; remaining: number }> | null = null;

function storageAvailable() {
  return typeof window !== "undefined" && Boolean(window.localStorage);
}

function readQueue(): OfflineCommand[] {
  if (!storageAvailable()) return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is OfflineCommand => (
      entry
      && entry.kind === "order_status"
      && typeof entry.id === "string"
      && typeof entry.restaurantId === "string"
      && typeof entry.orderId === "string"
      && typeof entry.status === "string"
      && typeof entry.createdAt === "string"
    ));
  } catch {
    return [];
  }
}

function writeQueue(queue: OfflineCommand[]) {
  if (!storageAvailable()) return;
  try {
    if (queue.length) window.localStorage.setItem(KEY, JSON.stringify(queue.slice(-200)));
    else window.localStorage.removeItem(KEY);
    window.dispatchEvent(new CustomEvent(EVENT, { detail: { count: queue.length } }));
  } catch {
    // A hardened/private browser can disable local storage. The caller still
    // receives the original network error rather than pretending the action saved.
  }
}

function looksLikeNetworkFailure(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /failed to fetch|network|load failed|fetch|connection|offline|timed out|timeout/i.test(message);
}

export function offlineQueueCount() {
  return readQueue().length;
}

export function subscribeOfflineQueue(listener: () => void) {
  if (typeof window === "undefined") return () => undefined;
  const handler = () => listener();
  window.addEventListener(EVENT, handler);
  window.addEventListener("online", handler);
  window.addEventListener("offline", handler);
  return () => {
    window.removeEventListener(EVENT, handler);
    window.removeEventListener("online", handler);
    window.removeEventListener("offline", handler);
  };
}

function enqueue(command: OfflineCommand) {
  const queue = readQueue();
  queue.push(command);
  writeQueue(queue);
}

export async function setOrderStatusResilient(input: {
  restaurantId: string;
  orderId: string;
  status: OfflineOrderStatus;
}): Promise<{ queued: boolean }> {
  const command: OrderStatusCommand = {
    id: crypto.randomUUID(),
    kind: "order_status",
    restaurantId: input.restaurantId,
    orderId: input.orderId,
    status: input.status,
    createdAt: new Date().toISOString(),
  };

  if (typeof navigator !== "undefined" && !navigator.onLine) {
    enqueue(command);
    return { queued: true };
  }

  try {
    const { error } = await supabase
      .from("orders")
      .update({ status: input.status })
      .eq("id", input.orderId)
      .eq("restaurant_id", input.restaurantId);
    if (error) throw error;
    return { queued: false };
  } catch (error) {
    if (!looksLikeNetworkFailure(error)) throw error;
    enqueue(command);
    return { queued: true };
  }
}

async function execute(command: OfflineCommand) {
  if (command.kind === "order_status") {
    const { error } = await supabase
      .from("orders")
      .update({ status: command.status })
      .eq("id", command.orderId)
      .eq("restaurant_id", command.restaurantId);
    if (error) throw error;
  }
}

export async function flushOfflineOperations() {
  if (flushing) return flushing;
  flushing = (async () => {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      return { flushed: 0, remaining: offlineQueueCount() };
    }

    const queue = readQueue();
    let flushed = 0;
    const remaining: OfflineCommand[] = [];

    for (let index = 0; index < queue.length; index += 1) {
      const command = queue[index]!;
      try {
        await execute(command);
        flushed += 1;
      } catch (error) {
        // Preserve this command and every later command in order. Replaying
        // sequential order-stage changes out of order would be unsafe.
        remaining.push(command, ...queue.slice(index + 1));
        if (!looksLikeNetworkFailure(error)) {
          // A business-rule or permission error needs human attention; leave
          // it queued instead of silently dropping the restaurant action.
        }
        break;
      }
    }

    writeQueue(remaining);
    return { flushed, remaining: remaining.length };
  })();

  try {
    return await flushing;
  } finally {
    flushing = null;
  }
}
