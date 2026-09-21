import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      className={cn(
        "flex h-11 w-full rounded-xl border border-input bg-card px-3.5 py-2 text-base text-foreground shadow-[0_1px_2px_rgba(15,23,42,.025)] transition-[border-color,box-shadow,background-color] file:border-0 file:bg-transparent file:text-sm file:font-semibold file:text-foreground placeholder:text-muted-foreground/55 hover:border-foreground/15 focus-visible:border-[#ff5a0a]/55 focus-visible:bg-card focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#ff5a0a]/8 disabled:cursor-not-allowed disabled:bg-muted/45 disabled:opacity-60 md:text-sm",
        className,
      )}
      ref={ref}
      {...props}
    />
  ),
);
Input.displayName = "Input";

export { Input };
