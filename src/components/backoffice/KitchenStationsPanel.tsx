import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChefHat, Plus, Printer, Search, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { humanError } from "@/lib/errors";
import { useI18n } from "@/lib/i18n";

type Station = {
  id: string;
  name: string;
  display_order: number;
  is_active: boolean;
  print_width_mm: 58 | 80;
};

type Category = {
  id: string;
  name_en: string;
  name_ar: string;
  kitchen_station_id: string | null;
};

type Item = {
  id: string;
  name_en: string;
  name_ar: string;
  category_id: string | null;
  kitchen_station_id: string | null;
};

export function KitchenStationsPanel({ restaurantId }: { restaurantId: string }) {
  const { lang, pick } = useI18n();
  const ar = lang === "ar";
  const qc = useQueryClient();
  const [newName, setNewName] = useState("");
  const [search, setSearch] = useState("");

  const query = useQuery({
    queryKey: ["kitchen-stations-admin", restaurantId],
    queryFn: async () => {
      const [stationsRes, categoriesRes, itemsRes] = await Promise.all([
        (supabase as any)
          .from("kitchen_stations")
          .select("id,name,display_order,is_active,print_width_mm")
          .eq("restaurant_id", restaurantId)
          .order("display_order")
          .order("name"),
        (supabase as any)
          .from("menu_categories")
          .select("id,name_en,name_ar,kitchen_station_id")
          .eq("restaurant_id", restaurantId)
          .order("display_order"),
        (supabase as any)
          .from("menu_items")
          .select("id,name_en,name_ar,category_id,kitchen_station_id")
          .eq("restaurant_id", restaurantId)
          .order("display_order"),
      ]);
      for (const result of [stationsRes, categoriesRes, itemsRes]) if (result.error) throw result.error;
      return {
        stations: (stationsRes.data ?? []) as Station[],
        categories: (categoriesRes.data ?? []) as Category[],
        items: (itemsRes.data ?? []) as Item[],
      };
    },
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["kitchen-stations-admin", restaurantId] });

  const createStation = useMutation({
    mutationFn: async () => {
      const name = newName.trim();
      if (!name) throw new Error(ar ? "أدخل اسم المحطة" : "Enter a station name");
      const maxOrder = Math.max(-1, ...(query.data?.stations ?? []).map((station) => station.display_order));
      const { error } = await (supabase as any).from("kitchen_stations").insert({
        restaurant_id: restaurantId,
        name,
        display_order: maxOrder + 1,
        print_width_mm: 80,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      setNewName("");
      await refresh();
      toast.success(ar ? "تمت إضافة محطة المطبخ" : "Kitchen station added");
    },
    onError: (error) => toast.error(humanError(error, lang)),
  });

  const updateStation = useMutation({
    mutationFn: async (input: { id: string; patch: Partial<Pick<Station, "name" | "is_active" | "print_width_mm">> }) => {
      const patch = { ...input.patch };
      if (typeof patch.name === "string") {
        patch.name = patch.name.trim();
        if (!patch.name) throw new Error(ar ? "اسم المحطة مطلوب" : "Station name is required");
      }
      const { error } = await (supabase as any)
        .from("kitchen_stations")
        .update(patch)
        .eq("restaurant_id", restaurantId)
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: async () => {
      await refresh();
      toast.success(ar ? "تم تحديث المحطة" : "Station updated");
    },
    onError: (error) => toast.error(humanError(error, lang)),
  });

  const mapStation = useMutation({
    mutationFn: async (input: { table: "menu_categories" | "menu_items"; id: string; stationId: string | null }) => {
      const { error } = await (supabase as any)
        .from(input.table)
        .update({ kitchen_station_id: input.stationId })
        .eq("restaurant_id", restaurantId)
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: async () => {
      await refresh();
    },
    onError: (error) => toast.error(humanError(error, lang)),
  });

  if (query.isPending) return <div className="space-y-3"><Skeleton className="h-28 rounded-2xl" /><Skeleton className="h-80 rounded-2xl" /></div>;
  if (query.isError) return <div role="alert" className="qs-card p-6 text-sm text-destructive">{humanError(query.error, lang)}</div>;

  const stations = query.data?.stations ?? [];
  const activeStations = stations.filter((station) => station.is_active);
  const categories = query.data?.categories ?? [];
  const categoriesById = new Map(categories.map((category) => [category.id, category]));
  const needle = search.trim().toLowerCase();
  const filteredItems = (query.data?.items ?? []).filter((item) => {
    if (!needle) return true;
    return [item.name_en, item.name_ar].some((value) => value.toLowerCase().includes(needle));
  });

  return <div className="space-y-5">
    <section className="qs-card overflow-hidden">
      <div className="grid gap-4 border-b border-border p-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div>
          <div className="flex items-center gap-2"><ChefHat className="size-5 text-[#ff5a0a]" /><h2 className="font-display text-xl font-bold">{ar ? "محطات المطبخ" : "Kitchen stations"}</h2></div>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">{ar ? "وجّه الشواية والمشروبات والحلويات وغيرها إلى شاشات العمل الصحيحة. يمكن لكل صنف تجاوز محطة القسم الافتراضية." : "Route grill, drinks, desserts and other work to the right kitchen view. Individual items can override their category default."}</p>
        </div>
        <div className="flex min-w-0 gap-2">
          <Input value={newName} onChange={(event) => setNewName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && newName.trim()) createStation.mutate(); }} className="min-w-0 sm:w-56" placeholder={ar ? "مثال: الشواية" : "e.g. Grill"} />
          <Button disabled={!newName.trim() || createStation.isPending} onClick={() => createStation.mutate()}><Plus className="size-4" />{ar ? "إضافة" : "Add"}</Button>
        </div>
      </div>

      {stations.length === 0 ? <div className="p-8 text-center"><ChefHat className="mx-auto size-9 text-muted-foreground" /><h3 className="mt-3 font-bold">{ar ? "ابدأ بمحطة واحدة" : "Start with one station"}</h3><p className="mt-1 text-xs text-muted-foreground">{ar ? "مثلاً: مطبخ، شواية، بار أو حلويات." : "For example: Kitchen, Grill, Bar or Desserts."}</p></div> : <div className="grid gap-3 p-5 md:grid-cols-2 2xl:grid-cols-3">{stations.map((station) => <article key={station.id} className="rounded-2xl border border-border p-4">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-orange-500/10 text-[#ff5a0a]"><ChefHat className="size-4" /></span>
          <div className="min-w-0 flex-1 space-y-3">
            <Input defaultValue={station.name} aria-label={ar ? "اسم المحطة" : "Station name"} onBlur={(event) => { const next = event.currentTarget.value.trim(); if (next && next !== station.name) updateStation.mutate({ id: station.id, patch: { name: next } }); }} />
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
              <div className="space-y-1"><p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{ar ? "عرض الطباعة" : "Print width"}</p><Select value={String(station.print_width_mm)} onValueChange={(value) => updateStation.mutate({ id: station.id, patch: { print_width_mm: Number(value) as 58 | 80 } })}><SelectTrigger className="h-9"><Printer className="size-3.5" /><SelectValue /></SelectTrigger><SelectContent><SelectItem value="58">58 mm</SelectItem><SelectItem value="80">80 mm</SelectItem></SelectContent></Select></div>
              <label className="flex items-center gap-2 text-xs font-semibold"><Switch checked={station.is_active} onCheckedChange={(checked) => updateStation.mutate({ id: station.id, patch: { is_active: checked } })} /><span>{station.is_active ? (ar ? "نشطة" : "Active") : (ar ? "موقوفة" : "Off")}</span></label>
            </div>
          </div>
        </div>
      </article>)}</div>}
    </section>

    <section className="qs-card overflow-hidden">
      <div className="border-b border-border p-5"><div className="flex items-center gap-2"><SlidersHorizontal className="size-4 text-[#ff5a0a]" /><h3 className="font-bold">{ar ? "المحطة الافتراضية حسب القسم" : "Category default station"}</h3></div><p className="mt-1 text-xs text-muted-foreground">{ar ? "الأصناف ترث محطة القسم ما لم تحدد لها محطة خاصة." : "Items inherit the category station unless an item override is selected."}</p></div>
      <div className="divide-y divide-border">{categories.length ? categories.map((category) => <div key={category.id} className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_220px] sm:items-center"><strong className="truncate text-sm">{pick(category.name_en, category.name_ar)}</strong><Select value={category.kitchen_station_id ?? "none"} onValueChange={(value) => mapStation.mutate({ table: "menu_categories", id: category.id, stationId: value === "none" ? null : value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">{ar ? "بدون محطة افتراضية" : "No default station"}</SelectItem>{activeStations.map((station) => <SelectItem key={station.id} value={station.id}>{station.name}</SelectItem>)}</SelectContent></Select></div>) : <p className="p-6 text-sm text-muted-foreground">{ar ? "أضف أقسام القائمة أولاً." : "Add menu categories first."}</p>}</div>
    </section>

    <section className="qs-card overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-border p-5 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="font-bold">{ar ? "تجاوز المحطة حسب الصنف" : "Item station overrides"}</h3><p className="mt-1 text-xs text-muted-foreground">{ar ? "اتركها على «وراثة» لاستخدام محطة القسم." : "Leave on “Inherit” to use the category default."}</p></div><div className="relative sm:w-72"><Search className="pointer-events-none absolute inset-y-0 start-3 my-auto size-4 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} className="ps-9" placeholder={ar ? "بحث عن صنف" : "Search items"} /></div></div>
      <div className="max-h-[520px] divide-y divide-border overflow-y-auto">{filteredItems.length ? filteredItems.map((item) => {
        const category = item.category_id ? categoriesById.get(item.category_id) : null;
        const inherited = category?.kitchen_station_id ? stations.find((station) => station.id === category.kitchen_station_id)?.name : null;
        return <div key={item.id} className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_240px] sm:items-center"><div className="min-w-0"><strong className="block truncate text-sm">{pick(item.name_en, item.name_ar)}</strong><p className="mt-1 truncate text-[10px] text-muted-foreground">{item.kitchen_station_id ? (ar ? "تجاوز مخصص" : "Item override") : inherited ? (ar ? "يرث · " : "Inherits · ") + inherited : (ar ? "غير موجّه" : "Unrouted")}</p></div><Select value={item.kitchen_station_id ?? "inherit"} onValueChange={(value) => mapStation.mutate({ table: "menu_items", id: item.id, stationId: value === "inherit" ? null : value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="inherit">{ar ? "وراثة من القسم" : "Inherit category"}</SelectItem>{activeStations.map((station) => <SelectItem key={station.id} value={station.id}>{station.name}</SelectItem>)}</SelectContent></Select></div>;
      }) : <p className="p-6 text-sm text-muted-foreground">{ar ? "لا توجد أصناف مطابقة." : "No matching items."}</p>}</div>
    </section>
  </div>;
}
