import type { ElementType, ReactNode } from "react";

import { cn } from "@/lib/utils";

export function MasterPageHeader({
  eyebrow,
  title,
  description,
  actions,
  tabs,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  tabs?: ReactNode;
}) {
  return (
    <section className="qs-master-header qs-workspace-titlebar">
      <div className="flex min-w-0 flex-col gap-4 py-2 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 flex-1">
          {eyebrow ? <div className="mb-2">{eyebrow}</div> : null}
          <h1 className="qs-page-title min-w-0 whitespace-normal leading-tight">{title}</h1>
          {description ? <p className="qs-page-subtitle mt-2">{description}</p> : null}
        </div>
        {actions ? <div className="qs-page-actions flex w-full shrink-0 flex-wrap items-center gap-2 lg:w-auto lg:justify-end">{actions}</div> : null}
      </div>
      {tabs ? <div className="no-scrollbar mt-2 overflow-x-auto border-t border-border/80 py-2">{tabs}</div> : null}
    </section>
  );
}

export function MasterEyebrow({ icon: Icon, children }: { icon?: ElementType; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-[.08em] text-[#cf4818]">
      {Icon ? <Icon className="size-3.5" /> : null}
      {children}
    </span>
  );
}

export function MasterKpi({
  icon: Icon,
  label,
  value,
  hint,
  tone = "orange",
  action,
}: {
  icon: ElementType;
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "orange" | "green" | "blue" | "purple" | "slate" | "red";
  action?: ReactNode;
}) {
  const toneClass = {
    orange: "bg-orange-500/10 text-[#e34d00]",
    green: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    blue: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
    purple: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
    slate: "bg-slate-500/10 text-slate-700 dark:text-slate-300",
    red: "bg-red-500/10 text-red-700 dark:text-red-300",
  }[tone];

  return (
    <article className="qs-kpi-card group flex min-h-[104px] min-w-0 items-center gap-3.5 p-4 transition duration-150 hover:border-primary/25">
      <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl", toneClass)}>
        <Icon className="size-4.5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-muted-foreground">{label}</p>
        <p className="mt-1 break-words font-display text-[clamp(1.2rem,1.55vw,1.6rem)] font-bold leading-tight tracking-[-.025em]">{value}</p>
        {hint ? <p className="mt-1 truncate text-xs text-muted-foreground">{hint}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </article>
  );
}

export function MasterSection({
  title,
  description,
  action,
  children,
  className,
  contentClassName,
}: {
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <section className={cn("qs-card overflow-hidden", className)}>
      {title || action ? (
        <div className="flex flex-col gap-2 border-b border-border px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            {title ? <h2 className="qs-section-title">{title}</h2> : null}
            {description ? <p className="mt-1 text-sm leading-5 text-muted-foreground">{description}</p> : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
      ) : null}
      <div className={cn("p-4", contentClassName)}>{children}</div>
    </section>
  );
}

export function MasterTabs({
  items,
}: {
  items: Array<{ label: ReactNode; active?: boolean; onClick?: () => void; href?: string }>;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item, index) => {
        const className = cn(
          "inline-flex min-h-11 items-center rounded-[9px] px-3 text-sm font-semibold transition",
          item.active ? "bg-foreground text-background shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground",
        );
        if (item.href) {
          return <a key={index} href={item.href} className={className}>{item.label}</a>;
        }
        return <button key={index} type="button" className={className} onClick={item.onClick}>{item.label}</button>;
      })}
    </div>
  );
}

export function MasterStatus({
  children,
  tone = "slate",
}: {
  children: ReactNode;
  tone?: "green" | "blue" | "orange" | "red" | "purple" | "slate";
}) {
  const className = {
    green: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    blue: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
    orange: "bg-orange-500/10 text-[#d94e07] dark:text-orange-300",
    red: "bg-red-500/10 text-red-700 dark:text-red-300",
    purple: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
    slate: "bg-muted text-muted-foreground",
  }[tone];
  return <span className={cn("inline-flex min-h-7 items-center rounded-full px-2.5 py-1 text-xs font-semibold", className)}>{children}</span>;
}
