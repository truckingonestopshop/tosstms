"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/format";

export function Card({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("rounded-xl border border-line bg-surface", className)} {...rest}>
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  actions,
  className,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-5", className)}>
      <div className="min-w-0">
        <h3 className="truncate text-sm font-semibold text-fg">{title}</h3>
        {subtitle && <p className="truncate text-xs text-fg-3">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
    </div>
  );
}

/** Small uppercase section label (CarrieX style). */
export const Eyebrow = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <div className={cn("text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-3", className)}>{children}</div>
);

export function PageHeader({
  title,
  eyebrow,
  actions,
  children,
}: {
  title: React.ReactNode;
  eyebrow?: React.ReactNode;
  actions?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <Eyebrow className="mb-1">{eyebrow}</Eyebrow>}
        <h1 className="truncate text-[22px] font-bold leading-tight text-fg sm:text-[26px]">{title}</h1>
        {children}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Page({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("mx-auto w-full max-w-[1600px] px-4 pb-28 pt-5 sm:px-6 sm:pt-7 md:pb-12 lg:px-8", className)}>{children}</div>;
}

export function Pill({ children, className, dot }: { children: React.ReactNode; className?: string; dot?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset", className)}>
      {dot && <span className={cn("h-1.5 w-1.5 rounded-full", dot)} />}
      {children}
    </span>
  );
}

export const neutralPill = "bg-surface-2 text-fg-2 ring-line";

export function Stat({
  label,
  value,
  sub,
  className,
  children,
  style,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  sub?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <Card className={cn("p-4 sm:p-5", className)} style={style}>
      <Eyebrow>{label}</Eyebrow>
      <div className="tnum mt-1.5 truncate text-2xl font-bold tracking-tight text-fg sm:text-[28px]">{value}</div>
      {sub && <div className="mt-1 truncate text-xs text-fg-3">{sub}</div>}
      {children}
    </Card>
  );
}

export function Empty({
  icon: Icon,
  title,
  body,
  action,
  className,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  title: React.ReactNode;
  body?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center px-6 py-14 text-center", className)}>
      {Icon && (
        <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl border border-line bg-surface-2 text-fg-3">
          <Icon className="h-5 w-5" />
        </div>
      )}
      <p className="text-sm font-semibold text-fg">{title}</p>
      {body && <p className="mt-1 max-w-sm text-[13px] leading-relaxed text-fg-3">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Tabs<T extends string>({
  value,
  onChange,
  tabs,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  tabs: { value: T; label: React.ReactNode; count?: number }[];
  className?: string;
}) {
  return (
    <div className={cn("scrollbar-none -mx-4 flex gap-1 overflow-x-auto border-b border-line px-4 sm:mx-0 sm:px-0", className)}>
      {tabs.map((t) => {
        const on = t.value === value;
        return (
          <button
            key={t.value}
            type="button"
            onClick={() => onChange(t.value)}
            className={cn(
              "relative -mb-px flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-[13px] font-medium transition-colors",
              on ? "border-brand text-fg" : "border-transparent text-fg-3 hover:text-fg",
            )}
          >
            {t.label}
            {t.count !== undefined && (
              <span className={cn("tnum rounded-md px-1.5 py-px text-[11px]", on ? "bg-surface-3 text-fg" : "bg-surface-2 text-fg-3")}>{t.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function CopyButton({ text, className, label }: { text: string | null | undefined; className?: string; label?: string }) {
  const [done, setDone] = useState(false);
  if (!text) return null;
  return (
    <button
      type="button"
      title={label || "Copy"}
      onClick={(e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1400);
      }}
      className={cn("inline-flex shrink-0 items-center gap-1 rounded-md p-1 text-fg-4 transition-colors hover:bg-surface-2 hover:text-fg", className)}
    >
      {done ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
      {label && <span className="text-xs">{done ? "Copied" : label}</span>}
    </button>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-lg bg-surface-2", className)} />;
}

/** Label/value row used in detail panels. */
export function KV({ label, children, className }: { label: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <div className="text-[11px] font-medium uppercase tracking-wider text-fg-4">{label}</div>
      <div className="mt-0.5 truncate text-sm text-fg">{children || <span className="text-fg-4">—</span>}</div>
    </div>
  );
}

export function Avatar({ name, className }: { name: string; className?: string }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
  return (
    <span className={cn("inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-3 text-[11px] font-bold text-fg-2", className)}>
      {initials || "?"}
    </span>
  );
}
