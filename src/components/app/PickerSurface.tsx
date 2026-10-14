import { useId, type ReactNode } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/** One picker surface: a mobile sheet or desktop popover, never both. */
export function PickerSurface({
  open,
  onOpenChange,
  trigger,
  title,
  ar,
  children,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: ReactNode;
  title: string;
  ar: boolean;
  className?: string;
  children: ReactNode;
}) {
  const mobile = useIsMobile(),
    id = useId();
  return mobile ? (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent
        overlayClassName="p2-picker-overlay"
        className={`p2-date-sheet ${className ?? ""}`}
        dir={ar ? "rtl" : "ltr"}
        aria-describedby={undefined}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          document.getElementById(id)?.focus({ preventScroll: true });
        }}
      >
        <DialogHeader>
          <DialogTitle id={id} tabIndex={-1}>
            {title}
          </DialogTitle>
        </DialogHeader>
        <div className="p2-date-sheet-body">{children}</div>
      </DialogContent>
    </Dialog>
  ) : (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent className="p2-date-popover" align="start" dir={ar ? "rtl" : "ltr"}>
        {children}
      </PopoverContent>
    </Popover>
  );
}
