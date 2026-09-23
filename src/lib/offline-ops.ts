import { supabase } from "@/integrations/supabase/client";

export type OfflineOrderStatus =
  | "new"
  | "accepted"
  | "preparing"
  | "ready"
  | "served"
  | "paid"
  | "cancelled";

export type OfflineTableStatus = "free" | "reserved" | "active" | "cleaning" | "out_of_service";
export type OfflineWaiterCallStatus = "acknowledged" | "resolved";

type CommandBase = {
  id: string;
  restaurantId: string;
  createdAt: string;
};

type OrderStatusCommand = CommandBase & {
  kind: "order_status";
  orderId: string;
  status: OfflineOrderStatus;
};

type WaiterCallCommand = CommandBase & {
  kind: "waiter_call_status";
  callId: string;
  status: OfflineWaiterCallStatus;
  changedAt: string;
};

type TableStatusCommand = CommandBase & {
  kind: "table_service_status";
  tableId: string;
  status: OfflineTableStatus;
};

type OfflineCommand = OrderStatusCommand | WaiterCallCommand | TableStatusCommand;

const KEY = "quickserve.offline.commands.v2";
const LEGACY_KEY = "quickserve.offline.commands.v1";
const EVENT = "quickserve:offline-queue-changed";
let flushing: Promise<{ flushed: number; remaining: number }> | null = null;

function storageAvailable() {
  return typeof window !== "undefined" && Boolean(window.localStorage);
}

function isCommand(entry: unknown): entry is OfflineCommand {
  if (!entry || typeof entry !== "object") return false;
  const row = entry as Record<string, unknown>;
  if (typeof row.id !== "string" || typeof row.restaurantId !== "string" || typeof row.createdAt !== "string") return false;
  if (row.kind === "order_status") return typeof row.orderId === "string" && typeof row.status === "string";
  if (row.kind === "waiter_call_status") return typeof row.callId === "string" && typeof row.status === "string" && typeof row.changedAt === "string";
  if (row.kind === "table_service_status") return typeof row.tableId === "string" && typeof row.status === "string";
  return false;
}

function readQueue(): OfflineCommand[] {
  if (!storageAvailable()) return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter(isCommand) : [];
    }

    // One-time compatibility import for the original KDS-only queue.
    const legacy = window.localStorage.getItem(LEGACY_KEY);
    if (!legacy) return [];
    const parsed = JSON.parse(legacy);
    const imported = Array.isArray(parsed) ? parsed.filter(isCommand) : [];
    if (imported.length) writeQueue(imported);
    window.localStorage.removeItem(LEGACY_KEY);
    return imported;
  } catch {
    return [];
  }
}

function writeQueue(queue: OfflineCommand[]) {
  if (!storageAvailable()) return;
  try {
    if (queue.length) window.localStorage.setItem(KEY, JSON.stringify(queue.slice(-300)));
    else window.localStorage.removeItem(KEY);
    window.dispatchEvent(new CustomEvent(EVENT, { detail: { count: queue.length } }));
  } catch {
    // Hardened/private browsers can disable storage. Callers still receive
    // the original network error rather than a false "saved" state.
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

  // Collapse superseded commands for the same entity. A waiter resolving a
  // call after acknowledging it, for example, only needs the latest state.
  const filtered = queue.filter((entry) => {
    if (entry.restaurantId !== command.restaurantId || entry.kind !== command.kind) return true;
    if (entry.kind === "order_status" && command.kind === "order_status") return entry.orderId !== command.orderId;
    if (entry.kind === "waiter_call_status" && command.kind === "waiter_call_status") return entry.callId !== command.callId;
    if (entry.kind === "table_service_status" && command.kind === "table_service_status") return entry.tableId !== command.tableId;
    return true;
  });
  filtered.push(command);
  writeQueue(filtered);
}

async function execute(command: OfflineCommand) {
  if (command.kind === "order_status") {
    const { error } = await supabase
      .from("orders")
      .update({ status: command.status })
      .eq("id", command.orderId)
      .eq("restaurant_id", command.restaurantId);
    if (error) throw error;
    return;
  }

  if (command.kind === "waiter_call_status") {
    const patch = command.status === "acknowledged"
      ? { status: command.status, acknowledged_at: command.changedAt }
      : { status: command.status, resolved_at: command.changedAt };
    const { error } = await supabase
      .from("waiter_calls")
      .update(patch)
      .eq("id", command.callId)
      .eq("restaurant_id", command.restaurantId);
    if (error) throw error;
    return;
  }

  const { error } = await (supabase as any).rpc("set_table_service_status", {
    _table_id: command.tableId,
    _status: command.status,
  });
  if (error) throw error;
}

async function executeOrQueue(command: OfflineCommand): Promise<{ queued: boolean }> {
  try {
    await execute(command);
    return { queued: false };
  } catch (error) {
    if (!looksLikeNetworkFailure(error)) throw error;
    enqueue(command);
    return { queued: true };
  }
}

export function setOrderStatusResilient(input: {
  restaurantId: string;
  orderId: string;
  status: OfflineOrderStatus;
}) {
  return executeOrQueue({
    id: crypto.randomUUID(),
    kind: "order_status",
    restaurantId: input.restaurantId,
    orderId: input.orderId,
    status: input.status,
    createdAt: new Date().toISOString(),
  });
}

export function setWaiterCallStatusResilient(input: {
  restaurantId: string;
  callId: string;
  status: OfflineWaiterCallStatus;
}) {
  const now = new Date().toISOString();
  return executeOrQueue({
    id: crypto.randomUUID(),
    kind: "waiter_call_status",
    restaurantId: input.restaurantId,
    callId: input.callId,
    status: input.status,
    changedAt: now,
    createdAt: now,
  });
}

export function setTableServiceStatusResilient(input: {
  restaurantId: string;
  tableId: string;
  status: OfflineTableStatus;
}) {
  return executeOrQueue({
    id: crypto.randomUUID(),
    kind: "table_service_status",
    restaurantId: input.restaurantId,
    tableId: input.tableId,
    status: input.status,
    createdAt: new Date().toISOString(),
  });
}

export async function flushOfflineOperations() {
  if (flushing) return flushing;
  flushing = (async () => {
    const queue = readQueue();
    let flushed = 0;
    const remaining: OfflineCommand[] = [];

    for (let index = 0; index < queue.length; index += 1) {
      const command = queue[index]!;
      try {
        await execute(command);
        flushed += 1;
      } catch {
        // Keep this command and all later commands in original sequence. This
        // protects restaurant state from out-of-order replay after reconnect.
        remaining.push(command, ...queue.slice(index + 1));
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
