"use client";

import Link from "next/link";
import { useState } from "react";
import { STATUS, cn, fmtDay, money } from "@/lib/format";
import { useStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import type { Load, LoadStatus } from "@/lib/types";

const COLUMNS: LoadStatus[] = ["new", "booked", "in_transit", "delivered", "invoiced", "paid"];

/** Kanban by status. Drag a card to another column to change its status. */
export function LoadsBoard({ loads }: { loads: Load[] }) {
  const { driverById, truckById, setLoadStatus } = useStore();
  const [over, setOver] = useState<LoadStatus | null>(null);

  return (
    <div className="scrollbar-none -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
      {COLUMNS.map((col) => {
        const items = loads.filter((l) => l.status === col).sort((a, b) => (a.pickup_date || "").localeCompare(b.pickup_date || ""));
        const total = items.reduce((s, l) => s + l.gross_amount, 0);
        return (
          <div
            key={col}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(col);
            }}
            onDragLeave={() => setOver((o) => (o === col ? null : o))}
            onDrop={async (e) => {
              e.preventDefault();
              setOver(null);
              const id = e.dataTransfer.getData("text/load-id");
              const l = loads.find((x) => x.id === id);
              if (l && l.status !== col && (await setLoadStatus([id], col))) toast.success(`Moved to ${STATUS[col].label}`);
            }}
            className={cn(
              "flex w-[82vw] max-w-[300px] shrink-0 snap-start flex-col rounded-xl border bg-surface-2/50 sm:w-[280px]",
              over === col ? "border-brand bg-brand/5" : "border-line",
            )}
          >
            <div className="flex items-center gap-2 px-3 py-2.5">
              <span className={cn("h-2 w-2 rounded-full", STATUS[col].dot)} />
              <span className="text-[13px] font-semibold text-fg">{STATUS[col].label}</span>
              <span className="tnum rounded-md bg-surface px-1.5 text-[11px] text-fg-3 ring-1 ring-line">{items.length}</span>
              <span className="tnum ml-auto text-[11px] text-fg-4">{money(total, { cents: false })}</span>
            </div>
            <div className="flex max-h-[calc(100dvh-330px)] min-h-[120px] flex-col gap-2 overflow-y-auto px-2 pb-2">
              {items.map((l) => {
                const driver = driverById(l.driver_id);
                const truck = truckById(l.truck_id);
                return (
                  <Link
                    key={l.id}
                    href={`/loads/${l.id}`}
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData("text/load-id", l.id)}
                    className="block rounded-lg border border-line bg-surface p-3 shadow-[0_1px_0_rgba(0,0,0,0.02)] transition-colors hover:border-line-strong"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 text-[13px] font-semibold leading-snug text-fg">
                        {l.origin_city}, {l.origin_state}
                        <span className="text-fg-4"> → </span>
                        {l.destination_city}, {l.destination_state}
                      </div>
                      <span className="tnum shrink-0 text-[13px] font-semibold text-fg">{money(l.gross_amount, { cents: false })}</span>
                    </div>
                    <div className="mt-1 text-xs text-fg-3">
                      {fmtDay(l.pickup_date)} → {fmtDay(l.delivery_date)}
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-fg-3">
                      <span className="truncate">{l.broker_name || "No broker"}</span>
                      <span className="shrink-0">
                        {truck ? `#${truck.unit_number}` : ""} {driver ? driver.name.split(" ")[0] : ""}
                      </span>
                    </div>
                  </Link>
                );
              })}
              {items.length === 0 && <div className="py-6 text-center text-xs text-fg-4">Nothing here</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
