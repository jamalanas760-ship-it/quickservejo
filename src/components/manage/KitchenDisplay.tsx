import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChefHat, Clock3, Flame, PackageCheck } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { formatDateTime } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { humanError } from "@/lib/errors";

type KitchenOrder = { id: string; order_number: string; status: string; created_at: string; customer_notes: string | null; table: { table_number: string; table_name: string | null } | null };
type KitchenItem = { id: string; order_id: string; product_name_snapshot_en: string; product_name_snapshot_ar: string; quantity: number; notes: string | null; selected_modifiers: unknown };

const STAGES = [
  { id: "new", label: "New", ar: "جديد", icon: Clock3, next: "accepted" },
  { id: "accepted", label: "Accepted", ar: "مقبول", icon: ChefHat, next: "preparing" },
  { id: "preparing", label: "Preparing", ar: "قيد التحضير", icon: Flame, next: "ready" },
  { id: "ready", label: "Ready", ar: "جاهز", icon: PackageCheck, next: "served" },
] as const;

export function KitchenDisplay({ restaurantId }: { restaurantId: string }) {
  const { lang } = useI18n();
  const queryClient = useQueryClient();
  const orders = useQuery<KitchenOrder[]>({
    queryKey: ["kitchen-orders", restaurantId],
    refetchInterval: 3000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, order_number, status, created_at, customer_notes, table:restaurant_tables(table_number, table_name)")
        .eq("restaurant_id", restaurantId)
        .in("status", ["new", "accepted", "preparing", "ready"])
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as KitchenOrder[];
    },
  });

  const items = useQuery<KitchenItem[]>({
    queryKey: ["kitchen-order-items", restaurantId, orders.data?.map((order) => order.id).join(",")],
    enabled: Boolean(orders.data?.length),
    queryFn: async () => {
      const ids = (orders.data ?? []).map((order) => order.id);
      const { data, error } = await supabase.from("order_items").select("id, order_id, product_name_snapshot_en, product_name_snapshot_ar, quantity, notes, selected_modifiers").in("order_id", ids);
      if (error) throw error;
      return (data ?? []) as unknown as KitchenItem[];
    },
  });

  const byOrder = useMemo(() => {
    const map = new Map<string, KitchenItem[]>();
    for (const item of items.data ?? []) map.set(item.order_id, [...(map.get(item.order_id) ?? []), item]);
    return map;
  }, [items.data]);

  async function advance(order: KitchenOrder) {
    const stage = STAGES.find((item) => item.id === order.status);
    if (!stage) return;
    try {
      const { error } = await supabase.from("orders").update({ status: stage.next }).eq("id", order.id).eq("restaurant_id", restaurantId);
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ["kitchen-orders", restaurantId] });
      toast.success(lang === "ar" ? "تم تحديث حالة الطلب" : "Order updated");
    } catch (error) {
      toast.error(humanError(error, lang));
    }
  }

  return <div className="space-y-5">
    <header className="flex flex-wrap items-end justify-between gap-3"><div><div className="flex items-center gap-2"><ChefHat className="size-6"/><h1 className="text-[28px] font-bold tracking-[-0.04em]">Kitchen Display</h1></div><p className="mt-1 text-sm text-muted-foreground">{lang === "ar" ? "الطلبات الجديدة من QR تصل هنا تلقائياً." : "Orders submitted from table QR menus appear here automatically."}</p></div><Badge variant="secondary" className="rounded-full">Live · refreshes every 3s</Badge></header>
    {orders.isPending ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{[1,2,3,4].map((n) => <Skeleton key={n} className="h-72 rounded-3xl"/>)}</div> : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{STAGES.map((stage) => { const StageIcon = stage.icon; const rows = (orders.data ?? []).filter((order) => order.status === stage.id); return <section key={stage.id} className="rounded-3xl border bg-muted/20 p-3"><div className="flex items-center justify-between px-2 py-2"><div className="flex items-center gap-2 font-bold"><StageIcon className="size-4"/>{lang === "ar" ? stage.ar : stage.label}</div><Badge variant="secondary">{rows.length}</Badge></div><div className="mt-2 space-y-3">{rows.map((order) => { const orderItems = byOrder.get(order.id) ?? []; return <article key={order.id} className="rounded-2xl border bg-card p-4 shadow-sm"><div className="flex items-start justify-between gap-2"><div><p className="text-lg font-black tabular-nums">#{order.order_number}</p><p className="text-xs text-muted-foreground">{order.table ? `${lang === "ar" ? "طاولة" : "Table"} ${order.table.table_name || order.table.table_number}` : "Pickup / Browse"}</p></div><span className="text-[11px] font-medium text-muted-foreground">{formatDateTime(order.created_at, lang)}</span></div><div className="mt-4 space-y-2">{orderItems.map((item) => <div key={item.id} className="rounded-xl bg-muted/70 p-2.5"><div className="flex gap-2"><span className="font-black">×{item.quantity}</span><span className="min-w-0 flex-1 text-sm font-semibold">{lang === "ar" ? item.product_name_snapshot_ar || item.product_name_snapshot_en : item.product_name_snapshot_en || item.product_name_snapshot_ar}</span></div>{item.notes ? <p className="mt-1 text-xs text-muted-foreground">Note: {item.notes}</p> : null}</div>)}</div>{order.customer_notes ? <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">Customer: {order.customer_notes}</p> : null}<Button className="mt-4 w-full" onClick={() => void advance(order)}>{stage.next === "served" ? <Check className="size-4"/> : null}{stage.next === "served" ? "Mark served" : `Move to ${STAGES.find((item) => item.id === stage.next)?.label}`}</Button></article>; })}</div></section>; })}</div>}
  </div>;
}
