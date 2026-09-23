import type { ReactNode } from "react";

import { useIsMobile } from "@/hooks/use-mobile";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

/**
 * Responsive record detail surface: a right-side drawer on desktop and a
 * bottom sheet on touch devices. Used by My Work, Shifts and Automations so
 * every card can open its full record without a tiny "View" affordance.
 */
export function DetailSheet({
  open,
  onOpenChange,
  title,
  description,
  footer,
  panelClassName,
  bodyClassName,
  footerClassName,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  footer?: ReactNode;
  panelClassName?: string;
  bodyClassName?: string;
  footerClassName?: string;
  children: ReactNode;
}) {
  const isMobile = useIsMobile();
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={isMobile ? "bottom" : "right"}
        className={cn(
          "flex flex-col gap-0 overflow-hidden p-0",
          isMobile ? "h-[92dvh] rounded-t-3xl" : "w-full sm:max-w-[520px]",
          panelClassName,
        )}
      >
        <SheetHeader className="border-b border-border bg-card px-5 py-4 text-start">
          <SheetTitle className="pe-9 text-lg font-bold leading-6">{title}</SheetTitle>
          {description ? <SheetDescription className="text-xs leading-5">{description}</SheetDescription> : null}
        </SheetHeader>
        <div className={cn("qs-scroll flex-1 overflow-y-auto px-4 py-3", bodyClassName)}>{children}</div>
        {footer ? <div className={cn("border-t border-border bg-card p-3 shadow-[0_-8px_24px_rgb(0_0_0/0.04)]", footerClassName)}>{footer}</div> : null}
      </SheetContent>
    </Sheet>
  );
}

/** Label/value pair inside a DetailSheet. Skips itself when value is empty. */
export function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="grid grid-cols-[132px_minmax(0,1fr)] items-center gap-3 border-b border-border/60 py-2 last:border-0 max-sm:grid-cols-[104px_minmax(0,1fr)]">
      <span className="text-[10px] font-bold uppercase tracking-[.055em] text-muted-foreground">{label}</span>
      <span className="min-w-0 break-words text-[13px] leading-5">{value}</span>
    </div>
  );
}

export function formatStamp(value: string | null | undefined, ar: boolean) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(ar ? "ar-JO" : "en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
