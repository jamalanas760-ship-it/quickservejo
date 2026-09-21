import * as React from "react";

import { cn } from "@/lib/utils";

const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<"textarea">>(
  ({ className, ...props }, ref) => (
    <textarea
      className={cn(
        "flex min-h-24 w-full resize-y rounded-[13px] border border-input bg-card px-3.5 py-3 text-base text-foreground shadow-[0_1px_2px_rgba(15,23,42,.02)] transition-[border-color,box-shadow,background-color] placeholder:text-muted-foreground/58 hover:border-foreground/15 focus-visible:border-primary/50 focus-visible:bg-card focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/8 disabled:cursor-not-allowed disabled:bg-muted/55 disabled:opacity-60 md:text-sm",
        className,
      )}
      ref={ref}
      {...props}
    />
  ),
);
Textarea.displayName = "Textarea";

export { Textarea };
