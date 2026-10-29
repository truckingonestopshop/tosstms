"use client";

import { Fragment } from "react";
import { CalendarDays, Check, ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/Field";
import { MenuItem, MenuLabel, MenuSep, Popover } from "@/components/ui/Menu";
import type { Range } from "@/lib/dashboard";
import { cn, fmtDay, today } from "@/lib/format";

/** Where "Custom" starts: the first of this month to today. */
export const defaultCustom = (): Range => {
  const t = today();
  return { from: `${t.slice(0, 8)}01`, to: t };
};

// Options are listed in groups: days, weeks, months, longer, then Custom.
const GROUP: Record<string, number> = { today: 0, yesterday: 0, week: 1, last_week: 1, month: 2, last_month: 2, "90d": 3, year: 3, all: 3, custom: 4 };

/**
 * One button for a dashboard's period ("This month ⌄"). The menu lists every period; "Custom"
 * keeps it open with From / To dates.
 */
export function PeriodMenu<P extends string>({
  value,
  onChange,
  options,
  custom,
  onCustom,
}: {
  value: P;
  onChange: (p: P) => void;
  options: { v: P; label: string }[];
  custom: Range;
  onCustom: (r: Range) => void;
}) {
  const label = value === "custom" ? `${fmtDay(custom.from)} – ${fmtDay(custom.to)}` : options.find((o) => o.v === value)?.label;
  return (
    <Popover
      align="end"
      width={248}
      trigger={({ open, toggle, ref }) => (
        <button
          ref={ref}
          type="button"
          onClick={toggle}
          aria-haspopup="menu"
          aria-expanded={open}
          className={cn(
            "inline-flex h-9 items-center gap-2 whitespace-nowrap rounded-xl border border-line bg-surface-2/70 px-3 text-[13px] font-medium text-fg backdrop-blur transition-colors hover:border-line-strong",
            open && "border-line-strong",
          )}
        >
          <CalendarDays className="h-4 w-4 text-fg-3" />
          {label}
          <ChevronDown className={cn("h-3.5 w-3.5 text-fg-3 transition-transform", open && "rotate-180")} />
        </button>
      )}
    >
      {(close) => (
        <>
          {options.map((o, i) => (
            <Fragment key={o.v}>
              {i > 0 && GROUP[o.v] !== GROUP[options[i - 1].v] && <MenuSep />}
              <MenuItem
                active={o.v === value}
                hint={o.v === value ? <Check className="h-3.5 w-3.5 text-brand" /> : undefined}
                onClick={() => {
                  onChange(o.v);
                  if (o.v !== "custom") close();
                }}
              >
                {o.label}
              </MenuItem>
            </Fragment>
          ))}
          {value === "custom" && (
            <div className="px-2.5 pb-2">
              <MenuLabel>Dates</MenuLabel>
              <div className="grid grid-cols-2 gap-1.5">
                <Input type="date" value={custom.from} max={custom.to || undefined} onChange={(e) => e.target.value && onCustom({ ...custom, from: e.target.value })} aria-label="From" className="h-8 px-2 text-xs" />
                <Input type="date" value={custom.to} min={custom.from || undefined} onChange={(e) => e.target.value && onCustom({ ...custom, to: e.target.value })} aria-label="To" className="h-8 px-2 text-xs" />
              </div>
            </div>
          )}
        </>
      )}
    </Popover>
  );
}
