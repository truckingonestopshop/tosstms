"use client";

import { useEffect, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { useStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import { readDocument } from "@/lib/ratecon/client";
import { cn } from "@/lib/format";
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
  ownership: string;
  gvwr: string;
  plate_state: string;
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
  ownership: t?.ownership ?? "",
  gvwr: t?.gvwr ? String(t.gvwr) : "",
  plate_state: t?.plate_state ?? "",
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
  const set = (p: Partial<Draft>) => setD((x) => ({ ...x, ...p }));

  // The cab card fills in what's still empty; anything typed stays.
  const readCabCard = async (slot: string, file: File) => {
    if (slot !== "registration") return;
    toast.info("Reading the cab card…");
    try {
      const c = await readDocument(file, "cab_card");
      const filled: string[] = [];
      const take = (k: keyof Draft, v: string, label: string) => {
        if (v && !String(d[k] ?? "").trim()) {
          filled.push(label);
          return { [k]: v };
        }
        return {};
      };
      const patch = {
        ...take("unit_number", c.unit_number, "truck #"),
        ...take("plate", c.plate, "plate"),
        ...take("year", c.year, "year"),
        ...take("make", c.make, "make"),
        ...take("model", c.model, "model"),
        ...take("vin_number", c.vin, "VIN"),
      };
      setD((x) => ({ ...x, ...patch }));
      if (c.expires) {
        setDocs((l) => l.map((p) => (p.slot === "registration" && !p.expires ? { ...p, expires: c.expires } : p)));
        if (!truck) filled.push("expiry");
      }
      toast.success(filled.length ? `From the cab card: ${filled.join(", ")}. Check them before saving.` : "Nothing new to fill in from the cab card.");
    } catch (e) {
      toast.info(`Couldn't read the cab card: ${(e as Error).message} Fill it in by hand.`);
    }
  };

  useEffect(() => {
    if (open) setD(toDraft(truck));
    if (!open) {
      setDocs([]);
    }
  }, [open, truck]);

  const companyDrivers = drivers.filter((x) => x.company_id === companyId);

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
      ownership: (d.ownership || null) as Truck["ownership"],
      gvwr: d.gvwr ? Number(d.gvwr.replace(/\D/g, "")) || null : null,
      plate_state: d.plate_state.trim().toUpperCase() || null,
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
      subtitle="Power unit, registration and paperwork"
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
            <Input value={d.model} onChange={(e) => set({ model: e.target.value })} placeholder="379" />
          </Field>
          <Field label="VIN" className="col-span-2">
            <Input value={d.vin_number} onChange={(e) => set({ vin_number: e.target.value })} maxLength={17} className="uppercase" />
          </Field>
          <Field label="Plate state">
            <Input value={d.plate_state} onChange={(e) => set({ plate_state: e.target.value })} maxLength={3} placeholder="FL" className="uppercase" />
          </Field>
          <Field label="GVWR (lbs)">
            <Input value={d.gvwr} onChange={(e) => set({ gvwr: e.target.value })} inputMode="numeric" placeholder="80000" />
          </Field>
          <Field label="Leased or owned" className="col-span-2">
            <Select value={d.ownership} onChange={(e) => set({ ownership: e.target.value })}>
              <option value="">—</option>
              <option value="owned">Owned</option>
              <option value="leased">Leased</option>
            </Select>
          </Field>
        </div>

        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-fg-4">Trailer</div>
          <TrailerPicker companyId={companyId} value={d.trailer_id} onChange={(id) => set({ trailer_id: id })} />
        </div>

        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-fg-4">Driver</div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
          </div>
        </div>

        <TruckDocs truckId={truck?.id} companyId={companyId} pending={docs} onPending={setDocs} onFile={readCabCard} />

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
