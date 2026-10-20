"use client";

import { useEffect, useState } from "react";
import { Minus, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { useStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import { cn, uid } from "@/lib/format";
import { GEAR_PRESETS } from "@/lib/pitch";
import { TrailerPicker } from "./Trailers";
import { TruckDocs, type PendingDoc } from "./TrailerDocs";

const TRUCK_MAKES = ["Freightliner", "Peterbilt", "Kenworth", "Volvo", "International", "Mack", "Western Star", "Ford", "Isuzu", "Hino", "Ram"];
import type { Truck, TruckAccessory, TruckStatus } from "@/lib/types";

type Draft = {
  unit_number: string;
  trailer_id: string | null;
  plate: string;
  vin_number: string;
  year: string;
  make: string;
  model: string;
  important_info: string;
  assigned_driver_id: string;
  current_location: string;
  available_date: string;
  available_time: string;
  status: TruckStatus;
  notes: string;
  accessories: TruckAccessory[];
};

const toDraft = (t?: Truck | null): Draft => ({
  unit_number: t?.unit_number ?? "",
  trailer_id: t?.trailer_id ?? null,
  plate: t?.plate ?? "",
  vin_number: t?.vin_number ?? "",
  year: t?.year ? String(t.year) : "",
  make: t?.make ?? "",
  model: t?.model ?? "",
  important_info: t?.important_info ?? "",
  assigned_driver_id: t?.assigned_driver_id ?? "",
  current_location: t?.current_location ?? "",
  available_date: t?.available_date ?? "",
  available_time: t?.available_time ?? "",
  status: t?.status ?? "active",
  notes: t?.notes ?? "",
  accessories: t?.accessories ?? [],
});

export function TruckForm({
  open,
  onClose,
  companyId,
  truck,
}: {
  open: boolean;
  onClose: () => void;
  companyId: string;
  truck?: Truck | null;
}) {
  const { drivers, createTruck, updateTruck, uploadDocument } = useStore();
  const [d, setD] = useState<Draft>(toDraft(truck));
  const [saving, setSaving] = useState(false);
  // Registration / inspection picked before a new truck exists; uploaded right after it's created.
  const [docs, setDocs] = useState<PendingDoc[]>([]);
  const [gearName, setGearName] = useState("");
  const [gearQty, setGearQty] = useState("1");
  const set = (p: Partial<Draft>) => setD((x) => ({ ...x, ...p }));

  useEffect(() => {
    if (open) setD(toDraft(truck));
    if (!open) setDocs([]);
  }, [open, truck]);

  const companyDrivers = drivers.filter((x) => x.company_id === companyId);

  const addGear = (name: string, quantity: number, details = "") => {
    if (!name.trim()) return;
    setD((x) => {
      const hit = x.accessories.find((a) => a.name.toLowerCase() === name.trim().toLowerCase());
      if (hit) return { ...x, accessories: x.accessories.map((a) => (a === hit ? { ...a, quantity: a.quantity + quantity } : a)) };
      return { ...x, accessories: [...x.accessories, { id: uid(), name: name.trim(), quantity, details }] };
    });
  };

  const save = async () => {
    if (!d.unit_number.trim()) return toast.error("Truck number is required.");
    setSaving(true);
    // Trailer specs are copied from the hooked trailer by the database.
    const row: Partial<Truck> = {
      ...d,
      year: d.year ? Number(d.year) : null,
      assigned_driver_id: d.assigned_driver_id || null,
      available_date: d.available_date || null,
      // A time only means something with a date.
      available_time: d.available_date && d.available_time ? d.available_time : null,
      vin_number: d.vin_number.toUpperCase(),
    };
    let ok = false;
    if (truck) ok = await updateTruck(truck.id, row);
    else {
      const created = await createTruck({ ...row, company_id: companyId });
      ok = !!created;
      if (created && docs.length) {
        let up = 0;
        for (const p of docs) if (await uploadDocument(p.file, { company_id: companyId, truck_id: created.id, doc_type: p.slot, expires_on: p.expires || null })) up++;
        if (up < docs.length) toast.error(`${docs.length - up} document(s) didn't upload. Add them from the truck.`);
      }
    }
    setSaving(false);
    if (ok) {
      toast.success(truck ? "Truck saved" : `Unit ${d.unit_number} added`);
      onClose();
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={truck ? `Edit unit ${truck.unit_number}` : "Add truck"}
      subtitle="Power unit, hooked trailer and onboard gear"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} loading={saving}>
            {truck ? "Save truck" : "Add truck"}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Truck #" required>
            <Input value={d.unit_number} onChange={(e) => set({ unit_number: e.target.value })} placeholder="104" autoFocus />
          </Field>
          <Field label="Plate">
            <Input value={d.plate} onChange={(e) => set({ plate: e.target.value })} />
          </Field>
          <Field label="Status">
            <Select value={d.status} onChange={(e) => set({ status: e.target.value as TruckStatus })}>
              <option value="active">Active</option>
              <option value="out_of_service">Out of service</option>
              <option value="inactive">Inactive</option>
            </Select>
          </Field>
          <Field label="Year">
            <Input value={d.year} onChange={(e) => set({ year: e.target.value })} inputMode="numeric" maxLength={4} placeholder="2022" />
          </Field>
          <Field label="Make">
            <Input list="truck-makes" value={d.make} onChange={(e) => set({ make: e.target.value })} placeholder="Peterbilt" />
            <datalist id="truck-makes">
              {TRUCK_MAKES.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </Field>
          <Field label="Model">
            <Input value={d.model} onChange={(e) => set({ model: e.target.value })} placeholder="T680" />
          </Field>
          <Field label="VIN" className="col-span-2">
            <Input value={d.vin_number} onChange={(e) => set({ vin_number: e.target.value })} maxLength={17} className="uppercase" />
          </Field>
        </div>

        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-fg-4">Trailer</div>
          <TrailerPicker companyId={companyId} value={d.trailer_id} onChange={(id) => set({ trailer_id: id })} />
          <Field label="Endorsements & features" className="mt-3">
            <Input
              value={d.important_info}
              onChange={(e) => set({ important_info: e.target.value })}
              placeholder="Hazmat, TWIC, team, liftgate, food grade, scale…"
            />
          </Field>
        </div>

        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-fg-4">Driver & availability</div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.55fr)]">
            <Field label="Assigned driver">
              <Select value={d.assigned_driver_id} onChange={(e) => set({ assigned_driver_id: e.target.value })}>
                <option value="">Unassigned</option>
                {companyDrivers.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Current location">
              <Input value={d.current_location} onChange={(e) => set({ current_location: e.target.value })} placeholder="Dallas, TX" />
            </Field>
            <Field label="Available from" hint={d.available_date ? (d.available_time ? undefined : "Add a time if it matters") : "Empty = ready now"}>
              <div className="flex gap-2">
                <Input type="date" value={d.available_date} onChange={(e) => set({ available_date: e.target.value, available_time: e.target.value ? d.available_time : "" })} className="min-w-0 flex-1" />
                <Input type="time" value={d.available_time} onChange={(e) => set({ available_time: e.target.value })} disabled={!d.available_date} aria-label="Available from time" className="w-[112px]" />
              </div>
            </Field>
          </div>
        </div>

        <TruckDocs truckId={truck?.id} companyId={companyId} pending={docs} onPending={setDocs} />

        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-fg-4">Onboard gear</div>
          <div className="mb-3 flex flex-wrap gap-1.5">
            {GEAR_PRESETS.map((g) => (
              <button
                key={g.name}
                type="button"
                onClick={() => addGear(g.name, g.quantity, g.details)}
                className="inline-flex items-center gap-1 rounded-full border border-line px-2.5 py-1 text-xs text-fg-2 hover:border-line-strong hover:bg-surface-2"
              >
                <Plus className="h-3 w-3" />
                {g.name}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <Input value={gearName} onChange={(e) => setGearName(e.target.value)} placeholder="Other gear" className="flex-1" />
            <Input value={gearQty} onChange={(e) => setGearQty(e.target.value)} inputMode="numeric" className="w-20" />
            <Button
              variant="outline"
              onClick={() => {
                addGear(gearName, Number(gearQty) || 1);
                setGearName("");
                setGearQty("1");
              }}
            >
              Add
            </Button>
          </div>
          {d.accessories.length > 0 && (
            <ul className="mt-3 divide-y divide-line rounded-xl border border-line">
              {d.accessories.map((a) => (
                <li key={a.id} className="flex items-center gap-2 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <Input
                      value={a.name}
                      onChange={(e) => set({ accessories: d.accessories.map((x) => (x.id === a.id ? { ...x, name: e.target.value } : x)) })}
                      className="h-7 border-transparent px-1 font-medium hover:border-line"
                    />
                    <Input
                      value={a.details || ""}
                      placeholder="Details"
                      onChange={(e) => set({ accessories: d.accessories.map((x) => (x.id === a.id ? { ...x, details: e.target.value } : x)) })}
                      className="h-7 border-transparent px-1 text-xs text-fg-3 hover:border-line"
                    />
                  </div>
                  <QtyStepper
                    value={a.quantity}
                    onChange={(q) => set({ accessories: d.accessories.map((x) => (x.id === a.id ? { ...x, quantity: q } : x)) })}
                  />
                  <button
                    onClick={() => set({ accessories: d.accessories.filter((x) => x.id !== a.id) })}
                    className="rounded-md p-1 text-fg-4 hover:bg-surface-2 hover:text-fg"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <Field label="Notes">
          <Textarea value={d.notes} onChange={(e) => set({ notes: e.target.value })} rows={2} />
        </Field>
      </div>
    </Modal>
  );
}

export function QtyStepper({ value, onChange, className }: { value: number; onChange: (v: number) => void; className?: string }) {
  return (
    <div className={cn("inline-flex items-center rounded-lg border border-line", className)}>
      <button type="button" onClick={() => onChange(Math.max(1, value - 1))} className="p-1.5 text-fg-3 hover:text-fg" aria-label="Less">
        <Minus className="h-3.5 w-3.5" />
      </button>
      <span className="tnum w-7 text-center text-[13px] font-semibold text-fg">{value}</span>
      <button type="button" onClick={() => onChange(value + 1)} className="p-1.5 text-fg-3 hover:text-fg" aria-label="More">
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
