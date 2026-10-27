"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Clock } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Segmented } from "@/components/ui/Field";
import { Card } from "@/components/ui/Bits";
import { STATUS, cn, money, parseDay, stopWindow, toDay, today } from "@/lib/format";
import { useStore } from "@/lib/store";
import type { Load } from "@/lib/types";

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Month grid (agenda list on phones). Loads sit on their pickup or delivery day. */
export function LoadsCalendar({ loads }: { loads: Load[] }) {
  const { driverById, truckById } = useStore();
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [by, setBy] = useState<"pickup" | "delivery">("pickup");

  const byDay = useMemo(() => {
    const m = new Map<string, Load[]>();
    for (const l of loads) {
      const k = by === "pickup" ? l.pickup_date || l.delivery_date : l.delivery_date || l.pickup_date;
      if (!k) continue;
      const arr = m.get(k) || [];
      arr.push(l);
      m.set(k, arr);
    }
    return m;
  }, [loads, by]);

  const days = useMemo(() => {
    const first = new Date(month);
    const offset = (first.getDay() + 6) % 7; // Monday first
    const start = new Date(first);
    start.setDate(1 - offset);
    const out: Date[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      out.push(d);
    }
    // Drop a trailing week that is entirely next month.
    return out[35].getMonth() !== month.getMonth() ? out.slice(0, 35) : out;
  }, [month]);

  const t = today();
  const monthLabel = month.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const monthKey = toDay(month).slice(0, 7);
  const monthLoads = loads.filter((l) => ((by === "pickup" ? l.pickup_date : l.delivery_date) || "").startsWith(monthKey));
  const agendaDays = [...byDay.keys()].filter((k) => k.startsWith(monthKey)).sort();

  // Pickups show the pickup window, Deliveries the delivery window (from the rate con or typed on the load).
  const win = (l: Load) => stopWindow(l, by);
  const tip = (l: Load) => {
    const pu = stopWindow(l, "pickup");
    const del = stopWindow(l, "delivery");
    return [`${l.origin_city}, ${l.origin_state} → ${l.destination_city}, ${l.destination_state}`, pu && `Pickup: ${pu}`, del && `Delivery: ${del}`].filter(Boolean).join("\n");
  };

  const shift = (n: number) => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + n, 1));

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2.5 sm:px-4">
        <div className="flex items-center gap-1">
          <Button size="icon-sm" variant="ghost" onClick={() => shift(-1)} aria-label="Previous month">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-[140px] text-center text-sm font-semibold text-fg">{monthLabel}</div>
          <Button size="icon-sm" variant="ghost" onClick={() => shift(1)} aria-label="Next month">
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button size="xs" variant="outline" onClick={() => setMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))} className="ml-1">
            Today
          </Button>
        </div>
        <div className="flex items-center gap-3">
          <span className="tnum hidden text-xs text-fg-3 sm:inline">
            {monthLoads.length} loads · {money(monthLoads.reduce((s, l) => s + l.gross_amount, 0), { cents: false })}
          </span>
          <Segmented
            size="sm"
            value={by}
            onChange={setBy}
            options={[
              { value: "pickup", label: "Pickups" },
              { value: "delivery", label: "Deliveries" },
            ]}
          />
        </div>
      </div>

      {/* Grid (tablet and up) */}
      <div className="hidden md:block">
        <div className="grid grid-cols-7 border-b border-line">
          {DOW.map((d) => (
            <div key={d} className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-fg-4">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((d, i) => {
            const key = toDay(d);
            const items = byDay.get(key) || [];
            const inMonth = d.getMonth() === month.getMonth();
            return (
              <div
                key={key}
                className={cn("min-h-[116px] border-b border-line p-1.5", i % 7 !== 6 && "border-r", !inMonth && "bg-surface-2/40")}
              >
                <div className="mb-1 flex items-center justify-between px-0.5">
                  <span
                    className={cn(
                      "tnum flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs",
                      key === t ? "bg-brand font-bold text-brand-fg" : inMonth ? "text-fg-2" : "text-fg-4",
                    )}
                  >
                    {d.getDate()}
                  </span>
                  {items.length > 0 && <span className="tnum text-[10px] text-fg-4">{money(items.reduce((s, l) => s + l.gross_amount, 0), { cents: false })}</span>}
                </div>
                <div className="space-y-1">
                  {items.slice(0, 3).map((l) => (
                    <Link
                      key={l.id}
                      href={`/loads/${l.id}`}
                      title={tip(l)}
                      className={cn("block rounded-md border-l-[3px] bg-surface-2 px-1.5 py-1 text-[11px] leading-tight text-fg hover:bg-surface-3", STATUS[l.status].chip)}
                    >
                      <span className="block truncate">
                        <span className="font-semibold">{l.origin_state}→{l.destination_state}</span>{" "}
                        <span className="text-fg-3">{driverById(l.driver_id)?.name.split(" ")[0] || truckById(l.truck_id)?.unit_number || ""}</span>
                      </span>
                      {win(l) && (
                        <span className="tnum mt-0.5 flex items-center gap-1 truncate text-[10px] text-fg-3">
                          <Clock className="h-2.5 w-2.5 shrink-0" />
                          <span className="truncate">{win(l)}</span>
                        </span>
                      )}
                    </Link>
                  ))}
                  {items.length > 3 && <div className="px-1 text-[11px] text-fg-3">+{items.length - 3} more</div>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Agenda (phones) */}
      <div className="md:hidden">
        {agendaDays.length === 0 && <div className="px-4 py-10 text-center text-sm text-fg-4">No loads this month.</div>}
        {agendaDays.map((k) => (
          <div key={k} className="border-b border-line">
            <div className={cn("sticky top-14 bg-surface-2/90 px-4 py-1.5 text-xs font-semibold backdrop-blur", k === t ? "text-fg" : "text-fg-3")}>
              {parseDay(k)!.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
              {k === t && " · Today"}
            </div>
            {(byDay.get(k) || []).map((l) => (
              <Link key={l.id} href={`/loads/${l.id}`} className="flex items-center gap-3 px-4 py-2.5 active:bg-surface-2">
                <span className={cn("h-8 w-1 shrink-0 rounded-full", STATUS[l.status].dot)} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-medium text-fg">
                    {l.origin_city}, {l.origin_state} → {l.destination_city}, {l.destination_state}
                  </div>
                  <div className="truncate text-xs text-fg-3">
                    {STATUS[l.status].label} · {driverById(l.driver_id)?.name || "No driver"}
                    {win(l) && ` · ${by === "pickup" ? "PU" : "DEL"} ${win(l)}`}
                  </div>
                </div>
                <span className="tnum text-[13px] font-semibold text-fg">{money(l.gross_amount, { cents: false })}</span>
              </Link>
            ))}
          </div>
        ))}
      </div>
    </Card>
  );
}
