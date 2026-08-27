import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { formatMoney } from "@/lib/format";
import { dayKey, rangeDayKeys, type DateRange } from "@/lib/range";

/**
 * Platform-wide (or single-tenant) sales per day for the selected range.
 * Cancelled orders are excluded so the trend matches the revenue stats.
 */
function useRevenueSeries(range: DateRange, restaurantId?: string) {
  return useQuery({
    queryKey: ["revenue", "series", range.from, range.to, restaurantId ?? "platform"],
    staleTime: 60_000,
    queryFn: async () => {
      let query = supabase
        .from("orders")
        .select("total, created_at")
        .neq("status", "cancelled")
        .gte("created_at", range.from)
        .lt("created_at", range.to)
        .limit(5000);
      if (restaurantId) query = query.eq("restaurant_id", restaurantId);
      const { data, error } = await query;
      if (error) throw error;
      const tally = new Map<string, number>();
      for (const row of data ?? []) {
        const key = dayKey(row.created_at);
        tally.set(key, (tally.get(key) ?? 0) + Number(row.total ?? 0));
      }
      return tally;
    },
  });
}

export function RevenueTrend({
  range,
  currency = "JOD",
  restaurantId,
}: {
  range: DateRange;
  currency?: string;
  restaurantId?: string;
}) {
  const { t, lang } = useI18n();
  const series = useRevenueSeries(range, restaurantId);

  const points = useMemo(() => {
    const tally = series.data;
    return rangeDayKeys(range).map((key) => ({
      day: key.slice(5),
      total: Number((tally?.get(key) ?? 0).toFixed(2)),
    }));
  }, [range, series.data]);

  const hasSales = points.some((p) => p.total > 0);

  return (
    <section className="panel p-4 sm:p-5">
      <div>
        <h2 className="text-sm font-semibold">{t("sa.revenue.trend")}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{t("sa.revenue.trendHelp")}</p>
      </div>

      {series.isPending ? (
        <Skeleton className="mt-4 h-56 w-full rounded-xl" />
      ) : !hasSales ? (
        <p className="mt-6 text-sm text-muted-foreground">{t("sa.revenue.empty")}</p>
      ) : (
        <div className="mt-4 h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={points} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="qsRevenue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
              <XAxis
                dataKey="day"
                tick={{ fontSize: 11 }}
                stroke="var(--color-muted-foreground)"
                interval="preserveStartEnd"
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fontSize: 11 }}
                stroke="var(--color-muted-foreground)"
                width={44}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                formatter={(value) => formatMoney(Number(value), currency, lang)}
                contentStyle={{
                  background: "var(--color-card)",
                  border: "1px solid var(--color-border)",
                  borderRadius: "0.75rem",
                  fontSize: "0.75rem",
                }}
              />
              <Area
                type="monotone"
                dataKey="total"
                stroke="var(--color-primary)"
                strokeWidth={2}
                fill="url(#qsRevenue)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}
