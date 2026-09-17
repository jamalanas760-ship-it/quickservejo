import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { AppRole } from "@/lib/permissions";

export type WorkPriority = "low" | "normal" | "high" | "urgent";
export type OperationalEventType = "waiter_call_created" | "order_stuck" | "low_stock" | "shift_opening" | "shift_closing" | "manual_exception";
export type ShiftStatus = "planned" | "open" | "closed";
export type ShiftAssignmentStatus = "scheduled" | "present" | "late" | "absent" | "released";

export type OperationalRule = {
  id: string;
  restaurant_id: string;
  name: string;
  event_type: OperationalEventType;
  enabled: boolean;
  priority: WorkPriority;
  target_role: AppRole | null;
  due_minutes: number;
  requires_approval: boolean;
  approval_role: AppRole | null;
  rule_config: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type Shift = {
  id: string;
  restaurant_id: string;
  name: string;
  shift_date: string;
  planned_start: string | null;
  planned_end: string | null;
  actual_opened_at: string | null;
  actual_closed_at: string | null;
  status: ShiftStatus;
  opened_by_staff_id: string | null;
  closed_by_staff_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type ShiftAssignment = {
  id: string;
  restaurant_id: string;
  shift_id: string;
  staff_id: string;
  role_snapshot: AppRole | null;
  starts_at: string | null;
  ends_at: string | null;
  status: ShiftAssignmentStatus;
  notes: string | null;
  created_at: string;
};

export type ShiftHandover = {
  id: string;
  restaurant_id: string;
  shift_id: string | null;
  from_staff_id: string | null;
  to_staff_id: string | null;
  target_role: AppRole | null;
  summary: string;
  unresolved_items: string | null;
  cash_note: string | null;
  inventory_note: string | null;
  acknowledged_at: string | null;
  acknowledged_by_staff_id: string | null;
  created_at: string;
};

type LooseQuery = {
  select: (...args: unknown[]) => LooseQuery;
  insert: (...args: unknown[]) => LooseQuery;
  update: (...args: unknown[]) => LooseQuery;
  delete: (...args: unknown[]) => LooseQuery;
  eq: (...args: unknown[]) => LooseQuery;
  in: (...args: unknown[]) => LooseQuery;
  contains: (...args: unknown[]) => LooseQuery;
  order: (...args: unknown[]) => LooseQuery;
  limit: (...args: unknown[]) => LooseQuery;
  maybeSingle: () => Promise<{ data: unknown; error: Error | null }>;
  single: () => Promise<{ data: unknown; error: Error | null }>;
  then: Promise<unknown>["then"];
};

/** Narrow compatibility boundary until generated Supabase types include the Phase 2 tables. */
function fromOperations(table: "operational_rules" | "shifts" | "shift_assignments" | "shift_handovers" | "work_tasks") {
  return (supabase.from as unknown as (name: string) => LooseQuery)(table);
}

export function useOperationalRules(restaurantId: string | null, enabled = true) {
  return useQuery<OperationalRule[]>({
    queryKey: ["operations", "rules", restaurantId],
    enabled: Boolean(restaurantId && enabled),
    staleTime: 15_000,
    queryFn: async () => {
      const result = await fromOperations("operational_rules")
        .select("*")
        .eq("restaurant_id", restaurantId!)
        .order("created_at", { ascending: true }) as unknown as { data: OperationalRule[] | null; error: Error | null };
      if (result.error) throw result.error;
      return result.data ?? [];
    },
  });
}

export function useUrgentAutomatedWork(restaurantId: string | null) {
  return useQuery({
    queryKey: ["operations", "automated-alerts", restaurantId],
    enabled: Boolean(restaurantId),
    staleTime: 10_000,
    queryFn: async () => {
      const result = await fromOperations("work_tasks")
        .select("id,title,priority,status,due_at,metadata")
        .eq("restaurant_id", restaurantId!)
        .in("status", ["open", "in_progress", "waiting_approval"])
        .contains("metadata", { automated: true })
        .order("created_at", { ascending: false })
        .limit(100) as unknown as { data: Array<{ id: string; title: string; priority: WorkPriority; status: string; due_at: string | null; metadata: Record<string, unknown> }> | null; error: Error | null };
      if (result.error) throw result.error;
      const rows = result.data ?? [];
      return {
        total: rows.length,
        urgent: rows.filter((row) => row.priority === "urgent").length,
        high: rows.filter((row) => row.priority === "high").length,
        rows: rows.slice(0, 5),
      };
    },
  });
}

export function useOpenWorkCount(restaurantId: string | null) {
  return useQuery<number>({
    queryKey: ["operations", "open-work-count", restaurantId],
    enabled: Boolean(restaurantId),
    staleTime: 10_000,
    queryFn: async () => {
      const result = await fromOperations("work_tasks")
        .select("id", { count: "exact", head: true })
        .eq("restaurant_id", restaurantId!)
        .in("status", ["open", "in_progress", "waiting_approval"]) as unknown as { count: number | null; error: Error | null };
      if (result.error) throw result.error;
      return result.count ?? 0;
    },
  });
}

export function useShifts(restaurantId: string | null) {
  return useQuery<Shift[]>({
    queryKey: ["operations", "shifts", restaurantId],
    enabled: Boolean(restaurantId),
    staleTime: 10_000,
    queryFn: async () => {
      const result = await fromOperations("shifts")
        .select("*")
        .eq("restaurant_id", restaurantId!)
        .order("shift_date", { ascending: false })
        .order("planned_start", { ascending: false })
        .limit(80) as unknown as { data: Shift[] | null; error: Error | null };
      if (result.error) throw result.error;
      return result.data ?? [];
    },
  });
}

export function useShiftAssignments(restaurantId: string | null, shiftIds: string[]) {
  return useQuery<ShiftAssignment[]>({
    queryKey: ["operations", "shift-assignments", restaurantId, shiftIds.join(",")],
    enabled: Boolean(restaurantId && shiftIds.length),
    staleTime: 10_000,
    queryFn: async () => {
      const result = await fromOperations("shift_assignments")
        .select("*")
        .eq("restaurant_id", restaurantId!)
        .in("shift_id", shiftIds) as unknown as { data: ShiftAssignment[] | null; error: Error | null };
      if (result.error) throw result.error;
      return result.data ?? [];
    },
  });
}

export function useShiftHandovers(restaurantId: string | null) {
  return useQuery<ShiftHandover[]>({
    queryKey: ["operations", "shift-handovers", restaurantId],
    enabled: Boolean(restaurantId),
    staleTime: 10_000,
    queryFn: async () => {
      const result = await fromOperations("shift_handovers")
        .select("*")
        .eq("restaurant_id", restaurantId!)
        .order("created_at", { ascending: false })
        .limit(100) as unknown as { data: ShiftHandover[] | null; error: Error | null };
      if (result.error) throw result.error;
      return result.data ?? [];
    },
  });
}

async function expectNoError(result: { error: Error | null }) {
  if (result.error) throw result.error;
}

export async function createOperationalRule(input: Omit<OperationalRule, "id" | "created_at" | "updated_at" | "rule_config"> & { rule_config?: Record<string, unknown> }) {
  const result = await fromOperations("operational_rules").insert({ ...input, rule_config: input.rule_config ?? {} }) as unknown as { error: Error | null };
  await expectNoError(result);
}

export async function updateOperationalRule(id: string, patch: Partial<Pick<OperationalRule, "name" | "enabled" | "priority" | "target_role" | "due_minutes" | "requires_approval" | "approval_role">>) {
  const result = await fromOperations("operational_rules").update(patch).eq("id", id) as unknown as { error: Error | null };
  await expectNoError(result);
}

export async function deleteOperationalRule(id: string) {
  const result = await fromOperations("operational_rules").delete().eq("id", id) as unknown as { error: Error | null };
  await expectNoError(result);
}

export async function createShift(input: Pick<Shift, "restaurant_id" | "name" | "shift_date" | "planned_start" | "planned_end" | "notes">) {
  const result = await fromOperations("shifts").insert(input).select("*").single();
  if (result.error) throw result.error;
  return result.data as Shift;
}

export async function openShift(id: string, staffId: string) {
  const result = await fromOperations("shifts").update({ status: "open", actual_opened_at: new Date().toISOString(), opened_by_staff_id: staffId }).eq("id", id) as unknown as { error: Error | null };
  await expectNoError(result);
}

export async function closeShift(id: string, staffId: string) {
  const result = await fromOperations("shifts").update({ status: "closed", actual_closed_at: new Date().toISOString(), closed_by_staff_id: staffId }).eq("id", id) as unknown as { error: Error | null };
  await expectNoError(result);
}

export async function assignStaffToShift(input: Pick<ShiftAssignment, "restaurant_id" | "shift_id" | "staff_id" | "role_snapshot" | "starts_at" | "ends_at">) {
  const result = await fromOperations("shift_assignments").insert({ ...input, status: "scheduled" }) as unknown as { error: Error | null };
  await expectNoError(result);
}

export async function updateShiftAssignment(id: string, patch: Partial<Pick<ShiftAssignment, "status" | "notes">>) {
  const result = await fromOperations("shift_assignments").update(patch).eq("id", id) as unknown as { error: Error | null };
  await expectNoError(result);
}

export async function removeShiftAssignment(id: string) {
  const result = await fromOperations("shift_assignments").delete().eq("id", id) as unknown as { error: Error | null };
  await expectNoError(result);
}

export async function createShiftHandover(input: Omit<ShiftHandover, "id" | "acknowledged_at" | "acknowledged_by_staff_id" | "created_at">) {
  const result = await fromOperations("shift_handovers").insert(input) as unknown as { error: Error | null };
  await expectNoError(result);
}

export async function acknowledgeShiftHandover(id: string, staffId: string) {
  const result = await fromOperations("shift_handovers").update({ acknowledged_at: new Date().toISOString(), acknowledged_by_staff_id: staffId }).eq("id", id) as unknown as { error: Error | null };
  await expectNoError(result);
}
