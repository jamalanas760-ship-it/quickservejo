import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Handshake, UserRound } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { acknowledgeShiftHandover, useShiftHandovers } from "@/hooks/useOperations";
import { humanError } from "@/lib/errors";
import { useI18n } from "@/lib/i18n";
import { ROLE_LABELS, type AppRole } from "@/lib/permissions";

export function ShiftHandoverPanel({ restaurantId, currentStaffId, currentRole }: { restaurantId: string; currentStaffId: string; currentRole: AppRole }) {
  const { lang } = useI18n();
  const ar = lang === "ar";
  const handovers = useShiftHandovers(restaurantId);
  const qc = useQueryClient();
  const acknowledge = useMutation({
    mutationFn: (id: string) => acknowledgeShiftHandover(id, currentStaffId),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["operations", "shift-handovers", restaurantId] });
      toast.success(ar ? "تم تأكيد استلام التسليم" : "Handover acknowledged");
    },
    onError: (error) => toast.error(humanError(error, lang)),
  });

  if (handovers.isPending) return <div className="border-b border-border p-4"><Skeleton className="h-32 rounded-2xl" /></div>;
  if (handovers.isError) return <div className="border-b border-border p-4 text-xs text-destructive">{humanError(handovers.error, lang)}</div>;

  const rows = handovers.data ?? [];
  if (!rows.length) return null;

  return <div className="border-b border-border bg-muted/10 p-4 sm:p-5">
    <div className="mb-3 flex items-center gap-2"><Handshake className="size-4 text-[#ff5a0a]" /><h3 className="text-sm font-bold">{ar ? "تسليم الورديات" : "Shift handovers"}</h3><span className="text-[10px] text-muted-foreground">{rows.length}</span></div>
    <div className="space-y-2">{rows.slice(0, 6).map((row) => {
      const relevantToRole = row.target_role === currentRole;
      const relevantToStaff = row.to_staff_id === currentStaffId;
      const canAcknowledge = !row.acknowledged_at && (relevantToRole || relevantToStaff);
      return <article key={row.id} className="rounded-2xl border border-border bg-card p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2"><strong className="text-sm">{row.summary}</strong>{row.acknowledged_at ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-1 text-[10px] font-bold text-emerald-700"><CheckCircle2 className="size-3" />{ar ? "تم الاستلام" : "Acknowledged"}</span> : null}</div>
            {row.unresolved_items ? <p className="mt-2 text-xs leading-5 text-muted-foreground"><b>{ar ? "غير محلول:" : "Unresolved:"}</b> {row.unresolved_items}</p> : null}
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground"><span className="inline-flex items-center gap-1"><UserRound className="size-3" />{row.target_role ? ROLE_LABELS[row.target_role]?.[lang] ?? row.target_role : (ar ? "موظف محدد" : "Specific teammate")}</span><span>{new Date(row.created_at).toLocaleString(ar ? "ar-JO" : "en-JO")}</span></div>
          </div>
          {canAcknowledge ? <Button size="sm" disabled={acknowledge.isPending} onClick={() => acknowledge.mutate(row.id)}>{ar ? "تأكيد الاستلام" : "Acknowledge"}</Button> : null}
        </div>
      </article>;
    })}</div>
  </div>;
}
