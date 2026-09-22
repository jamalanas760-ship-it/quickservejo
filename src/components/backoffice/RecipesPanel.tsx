import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Calculator, ChefHat, Plus, Search, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import type { BackOfficeData } from "@/hooks/useBackOffice";
import { supabase } from "@/integrations/supabase/client";
import { humanError } from "@/lib/errors";
import { formatMoney, formatNumber } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type MenuItem = { id: string; name_en: string; name_ar: string; price: number; is_available: boolean };
type Recipe = { id: string; menu_item_id: string; yield_quantity: number; notes: string };
type RecipeLine = { id: string; recipe_id: string; inventory_item_id: string; quantity: number; waste_percent: number };
type DraftLine = { inventory_item_id: string; quantity: string; waste_percent: string };

export function RecipesPanel({ restaurantId, data, currency }: { restaurantId: string; data: BackOfficeData; currency: string }) {
  const { lang, pick } = useI18n();
  const ar = lang === "ar";
  const qc = useQueryClient();
  const [term, setTerm] = useState("");
  const [editItem, setEditItem] = useState<MenuItem | null>(null);
  const [yieldQty, setYieldQty] = useState("1");
  const [notes, setNotes] = useState("");
  const [draftLines, setDraftLines] = useState<DraftLine[]>([]);

  const query = useQuery({
    queryKey: ["erp", "recipes", restaurantId],
    queryFn: async () => {
      const [menuRes, recipesRes, linesRes] = await Promise.all([
        supabase.from("menu_items").select("id,name_en,name_ar,price,is_available").eq("restaurant_id", restaurantId).order("name_en"),
        supabase.from("erp_menu_recipes" as any).select("id,menu_item_id,yield_quantity,notes").eq("restaurant_id", restaurantId),
        supabase.from("erp_recipe_items" as any).select("id,recipe_id,inventory_item_id,quantity,waste_percent").eq("restaurant_id", restaurantId),
      ]);
      for (const result of [menuRes, recipesRes, linesRes]) if (result.error) throw result.error;
      return {
        menu: (menuRes.data ?? []).map((row: any) => ({ ...row, price: Number(row.price ?? 0) })) as MenuItem[],
        recipes: (recipesRes.data ?? []).map((row: any) => ({ ...row, yield_quantity: Number(row.yield_quantity ?? 1) })) as Recipe[],
        lines: (linesRes.data ?? []).map((row: any) => ({ ...row, quantity: Number(row.quantity ?? 0), waste_percent: Number(row.waste_percent ?? 0) })) as RecipeLine[],
      };
    },
  });

  const latestCost = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of [...data.movements].sort((a,b)=>b.created_at.localeCompare(a.created_at))) {
      if (!map.has(row.item_id) && Number(row.unit_cost) > 0) map.set(row.item_id, Number(row.unit_cost));
    }
    return map;
  }, [data.movements]);

  const recipeFor = (itemId: string) => query.data?.recipes.find((recipe) => recipe.menu_item_id === itemId) ?? null;
  const linesFor = (recipeId: string) => (query.data?.lines ?? []).filter((line) => line.recipe_id === recipeId);
  const recipeCost = (itemId: string) => {
    const recipe = recipeFor(itemId);
    if (!recipe) return 0;
    const gross = linesFor(recipe.id).reduce((sum, line) => {
      const unitCost = latestCost.get(line.inventory_item_id) ?? 0;
      return sum + line.quantity * (1 + line.waste_percent / 100) * unitCost;
    }, 0);
    return gross / Math.max(recipe.yield_quantity, .000001);
  };

  const rows = useMemo(() => {
    const needle = term.trim().toLowerCase();
    return (query.data?.menu ?? []).filter((item) => !needle || [item.name_en,item.name_ar].some((name)=>name.toLowerCase().includes(needle)));
  }, [query.data?.menu,term]);

  function openRecipe(item: MenuItem) {
    const recipe = recipeFor(item.id);
    setEditItem(item);
    setYieldQty(String(recipe?.yield_quantity ?? 1));
    setNotes(recipe?.notes ?? "");
    setDraftLines(recipe ? linesFor(recipe.id).map((line)=>({ inventory_item_id: line.inventory_item_id, quantity: String(line.quantity), waste_percent: String(line.waste_percent) })) : []);
  }

  const save = useMutation({
    mutationFn: async () => {
      if (!editItem) return;
      const yieldValue = Number(yieldQty);
      if (!(yieldValue > 0)) throw new Error(ar ? "الكمية الناتجة يجب أن تكون أكبر من صفر" : "Recipe yield must be greater than zero");
      const clean = draftLines
        .map((line) => ({ inventory_item_id: line.inventory_item_id, quantity: Number(line.quantity), waste_percent: Number(line.waste_percent || 0) }))
        .filter((line) => line.inventory_item_id && line.quantity > 0);
      const unique = new Set(clean.map((line)=>line.inventory_item_id));
      if (unique.size !== clean.length) throw new Error(ar ? "لا تكرر نفس مادة المخزون داخل الوصفة" : "Do not add the same inventory item twice");
      let recipe = recipeFor(editItem.id);
      if (!recipe) {
        const { data: created, error } = await (supabase as any).from("erp_menu_recipes").insert({
          restaurant_id: restaurantId,
          menu_item_id: editItem.id,
          yield_quantity: yieldValue,
          notes: notes.trim(),
        }).select("id,menu_item_id,yield_quantity,notes").single();
        if (error) throw error;
        recipe = { ...created, yield_quantity: Number(created.yield_quantity) } as Recipe;
      } else {
        const { error } = await (supabase as any).from("erp_menu_recipes").update({ yield_quantity: yieldValue, notes: notes.trim(), updated_at: new Date().toISOString() }).eq("id", recipe.id);
        if (error) throw error;
      }
      const { error: deleteError } = await (supabase as any).from("erp_recipe_items").delete().eq("recipe_id", recipe.id);
      if (deleteError) throw deleteError;
      if (clean.length) {
        const { error } = await (supabase as any).from("erp_recipe_items").insert(clean.map((line)=>({
          restaurant_id: restaurantId,
          recipe_id: recipe!.id,
          inventory_item_id: line.inventory_item_id,
          quantity: line.quantity,
          waste_percent: Math.min(99.99,Math.max(0,line.waste_percent)),
        })));
        if (error) throw error;
      }
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["erp","recipes",restaurantId] });
      setEditItem(null);
      toast.success(ar ? "تم حفظ الوصفة والتكلفة" : "Recipe and food cost saved");
    },
    onError: (error)=>toast.error(humanError(error,lang)),
  });

  const remove = useMutation({
    mutationFn: async (itemId: string) => {
      const recipe = recipeFor(itemId);
      if (!recipe) return;
      const { error } = await (supabase as any).from("erp_menu_recipes").delete().eq("id", recipe.id);
      if (error) throw error;
    },
    onSuccess: async()=>{await qc.invalidateQueries({queryKey:["erp","recipes",restaurantId]});toast.success(ar?"تم حذف الوصفة":"Recipe removed");},
    onError:(error)=>toast.error(humanError(error,lang)),
  });

  const linked = (query.data?.menu ?? []).filter((item)=>Boolean(recipeFor(item.id))).length;
  const priced = (query.data?.menu ?? []).filter((item)=>recipeCost(item.id)>0);
  const avgFoodCost = priced.length ? priced.reduce((sum,item)=>sum+(item.price>0?recipeCost(item.id)/item.price*100:0),0)/priced.length : 0;
  const missing = Math.max(0,(query.data?.menu ?? []).length-linked);

  return <section className="space-y-4">
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Kpi icon={ChefHat} label={ar?"أصناف مرتبطة بوصفة":"Recipe-linked items"} value={formatNumber(linked,lang)}/>
      <Kpi icon={Calculator} label={ar?"متوسط تكلفة الطعام":"Average food cost"} value={avgFoodCost?avgFoodCost.toFixed(1)+"%":"—"}/>
      <Kpi icon={ChefHat} label={ar?"بدون وصفة":"Missing recipes"} value={formatNumber(missing,lang)} tone={missing?"warning":undefined}/>
      <Kpi icon={Calculator} label={ar?"مواد بتكلفة معروفة":"Ingredients with cost"} value={formatNumber(latestCost.size,lang)}/>
    </div>

    <section className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="font-display text-lg font-bold">{ar?"الوصفات وتكلفة الطعام":"Recipes & food cost"}</h3><p className="mt-1 text-xs text-muted-foreground">{ar?"اربط كل صنف بالمكونات ليخصم QuickServe المخزون تلقائياً عند تشغيل الطلب.":"Link menu items to ingredients so QuickServe consumes stock automatically when an order enters production."}</p></div><div className="relative sm:w-[260px]"><Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"/><Input value={term} onChange={e=>setTerm(e.target.value)} className="ps-9" placeholder={ar?"بحث عن صنف":"Search menu item"}/></div></div>
      {query.isPending?<div className="p-5"><Skeleton className="h-72 rounded-2xl"/></div>:query.isError?<p className="p-5 text-sm text-destructive">{humanError(query.error,lang)}</p>:!rows.length?<div className="p-10 text-center text-xs text-muted-foreground">{ar?"لا توجد أصناف قائمة.":"No menu items found."}</div>:<div className="divide-y divide-border">{rows.map(item=>{
        const recipe=recipeFor(item.id);const cost=recipeCost(item.id);const pct=item.price>0?cost/item.price*100:0;const margin=item.price-cost;
        return <article key={item.id} className="grid gap-3 p-4 md:grid-cols-[minmax(0,1.2fr)_auto_auto_auto] md:items-center"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><strong className="truncate">{pick(item.name_en,item.name_ar)}</strong>{recipe?<span className="rounded-full bg-emerald-500/10 px-2 py-1 text-[9px] font-bold text-emerald-700">{ar?"وصفة مرتبطة":"Linked"}</span>:<span className="rounded-full bg-amber-500/10 px-2 py-1 text-[9px] font-bold text-amber-700">{ar?"غير مربوط":"Missing"}</span>}</div><p className="mt-1 text-xs text-muted-foreground">{ar?"سعر البيع":"Selling price"} · {formatMoney(item.price,currency,lang)}</p></div><div className="text-xs"><span className="text-muted-foreground">{ar?"تكلفة الوحدة":"Food cost"}</span><strong className="ms-2">{cost?formatMoney(cost,currency,lang):"—"}</strong></div><div className={cn("text-xs font-bold",pct>35?"text-amber-700":"text-emerald-700")}>{cost?pct.toFixed(1)+"%":"—"}<span className="ms-2 font-normal text-muted-foreground">{cost?(ar?"هامش ":"margin ")+formatMoney(margin,currency,lang):""}</span></div><div className="flex justify-end gap-2"><Button size="sm" variant="outline" onClick={()=>openRecipe(item)}>{recipe?(ar?"تعديل":"Edit"):(ar?"إضافة وصفة":"Add recipe")}</Button>{recipe?<Button size="icon" variant="ghost" className="text-destructive" disabled={remove.isPending} onClick={()=>remove.mutate(item.id)}><Trash2 className="size-4"/></Button>:null}</div></article>;
      })}</div>}
    </section>

    <Dialog open={Boolean(editItem)} onOpenChange={open=>{if(!open)setEditItem(null)}}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>{editItem?(ar?"وصفة ":"Recipe ")+pick(editItem.name_en,editItem.name_ar):""}</DialogTitle><DialogDescription>{ar?"الكمية هي استهلاك المادة لكل كمية ناتجة من الوصفة، مع نسبة هدر اختيارية.":"Ingredient quantity is consumed per recipe yield; add optional waste for prep loss."}</DialogDescription></DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2"><label className="space-y-1.5 text-sm"><span>{ar?"ناتج الوصفة":"Recipe yield"}</span><Input type="number" min=".001" step=".001" value={yieldQty} onChange={e=>setYieldQty(e.target.value)}/></label><label className="space-y-1.5 text-sm"><span>{ar?"ملاحظات":"Notes"}</span><Input value={notes} onChange={e=>setNotes(e.target.value)} maxLength={500}/></label></div>
          <div className="space-y-2"><div className="flex items-center justify-between"><h4 className="text-xs font-bold uppercase tracking-[.08em] text-muted-foreground">{ar?"المكونات":"Ingredients"}</h4><Button type="button" size="sm" variant="outline" onClick={()=>setDraftLines(prev=>[...prev,{inventory_item_id:"",quantity:"",waste_percent:"0"}])}><Plus className="size-4"/>{ar?"مكون":"Ingredient"}</Button></div>
            {draftLines.length?draftLines.map((line,index)=><div key={index} className="grid gap-2 rounded-xl border border-border p-3 sm:grid-cols-[minmax(0,1fr)_120px_100px_auto] sm:items-end"><label className="space-y-1.5 text-xs"><span>{ar?"مادة المخزون":"Inventory item"}</span><select value={line.inventory_item_id} onChange={e=>setDraftLines(prev=>prev.map((row,i)=>i===index?{...row,inventory_item_id:e.target.value}:row))} className="h-10 w-full rounded-xl border border-input bg-background px-3"><option value="">{ar?"اختر":"Choose"}</option>{data.inventory.map(item=><option key={item.id} value={item.id}>{item.name} ({item.unit})</option>)}</select></label><label className="space-y-1.5 text-xs"><span>{ar?"الكمية":"Quantity"}</span><Input type="number" min=".0001" step=".0001" value={line.quantity} onChange={e=>setDraftLines(prev=>prev.map((row,i)=>i===index?{...row,quantity:e.target.value}:row))}/></label><label className="space-y-1.5 text-xs"><span>{ar?"هدر %":"Waste %"}</span><Input type="number" min="0" max="99" step=".1" value={line.waste_percent} onChange={e=>setDraftLines(prev=>prev.map((row,i)=>i===index?{...row,waste_percent:e.target.value}:row))}/></label><Button type="button" size="icon" variant="ghost" className="text-destructive" onClick={()=>setDraftLines(prev=>prev.filter((_,i)=>i!==index))}><Trash2 className="size-4"/></Button></div>):<div className="rounded-xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">{ar?"أضف أول مكون لتبدأ حساب التكلفة.":"Add the first ingredient to calculate food cost."}</div>}
          </div>
        </div>
        <DialogFooter><Button variant="outline" onClick={()=>setEditItem(null)}>{ar?"إلغاء":"Cancel"}</Button><Button disabled={save.isPending||!editItem} onClick={()=>save.mutate()}>{ar?"حفظ الوصفة":"Save recipe"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </section>;
}

function Kpi({icon:Icon,label,value,tone}:{icon:typeof ChefHat;label:string;value:string;tone?:"warning"|undefined}){return <article className="qs-stat flex min-h-[106px] items-center gap-4 p-4"><span className={cn("grid size-11 place-items-center rounded-2xl",tone==="warning"?"bg-amber-500/10 text-amber-700":"bg-orange-500/10 text-[#e85d2a]")}><Icon className="size-5"/></span><div><p className="text-[11px] font-semibold text-muted-foreground">{label}</p><strong className="mt-1 block font-display text-xl tracking-[-.03em]">{value}</strong></div></article>}
