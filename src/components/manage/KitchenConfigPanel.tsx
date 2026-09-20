import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChefHat, Plus, Printer, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { humanError } from "@/lib/errors";
import { useI18n } from "@/lib/i18n";

type Station = { id: string; name: string; name_ar: string | null; display_order: number; is_active: boolean };
type PrinterRow = { id: string; name: string; purpose: string; provider: string; kitchen_station_id: string | null; is_active: boolean };
type MenuItem = { id: string; name_en: string; name_ar: string; kitchen_station_id: string | null; is_available: boolean };

export function KitchenConfigPanel({ restaurantId }: { restaurantId: string }) {
  const { lang } = useI18n();
  const ar = lang === "ar";
  const qc = useQueryClient();
  const [stationName, setStationName] = useState("");
  const [stationNameAr, setStationNameAr] = useState("");
  const [printerName, setPrinterName] = useState("");
  const [printerPurpose, setPrinterPurpose] = useState("kitchen");
  const [printerStation, setPrinterStation] = useState("");

  const query = useQuery({
    queryKey: ["kitchen-config", restaurantId],
    queryFn: async () => {
      const [stationsRes, printersRes, itemsRes] = await Promise.all([
        (supabase as any).from("kitchen_stations").select("id,name,name_ar,display_order,is_active").eq("restaurant_id", restaurantId).order("display_order").order("name"),
        (supabase as any).from("kitchen_printers").select("id,name,purpose,provider,kitchen_station_id,is_active").eq("restaurant_id", restaurantId).order("name"),
        (supabase as any).from("menu_items").select("id,name_en,name_ar,kitchen_station_id,is_available").eq("restaurant_id", restaurantId).order("display_order").order("name_en"),
      ]);
      for (const result of [stationsRes, printersRes, itemsRes]) if (result.error) throw result.error;
      return {
        stations: (stationsRes.data ?? []) as Station[],
        printers: (printersRes.data ?? []) as PrinterRow[],
        items: (itemsRes.data ?? []) as MenuItem[],
      };
    },
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["kitchen-config", restaurantId] });

  const createStation = useMutation({
    mutationFn: async () => {
      const name = stationName.trim();
      if (!name) throw new Error(ar ? "اسم المحطة مطلوب" : "Station name is required");
      const { error } = await (supabase as any).from("kitchen_stations").insert({
        restaurant_id: restaurantId,
        name,
        name_ar: stationNameAr.trim() || null,
        display_order: (query.data?.stations.length ?? 0) * 10,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      setStationName("");
      setStationNameAr("");
      await refresh();
      toast.success(ar ? "تمت إضافة المحطة" : "Kitchen station added");
    },
    onError: (error) => toast.error(humanError(error, lang)),
  });

  const createPrinter = useMutation({
    mutationFn: async () => {
      const name = printerName.trim();
      if (!name) throw new Error(ar ? "اسم الطابعة مطلوب" : "Printer name is required");
      const { error } = await (supabase as any).from("kitchen_printers").insert({
        restaurant_id: restaurantId,
        name,
        purpose: printerPurpose,
        provider: "browser",
        kitchen_station_id: printerStation || null,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      setPrinterName("");
      setPrinterStation("");
      await refresh();
      toast.success(ar ? "تمت إضافة إعداد الطابعة" : "Printer configuration added");
    },
    onError: (error) => toast.error(humanError(error, lang)),
  });

  const stationMap = useMemo(() => new Map((query.data?.stations ?? []).map((station) => [station.id, station])), [query.data?.stations]);

  async function assignItem(itemId: string, stationId: string) {
    try {
      const { error } = await (supabase as any).from("menu_items").update({ kitchen_station_id: stationId || null }).eq("id", itemId).eq("restaurant_id", restaurantId);
      if (error) throw error;
      await Promise.all([
        refresh(),
        qc.invalidateQueries({ queryKey: ["kitchen-menu-stations", restaurantId] }),
      ]);
    } catch (error) {
      toast.error(humanError(error, lang));
    }
  }

  async function removeStation(id: string) {
    try {
      const { error } = await (supabase as any).from("kitchen_stations").delete().eq("id", id).eq("restaurant_id", restaurantId);
      if (error) throw error;
      await refresh();
      toast.success(ar ? "تم حذف المحطة" : "Station removed");
    } catch (error) {
      toast.error(humanError(error, lang));
    }
  }

  async function removePrinter(id: string) {
    try {
      const { error } = await (supabase as any).from("kitchen_printers").delete().eq("id", id).eq("restaurant_id", restaurantId);
      if (error) throw error;
      await refresh();
      toast.success(ar ? "تم حذف إعداد الطابعة" : "Printer configuration removed");
    } catch (error) {
      toast.error(humanError(error, lang));
    }
  }

  if (query.isPending) return <Skeleton className="h-[520px] rounded-2xl" />;
  if (query.isError) return <div role="alert" className="qs-card p-6 text-sm text-destructive">{humanError(query.error, lang)}</div>;

  return <div className="space-y-5">
    <section className="qs-card p-5">
      <div className="flex items-start gap-3"><span className="grid size-10 place-items-center rounded-xl bg-orange-500/10 text-[#ff5a0a]"><ChefHat className="size-5" /></span><div><h2 className="font-display text-xl font-bold">{ar ? "محطات المطبخ" : "Kitchen stations"}</h2><p className="mt-1 text-sm text-muted-foreground">{ar ? "وجّه المنتجات للشواية أو البار أو الحلويات أو أي محطة خاصة بك." : "Route menu items to Grill, Bar, Dessert or any station your kitchen uses."}</p></div></div>
      <div className="mt-5 grid gap-2 md:grid-cols-[1fr_1fr_auto]"><Input value={stationName} onChange={(e) => setStationName(e.target.value)} placeholder={ar ? "اسم المحطة بالإنجليزية" : "Station name"} /><Input value={stationNameAr} onChange={(e) => setStationNameAr(e.target.value)} placeholder={ar ? "اسم المحطة بالعربية (اختياري)" : "Arabic name (optional)"} /><Button disabled={createStation.isPending || !stationName.trim()} onClick={() => createStation.mutate()}><Plus className="size-4" />{ar ? "إضافة" : "Add"}</Button></div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{(query.data?.stations ?? []).map((station) => <div key={station.id} className="flex items-center justify-between rounded-xl border p-3"><div><strong className="text-sm">{ar ? station.name_ar || station.name : station.name}</strong><p className="text-[10px] text-muted-foreground">{station.is_active ? (ar ? "نشطة" : "Active") : (ar ? "غير نشطة" : "Inactive")}</p></div><Button variant="ghost" size="icon" onClick={() => void removeStation(station.id)}><Trash2 className="size-4" /></Button></div>)}</div>
    </section>

    <section className="qs-card p-5">
      <div className="flex items-start gap-3"><span className="grid size-10 place-items-center rounded-xl bg-orange-500/10 text-[#ff5a0a]"><Printer className="size-5" /></span><div><h2 className="font-display text-xl font-bold">{ar ? "الطابعات" : "Printers"}</h2><p className="mt-1 text-sm text-muted-foreground">{ar ? "الطباعة عبر المتصفح تعمل الآن؛ ويمكن توصيل محولات الشبكة أو السحابة لاحقاً بدون تغيير تدفق المطبخ." : "Browser printing works now; network/cloud adapters can be connected later without changing the kitchen workflow."}</p></div></div>
      <div className="mt-5 grid gap-2 lg:grid-cols-[1fr_180px_220px_auto]"><Input value={printerName} onChange={(e) => setPrinterName(e.target.value)} placeholder={ar ? "اسم الطابعة" : "Printer name"} /><select value={printerPurpose} onChange={(e) => setPrinterPurpose(e.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm"><option value="kitchen">{ar ? "مطبخ" : "Kitchen"}</option><option value="cashier">{ar ? "كاشير" : "Cashier"}</option><option value="receipt">{ar ? "إيصال" : "Receipt"}</option></select><select value={printerStation} onChange={(e) => setPrinterStation(e.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm"><option value="">{ar ? "كل المحطات" : "All stations"}</option>{(query.data?.stations ?? []).map((station) => <option key={station.id} value={station.id}>{ar ? station.name_ar || station.name : station.name}</option>)}</select><Button disabled={createPrinter.isPending || !printerName.trim()} onClick={() => createPrinter.mutate()}><Plus className="size-4" />{ar ? "إضافة" : "Add"}</Button></div>
      <div className="mt-4 divide-y rounded-xl border">{(query.data?.printers ?? []).map((printer) => <div key={printer.id} className="flex items-center justify-between gap-3 p-3"><div><strong className="text-sm">{printer.name}</strong><p className="text-[10px] text-muted-foreground">{printer.purpose} · {printer.provider} · {printer.kitchen_station_id ? stationMap.get(printer.kitchen_station_id)?.name ?? "Station" : (ar ? "كل المحطات" : "All stations")}</p></div><Button variant="ghost" size="icon" onClick={() => void removePrinter(printer.id)}><Trash2 className="size-4" /></Button></div>)}</div>
    </section>

    <section className="qs-card overflow-hidden">
      <div className="border-b p-5"><h2 className="font-display text-xl font-bold">{ar ? "توجيه عناصر القائمة" : "Menu item routing"}</h2><p className="mt-1 text-sm text-muted-foreground">{ar ? "حدد المحطة التي يجب أن تستلم كل منتج." : "Choose which station should receive each item."}</p></div>
      <div className="divide-y">{(query.data?.items ?? []).map((item) => <div key={item.id} className="grid gap-2 p-4 sm:grid-cols-[minmax(0,1fr)_220px] sm:items-center"><div><strong className="text-sm">{ar ? item.name_ar || item.name_en : item.name_en || item.name_ar}</strong><p className="text-[10px] text-muted-foreground">{item.is_available ? (ar ? "متوفر" : "Available") : (ar ? "غير متوفر" : "Unavailable")}</p></div><select value={item.kitchen_station_id ?? ""} onChange={(e) => void assignItem(item.id, e.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm"><option value="">{ar ? "بدون محطة / عام" : "Unassigned / general"}</option>{(query.data?.stations ?? []).map((station) => <option key={station.id} value={station.id}>{ar ? station.name_ar || station.name : station.name}</option>)}</select></div>)}</div>
    </section>
  </div>;
}
