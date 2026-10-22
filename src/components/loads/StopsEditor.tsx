"use client";

import { ArrowDown, ArrowUp, ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { PlaceInput } from "@/components/ui/PlaceInput";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { cn, uid, US_STATES } from "@/lib/format";
import type { LoadStop } from "@/lib/types";

export const newStop = (type: LoadStop["type"], p: Partial<LoadStop> = {}): LoadStop => ({
  id: uid(),
  type,
  facility_name: "",
  address: "",
  city: "",
  state: "",
  zip: "",
  date: "",
  time: "",
  appointment: "",
  contact_name: "",
  phone: "",
  reference_numbers: "",
  commodity: "",
  weight: "",
  instructions: "",
  status: "pending",
  ...p,
});

/** Every pickup and delivery, in order. First pickup = origin, last delivery = destination. */
export function StopsEditor({
  stops,
  onChange,
  legs,
}: {
  stops: LoadStop[];
  onChange: (s: LoadStop[]) => void;
  legs?: { miles: number }[];
}) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const set = (id: string, p: Partial<LoadStop>) => onChange(stops.map((s) => (s.id === id ? { ...s, ...p } : s)));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= stops.length) return;
    const next = stops.slice();
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  return (
    <div className="space-y-2.5">
      {stops.map((s, i) => {
        const pickup = s.type === "pickup";
        const expanded = open[s.id] ?? false;
        return (
          <div key={s.id}>
            {i > 0 && legs?.[i - 1] && legs[i - 1].miles > 0 && (
              <div className="tnum -mt-1 mb-1.5 ml-[18px] border-l border-dashed border-line-strong py-1 pl-4 text-[11px] text-fg-4">
                {legs[i - 1].miles.toLocaleString()} mi
              </div>
            )}
            <div className={cn("rounded-xl border bg-surface", pickup ? "border-line" : "border-line")}>
              <div className="flex items-center gap-2 border-b border-line px-3 py-2">
                <span
                  className={cn(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
                    pickup ? "bg-inverse text-inverse-fg" : "bg-brand text-brand-fg",
                  )}
                >
                  {i + 1}
                </span>
                <Select
                  value={s.type}
                  onChange={(e) => set(s.id, { type: e.target.value as LoadStop["type"] })}
                  className="h-7 w-[118px] border-transparent bg-transparent pl-1.5 text-[13px] font-semibold hover:border-line"
                >
                  <option value="pickup">Pickup</option>
                  <option value="delivery">Delivery</option>
                </Select>
                <span className="min-w-0 flex-1 truncate text-xs text-fg-3">{[s.facility_name, [s.city, s.state].filter(Boolean).join(", ")].filter(Boolean).join(" · ")}</span>
                <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="rounded p-1 text-fg-4 hover:text-fg disabled:opacity-30" aria-label="Move up">
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
                <button type="button" onClick={() => move(i, 1)} disabled={i === stops.length - 1} className="rounded p-1 text-fg-4 hover:text-fg disabled:opacity-30" aria-label="Move down">
                  <ArrowDown className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => onChange(stops.filter((x) => x.id !== s.id))}
                  disabled={stops.length <= 2}
                  className="rounded p-1 text-fg-4 hover:text-red-500 disabled:opacity-30"
                  aria-label="Remove stop"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="grid grid-cols-6 gap-2.5 p-3">
                <Field label="Facility" className="col-span-6 sm:col-span-3">
                  <Input value={s.facility_name} onChange={(e) => set(s.id, { facility_name: e.target.value })} placeholder={pickup ? "Shipper" : "Receiver"} />
                </Field>
                <Field label="Street address" className="col-span-6 sm:col-span-3">
                  <Input value={s.address} onChange={(e) => set(s.id, { address: e.target.value })} />
                </Field>
                <Field label="City" required className="col-span-3 sm:col-span-2">
                  <PlaceInput
                    value={s.city}
                    onChange={(v) => set(s.id, { city: v })}
                    onPick={(p) => {
                      // "Chicago, IL" / "Chicago, IL 60607" fill city, state and ZIP.
                      const m = p.match(/^(.+?),\s*([A-Za-z]{2,3})(?:\s+(\S+))?$/);
                      set(s.id, m ? { city: m[1], state: m[2].toUpperCase(), ...(m[3] ? { zip: m[3] } : {}) } : { city: p });
                    }}
                  />
                </Field>
                <Field label="State" required className="col-span-3 sm:col-span-2">
                  <Input
                    list="us-states"
                    value={s.state}
                    onChange={(e) => set(s.id, { state: e.target.value.toUpperCase().slice(0, 2) })}
                    placeholder="TX"
                    className="uppercase"
                  />
                </Field>
                <Field label="ZIP" className="col-span-2 sm:col-span-2">
                  <Input value={s.zip} onChange={(e) => set(s.id, { zip: e.target.value })} inputMode="numeric" maxLength={10} />
                </Field>
                <Field label="Date" className="col-span-4 sm:col-span-2">
                  <Input type="date" value={s.date} onChange={(e) => set(s.id, { date: e.target.value })} />
                </Field>
                <Field label="Time" className="col-span-3 sm:col-span-2">
                  <Input type="time" value={s.time} onChange={(e) => set(s.id, { time: e.target.value })} />
                </Field>
                <Field label="Window / appt" className="col-span-3 sm:col-span-2">
                  <Input value={s.appointment} onChange={(e) => set(s.id, { appointment: e.target.value })} placeholder="FCFS 08:00–15:00" />
                </Field>
              </div>
              <button
                type="button"
                onClick={() => setOpen((o) => ({ ...o, [s.id]: !expanded }))}
                className="flex w-full items-center gap-1.5 border-t border-line px-3 py-2 text-xs font-medium text-fg-3 hover:text-fg"
              >
                {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                References, contact & instructions
                {(s.reference_numbers || s.instructions || s.phone) && !expanded && <span className="ml-1 h-1.5 w-1.5 rounded-full bg-brand" />}
              </button>
              {expanded && (
                <div className="grid grid-cols-6 gap-2.5 px-3 pb-3">
                  <Field label="PU / PO / ref #" className="col-span-6 sm:col-span-3">
                    <Input value={s.reference_numbers} onChange={(e) => set(s.id, { reference_numbers: e.target.value })} />
                  </Field>
                  <Field label="Contact" className="col-span-3 sm:col-span-2">
                    <Input value={s.contact_name} onChange={(e) => set(s.id, { contact_name: e.target.value })} />
                  </Field>
                  <Field label="Phone" className="col-span-3 sm:col-span-1">
                    <Input value={s.phone} onChange={(e) => set(s.id, { phone: e.target.value })} type="tel" />
                  </Field>
                  <Field label="Commodity" className="col-span-3">
                    <Input value={s.commodity} onChange={(e) => set(s.id, { commodity: e.target.value })} />
                  </Field>
                  <Field label="Weight / pieces" className="col-span-3">
                    <Input value={s.weight} onChange={(e) => set(s.id, { weight: e.target.value })} />
                  </Field>
                  <Field label="Instructions" className="col-span-6">
                    <Textarea value={s.instructions} onChange={(e) => set(s.id, { instructions: e.target.value })} rows={2} />
                  </Field>
                </div>
              )}
            </div>
          </div>
        );
      })}
      <datalist id="us-states">
        {US_STATES.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={() => onChange([...stops, newStop("pickup")])}>
          <Plus className="h-3.5 w-3.5" /> Pickup
        </Button>
        <Button size="sm" variant="outline" onClick={() => onChange([...stops, newStop("delivery")])}>
          <Plus className="h-3.5 w-3.5" /> Delivery
        </Button>
      </div>
    </div>
  );
}
