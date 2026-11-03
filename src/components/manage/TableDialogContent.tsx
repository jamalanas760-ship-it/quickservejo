import type { ComponentProps } from "react";
import { DialogContent } from "@/components/ui/dialog";

/** Keep table editors centered and let mobile guests choose when to type. */
export function TableDialogContent({
  onOpenAutoFocus,
  ...props
}: ComponentProps<typeof DialogContent>) {
  return (
    <DialogContent
      {...props}
      placement="viewport-center"
      tabIndex={-1}
      onOpenAutoFocus={(event) => {
        onOpenAutoFocus?.(event);
        if (window.matchMedia("(max-width: 767px)").matches && !event.defaultPrevented) {
          event.preventDefault();
          (event.target as HTMLElement).focus({ preventScroll: true });
        }
      }}
    />
  );
}
