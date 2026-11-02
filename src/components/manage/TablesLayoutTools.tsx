import { useEffect, useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { ActionMenu, type CompactAction } from "@/components/app/ActionMenu";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

export function TablesLayoutTools({ actions, ar }: { actions: CompactAction[]; ar: boolean }) {
  const mobile = useIsMobile();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!mobile) setOpen(false);
  }, [mobile]);
  const label = ar ? "أدوات المخطط" : "Layout tools";
  if (!mobile) return <ActionMenu actions={actions} ar={ar} label={label} align="end" />;
  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="qs-action-trigger size-11 shrink-0"
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <MoreHorizontal className="size-4" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent placement="edge" className="qs-floor-tools-dialog" dir={ar ? "rtl" : "ltr"}>
          <DialogHeader>
            <DialogTitle>{label}</DialogTitle>
            <DialogDescription>
              {ar
                ? "العناصر والمناطق وأدوات تحرير المخطط."
                : "Elements, zones and floor editing tools."}
            </DialogDescription>
          </DialogHeader>
          <div className="qs-floor-tools-list">
            {actions
              .filter((action) => !action.hidden)
              .map((action, index) => {
                const Icon = action.icon;
                return (
                  <div
                    key={index}
                    className={
                      action.separatorBefore ? "border-t border-border pt-2 mt-2" : undefined
                    }
                  >
                    <button
                      type="button"
                      disabled={action.disabled}
                      className={cn(
                        "flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2 text-start text-sm hover:bg-muted disabled:opacity-50",
                        action.destructive && "text-destructive",
                      )}
                      onClick={() => {
                        if (action.disabled) return;
                        setOpen(false);
                        // Close this popup before opening the selected editor dialog.
                        window.setTimeout(() => action.onSelect?.(), 0);
                      }}
                    >
                      {Icon ? <Icon className="size-4 shrink-0" /> : null}
                      <span>{action.label}</span>
                    </button>
                  </div>
                );
              })}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
