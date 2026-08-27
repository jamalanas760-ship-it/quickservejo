import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Minus, Plus, Receipt, Wallet } from "lucide-react";
import { toast } from "sonner";

import { StaffHeader } from "@/components/staff/StaffHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspaceScope } from "@/hooks/useWorkspace";
import { useI18n } from "@/lib/i18n";
import { formatDateTime, formatMoney } from "@/lib/format";
import { humanError } from "@/lib/errors";

export const Route = createFileRoute("/_authenticated/cashier")({
  head: () => ({
    meta: [
      { title: "Cashier — QuickServe" },
      {
        name: "description",
        content:
          "Settle QuickServe table bills: see every unpaid order, split a bill between guests and mark it paid.",
      },
      { property: "og:title", content: "Cashier — QuickServe" },
      {
        property: "og:description",
        content: "Unpaid bills, split-bill maths and one-tap payment for your restaurant.",
      },
    ],
  }),
  component: CashierPage,
});

type Bill = {
  id: string;
  order_number: string;
  status: string;
  total: number;
  created_at: string;
  table: string | null;
};

function CashierPage() {
  const { t, lang } = useI18n();
  const scope = useWorkspaceScope();
  const queryClient = useQueryClient();
  const [split, setSplit] = useState<Bill | null>(null);
  const [ways, setWays] = useState(2);

  const bills = useQuery<Bill[]>({
    queryKey: ["cashier", "unpaid", scope.restaurantId],
    enabled: Boolean(scope.restaurantId),
    refetchInterval: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select(
          "id, order_number, status, total, created_at, table:restaurant_tables(table_number)",
        )
        .eq("restaurant_id", scope.restaurantId!)
        .eq("payment_status", "unpaid")
        .neq("status", "cancelled")
        .order("created_at", { ascending: true })
        .limit(100);
      if (error) throw error;
      return (data ?? []).map((o) => ({
        id: o.id,
        order_number: o.order_number,
        status: o.status,
        total: Number(o.total ?? 0),
        created_at: o.created_at,
        table: (o.table as { table_number: string } | null)?.table_number ?? null,
      }));
    },
  });

  const markPaid = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("orders")
        .update({ payment_status: "paid", status: "paid" })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success(t("cashier.paid"));
      setSplit(null);
      await queryClient.invalidateQueries({ queryKey: ["cashier", "unpaid"] });
      await queryClient.invalidateQueries({ queryKey: ["workspace"] });
    },
    onError: (error) => toast.error(humanError(error, lang)),
  });

  const outstanding = (bills.data ?? []).reduce((acc, b) => acc + b.total, 0);

  return (
    <div className="min-h-screen bg-background">
      <StaffHeader title={t("nav.cashier")} />
      <main className="mx-auto w-full max-w-4xl space-y-5 px-4 py-6 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{t("nav.cashier")}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {formatNumberish((bills.data ?? []).length)} ·{" "}
              {formatMoney(outstanding, scope.currency, lang)}
            </p>
          </div>
        </div>

        {bills.isPending ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-20 rounded-xl" />
            ))}
          </div>
        ) : (bills.data ?? []).length === 0 ? (
          <EmptyState
            icon={<Wallet className="size-6" />}
            title={lang === "ar" ? "لا فواتير مفتوحة" : "No open bills"}
            description={
              lang === "ar"
                ? "كل الطلبات مدفوعة. ستظهر الفواتير الجديدة هنا فوراً."
                : "Everything is settled. New bills land here as soon as they are placed."
            }
          />
        ) : (
          <ul className="space-y-3">
            {(bills.data ?? []).map((bill) => (
              <li key={bill.id} className="panel flex flex-wrap items-center gap-3 p-4">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                  <Receipt className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold tabular-nums">{bill.order_number}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {bill.table ? `${lang === "ar" ? "طاولة" : "Table"} ${bill.table} · ` : ""}
                    {formatDateTime(bill.created_at, lang)}
                  </p>
                </div>
                <div className="shrink-0 text-end">
                  <p className="text-sm font-semibold">
                    {formatMoney(bill.total, scope.currency, lang)}
                  </p>
                  <Badge variant="secondary" className="mt-1 text-[10px]">
                    {bill.status}
                  </Badge>
                </div>
                <div className="flex w-full shrink-0 gap-2 sm:w-auto">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-9 flex-1"
                    onClick={() => {
                      setWays(2);
                      setSplit(bill);
                    }}
                  >
                    {t("cashier.split")}
                  </Button>
                  <Button
                    size="sm"
                    className="h-9 flex-1"
                    disabled={markPaid.isPending}
                    onClick={() => markPaid.mutate(bill.id)}
                  >
                    {t("cashier.markPaid")}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>

      <Dialog open={Boolean(split)} onOpenChange={(open) => !open && setSplit(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("cashier.split")}</DialogTitle>
            <DialogDescription>
              {split?.order_number} · {formatMoney(split?.total ?? 0, scope.currency, lang)}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-muted-foreground">{t("cashier.splitWays")}</span>
              <div className="flex items-center gap-2">
                <Button
                  size="icon"
                  variant="outline"
                  className="size-9"
                  aria-label={t("common.clear")}
                  onClick={() => setWays((w) => Math.max(1, w - 1))}
                >
                  <Minus className="size-4" />
                </Button>
                <span className="w-10 text-center text-lg font-semibold tabular-nums">{ways}</span>
                <Button
                  size="icon"
                  variant="outline"
                  className="size-9"
                  aria-label={t("cashier.people")}
                  onClick={() => setWays((w) => Math.min(20, w + 1))}
                >
                  <Plus className="size-4" />
                </Button>
              </div>
            </div>

            <div className="rounded-xl border border-border p-4 text-center">
              <p className="text-xs text-muted-foreground">{t("cashier.perPerson")}</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                {formatMoney((split?.total ?? 0) / Math.max(1, ways), scope.currency, lang)}
              </p>
            </div>

            <Button
              className="w-full"
              disabled={markPaid.isPending || !split}
              onClick={() => split && markPaid.mutate(split.id)}
            >
              {t("cashier.markPaid")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function formatNumberish(count: number): string {
  return `${count}`;
}
