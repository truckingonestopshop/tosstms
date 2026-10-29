"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, Container, Link2, Link2Off, Pencil, Plus, Search, Trash2, Truck as TruckIcon } from "lucide-react";
import { SheetFiles } from "./SheetFiles";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { Drawer, Modal } from "@/components/ui/Modal";
import { Card, Empty, Eyebrow, KV, Pill, neutralPill } from "@/components/ui/Bits";
import { confirmDialog } from "@/components/ui/Confirm";
import { stagger } from "@/components/ui/Motion";
import { DocumentsPanel } from "@/components/docs/DocumentsPanel";
import { useStore } from "@/lib/store";
import { useFleetHref } from "./fleetLinks";
import { toast } from "@/lib/toast";
import { DOOR_TYPES, TRAILER_GROUPS, TRAILER_LENGTHS, TRAILER_TYPES, cn, num } from "@/lib/format";
import { specGroupsFor, specsFor, specsLine, type SpecGroup, type Specs } from "@/lib/trailerSpecs";
import { photoSlotsFor } from "@/lib/trailerPhotos";
import { TrailerPhotos, type PendingPhoto } from "./TrailerPhotos";
import { TrailerDocs, type PendingDoc } from "./TrailerDocs";
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
  allowOther = true,
  id,
}: {
  value: string;
  onChange: (v: string) => void;
  groups: { label?: string; types: string[] }[];
  placeholder?: string;
  otherLabel?: string;
  /** false for fixed choices like Yes / No */
  allowOther?: boolean;
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
      {allowOther && <option value={OTHER}>{otherLabel}</option>}
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
  specs: Specs;
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
  specs: t?.specs ?? {},
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
  const { createTrailer, updateTrailer, hookTrailer, trailers, uploadDocument } = useStore();
  const [d, setD] = useState<Draft>(toDraft(trailer));
  const [saving, setSaving] = useState(false);
  // Photos picked before a new trailer exists; uploaded right after it's created.
  const [photos, setPhotos] = useState<PendingPhoto[]>([]);
  // Registration / inspection picked before the trailer exists.
  const [docs, setDocs] = useState<PendingDoc[]>([]);
  const set = (p: Partial<Draft>) => setD((x) => ({ ...x, ...p }));

  useEffect(() => {
    if (open) setD(toDraft(trailer));
    if (!open) setDocs([]);
    if (!open)
      setPhotos((p) => {
        p.forEach((x) => URL.revokeObjectURL(x.url));
        return [];
      });
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
      // Keep only the specs of the chosen type (a reefer turned flatbed drops its air chute).
      specs: specsFor(d.trailer_type, d.specs),
    };
    let saved: Trailer | null = null;
    if (trailer) {
      if (await updateTrailer(trailer.id, row)) saved = { ...trailer, ...row } as Trailer;
    } else {
      saved = await createTrailer({ ...row, company_id: companyId });
      if (saved && hookTo) await hookTrailer(hookTo, saved.id);
      if (saved) {
        // Only the slots that fit the final type (reefer photos are dropped if it's not a reefer).
        const keep = new Set(photoSlotsFor(d.trailer_type).map((x) => x.key));
        const todo = photos.filter((p) => keep.has(p.slot));
        let up = 0;
        for (const p of todo) if (await uploadDocument(p.file, { company_id: companyId, trailer_id: saved.id, doc_type: p.slot })) up++;
        if (todo.length && up < todo.length) toast.error(`${todo.length - up} photo(s) didn't upload. Add them from the trailer.`);
        let docUp = 0;
        for (const p of docs)
          if (await uploadDocument(p.file, { company_id: companyId, trailer_id: saved.id, doc_type: p.slot, expires_on: p.expires || null })) docUp++;
        if (docs.length && docUp < docs.length) toast.error(`${docs.length - docUp} document(s) didn't upload. Add them from the trailer.`);
      }
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

        {/* Type-specific options, e.g. air chute and reefer unit for a reefer */}
        {specGroupsFor(d.trailer_type).map((g) => (
          <SpecSection key={g.id} group={g} specs={d.specs} onChange={(specs) => set({ specs })} />
        ))}

        <TrailerDocs trailerId={trailer?.id} companyId={companyId} pending={docs} onPending={setDocs} />

        <TrailerPhotos trailerId={trailer?.id} companyId={companyId} trailerType={d.trailer_type} pending={photos} onPending={setPhotos} />

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

/** A trailer at a glance (read only). Edit shows hooking, photos and document uploads. */
export function TrailerSheet({ trailer, onClose, onEdit }: { trailer: Trailer | null; onClose: () => void; onEdit: (t: Trailer) => void }) {
  const { trucks, loads, deleteTrailer, driverById, documents } = useStore();
  const [manageId, setManageId] = useState<string | null>(null);
  if (!trailer) return null;
  const manage = manageId === trailer.id;
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
      subtitle={[trailerLine(trailer), holder ? `on unit ${holder.unit_number}` : "in the yard", driverById(holder?.assigned_driver_id)?.name].filter(Boolean).join(" · ")}
      actions={
        <>
          {manage ? (
            <>
              <Button size="sm" variant="ghost" onClick={() => onEdit(trailer)}>
                <Pencil className="h-3.5 w-3.5" /> Edit details
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setManageId(null)}>
                <Check className="h-3.5 w-3.5" /> Done
              </Button>
            </>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => setManageId(trailer.id)}>
              <Pencil className="h-3.5 w-3.5" /> Edit
            </Button>
          )}
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
        {manage && <HookControl trailer={trailer} />}
        <section>
          <Eyebrow className="mb-2">Specs</Eyebrow>
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
            {specs.map(([k, v]) => (
              <KV key={k} label={k}>
                {v || null}
              </KV>
            ))}
          </div>
          {specGroupsFor(trailer.trailer_type).map((g) => {
            const s = specsFor(trailer.trailer_type, trailer.specs);
            const rows = g.fields.filter((f) => s[f.key]);
            if (!rows.length) return null;
            return (
              <div key={g.id} className="mt-4">
                <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-fg-4">{g.title}</div>
                <dl className="grid grid-cols-1 gap-x-4 gap-y-1.5 text-[13px] sm:grid-cols-2">
                  {rows.map((f) => (
                    <div key={f.key} className="flex gap-2">
                      <dt className="shrink-0 text-fg-3">{f.label}</dt>
                      <dd className="min-w-0 font-medium text-fg">{Array.isArray(s[f.key]) ? (s[f.key] as string[]).join(", ") : s[f.key]}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            );
          })}
          {trailer.features && <p className="mt-3 text-[13px] text-fg-2">{trailer.features}</p>}
          {trailer.notes && <p className="mt-2 whitespace-pre-wrap text-[13px] text-fg-3">{trailer.notes}</p>}
          {recent > 0 && <p className="mt-2 text-xs text-fg-4">Used on {recent} load{recent === 1 ? "" : "s"}</p>}
        </section>
        {manage ? (
          <>
            <section>
              <TrailerPhotos trailerId={trailer.id} companyId={trailer.company_id} trailerType={trailer.trailer_type} compact />
            </section>
            <section>
              <Eyebrow className="mb-2">Trailer documents</Eyebrow>
              <DocumentsPanel target={{ scope: "trailer", id: trailer.id, companyId: trailer.company_id }} compact emptyText="No trailer files yet." />
            </section>
          </>
        ) : (
          <SheetFiles title="Files and photos" docs={documents.filter((x) => x.trailer_id === trailer.id)} empty="No trailer files yet. Click Edit to add them." />
        )}
      </div>
    </Drawer>
  );
}

function TrailerCard({ t, onOpen, i }: { t: Trailer; onOpen: () => void; i: number }) {
  const { trucks, documents } = useStore();
  const photoCount = documents.filter((x) => x.trailer_id === t.id && x.doc_type.startsWith("trailer_photo_")).length;
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
          {specsLine(t.trailer_type, t.specs) && <div className="mt-0.5 line-clamp-2 text-[11px] text-fg-4">{specsLine(t.trailer_type, t.specs)}</div>}
          {photoCount > 0 && <div className="mt-0.5 text-[11px] text-fg-4">{photoCount} photo{photoCount === 1 ? "" : "s"}</div>}
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
  const href = useFleetHref();
  const { trailers, trucks } = useStore();
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const [form, setForm] = useState<{ open: boolean; trailer?: Trailer | null }>({ open: false });
  const own = trailers.filter((t) => t.company_id === company.id);
  const sheet = own.find((x) => x.id === params.get("trailer")) || null;
  const openSheet = (id: string | null) => router.replace(id ? href("trailers", "trailer", id) : href("trailers"), { scroll: false });
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

/** The options for one trailer family (e.g. reefer: air chute, unit, zones, floor, equipment). */
function SpecSection({ group, specs, onChange }: { group: SpecGroup; specs: Specs; onChange: (s: Specs) => void }) {
  const set = (k: string, v: string | string[]) => onChange({ ...specs, [k]: v });
  return (
    <div key={group.id} className="animate-rise rounded-xl border border-line bg-surface-2/40 p-3 sm:p-4">
      <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-fg-3">{group.title}</div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {group.fields.map((f) => {
          const v = specs[f.key];
          if (f.kind === "multi") {
            const on = Array.isArray(v) ? v : [];
            return (
              <Field key={f.key} label={f.label} className="sm:col-span-2">
                <div className="flex flex-wrap gap-1.5">
                  {f.options.map((o) => {
                    const active = on.includes(o);
                    return (
                      <button
                        key={o}
                        type="button"
                        aria-pressed={active}
                        onClick={() => set(f.key, active ? on.filter((x) => x !== o) : [...on, o])}
                        className={cn(
                          "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                          active ? "border-transparent bg-inverse text-inverse-fg" : "border-line text-fg-2 hover:border-line-strong hover:bg-surface",
                        )}
                      >
                        {o}
                      </button>
                    );
                  })}
                </div>
              </Field>
            );
          }
          if (f.kind === "select") {
            // Air chute gets picture-free cards so the three kinds are easy to tell apart.
            if (f.key === "air_chute") {
              return (
                <Field key={f.key} label={f.label} className="sm:col-span-2">
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {f.options.map((o) => (
                      <button
                        key={o}
                        type="button"
                        aria-pressed={v === o}
                        onClick={() => set(f.key, v === o ? "" : o)}
                        className={cn(
                          "flex flex-col items-center gap-1.5 rounded-lg border p-2 text-center text-xs font-medium transition-[border-color,background-color]",
                          v === o ? "border-brand bg-brand/10 text-fg" : "border-line bg-surface text-fg-2 hover:border-line-strong",
                        )}
                      >
                        <ChuteIcon kind={o} />
                        {o}
                      </button>
                    ))}
                  </div>
                  {f.hint && <p className="mt-1.5 text-[11px] text-fg-4">{f.hint}</p>}
                </Field>
              );
            }
            return (
              <Field key={f.key} label={f.label} hint={f.hint}>
                <ChoiceSelect value={typeof v === "string" ? v : ""} onChange={(x) => set(f.key, x)} groups={[{ types: f.options }]} placeholder="Select…" allowOther={!f.short} />
              </Field>
            );
          }
          return (
            <Field key={f.key} label={f.label} hint={f.hint}>
              <Input value={typeof v === "string" ? v : ""} onChange={(e) => set(f.key, e.target.value)} placeholder={f.placeholder} />
            </Field>
          );
        })}
      </div>
    </div>
  );
}

/** Top-down sketch of the trailer roof with the chute(s), to tell the kinds apart at a glance. */
function ChuteIcon({ kind }: { kind: string }) {
  const k = kind.toLowerCase();
  return (
    <svg viewBox="0 0 64 28" className="h-7 w-16" aria-hidden>
      <rect x="1" y="1" width="62" height="26" rx="3" fill="none" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1.5" />
      <rect x="53" y="4" width="8" height="20" rx="1.5" fill="currentColor" fillOpacity="0.25" />
      {k.includes("standard") && <path d="M52 14 H8" stroke="#f28c38" strokeWidth="6" strokeLinecap="round" />}
      {k.includes("two") && (
        <>
          <path d="M52 9 H8" stroke="#f28c38" strokeWidth="3.5" strokeLinecap="round" />
          <path d="M52 19 H8" stroke="#f28c38" strokeWidth="3.5" strokeLinecap="round" />
        </>
      )}
      {k.includes("tube") && <path d="M52 14 H8" stroke="#f28c38" strokeWidth="3" strokeLinecap="round" strokeDasharray="3 2.5" />}
      {k.includes("no ") && <path d="M24 8 l16 12 M40 8 l-16 12" stroke="currentColor" strokeOpacity="0.4" strokeWidth="1.5" />}
    </svg>
  );
}
