import type { ReactNode } from "react";
import { CheckCircle2, CircleAlert, Clock3 } from "lucide-react";

import { cn } from "@/lib/utils";

export function PublicGuestShell({
  children,
  logoUrl,
  brandName,
  eyebrow,
  title,
  description,
  status,
  footer,
}: {
  children: ReactNode;
  logoUrl?: string | null;
  brandName?: string;
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  status?: { label: ReactNode; tone?: "green" | "orange" | "red" | "blue" | undefined };
  footer?: ReactNode;
}) {
  return (
    <main className="min-h-dvh bg-[#f7f7f8] px-3 py-4 text-foreground sm:px-6 sm:py-10">
      <div className="mx-auto w-full max-w-2xl">
        <section className="overflow-hidden rounded-[14px] border border-border bg-card shadow-[0_8px_30px_rgba(23,23,23,.06)]">
          <header className="relative overflow-hidden border-b border-border/80 px-5 py-6 sm:px-7 sm:py-8">
            <div className="relative flex items-start gap-4">
              {logoUrl ? (
                <img src={logoUrl} alt="" className="size-14 shrink-0 rounded-2xl border border-border/80 bg-background object-contain p-1.5 shadow-sm sm:size-16" />
              ) : (
                <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-orange-500/10 text-[#e85d2a] sm:size-16">
                  <Clock3 className="size-6" />
                </span>
              )}
              <div className="min-w-0 flex-1">
                {eyebrow ? <div className="mb-2 text-xs font-bold uppercase tracking-[.08em] text-[#cf4818]">{eyebrow}</div> : null}
                {brandName ? <p className="mb-1 truncate text-sm font-semibold text-muted-foreground">{brandName}</p> : null}
                <h1 className="font-display text-[clamp(1.7rem,5vw,2.35rem)] font-bold tracking-[-.04em]">{title}</h1>
                {description ? <p className="mt-2 max-w-xl text-base leading-6 text-muted-foreground">{description}</p> : null}
                {status ? <div className="mt-3"><PublicStatus label={status.label} tone={status.tone} /></div> : null}
              </div>
            </div>
          </header>

          <div className="p-4 sm:p-6">{children}</div>

          {footer ? <footer className="border-t border-border/80 bg-muted/20 px-4 py-4 sm:px-6">{footer}</footer> : null}
        </section>
      </div>
    </main>
  );
}

export function PublicInfoCard({
  icon: Icon,
  label,
  value,
  tone = "orange",
  className,
}: {
  icon: typeof Clock3;
  label: ReactNode;
  value: ReactNode;
  tone?: "orange" | "green" | "blue" | "slate";
  className?: string;
}) {
  const toneClass = {
    orange: "bg-orange-500/10 text-[#e34d00]",
    green: "bg-emerald-500/10 text-emerald-700",
    blue: "bg-blue-500/10 text-blue-700",
    slate: "bg-muted text-muted-foreground",
  }[tone];
  return (
    <div className={cn("rounded-xl border border-border bg-background p-4", className)}>
      <span className={cn("grid size-9 place-items-center rounded-xl", toneClass)}><Icon className="size-4" /></span>
      <p className="mt-3 text-xs font-semibold text-muted-foreground">{label}</p>
      <strong className="mt-1 block text-sm leading-5">{value}</strong>
    </div>
  );
}

export function PublicStatus({
  label,
  tone = "blue",
}: {
  label: ReactNode;
  tone?: "green" | "orange" | "red" | "blue" | undefined;
}) {
  const classes = {
    green: "bg-emerald-500/10 text-emerald-700",
    orange: "bg-orange-500/10 text-[#d94e07]",
    red: "bg-red-500/10 text-red-700",
    blue: "bg-blue-500/10 text-blue-700",
  }[tone];
  const Icon = tone === "green" ? CheckCircle2 : tone === "red" ? CircleAlert : Clock3;
  return <span className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold", classes)}><Icon className="size-3.5" />{label}</span>;
}
