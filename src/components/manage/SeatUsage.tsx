import { useQuery } from "@tanstack/react-query";
import { Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * Seat usage meter for a restaurant workspace: active staff against the plan's
 * seat limit. The database trigger is the real gate; this is the UX mirror.
 */
export function SeatUsage({ restaurantId }: { restaurantId: string }) {
  const { t } = useI18n();

  const seats = useQuery({
    queryKey: ["seats", restaurantId],
    staleTime: 30_000,
    queryFn: async () => {
      const [limitRes, usedRes] = await Promise.all([
        supabase.from("restaurants").select("seat_limit").eq("id", restaurantId).maybeSingle(),
        supabase
          .from("staff")
          .select("id", { count: "exact", head: true })
          .eq("restaurant_id", restaurantId)
          .eq("is_active", true),
      ]);
      if (limitRes.error) throw limitRes.error;
      if (usedRes.error) throw usedRes.error;
      return {
        limit: (limitRes.data?.seat_limit ?? null) as number | null,
        used: usedRes.count ?? 0,
      };
    },
  });

  if (seats.isPending) return <Skeleton className="h-20 rounded-xl" />;

  const limit = seats.data?.limit ?? null;
  const used = seats.data?.used ?? 0;
  const pct = limit && limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const full = Boolean(limit && used >= limit);

  return (
    <section className="panel p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Users className="size-4 text-primary" />
          {t("seats.title")}
        </h3>
        <Badge variant={full ? "destructive" : "secondary"}>
          {used} / {limit ?? t("seats.unlimited")}
        </Badge>
      </div>

      {limit ? (
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              "h-full rounded-full transition-all",
              full ? "bg-destructive" : pct > 80 ? "bg-amber-500" : "bg-primary",
            )}
            style={{ width: `${Math.max(pct, 4)}%` }}
          />
        </div>
      ) : null}

      <p className="mt-2 text-xs text-muted-foreground">
        {full ? `${t("seats.full")} — ${t("seats.upgrade")}` : t("seats.used")}
      </p>
    </section>
  );
}
