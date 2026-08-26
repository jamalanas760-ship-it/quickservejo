import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";

type Hit = { id: string; title: string; subtitle: string; to: string; params?: Record<string, string> };

export function GlobalSearch({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const [term, setTerm] = useState("");

  useEffect(() => {
    if (!open) setTerm("");
  }, [open]);

  const query = useQuery({
    queryKey: ["platform", "global-search", term],
    enabled: open && term.trim().length >= 2,
    queryFn: async () => {
      const needle = `%${term.trim()}%`;
      const [restaurants, orders, staff, products] = await Promise.all([
        supabase
          .from("restaurants")
          .select("id, name, slug")
          .or(`name.ilike.${needle},slug.ilike.${needle},email.ilike.${needle},phone.ilike.${needle}`)
          .limit(6),
        supabase
          .from("orders")
          .select("id, order_number, restaurant_id, total, restaurant:restaurants(name)")
          .ilike("order_number", needle)
          .limit(6),
        supabase
          .from("staff")
          .select("id, name, email, role, restaurant_id")
          .or(`name.ilike.${needle},email.ilike.${needle}`)
          .limit(6),
        supabase
          .from("menu_items")
          .select("id, name_en, name_ar, restaurant_id")
          .or(`name_en.ilike.${needle},name_ar.ilike.${needle}`)
          .limit(6),
      ]);
      return {
        restaurants: (restaurants.data ?? []).map<Hit>((r) => ({
          id: r.id,
          title: r.name,
          subtitle: `/${r.slug}`,
          to: "/super-admin/restaurants/$restaurantId",
          params: { restaurantId: r.id },
        })),
        orders: (orders.data ?? []).map<Hit>((o) => ({
          id: o.id,
          title: `#${o.order_number}`,
          subtitle:
            (o as unknown as { restaurant?: { name?: string } }).restaurant?.name ?? "",
          to: "/super-admin/orders",
        })),
        staff: (staff.data ?? []).map<Hit>((s) => ({
          id: s.id,
          title: s.name,
          subtitle: s.email ?? s.role,
          to: s.restaurant_id
            ? "/super-admin/restaurants/$restaurantId/staff"
            : "/super-admin/restaurants",
          ...(s.restaurant_id ? { params: { restaurantId: s.restaurant_id } } : {}),
        })),
        products: (products.data ?? []).map<Hit>((p) => ({
          id: p.id,
          title: lang === "ar" ? p.name_ar : p.name_en,
          subtitle: t("sa.menu.products"),
          to: "/super-admin/restaurants/$restaurantId/menu",
          params: { restaurantId: p.restaurant_id },
        })),
      };
    },
  });

  const groups = useMemo(
    () => [
      { label: t("sa.nav.restaurants"), hits: query.data?.restaurants ?? [] },
      { label: t("sa.nav.orders"), hits: query.data?.orders ?? [] },
      { label: t("sa.nav.staff"), hits: query.data?.staff ?? [] },
      { label: t("sa.menu.products"), hits: query.data?.products ?? [] },
    ],
    [query.data, t],
  );

  const total = groups.reduce((acc, g) => acc + g.hits.length, 0);

  function go(hit: Hit) {
    onOpenChange(false);
    navigate({ to: hit.to as never, params: (hit.params ?? {}) as never });
  }

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder={t("sa.search.placeholder")}
        value={term}
        onValueChange={setTerm}
      />
      <CommandList>
        {total === 0 && <CommandEmpty>{t("sa.search.empty")}</CommandEmpty>}
        {groups
          .filter((g) => g.hits.length > 0)
          .map((g) => (
            <CommandGroup key={g.label} heading={g.label}>
              {g.hits.map((hit) => (
                <CommandItem key={`${g.label}-${hit.id}`} value={`${g.label} ${hit.title} ${hit.id}`} onSelect={() => go(hit)}>
                  <span className="font-medium">{hit.title}</span>
                  {hit.subtitle ? (
                    <span className="ms-2 text-xs text-muted-foreground">{hit.subtitle}</span>
                  ) : null}
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
      </CommandList>
    </CommandDialog>
  );
}
