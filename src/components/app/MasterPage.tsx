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
      <div className="flex min-w-0 flex-col gap-3 px-4 py-4 sm:px-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            {eyebrow ? <div className="shrink-0">{eyebrow}</div> : null}
            <h1 className="qs-page-title min-w-0 whitespace-normal leading-tight">{title}</h1>
          </div>
          {description ? <p className="qs-page-subtitle">{description}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-1.5">{actions}</div> : null}
      </div>
      {tabs ? <div className="no-scrollbar overflow-x-auto border-t border-border/80 px-4 py-2">{tabs}</div> : null}
    </section>
  );
}

export function MasterEyebrow({ icon: Icon, children }: { icon?: ElementType; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-[9px] font-black uppercase tracking-[.1em] text-primary">
      {Icon ? <Icon className="size-2.5" /> : null}
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
        <p className="truncate text-[10px] font-bold uppercase tracking-[.04em] text-muted-foreground">{label}</p>
        <div className="mt-0.5 flex min-w-0 items-baseline gap-2">
          <p className="truncate font-display text-[clamp(1.25rem,1.55vw,1.6rem)] font-bold tracking-[-.025em]">{value}</p>
          {hint ? <p className="min-w-0 truncate text-[10px] text-muted-foreground">{hint}</p> : null}
        </div>
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
            {description ? <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p> : null}
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
          "inline-flex min-h-8 items-center rounded-[8px] px-2.5 text-[11px] font-bold transition",
          item.active ? "bg-[#ff5a0a] text-white shadow-[0_3px_10px_rgba(255,90,10,.14)]" : "text-muted-foreground hover:bg-[#fff1e8] hover:text-[#e94d00]",
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
  return <span className={cn("inline-flex min-h-5 items-center rounded-full px-2 py-0.5 text-[9px] font-bold", className)}>{children}</span>;
}
