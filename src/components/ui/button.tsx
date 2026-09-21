import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[13px] text-[13px] font-bold cursor-pointer transition-[transform,box-shadow,background-color,color,border-color] duration-150 active:translate-y-0 active:scale-[0.985] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/10 disabled:pointer-events-none disabled:opacity-45 disabled:cursor-not-allowed [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "border border-[#ff5a0a] bg-[#ff5a0a] text-white shadow-[0_6px_16px_rgba(255,90,10,.16)] hover:-translate-y-px hover:bg-[#eb4f00] hover:border-[#eb4f00] hover:shadow-[0_10px_24px_rgba(255,90,10,.20)]",
        destructive: "border border-destructive bg-destructive text-destructive-foreground shadow-sm hover:-translate-y-px hover:bg-destructive/92",
        outline:
          "border border-border/90 bg-card text-foreground shadow-[0_1px_2px_rgba(15,23,42,.025)] hover:-translate-y-px hover:border-foreground/15 hover:bg-muted/55",
        secondary: "border border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/78",
        ghost: "text-muted-foreground hover:bg-muted/75 hover:text-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-11 px-4.5 py-2",
        sm: "h-9.5 rounded-xl px-3 text-xs",
        lg: "h-12.5 rounded-[15px] px-6 text-sm",
        icon: "size-10.5",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
