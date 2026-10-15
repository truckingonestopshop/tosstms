"use client";

import { Check, ChevronDown } from "lucide-react";
import { Popover, MenuLabel, MenuSep } from "@/components/ui/Menu";
import { Pill } from "@/components/ui/Bits";
import { STATUS, cn } from "@/lib/format";
import type { LoadStatus } from "@/lib/types";

export function StatusPill({ status, className }: { status: LoadStatus; className?: string }) {
  const m = STATUS[status];
  return (
    <Pill className={cn(m.pill, className)} dot={m.dot}>
      {m.label}
    </Pill>
  );
}

const GROUPS: { label: string; items: LoadStatus[] }[] = [
  { label: "On the road", items: ["new", "booked", "in_transit"] },
  { label: "Done", items: ["delivered", "invoiced", "paid"] },
  { label: "Canceled", items: ["canceled_by_broker", "canceled_by_carrier"] },
];

/** Status pill that opens a menu to change the status in one click. */
export function StatusMenu({
  status,
  onChange,
  disabled,
}: {
  status: LoadStatus;
  onChange: (s: LoadStatus) => void;
  disabled?: boolean;
}) {
  if (disabled) return <StatusPill status={status} />;
  return (
    <Popover
      width={210}
      trigger={({ toggle, ref, open }) => (
        <button
          ref={ref}
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            toggle();
          }}
          className={cn(
            "inline-flex items-center gap-1 rounded-full pr-1.5 ring-1 ring-inset transition-shadow hover:shadow-sm",
            STATUS[status].pill,
            open && "ring-2",
          )}
        >
          <span className="inline-flex items-center gap-1.5 py-0.5 pl-2 text-[11px] font-semibold">
            <span className={cn("h-1.5 w-1.5 rounded-full", STATUS[status].dot)} />
            {STATUS[status].label}
          </span>
          <ChevronDown className="h-3 w-3 opacity-60" />
        </button>
      )}
    >
      {(close) => (
        <div onClick={(e) => e.stopPropagation()}>
          {GROUPS.map((g, gi) => (
            <div key={g.label}>
              {gi > 0 && <MenuSep />}
              <MenuLabel>{g.label}</MenuLabel>
              {g.items.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    if (s !== status) onChange(s);
                    close();
                  }}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[13px] text-fg-2 hover:bg-surface-2 hover:text-fg",
                    s === status && "font-semibold text-fg",
                  )}
                >
                  <span className={cn("h-2 w-2 rounded-full", STATUS[s].dot)} />
                  <span className="flex-1">{STATUS[s].label}</span>
                  {s === status && <Check className="h-3.5 w-3.5" />}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </Popover>
  );
}
