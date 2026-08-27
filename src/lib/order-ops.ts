/**
 * Shared order operations for the kitchen / management surfaces:
 * cancellations with mandatory reason codes, chef assignment and
 * stage-duration helpers built on the append-only `order_status_events` log.
 */
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type OrderStatus = Database["public"]["Enums"]["order_status"];

export type CancelReason = {
  code: string;
  en: string;
  ar: string;
  /** Needs a manager/admin, not a frontline user. */
  managerOnly?: boolean;
};

export const CANCEL_REASONS: CancelReason[] = [
  { code: "out_of_stock", en: "Item out of stock", ar: "المكوّن غير متوفر" },
  { code: "customer_request", en: "Customer changed their mind", ar: "العميل غيّر رأيه" },
  { code: "duplicate", en: "Duplicate order", ar: "طلب مكرر" },
  { code: "wrong_table", en: "Wrong table / test order", ar: "طاولة خاطئة أو طلب تجريبي" },
  { code: "kitchen_capacity", en: "Kitchen cannot deliver in time", ar: "المطبخ غير قادر على التحضير" },
  { code: "quality_issue", en: "Quality issue — remake", ar: "مشكلة في الجودة — إعادة تحضير" },
  { code: "payment_failed", en: "Payment problem", ar: "مشكلة في الدفع", managerOnly: true },
  { code: "other", en: "Other (explain below)", ar: "أخرى (اذكر السبب)", managerOnly: true },
];

export function cancelReasonLabel(code: string | null, ar: boolean): string {
  if (!code) return ar ? "بدون سبب" : "No reason";
  const found = CANCEL_REASONS.find((r) => r.code === code);
  if (!found) return code;
  return ar ? found.ar : found.en;
}

/** Late-stage cancellations need a manager approval in the UI. */
export const LATE_STAGES: OrderStatus[] = ["preparing", "ready", "served"];

export async function cancelOrder(input: {
  orderId: string;
  reason: string;
  note?: string | null;
}): Promise<void> {
  const { error } = await supabase
    .from("orders")
    .update({
      status: "cancelled",
      cancellation_reason: input.reason,
      cancellation_note: input.note?.trim() ? input.note.trim() : null,
      cancelled_at: new Date().toISOString(),
    })
    .eq("id", input.orderId);
  if (error) throw error;
}

export async function assignOrderToStaff(orderId: string, staffId: string | null): Promise<void> {
  const { error } = await supabase
    .from("orders")
    .update({
      assigned_staff_id: staffId,
      assigned_at: staffId ? new Date().toISOString() : null,
    })
    .eq("id", orderId);
  if (error) throw error;
}

export type StatusEvent = {
  id: string;
  order_id: string;
  from_status: OrderStatus | null;
  to_status: OrderStatus;
  actor_name: string | null;
  note: string | null;
  created_at: string;
};

export async function fetchStatusEvents(orderIds: string[]): Promise<StatusEvent[]> {
  if (orderIds.length === 0) return [];
  const { data, error } = await supabase
    .from("order_status_events")
    .select("id, order_id, from_status, to_status, actor_name, note, created_at")
    .in("order_id", orderIds)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as StatusEvent[];
}

/** Seconds spent in each stage, derived from consecutive events. */
export function stageDurations(
  events: StatusEvent[],
  placedAt: string,
  now: number,
): { status: OrderStatus; seconds: number }[] {
  const out: { status: OrderStatus; seconds: number }[] = [];
  let cursorStatus: OrderStatus = "new";
  let cursorTime = new Date(placedAt).getTime();
  for (const ev of events) {
    const at = new Date(ev.created_at).getTime();
    out.push({ status: cursorStatus, seconds: Math.max(0, Math.round((at - cursorTime) / 1000)) });
    cursorStatus = ev.to_status;
    cursorTime = at;
  }
  out.push({ status: cursorStatus, seconds: Math.max(0, Math.round((now - cursorTime) / 1000)) });
  return out;
}

export function durationLabel(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m >= 60) return `${Math.floor(m / 60)}h ${m % 60}m`;
  return `${m}:${String(s).padStart(2, "0")}`;
}
