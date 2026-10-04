import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Archive, ArchiveRestore, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { humanError } from "@/lib/errors";

export type RestaurantLifecycleAction = "archive" | "restore" | "delete";
export type LifecycleRestaurant = { id: string; name: string; archived_at: string | null };
export function RestaurantLifecycleDialog({
  restaurant,
  action,
  onClose,
  onDeleted,
}: {
  restaurant: LifecycleRestaurant | null;
  action: RestaurantLifecycleAction | null;
  onClose: () => void;
  onDeleted?: () => void;
}) {
  const { lang } = useI18n();
  const ar = lang === "ar";
  const qc = useQueryClient();
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const destructive = action === "delete";
  const title = destructive
    ? ar
      ? "حذف المطعم؟"
      : "Delete restaurant?"
    : action === "restore"
      ? ar
        ? "استعادة المطعم؟"
        : "Restore restaurant?"
      : ar
        ? "أرشفة المطعم؟"
        : "Archive restaurant?";
  async function apply() {
    if (!restaurant || !action || busy) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc("admin_restaurant_lifecycle", {
        _restaurant_id: restaurant.id,
        _action: action,
        _confirmation: confirmation,
      });
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["platform"] });
      toast.success(
        destructive
          ? ar
            ? "تم حذف المطعم"
            : "Restaurant deleted"
          : action === "restore"
            ? ar
              ? "تمت استعادة المطعم"
              : "Restaurant restored"
            : ar
              ? "تمت أرشفة المطعم"
              : "Restaurant archived",
      );
      onClose();
      if (destructive) onDeleted?.();
    } catch (error) {
      toast.error(humanError(error, lang));
    } finally {
      setBusy(false);
    }
  }
  const Icon = destructive ? Trash2 : action === "restore" ? ArchiveRestore : Archive;
  return (
    <Dialog
      open={Boolean(restaurant && action)}
      onOpenChange={(open) => {
        if (!open && !busy) {
          setConfirmation("");
          onClose();
        }
      }}
    >
      <DialogContent
        className="qs-admin-dialog qs-admin-lifecycle"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => {
          if (busy) e.preventDefault();
        }}
        onPointerDownOutside={(e) => {
          if (busy) e.preventDefault();
        }}
        dir={ar ? "rtl" : "ltr"}
      >
        <DialogHeader>
          <span
            className={
              destructive ? "qs-admin-action-symbol destructive" : "qs-admin-action-symbol"
            }
          >
            <Icon size={24} />
          </span>
          <DialogTitle>{title}</DialogTitle>
          <p className="break-words font-semibold">{restaurant?.name}</p>
          <DialogDescription>
            {destructive
              ? ar
                ? "سيتم حذف الطلبات والقوائم وصلاحيات الفريق والسجلات التشغيلية نهائياً. تبقى حسابات المستخدمين المشتركة وسجل التدقيق. تتم إزالة ملفات المطعم في الخلفية."
                : "Orders, menus, staff access and operational records will be permanently removed. Shared user accounts and audit history are kept. Restaurant files are removed in the background."
              : action === "restore"
                ? ar
                  ? "سيتم تنشيط المطعم وإعادة فتح الطلبات العامة."
                  : "Reactivate this restaurant and reopen public ordering."
                : ar
                  ? "إيقاف الطلبات العامة. تبقى بيانات المطعم وملفاته محفوظة ويمكن استعادته لاحقاً."
                  : "Pause public ordering. All restaurant data and files are preserved so you can restore it later."}
          </DialogDescription>
        </DialogHeader>
        {destructive ? (
          <label className="grid gap-2 text-sm font-medium">
            {ar ? "اكتب اسم المطعم للتأكيد" : "Type the restaurant name to confirm"}
            <Input
              autoComplete="off"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              disabled={busy}
              placeholder={restaurant?.name}
            />
          </label>
        ) : null}
        <div className="qs-admin-dialog-actions">
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => {
              setConfirmation("");
              onClose();
            }}
          >
            {ar ? "إلغاء" : "Cancel"}
          </Button>
          <Button
            aria-label={destructive ? (ar ? "حذف المطعم" : "Delete restaurant") : undefined}
            variant={destructive ? "destructive" : "default"}
            disabled={busy || (destructive && confirmation !== restaurant?.name)}
            onClick={() => void apply()}
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Icon className="size-4" />}
            {destructive
              ? ar
                ? "حذف"
                : "Delete"
              : action === "restore"
                ? ar
                  ? "استعادة"
                  : "Restore"
                : ar
                  ? "أرشفة"
                  : "Archive"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
