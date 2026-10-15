"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Mail, Pencil, Phone, Trash2, User } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { Drawer, Modal } from "@/components/ui/Modal";
import { CopyButton, Eyebrow, KV, Pill, neutralPill } from "@/components/ui/Bits";
import { confirmDialog } from "@/components/ui/Confirm";
import { DocumentsPanel } from "@/components/docs/DocumentsPanel";
import { StatusPill } from "@/components/loads/StatusMenu";
import { useStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import { daysUntil, fmtDay, lane, US_STATES } from "@/lib/format";
import type { Driver } from "@/lib/types";

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
  phone: d?.phone ?? "",
  email: d?.email ?? "",
  cdl_number: d?.cdl_number ?? "",
  cdl_state: d?.cdl_state ?? "",
  cdl_expiry: d?.cdl_expiry ?? "",
  medical_card_expiry: d?.medical_card_expiry ?? "",
  status: d?.status ?? "active",
  notes: d?.notes ?? "",
});

export function DriverForm({ open, onClose, companyId, driver }: { open: boolean; onClose: () => void; companyId: string; driver?: Driver | null }) {
  const { createDriver, updateDriver } = useStore();
  const [d, setD] = useState<Draft>(blank(driver));
  const [saving, setSaving] = useState(false);
  const set = (p: Partial<Draft>) => setD((x) => ({ ...x, ...p }));
  useEffect(() => {
    if (open) setD(blank(driver));
  }, [open, driver]);

  const save = async () => {
    if (!d.name?.trim()) return toast.error("Driver name is required.");
    setSaving(true);
    const ok = driver ? await updateDriver(driver.id, d) : !!(await createDriver({ ...d, company_id: companyId }));
    setSaving(false);
    if (ok) {
      toast.success(driver ? "Driver saved" : `${d.name} added`);
      onClose();
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={driver ? `Edit ${driver.name}` : "Add driver"}
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
      <div className="grid grid-cols-2 gap-3">
        <Field label="Full name" required className="col-span-2">
          <Input value={d.name} onChange={(e) => set({ name: e.target.value })} autoFocus />
        </Field>
        <Field label="Phone">
          <Input value={d.phone || ""} onChange={(e) => set({ phone: e.target.value })} type="tel" />
        </Field>
        <Field label="Email">
          <Input value={d.email || ""} onChange={(e) => set({ email: e.target.value })} type="email" />
        </Field>
        <Field label="CDL number">
          <Input value={d.cdl_number || ""} onChange={(e) => set({ cdl_number: e.target.value })} />
        </Field>
        <Field label="CDL state">
          <Select value={d.cdl_state || ""} onChange={(e) => set({ cdl_state: e.target.value })}>
            <option value="">—</option>
            {US_STATES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </Select>
        </Field>
        <Field label="CDL expires">
          <Input type="date" value={d.cdl_expiry || ""} onChange={(e) => set({ cdl_expiry: e.target.value })} />
        </Field>
        <Field label="Medical card expires">
          <Input type="date" value={d.medical_card_expiry || ""} onChange={(e) => set({ medical_card_expiry: e.target.value })} />
        </Field>
        <Field label="Status">
          <Select value={d.status} onChange={(e) => set({ status: e.target.value as Driver["status"] })}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </Select>
        </Field>
        <Field label="Notes" className="col-span-2">
          <Textarea value={d.notes || ""} onChange={(e) => set({ notes: e.target.value })} rows={2} />
        </Field>
      </div>
    </Modal>
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
          <ExpiryPill label="CDL" date={driver.cdl_expiry} />
          <ExpiryPill label="Medical" date={driver.medical_card_expiry} />
          {driver.status === "inactive" && <Pill className={neutralPill}>Inactive</Pill>}
        </div>
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
          <KV label="CDL">{[driver.cdl_number, driver.cdl_state].filter(Boolean).join(" · ")}</KV>
          <KV label="CDL expires">{driver.cdl_expiry ? fmtDay(driver.cdl_expiry, true) : null}</KV>
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
          <Eyebrow className="mb-2">Driver documents</Eyebrow>
          <DocumentsPanel companyId={driver.company_id} driverId={driver.id} scope="driver" compact emptyText="No CDL or medical card on file." />
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
        <ExpiryPill label="CDL" date={d.cdl_expiry} />
        <ExpiryPill label="Med" date={d.medical_card_expiry} />
      </div>
      {active && <div className="mt-3 truncate border-t border-line pt-2.5 text-xs text-fg-3">On the road: {lane(active)}</div>}
    </button>
  );
}
