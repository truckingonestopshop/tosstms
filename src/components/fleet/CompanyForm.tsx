"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { useStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import type { Company } from "@/lib/types";

export type CompanyDraft = {
  name: string;
  mc_number: string;
  dot_number: string;
  contact_name: string;
  contact_phone: string;
  contact_email: string;
  address: string;
  commission_percent: string;
  billing_cadence: "weekly" | "monthly";
  payment_terms_days: string;
  factoring_company: string;
  factoring_email: string;
  status: "active" | "inactive";
  notes: string;
};

export const toDraft = (c?: Company | null): CompanyDraft => ({
  name: c?.name ?? "",
  mc_number: c?.mc_number ?? "",
  dot_number: c?.dot_number ?? "",
  contact_name: c?.contact_name ?? "",
  contact_phone: c?.contact_phone ?? "",
  contact_email: c?.contact_email ?? "",
  address: c?.address ?? "",
  commission_percent: String(c?.commission_percent ?? 10),
  billing_cadence: c?.billing_cadence ?? "weekly",
  payment_terms_days: String(c?.payment_terms_days ?? 7),
  factoring_company: c?.factoring_company ?? "",
  factoring_email: c?.factoring_email ?? "",
  status: c?.status ?? "active",
  notes: c?.notes ?? "",
});

export const fromDraft = (d: CompanyDraft): Partial<Company> => ({
  ...d,
  mc_number: d.mc_number.replace(/^mc[-\s#]*/i, ""),
  dot_number: d.dot_number.replace(/^(us)?dot[-\s#]*/i, ""),
  commission_percent: Math.max(0, Math.min(100, Number(d.commission_percent) || 0)),
  payment_terms_days: Math.max(0, Math.round(Number(d.payment_terms_days) || 0)),
});

/** All company fields. Used by the "Add company" modal and the Profile tab. */
export function CompanyFields({ d, set }: { d: CompanyDraft; set: (p: Partial<CompanyDraft>) => void }) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-6">
        <Field label="Company name" required className="sm:col-span-6">
          <Input value={d.name} onChange={(e) => set({ name: e.target.value })} placeholder="Legal name, e.g. Apex Hauling LLC" autoFocus />
        </Field>
        <Field label="MC number" className="sm:col-span-3">
          <Input value={d.mc_number} onChange={(e) => set({ mc_number: e.target.value })} placeholder="1234567" inputMode="numeric" />
        </Field>
        <Field label="USDOT number" className="sm:col-span-3">
          <Input value={d.dot_number} onChange={(e) => set({ dot_number: e.target.value })} placeholder="3456789" inputMode="numeric" />
        </Field>
        <Field label="Address" className="sm:col-span-6">
          <Input value={d.address} onChange={(e) => set({ address: e.target.value })} placeholder="Street, City, ST ZIP" />
        </Field>
      </div>

      <div>
        <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-fg-4">Main contact</div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Name">
            <Input value={d.contact_name} onChange={(e) => set({ contact_name: e.target.value })} />
          </Field>
          <Field label="Phone">
            <Input value={d.contact_phone} onChange={(e) => set({ contact_phone: e.target.value })} type="tel" />
          </Field>
          <Field label="Email">
            <Input value={d.contact_email} onChange={(e) => set({ contact_email: e.target.value })} type="email" />
          </Field>
        </div>
      </div>

      <div>
        <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-fg-4">Dispatch agreement & billing</div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Dispatch fee" hint="% of gross">
            <Input
              value={d.commission_percent}
              onChange={(e) => set({ commission_percent: e.target.value })}
              type="number"
              step="0.25"
              min={0}
              max={100}
              inputMode="decimal"
              suffix="%"
            />
          </Field>
          <Field label="Billing">
            <Select value={d.billing_cadence} onChange={(e) => set({ billing_cadence: e.target.value as "weekly" | "monthly" })}>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </Select>
          </Field>
          <Field label="Payment terms" hint="days">
            <Input value={d.payment_terms_days} onChange={(e) => set({ payment_terms_days: e.target.value })} type="number" min={0} inputMode="numeric" suffix="days" />
          </Field>
          <Field label="Status">
            <Select value={d.status} onChange={(e) => set({ status: e.target.value as "active" | "inactive" })}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </Select>
          </Field>
          <Field label="Factoring company" className="col-span-2">
            <Input value={d.factoring_company} onChange={(e) => set({ factoring_company: e.target.value })} placeholder="e.g. RTS Financial" />
          </Field>
          <Field label="Factoring email" className="col-span-2">
            <Input value={d.factoring_email} onChange={(e) => set({ factoring_email: e.target.value })} type="email" placeholder="Where packets are sent" />
          </Field>
        </div>
      </div>

      <Field label="Notes">
        <Textarea value={d.notes} onChange={(e) => set({ notes: e.target.value })} rows={3} placeholder="Lanes, preferences, anything the team should know" />
      </Field>
    </div>
  );
}

export function NewCompanyModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated?: (c: Company) => void }) {
  const { createCompany, setScope } = useStore();
  const [d, setD] = useState<CompanyDraft>(toDraft());
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open) setD(toDraft());
  }, [open]);

  const save = async () => {
    if (!d.name.trim()) return toast.error("Company name is required.");
    setSaving(true);
    const c = await createCompany(fromDraft(d));
    setSaving(false);
    if (c) {
      toast.success(`${c.name} added`);
      setScope(c.id);
      onCreated?.(c);
      onClose();
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="Add carrier company"
      subtitle="A carrier TOSS dispatches for. Trucks, drivers, documents and loads live under it."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} loading={saving}>
            Add company
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <CompanyFields d={d} set={(p) => setD((x) => ({ ...x, ...p }))} />
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}
