/**
 * Back Office (ERP) data layer.
 *
 * The `erp_*` tables were added by migrations that can post-date generated
 * Supabase types, so this module owns the narrow boundary cast.
 */
import { supabase } from "@/integrations/supabase/client";
import type { Language } from "@/lib/i18n";

export type ErpUnit = "kg" | "g" | "l" | "ml" | "pcs" | "box";
export const ERP_UNITS: ErpUnit[] = ["kg", "g", "l", "ml", "pcs", "box"];

export type ExpenseCategory = "supplies" | "rent" | "utilities" | "maintenance" | "other";
export const EXPENSE_CATEGORIES: { value: ExpenseCategory; en: string; ar: string }[] = [
  { value: "supplies", en: "Supplies", ar: "مستلزمات" },
  { value: "rent", en: "Rent", ar: "إيجار" },
  { value: "utilities", en: "Utilities", ar: "خدمات" },
  { value: "maintenance", en: "Maintenance", ar: "صيانة" },
  { value: "other", en: "Other", ar: "أخرى" },
];
export function expenseCategoryLabel(value: string, lang: Language): string {
  const match = EXPENSE_CATEGORIES.find((c) => c.value === value);
  if (!match) return value;
  return lang === "ar" ? match.ar : match.en;
}

export type InventoryBalance = { id: string; name: string; unit: ErpUnit; reorder_level: number; quantity: number };
export type Supplier = { id: string; name: string; contact: string; created_at: string };
export type ProcurementStatus = "requested" | "approved" | "rejected" | "ordered" | "received" | "cancelled";
export type ProcurementRequest = {
  id: string;
  restaurant_id: string;
  item_id: string | null;
  item_name_snapshot: string;
  quantity: number;
  unit: string;
  estimated_unit_cost: number;
  actual_unit_cost: number | null;
  supplier_id: string | null;
  status: ProcurementStatus;
  needed_by: string | null;
  notes: string;
  po_reference: string;
  requested_by: string;
  approved_by: string | null;
  approved_at: string | null;
  ordered_at: string | null;
  received_at: string | null;
  stock_movement_id: string | null;
  finance_expense_id: string | null;
  created_at: string;
  updated_at: string;
};
export type StockMovement = {
  id: string;
  item_id: string;
  supplier_id: string | null;
  quantity: number;
  unit_cost: number;
  total_cost?: number;
  movement_type?: "receipt" | "issue" | "adjustment" | "transfer" | "waste";
  finance_expense_id?: string | null;
  reason: string;
  created_at: string;
};
export type Expense = {
  id: string;
  description: string;
  category: string;
  amount: number;
  expense_date: string;
  reference: string;
  source_type?: string | null;
  source_id?: string | null;
  supplier_id?: string | null;
  created_at: string;
};

export type ErpTableName = "erp_inventory" | "erp_inventory_balances" | "erp_suppliers" | "erp_stock_movements" | "erp_expenses" | "erp_procurement_requests";
type ErpResponse = { data: unknown; error: { message: string } | null };
interface ErpBuilder extends PromiseLike<ErpResponse> {
  select(columns: string): ErpBuilder;
  insert(payload: Record<string, unknown>): ErpBuilder;
  eq(column: string, value: unknown): ErpBuilder;
  gte(column: string, value: unknown): ErpBuilder;
  lt(column: string, value: unknown): ErpBuilder;
  in(column: string, values: unknown[]): ErpBuilder;
  order(column: string, options?: { ascending?: boolean }): ErpBuilder;
  limit(count: number): ErpBuilder;
}
function erpFrom(table: ErpTableName): ErpBuilder { return (supabase as unknown as { from(table: string): ErpBuilder }).from(table); }
export async function erpSelect<T>(table: ErpTableName, build: (query: ErpBuilder) => ErpBuilder): Promise<T[]> {
  const { data, error } = await build(erpFrom(table));
  if (error) throw error;
  return (data ?? []) as T[];
}
export async function erpInsert(table: Exclude<ErpTableName, "erp_inventory_balances">, restaurantId: string, payload: Record<string, unknown>): Promise<void> {
  const { error } = await erpFrom(table).insert({ ...payload, restaurant_id: restaurantId }).select("id");
  if (error) throw error;
}
export async function setProcurementStatus(id: string, status: Exclude<ProcurementStatus, "requested" | "received">, poReference?: string): Promise<void> {
  const { error } = await (supabase as any).rpc("erp_set_procurement_status", {
    _request_id: id,
    _status: status,
    _po_reference: poReference ?? null,
  });
  if (error) throw error;
}

export async function archiveInventoryItem(id: string): Promise<void> {
  const { error } = await (supabase as any).rpc("erp_delete_inventory_item", { _item_id: id });
  if (error) throw error;
}

export async function receiveProcurementRequest(id: string, unitCost?: number): Promise<string | null> {
  const { data, error } = await (supabase as any).rpc("erp_receive_procurement_request", {
    _request_id: id,
    _unit_cost: unitCost ?? null,
  });
  if (error) throw error;
  return data as string | null;
}

export function isLowStock(item: InventoryBalance): boolean { return Number(item.quantity) <= Number(item.reorder_level); }
export function stockValuation(items: InventoryBalance[], movements: StockMovement[]): { value: number; pricedItems: number; itemsWithoutCost: number } {
  const latestCost = new Map<string, number>();
  for (const movement of [...movements].sort((a, b) => b.created_at.localeCompare(a.created_at))) {
    const cost = Number(movement.unit_cost);
    if (cost > 0 && !latestCost.has(movement.item_id)) latestCost.set(movement.item_id, cost);
  }
  let value = 0;
  let pricedItems = 0;
  let itemsWithoutCost = 0;
  for (const item of items) {
    const cost = latestCost.get(item.id);
    if (cost === undefined) { if (Number(item.quantity) > 0) itemsWithoutCost += 1; continue; }
    value += cost * Number(item.quantity);
    pricedItems += 1;
  }
  return { value, pricedItems, itemsWithoutCost };
}
export function monthStartDate(): string {
  const now = new Date();
  return `${now.getFullYear()}-${`${now.getMonth() + 1}`.padStart(2, "0")}-01`;
}
export function sumBy<T>(rows: T[], value: (row: T) => number): number { return rows.reduce((total, row) => total + value(row), 0); }
export function downloadCsv(filename: string, headers: string[], rows: (string | number)[][]): void {
  const escape = (cell: string | number) => { const text = String(cell ?? ""); return /[",\n;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text; };
  const csv = [headers, ...rows].map((row) => row.map(escape).join(",")).join("\r\n");
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a"); link.href = url; link.download = filename; link.click(); URL.revokeObjectURL(url);
}
