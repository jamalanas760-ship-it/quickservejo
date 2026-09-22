import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Crown,
  DollarSign,
  ImageIcon,
  Pencil,
  Plus,
  Search,
  Tags,
  Trash2,
  UtensilsCrossed,
} from "lucide-react";
import { toast } from "sonner";

import { ImageUploader } from "@/components/media/ImageUploader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
export type MenuCatalogMode = "categories" | "products" | "pricing";

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
  return {
    category_id: categoryId,
    name_en: "",
    name_ar: "",
    description_en: "",
    description_ar: "",
    price: "",
    compare_at_price: "",
    image_url: null,
    preparation_time: "15",
    is_available: true,
    is_featured: false,
  };
}

export function MenuCatalogMaster({ restaurantId, mode = "products" }: { restaurantId: string; mode?: MenuCatalogMode }) {
  const { lang, pick } = useI18n();
  const ar = lang === "ar";
  const queryClient = useQueryClient();
  const { data: restaurant } = useRestaurant(restaurantId);
  const currency = restaurant?.currency ?? "JOD";

  const [categoryId, setCategoryId] = useState("all");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | "available" | "unavailable">("all");
  const [productForm, setProductForm] = useState<ProductForm | null>(null);
  const [categoryForm, setCategoryForm] = useState<CategoryForm | null>(null);
  const [deleteItem, setDeleteItem] = useState<ItemRow | null>(null);
  const [busy, setBusy] = useState(false);

  const categories = useQuery<CategoryRow[]>({
    queryKey: ["platform", "categories", restaurantId],
    queryFn: async () => {
      const { data, error } = await supabase.from("menu_categories").select("*").eq("restaurant_id", restaurantId).order("display_order", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const products = useQuery<ItemRow[]>({
    queryKey: ["platform", "products", restaurantId],
    queryFn: async () => {
      const { data, error } = await supabase.from("menu_items").select("*").eq("restaurant_id", restaurantId).order("display_order", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const pdfLinks = useQuery<{ menu_item_id: string }[]>({
    queryKey: ["platform", "pdf-product-links", restaurantId],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("menu_pdf_item_links").select("menu_item_id").eq("restaurant_id", restaurantId);
      if (error) throw error;
      return (data ?? []).filter((row: any) => typeof row.menu_item_id === "string");
    },
  });

  const pdfProductIds = useMemo(() => new Set((pdfLinks.data ?? []).map((row) => row.menu_item_id)), [pdfLinks.data]);
  const standardProducts = useMemo(() => (products.data ?? []).filter((item) => !pdfProductIds.has(item.id)), [products.data, pdfProductIds]);
  const categoryList = categories.data ?? [];
  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return standardProducts.filter((item) => {
      if (categoryId !== "all" && item.category_id !== categoryId) return false;
      if (status === "available" && !item.is_available) return false;
      if (status === "unavailable" && item.is_available) return false;
      if (!needle) return true;
      return [item.name_en, item.name_ar, item.description_en, item.description_ar]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle));
    });
  }, [categoryId, search, standardProducts, status]);

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["platform"] });
  }

  async function saveProduct() {
    if (!productForm || !productForm.name_en.trim() || !productForm.price) return;
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
        const { error } = await supabase.from("menu_items").insert({ ...payload, display_order: standardProducts.filter((item) => item.category_id === productForm.category_id).length });
        if (error) throw error;
        await logAudit("product.created", { restaurantId, entity: "menu_items" });
      }
      await refresh();
      setProductForm(null);
      toast.success(ar ? "تم حفظ منتج القائمة العادية" : "Standard Menu product saved");
    } catch (error) {
      toast.error(humanError(error, lang));
    } finally {
      setBusy(false);
    }
  }

  async function saveCategory() {
    if (!categoryForm?.name_en.trim()) return;
    setBusy(true);
    try {
      const payload = { restaurant_id: restaurantId, name_en: categoryForm.name_en.trim(), name_ar: categoryForm.name_ar.trim() || categoryForm.name_en.trim(), is_active: categoryForm.is_active };
      if (categoryForm.id) {
        const { error } = await supabase.from("menu_categories").update(payload).eq("id", categoryForm.id).eq("restaurant_id", restaurantId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("menu_categories").insert({ ...payload, display_order: categoryList.length });
        if (error) throw error;
      }
      await refresh();
      setCategoryForm(null);
      toast.success(ar ? "تم حفظ الفئة" : "Category saved");
    } catch (error) {
      toast.error(humanError(error, lang));
    } finally {
      setBusy(false);
    }
  }

  async function toggleCategory(category: CategoryRow) {
    try {
      const { error } = await supabase.from("menu_categories").update({ is_active: !category.is_active }).eq("id", category.id).eq("restaurant_id", restaurantId);
      if (error) throw error;
      await refresh();
    } catch (error) {
      toast.error(humanError(error, lang));
    }
  }

  async function toggleAvailability(item: ItemRow) {
    try {
      const { error } = await supabase.from("menu_items").update({ is_available: !item.is_available }).eq("id", item.id).eq("restaurant_id", restaurantId);
      if (error) throw error;
      await refresh();
    } catch (error) {
      toast.error(humanError(error, lang));
    }
  }

  async function removeProduct() {
    if (!deleteItem) return;
    setBusy(true);
    try {
      const { error } = await supabase.from("menu_items").delete().eq("id", deleteItem.id).eq("restaurant_id", restaurantId);
      if (error) throw error;
      await logAudit("product.deleted", { restaurantId, entity: "menu_items", entityId: deleteItem.id });
      await refresh();
      setDeleteItem(null);
      toast.success(ar ? "تم حذف المنتج" : "Menu product deleted");
    } catch (error) {
      toast.error(humanError(error, lang));
    } finally {
      setBusy(false);
    }
  }

  function editProduct(item: ItemRow) {
    setProductForm({
      id: item.id,
      category_id: item.category_id ?? "",
      name_en: item.name_en,
      name_ar: item.name_ar,
      description_en: item.description_en ?? "",
      description_ar: item.description_ar ?? "",
      price: String(item.price),
      compare_at_price: item.compare_at_price ? String(item.compare_at_price) : "",
      image_url: item.image_url,
      preparation_time: String(item.preparation_time),
      is_available: item.is_available,
      is_featured: item.is_featured,
    });
  }

  const loading = products.isPending || categories.isPending || pdfLinks.isPending;

  return (
    <div className="space-y-4">
      {mode === "categories" ? (
        <section className="qs-card overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
            <div><h3 className="font-display text-base font-bold">{ar ? "فئات القائمة" : "Menu Categories"}</h3><p className="mt-1 text-xs text-muted-foreground">{ar ? "رتب منتجاتك ضمن فئات واضحة وسهلة التصفح." : "Keep products organized in clear, guest-friendly categories."}</p></div>
            <button type="button" className="qs-button-primary" onClick={() => setCategoryForm({ name_en: "", name_ar: "", is_active: true })}><Plus className="size-4" />{ar ? "إضافة فئة" : "Add Category"}</button>
          </div>
          {loading ? <Skeleton className="m-4 h-[360px] rounded-xl" /> : categoryList.length === 0 ? <Empty icon={<Tags className="size-8" />} title={ar ? "لا توجد فئات بعد" : "No categories yet"} hint={ar ? "أضف أول فئة لتنظيم القائمة." : "Add your first category to organize the menu."} /> : <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">{categoryList.map((category) => {
            const count = standardProducts.filter((item) => item.category_id === category.id).length;
            return <article key={category.id} className="rounded-2xl border border-border bg-card p-4 shadow-sm"><div className="flex items-start gap-3"><span className="grid size-11 shrink-0 place-items-center rounded-xl bg-orange-50 text-[#e85d2a] dark:bg-orange-950/30"><Tags className="size-5" /></span><div className="min-w-0 flex-1"><h4 className="truncate text-sm font-bold">{pick(category.name_en, category.name_ar)}</h4><p className="mt-1 text-[11px] text-muted-foreground">{count} {count === 1 ? (ar ? "منتج" : "product") : (ar ? "منتجات" : "products")}</p></div><Switch checked={category.is_active} onCheckedChange={() => void toggleCategory(category)} aria-label={ar ? "حالة الفئة" : "Category status"} /></div><button type="button" className="qs-button-secondary mt-4 w-full" onClick={() => setCategoryForm({ id: category.id, name_en: category.name_en, name_ar: category.name_ar, is_active: category.is_active })}><Pencil className="size-4" />{ar ? "تعديل / إعادة تسمية" : "Edit / Rename"}</button></article>;
          })}</div>}
        </section>
      ) : (
        <>
          <div className="rounded-xl border border-orange-500/20 bg-orange-500/[.06] px-4 py-3 text-xs leading-5 text-muted-foreground"><strong className="text-foreground">{ar ? "القائمة العادية:" : "Standard Menu:"}</strong>{" "}{ar ? "المنتجات هنا منفصلة عن المنتجات المرتبطة بمناطق PDF." : "Products here stay separate from PDF hotspot products."}</div>

          <section className="qs-card overflow-hidden">
            <div className="grid gap-3 border-b border-border p-4 md:grid-cols-[minmax(0,1fr)_180px_180px_auto]">
              <div className="relative"><Search className="pointer-events-none absolute start-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={mode === "pricing" ? (ar ? "ابحث عن منتج لتعديل سعره..." : "Search products to update pricing...") : (ar ? "ابحث في المنتجات..." : "Search Standard Menu products...")} className="qs-control h-11 ps-11" /></div>
              <Select value={categoryId} onValueChange={setCategoryId}><SelectTrigger className="h-11"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{ar ? "كل الفئات" : "All Categories"}</SelectItem>{categoryList.map((category) => <SelectItem key={category.id} value={category.id}>{pick(category.name_en, category.name_ar)}</SelectItem>)}</SelectContent></Select>
              <Select value={status} onValueChange={(value) => setStatus(value as typeof status)}><SelectTrigger className="h-11"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{ar ? "كل الحالات" : "All Statuses"}</SelectItem><SelectItem value="available">{ar ? "متاح" : "Available"}</SelectItem><SelectItem value="unavailable">{ar ? "غير متاح" : "Unavailable"}</SelectItem></SelectContent></Select>
              {mode === "products" ? <button type="button" className="qs-button-primary min-h-11" onClick={() => setProductForm(emptyProduct(categoryList[0]?.id ?? ""))}><Plus className="size-4" />{ar ? "إضافة منتج" : "Add Product"}</button> : <span className="hidden md:block" />}
            </div>

            {loading ? <Skeleton className="m-4 h-[420px] rounded-xl" /> : rows.length === 0 ? <Empty icon={mode === "pricing" ? <DollarSign className="size-8" /> : <ImageIcon className="size-8" />} title={ar ? "لا توجد منتجات مطابقة" : "No matching products"} hint={ar ? "غيّر الفلاتر أو أضف منتجاً من تبويب المنتجات." : "Adjust the filters or add a product from Products."} /> : mode === "pricing" ? (
              <>
                <div className="space-y-2 p-3 md:hidden">{rows.map((item) => { const category = categoryList.find((entry) => entry.id === item.category_id); return <article key={item.id} className="rounded-2xl border border-border bg-card p-4"><div className="flex items-center justify-between gap-3"><div className="min-w-0"><h4 className="truncate text-sm font-bold">{pick(item.name_en, item.name_ar)}</h4><p className="mt-1 text-[10px] text-muted-foreground">{category ? pick(category.name_en, category.name_ar) : (ar ? "بدون فئة" : "Uncategorized")}</p></div><strong>{formatMoney(item.price, currency, lang)}</strong></div><div className="mt-3 grid grid-cols-2 gap-2 text-xs"><Read label={ar ? "السعر قبل الخصم" : "Compare at"} value={item.compare_at_price ? formatMoney(item.compare_at_price, currency, lang) : "—"} /><Read label={ar ? "التحضير" : "Prep"} value={`${item.preparation_time} min`} /></div><div className="mt-3 flex items-center justify-between"><span className={cn("qs-status", item.is_available ? "bg-emerald-500/10 text-emerald-600" : "bg-slate-500/10 text-slate-500")}>{item.is_available ? (ar ? "متاح" : "Available") : (ar ? "غير متاح" : "Unavailable")}</span><button type="button" className="qs-button-secondary" onClick={() => editProduct(item)}><Pencil className="size-4" />{ar ? "تعديل" : "Edit"}</button></div></article>; })}</div>
                <div className="hidden overflow-x-auto md:block"><table className="qs-table min-w-[820px]"><thead><tr><th>{ar ? "المنتج" : "Product"}</th><th>{ar ? "الفئة" : "Category"}</th><th>{ar ? "السعر" : "Price"}</th><th>{ar ? "قبل الخصم" : "Compare at"}</th><th>{ar ? "وقت التحضير" : "Prep"}</th><th>{ar ? "التوفر" : "Availability"}</th><th /></tr></thead><tbody>{rows.map((item) => { const category = categoryList.find((entry) => entry.id === item.category_id); return <tr key={item.id}><td><strong>{pick(item.name_en, item.name_ar)}</strong></td><td className="text-muted-foreground">{category ? pick(category.name_en, category.name_ar) : "—"}</td><td className="font-bold">{formatMoney(item.price, currency, lang)}</td><td className="text-muted-foreground">{item.compare_at_price ? formatMoney(item.compare_at_price, currency, lang) : "—"}</td><td className="text-muted-foreground">{item.preparation_time} min</td><td><button type="button" onClick={() => void toggleAvailability(item)} className={cn("qs-status", item.is_available ? "bg-emerald-500/10 text-emerald-600" : "bg-slate-500/10 text-slate-500")}>{item.is_available ? (ar ? "متاح" : "Available") : (ar ? "غير متاح" : "Unavailable")}</button></td><td><button type="button" className="grid size-9 place-items-center rounded-lg border border-border hover:bg-muted" onClick={() => editProduct(item)} aria-label={ar ? "تعديل" : "Edit"}><Pencil className="size-4" /></button></td></tr>; })}</tbody></table></div>
              </>
            ) : (
              <>
                <div className="space-y-3 p-3 md:hidden">{rows.map((item) => { const category = categoryList.find((entry) => entry.id === item.category_id); return <article key={item.id} className="rounded-2xl border border-border bg-card p-4 shadow-sm"><div className="flex gap-3"><span className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-xl bg-muted">{item.image_url ? <img src={item.image_url} alt="" className="size-full object-cover" loading="lazy" /> : <UtensilsCrossed className="size-5 text-muted-foreground" />}</span><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><p className="truncate font-bold">{pick(item.name_en, item.name_ar)}</p><strong className="whitespace-nowrap text-sm">{formatMoney(item.price, currency, lang)}</strong></div><p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{pick(item.description_en, item.description_ar) || "—"}</p><div className="mt-2 flex flex-wrap gap-2"><span className="qs-status bg-orange-500/10 text-orange-600">{category ? pick(category.name_en, category.name_ar) : ar ? "بدون فئة" : "Uncategorized"}</span>{item.is_featured ? <span className="qs-status bg-amber-500/10 text-amber-600"><Crown className="size-3" />{ar ? "مميز" : "Featured"}</span> : null}</div></div></div><div className="mt-4 grid grid-cols-[1fr_auto] gap-2"><button type="button" onClick={() => editProduct(item)} className="qs-button-primary min-h-11"><Pencil className="size-4" />{ar ? "تعديل المنتج" : "Edit Product"}</button><button type="button" onClick={() => setDeleteItem(item)} className="grid min-h-11 min-w-11 place-items-center rounded-xl text-destructive hover:bg-destructive/10" aria-label={ar ? "حذف المنتج" : "Delete product"}><Trash2 className="size-4" /></button></div></article>; })}</div>
                <div className="hidden overflow-x-auto md:block"><table className="qs-table min-w-[900px]"><thead><tr><th>{ar ? "المنتج" : "Product"}</th><th>{ar ? "الفئة" : "Category"}</th><th>{ar ? "السعر" : "Price"}</th><th>{ar ? "وقت التحضير" : "Prep Time"}</th><th>{ar ? "الحالة" : "Status"}</th><th>{ar ? "إجراءات" : "Actions"}</th></tr></thead><tbody>{rows.map((item) => { const category = categoryList.find((entry) => entry.id === item.category_id); return <tr key={item.id}><td><div className="flex items-center gap-3"><span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-xl bg-muted">{item.image_url ? <img src={item.image_url} alt="" className="size-full object-cover" loading="lazy" /> : <UtensilsCrossed className="size-5 text-muted-foreground" />}</span><div className="min-w-0"><p className="truncate font-bold">{pick(item.name_en, item.name_ar)}</p><p className="mt-0.5 max-w-[340px] truncate text-[10px] text-muted-foreground">{pick(item.description_en, item.description_ar) || "—"}</p></div></div></td><td>{category ? pick(category.name_en, category.name_ar) : "—"}</td><td className="font-bold">{formatMoney(item.price, currency, lang)}</td><td className="text-muted-foreground">{item.preparation_time} min</td><td><button type="button" onClick={() => void toggleAvailability(item)} className={cn("qs-status", item.is_available ? "bg-emerald-500/10 text-emerald-600" : "bg-slate-500/10 text-slate-500")}>{item.is_available ? (ar ? "متاح" : "Available") : (ar ? "غير متاح" : "Unavailable")}</button></td><td><div className="flex gap-1.5"><button type="button" onClick={() => editProduct(item)} className="grid size-9 place-items-center rounded-lg border border-border hover:bg-muted" aria-label={ar ? "تعديل" : "Edit"}><Pencil className="size-4" /></button><button type="button" onClick={() => setDeleteItem(item)} className="grid size-9 place-items-center rounded-lg text-destructive hover:bg-destructive/10" aria-label={ar ? "حذف" : "Delete"}><Trash2 className="size-4" /></button></div></td></tr>; })}</tbody></table></div>
              </>
            )}
            <div className="flex items-center justify-between border-t border-border px-4 py-3 text-xs text-muted-foreground"><span>{ar ? `عرض ${rows.length} منتج` : `Showing ${rows.length} Standard Menu products`}</span><span>{mode === "pricing" ? (ar ? "الأسعار والخيارات" : "Pricing & Options") : (ar ? "المنتجات" : "Products")}</span></div>
          </section>
        </>
      )}

      <Dialog open={productForm !== null} onOpenChange={(open) => !open && setProductForm(null)}><DialogContent className="max-h-[88dvh] w-[calc(100vw-2rem)] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>{productForm?.id ? (ar ? "تعديل منتج القائمة العادية" : "Edit Standard Menu Product") : (ar ? "منتج قائمة عادية جديد" : "New Standard Menu Product")}</DialogTitle><DialogDescription>{ar ? "هذا المنتج ينتمي للقائمة العادية وليس لمناطق PDF." : "This product belongs to the Standard Menu, not PDF hotspots."}</DialogDescription></DialogHeader>{productForm ? <div className="space-y-4 py-2"><ImageUploader restaurantId={restaurantId} kind="product" value={productForm.image_url} onChange={(url) => setProductForm({ ...productForm, image_url: url })} label={ar ? "صورة المنتج" : "Product Image"} /><Field label={ar ? "اسم المنتج" : "Product Name"}><Input value={productForm.name_en} onChange={(event) => setProductForm({ ...productForm, name_en: event.target.value })} /></Field><Field label={ar ? "الاسم بالعربية" : "Arabic Name"}><Input dir="rtl" value={productForm.name_ar} onChange={(event) => setProductForm({ ...productForm, name_ar: event.target.value })} /></Field><Field label={ar ? "الفئة" : "Category"}><Select value={productForm.category_id} onValueChange={(value) => setProductForm({ ...productForm, category_id: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{categoryList.map((category) => <SelectItem key={category.id} value={category.id}>{pick(category.name_en, category.name_ar)}</SelectItem>)}</SelectContent></Select></Field><Field label={ar ? "الوصف" : "Description"}><Textarea className="min-h-28" value={productForm.description_en} onChange={(event) => setProductForm({ ...productForm, description_en: event.target.value })} /></Field><div className="grid gap-3 sm:grid-cols-3"><Field label={ar ? "السعر" : "Price"}><Input type="number" min="0" step="0.01" value={productForm.price} onChange={(event) => setProductForm({ ...productForm, price: event.target.value })} /></Field><Field label={ar ? "السعر قبل الخصم" : "Compare at"}><Input type="number" min="0" step="0.01" value={productForm.compare_at_price} onChange={(event) => setProductForm({ ...productForm, compare_at_price: event.target.value })} /></Field><Field label={ar ? "وقت التحضير" : "Prep Time"}><Input type="number" min="1" value={productForm.preparation_time} onChange={(event) => setProductForm({ ...productForm, preparation_time: event.target.value })} /></Field></div><label className="flex items-center justify-between rounded-xl border border-border p-3"><span><span className="flex items-center gap-2 text-sm font-bold"><Crown className="size-4 text-[#e85d2a]" />{ar ? "مميز" : "Mark as Best Seller"}</span><span className="mt-0.5 block text-[10px] text-muted-foreground">{ar ? "إظهار شارة مميزة" : "Show a best seller badge"}</span></span><Switch checked={productForm.is_featured} onCheckedChange={(value) => setProductForm({ ...productForm, is_featured: value })} /></label><label className="flex items-center justify-between rounded-xl border border-border p-3"><span><span className="block text-sm font-bold">{ar ? "التوفر" : "Availability"}</span><span className="mt-0.5 block text-[10px] text-muted-foreground">{ar ? "يظهر في القائمة ونقاط البيع" : "Visible on POS and online menus"}</span></span><Switch checked={productForm.is_available} onCheckedChange={(value) => setProductForm({ ...productForm, is_available: value })} /></label></div> : null}<DialogFooter className="mt-auto pt-4"><Button variant="ghost" onClick={() => setProductForm(null)}>{ar ? "إلغاء" : "Cancel"}</Button><Button disabled={busy || !productForm?.name_en.trim() || !productForm?.price} onClick={() => void saveProduct()} className="bg-[#e85d2a] text-white hover:bg-[#e94f00]">{busy ? (ar ? "جارٍ الحفظ…" : "Saving…") : (ar ? "حفظ المنتج" : "Save Product")}</Button></DialogFooter></DialogContent></Dialog>

      <Dialog open={categoryForm !== null} onOpenChange={(open) => !open && setCategoryForm(null)}><DialogContent className="sm:max-w-lg"><DialogHeader><DialogTitle>{categoryForm?.id ? (ar ? "تعديل الفئة" : "Edit Category") : (ar ? "فئة جديدة" : "New Category")}</DialogTitle><DialogDescription>{ar ? "نظم القائمة العادية باستخدام فئات واضحة." : "Organize the Standard Menu with clear categories."}</DialogDescription></DialogHeader>{categoryForm ? <div className="space-y-4"><Field label={ar ? "الاسم بالإنجليزية" : "English Name"}><Input value={categoryForm.name_en} onChange={(event) => setCategoryForm({ ...categoryForm, name_en: event.target.value })} /></Field><Field label={ar ? "الاسم بالعربية" : "Arabic Name"}><Input dir="rtl" value={categoryForm.name_ar} onChange={(event) => setCategoryForm({ ...categoryForm, name_ar: event.target.value })} /></Field><label className="flex items-center justify-between rounded-xl border border-border p-3"><span className="text-sm font-bold">{ar ? "الفئة نشطة" : "Active category"}</span><Switch checked={categoryForm.is_active} onCheckedChange={(value) => setCategoryForm({ ...categoryForm, is_active: value })} /></label></div> : null}<DialogFooter><Button variant="ghost" onClick={() => setCategoryForm(null)}>{ar ? "إلغاء" : "Cancel"}</Button><Button disabled={busy || !categoryForm?.name_en.trim()} onClick={() => void saveCategory()}>{ar ? "حفظ" : "Save"}</Button></DialogFooter></DialogContent></Dialog>

      <AlertDialog open={deleteItem !== null} onOpenChange={(open) => !open && setDeleteItem(null)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{ar ? "حذف المنتج؟" : "Delete menu product?"}</AlertDialogTitle><AlertDialogDescription>{deleteItem ? pick(deleteItem.name_en, deleteItem.name_ar) : ""}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>{ar ? "إلغاء" : "Cancel"}</AlertDialogCancel><AlertDialogAction disabled={busy} onClick={() => void removeProduct()}>{ar ? "حذف" : "Delete"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Empty({ icon, title, hint }: { icon: React.ReactNode; title: string; hint: string }) {
  return <div className="p-10 text-center sm:p-14"><span className="mx-auto grid size-12 place-items-center rounded-2xl bg-muted text-muted-foreground">{icon}</span><p className="mt-3 text-sm font-semibold">{title}</p><p className="mt-1 text-xs text-muted-foreground">{hint}</p></div>;
}
function Read({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-muted/40 p-3"><span className="block text-[10px] text-muted-foreground">{label}</span><strong className="mt-1 block text-xs">{value}</strong></div>;
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label className="text-xs font-bold">{label}</Label>{children}</div>;
}
