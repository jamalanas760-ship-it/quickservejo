import { useMemo, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowRightLeft,
  ArrowUpFromLine,
  Boxes,
  Download,
  History,
  LayoutDashboard,
  Package,
  Plus,
  Receipt,
  Search,
  Truck,
  WalletCards,
} from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAccess } from "@/hooks/useSession";
import { useRestaurant } from "@/hooks/useSuperAdmin";
import { useI18n } from "@/lib/i18n";
import { humanError } from "@/lib/errors";
import { formatMoney } from "@/lib/format";
import { logAudit, type AuditAction } from "@/lib/audit";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";

type Inventory = {
  id: string;
  restaurant_id?: string;
  name: string;
  unit: string;
  quantity: number | string;
  reorder_level: number | string;
};
type Supplier = { id: string; restaurant_id?: string; name: string; contact: string };
type Expense = {
  id: string;
  restaurant_id?: string;
  description: string;
  category: string;
  amount: number | string;
  expense_date: string;
  reference: string;
  created_at?: string;
};
type Movement = {
  id: string;
  restaurant_id?: string;
  item_id: string;
  supplier_id?: string | null;
  quantity: number | string;
  unit_cost: number | string;
  reason: string;
  created_at: string;
};
type FormKind = "item" | "supplier" | "expense" | "stock";
type Section = "overview" | "inventory" | "suppliers" | "finance";
type InventorySort = "name" | "quantity" | "risk";
type StockDirection = "in" | "out";
type ErpRelation = "erp_inventory_balances" | "erp_suppliers" | "erp_expenses" | "erp_stock_movements" | "erp_inventory";
type ErpWriteRelation = Exclude<ErpRelation, "erp_inventory_balances">;

const selectClass = "flex min-h-11 w-full rounded-xl border bg-background px-3 text-sm";
const UNITS = ["kg", "g", "l", "ml", "pcs", "box"] as const;
const EXPENSE_CATEGORIES = ["supplies", "rent", "utilities", "maintenance", "other"] as const;

// The generated Supabase file predates the additive ERP migration. Keep the runtime-name escape hatch local and narrow.
function erpFrom(table: ErpRelation) {
  return supabase.from(table as "orders");
}

function dateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function csvCell(value: unknown) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

export function OperationsManager({ restaurantId }: { restaurantId: string }) {
  const { lang } = useI18n();
  const ar = lang === "ar";
  const access = useAccess();
  const allowed = access.isSuperAdmin || access.membershipFor(restaurantId)?.role === "restaurant_admin";
  const restaurant = useRestaurant(restaurantId);
  const qc = useQueryClient();

  const [section, setSection] = useState<Section>("overview");
  const [form, setForm] = useState<FormKind | null>(null);
  const [stockDefaults, setStockDefaults] = useState<{ itemId?: string; direction?: StockDirection }>({});
  const [historyItemId, setHistoryItemId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [inventorySearch, setInventorySearch] = useState("");
  const [stockFilter, setStockFilter] = useState("all");
  const [unitFilter, setUnitFilter] = useState("all");
  const [inventorySort, setInventorySort] = useState<InventorySort>("name");
  const [supplierSearch, setSupplierSearch] = useState("");
  const [expenseSearch, setExpenseSearch] = useState("");
  const [expenseCategory, setExpenseCategory] = useState("all");
  const [expenseFrom, setExpenseFrom] = useState("");
  const [expenseTo, setExpenseTo] = useState("");

  const data = useQuery({
    queryKey: ["operations", restaurantId],
    enabled: allowed,
    queryFn: async () => {
      const results = await Promise.all([
        erpFrom("erp_inventory_balances").select("*").eq("restaurant_id", restaurantId).limit(1000),
        erpFrom("erp_suppliers").select("*").eq("restaurant_id", restaurantId).limit(1000),
        erpFrom("erp_expenses").select("*").eq("restaurant_id", restaurantId).limit(1000),
        erpFrom("erp_stock_movements").select("*").eq("restaurant_id", restaurantId).limit(1000),
      ]);
      for (const result of results) if (result.error) throw result.error;
      const inventory = ((results[0].data ?? []) as unknown as Inventory[]).sort((a, b) => a.name.localeCompare(b.name));
      const suppliers = ((results[1].data ?? []) as unknown as Supplier[]).sort((a, b) => a.name.localeCompare(b.name));
      const expenses = ((results[2].data ?? []) as unknown as Expense[]).sort((a, b) => b.expense_date.localeCompare(a.expense_date));
      const movements = ((results[3].data ?? []) as unknown as Movement[]).sort((a, b) => b.created_at.localeCompare(a.created_at));
      return { inventory, suppliers, expenses, movements };
    },
  });

  const inventory = data.data?.inventory ?? [];
  const suppliers = data.data?.suppliers ?? [];
  const expenses = data.data?.expenses ?? [];
  const movements = data.data?.movements ?? [];
  const currency = restaurant.data?.currency ?? "JOD";
  const lowStock = inventory.filter((item) => Number(item.quantity) <= Number(item.reorder_level));

  const latestCosts = useMemo(() => {
    const costs = new Map<string, number>();
    for (const movement of movements) {
      const cost = Number(movement.unit_cost);
      if (!costs.has(movement.item_id) && cost > 0) costs.set(movement.item_id, cost);
    }
    return costs;
  }, [movements]);

  const inventoryValue = inventory.reduce((sum, item) => {
    const cost = latestCosts.get(item.id);
    return cost === undefined ? sum : sum + Math.max(0, Number(item.quantity)) * cost;
  }, 0);
  const unvaluedItems = inventory.filter((item) => !latestCosts.has(item.id)).length;
  const today = dateKey();
  const monthStart = `${today.slice(0, 7)}-01`;
  const mtdExpenses = expenses.filter((expense) => expense.expense_date >= monthStart && expense.expense_date <= today).reduce((sum, expense) => sum + Number(expense.amount), 0);

  const filteredInventory = useMemo(() => {
    const needle = inventorySearch.trim().toLowerCase();
    return inventory
      .filter((item) => !needle || item.name.toLowerCase().includes(needle))
      .filter((item) => unitFilter === "all" || item.unit === unitFilter)
      .filter((item) => {
        if (stockFilter === "low") return Number(item.quantity) <= Number(item.reorder_level);
        if (stockFilter === "ok") return Number(item.quantity) > Number(item.reorder_level);
        return true;
      })
      .sort((a, b) => {
        if (inventorySort === "quantity") return Number(a.quantity) - Number(b.quantity);
        if (inventorySort === "risk") {
          const aGap = Number(a.quantity) - Number(a.reorder_level);
          const bGap = Number(b.quantity) - Number(b.reorder_level);
          return aGap - bGap;
        }
        return a.name.localeCompare(b.name);
      });
  }, [inventory, inventorySearch, inventorySort, stockFilter, unitFilter]);

  const filteredSuppliers = useMemo(() => {
    const needle = supplierSearch.trim().toLowerCase();
    return suppliers.filter((supplier) => !needle || `${supplier.name} ${supplier.contact}`.toLowerCase().includes(needle));
  }, [supplierSearch, suppliers]);

  const filteredExpenses = useMemo(() => {
    const needle = expenseSearch.trim().toLowerCase();
    return expenses.filter((expense) => {
      if (needle && !`${expense.description} ${expense.reference} ${expense.category}`.toLowerCase().includes(needle)) return false;
      if (expenseCategory !== "all" && expense.category !== expenseCategory) return false;
      if (expenseFrom && expense.expense_date < expenseFrom) return false;
      if (expenseTo && expense.expense_date > expenseTo) return false;
      return true;
    });
  }, [expenseCategory, expenseFrom, expenseSearch, expenseTo, expenses]);

  const expenseCategoryTotals = EXPENSE_CATEGORIES.map((category) => ({
    category,
    amount: filteredExpenses.filter((expense) => expense.category === category).reduce((sum, expense) => sum + Number(expense.amount), 0),
  })).filter((entry) => entry.amount > 0);

  const selectedHistoryItem = inventory.find((item) => item.id === historyItemId) ?? null;
  const selectedHistory = historyItemId ? movements.filter((movement) => movement.item_id === historyItemId) : [];

  const recentActivity = useMemo(() => {
    const stock = movements.slice(0, 12).map((movement) => ({
      id: `stock-${movement.id}`,
      date: movement.created_at,
      title: inventory.find((item) => item.id === movement.item_id)?.name ?? (ar ? "صنف مخزون" : "Inventory item"),
      detail: movement.reason,
      value: `${Number(movement.quantity) > 0 ? "+" : ""}${Number(movement.quantity).toLocaleString(lang)}`,
      kind: "stock" as const,
    }));
    const finance = expenses.slice(0, 12).map((expense) => ({
      id: `expense-${expense.id}`,
      date: expense.created_at ?? `${expense.expense_date}T00:00:00`,
      title: expense.description,
      detail: expense.category,
      value: formatMoney(Number(expense.amount), currency, lang),
      kind: "expense" as const,
    }));
    return [...stock, ...finance].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10);
  }, [ar, currency, expenses, inventory, lang, movements]);

  const titles: Record<FormKind, string> = {
    item: ar ? "صنف مخزون جديد" : "New inventory item",
    supplier: ar ? "مورد جديد" : "New supplier",
    expense: ar ? "تسجيل مصروف" : "Record expense",
    stock: ar ? "حركة مخزون" : "Stock movement",
  };

  function openStock(itemId?: string, direction: StockDirection = "in") {
    setStockDefaults({ itemId, direction });
    setForm("stock");
  }

  function closeForm() {
    if (busy) return;
    setForm(null);
    setStockDefaults({});
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form || busy) return;
    const values = new FormData(event.currentTarget);
    const text = (name: string) => String(values.get(name) ?? "").trim();
    const number = (name: string) => {
      const value = Number(text(name));
      if (!Number.isFinite(value)) throw new Error(ar ? "أدخل رقماً صحيحاً" : "Enter a valid number");
      return value;
    };

    setBusy(true);
    try {
      let table: ErpWriteRelation;
      let payload: Record<string, unknown>;
      let auditAction: AuditAction;
      let entity: string;
      let metadata: Record<string, unknown> = {};

      if (form === "item") {
        table = "erp_inventory";
        payload = { name: text("name"), unit: text("unit"), reorder_level: number("reorder") };
        auditAction = "erp.item_created";
        entity = "erp_inventory";
        metadata = { name: payload.name, unit: payload.unit, reorder_level: payload.reorder_level };
      } else if (form === "supplier") {
        table = "erp_suppliers";
        payload = { name: text("name"), contact: text("contact") };
        auditAction = "erp.supplier_created";
        entity = "erp_supplier";
        metadata = { name: payload.name };
      } else if (form === "expense") {
        table = "erp_expenses";
        payload = { description: text("description"), category: text("category"), amount: number("amount"), expense_date: text("date"), reference: text("reference") };
        auditAction = "erp.expense_recorded";
        entity = "erp_expense";
        metadata = { category: payload.category, amount: payload.amount, expense_date: payload.expense_date, reference: payload.reference };
      } else {
        const direction = text("direction") as StockDirection;
        const signedQuantity = number("quantity") * (direction === "out" ? -1 : 1);
        table = "erp_stock_movements";
        payload = { item_id: text("item"), supplier_id: text("supplier") || null, quantity: signedQuantity, unit_cost: number("cost"), reason: text("reason") };
        auditAction = direction === "out" ? "erp.stock_issued" : "erp.stock_received";
        entity = "erp_stock_movement";
        metadata = { item_id: payload.item_id, supplier_id: payload.supplier_id, quantity: signedQuantity, unit_cost: payload.unit_cost, reason: payload.reason };
      }

      const result = await erpFrom(table).insert({ ...payload, restaurant_id: restaurantId } as never).select("id").single();
      if (result.error) throw result.error;
      await logAudit(auditAction, { restaurantId, entity, entityId: result.data?.id, metadata });
      await qc.invalidateQueries({ queryKey: ["operations", restaurantId] });
      setForm(null);
      setStockDefaults({});
      toast.success(ar ? "تم حفظ السجل" : "Record saved");
    } catch (error) {
      toast.error(humanError(error, lang));
    } finally {
      setBusy(false);
    }
  }

  function exportExpenses() {
    if (!filteredExpenses.length || typeof document === "undefined") return;
    const header = ["Date", "Category", "Description", "Reference", `Amount (${currency})`];
    const rows = filteredExpenses.map((expense) => [expense.expense_date, expense.category, expense.description, expense.reference, Number(expense.amount)]);
    const csv = [header, ...rows].map((line) => line.map(csvCell).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `quickserve-expenses-${restaurantId}-${today}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function showThisMonth() {
    setExpenseFrom(monthStart);
    setExpenseTo(today);
  }

  if (access.isPending) return <Skeleton className="h-80 rounded-xl" />;
  if (!allowed) return <div role="alert" className="panel p-6 text-sm">{ar ? "هذه الصفحة متاحة للمدير فقط." : "Only administrators can access this page."}</div>;
  if (data.isError) return <div role="alert" className="panel space-y-3 p-6"><p>{humanError(data.error, lang)}</p><Button variant="outline" onClick={() => void data.refetch()}>{ar ? "إعادة المحاولة" : "Retry"}</Button></div>;

  return (
    <section className="space-y-6" dir={ar ? "rtl" : "ltr"}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2"><LayoutDashboard className="size-5 text-primary" /><p className="text-sm font-medium text-primary">{ar ? "ERP المطعم" : "Restaurant ERP"}</p></div>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight">{ar ? "المكتب الخلفي" : "Back Office"}</h2>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{ar ? "المخزون والموردون والمصروفات والتنبيهات التشغيلية في مساحة واحدة واضحة." : "Inventory, suppliers, expenses, and operational attention in one focused workspace."}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => openStock(undefined, "in")} disabled={!inventory.length}><ArrowDownToLine className="size-4" />{ar ? "استلام مخزون" : "Receive stock"}</Button>
          <Button onClick={() => setForm("expense")}><Receipt className="size-4" />{ar ? "تسجيل مصروف" : "Record expense"}</Button>
        </div>
      </div>

      <Tabs value={section} onValueChange={(value) => setSection(value as Section)}>
        <TabsList className="grid h-auto w-full grid-cols-2 gap-1 sm:grid-cols-4">
          <TabsTrigger value="overview" className="min-h-11"><LayoutDashboard className="size-4" />{ar ? "نظرة عامة" : "Overview"}</TabsTrigger>
          <TabsTrigger value="inventory" className="min-h-11"><Package className="size-4" />{ar ? "المخزون" : "Inventory"}</TabsTrigger>
          <TabsTrigger value="suppliers" className="min-h-11"><Truck className="size-4" />{ar ? "الموردون" : "Suppliers"}</TabsTrigger>
          <TabsTrigger value="finance" className="min-h-11"><WalletCards className="size-4" />{ar ? "المالية" : "Finance"}</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-5 space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric icon={Boxes} label={ar ? "أصناف المخزون" : "Inventory items"} value={inventory.length.toLocaleString(lang)} loading={data.isPending} />
            <Metric icon={AlertTriangle} label={ar ? "عند حد إعادة الطلب" : "At reorder level"} value={lowStock.length.toLocaleString(lang)} loading={data.isPending} attention={lowStock.length > 0} />
            <Metric icon={Package} label={ar ? "قيمة المخزون التقريبية" : "Approx. inventory value"} value={formatMoney(inventoryValue, currency, lang)} loading={data.isPending} note={unvaluedItems ? (ar ? `${unvaluedItems} أصناف بدون تكلفة حديثة` : `${unvaluedItems} items have no recent cost`) : undefined} />
            <Metric icon={Receipt} label={ar ? "مصروفات الشهر" : "Month-to-date expenses"} value={formatMoney(mtdExpenses, currency, lang)} loading={data.isPending} />
          </div>

          <div className="grid gap-5 xl:grid-cols-[1.05fr_.95fr]">
            <section className="panel p-5">
              <div className="flex items-center justify-between gap-3"><div><h3 className="font-semibold">{ar ? "المخزون الذي يحتاج إجراء" : "Stock requiring action"}</h3><p className="mt-1 text-xs text-muted-foreground">{ar ? "الأصناف عند أو تحت حد إعادة الطلب." : "Items at or below their reorder threshold."}</p></div><Badge variant={lowStock.length ? "destructive" : "secondary"}>{lowStock.length}</Badge></div>
              {!lowStock.length ? <Empty text={inventory.length ? (ar ? "لا توجد تنبيهات مخزون حالياً." : "No stock alerts right now.") : (ar ? "أضف أول صنف لبدء متابعة المخزون." : "Add your first inventory item to begin tracking stock.")} /> : <div className="mt-4 divide-y">{lowStock.slice(0, 8).map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><p className="font-medium">{item.name}</p><p className="mt-1 text-xs text-muted-foreground">{Number(item.quantity).toLocaleString(lang)} {item.unit} · {ar ? "إعادة الطلب عند" : "Reorder at"} {Number(item.reorder_level).toLocaleString(lang)} {item.unit}</p></div><div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => openStock(item.id, "out")} disabled={Number(item.quantity) <= 0}><ArrowUpFromLine className="size-4" />{ar ? "صرف" : "Issue"}</Button><Button size="sm" onClick={() => openStock(item.id, "in")}><ArrowDownToLine className="size-4" />{ar ? "استلام" : "Receive"}</Button></div></div>)}</div>}
            </section>

            <section className="panel p-5">
              <h3 className="font-semibold">{ar ? "النشاط الأخير" : "Recent activity"}</h3>
              <p className="mt-1 text-xs text-muted-foreground">{ar ? "آخر حركات المخزون والمصروفات المسجلة." : "Latest stock movements and recorded expenses."}</p>
              {!recentActivity.length ? <Empty text={ar ? "لا يوجد نشاط ERP بعد." : "No ERP activity yet."} /> : <div className="mt-4 divide-y">{recentActivity.map((activity) => <div key={activity.id} className="flex items-start justify-between gap-4 py-3"><div className="min-w-0"><div className="flex items-center gap-2"><span className={activity.kind === "stock" ? "grid size-7 place-items-center rounded-md bg-primary/10 text-primary" : "grid size-7 place-items-center rounded-md bg-muted text-muted-foreground"}>{activity.kind === "stock" ? <ArrowRightLeft className="size-3.5" /> : <Receipt className="size-3.5" />}</span><p className="truncate text-sm font-medium">{activity.title}</p></div><p className="mt-1 ps-9 text-xs text-muted-foreground">{activity.detail}</p><time className="mt-1 block ps-9 text-xs text-muted-foreground">{new Date(activity.date).toLocaleString(lang)}</time></div><span className="whitespace-nowrap text-sm font-semibold tabular-nums">{activity.value}</span></div>)}</div>}
            </section>
          </div>

          <section className="panel p-5">
            <h3 className="font-semibold">{ar ? "المراحل التالية في ERP" : "Next ERP modules"}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{ar ? "هذه الوحدات غير مفعّلة بعد ولن تعرض بيانات وهمية." : "These modules are not active yet and do not show placeholder business data."}</p>
            <div className="mt-4 flex flex-wrap gap-2"><Badge variant="outline">{ar ? "المشتريات · قريباً" : "Purchasing · coming next"}</Badge><Badge variant="outline">{ar ? "الوصفات وتكلفة الطعام · قريباً" : "Recipes & food cost · coming next"}</Badge><Badge variant="outline">{ar ? "التقارير · قريباً" : "Reports · coming next"}</Badge></div>
          </section>
        </TabsContent>

        <TabsContent value="inventory" className="mt-5 space-y-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
            <div className="relative min-w-0 flex-1"><Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input className="ps-9" value={inventorySearch} onChange={(e) => setInventorySearch(e.target.value)} placeholder={ar ? "البحث في المخزون…" : "Search inventory…"} /></div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:flex">
              <select className={selectClass} value={stockFilter} onChange={(e) => setStockFilter(e.target.value)} aria-label={ar ? "حالة المخزون" : "Stock status"}><option value="all">{ar ? "كل الحالات" : "All stock"}</option><option value="low">{ar ? "بحاجة إعادة طلب" : "Low stock"}</option><option value="ok">{ar ? "فوق الحد" : "Above reorder"}</option></select>
              <select className={selectClass} value={unitFilter} onChange={(e) => setUnitFilter(e.target.value)} aria-label={ar ? "الوحدة" : "Unit"}><option value="all">{ar ? "كل الوحدات" : "All units"}</option>{UNITS.map((unit) => <option value={unit} key={unit}>{unit}</option>)}</select>
              <select className={selectClass} value={inventorySort} onChange={(e) => setInventorySort(e.target.value as InventorySort)} aria-label={ar ? "الترتيب" : "Sort inventory"}><option value="name">{ar ? "الاسم" : "Name"}</option><option value="quantity">{ar ? "الكمية" : "Quantity"}</option><option value="risk">{ar ? "الأكثر حاجة" : "Most urgent"}</option></select>
            </div>
            <div className="flex gap-2"><Button variant="outline" onClick={() => openStock(undefined, "in")} disabled={!inventory.length}><ArrowRightLeft className="size-4" />{ar ? "استلام / صرف" : "Receive / issue"}</Button><Button onClick={() => setForm("item")}><Plus className="size-4" />{ar ? "إضافة صنف" : "Add item"}</Button></div>
          </div>

          {data.isPending ? <Skeleton className="h-72 rounded-xl" /> : !filteredInventory.length ? <Empty text={inventory.length ? (ar ? "لا توجد نتائج مطابقة للفلاتر." : "No inventory items match these filters.") : (ar ? "أضف أول صنف لبدء تتبع المخزون." : "Add your first item to start tracking stock.")} /> : <>
            <div className="hidden overflow-x-auto rounded-xl border bg-card md:block">
              <table className="w-full min-w-[860px] text-sm"><thead className="border-b bg-muted/40 text-xs text-muted-foreground"><tr><th className="px-4 py-3 text-start font-medium">{ar ? "الصنف" : "Item"}</th><th className="px-4 py-3 text-end font-medium">{ar ? "الكمية" : "Quantity"}</th><th className="px-4 py-3 text-start font-medium">{ar ? "الوحدة" : "Unit"}</th><th className="px-4 py-3 text-end font-medium">{ar ? "حد إعادة الطلب" : "Reorder level"}</th><th className="px-4 py-3 text-start font-medium">{ar ? "الحالة" : "Status"}</th><th className="px-4 py-3 text-end font-medium">{ar ? "إجراءات" : "Actions"}</th></tr></thead><tbody className="divide-y">{filteredInventory.map((item) => { const isLow = Number(item.quantity) <= Number(item.reorder_level); return <tr key={item.id} className="hover:bg-muted/30"><td className="px-4 py-4 font-medium">{item.name}</td><td className="px-4 py-4 text-end font-semibold tabular-nums">{Number(item.quantity).toLocaleString(lang)}</td><td className="px-4 py-4">{item.unit}</td><td className="px-4 py-4 text-end tabular-nums">{Number(item.reorder_level).toLocaleString(lang)}</td><td className="px-4 py-4"><Badge variant={isLow ? "destructive" : "secondary"}>{isLow ? (ar ? "إعادة طلب" : "Reorder") : (ar ? "جيد" : "In range")}</Badge></td><td className="px-4 py-4"><div className="flex justify-end gap-1"><Button size="sm" variant="ghost" onClick={() => setHistoryItemId(item.id)}><History className="size-4" />{ar ? "السجل" : "History"}</Button><Button size="sm" variant="outline" onClick={() => openStock(item.id, "out")} disabled={Number(item.quantity) <= 0}><ArrowUpFromLine className="size-4" />{ar ? "صرف" : "Issue"}</Button><Button size="sm" onClick={() => openStock(item.id, "in")}><ArrowDownToLine className="size-4" />{ar ? "استلام" : "Receive"}</Button></div></td></tr>; })}</tbody></table>
            </div>
            <div className="grid gap-3 md:hidden">{filteredInventory.map((item) => { const isLow = Number(item.quantity) <= Number(item.reorder_level); return <article className="panel p-4" key={item.id}><div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold">{item.name}</h3><p className="mt-1 text-xs text-muted-foreground">{ar ? "إعادة الطلب عند" : "Reorder at"} {Number(item.reorder_level).toLocaleString(lang)} {item.unit}</p></div><Badge variant={isLow ? "destructive" : "secondary"}>{isLow ? (ar ? "إعادة طلب" : "Reorder") : (ar ? "جيد" : "In range")}</Badge></div><p className="mt-5 text-2xl font-semibold tabular-nums">{Number(item.quantity).toLocaleString(lang)} <span className="text-sm font-normal text-muted-foreground">{item.unit}</span></p><div className="mt-4 grid grid-cols-3 gap-2"><Button size="sm" variant="ghost" onClick={() => setHistoryItemId(item.id)}><History className="size-4" /></Button><Button size="sm" variant="outline" onClick={() => openStock(item.id, "out")} disabled={Number(item.quantity) <= 0}><ArrowUpFromLine className="size-4" />{ar ? "صرف" : "Issue"}</Button><Button size="sm" onClick={() => openStock(item.id, "in")}><ArrowDownToLine className="size-4" />{ar ? "استلام" : "Receive"}</Button></div></article>; })}</div>
          </>}
        </TabsContent>

        <TabsContent value="suppliers" className="mt-5 space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row"><div className="relative flex-1"><Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input className="ps-9" value={supplierSearch} onChange={(e) => setSupplierSearch(e.target.value)} placeholder={ar ? "البحث باسم المورد أو بيانات التواصل…" : "Search supplier or contact details…"} /></div><Button onClick={() => setForm("supplier")}><Plus className="size-4" />{ar ? "إضافة مورد" : "Add supplier"}</Button></div>
          {!filteredSuppliers.length ? <Empty text={suppliers.length ? (ar ? "لا يوجد مورد مطابق للبحث." : "No supplier matches your search.") : (ar ? "أضف الموردين لتربطهم باستلام المخزون." : "Add suppliers to connect them to stock receipts.")} /> : <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{filteredSuppliers.map((supplier) => <article key={supplier.id} className="panel p-5"><div className="flex items-center gap-3"><div className="grid size-10 place-items-center rounded-lg bg-primary/10 text-primary"><Truck className="size-5" /></div><div className="min-w-0"><h3 className="truncate font-semibold">{supplier.name}</h3><p className="mt-1 text-xs text-muted-foreground">{ar ? "مورد" : "Supplier"}</p></div></div><p className="mt-4 whitespace-pre-wrap text-sm text-muted-foreground">{supplier.contact || (ar ? "لا توجد بيانات تواصل" : "No contact details")}</p></article>)}</div>}
        </TabsContent>

        <TabsContent value="finance" className="mt-5 space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric icon={Receipt} label={ar ? "مصروفات الشهر" : "Month-to-date"} value={formatMoney(mtdExpenses, currency, lang)} loading={data.isPending} /><Metric icon={WalletCards} label={ar ? "السجلات المفلترة" : "Filtered records"} value={filteredExpenses.length.toLocaleString(lang)} loading={data.isPending} /><Metric icon={Receipt} label={ar ? "إجمالي الفلتر" : "Filtered total"} value={formatMoney(filteredExpenses.reduce((sum, expense) => sum + Number(expense.amount), 0), currency, lang)} loading={data.isPending} /><Metric icon={Truck} label={ar ? "الموردون" : "Suppliers"} value={suppliers.length.toLocaleString(lang)} loading={data.isPending} /></div>
          <div className="panel space-y-3 p-4"><div className="grid gap-2 lg:grid-cols-[2fr_1fr_1fr_1fr_auto]"><div className="relative"><Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input className="ps-9" value={expenseSearch} onChange={(e) => setExpenseSearch(e.target.value)} placeholder={ar ? "البحث في الوصف أو المرجع…" : "Search description or reference…"} /></div><select className={selectClass} value={expenseCategory} onChange={(e) => setExpenseCategory(e.target.value)}><option value="all">{ar ? "كل التصنيفات" : "All categories"}</option>{EXPENSE_CATEGORIES.map((category) => <option key={category} value={category}>{expenseCategoryLabel(category, ar)}</option>)}</select><Input type="date" value={expenseFrom} onChange={(e) => setExpenseFrom(e.target.value)} aria-label={ar ? "من تاريخ" : "From date"} /><Input type="date" value={expenseTo} onChange={(e) => setExpenseTo(e.target.value)} aria-label={ar ? "إلى تاريخ" : "To date"} /><Button variant="outline" onClick={showThisMonth}>{ar ? "هذا الشهر" : "This month"}</Button></div><div className="flex flex-wrap justify-end gap-2"><Button variant="outline" onClick={exportExpenses} disabled={!filteredExpenses.length}><Download className="size-4" />{ar ? "تصدير CSV" : "Export CSV"}</Button><Button onClick={() => setForm("expense")}><Receipt className="size-4" />{ar ? "تسجيل مصروف" : "Record expense"}</Button></div></div>

          {expenseCategoryTotals.length > 0 && <div className="flex flex-wrap gap-2">{expenseCategoryTotals.map((entry) => <div key={entry.category} className="rounded-lg border bg-card px-3 py-2 text-sm"><span className="text-muted-foreground">{expenseCategoryLabel(entry.category, ar)}</span><strong className="ms-2">{formatMoney(entry.amount, currency, lang)}</strong></div>)}</div>}

          {!filteredExpenses.length ? <Empty text={expenses.length ? (ar ? "لا توجد مصروفات مطابقة للفلاتر." : "No expenses match these filters.") : (ar ? "لا توجد مصروفات مسجلة بعد." : "No expenses recorded yet.")} /> : <div className="overflow-hidden rounded-xl border bg-card"><div className="divide-y">{filteredExpenses.map((expense) => <article key={expense.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-medium">{expense.description}</h3><Badge variant="outline">{expenseCategoryLabel(expense.category, ar)}</Badge></div><p className="mt-1 text-xs text-muted-foreground">{expense.expense_date}{expense.reference ? ` · ${expense.reference}` : ""}</p></div><p className="whitespace-nowrap font-semibold tabular-nums">{formatMoney(Number(expense.amount), currency, lang)}</p></article>)}</div></div>}
        </TabsContent>
      </Tabs>

      <Sheet open={Boolean(historyItemId)} onOpenChange={(open) => { if (!open) setHistoryItemId(null); }}>
        <SheetContent side={ar ? "left" : "right"} className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader><SheetTitle>{selectedHistoryItem?.name ?? (ar ? "سجل الصنف" : "Item history")}</SheetTitle><SheetDescription>{ar ? "سجل حركات غير قابل للحذف أو التعديل." : "Append-only movement history; corrections use a new reversing movement."}</SheetDescription></SheetHeader>
          <div className="mt-6 space-y-3">{!selectedHistory.length ? <Empty text={ar ? "لا توجد حركات لهذا الصنف بعد." : "No movements for this item yet."} /> : selectedHistory.map((movement) => <article key={movement.id} className="rounded-xl border p-4"><div className="flex items-center justify-between gap-3"><Badge variant={Number(movement.quantity) < 0 ? "outline" : "secondary"}>{Number(movement.quantity) < 0 ? (ar ? "صرف" : "Issue") : (ar ? "استلام" : "Receive")}</Badge><strong className="tabular-nums">{Number(movement.quantity) > 0 ? "+" : ""}{Number(movement.quantity).toLocaleString(lang)} {selectedHistoryItem?.unit}</strong></div><p className="mt-3 text-sm">{movement.reason}</p><div className="mt-2 flex flex-wrap justify-between gap-2 text-xs text-muted-foreground"><span>{ar ? "تكلفة الوحدة" : "Unit cost"}: {formatMoney(Number(movement.unit_cost), currency, lang)}</span><time>{new Date(movement.created_at).toLocaleString(lang)}</time></div></article>)}</div>
        </SheetContent>
      </Sheet>

      <Dialog open={form !== null} onOpenChange={(open) => { if (!open) closeForm(); }}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg" dir={ar ? "rtl" : "ltr"}>
          <DialogHeader><DialogTitle>{form ? titles[form] : ""}</DialogTitle><DialogDescription>{form === "stock" || form === "expense" ? (ar ? "هذا السجل يضاف إلى الدفتر ولا يتم تعديل الحركة الأصلية لاحقاً." : "This is appended to the ledger; the original entry is not edited later.") : (ar ? "تحقق من البيانات قبل الحفظ." : "Check the details before saving.")}</DialogDescription></DialogHeader>
          <form key={`${form ?? "none"}-${stockDefaults.itemId ?? ""}-${stockDefaults.direction ?? ""}`} onSubmit={save} className="space-y-4">
            {form === "item" || form === "supplier" ? <label className="block space-y-2 text-sm"><span>{ar ? "الاسم" : "Name"}</span><Input name="name" required maxLength={160} /></label> : null}
            {form === "item" ? <><label className="block space-y-2 text-sm"><span>{ar ? "الوحدة" : "Unit"}</span><select name="unit" className={selectClass}>{UNITS.map((unit) => <option key={unit}>{unit}</option>)}</select></label><label className="block space-y-2 text-sm"><span>{ar ? "حد إعادة الطلب" : "Reorder level"}</span><Input name="reorder" required type="number" min="0" step="0.001" defaultValue="0" /></label></> : null}
            {form === "supplier" ? <label className="block space-y-2 text-sm"><span>{ar ? "بيانات التواصل" : "Contact details"}</span><Input name="contact" maxLength={250} /></label> : null}
            {form === "stock" ? <><label className="block space-y-2 text-sm"><span>{ar ? "الصنف" : "Item"}</span><select name="item" className={selectClass} required defaultValue={stockDefaults.itemId ?? inventory[0]?.id}>{inventory.map((item) => <option value={item.id} key={item.id}>{item.name} ({item.unit})</option>)}</select></label><label className="block space-y-2 text-sm"><span>{ar ? "نوع الحركة" : "Movement"}</span><select name="direction" className={selectClass} defaultValue={stockDefaults.direction ?? "in"}><option value="in">{ar ? "استلام / رصيد افتتاحي" : "Receive / opening stock"}</option><option value="out">{ar ? "صرف / هدر" : "Issue / waste"}</option></select></label><label className="block space-y-2 text-sm"><span>{ar ? "الكمية" : "Quantity"}</span><Input required name="quantity" type="number" min="0.001" step="0.001" /></label><label className="block space-y-2 text-sm"><span>{ar ? "المورد (اختياري)" : "Supplier (optional)"}</span><select name="supplier" className={selectClass}><option value="">—</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></label><label className="block space-y-2 text-sm"><span>{ar ? "تكلفة الوحدة" : "Unit cost"} ({currency})</span><Input name="cost" type="number" min="0" step="0.001" defaultValue="0" required /></label><label className="block space-y-2 text-sm"><span>{ar ? "السبب / مرجع الفاتورة" : "Reason / invoice reference"}</span><Input name="reason" required maxLength={250} /></label><p className="text-xs text-muted-foreground">{ar ? "حركة المخزون لا تسجل مصروفاً تلقائياً. النظام يمنع الرصيد السالب من قاعدة البيانات." : "Stock movements do not automatically post an expense. Negative stock remains database-protected."}</p></> : null}
            {form === "expense" ? <><label className="block space-y-2 text-sm"><span>{ar ? "الوصف" : "Description"}</span><Input name="description" required maxLength={250} /></label><label className="block space-y-2 text-sm"><span>{ar ? "التصنيف" : "Category"}</span><select name="category" className={selectClass}>{EXPENSE_CATEGORIES.map((category) => <option key={category} value={category}>{expenseCategoryLabel(category, ar)}</option>)}</select></label><label className="block space-y-2 text-sm"><span>{ar ? "المبلغ" : "Amount"} ({currency})</span><Input name="amount" type="number" min="0.001" step="0.001" required /></label><label className="block space-y-2 text-sm"><span>{ar ? "التاريخ" : "Date"}</span><Input name="date" type="date" defaultValue={today} required /></label><label className="block space-y-2 text-sm"><span>{ar ? "مرجع الفاتورة" : "Invoice reference"}</span><Input name="reference" maxLength={100} /></label></> : null}
            <Button className="min-h-11 w-full" disabled={busy}>{busy ? (ar ? "جارٍ الحفظ…" : "Saving…") : (ar ? "حفظ" : "Save record")}</Button>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function Metric({ icon: Icon, label, value, loading, note, attention = false }: { icon: typeof Package; label: string; value: string; loading: boolean; note?: string; attention?: boolean }) {
  return <div className="panel p-5"><div className="flex items-start gap-3"><div className={attention ? "grid size-10 shrink-0 place-items-center rounded-lg bg-amber-100 text-amber-800" : "grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"}><Icon className="size-5" /></div><div className="min-w-0"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-xl font-semibold tabular-nums">{loading ? "—" : value}</p>{note ? <p className="mt-1 text-xs text-muted-foreground">{note}</p> : null}</div></div></div>;
}

function Empty({ text }: { text: string }) {
  return <div className="grid min-h-36 place-items-center rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">{text}</div>;
}

function expenseCategoryLabel(category: string, ar: boolean) {
  const labels: Record<string, [string, string]> = {
    supplies: ["Supplies", "مستلزمات"],
    rent: ["Rent", "إيجار"],
    utilities: ["Utilities", "خدمات"],
    maintenance: ["Maintenance", "صيانة"],
    other: ["Other", "أخرى"],
  };
  const label = labels[category] ?? [category, category];
  return ar ? label[1] : label[0];
}
