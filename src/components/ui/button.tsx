import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-[8px] text-[11px] font-[750] cursor-pointer transition-[transform,box-shadow,background-color,color,border-color] duration-150 active:scale-[.985] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#ff5a0a]/10 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "border border-[#ff5a0a] bg-[#ff5a0a] text-white shadow-[0_4px_12px_rgba(255,90,10,.12)] hover:-translate-y-px hover:border-[#e94d00] hover:bg-[#e94d00] hover:shadow-[0_7px_18px_rgba(255,90,10,.16)]",
        destructive:
          "border border-red-600 bg-red-600 text-white shadow-sm hover:-translate-y-px hover:border-red-700 hover:bg-red-700",
        outline:
          "border border-border bg-card text-foreground shadow-[0_1px_2px_rgba(15,23,42,.025)] hover:-translate-y-px hover:border-foreground/15 hover:bg-muted/45",
        secondary:
          "border border-transparent bg-muted text-foreground hover:bg-muted/75",
        ghost:
          "border border-transparent text-muted-foreground hover:bg-muted/70 hover:text-foreground",
        link:
          "h-auto rounded-none border-0 p-0 text-primary shadow-none underline-offset-4 hover:underline",
      },
      size: {
        default: "h-8.5 px-3",
        sm: "h-7.5 rounded-[8px] px-2.5 text-[10.5px]",
        lg: "h-9.5 rounded-[9px] px-3.5 text-[11.5px]",
        icon: "size-8.5",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
