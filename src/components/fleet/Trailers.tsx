"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Container, Link2, Link2Off, Pencil, Plus, Search, Trash2, Truck as TruckIcon } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { Drawer, Modal } from "@/components/ui/Modal";
import { Card, Empty, Eyebrow, KV, Pill, neutralPill } from "@/components/ui/Bits";
import { confirmDialog } from "@/components/ui/Confirm";
import { stagger } from "@/components/ui/Motion";
import { DocumentsPanel } from "@/components/docs/DocumentsPanel";
import { useStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import { DOOR_TYPES, TRAILER_GROUPS, TRAILER_LENGTHS, TRAILER_TYPES, cn, num } from "@/lib/format";
import type { Company, Trailer, TruckStatus } from "@/lib/types";

const OTHER = "__other";

/**
 * Dropdown with every option visible (grouped), plus "Other…" to type anything else.
 * A value from older data that isn't in the list still shows as selected.
 */
export function ChoiceSelect({
  value,
  onChange,
  groups,
  placeholder = "Select…",
  otherLabel = "Other…",
  id,
}: {
  value: string;
  onChange: (v: string) => void;
  groups: { label?: string; types: string[] }[];
  placeholder?: string;
  otherLabel?: string;
  id?: string;
}) {
  const all = useMemo(() => groups.flatMap((g) => g.types), [groups]);
  const known = !value || all.includes(value);
  const [typing, setTyping] = useState(false);
  if (typing) {
    return (
      <div className="flex gap-1.5">
        <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} placeholder="Type it in" autoFocus className="flex-1" />
        <Button variant="ghost" size="sm" className="h-9" onClick={() => setTyping(false)}>
          List
        </Button>
      </div>
    );
  }
  return (
    <Select
      id={id}
      value={value}
      onChange={(e) => {
        if (e.target.value === OTHER) {
          setTyping(true);
          onChange("");
        } else onChange(e.target.value);
      }}
    >
      <option value="">{placeholder}</option>
      {!known && <option value={value}>{value}</option>}
      {groups.map((g, i) =>
        g.label ? (
          <optgroup key={g.label} label={g.label}>
            {g.types.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </optgroup>
        ) : (
          g.types.map((t) => (
            <option key={`${i}${t}`} value={t}>
              {t}
            </option>
          ))
        ),
      )}
      <option value={OTHER}>{otherLabel}</option>
    </Select>
  );
}

export const TrailerTypeSelect = (p: { value: string; onChange: (v: string) => void; id?: string }) => (
  <ChoiceSelect {...p} groups={TRAILER_GROUPS} placeholder="Select trailer type…" otherLabel="Other type…" />
);

const STATUS_LABEL: Record<TruckStatus, string> = { active: "Active", out_of_service: "Out of service", inactive: "Inactive" };

/** "53 ft Reefer" */
export const trailerLine = (t: Pick<Trailer, "trailer_length" | "trailer_type">) => [t.trailer_length, t.trailer_type].filter(Boolean).join(" ") || "Type not set";

type Draft = {
  unit_number: string;
  trailer_type: string;
  trailer_length: string;
  max_weight: string;
  door_type: string;
  suspension: string;
  features: string;
  plate: string;
  vin_number: string;
  year: string;
  make: string;
  status: TruckStatus;
  notes: string;
};

const toDraft = (t?: Trailer | null): Draft => ({
  unit_number: t?.unit_number ?? "",
  trailer_type: t?.trailer_type ?? "",
  trailer_length: t?.trailer_length ?? "53 ft",
  max_weight: t?.max_weight ? String(t.max_weight) : "45000",
  door_type: t?.door_type ?? "Swing doors",
  suspension: t?.suspension ?? "Air ride",
  features: t?.features ?? "",
  plate: t?.plate ?? "",
  vin_number: t?.vin_number ?? "",
  year: t?.year ? String(t.year) : "",
  make: t?.make ?? "",
  status: t?.status ?? "active",
  notes: t?.notes ?? "",
});

/** Add or edit a trailer. `hookTo` hooks the new trailer to that truck right away. */
export function TrailerForm({
  open,
  onClose,
  companyId,
  trailer,
  hookTo,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  companyId: string;
  trailer?: Trailer | null;
  hookTo?: string | null;
  onSaved?: (t: Trailer) => void;
}) {
  const { createTrailer, updateTrailer, hookTrailer, trailers } = useStore();
  const [d, setD] = useState<Draft>(toDraft(trailer));
  const [saving, setSaving] = useState(false);
  const set = (p: Partial<Draft>) => setD((x) => ({ ...x, ...p }));

  useEffect(() => {
    if (open) setD(toDraft(trailer));
  }, [open, trailer]);

  const save = async () => {
    const unit = d.unit_number.trim();
    if (!unit) return toast.error("Trailer number is required.");
    if (!d.trailer_type.trim()) return toast.error("Pick the trailer type.");
    if (trailers.some((t) => t.company_id === companyId && t.id !== trailer?.id && t.unit_number.trim().toLowerCase() === unit.toLowerCase()))
      return toast.error(`Trailer ${unit} already exists for this carrier.`);
    setSaving(true);
    const row: Partial<Trailer> = {
      ...d,
      unit_number: unit,
      year: d.year ? Number(d.year) : null,
      max_weight: d.max_weight ? Number(String(d.max_weight).replace(/[^\d]/g, "")) : null,
      vin_number: d.vin_number.toUpperCase() || null,
    };
    let saved: Trailer | null = null;
    if (trailer) {
      if (await updateTrailer(trailer.id, row)) saved = { ...trailer, ...row } as Trailer;
    } else {
      saved = await createTrailer({ ...row, company_id: companyId });
      if (saved && hookTo) await hookTrailer(hookTo, saved.id);
    }
    setSaving(false);
    if (saved) {
      toast.success(trailer ? "Trailer saved" : `Trailer ${unit} added${hookTo ? " and hooked" : ""}`);
      onSaved?.(saved);
      onClose();
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={trailer ? `Edit trailer ${trailer.unit_number}` : "Add trailer"}
      subtitle="Trailer type, size and specs. Hook it to any truck of this carrier."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} loading={saving}>
            {trailer ? "Save trailer" : "Add trailer"}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Trailer #" required>
            <Input value={d.unit_number} onChange={(e) => set({ unit_number: e.target.value })} placeholder="TR-8820" autoFocus />
          </Field>
          <Field label="Trailer type" required className="col-span-2 sm:col-span-2">
            <TrailerTypeSelect value={d.trailer_type} onChange={(v) => set({ trailer_type: v })} />
          </Field>
          <Field label="Status">
            <Select value={d.status} onChange={(e) => set({ status: e.target.value as TruckStatus })}>
              {Object.entries(STATUS_LABEL).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Length">
            <ChoiceSelect value={d.trailer_length} onChange={(v) => set({ trailer_length: v })} groups={[{ types: TRAILER_LENGTHS }]} placeholder="Length…" otherLabel="Other length…" />
          </Field>
          <Field label="Max weight">
            <Input value={d.max_weight} onChange={(e) => set({ max_weight: e.target.value })} inputMode="numeric" suffix="lbs" />
          </Field>
          <Field label="Doors">
            <ChoiceSelect value={d.door_type} onChange={(v) => set({ door_type: v })} groups={[{ types: DOOR_TYPES }]} placeholder="Doors…" />
          </Field>
          <Field label="Suspension">
            <Select value={d.suspension} onChange={(e) => set({ suspension: e.target.value })}>
              <option>Air ride</option>
              <option>Spring</option>
            </Select>
          </Field>
          <Field label="Features" className="col-span-2 sm:col-span-4">
            <Input
              value={d.features}
              onChange={(e) => set({ features: e.target.value })}
              placeholder="Reefer unit model, e-track, logistic posts, liftgate, food grade, tarps…"
            />
          </Field>
        </div>

        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-fg-4">Registration</div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field label="Plate">
              <Input value={d.plate} onChange={(e) => set({ plate: e.target.value })} />
            </Field>
            <Field label="VIN" className="col-span-2 sm:col-span-1">
              <Input value={d.vin_number} onChange={(e) => set({ vin_number: e.target.value })} maxLength={17} className="uppercase" />
            </Field>
            <Field label="Year">
              <Input value={d.year} onChange={(e) => set({ year: e.target.value })} inputMode="numeric" maxLength={4} />
            </Field>
            <Field label="Make">
              <Input value={d.make} onChange={(e) => set({ make: e.target.value })} placeholder="Utility, Wabash, Great Dane…" />
            </Field>
          </div>
        </div>

        <Field label="Notes">
          <Textarea value={d.notes} onChange={(e) => set({ notes: e.target.value })} rows={2} placeholder="Where it's parked, damage, interchange…" />
        </Field>
      </div>
    </Modal>
  );
}

/** Truck picker to hook a trailer (or drop it). */
function HookControl({ trailer }: { trailer: Trailer }) {
  const { trucks, hookTrailer } = useStore();
  const holder = trucks.find((t) => t.trailer_id === trailer.id);
  const own = trucks.filter((t) => t.company_id === trailer.company_id && t.status !== "inactive");
  const [busy, setBusy] = useState(false);
  const change = async (truckId: string) => {
    setBusy(true);
    if (truckId) {
      const target = trucks.find((t) => t.id === truckId);
      const ok = await hookTrailer(truckId, trailer.id);
      if (ok) toast.success(`Trailer ${trailer.unit_number} hooked to unit ${target?.unit_number}${target?.trailer_number && target.trailer_id !== trailer.id ? ` (dropped ${target.trailer_number})` : ""}`);
    } else if (holder) {
      if (await hookTrailer(holder.id, null)) toast.success(`Dropped from unit ${holder.unit_number}`);
    }
    setBusy(false);
  };
  return (
    <div className="flex items-end gap-2">
      <Field label="Hooked to" className="flex-1">
        <Select value={holder?.id || ""} onChange={(e) => change(e.target.value)} disabled={busy}>
          <option value="">Not hooked (in the yard)</option>
          {own.map((t) => (
            <option key={t.id} value={t.id}>
              Unit {t.unit_number}
              {t.trailer_id && t.trailer_id !== trailer.id ? ` · now pulling ${t.trailer_number}` : ""}
            </option>
          ))}
        </Select>
      </Field>
      {holder && (
        <Button variant="outline" className="h-9" loading={busy} onClick={() => change("")}>
          {!busy && <Link2Off className="h-3.5 w-3.5" />} Drop
        </Button>
      )}
    </div>
  );
}

export function TrailerSheet({ trailer, onClose, onEdit }: { trailer: Trailer | null; onClose: () => void; onEdit: (t: Trailer) => void }) {
  const { trucks, loads, deleteTrailer } = useStore();
  if (!trailer) return null;
  const holder = trucks.find((t) => t.trailer_id === trailer.id);
  const recent = loads.filter((l) => l.trailer_id === trailer.id).length;
  const specs: [string, React.ReactNode][] = [
    ["Type", trailer.trailer_type],
    ["Length", trailer.trailer_length],
    ["Max weight", trailer.max_weight ? `${num(trailer.max_weight)} lbs` : null],
    ["Doors", trailer.door_type],
    ["Suspension", trailer.suspension],
    ["Plate", trailer.plate],
    ["VIN", trailer.vin_number],
    ["Year / make", [trailer.year, trailer.make].filter(Boolean).join(" ") || null],
  ];
  return (
    <Drawer
      open
      onClose={onClose}
      title={`Trailer ${trailer.unit_number}`}
      subtitle={`${trailerLine(trailer)} · ${holder ? `on unit ${holder.unit_number}` : "in the yard"}`}
      actions={
        <>
          <Button size="sm" variant="ghost" onClick={() => onEdit(trailer)}>
            <Pencil className="h-3.5 w-3.5" /> Edit
          </Button>
          <Button
            size="icon-sm"
            variant="danger-ghost"
            aria-label="Delete trailer"
            onClick={async () => {
              if (
                await confirmDialog({
                  title: `Delete trailer ${trailer.unit_number}?`,
                  body: `${holder ? `It's dropped from unit ${holder.unit_number}. ` : ""}Its documents are deleted. Loads keep their history without it.`,
                  confirmLabel: "Delete trailer",
                  danger: true,
                })
              )
                if (await deleteTrailer(trailer.id)) {
                  toast.success("Trailer deleted");
                  onClose();
                }
            }}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </>
      }
    >
      <div className="space-y-6 p-5">
        <HookControl trailer={trailer} />
        <section>
          <Eyebrow className="mb-2">Specs</Eyebrow>
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
            {specs.map(([k, v]) => (
              <KV key={k} label={k}>
                {v || null}
              </KV>
            ))}
          </div>
          {trailer.features && <p className="mt-3 text-[13px] text-fg-2">{trailer.features}</p>}
          {trailer.notes && <p className="mt-2 whitespace-pre-wrap text-[13px] text-fg-3">{trailer.notes}</p>}
          {recent > 0 && <p className="mt-2 text-xs text-fg-4">Used on {recent} load{recent === 1 ? "" : "s"}</p>}
        </section>
        <section>
          <Eyebrow className="mb-2">Trailer documents</Eyebrow>
          <DocumentsPanel target={{ scope: "trailer", id: trailer.id, companyId: trailer.company_id }} compact emptyText="No trailer files yet." />
        </section>
      </div>
    </Drawer>
  );
}

function TrailerCard({ t, onOpen, i }: { t: Trailer; onOpen: () => void; i: number }) {
  const { trucks } = useStore();
  const holder = trucks.find((x) => x.trailer_id === t.id);
  return (
    <button
      onClick={onOpen}
      className="animate-rise group flex flex-col rounded-xl border border-line bg-surface p-4 text-left transition-[border-color,transform] hover:-translate-y-px hover:border-line-strong"
      style={stagger(i)}
    >
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-fg-3">
          <Container className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold text-fg">{t.unit_number}</span>
            {t.status !== "active" && <Pill className={neutralPill}>{STATUS_LABEL[t.status]}</Pill>}
          </div>
          <div className="truncate text-xs text-fg-3">{trailerLine(t)}</div>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-1.5 border-t border-line pt-2.5 text-xs">
        {holder ? (
          <>
            <Link2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
            <span className="text-fg-2">
              Hooked to <b className="font-semibold text-fg">unit {holder.unit_number}</b>
            </span>
          </>
        ) : (
          <>
            <TruckIcon className="h-3.5 w-3.5 text-fg-4" />
            <span className="text-fg-3">In the yard · not hooked</span>
          </>
        )}
      </div>
    </button>
  );
}

export function TrailersTab({ company }: { company: Company }) {
  const params = useSearchParams();
  const router = useRouter();
  const { trailers, trucks } = useStore();
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const [form, setForm] = useState<{ open: boolean; trailer?: Trailer | null }>({ open: false });
  const own = trailers.filter((t) => t.company_id === company.id);
  const sheet = own.find((x) => x.id === params.get("trailer")) || null;
  const openSheet = (id: string | null) => router.replace(id ? `/fleet?tab=trailers&trailer=${id}` : "/fleet?tab=trailers", { scroll: false });
  const types = TRAILER_TYPES.filter((t) => own.some((x) => x.trailer_type === t));
  const list = own.filter(
    (t) =>
      (!type || t.trailer_type === type) &&
      (!q || `${t.unit_number} ${t.trailer_type} ${t.plate} ${t.vin_number} ${trucks.find((x) => x.trailer_id === t.id)?.unit_number || ""}`.toLowerCase().includes(q.toLowerCase())),
  );
  const yard = own.filter((t) => !trucks.some((x) => x.trailer_id === t.id) && t.status === "active").length;

  return (
    <>
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-4" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Trailer #, type, plate, VIN, truck" className="pl-9" />
        </div>
        {types.length > 1 && (
          <Select value={type} onChange={(e) => setType(e.target.value)} className="sm:w-48">
            <option value="">All types</option>
            {types.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </Select>
        )}
        {yard > 0 && <span className="text-xs text-fg-3">{yard} in the yard</span>}
        <Button variant="secondary" onClick={() => setForm({ open: true, trailer: null })}>
          <Plus className="h-4 w-4" /> Add trailer
        </Button>
      </div>
      {list.length === 0 ? (
        <Card>
          <Empty
            icon={Container}
            title={own.length ? "No trailers match" : "No trailers yet"}
            body={own.length ? undefined : "Add the carrier's trailers, then hook each one to a truck. Swap them any time (drop and hook)."}
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {list.map((t, i) => (
            <TrailerCard key={t.id} t={t} i={i} onOpen={() => openSheet(t.id)} />
          ))}
        </div>
      )}
      <TrailerForm open={form.open} trailer={form.trailer} companyId={company.id} onClose={() => setForm({ open: false })} />
      <TrailerSheet trailer={sheet} onClose={() => openSheet(null)} onEdit={(t) => setForm({ open: true, trailer: t })} />
    </>
  );
}

/** Small read-only summary of the hooked trailer (truck form / truck sheet). */
export function TrailerSummary({ trailerId, className }: { trailerId: string | null; className?: string }) {
  const { trailerById } = useStore();
  const t = trailerById(trailerId);
  if (!t) return <div className={cn("text-[13px] text-fg-3", className)}>Power only (no trailer hooked)</div>;
  return (
    <div className={cn("flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-fg-2", className)}>
      <span>
        <b className="font-semibold text-fg">{t.unit_number}</b> · {trailerLine(t)}
      </span>
      {t.max_weight ? <span>{num(t.max_weight)} lbs max</span> : null}
      {t.door_type && <span>{t.door_type}</span>}
      {t.suspension && <span>{t.suspension}</span>}
    </div>
  );
}

/**
 * Pick the trailer for a truck. With `truckId` it hooks right away (truck sheet);
 * without, it only reports the choice (truck form saves it with the truck).
 */
export function TrailerPicker({
  companyId,
  value,
  onChange,
  truckId,
}: {
  companyId: string;
  value: string | null;
  onChange?: (trailerId: string | null) => void;
  truckId?: string;
}) {
  const { trailers, trucks, hookTrailer } = useStore();
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const own = trailers.filter((t) => t.company_id === companyId && (t.status !== "inactive" || t.id === value));
  const holderOf = (id: string) => trucks.find((t) => t.trailer_id === id && t.id !== truckId);

  const pick = async (id: string | null) => {
    onChange?.(id);
    if (!truckId) return;
    setBusy(true);
    const from = id ? holderOf(id) : undefined;
    if (await hookTrailer(truckId, id)) {
      const t = trailers.find((x) => x.id === id);
      toast.success(id ? `Trailer ${t?.unit_number} hooked${from ? ` (taken from unit ${from.unit_number})` : ""}` : "Trailer dropped · power only");
    }
    setBusy(false);
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Select value={value || ""} onChange={(e) => pick(e.target.value || null)} disabled={busy} className="flex-1" aria-label="Trailer">
          <option value="">No trailer (power only)</option>
          {own.map((t) => {
            const h = holderOf(t.id);
            return (
              <option key={t.id} value={t.id}>
                {t.unit_number} · {trailerLine(t)}
                {h ? ` · on unit ${h.unit_number}` : ""}
              </option>
            );
          })}
        </Select>
        <Button variant="outline" className="h-9 shrink-0" onClick={() => setAdding(true)}>
          <Plus className="h-3.5 w-3.5" /> New trailer
        </Button>
      </div>
      {value && holderOf(value) && !truckId && (
        <p className="text-xs text-amber-700 dark:text-amber-300">Saving moves this trailer off unit {holderOf(value)!.unit_number}.</p>
      )}
      <TrailerSummary trailerId={value} />
      <TrailerForm open={adding} onClose={() => setAdding(false)} companyId={companyId} hookTo={truckId} onSaved={(t) => onChange?.(t.id)} />
    </div>
  );
}
