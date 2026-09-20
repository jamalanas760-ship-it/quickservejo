import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-[13px] font-bold cursor-pointer transition-[transform,box-shadow,background-color,color,border-color] duration-150 active:scale-[0.985] focus-visible:outline-none disabled:pointer-events-none disabled:opacity-45 disabled:cursor-not-allowed [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "border border-primary bg-primary text-primary-foreground shadow-[0_4px_12px_color-mix(in_oklab,var(--color-primary)_15%,transparent)] hover:-translate-y-px hover:bg-primary/92 hover:shadow-[0_8px_20px_color-mix(in_oklab,var(--color-primary)_20%,transparent)]",
        destructive: "border border-destructive bg-destructive text-destructive-foreground shadow-sm hover:-translate-y-px hover:bg-destructive/92",
        outline:
          "border border-input bg-card text-foreground shadow-[0_1px_2px_rgba(15,23,42,.03)] hover:-translate-y-px hover:border-primary/25 hover:bg-muted/65",
        secondary: "border border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/78",
        ghost: "text-muted-foreground hover:bg-muted/75 hover:text-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10.5 px-4 py-2",
        sm: "h-9.5 rounded-[11px] px-3 text-xs",
        lg: "h-12 rounded-[14px] px-6 text-sm",
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
