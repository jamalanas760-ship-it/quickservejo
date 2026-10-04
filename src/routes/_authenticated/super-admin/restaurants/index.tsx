import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Archive,
  ArchiveRestore,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Store,
  Trash2,
} from "lucide-react";
import { MasterPageHeader } from "@/components/app/MasterPage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import {
  RestaurantLifecycleDialog,
  type RestaurantLifecycleAction,
  type LifecycleRestaurant,
} from "@/components/superadmin/RestaurantLifecycle";
import { useRestaurantsWithStats, type RestaurantWithStats } from "@/hooks/useSuperAdmin";
import { formatMoney, formatNumber } from "@/lib/format";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/super-admin/restaurants/")({
  head: () => ({ meta: [{ title: "Restaurants — QuickServe admin" }] }),
  component: RestaurantsPage,
});
const EMPTY_RESTAURANTS: RestaurantWithStats[] = [];

function RestaurantsPage() {
  const { lang } = useI18n();
  const ar = lang === "ar";
  const restaurants = useRestaurantsWithStats();
  const [term, setTerm] = useState("");
  const [status, setStatus] = useState("all");
  const [plan, setPlan] = useState("all");
  const [target, setTarget] = useState<{
    restaurant: LifecycleRestaurant;
    action: RestaurantLifecycleAction;
  } | null>(null);
  const data = restaurants.data ?? EMPTY_RESTAURANTS;
  const plans = [...new Set(data.map((r) => r.subscription_plan).filter(Boolean))];
  const filtered = useMemo(() => {
    const q = term.trim().toLowerCase();
    return data.filter(
      (r) =>
        (status === "all" || stateOf(r) === status) &&
        (plan === "all" || r.subscription_plan === plan) &&
        (!q ||
          [r.name, r.slug, r.address_en, r.address_ar, r.email, r.phone]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(q)),
    );
  }, [data, term, status, plan]);
  const actions = (r: RestaurantWithStats) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-11 shrink-0"
          aria-label={`${ar ? "إجراءات" : "Actions for"} ${r.name}`}
        >
          <MoreHorizontal className="size-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="qs-admin-menu">
        <DropdownMenuItem asChild>
          <Link to="/super-admin/restaurants/$restaurantId" params={{ restaurantId: r.id }}>
            <Store />
            {ar ? "إدارة المطعم" : "Manage restaurant"}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/super-admin/restaurants/$restaurantId/edit" params={{ restaurantId: r.id }}>
            <Pencil />
            {ar ? "تعديل التفاصيل" : "Edit details"}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() =>
            setTarget({ restaurant: r, action: r.archived_at ? "restore" : "archive" })
          }
        >
          {r.archived_at ? <ArchiveRestore /> : <Archive />}
          {r.archived_at
            ? ar
              ? "استعادة المطعم"
              : "Restore restaurant"
            : ar
              ? "أرشفة المطعم"
              : "Archive restaurant"}
        </DropdownMenuItem>
        <DropdownMenuItem
          className="text-destructive"
          onSelect={() => setTarget({ restaurant: r, action: "delete" })}
        >
          <Trash2 />
          {ar ? "حذف نهائي" : "Delete permanently"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
  const statusBadge = (r: RestaurantWithStats) => (
    <span className={`qs-admin-status ${stateOf(r)}`}>
      {r.archived_at
        ? ar
          ? "مؤرشف"
          : "Archived"
        : r.is_active
          ? ar
            ? "نشط"
            : "Active"
          : ar
            ? "غير نشط"
            : "Inactive"}
    </span>
  );
  return (
    <div className="space-y-5">
      <MasterPageHeader
        title={ar ? "المطاعم" : "Restaurants"}
        description={ar ? "إدارة مساحات العمل لكل مطعم." : "Manage your restaurant workspaces."}
        actions={
          <Button asChild>
            <Link to="/super-admin/restaurants/new">
              <Plus className="size-4" />
              {ar ? "إضافة مطعم" : "Add restaurant"}
            </Link>
          </Button>
        }
      />
      <section className="qs-card min-w-0 overflow-hidden">
        <div className="qs-admin-directory-filters">
          <div className="relative">
            <Search className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label={ar ? "بحث المطاعم" : "Search restaurants"}
              placeholder={ar ? "ابحث عن مطعم..." : "Search restaurants..."}
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              className="ps-10"
            />
          </div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger aria-label="Restaurant status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{ar ? "كل الحالات" : "All statuses"}</SelectItem>
              <SelectItem value="active">{ar ? "نشط" : "Active"}</SelectItem>
              <SelectItem value="inactive">{ar ? "غير نشط" : "Inactive"}</SelectItem>
              <SelectItem value="archived">{ar ? "مؤرشف" : "Archived"}</SelectItem>
            </SelectContent>
          </Select>
          <Select value={plan} onValueChange={setPlan}>
            <SelectTrigger aria-label="Subscription plan">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{ar ? "كل الخطط" : "All plans"}</SelectItem>
              {plans.map((p) => (
                <SelectItem key={p} value={p}>
                  {p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {restaurants.isPending ? (
          <Skeleton className="m-4 h-72" />
        ) : restaurants.isError ? (
          <div className="p-5">
            <p>{ar ? "تعذر تحميل المطاعم." : "Restaurants could not be loaded."}</p>
            <Button variant="outline" onClick={() => void restaurants.refetch()}>
              {ar ? "إعادة المحاولة" : "Retry"}
            </Button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="grid min-h-48 place-content-center gap-3 p-5 text-center">
            <Store className="mx-auto size-7 text-muted-foreground" />
            <p>{ar ? "لا توجد مطاعم مطابقة" : "No matching restaurants"}</p>
            <Button
              variant="outline"
              onClick={() => {
                setTerm("");
                setStatus("all");
                setPlan("all");
              }}
            >
              {ar ? "مسح الفلاتر" : "Clear filters"}
            </Button>
          </div>
        ) : (
          <>
            <div className="md:hidden">
              {filtered.map((r) => (
                <article key={r.id} className="qs-admin-restaurant-row">
                  <Link
                    className="flex min-w-0 flex-1 items-center gap-3"
                    to="/super-admin/restaurants/$restaurantId"
                    params={{ restaurantId: r.id }}
                  >
                    <Logo r={r} />
                    <div className="min-w-0">
                      <h2 className="truncate text-sm font-bold">{r.name}</h2>
                      <p className="truncate text-xs text-muted-foreground">/{r.slug}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {statusBadge(r)}
                        <span className="text-xs text-muted-foreground capitalize">
                          {r.subscription_plan}
                        </span>
                      </div>
                    </div>
                  </Link>
                  {actions(r)}
                </article>
              ))}
            </div>
            <div className="hidden md:block">
              <table className="qs-table w-full">
                <thead>
                  <tr>
                    <th>{ar ? "المطعم" : "Restaurant"}</th>
                    <th>{ar ? "الحالة" : "Status"}</th>
                    <th>{ar ? "الخطة" : "Plan"}</th>
                    <th>{ar ? "الطلبات" : "Orders"}</th>
                    <th>{ar ? "الإيراد" : "Revenue"}</th>
                    <th>
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <Link
                          className="flex items-center gap-3"
                          to="/super-admin/restaurants/$restaurantId"
                          params={{ restaurantId: r.id }}
                        >
                          <Logo r={r} />
                          <span className="min-w-0">
                            <strong className="block break-words">{r.name}</strong>
                            <span className="text-xs text-muted-foreground">/{r.slug}</span>
                          </span>
                        </Link>
                      </td>
                      <td>{statusBadge(r)}</td>
                      <td className="capitalize">{r.subscription_plan}</td>
                      <td>{formatNumber(r.orderCount, lang)}</td>
                      <td>{formatMoney(r.revenue, r.currency, lang)}</td>
                      <td>{actions(r)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        <p className="border-t border-border px-4 py-3 text-xs text-muted-foreground">
          {ar
            ? `${filtered.length} من ${data.length} مطاعم`
            : `${filtered.length} of ${data.length} restaurants`}
        </p>
      </section>
      <RestaurantLifecycleDialog
        key={target ? `${target.restaurant.id}-${target.action}` : "closed"}
        restaurant={target?.restaurant ?? null}
        action={target?.action ?? null}
        onClose={() => setTarget(null)}
      />
    </div>
  );
}
function stateOf(r: { archived_at: string | null; is_active: boolean }) {
  return r.archived_at ? "archived" : r.is_active ? "active" : "inactive";
}
function Logo({ r }: { r: { name: string; logo_url: string | null } }) {
  return (
    <span className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-xl border border-border bg-muted">
      {r.logo_url ? (
        <img src={r.logo_url} alt="" className="size-full object-cover" />
      ) : (
        <Store className="size-5 text-primary" />
      )}
    </span>
  );
}
