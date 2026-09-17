import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";

import {
  erpInsert,
  erpSelect,
  isLowStock,
  monthStartDate,
  stockValuation,
  sumBy,
  type Expense,
  type InventoryBalance,
  type StockMovement,
  type Supplier,
} from "@/lib/erp";
import { logAudit } from "@/lib/audit";

export type BackOfficeData = { inventory: InventoryBalance[]; suppliers: Supplier[]; movements: StockMovement[]; expenses: Expense[] };
export type BackOfficeAccess = { inventory: boolean; procurement: boolean; finance: boolean };

export function backOfficeKey(restaurantId: string) { return ["back-office", restaurantId] as const; }

export function useBackOffice(restaurantId: string, access: BackOfficeAccess, enabled = true) {
  return useQuery<BackOfficeData>({
    queryKey: [...backOfficeKey(restaurantId), access.inventory, access.procurement, access.finance],
    enabled: enabled && Boolean(restaurantId) && (access.inventory || access.procurement || access.finance),
    staleTime: 15_000,
    queryFn: async () => {
      const [inventory, suppliers, movements, expenses] = await Promise.all([
        access.inventory ? erpSelect<InventoryBalance>("erp_inventory_balances", (q) => q.select("id,name,unit,reorder_level,quantity").eq("restaurant_id", restaurantId).order("name").limit(2000)) : Promise.resolve([]),
        access.procurement || access.inventory ? erpSelect<Supplier>("erp_suppliers", (q) => q.select("id,name,contact,created_at").eq("restaurant_id", restaurantId).order("name").limit(1000)) : Promise.resolve([]),
        access.inventory ? erpSelect<StockMovement>("erp_stock_movements", (q) => q.select("id,item_id,supplier_id,quantity,unit_cost,total_cost,movement_type,finance_expense_id,reason,created_at").eq("restaurant_id", restaurantId).order("created_at", { ascending: false }).limit(500)) : Promise.resolve([]),
        access.finance ? erpSelect<Expense>("erp_expenses", (q) => q.select("id,description,category,amount,expense_date,reference,source_type,source_id,supplier_id,created_at").eq("restaurant_id", restaurantId).order("expense_date", { ascending: false }).limit(500)) : Promise.resolve([]),
      ]);
      return { inventory, suppliers, movements, expenses };
    },
  });
}

export function backOfficeSummary(data: BackOfficeData | undefined) {
  const inventory = data?.inventory ?? [];
  const movements = data?.movements ?? [];
  const expenses = data?.expenses ?? [];
  const monthStart = monthStartDate();
  const monthExpenses = expenses.filter((e) => e.expense_date >= monthStart);
  const lowStock = inventory.filter(isLowStock).sort((a, b) => Number(a.quantity) - Number(b.quantity) || a.name.localeCompare(b.name));
  const valuation = stockValuation(inventory, movements);
  const byCategory = new Map<string, number>();
  for (const expense of monthExpenses) byCategory.set(expense.category, (byCategory.get(expense.category) ?? 0) + Number(expense.amount));
  return {
    itemCount: inventory.length,
    supplierCount: data?.suppliers.length ?? 0,
    lowStock,
    valuation,
    monthTotal: sumBy(monthExpenses, (e) => Number(e.amount)),
    monthCount: monthExpenses.length,
    monthByCategory: [...byCategory.entries()].sort((a, b) => b[1] - a[1]),
    isEmpty: inventory.length === 0 && expenses.length === 0 && (data?.suppliers.length ?? 0) === 0,
  };
}

export type BackOfficeWrite =
  | { kind: "item"; name: string; unit: string; reorder_level: number }
  | { kind: "supplier"; name: string; contact: string }
  | { kind: "expense"; description: string; category: string; amount: number; expense_date: string; reference: string }
  | { kind: "movement"; item_id: string; supplier_id: string | null; quantity: number; unit_cost: number; movement_type: "receipt" | "issue" | "adjustment" | "transfer" | "waste"; reason: string };

/** All Back Office writes go through here so audit logging stays consistent. */
export function useBackOfficeWrite(restaurantId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: BackOfficeWrite) => {
      if (input.kind === "item") {
        await erpInsert("erp_inventory", restaurantId, { name: input.name, unit: input.unit, reorder_level: input.reorder_level });
        return { action: "erp.item_created" as const, entity: "erp_inventory", metadata: { name: input.name } };
      }
      if (input.kind === "supplier") {
        await erpInsert("erp_suppliers", restaurantId, { name: input.name, contact: input.contact });
        return { action: "erp.supplier_created" as const, entity: "erp_suppliers", metadata: { name: input.name } };
      }
      if (input.kind === "expense") {
        await erpInsert("erp_expenses", restaurantId, { description: input.description, category: input.category, amount: input.amount, expense_date: input.expense_date, reference: input.reference });
        return { action: "erp.expense_recorded" as const, entity: "erp_expenses", metadata: { amount: input.amount, category: input.category } };
      }
      await erpInsert("erp_stock_movements", restaurantId, {
        item_id: input.item_id,
        supplier_id: input.supplier_id,
        quantity: input.quantity,
        unit_cost: input.unit_cost,
        movement_type: input.movement_type,
        reason: input.reason,
      });
      return {
        action: input.quantity > 0 ? ("erp.stock_received" as const) : ("erp.stock_issued" as const),
        entity: "erp_stock_movements",
        metadata: { itemId: input.item_id, quantity: input.quantity, unitCost: input.unit_cost, totalCost: Math.abs(input.quantity) * input.unit_cost, movementType: input.movement_type },
      };
    },
    onSuccess: async (result) => {
      void logAudit(result.action, { restaurantId, entity: result.entity, metadata: result.metadata });
      await queryClient.invalidateQueries({ queryKey: backOfficeKey(restaurantId) });
      await queryClient.invalidateQueries({ queryKey: ["platform", "erp-signals"] });
    },
  });
}
