"use client";

import Link from "next/link";
import { ArrowDownRight, ArrowRight, ArrowUpRight, type LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/Bits";
import { cn } from "@/lib/format";
import { change } from "@/lib/dashboard";

// Building blocks of the Dashboard and Services: key numbers with the change vs the period before,
// panels that open their section, small number grids and bar rows.

export const red = "text-red-600 dark:text-red-400";
export const amber = "text-amber-600 dark:text-amber-400";
export const green = "text-emerald-600 dark:text-emerald-400";

/** "+12%" green / "−8%" red vs the previous period (down is good when `lowerIsBetter`). */
export function Delta({ cur, prev, lowerIsBetter }: { cur: number; prev: number; lowerIsBetter?: boolean }) {
  const c = change(cur, prev);
  if (c === null) return <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">new</span>;
  if (c === 0) return cur ? <span className="text-[11px] text-fg-4">same as before</span> : null;
  const good = lowerIsBetter ? c < 0 : c > 0;
  const Icon = c > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-[11px] font-semibold", good ? green : red)}>
      <Icon className="h-3 w-3" />
      {Math.abs(c)}%
    </span>
  );
}

export function Kpi({ label, value, sub, cur, prev, lowerIsBetter, href }: { label: string; value: string; sub?: string; cur?: number; prev?: number; lowerIsBetter?: boolean; href?: string }) {
  const body = (
    <>
      <div className="text-[10.5px] font-semibold uppercase tracking-wider text-fg-4">{label}</div>
      <div className="tnum mt-1.5 text-[22px] font-bold leading-none text-fg">{value}</div>
      <div className="mt-1.5 flex items-center gap-1.5">
        {cur !== undefined && prev !== undefined && <Delta cur={cur} prev={prev} lowerIsBetter={lowerIsBetter} />}
        {sub && <span className="truncate text-[11px] text-fg-3">{sub}</span>}
      </div>
    </>
  );
  const cls = "rounded-xl border border-line bg-surface p-4 transition-colors";
  return href ? (
    <Link href={href} className={cn(cls, "group hover:border-line-strong")}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

export function Panel({ title, href, icon: Icon, children, className }: { title: string; href: string; icon: LucideIcon; children: React.ReactNode; className?: string }) {
  return (
    <Card className={cn("flex flex-col", className)}>
      <Link href={href} className="group flex items-center gap-2 border-b border-line px-4 py-3 sm:px-5">
        <Icon className="h-4 w-4 text-fg-4" />
        <span className="text-[14px] font-semibold text-fg">{title}</span>
        <ArrowRight className="ml-auto h-4 w-4 text-fg-4 transition-transform group-hover:translate-x-0.5" />
      </Link>
      <div className="flex-1 p-4 sm:p-5">{children}</div>
    </Card>
  );
}

export function Mini({ items, cols = 2 }: { items: [string, React.ReactNode, string?][]; cols?: 2 | 3 }) {
  return (
    <dl className={cn("grid gap-x-4 gap-y-3", cols === 3 ? "grid-cols-3" : "grid-cols-2")}>
      {items.map(([k, v, tone]) => (
        <div key={k} className="min-w-0">
          <dt className="truncate text-[10.5px] font-semibold uppercase tracking-wider text-fg-4">{k}</dt>
          <dd className={cn("tnum truncate text-[15px] font-semibold text-fg", tone)}>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** A horizontal bar row (funnel, services, categories). */
export function BarRow({ label, value, max, right, color = "bg-brand", onClick, active }: { label: string; value: number; max: number; right: React.ReactNode; color?: string; onClick?: () => void; active?: boolean }) {
  const inner = (
    <>
      <span className={cn("w-28 shrink-0 truncate text-left", active ? "font-semibold text-fg" : "text-fg-2")}>{label}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
        <div className={cn("h-full rounded-full", color)} style={{ width: `${max ? (value / max) * 100 : 0}%` }} />
      </div>
      <span className="tnum w-24 shrink-0 text-right text-fg">{right}</span>
    </>
  );
  return onClick ? (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-3 rounded-md text-[13px] hover:bg-surface-2/60">
      {inner}
    </button>
  ) : (
    <div className="flex items-center gap-3 text-[13px]">{inner}</div>
  );
}
