"use client";

import { useEffect, useState } from "react";
import { Minus, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { useStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import { TRAILER_TYPES, cn, uid } from "@/lib/format";
import { GEAR_PRESETS } from "@/lib/pitch";
import type { Truck, TruckAccessory, TruckStatus } from "@/lib/types";

type Draft = {
  unit_number: string;
  trailer_number: string;
  plate: string;
  vin_number: string;
  year: string;
  make: string;
  trailer_type: string;
  trailer_length: string;
  max_weight: string;
  door_type: string;
  suspension: string;
  important_info: string;
  assigned_driver_id: string;
  current_location: string;
  available_date: string;
  status: TruckStatus;
  notes: string;
  accessories: TruckAccessory[];
};

const toDraft = (t?: Truck | null): Draft => ({
  unit_number: t?.unit_number ?? "",
  trailer_number: t?.trailer_number ?? "",
  plate: t?.plate ?? "",
  vin_number: t?.vin_number ?? "",
  year: t?.year ? String(t.year) : "",
  make: t?.make ?? "",
  trailer_type: t?.trailer_type ?? "Dry Van",
  trailer_length: t?.trailer_length ?? "53 ft",
  max_weight: t?.max_weight ? String(t.max_weight) : "45000",
  door_type: t?.door_type ?? "Swing doors",
  suspension: t?.suspension ?? "Air ride",
  important_info: t?.important_info ?? "",
  assigned_driver_id: t?.assigned_driver_id ?? "",
  current_location: t?.current_location ?? "",
  available_date: t?.available_date ?? "",
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
  const { drivers, createTruck, updateTruck } = useStore();
  const [d, setD] = useState<Draft>(toDraft(truck));
  const [saving, setSaving] = useState(false);
  const [gearName, setGearName] = useState("");
  const [gearQty, setGearQty] = useState("1");
  const set = (p: Partial<Draft>) => setD((x) => ({ ...x, ...p }));

  useEffect(() => {
    if (open) setD(toDraft(truck));
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
    const row: Partial<Truck> = {
      ...d,
      year: d.year ? Number(d.year) : null,
      max_weight: d.max_weight ? Number(String(d.max_weight).replace(/[^\d]/g, "")) : null,
      assigned_driver_id: d.assigned_driver_id || null,
      available_date: d.available_date || null,
      vin_number: d.vin_number.toUpperCase(),
    };
    const ok = truck ? await updateTruck(truck.id, row) : !!(await createTruck({ ...row, company_id: companyId }));
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
      subtitle="Power unit, trailer, specs and onboard gear"
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
          <Field label="Trailer #">
            <Input value={d.trailer_number} onChange={(e) => set({ trailer_number: e.target.value })} placeholder="TR-8820" />
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
          <Field label="VIN" className="col-span-2">
            <Input value={d.vin_number} onChange={(e) => set({ vin_number: e.target.value })} maxLength={17} className="uppercase" />
          </Field>
          <Field label="Year">
            <Input value={d.year} onChange={(e) => set({ year: e.target.value })} inputMode="numeric" maxLength={4} />
          </Field>
          <Field label="Make">
            <Input value={d.make} onChange={(e) => set({ make: e.target.value })} placeholder="Freightliner" />
          </Field>
        </div>

        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-fg-4">Trailer & specs</div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <Field label="Trailer type" className="col-span-2">
              <Input list="trailer-types" value={d.trailer_type} onChange={(e) => set({ trailer_type: e.target.value })} />
              <datalist id="trailer-types">
                {TRAILER_TYPES.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </Field>
            <Field label="Length">
              <Input list="trailer-lengths" value={d.trailer_length} onChange={(e) => set({ trailer_length: e.target.value })} />
              <datalist id="trailer-lengths">
                {["53 ft", "48 ft", "45 ft", "40 ft", "26 ft", "24 ft"].map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </Field>
            <Field label="Max weight">
              <Input value={d.max_weight} onChange={(e) => set({ max_weight: e.target.value })} inputMode="numeric" suffix="lbs" />
            </Field>
            <Field label="Doors">
              <Input list="door-types" value={d.door_type} onChange={(e) => set({ door_type: e.target.value })} />
              <datalist id="door-types">
                {["Swing doors", "Roll-up", "Open deck", "Side doors"].map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </Field>
            <Field label="Suspension">
              <Select value={d.suspension} onChange={(e) => set({ suspension: e.target.value })}>
                <option>Air ride</option>
                <option>Spring</option>
              </Select>
            </Field>
            <Field label="Endorsements & features" className="col-span-2 sm:col-span-4">
              <Input
                value={d.important_info}
                onChange={(e) => set({ important_info: e.target.value })}
                placeholder="Hazmat, TWIC, team, liftgate, food grade, scale…"
              />
            </Field>
          </div>
        </div>

        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-fg-4">Driver & availability</div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
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
            <Field label="Available from" hint="Empty = ready now">
              <Input type="date" value={d.available_date} onChange={(e) => set({ available_date: e.target.value })} />
            </Field>
          </div>
        </div>

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
