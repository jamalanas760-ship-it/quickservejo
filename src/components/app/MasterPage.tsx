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
    <section className="qs-master-header overflow-hidden rounded-[20px] border border-border/80 bg-card shadow-[var(--qs-shadow-card)]">
      <div className="flex flex-col gap-5 p-5 sm:p-6 xl:flex-row xl:items-end xl:justify-between">
        <div className="min-w-0 max-w-3xl">
          {eyebrow ? <div className="mb-3">{eyebrow}</div> : null}
          <h1 className="qs-page-title">{title}</h1>
          {description ? <p className="qs-page-subtitle">{description}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {tabs ? <div className="border-t border-border/80 px-4 py-2 sm:px-5">{tabs}</div> : null}
    </section>
  );
}

export function MasterEyebrow({ icon: Icon, children }: { icon?: ElementType; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-orange-200/80 bg-orange-50 px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-[.14em] text-[#e34d00] dark:border-orange-900/50 dark:bg-orange-950/20 dark:text-orange-300">
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
    <article className="group min-w-0 rounded-[18px] border border-border/85 bg-card p-4 shadow-[var(--qs-shadow-card)] transition duration-150 hover:-translate-y-px hover:border-foreground/10 hover:shadow-[var(--qs-shadow-hover)] sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <span className={cn("grid size-10 shrink-0 place-items-center rounded-[13px]", toneClass)}>
          <Icon className="size-4.5" />
        </span>
        {action}
      </div>
      <div className="mt-5 min-w-0">
        <p className="text-[11px] font-semibold text-muted-foreground">{label}</p>
        <p className="mt-1 truncate font-display text-[clamp(1.45rem,2vw,2rem)] font-bold tracking-[-.04em]">{value}</p>
        {hint ? <p className="mt-1.5 text-[10px] leading-4 text-muted-foreground">{hint}</p> : null}
      </div>
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
    <section className={cn("overflow-hidden rounded-[18px] border border-border/85 bg-card shadow-[var(--qs-shadow-card)]", className)}>
      {title || action ? (
        <div className="flex flex-col gap-3 border-b border-border/80 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div className="min-w-0">
            {title ? <h2 className="qs-section-title">{title}</h2> : null}
            {description ? <p className="mt-1 text-[11px] leading-5 text-muted-foreground">{description}</p> : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
      ) : null}
      <div className={cn("p-4 sm:p-5", contentClassName)}>{children}</div>
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
          "inline-flex min-h-9 items-center rounded-[10px] px-3 text-xs font-bold transition",
          item.active ? "bg-foreground text-background shadow-sm" : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
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
  return <span className={cn("inline-flex min-h-6 items-center rounded-full px-2.5 py-1 text-[10px] font-bold", className)}>{children}</span>;
}
