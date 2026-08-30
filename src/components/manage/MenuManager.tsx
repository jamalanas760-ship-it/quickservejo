import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  ArrowDown,
  ArrowUp,
  Copy,
  Filter,
  GripVertical,
  PauseCircle,
  PlayCircle,
  Search,
  Sliders,
  Trash2,
} from "lucide-react";

import { ImageUploader } from "@/components/media/ImageUploader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { useRestaurant } from "@/hooks/useSuperAdmin";
import { useI18n } from "@/lib/i18n";
import { humanError } from "@/lib/errors";
import { logAudit } from "@/lib/audit";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Database } from "@/integrations/supabase/types";

type CategoryRow = Database["public"]["Tables"]["menu_categories"]["Row"];
type ItemRow = Database["public"]["Tables"]["menu_items"]["Row"];
type GroupRow = Database["public"]["Tables"]["modifier_groups"]["Row"];
type ModifierRow = Database["public"]["Tables"]["item_modifiers"]["Row"];

type CategoryForm = {
  id?: string;
  name_en: string;
  name_ar: string;
  description_en: string;
  description_ar: string;
  image_url: string | null;
  display_order: string;
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

const emptyCategory = (order: number): CategoryForm => ({
  name_en: "",
  name_ar: "",
  description_en: "",
  description_ar: "",
  image_url: null,
  display_order: String(order),
  is_active: true,
});

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

/**
 * Menu builder for one restaurant. `restaurantId` is always written into every
 * insert, and the database RLS policies re-check that the signed-in user may
 * manage that exact restaurant — the selection here is never trusted alone.
 */
export function MenuManager({ restaurantId }: { restaurantId: string }) {
  const { t, lang, pick } = useI18n();
  const queryClient = useQueryClient();
  const { data: restaurant } = useRestaurant(restaurantId);
  const currency = restaurant?.currency ?? "JOD";

  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [categoryForm, setCategoryForm] = useState<CategoryForm | null>(null);
  const [productForm, setProductForm] = useState<ProductForm | null>(null);
  const [modifierProduct, setModifierProduct] = useState<ItemRow | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<
    { kind: "category" | "product"; id: string; label: string } | null
  >(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "available" | "unavailable">("all");
  const [busy, setBusy] = useState(false);

  const categories = useQuery<CategoryRow[]>({
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

  const categoryList = categories.data ?? [];
  const activeCategory = selectedCategory ?? categoryList[0]?.id ?? null;

  const products = useQuery<ItemRow[]>({
    queryKey: ["platform", "products", restaurantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("menu_items")
        .select("*")
        .eq("restaurant_id", restaurantId)
        .order("display_order", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const needle = search.trim().toLowerCase();
  const visibleProducts = (products.data ?? [])
    .filter((p) => {
      if (needle) {
        return [p.name_en, p.name_ar, p.description_en, p.description_ar]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(needle));
      }
      return p.category_id === activeCategory;
    })
    .filter((p) => {
      if (statusFilter === "available") return p.is_available;
      if (statusFilter === "unavailable") return !p.is_available;
      return true;
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
        display_order: Number(categoryForm.display_order) || 0,
      };
      if (categoryForm.id) {
        const { error } = await supabase
          .from("menu_categories")
          .update(payload)
          .eq("id", categoryForm.id)
          .eq("restaurant_id", restaurantId);
        if (error) throw error;
        await logAudit("category.updated", {
          restaurantId,
          entity: "menu_categories",
          entityId: categoryForm.id,
        });
      } else {
        const { data, error } = await supabase
          .from("menu_categories")
          .insert(payload)
          .select("id")
          .single();
        if (error) throw error;
        await logAudit("category.created", {
          restaurantId,
          entity: "menu_categories",
          entityId: data.id,
        });
        setSelectedCategory(data.id);
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
      };
      if (productForm.id) {
        const { error } = await supabase
          .from("menu_items")
          .update(payload)
          .eq("id", productForm.id)
          .eq("restaurant_id", restaurantId);
        if (error) throw error;
        await logAudit("product.updated", {
          restaurantId,
          entity: "menu_items",
          entityId: productForm.id,
        });
      } else {
        const { error } = await supabase.from("menu_items").insert({
          ...payload,
          display_order: (products.data ?? []).filter(
            (p) => p.category_id === productForm.category_id,
          ).length,
        });
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

  async function duplicateProduct(product: ItemRow) {
    try {
      const { id: _id, created_at: _c, updated_at: _u, ...rest } = product;
      const { error } = await supabase.from("menu_items").insert({
        ...rest,
        // The copy stays inside the same tenant, with a fresh id from the DB.
        restaurant_id: restaurantId,
        name_en: `${product.name_en} (copy)`,
        name_ar: `${product.name_ar} (نسخة)`,
        display_order: product.display_order + 1,
      });
      if (error) throw error;
      await logAudit("product.duplicated", {
        restaurantId,
        entity: "menu_items",
        entityId: product.id,
      });
      await refresh();
      toast.success(t("common.saved"));
    } catch (error) {
      toast.error(humanError(error, lang));
    }
  }

  async function toggleAvailability(product: ItemRow) {
    try {
      const { error } = await supabase
        .from("menu_items")
        .update({ is_available: !product.is_available })
        .eq("id", product.id)
        .eq("restaurant_id", restaurantId);
      if (error) throw error;
      await refresh();
    } catch (error) {
      toast.error(humanError(error, lang));
    }
  }

  async function removeEntity() {
    if (!confirmDelete) return;
    setBusy(true);
    try {
      const table = confirmDelete.kind === "category" ? "menu_categories" : "menu_items";
      const { error } = await supabase
        .from(table)
        .delete()
        .eq("id", confirmDelete.id)
        .eq("restaurant_id", restaurantId);
      if (error) throw error;
      await logAudit(`${confirmDelete.kind}.deleted`, {
        restaurantId,
        entity: table,
        entityId: confirmDelete.id,
      });
      if (confirmDelete.kind === "category" && selectedCategory === confirmDelete.id) {
        setSelectedCategory(null);
      }
      await refresh();
      setConfirmDelete(null);
      toast.success(t("common.saved"));
    } catch (error) {
      toast.error(humanError(error, lang));
    } finally {
      setBusy(false);
    }
  }

  /** Persists display_order for a reordered list (drag & drop or arrows). */
  async function persistOrder(
    table: "menu_categories" | "menu_items",
    ordered: { id: string }[],
  ) {
    try {
      await Promise.all(
        ordered.map((row, index) =>
          supabase
            .from(table)
            .update({ display_order: index })
            .eq("id", row.id)
            .eq("restaurant_id", restaurantId),
        ),
      );
      await refresh();
    } catch (error) {
      toast.error(humanError(error, lang));
    }
  }

  function move<T extends { id: string }>(list: T[], from: number, to: number): T[] {
    if (to < 0 || to >= list.length) return list;
    const next = [...list];
    const [row] = next.splice(from, 1);
    if (row) next.splice(to, 0, row);
    return next;
  }

  const [dragCategory, setDragCategory] = useState<string | null>(null);
  const [dragProduct, setDragProduct] = useState<string | null>(null);

  const showEmptyState =
    !categories.isPending && !products.isPending && (products.data ?? []).length === 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">
            {restaurant?.name ? `${restaurant.name} — ${t("sa.detail.menu")}` : t("sa.detail.menu")}
          </h1>
          <p className="text-sm text-muted-foreground">{t("sa.menu.hierarchy")}</p>
        </div>
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <div className="relative flex-1 sm:w-72">
            <Search
              className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              className="ps-9"
              placeholder={t("sa.menu.searchPlaceholder")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="icon"
                variant="outline"
                className={cn("shrink-0", statusFilter !== "all" && "border-primary text-primary")}
                aria-label={t("sa.menu.filter")}
              >
                <Filter className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>{t("sa.menu.filter")}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuRadioGroup
                value={statusFilter}
                onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}
              >
                <DropdownMenuRadioItem value="all">{t("common.all")}</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="available">
                  {t("sa.menu.available")}
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="unavailable">
                  {t("common.inactive")}
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {showEmptyState ? (
        <div className="panel space-y-3 p-8 text-center">
          <h2 className="text-lg font-semibold">{t("sa.menu.emptyTitle")}</h2>
          <p className="text-sm text-muted-foreground">{t("sa.menu.emptyBody")}</p>
          <div className="flex flex-wrap justify-center gap-2 pt-2">
            <Button onClick={() => setCategoryForm(emptyCategory(categoryList.length))}>
              {t("sa.menu.newCategory")}
            </Button>
            <Button
              variant="outline"
              disabled={!activeCategory}
              onClick={() => setProductForm(emptyProduct(activeCategory ?? ""))}
            >
              {t("sa.menu.newProduct")}
            </Button>
          </div>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <aside className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">{t("sa.menu.categories")}</h2>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setCategoryForm(emptyCategory(categoryList.length))}
            >
              {t("sa.menu.newCategory")}
            </Button>
          </div>
          {categories.isPending ? (
            <Skeleton className="h-40 rounded-xl" />
          ) : categoryList.length === 0 ? (
            <p className="panel p-4 text-sm text-muted-foreground">{t("sa.menu.emptyCategories")}</p>
          ) : (
            <ul className="panel divide-y">
              {categoryList.map((c, index) => (
                <li
                  key={c.id}
                  draggable
                  onDragStart={() => setDragCategory(c.id)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => {
                    if (!dragCategory || dragCategory === c.id) return;
                    const from = categoryList.findIndex((x) => x.id === dragCategory);
                    void persistOrder("menu_categories", move(categoryList, from, index));
                    setDragCategory(null);
                  }}
                  className="flex items-center gap-1 p-2"
                >
                  <span className="shrink-0 cursor-grab text-muted-foreground/60" aria-hidden>
                    <GripVertical className="size-4" />
                  </span>
                  <button
                    type="button"
                    className={`flex-1 truncate px-1 text-start text-sm font-medium ${
                      activeCategory === c.id ? "text-foreground" : "text-muted-foreground"
                    }`}
                    onClick={() => {
                      setSearch("");
                      setSelectedCategory(c.id);
                    }}
                  >
                    {pick(c.name_en, c.name_ar)}
                    {!c.is_active ? (
                      <Badge variant="outline" className="ms-2">
                        {t("common.inactive")}
                      </Badge>
                    ) : null}
                  </button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={t("sa.menu.moveUp")}
                    disabled={index === 0}
                    onClick={() =>
                      void persistOrder("menu_categories", move(categoryList, index, index - 1))
                    }
                  >
                    <ArrowUp className="size-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={t("sa.menu.moveDown")}
                    disabled={index === categoryList.length - 1}
                    onClick={() =>
                      void persistOrder("menu_categories", move(categoryList, index, index + 1))
                    }
                  >
                    <ArrowDown className="size-4" />
                  </Button>
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
                        display_order: String(c.display_order),
                        is_active: c.is_active,
                      })
                    }
                  >
                    {t("common.edit")}
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={t("common.delete")}
                    onClick={() =>
                      setConfirmDelete({
                        kind: "category",
                        id: c.id,
                        label: pick(c.name_en, c.name_ar) ?? c.name_en,
                      })
                    }
                  >
                    <Trash2 className="size-4 text-destructive" />
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
          ) : visibleProducts.length === 0 ? (
            <p className="panel p-8 text-center text-sm text-muted-foreground">
              {t("sa.menu.emptyProducts")}
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {visibleProducts.map((p, index) => (
                <div
                  key={p.id}
                  draggable={!needle}
                  onDragStart={() => setDragProduct(p.id)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => {
                    if (needle || !dragProduct || dragProduct === p.id) return;
                    const from = visibleProducts.findIndex((x) => x.id === dragProduct);
                    void persistOrder("menu_items", move(visibleProducts, from, index));
                    setDragProduct(null);
                  }}
                  className="panel flex gap-3 p-4"
                >
                  <div className="size-16 shrink-0 overflow-hidden rounded-md border bg-muted">
                    {p.image_url ? (
                      <img
                        src={p.image_url}
                        alt={pick(p.name_en, p.name_ar) ?? p.name_en}
                        className="size-full object-cover"
                        loading="lazy"
                      />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="truncate font-medium">{pick(p.name_en, p.name_ar)}</p>
                      <div className="flex shrink-0 gap-1">
                        {p.is_featured ? <Badge>{t("sa.menu.featured")}</Badge> : null}
                        <Badge variant={p.is_available ? "secondary" : "outline"}>
                          {p.is_available ? t("sa.menu.available") : t("common.inactive")}
                        </Badge>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {pick(
                        categoryList.find((c) => c.id === p.category_id)?.name_en,
                        categoryList.find((c) => c.id === p.category_id)?.name_ar,
                      ) ?? t("common.none")}
                    </p>
                    <p className="text-sm font-medium">{formatMoney(p.price, currency, lang)}</p>
                    <div className="mt-2 grid grid-cols-2 gap-1.5 sm:flex sm:flex-wrap">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setProductForm({
                            id: p.id,
                            category_id: p.category_id ?? "",
                            name_en: p.name_en,
                            name_ar: p.name_ar,
                            description_en: p.description_en ?? "",
                            description_ar: p.description_ar ?? "",
                            price: String(p.price),
                            compare_at_price: p.compare_at_price
                              ? String(p.compare_at_price)
                              : "",
                            image_url: p.image_url,
                            preparation_time: String(p.preparation_time),
                            is_available: p.is_available,
                            is_featured: p.is_featured,
                          })
                        }
                      >
                        {t("common.edit")}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setModifierProduct(p)}>
                        <Sliders className="me-1 size-4" />
                        {t("sa.menu.modifiers")}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => void duplicateProduct(p)}>
                        <Copy className="me-1 size-4" />
                        {t("sa.menu.duplicate")}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className={p.is_available ? "text-destructive" : "text-emerald-600"}
                        onClick={() => void toggleAvailability(p)}
                      >
                        {p.is_available ? (
                          <PauseCircle className="me-1 size-4" />
                        ) : (
                          <PlayCircle className="me-1 size-4" />
                        )}
                        {p.is_available ? t("sa.staff.deactivate") : t("sa.staff.reactivate")}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="col-span-2 text-destructive hover:text-destructive sm:col-span-1"
                        onClick={() =>
                          setConfirmDelete({
                            kind: "product",
                            id: p.id,
                            label: pick(p.name_en, p.name_ar) ?? p.name_en,
                          })
                        }
                      >
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Category dialog */}
      <Dialog open={categoryForm !== null} onOpenChange={(o) => !o && setCategoryForm(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
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
                    onChange={(e) => setCategoryForm({ ...categoryForm, name_en: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("sa.menu.nameAr")}</Label>
                  <Input
                    dir="rtl"
                    value={categoryForm.name_ar}
                    onChange={(e) => setCategoryForm({ ...categoryForm, name_ar: e.target.value })}
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
              <div className="space-y-1.5">
                <Label>{t("sa.menu.displayOrder")}</Label>
                <Input
                  type="number"
                  min="0"
                  value={categoryForm.display_order}
                  onChange={(e) =>
                    setCategoryForm({ ...categoryForm, display_order: e.target.value })
                  }
                />
              </div>
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

      {/* Product dialog */}
      <Dialog open={productForm !== null} onOpenChange={(o) => !o && setProductForm(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{productForm?.id ? t("common.edit") : t("sa.menu.newProduct")}</DialogTitle>
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
                    {categoryList.map((c) => (
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
                onChange={(e) => setProductForm({ ...productForm, description_en: e.target.value })}
              />
              <Textarea
                dir="rtl"
                placeholder={t("sa.field.descAr")}
                value={productForm.description_ar}
                onChange={(e) => setProductForm({ ...productForm, description_ar: e.target.value })}
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

      <ModifiersDialog
        restaurantId={restaurantId}
        product={modifierProduct}
        onClose={() => setModifierProduct(null)}
      />

      <AlertDialog open={confirmDelete !== null} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("common.delete")}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDelete?.label} — {t("common.dangerZone")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={() => void removeEntity()}>
              {t("common.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** Modifier groups and their options for a single product. */
function ModifiersDialog({
  restaurantId,
  product,
  onClose,
}: {
  restaurantId: string;
  product: ItemRow | null;
  onClose: () => void;
}) {
  const { t, lang, pick } = useI18n();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [groupDraft, setGroupDraft] = useState({
    name_en: "",
    name_ar: "",
    is_required: false,
    min_selection: "0",
    max_selection: "1",
  });
  const [optionDrafts, setOptionDrafts] = useState<
    Record<string, { name_en: string; name_ar: string; price_delta: string }>
  >({});

  const groups = useQuery<(GroupRow & { options: ModifierRow[] })[]>({
    queryKey: ["platform", "modifier-groups", product?.id],
    enabled: Boolean(product?.id),
    queryFn: async () => {
      const [g, m] = await Promise.all([
        supabase
          .from("modifier_groups")
          .select("*")
          .eq("menu_item_id", product!.id)
          .order("display_order", { ascending: true }),
        supabase
          .from("item_modifiers")
          .select("*")
          .eq("menu_item_id", product!.id)
          .order("display_order", { ascending: true }),
      ]);
      if (g.error) throw g.error;
      if (m.error) throw m.error;
      return (g.data ?? []).map((group) => ({
        ...group,
        options: (m.data ?? []).filter((o) => o.group_id === group.id),
      }));
    },
  });

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["platform", "modifier-groups"] });
  }

  async function addGroup() {
    if (!product) return;
    setBusy(true);
    try {
      const { error } = await supabase.from("modifier_groups").insert({
        restaurant_id: restaurantId,
        menu_item_id: product.id,
        name_en: groupDraft.name_en.trim(),
        name_ar: groupDraft.name_ar.trim() || groupDraft.name_en.trim(),
        is_required: groupDraft.is_required,
        min_selection: Number(groupDraft.min_selection) || 0,
        max_selection: Number(groupDraft.max_selection) || 1,
        display_order: (groups.data ?? []).length,
      });
      if (error) throw error;
      setGroupDraft({
        name_en: "",
        name_ar: "",
        is_required: false,
        min_selection: "0",
        max_selection: "1",
      });
      await refresh();
    } catch (error) {
      toast.error(humanError(error, lang));
    } finally {
      setBusy(false);
    }
  }

  async function addOption(group: GroupRow & { options: ModifierRow[] }) {
    const draft = optionDrafts[group.id];
    if (!product || !draft?.name_en.trim()) return;
    setBusy(true);
    try {
      const { error } = await supabase.from("item_modifiers").insert({
        restaurant_id: restaurantId,
        group_id: group.id,
        menu_item_id: product.id,
        name_en: draft.name_en.trim(),
        name_ar: draft.name_ar.trim() || draft.name_en.trim(),
        price_delta: Number(draft.price_delta) || 0,
        display_order: group.options.length,
      });
      if (error) throw error;
      setOptionDrafts((prev) => ({
        ...prev,
        [group.id]: { name_en: "", name_ar: "", price_delta: "0" },
      }));
      await refresh();
    } catch (error) {
      toast.error(humanError(error, lang));
    } finally {
      setBusy(false);
    }
  }

  async function remove(table: "modifier_groups" | "item_modifiers", id: string) {
    try {
      const { error } = await supabase
        .from(table)
        .delete()
        .eq("id", id)
        .eq("restaurant_id", restaurantId);
      if (error) throw error;
      await refresh();
    } catch (error) {
      toast.error(humanError(error, lang));
    }
  }

  return (
    <Dialog open={product !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("sa.menu.modifiers")}</DialogTitle>
          <DialogDescription>
            {product ? pick(product.name_en, product.name_ar) : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {(groups.data ?? []).map((group) => (
            <div key={group.id} className="panel space-y-3 p-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="font-medium">{pick(group.name_en, group.name_ar)}</p>
                  <p className="text-xs text-muted-foreground">
                    {group.is_required ? t("sa.menu.required") : t("sa.menu.optional")} ·{" "}
                    {t("sa.menu.minMax")}: {group.min_selection}/{group.max_selection}
                  </p>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={t("common.delete")}
                  onClick={() => void remove("modifier_groups", group.id)}
                >
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </div>
              <ul className="divide-y text-sm">
                {group.options.map((o) => (
                  <li key={o.id} className="flex items-center justify-between gap-2 py-2">
                    <span>{pick(o.name_en, o.name_ar)}</span>
                    <span className="flex items-center gap-2 text-muted-foreground">
                      +{Number(o.price_delta).toFixed(2)}
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={t("common.delete")}
                        onClick={() => void remove("item_modifiers", o.id)}
                      >
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </span>
                  </li>
                ))}
              </ul>
              <div className="grid gap-2 sm:grid-cols-[1fr_1fr_100px_auto]">
                <Input
                  placeholder={t("sa.menu.nameEn")}
                  value={optionDrafts[group.id]?.name_en ?? ""}
                  onChange={(e) =>
                    setOptionDrafts((prev) => ({
                      ...prev,
                      [group.id]: {
                        name_ar: prev[group.id]?.name_ar ?? "",
                        price_delta: prev[group.id]?.price_delta ?? "0",
                        name_en: e.target.value,
                      },
                    }))
                  }
                />
                <Input
                  dir="rtl"
                  placeholder={t("sa.menu.nameAr")}
                  value={optionDrafts[group.id]?.name_ar ?? ""}
                  onChange={(e) =>
                    setOptionDrafts((prev) => ({
                      ...prev,
                      [group.id]: {
                        name_en: prev[group.id]?.name_en ?? "",
                        price_delta: prev[group.id]?.price_delta ?? "0",
                        name_ar: e.target.value,
                      },
                    }))
                  }
                />
                <Input
                  type="number"
                  step="0.01"
                  placeholder={t("sa.menu.priceDelta")}
                  value={optionDrafts[group.id]?.price_delta ?? ""}
                  onChange={(e) =>
                    setOptionDrafts((prev) => ({
                      ...prev,
                      [group.id]: {
                        name_en: prev[group.id]?.name_en ?? "",
                        name_ar: prev[group.id]?.name_ar ?? "",
                        price_delta: e.target.value,
                      },
                    }))
                  }
                />
                <Button size="sm" disabled={busy} onClick={() => void addOption(group)}>
                  {t("sa.menu.newModifier")}
                </Button>
              </div>
            </div>
          ))}

          <div className="panel space-y-3 p-4">
            <p className="font-medium">{t("sa.menu.newModifierGroup")}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <Input
                placeholder={t("sa.menu.nameEn")}
                value={groupDraft.name_en}
                onChange={(e) => setGroupDraft({ ...groupDraft, name_en: e.target.value })}
              />
              <Input
                dir="rtl"
                placeholder={t("sa.menu.nameAr")}
                value={groupDraft.name_ar}
                onChange={(e) => setGroupDraft({ ...groupDraft, name_ar: e.target.value })}
              />
              <div className="space-y-1.5">
                <Label>{t("sa.menu.minMax")}</Label>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    min="0"
                    value={groupDraft.min_selection}
                    onChange={(e) =>
                      setGroupDraft({ ...groupDraft, min_selection: e.target.value })
                    }
                  />
                  <Input
                    type="number"
                    min="1"
                    value={groupDraft.max_selection}
                    onChange={(e) =>
                      setGroupDraft({ ...groupDraft, max_selection: e.target.value })
                    }
                  />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Switch
                  checked={groupDraft.is_required}
                  onCheckedChange={(v) => setGroupDraft({ ...groupDraft, is_required: v })}
                />
                <Label>{t("sa.menu.required")}</Label>
              </div>
            </div>
            <Button
              size="sm"
              disabled={busy || !groupDraft.name_en.trim()}
              onClick={() => void addGroup()}
            >
              {t("sa.menu.newModifierGroup")}
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {t("common.close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
