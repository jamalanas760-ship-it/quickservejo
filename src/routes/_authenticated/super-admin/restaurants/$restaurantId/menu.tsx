import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { ImageUploader } from "@/components/media/ImageUploader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useRestaurant } from "@/hooks/useSuperAdmin";
import { useI18n } from "@/lib/i18n";
import { humanError } from "@/lib/errors";
import { logAudit } from "@/lib/audit";
import { formatMoney } from "@/lib/format";

export const Route = createFileRoute(
  "/_authenticated/super-admin/restaurants/$restaurantId/menu",
)({
  head: () => ({
    meta: [
      { title: "Menu builder — QuickServe admin" },
      {
        name: "description",
        content:
          "Build bilingual menu categories, products, prices, images and modifier groups for a tenant.",
      },
      { property: "og:title", content: "Menu builder — QuickServe admin" },
      { property: "og:description", content: "Categories, products and modifiers for a tenant." },
    ],
  }),
  component: MenuTab,
});

type CategoryForm = {
  id?: string;
  name_en: string;
  name_ar: string;
  description_en: string;
  description_ar: string;
  image_url: string | null;
  is_active: boolean;
};

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

const emptyCategory: CategoryForm = {
  name_en: "",
  name_ar: "",
  description_en: "",
  description_ar: "",
  image_url: null,
  is_active: true,
};

function emptyProduct(categoryId: string): ProductForm {
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

function MenuTab() {
  const { restaurantId } = Route.useParams();
  const { t, lang, pick } = useI18n();
  const queryClient = useQueryClient();
  const { data: restaurant } = useRestaurant(restaurantId);
  const currency = restaurant?.currency ?? "SAR";

  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [categoryForm, setCategoryForm] = useState<CategoryForm | null>(null);
  const [productForm, setProductForm] = useState<ProductForm | null>(null);
  const [busy, setBusy] = useState(false);

  const categories = useQuery({
    queryKey: ["platform", "categories", restaurantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("menu_categories")
        .select("*")
        .eq("restaurant_id", restaurantId)
        .order("display_order", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const activeCategory = selectedCategory ?? categories.data?.[0]?.id ?? null;

  const products = useQuery({
    queryKey: ["platform", "products", restaurantId, activeCategory],
    queryFn: async () => {
      let q = supabase
        .from("menu_items")
        .select("*")
        .eq("restaurant_id", restaurantId)
        .order("display_order", { ascending: true });
      if (activeCategory) q = q.eq("category_id", activeCategory);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["platform"] });
  }

  async function saveCategory() {
    if (!categoryForm) return;
    setBusy(true);
    try {
      const payload = {
        restaurant_id: restaurantId,
        name_en: categoryForm.name_en.trim(),
        name_ar: categoryForm.name_ar.trim() || categoryForm.name_en.trim(),
        description_en: categoryForm.description_en.trim() || null,
        description_ar: categoryForm.description_ar.trim() || null,
        image_url: categoryForm.image_url,
        is_active: categoryForm.is_active,
        display_order: (categories.data ?? []).length,
      };
      if (categoryForm.id) {
        const { error } = await supabase
          .from("menu_categories")
          .update(payload)
          .eq("id", categoryForm.id);
        if (error) throw error;
        await logAudit("category.updated", {
          restaurantId,
          entity: "menu_categories",
          entityId: categoryForm.id,
        });
      } else {
        const { error } = await supabase.from("menu_categories").insert(payload);
        if (error) throw error;
        await logAudit("category.created", { restaurantId, entity: "menu_categories" });
      }
      await refresh();
      setCategoryForm(null);
      toast.success(t("common.saved"));
    } catch (error) {
      toast.error(humanError(error, lang));
    } finally {
      setBusy(false);
    }
  }

  async function saveProduct() {
    if (!productForm) return;
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
        compare_at_price: productForm.compare_at_price
          ? Number(productForm.compare_at_price)
          : null,
        image_url: productForm.image_url,
        preparation_time: Number(productForm.preparation_time) || 15,
        is_available: productForm.is_available,
        is_featured: productForm.is_featured,
        display_order: (products.data ?? []).length,
      };
      if (productForm.id) {
        const { error } = await supabase.from("menu_items").update(payload).eq("id", productForm.id);
        if (error) throw error;
        await logAudit("product.updated", {
          restaurantId,
          entity: "menu_items",
          entityId: productForm.id,
        });
      } else {
        const { error } = await supabase.from("menu_items").insert(payload);
        if (error) throw error;
        await logAudit("product.created", { restaurantId, entity: "menu_items" });
      }
      await refresh();
      setProductForm(null);
      toast.success(t("common.saved"));
    } catch (error) {
      toast.error(humanError(error, lang));
    } finally {
      setBusy(false);
    }
  }

  async function toggleAvailability(id: string, available: boolean) {
    try {
      const { error } = await supabase
        .from("menu_items")
        .update({ is_available: !available })
        .eq("id", id);
      if (error) throw error;
      await logAudit("product.updated", { restaurantId, entity: "menu_items", entityId: id });
      await refresh();
    } catch (error) {
      toast.error(humanError(error, lang));
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
      <aside className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">{t("sa.menu.categories")}</h2>
          <Button size="sm" variant="outline" onClick={() => setCategoryForm(emptyCategory)}>
            {t("sa.menu.newCategory")}
          </Button>
        </div>
        {categories.isPending ? (
          <Skeleton className="h-40 rounded-xl" />
        ) : (categories.data ?? []).length === 0 ? (
          <p className="panel p-4 text-sm text-muted-foreground">
            {t("sa.menu.emptyCategories")}
          </p>
        ) : (
          <ul className="panel divide-y">
            {(categories.data ?? []).map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2 p-3">
                <button
                  type="button"
                  className={`text-start text-sm font-medium ${
                    activeCategory === c.id ? "text-foreground" : "text-muted-foreground"
                  }`}
                  onClick={() => setSelectedCategory(c.id)}
                >
                  {pick(c.name_en, c.name_ar)}
                </button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    setCategoryForm({
                      id: c.id,
                      name_en: c.name_en,
                      name_ar: c.name_ar,
                      description_en: c.description_en ?? "",
                      description_ar: c.description_ar ?? "",
                      image_url: c.image_url,
                      is_active: c.is_active,
                    })
                  }
                >
                  {t("common.edit")}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </aside>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">{t("sa.menu.products")}</h2>
          <Button
            size="sm"
            disabled={!activeCategory}
            onClick={() => setProductForm(emptyProduct(activeCategory ?? ""))}
          >
            {t("sa.menu.newProduct")}
          </Button>
        </div>
        {products.isPending ? (
          <Skeleton className="h-64 rounded-xl" />
        ) : (products.data ?? []).length === 0 ? (
          <p className="panel p-8 text-center text-sm text-muted-foreground">
            {t("sa.menu.emptyProducts")}
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {(products.data ?? []).map((p) => (
              <div key={p.id} className="panel flex gap-3 p-4">
                <div className="size-16 shrink-0 overflow-hidden rounded-md border bg-muted">
                  {p.image_url ? (
                    <img
                      src={p.image_url}
                      alt={pick(p.name_en, p.name_ar)}
                      className="size-full object-cover"
                      loading="lazy"
                    />
                  ) : null}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="truncate font-medium">{pick(p.name_en, p.name_ar)}</p>
                    <Badge variant={p.is_available ? "secondary" : "outline"}>
                      {p.is_available ? t("sa.menu.available") : t("common.inactive")}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {formatMoney(p.price, currency, lang)}
                  </p>
                  <div className="mt-2 flex gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        setProductForm({
                          id: p.id,
                          category_id: p.category_id ?? "",
                          name_en: p.name_en,
                          name_ar: p.name_ar,
                          description_en: p.description_en ?? "",
                          description_ar: p.description_ar ?? "",
                          price: String(p.price),
                          compare_at_price: p.compare_at_price ? String(p.compare_at_price) : "",
                          image_url: p.image_url,
                          preparation_time: String(p.preparation_time),
                          is_available: p.is_available,
                          is_featured: p.is_featured,
                        })
                      }
                    >
                      {t("common.edit")}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void toggleAvailability(p.id, p.is_available)}
                    >
                      {p.is_available ? t("sa.staff.deactivate") : t("sa.staff.reactivate")}
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <Dialog open={categoryForm !== null} onOpenChange={(o) => !o && setCategoryForm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("sa.menu.category")}</DialogTitle>
            <DialogDescription>{t("sa.menu.categories")}</DialogDescription>
          </DialogHeader>
          {categoryForm ? (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>{t("sa.menu.nameEn")}</Label>
                  <Input
                    value={categoryForm.name_en}
                    onChange={(e) =>
                      setCategoryForm({ ...categoryForm, name_en: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("sa.menu.nameAr")}</Label>
                  <Input
                    dir="rtl"
                    value={categoryForm.name_ar}
                    onChange={(e) =>
                      setCategoryForm({ ...categoryForm, name_ar: e.target.value })
                    }
                  />
                </div>
              </div>
              <Textarea
                placeholder={t("sa.field.descEn")}
                value={categoryForm.description_en}
                onChange={(e) =>
                  setCategoryForm({ ...categoryForm, description_en: e.target.value })
                }
              />
              <Textarea
                dir="rtl"
                placeholder={t("sa.field.descAr")}
                value={categoryForm.description_ar}
                onChange={(e) =>
                  setCategoryForm({ ...categoryForm, description_ar: e.target.value })
                }
              />
              <ImageUploader
                restaurantId={restaurantId}
                kind="category"
                value={categoryForm.image_url}
                onChange={(url) => setCategoryForm({ ...categoryForm, image_url: url })}
                label={t("sa.menu.image")}
                aspect="wide"
              />
              <div className="flex items-center gap-3">
                <Switch
                  checked={categoryForm.is_active}
                  onCheckedChange={(v) => setCategoryForm({ ...categoryForm, is_active: v })}
                />
                <Label>{t("common.active")}</Label>
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCategoryForm(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              disabled={busy || !categoryForm?.name_en.trim()}
              onClick={() => void saveCategory()}
            >
              {t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={productForm !== null} onOpenChange={(o) => !o && setProductForm(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("sa.menu.newProduct")}</DialogTitle>
            <DialogDescription>{t("sa.menu.products")}</DialogDescription>
          </DialogHeader>
          {productForm ? (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>{t("sa.menu.category")}</Label>
                <Select
                  value={productForm.category_id}
                  onValueChange={(v) => setProductForm({ ...productForm, category_id: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(categories.data ?? []).map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {pick(c.name_en, c.name_ar)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>{t("sa.menu.nameEn")}</Label>
                  <Input
                    value={productForm.name_en}
                    onChange={(e) => setProductForm({ ...productForm, name_en: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("sa.menu.nameAr")}</Label>
                  <Input
                    dir="rtl"
                    value={productForm.name_ar}
                    onChange={(e) => setProductForm({ ...productForm, name_ar: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("sa.menu.price")}</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={productForm.price}
                    onChange={(e) => setProductForm({ ...productForm, price: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("sa.menu.prepTime")}</Label>
                  <Input
                    type="number"
                    min="1"
                    value={productForm.preparation_time}
                    onChange={(e) =>
                      setProductForm({ ...productForm, preparation_time: e.target.value })
                    }
                  />
                </div>
              </div>
              <Textarea
                placeholder={t("sa.field.descEn")}
                value={productForm.description_en}
                onChange={(e) =>
                  setProductForm({ ...productForm, description_en: e.target.value })
                }
              />
              <Textarea
                dir="rtl"
                placeholder={t("sa.field.descAr")}
                value={productForm.description_ar}
                onChange={(e) =>
                  setProductForm({ ...productForm, description_ar: e.target.value })
                }
              />
              <ImageUploader
                restaurantId={restaurantId}
                kind="product"
                value={productForm.image_url}
                onChange={(url) => setProductForm({ ...productForm, image_url: url })}
                label={t("sa.menu.image")}
              />
              <div className="flex flex-wrap gap-6">
                <div className="flex items-center gap-3">
                  <Switch
                    checked={productForm.is_available}
                    onCheckedChange={(v) => setProductForm({ ...productForm, is_available: v })}
                  />
                  <Label>{t("sa.menu.available")}</Label>
                </div>
                <div className="flex items-center gap-3">
                  <Switch
                    checked={productForm.is_featured}
                    onCheckedChange={(v) => setProductForm({ ...productForm, is_featured: v })}
                  />
                  <Label>{t("sa.menu.featured")}</Label>
                </div>
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setProductForm(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              disabled={busy || !productForm?.name_en.trim() || !productForm?.price}
              onClick={() => void saveProduct()}
            >
              {t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
