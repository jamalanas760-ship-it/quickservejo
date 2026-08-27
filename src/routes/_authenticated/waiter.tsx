import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { BellRing, Check, Utensils } from "lucide-react";
import { toast } from "sonner";

import { StaffHeader } from "@/components/staff/StaffHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspaceScope } from "@/hooks/useWorkspace";
import { useI18n } from "@/lib/i18n";
import { formatMoney } from "@/lib/format";
import { humanError } from "@/lib/errors";
import { playOrderAlert, unlockAlertSound } from "@/lib/order-alert";

export const Route = createFileRoute("/_authenticated/waiter")({
  head: () => ({
    meta: [
      { title: "Table status — QuickServe waiter" },
      {
        name: "description",
        content:
          "Live QuickServe floor view: which tables are calling, which have active orders and which are free.",
      },
      { property: "og:title", content: "Table status — QuickServe waiter" },
      {
        property: "og:description",
        content: "Waiter calls and live table status for your restaurant floor.",
      },
    ],
  }),
  component: WaiterFloor,
});

const OPEN_STATUSES = ["new", "accepted", "preparing", "ready", "served"] as const;

type FloorTable = {
  id: string;
  table_number: string;
  table_name: string | null;
  calling: { id: string; note: string | null; status: string } | null;
  openOrders: { id: string; order_number: string; status: string; total: number }[];
};

function useFloor(restaurantId: string | null) {
  return useQuery<FloorTable[]>({
    queryKey: ["waiter", "floor", restaurantId],
    enabled: Boolean(restaurantId),
    refetchInterval: 10_000,
    queryFn: async () => {
      const [tablesRes, callsRes, ordersRes] = await Promise.all([
        supabase
          .from("restaurant_tables")
          .select("id, table_number, table_name")
          .eq("restaurant_id", restaurantId!)
          .eq("is_active", true)
          .order("table_number", { ascending: true }),
        supabase
          .from("waiter_calls")
          .select("id, table_id, note, status")
          .eq("restaurant_id", restaurantId!)
          .in("status", ["pending", "acknowledged"]),
        supabase
          .from("orders")
          .select("id, table_id, order_number, status, total")
          .eq("restaurant_id", restaurantId!)
          .in("status", OPEN_STATUSES),
      ]);
      if (tablesRes.error) throw tablesRes.error;
      if (callsRes.error) throw callsRes.error;
      if (ordersRes.error) throw ordersRes.error;

      return (tablesRes.data ?? []).map((table) => ({
        id: table.id,
        table_number: table.table_number,
        table_name: table.table_name,
        calling:
          (callsRes.data ?? [])
            .filter((c) => c.table_id === table.id)
            .map((c) => ({ id: c.id, note: c.note, status: c.status }))[0] ?? null,
        openOrders: (ordersRes.data ?? [])
          .filter((o) => o.table_id === table.id)
          .map((o) => ({
            id: o.id,
            order_number: o.order_number,
            status: o.status,
            total: Number(o.total ?? 0),
          })),
      }));
    },
  });
}

function WaiterFloor() {
  const { t, lang } = useI18n();
  const scope = useWorkspaceScope();
  const floor = useFloor(scope.restaurantId);
  const queryClient = useQueryClient();

  const pending = (floor.data ?? []).filter((tb) => tb.calling?.status === "pending").length;

  // Audible nudge whenever a new call appears while the screen is open.
  useEffect(() => {
    if (pending > 0) playOrderAlert();
  }, [pending]);

  const setCall = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "acknowledged" | "resolved" }) => {
      const now = new Date().toISOString();
      const patch =
        status === "acknowledged"
          ? { status, acknowledged_at: now }
          : { status, resolved_at: now };
      const { error } = await supabase.from("waiter_calls").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: async (_data, variables) => {
      toast.success(variables.status === "resolved" ? t("waiter.resolve") : t("waiter.acknowledge"));
      await queryClient.invalidateQueries({ queryKey: ["waiter", "floor"] });
    },
    onError: (error) => toast.error(humanError(error, lang)),
  });

  return (
    <div className="min-h-screen bg-background" onPointerDown={() => void unlockAlertSound()}>
      <StaffHeader title={t("waiter.title")} />
      <main className="mx-auto w-full max-w-5xl space-y-5 px-4 py-6 sm:px-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("waiter.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("waiter.subtitle")}</p>
        </div>

        {floor.isPending ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-28 rounded-xl" />
            ))}
          </div>
        ) : (floor.data ?? []).length === 0 ? (
          <EmptyState
            icon={<Utensils className="size-6" />}
            title={t("empty.tables.title")}
            description={t("waiter.empty")}
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(floor.data ?? []).map((table) => {
              const calling = Boolean(table.calling);
              const busy = table.openOrders.length > 0;
              return (
                <article
                  key={table.id}
                  className={`panel p-4 ${calling ? "ring-2 ring-primary" : ""}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-base font-semibold">
                        {table.table_name ?? `${t("waiter.title")} ${table.table_number}`}
                      </p>
                      <p className="text-xs text-muted-foreground tabular-nums">
                        #{table.table_number}
                      </p>
                    </div>
                    <Badge variant={calling ? "default" : busy ? "secondary" : "outline"}>
                      {calling ? t("waiter.calling") : busy ? t("waiter.busy") : t("waiter.free")}
                    </Badge>
                  </div>

                  {busy ? (
                    <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
                      {table.openOrders.map((o) => (
                        <li key={o.id} className="flex justify-between gap-2">
                          <span className="truncate tabular-nums">{o.order_number}</span>
                          <span className="shrink-0">
                            {o.status} · {formatMoney(o.total, scope.currency, lang)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : null}

                  {table.calling ? (
                    <div className="mt-3 space-y-2">
                      {table.calling.note ? (
                        <p className="text-xs text-muted-foreground">{table.calling.note}</p>
                      ) : null}
                      <div className="flex gap-2">
                        {table.calling.status === "pending" ? (
                          <Button
                            size="sm"
                            className="h-9 flex-1"
                            disabled={setCall.isPending}
                            onClick={() =>
                              setCall.mutate({ id: table.calling!.id, status: "acknowledged" })
                            }
                          >
                            <BellRing className="size-4" />
                            {t("waiter.acknowledge")}
                          </Button>
                        ) : null}
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-9 flex-1"
                          disabled={setCall.isPending}
                          onClick={() =>
                            setCall.mutate({ id: table.calling!.id, status: "resolved" })
                          }
                        >
                          <Check className="size-4" />
                          {t("waiter.resolve")}
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
