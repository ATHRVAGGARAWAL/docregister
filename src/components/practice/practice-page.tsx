import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function PracticePage({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mx-auto w-full max-w-[96rem] space-y-6 px-4 py-5 sm:px-6 lg:px-8 lg:py-7", className)}>
      {children}
    </div>
  );
}

export function PracticePageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <p className="section-kicker">{eyebrow}</p>}
        <h1 className="mt-1.5 text-2xl font-semibold tracking-[-0.045em] text-foreground sm:text-3xl">
          {title}
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function MetricCard({
  label,
  value,
  detail,
  tone = "default",
}: {
  label: string;
  value: string;
  detail: string;
  tone?: "default" | "primary" | "warning" | "money";
}) {
  return (
    <article
      className={cn(
        "surface-card min-w-0 rounded-[1.15rem] bg-card p-4",
        tone === "primary" && "border-primary/20",
        tone === "warning" && "border-warning/25",
        tone === "money" && "border-money/25",
      )}
    >
      <p className="text-xs font-semibold uppercase tracking-[0.13em] text-muted-foreground">{label}</p>
      <p
        className={cn(
          "tnum mt-2 text-2xl font-semibold tracking-[-0.055em]",
          tone === "primary" && "text-primary",
          tone === "warning" && "text-warning",
          tone === "money" && "text-money",
        )}
      >
        {value}
      </p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</p>
    </article>
  );
}

export function SectionHeading({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <h2 className="text-base font-semibold tracking-[-0.025em]">{title}</h2>
        {description && <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}

