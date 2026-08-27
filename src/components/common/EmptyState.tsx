import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Shared empty state: icon, headline, one line of guidance and an optional
 * primary action. Used everywhere a list can legitimately be empty.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("panel flex flex-col items-center px-6 py-10 text-center", className)}>
      {icon ? (
        <span className="grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary">
          {icon}
        </span>
      ) : null}
      <p className="mt-4 text-base font-semibold">{title}</p>
      {description ? (
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
