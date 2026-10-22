"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { FilePlus2, Mail, Pencil, Phone, Trash2, User, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { Drawer, Modal } from "@/components/ui/Modal";
import { CopyButton, Eyebrow, KV, Pill, neutralPill } from "@/components/ui/Bits";
import { confirmDialog } from "@/components/ui/Confirm";
import { DocumentsPanel } from "@/components/docs/DocumentsPanel";
import { DriverRig } from "./Units";
import { DriverPhotos, type PendingPhoto } from "./TrailerPhotos";
import { StatusPill } from "@/components/loads/StatusMenu";
import { useStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import { cn, daysUntil, fmtDay, lane, LICENSE_REGIONS, licenseRegionLabel } from "@/lib/format";
import { CUSTOM, DocTypeSelect, useResolveType } from "@/components/docs/DocTypeSelect";
import type { Driver, LicenseType } from "@/lib/types";

const LICENSE_TYPES: LicenseType[] = ["CDL", "DL", "International CDL"];

/** A document picked while adding a driver; uploaded once the driver is saved. */
interface PendingFile {
  id: string;
  file: File;
  type: string;
  expires: string;
}

/** Expiry pill: red when expired, amber within 45 days. */
export function ExpiryPill({ label, date }: { label: string; date: string | null }) {
  const d = daysUntil(date);
  if (d === null) return <Pill className={neutralPill}>{label}: not set</Pill>;
  if (d < 0) return <Pill className="bg-red-500/10 text-red-700 ring-red-600/20 dark:text-red-300">{label} expired</Pill>;
  if (d <= 45) return <Pill className="bg-amber-500/10 text-amber-800 ring-amber-600/25 dark:text-amber-300">{label} in {d}d</Pill>;
  return <Pill className={neutralPill}>{label} {fmtDay(date)}</Pill>;
}

export const driverAlert = (d: Driver) => {
  const a = daysUntil(d.cdl_expiry);
  const b = daysUntil(d.medical_card_expiry);
  return (a !== null && a <= 45) || (b !== null && b <= 45);
};

type Draft = Omit<Driver, "id" | "company_id" | "created_at" | "updated_at"> & { [k: string]: unknown };
const blank = (d?: Driver | null): Draft => ({
  name: d?.name ?? "",
  // Drivers from before first / last existed: split the full name once.
  first_name: d?.first_name ?? (d?.name ? d.name.trim().split(/\s+/)[0] : ""),
  last_name: d?.last_name ?? (d?.name ? d.name.trim().split(/\s+/).slice(1).join(" ") : ""),
  license_type: d?.license_type ?? (d ? null : "CDL"),
  phone: d?.phone ?? "",
  email: d?.email ?? "",
  cdl_number: d?.cdl_number ?? "",
  cdl_state: d?.cdl_state ?? "",
  cdl_expiry: d?.cdl_expiry ?? "",
  medical_card_expiry: d?.medical_card_expiry ?? "",
  status: d?.status ?? "active",
  hire_date: d?.hire_date ?? "",
  termination_date: d?.termination_date ?? "",
  notes: d?.notes ?? "",
});

export function DriverForm({ open, onClose, companyId, driver }: { open: boolean; onClose: () => void; companyId: string; driver?: Driver | null }) {
  const { createDriver, updateDriver, uploadDocument } = useStore();
  const [d, setD] = useState<Draft>(blank(driver));
  const [saving, setSaving] = useState(false);
  // Picked while adding a new driver; uploaded right after it's created.
  const [photos, setPhotos] = useState<PendingPhoto[]>([]);
  const [files, setFiles] = useState<PendingFile[]>([]);
  const set = (p: Partial<Draft>) => setD((x) => ({ ...x, ...p }));
  useEffect(() => {
    if (open) setD(blank(driver));
    if (!open) {
      setPhotos([]);
      setFiles([]);
    }
  }, [open, driver]);

  const fullName = [d.first_name, d.last_name].map((x) => String(x || "").trim()).filter(Boolean).join(" ");

  const save = async () => {
    if (!String(d.first_name || "").trim()) return toast.error("First name is required.");
    setSaving(true);
    const row = {
      ...d,
      first_name: String(d.first_name || "").trim(),
      last_name: String(d.last_name || "").trim() || null,
      name: fullName,
      hire_date: d.hire_date || null,
      termination_date: d.termination_date || null,
      // A termination date makes the driver inactive.
      status: d.termination_date ? ("inactive" as const) : d.status,
    };
    let ok = false;
    if (driver) ok = await updateDriver(driver.id, row);
    else {
      const created = await createDriver({ ...row, company_id: companyId });
      ok = !!created;
      if (created) {
        let failed = 0;
        for (const p of photos) if (!(await uploadDocument(p.file, { company_id: companyId, driver_id: created.id, doc_type: p.slot }))) failed++;
        for (const x of files) if (!(await uploadDocument(x.file, { company_id: companyId, driver_id: created.id, doc_type: x.type, expires_on: x.expires || null }))) failed++;
        if (failed) toast.error(`${failed} file(s) didn't upload. Add them from the driver.`);
      }
    }
    setSaving(false);
    if (ok) {
      toast.success(driver ? "Driver saved" : `${fullName} added`);
      onClose();
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={driver ? `Edit ${driver.name}` : "Add driver"}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} loading={saving}>
            {driver ? "Save driver" : "Add driver"}
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-3">
          <Field label="First name" required>
            <Input value={String(d.first_name || "")} onChange={(e) => set({ first_name: e.target.value })} autoFocus />
          </Field>
          <Field label="Last name">
            <Input value={String(d.last_name || "")} onChange={(e) => set({ last_name: e.target.value })} />
          </Field>
          <Field label="Phone">
            <Input value={d.phone || ""} onChange={(e) => set({ phone: e.target.value })} type="tel" />
          </Field>
          <Field label="Email">
            <Input value={d.email || ""} onChange={(e) => set({ email: e.target.value })} type="email" />
          </Field>
        </div>

        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-fg-4">Driving license & medical</div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Driving license">
              <Select value={d.license_type || ""} onChange={(e) => set({ license_type: (e.target.value || null) as LicenseType | null })}>
                <option value="">—</option>
                {LICENSE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="License number">
              <Input value={d.cdl_number || ""} onChange={(e) => set({ cdl_number: e.target.value })} />
            </Field>
            <Field label="License state / country">
              <Select value={d.cdl_state || ""} onChange={(e) => set({ cdl_state: e.target.value })}>
                <option value="">—</option>
                {LICENSE_REGIONS.map((g) => (
                  <optgroup key={g.label} label={g.label}>
                    {g.options.map((o) => (
                      <option key={o.v} value={o.v}>
                        {o.label}
                      </option>
                    ))}
                  </optgroup>
                ))}
                {/* An older code not in the list (e.g. a Canadian province) stays selectable. */}
                {d.cdl_state && !LICENSE_REGIONS.some((g) => g.options.some((o) => o.v === d.cdl_state)) && <option value={d.cdl_state}>{d.cdl_state}</option>}
              </Select>
            </Field>
            <Field label="License expires">
              <Input type="date" value={d.cdl_expiry || ""} onChange={(e) => set({ cdl_expiry: e.target.value })} />
            </Field>
            <Field label="Medical card expires">
              <Input type="date" value={d.medical_card_expiry || ""} onChange={(e) => set({ medical_card_expiry: e.target.value })} />
            </Field>
            <Field label="Status" hint={d.termination_date ? "Terminated drivers are inactive" : undefined}>
              <Select value={d.termination_date ? "inactive" : d.status} disabled={!!d.termination_date} onChange={(e) => set({ status: e.target.value as Driver["status"] })}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </Select>
            </Field>
          </div>
        </div>

        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-fg-4">Employment</div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date of hire">
              <Input type="date" value={String(d.hire_date || "")} onChange={(e) => set({ hire_date: e.target.value })} />
            </Field>
            <Field label="Date of termination" hint="Optional">
              <Input type="date" value={String(d.termination_date || "")} onChange={(e) => set({ termination_date: e.target.value })} />
            </Field>
          </div>
        </div>

        <DriverPhotos driverId={driver?.id} companyId={companyId} pending={photos} onPending={setPhotos} compact />

        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-fg-4">Other documents</div>
          {driver ? (
            <DocumentsPanel target={{ scope: "driver", id: driver.id, companyId, licenseExpiry: driver.cdl_expiry }} compact emptyText="No driver files yet." />
          ) : (
            <PendingFiles files={files} onChange={setFiles} />
          )}
        </div>

        <Field label="Notes">
          <Textarea value={d.notes || ""} onChange={(e) => set({ notes: e.target.value })} rows={2} />
        </Field>
      </div>
    </Modal>
  );
}

/** Documents for a driver that doesn't exist yet: type, optional expiry, file. */
function PendingFiles({ files, onChange }: { files: PendingFile[]; onChange: (f: PendingFile[]) => void }) {
  const { docTypes } = useStore();
  const nameOf = (k: string) => docTypes.find((t) => t.key === k)?.name || k;
  const [type, setType] = useState("driver_application");
  const [custom, setCustom] = useState("");
  const resolveType = useResolveType("driver");
  const [expires, setExpires] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const chosen = docTypes.find((t) => t.key === type);
  /** Checked before the file picker opens (and on drop). */
  const ready = () => {
    if (type === CUSTOM && !custom.trim()) return toast.error("Type the document name first."), false;
    if (chosen?.has_expiry && !expires) return toast.error(`${chosen.name} expires: enter the expiration date first.`), false;
    return true;
  };
  const add = async (list: FileList | null) => {
    if (!list?.length || !ready()) return;
    let key = type;
    if (type === CUSTOM) {
      const t = await resolveType(custom);
      if (!t) return;
      key = t.key;
      setType(t.key);
      setCustom("");
    }
    onChange([...files, ...Array.from(list).map((file) => ({ id: crypto.randomUUID(), file, type: key, expires }))]);
    setExpires("");
  };
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        add(e.dataTransfer.files);
      }}
      className={cn("space-y-2.5 rounded-xl border border-dashed p-3 transition-colors", drag ? "border-brand bg-brand/5" : "border-line-strong bg-surface-2/40")}
    >
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-[minmax(0,1fr)_150px_auto] sm:items-end">
        <DocTypeSelect scope="driver" value={type} onChange={setType} custom={custom} onCustom={setCustom} className={type === CUSTOM ? "sm:col-span-3" : undefined} />
        <Field label={chosen?.has_expiry ? "Expires (required)" : "Expires (optional)"}>
          <Input type="date" value={expires} onChange={(e) => setExpires(e.target.value)} />
        </Field>
        <Button variant="secondary" onClick={() => ready() && input.current?.click()}>
          <FilePlus2 className="h-4 w-4" /> Add file
        </Button>
      </div>
      <input
        ref={input}
        type="file"
        multiple
        className="hidden"
        accept="application/pdf,image/*,.heic,.heif,.doc,.docx"
        onChange={(e) => {
          add(e.target.files);
          e.target.value = "";
        }}
      />
      {files.length > 0 ? (
        <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
          {files.map((x) => (
            <li key={x.id} className="flex items-center gap-3 px-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-medium text-fg">{x.file.name}</div>
                <div className="text-[11px] text-fg-4">
                  {nameOf(x.type)}
                  {x.expires ? ` · expires ${fmtDay(x.expires)}` : ""}
                </div>
              </div>
              <button type="button" onClick={() => onChange(files.filter((y) => y.id !== x.id))} className="rounded-md p-1 text-fg-4 hover:bg-surface-2 hover:text-fg" aria-label="Remove file">
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[12px] text-fg-4">Drop files here or use Add file. PDF, photos or Word. Uploaded when you add the driver.</p>
      )}
    </div>
  );
}

export function DriverSheet({ driver, onClose, onEdit }: { driver: Driver | null; onClose: () => void; onEdit: (d: Driver) => void }) {
  const { trucks, loads, deleteDriver } = useStore();
  if (!driver) return null;
  const truck = trucks.find((t) => t.assigned_driver_id === driver.id);
  const recent = loads
    .filter((l) => l.driver_id === driver.id)
    .sort((a, b) => (b.pickup_date || "").localeCompare(a.pickup_date || ""))
    .slice(0, 8);
  return (
    <Drawer
      open
      onClose={onClose}
      title={driver.name}
      subtitle={truck ? `Unit ${truck.unit_number}` : "No truck assigned"}
      actions={
        <>
          <Button size="sm" variant="ghost" onClick={() => onEdit(driver)}>
            <Pencil className="h-3.5 w-3.5" /> Edit
          </Button>
          <Button
            size="icon-sm"
            variant="danger-ghost"
            aria-label="Delete driver"
            onClick={async () => {
              if (
                await confirmDialog({
                  title: `Delete ${driver.name}?`,
                  body: "Their loads stay, but the driver is removed from them and from any truck. Their documents are deleted.",
                  confirmLabel: "Delete driver",
                  danger: true,
                })
              ) {
                if (await deleteDriver(driver.id)) {
                  toast.success("Driver deleted");
                  onClose();
                }
              }
            }}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </>
      }
    >
      <div className="space-y-6 p-5">
        <div className="flex flex-wrap gap-2">
          <ExpiryPill label={driver.license_type || "License"} date={driver.cdl_expiry} />
          <ExpiryPill label="Medical" date={driver.medical_card_expiry} />
          {driver.status === "inactive" && <Pill className={neutralPill}>Inactive</Pill>}
        </div>
        <DriverRig driver={driver} />
        <div className="grid grid-cols-2 gap-4">
          <KV label="Phone">
            {driver.phone ? (
              <span className="flex items-center gap-1">
                <a href={`tel:${driver.phone}`} className="hover:underline">
                  {driver.phone}
                </a>
                <CopyButton text={driver.phone} />
              </span>
            ) : null}
          </KV>
          <KV label="Email">
            {driver.email ? (
              <span className="flex items-center gap-1">
                <a href={`mailto:${driver.email}`} className="truncate hover:underline">
                  {driver.email}
                </a>
                <CopyButton text={driver.email} />
              </span>
            ) : null}
          </KV>
          <KV label={driver.license_type || "Driving license"}>{[driver.cdl_number, licenseRegionLabel(driver.cdl_state)].filter(Boolean).join(" · ")}</KV>
          <KV label="License expires">{driver.cdl_expiry ? fmtDay(driver.cdl_expiry, true) : null}</KV>
          <KV label="Medical card">{driver.medical_card_expiry ? fmtDay(driver.medical_card_expiry, true) : null}</KV>
          <KV label="Truck">{truck ? `Unit ${truck.unit_number}` : null}</KV>
        </div>
        {driver.notes && <p className="whitespace-pre-wrap rounded-xl bg-surface-2/60 p-3 text-[13px] text-fg-2">{driver.notes}</p>}

        <section>
          <Eyebrow className="mb-2">Recent loads</Eyebrow>
          {recent.length === 0 ? (
            <div className="rounded-xl border border-line px-3.5 py-3 text-[13px] text-fg-4">No loads yet.</div>
          ) : (
            <ul className="divide-y divide-line rounded-xl border border-line">
              {recent.map((l) => (
                <li key={l.id}>
                  <Link href={`/loads/${l.id}`} className="flex items-center gap-3 px-3.5 py-2.5 hover:bg-surface-2/50">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-medium text-fg">{lane(l)}</div>
                      <div className="text-xs text-fg-3">{fmtDay(l.pickup_date)}</div>
                    </div>
                    <StatusPill status={l.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <DriverPhotos driverId={driver.id} companyId={driver.company_id} compact />
        </section>

        <section>
          <Eyebrow className="mb-2">Driver documents</Eyebrow>
          <DocumentsPanel target={{ scope: "driver", id: driver.id, companyId: driver.company_id, licenseExpiry: driver.cdl_expiry }} compact emptyText="No driver files yet." />
        </section>
      </div>
    </Drawer>
  );
}

export function DriverCard({ d, onOpen }: { d: Driver; onOpen: () => void }) {
  const { trucks, loads } = useStore();
  const truck = trucks.find((t) => t.assigned_driver_id === d.id);
  const active = loads.find((l) => l.driver_id === d.id && l.status === "in_transit");
  return (
    <button onClick={onOpen} className="group flex flex-col rounded-xl border border-line bg-surface p-4 text-left transition-colors hover:border-line-strong">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-fg-3">
          <User className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-fg">{d.name}</div>
          <div className="truncate text-xs text-fg-3">{truck ? `Unit ${truck.unit_number}` : "No truck"}{d.status === "inactive" ? " · Inactive" : ""}</div>
        </div>
      </div>
      <div className="mt-3 space-y-1 text-[13px] text-fg-2">
        {d.phone && (
          <div className="flex items-center gap-2">
            <Phone className="h-3.5 w-3.5 text-fg-4" />
            {d.phone}
          </div>
        )}
        {d.email && (
          <div className="flex items-center gap-2 truncate">
            <Mail className="h-3.5 w-3.5 text-fg-4" />
            <span className="truncate">{d.email}</span>
          </div>
        )}
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <ExpiryPill label={d.license_type || "License"} date={d.cdl_expiry} />
        <ExpiryPill label="Med" date={d.medical_card_expiry} />
      </div>
      {active && <div className="mt-3 truncate border-t border-line pt-2.5 text-xs text-fg-3">On the road: {lane(active)}</div>}
    </button>
  );
}
