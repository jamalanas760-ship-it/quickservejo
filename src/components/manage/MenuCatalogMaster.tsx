import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Crown, EllipsisVertical, ImageIcon, Pencil, Plus, Search, Trash2, UtensilsCrossed } from "lucide-react";
import { toast } from "sonner";

import { ImageUploader } from "@/components/media/ImageUploader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useRestaurant } from "@/hooks/useSuperAdmin";
import { useI18n } from "@/lib/i18n";
import { formatMoney } from "@/lib/format";
import { humanError } from "@/lib/errors";
import { logAudit } from "@/lib/audit";
import { cn } from "@/lib/utils";

type CategoryRow = Database["public"]["Tables"]["menu_categories"]["Row"];
type ItemRow = Database["public"]["Tables"]["menu_items"]["Row"];

type ProductForm = {
  id?: string;
  category_id: string;
  name_en: string;
  name_ar: string;
  description_en: string;
  description_ar: string;
  price: string;
  compare_at_price: string;
  image_url: string | null;
  preparation_time: string;
  is_available: boolean;
  is_featured: boolean;
};

type CategoryForm = { id?: string; name_en: string; name_ar: string; is_active: boolean };

function emptyProduct(categoryId = ""): ProductForm {
  return { category_id: categoryId, name_en: "", name_ar: "", description_en: "", description_ar: "", price: "", compare_at_price: "", image_url: null, preparation_time: "15", is_available: true, is_featured: false };
}

export function MenuCatalogMaster({ restaurantId }: { restaurantId: string }) {
  const { lang, pick } = useI18n();
  const ar = lang === "ar";
  const queryClient = useQueryClient();
  const { data: restaurant } = useRestaurant(restaurantId);
  const currency = restaurant?.currency ?? "JOD";
  const [categoryId, setCategoryId] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | "available" | "unavailable">("all");
  const [productForm, setProductForm] = useState<ProductForm | null>(null);
  const [categoryForm, setCategoryForm] = useState<CategoryForm | null>(null);
  const [deleteItem, setDeleteItem] = useState<ItemRow | null>(null);
  const [busy, setBusy] = useState(false);

  const categories = useQuery<CategoryRow[]>({ queryKey: ["platform", "categories", restaurantId], queryFn: async () => { const { data, error } = await supabase.from("menu_categories").select("*").eq("restaurant_id", restaurantId).order("display_order", { ascending: true }); if (error) throw error; return data ?? []; } });
  const products = useQuery<ItemRow[]>({ queryKey: ["platform", "products", restaurantId], queryFn: async () => { const { data, error } = await supabase.from("menu_items").select("*").eq("restaurant_id", restaurantId).order("display_order", { ascending: true }); if (error) throw error; return data ?? []; } });

  const categoryList = categories.data ?? [];
  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (products.data ?? []).filter((item) => {
      if (categoryId !== "all" && item.category_id !== categoryId) return false;
      if (status === "available" && !item.is_available) return false;
      if (status === "unavailable" && item.is_available) return false;
      if (!needle) return true;
      return [item.name_en, item.name_ar, item.description_en, item.description_ar].filter(Boolean).some((value) => String(value).toLowerCase().includes(needle));
    });
  }, [categoryId, products.data, search, status]);

  async function refresh() { await queryClient.invalidateQueries({ queryKey: ["platform"] }); }

  async function saveProduct() {
    if (!productForm) return;
    if (!productForm.name_en.trim() || !productForm.price) return;
    setBusy(true);
    try {
      const payload = {
        restaurant_id: restaurantId,
        category_id: productForm.category_id || null,
        name_en: productForm.name_en.trim(),
        name_ar: productForm.name_ar.trim() || productForm.name_en.trim(),
        description_en: productForm.description_en.trim() || null,
        description_ar: productForm.description_ar.trim() || null,
        price: Number(productForm.price) || 0,
        compare_at_price: productForm.compare_at_price ? Number(productForm.compare_at_price) : null,
        image_url: productForm.image_url,
        preparation_time: Number(productForm.preparation_time) || 15,
        is_available: productForm.is_available,
        is_featured: productForm.is_featured,
      };
      if (productForm.id) {
        const { error } = await supabase.from("menu_items").update(payload).eq("id", productForm.id).eq("restaurant_id", restaurantId);
        if (error) throw error;
        await logAudit("product.updated", { restaurantId, entity: "menu_items", entityId: productForm.id });
      } else {
        const { error } = await supabase.from("menu_items").insert({ ...payload, display_order: (products.data ?? []).filter((item) => item.category_id === productForm.category_id).length });
        if (error) throw error;
        await logAudit("product.created", { restaurantId, entity: "menu_items" });
      }
      await refresh(); setProductForm(null); toast.success(ar ? "تم حفظ العنصر" : "Menu item saved");
    } catch (error) { toast.error(humanError(error, lang)); } finally { setBusy(false); }
  }

  async function saveCategory() {
    if (!categoryForm?.name_en.trim()) return;
    setBusy(true);
    try {
      const payload = { restaurant_id: restaurantId, name_en: categoryForm.name_en.trim(), name_ar: categoryForm.name_ar.trim() || categoryForm.name_en.trim(), is_active: categoryForm.is_active };
      if (categoryForm.id) { const { error } = await supabase.from("menu_categories").update(payload).eq("id", categoryForm.id).eq("restaurant_id", restaurantId); if (error) throw error; }
      else { const { error } = await supabase.from("menu_categories").insert({ ...payload, display_order: categoryList.length }); if (error) throw error; }
      await refresh(); setCategoryForm(null); toast.success(ar ? "تم حفظ الفئة" : "Category saved");
    } catch (error) { toast.error(humanError(error, lang)); } finally { setBusy(false); }
  }

  async function toggleAvailability(item: ItemRow) {
    try { const { error } = await supabase.from("menu_items").update({ is_available: !item.is_available }).eq("id", item.id).eq("restaurant_id", restaurantId); if (error) throw error; await refresh(); }
    catch (error) { toast.error(humanError(error, lang)); }
  }

  async function removeProduct() {
    if (!deleteItem) return;
    setBusy(true);
    try { const { error } = await supabase.from("menu_items").delete().eq("id", deleteItem.id).eq("restaurant_id", restaurantId); if (error) throw error; await logAudit("product.deleted", { restaurantId, entity: "menu_items", entityId: deleteItem.id }); await refresh(); setDeleteItem(null); toast.success(ar ? "تم حذف العنصر" : "Menu item deleted"); }
    catch (error) { toast.error(humanError(error, lang)); } finally { setBusy(false); }
  }

  function editProduct(item: ItemRow) {
    setProductForm({ id: item.id, category_id: item.category_id ?? "", name_en: item.name_en, name_ar: item.name_ar, description_en: item.description_en ?? "", description_ar: item.description_ar ?? "", price: String(item.price), compare_at_price: item.compare_at_price ? String(item.compare_at_price) : "", image_url: item.image_url, preparation_time: String(item.preparation_time), is_available: item.is_available, is_featured: item.is_featured });
  }

  const selectedCategory = categoryId === "all" ? undefined : categoryList.find((category) => category.id === categoryId);

  return (
    <div className="space-y-4">
      <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
        <button type="button" onClick={() => setCategoryId("all")} className={cn("min-w-[92px] rounded-xl border px-4 py-3 text-center", categoryId === "all" ? "border-[#ff5a0a] bg-orange-50 text-[#ff5a0a] dark:bg-orange-950/30" : "border-border bg-card")}><UtensilsCrossed className="mx-auto size-5" /><span className="mt-1 block text-xs font-bold">{ar ? "كل العناصر" : "All Items"}</span><span className="text-[10px] text-muted-foreground">{products.data?.length ?? 0} items</span></button>
        {categoryList.map((category) => <button key={category.id} type="button" onDoubleClick={() => setCategoryForm({ id: category.id, name_en: category.name_en, name_ar: category.name_ar, is_active: category.is_active })} onClick={() => setCategoryId(category.id)} className={cn("min-w-[92px] rounded-xl border px-4 py-3 text-center", categoryId === category.id ? "border-[#ff5a0a] bg-orange-50 text-[#ff5a0a] dark:bg-orange-950/30" : "border-border bg-card")}><span className="mx-auto grid size-5 place-items-center rounded-md bg-muted text-[10px]">●</span><span className="mt-1 block max-w-[100px] truncate text-xs font-bold">{pick(category.name_en, category.name_ar)}</span><span className="text-[10px] text-muted-foreground">{(products.data ?? []).filter((item) => item.category_id === category.id).length} items</span></button>)}
        <button type="button" onClick={() => setCategoryForm({ name_en: "", name_ar: "", is_active: true })} className="min-w-[92px] rounded-xl border border-dashed border-border bg-card px-4 py-3 text-center text-muted-foreground hover:text-foreground"><Plus className="mx-auto size-5" /><span className="mt-1 block text-xs font-bold">{ar ? "فئة" : "Category"}</span></button>
      </div>

      <section className="qs-card overflow-hidden">
        <div className="grid gap-3 border-b border-border p-4 md:grid-cols-[minmax(0,1fr)_180px_180px_auto]">
          <div className="relative"><Search className="pointer-events-none absolute start-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={ar ? "ابحث في عناصر القائمة..." : "Search menu items..."} className="qs-control h-11 ps-11" /></div>
          <Select value={categoryId} onValueChange={setCategoryId}><SelectTrigger className="h-11"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{ar ? "كل الفئات" : "All Categories"}</SelectItem>{categoryList.map((category) => <SelectItem key={category.id} value={category.id}>{pick(category.name_en, category.name_ar)}</SelectItem>)}</SelectContent></Select>
          <Select value={status} onValueChange={(value) => setStatus(value as typeof status)}><SelectTrigger className="h-11"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{ar ? "كل الحالات" : "All Statuses"}</SelectItem><SelectItem value="available">{ar ? "متاح" : "Available"}</SelectItem><SelectItem value="unavailable">{ar ? "غير متاح" : "Unavailable"}</SelectItem></SelectContent></Select>
          <button type="button" className="qs-button-primary min-h-11" onClick={() => setProductForm(emptyProduct(selectedCategory?.id ?? categoryList[0]?.id ?? ""))}><Plus className="size-4" />{ar ? "إضافة عنصر" : "Add Item"}</button>
        </div>

        {products.isPending || categories.isPending ? <Skeleton className="m-4 h-[420px] rounded-xl" /> : rows.length === 0 ? <div className="p-14 text-center"><ImageIcon className="mx-auto size-9 text-muted-foreground" /><p className="mt-3 text-sm font-semibold">{ar ? "لا توجد عناصر مطابقة" : "No matching menu items"}</p><p className="mt-1 text-xs text-muted-foreground">{ar ? "أضف أول عنصر أو غيّر الفلاتر." : "Add an item or adjust your filters."}</p></div> : (
          <div className="qs-scroll overflow-x-auto"><table className="qs-table min-w-[880px]"><thead><tr><th>{ar ? "العنصر" : "Item"}</th><th>{ar ? "الفئة" : "Category"}</th><th>{ar ? "السعر" : "Price"}</th><th>{ar ? "وقت التحضير" : "Prep Time"}</th><th>{ar ? "الحالة" : "Status"}</th><th>{ar ? "إجراءات" : "Actions"}</th></tr></thead><tbody>{rows.map((item) => { const category = categoryList.find((entry) => entry.id === item.category_id); return <tr key={item.id}><td><div className="flex items-center gap-3"><span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-xl bg-muted">{item.image_url ? <img src={item.image_url} alt="" className="size-full object-cover" loading="lazy" /> : <UtensilsCrossed className="size-5 text-muted-foreground" />}</span><div className="min-w-0"><div className="flex items-center gap-2"><p className="truncate font-bold">{pick(item.name_en, item.name_ar)}</p>{item.is_featured ? <span className="qs-status bg-orange-500/12 text-orange-600"><Crown className="size-3" />{ar ? "مميز" : "Best Seller"}</span> : null}</div><p className="mt-0.5 max-w-[330px] truncate text-[10px] text-muted-foreground">{pick(item.description_en, item.description_ar) || "—"}</p></div></div></td><td><span className="qs-status bg-orange-500/10 text-orange-600">{category ? pick(category.name_en, category.name_ar) : (ar ? "بدون فئة" : "Uncategorized")}</span></td><td className="font-bold">{formatMoney(item.price, currency, lang)}</td><td className="text-muted-foreground">{item.preparation_time} min</td><td><button type="button" onClick={() => void toggleAvailability(item)} className="flex items-center gap-2"><span className={cn("relative h-5 w-9 rounded-full transition", item.is_available ? "bg-emerald-500" : "bg-slate-400")}><span className={cn("absolute top-1 size-3 rounded-full bg-white transition", item.is_available ? "translate-x-5" : "translate-x-1")} /></span><span className="text-xs text-muted-foreground">{item.is_available ? (ar ? "متاح" : "Available") : (ar ? "غير متاح" : "Unavailable")}</span></button></td><td><div className="flex items-center gap-1.5"><button type="button" onClick={() => editProduct(item)} className="grid size-8 place-items-center rounded-lg border border-border hover:bg-muted" aria-label="Edit"><Pencil className="size-4" /></button><button type="button" onClick={() => setDeleteItem(item)} className="grid size-8 place-items-center rounded-lg text-destructive hover:bg-destructive/10" aria-label="Delete"><Trash2 className="size-4" /></button><button type="button" className="grid size-8 place-items-center rounded-lg border border-border hover:bg-muted" aria-label="More"><EllipsisVertical className="size-4" /></button></div></td></tr>; })}</tbody></table></div>
        )}
        <div className="flex items-center justify-between border-t border-border px-4 py-3 text-xs text-muted-foreground"><span>{ar ? `عرض ${rows.length} عنصر` : `Showing ${rows.length} items`}</span><span>{selectedCategory ? pick(selectedCategory.name_en, selectedCategory.name_ar) : (ar ? "كل الفئات" : "All categories")}</span></div>
      </section>

      <Dialog open={productForm !== null} onOpenChange={(open) => !open && setProductForm(null)}><DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto"><DialogHeader><DialogTitle>{productForm?.id ? (ar ? "تعديل عنصر القائمة" : "Edit Menu Item") : (ar ? "عنصر قائمة جديد" : "New Menu Item")}</DialogTitle><DialogDescription>{ar ? "حدّث تفاصيل العنصر وإعداداته." : "Update item details and settings."}</DialogDescription></DialogHeader>{productForm ? <div className="space-y-4"><ImageUploader restaurantId={restaurantId} kind="product" value={productForm.image_url} onChange={(url) => setProductForm({ ...productForm, image_url: url })} label={ar ? "صورة العنصر" : "Item Image"} /><div className="grid gap-4 sm:grid-cols-2"><Field label={ar ? "الاسم بالإنجليزية" : "Item Name (English)"}><Input value={productForm.name_en} onChange={(event) => setProductForm({ ...productForm, name_en: event.target.value })} /></Field><Field label={ar ? "الاسم بالعربية" : "Item Name (Arabic)"}><Input dir="rtl" value={productForm.name_ar} onChange={(event) => setProductForm({ ...productForm, name_ar: event.target.value })} /></Field></div><Field label={ar ? "الفئة" : "Category"}><Select value={productForm.category_id} onValueChange={(value) => setProductForm({ ...productForm, category_id: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{categoryList.map((category) => <SelectItem key={category.id} value={category.id}>{pick(category.name_en, category.name_ar)}</SelectItem>)}</SelectContent></Select></Field><div className="grid gap-4 sm:grid-cols-2"><Field label={ar ? "السعر" : "Price"}><Input type="number" min="0" step="0.01" value={productForm.price} onChange={(event) => setProductForm({ ...productForm, price: event.target.value })} /></Field><Field label={ar ? "وقت التحضير" : "Prep Time (min)"}><Input type="number" min="1" value={productForm.preparation_time} onChange={(event) => setProductForm({ ...productForm, preparation_time: event.target.value })} /></Field></div><Field label={ar ? "الوصف بالإنجليزية" : "Description (English)"}><Textarea value={productForm.description_en} onChange={(event) => setProductForm({ ...productForm, description_en: event.target.value })} /></Field><Field label={ar ? "الوصف بالعربية" : "Description (Arabic)"}><Textarea dir="rtl" value={productForm.description_ar} onChange={(event) => setProductForm({ ...productForm, description_ar: event.target.value })} /></Field><div className="grid gap-3 sm:grid-cols-2"><label className="flex items-center justify-between rounded-xl border border-border p-3"><span><span className="block text-sm font-bold">{ar ? "متاح" : "Available"}</span><span className="text-[10px] text-muted-foreground">{ar ? "يظهر في القائمة" : "Visible on the menu"}</span></span><Switch checked={productForm.is_available} onCheckedChange={(value) => setProductForm({ ...productForm, is_available: value })} /></label><label className="flex items-center justify-between rounded-xl border border-border p-3"><span><span className="block text-sm font-bold">{ar ? "مميز" : "Best Seller"}</span><span className="text-[10px] text-muted-foreground">{ar ? "إظهار شارة مميز" : "Show featured badge"}</span></span><Switch checked={productForm.is_featured} onCheckedChange={(value) => setProductForm({ ...productForm, is_featured: value })} /></label></div></div> : null}<DialogFooter><Button variant="ghost" onClick={() => setProductForm(null)}>{ar ? "إلغاء" : "Cancel"}</Button><Button disabled={busy || !productForm?.name_en.trim() || !productForm?.price} onClick={() => void saveProduct()} className="bg-[#ff5a0a] text-white hover:bg-[#e94f00]">{busy ? (ar ? "جارٍ الحفظ…" : "Saving…") : (ar ? "حفظ التغييرات" : "Save Changes")}</Button></DialogFooter></DialogContent></Dialog>

      <Dialog open={categoryForm !== null} onOpenChange={(open) => !open && setCategoryForm(null)}><DialogContent><DialogHeader><DialogTitle>{categoryForm?.id ? (ar ? "تعديل الفئة" : "Edit Category") : (ar ? "فئة جديدة" : "New Category")}</DialogTitle><DialogDescription>{ar ? "نظم القائمة باستخدام فئات واضحة." : "Organize the menu with clear categories."}</DialogDescription></DialogHeader>{categoryForm ? <div className="space-y-4"><Field label={ar ? "الاسم بالإنجليزية" : "English Name"}><Input value={categoryForm.name_en} onChange={(event) => setCategoryForm({ ...categoryForm, name_en: event.target.value })} /></Field><Field label={ar ? "الاسم بالعربية" : "Arabic Name"}><Input dir="rtl" value={categoryForm.name_ar} onChange={(event) => setCategoryForm({ ...categoryForm, name_ar: event.target.value })} /></Field><label className="flex items-center justify-between rounded-xl border border-border p-3"><span className="text-sm font-bold">{ar ? "الفئة نشطة" : "Active category"}</span><Switch checked={categoryForm.is_active} onCheckedChange={(value) => setCategoryForm({ ...categoryForm, is_active: value })} /></label></div> : null}<DialogFooter><Button variant="ghost" onClick={() => setCategoryForm(null)}>{ar ? "إلغاء" : "Cancel"}</Button><Button disabled={busy || !categoryForm?.name_en.trim()} onClick={() => void saveCategory()}>{ar ? "حفظ" : "Save"}</Button></DialogFooter></DialogContent></Dialog>

      <AlertDialog open={deleteItem !== null} onOpenChange={(open) => !open && setDeleteItem(null)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{ar ? "حذف عنصر القائمة؟" : "Delete menu item?"}</AlertDialogTitle><AlertDialogDescription>{deleteItem ? pick(deleteItem.name_en, deleteItem.name_ar) : ""}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>{ar ? "إلغاء" : "Cancel"}</AlertDialogCancel><AlertDialogAction disabled={busy} onClick={() => void removeProduct()}>{ar ? "حذف" : "Delete"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div className="space-y-1.5"><Label className="text-xs font-bold">{label}</Label>{children}</div>; }
