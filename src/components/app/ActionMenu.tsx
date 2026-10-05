import type { ElementType, ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { MoreHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export type CompactAction = {
  label: ReactNode;
  icon?: ElementType | undefined;
  onSelect?: (() => void) | undefined;
  href?: string | undefined;
  disabled?: boolean | undefined;
  destructive?: boolean | undefined;
  separatorBefore?: boolean | undefined;
  hidden?: boolean | undefined;
};

export function ActionMenu({
  actions,
  ar = false,
  label,
  align = "end",
  className,
  variant = "outline",
}: {
  actions: CompactAction[];
  ar?: boolean;
  label?: string;
  align?: "start" | "center" | "end";
  className?: string;
  variant?: "default" | "outline" | "ghost";
}) {
  const visible = actions.filter((action) => !action.hidden);
  if (!visible.length) return null;

  const menuLabel = label ?? (ar ? "المزيد" : "More");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant={variant}
          size="icon"
          className={cn("size-11 shrink-0 rounded-xl", className)}
          aria-label={menuLabel}
          title={menuLabel}
        >
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align={align}
        className="min-w-48"
        style={{ direction: ar ? "rtl" : "ltr" }}
      >
        {visible.map((action, index) => {
          const Icon = action.icon;
          const itemClass = action.destructive
            ? "text-destructive focus:text-destructive"
            : undefined;
          const body = (
            <>
              {Icon ? <Icon className="size-4" /> : null}
              <span>{action.label}</span>
            </>
          );

          return (
            <div key={index}>
              {action.separatorBefore ? <DropdownMenuSeparator /> : null}
              {action.href ? (
                <DropdownMenuItem
                  asChild
                  {...(action.disabled ? { disabled: true } : {})}
                  {...(itemClass ? { className: itemClass } : {})}
                >
                  <Link to={action.href as never}>{body}</Link>
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem
                  {...(action.disabled ? { disabled: true } : {})}
                  {...(itemClass ? { className: itemClass } : {})}
                  onSelect={() => {
                    if (action.disabled || !action.onSelect) return;
                    window.setTimeout(action.onSelect, 0);
                  }}
                >
                  {body}
                </DropdownMenuItem>
              )}
            </div>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
