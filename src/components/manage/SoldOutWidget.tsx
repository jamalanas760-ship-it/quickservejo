import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PackageX } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { formatDateTime } from "@/lib/format";
import { humanError } from "@/lib/errors";

type StockRow = {
  id: string;
  name_en: string;
  name_ar: string;
  is_available: boolean;
  sold_out_until: string | null;
  sold_out_note: string | null;
};

/** Everything currently unavailable or temporarily sold out, with one-tap restore. */
export function SoldOutWidget({ restaurantId }: { restaurantId: string }) {
  const { t, lang } = useI18n();
  const queryClient = useQueryClient();

  const rows = useQuery<StockRow[]>({
    queryKey: ["stock", "unavailable", restaurantId],
    staleTime: 20_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("menu_items")
        .select("id, name_en, name_ar, is_available, sold_out_until, sold_out_note")
        .eq("restaurant_id", restaurantId)
        .or("is_available.eq.false,sold_out_until.not.is.null")
        .order("name_en", { ascending: true })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as StockRow[];
    },
  });

  const restore = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("menu_items")
        .update({ is_available: true, sold_out_until: null, sold_out_note: null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success(t("stock.restore"));
      await queryClient.invalidateQueries({ queryKey: ["stock", "unavailable", restaurantId] });
      await queryClient.invalidateQueries({ queryKey: ["menu"] });
    },
    onError: (error) => toast.error(humanError(error, lang)),
  });

  return (
    <section className="panel p-4 sm:p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <PackageX className="size-4 text-primary" />
        {t("stock.title")}
      </h2>

      {rows.isPending ? (
        <div className="mt-3 space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-12 rounded-lg" />
          ))}
        </div>
      ) : (rows.data ?? []).length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">{t("stock.empty")}</p>
      ) : (
        <ul className="mt-2 divide-y">
          {(rows.data ?? []).map((item) => {
            const until = item.sold_out_until ? new Date(item.sold_out_until) : null;
            const timed = until && until.getTime() > Date.now();
            return (
              <li key={item.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {lang === "ar" ? item.name_ar : item.name_en}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {timed
                      ? `${t("stock.soldOutUntil")} ${formatDateTime(item.sold_out_until!, lang)}`
                      : t("stock.unavailable")}
                    {item.sold_out_note ? ` · ${item.sold_out_note}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge variant={timed ? "outline" : "destructive"} className="text-[10px]">
                    {timed ? t("stock.soldOutUntil") : t("stock.unavailable")}
                  </Badge>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8"
                    disabled={restore.isPending}
                    onClick={() => restore.mutate(item.id)}
                  >
                    {t("stock.restore")}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
