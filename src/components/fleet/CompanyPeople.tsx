"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { Paperclip, Pencil, Plus, Send, Trash2, UserRound, X } from "lucide-react";
import { SendDialog } from "@/components/signing/SendDialog";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, Empty, KV, Pill, neutralPill } from "@/components/ui/Bits";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { confirmDialog } from "@/components/ui/Confirm";
import { BUCKET, docPath, errMsg, openDocument, sb } from "@/lib/db";
import { useLiveTable } from "@/lib/live";
import { useStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import { fmtDay } from "@/lib/format";
import type { LicenseType } from "@/lib/types";

// Owners, DERs and permit / DOT contacts of a carrier (migration 0046). An owner keeps their
// license here even when they don't drive; "Also a driver" makes a driver from them. A person can
// be owner and DER at once, and a carrier can have several DERs. Missing details here never show
// on Pending or the to-dos.

type FileRef = { id: string; name: string; path: string; mime: string | null };
export interface CompanyPerson {
  id: string;
  company_id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  email: string | null;
  title: string | null;
  is_owner: boolean;
  is_der: boolean;
  is_contact: boolean;
  license_type: LicenseType | null;
  license_number: string | null;
  license_state: string | null;
  license_expiry: string | null;
  dob: string | null;
  files: FileRef[];
  driver_id: string | null;
  notes: string | null;
  created_at: string;
}

const ROLES = [
  { k: "is_owner", label: "Owner" },
  { k: "is_der", label: "DER" },
  { k: "is_contact", label: "Permits / DOT contact" },
] as const;
const fullName = (p: Pick<CompanyPerson, "first_name" | "last_name">) => [p.first_name, p.last_name].filter(Boolean).join(" ") || "—";

export function CompanyPeople({ companyId }: { companyId: string }) {
  const people = useLiveTable<CompanyPerson>("tms_company_people", { order: "created_at", ascending: true, filter: { company_id: companyId } });
  const [editing, setEditing] = useState<CompanyPerson | "new" | null>(null);
  const rank = (p: CompanyPerson) => (p.is_owner ? 0 : p.is_der ? 1 : 2);
  const list = [...people.rows].sort((a, b) => rank(a) - rank(b));

  return (
    <Card>
      <CardHeader
        title="Owners, DER & contacts"
        subtitle="Owner licenses, Designated Employer Representatives and who to talk to for permits / DOT"
        actions={
          <Button size="sm" variant="outline" onClick={() => setEditing("new")}>
            <Plus className="h-4 w-4" /> Add person
          </Button>
        }
      />
      {!people.loaded ? (
        <div className="px-4 py-6 text-center text-xs text-fg-4">Loading…</div>
      ) : list.length === 0 ? (
        <Empty icon={UserRound} title="No owners, DER or contacts yet" body="Add the owner (with their license), the DER and anyone you deal with for permits or DOT." />
      ) : (
        <ul className="divide-y divide-line">
          {list.map((p) => (
            <PersonRow key={p.id} p={p} onEdit={() => setEditing(p)} />
          ))}
        </ul>
      )}
      <PersonModal companyId={companyId} person={editing} onClose={() => setEditing(null)} onSaved={people.put} onDeleted={people.drop} />
    </Card>
  );
}

function PersonRow({ p, onEdit }: { p: CompanyPerson; onEdit: () => void }) {
  const open = (f: FileRef) => openDocument(f.path, f.name).catch((e) => toast.error(errMsg(e)));
  const [sending, setSending] = useState(false);
  const license = p.license_number || p.license_expiry || p.license_type;
  return (
    <li className="px-4 py-3 sm:px-5">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[13px] font-semibold text-fg">{fullName(p)}</span>
            {p.title && <span className="text-xs text-fg-3">{p.title}</span>}
            {ROLES.filter((r) => p[r.k]).map((r) => (
              <Pill key={r.k} className={neutralPill}>
                {r.label}
              </Pill>
            ))}
            {p.driver_id && (
              <Link href={`/fleet?company=${p.company_id}&tab=drivers&driver=${p.driver_id}`} className="text-xs font-medium text-fg-3 hover:text-fg">
                Driver →
              </Link>
            )}
          </div>
          <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
            <KV label="Phone">{p.phone ? <a href={`tel:${p.phone}`} className="hover:underline">{p.phone}</a> : null}</KV>
            <KV label="Email">{p.email ? <a href={`mailto:${p.email}`} className="break-all hover:underline">{p.email}</a> : null}</KV>
            {p.is_owner && license && (
              <>
                <KV label="License">{[p.license_type, p.license_number, p.license_state].filter(Boolean).join(" · ")}</KV>
                <KV label="Expires">{p.license_expiry ? fmtDay(p.license_expiry) : null}</KV>
              </>
            )}
            {p.is_owner && p.dob && <KV label="Date of birth">{fmtDay(p.dob)}</KV>}
          </div>
          {!!p.files.length && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {p.files.map((f) => (
                <button key={f.id} onClick={() => open(f)} className="inline-flex max-w-[220px] items-center gap-1 rounded-md border border-line px-2 py-0.5 text-xs text-fg-2 hover:bg-surface-2">
                  <Paperclip className="h-3 w-3 shrink-0" />
                  <span className="truncate">{f.name}</span>
                </button>
              ))}
            </div>
          )}
          {p.notes && <p className="mt-2 whitespace-pre-line text-xs text-fg-3">{p.notes}</p>}
        </div>
        <SendDialog open={sending} onClose={() => setSending(false)} companyId={p.company_id} personId={p.id} driverId={p.driver_id || undefined} category={p.is_der ? "der" : "company"} />
        <Button size="xs" variant="ghost" onClick={() => setSending(true)} title="Send a document to sign">
          <Send className="h-3.5 w-3.5" /> Send to sign
        </Button>
        <button onClick={onEdit} className="text-fg-4 hover:text-fg" aria-label={`Edit ${fullName(p)}`}>
          <Pencil className="h-4 w-4" />
        </button>
      </div>
    </li>
  );
}

const blank = (companyId: string) => ({
  company_id: companyId,
  first_name: "",
  last_name: "",
  phone: "",
  email: "",
  title: "",
  is_owner: true,
  is_der: false,
  is_contact: false,
  license_type: "" as LicenseType | "",
  license_number: "",
  license_state: "",
  license_expiry: "",
  dob: "",
  notes: "",
});
type Draft = ReturnType<typeof blank>;
const toDraft = (p: CompanyPerson): Draft => ({
  company_id: p.company_id,
  first_name: p.first_name,
  last_name: p.last_name,
  phone: p.phone || "",
  email: p.email || "",
  title: p.title || "",
  is_owner: p.is_owner,
  is_der: p.is_der,
  is_contact: p.is_contact,
  license_type: p.license_type || "",
  license_number: p.license_number || "",
  license_state: p.license_state || "",
  license_expiry: p.license_expiry || "",
  dob: p.dob || "",
  notes: p.notes || "",
});
const nul = (v: string) => v.trim() || null;

function PersonModal({
  companyId,
  person,
  onClose,
  onSaved,
  onDeleted,
}: {
  companyId: string;
  person: CompanyPerson | "new" | null;
  onClose: () => void;
  onSaved: (p: CompanyPerson) => void;
  onDeleted: (id: string) => void;
}) {
  const { createDriver, updateDriver, drivers } = useStore();
  const existing = person && person !== "new" ? person : null;
  const [d, setD] = useState<Draft>(blank(companyId));
  const [files, setFiles] = useState<FileRef[]>([]);
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [asDriver, setAsDriver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [was, setWas] = useState<typeof person>(null);
  const input = useRef<HTMLInputElement>(null);
  if (person !== was) {
    setWas(person);
    setD(existing ? toDraft(existing) : blank(companyId));
    setFiles(existing?.files || []);
    setNewFiles([]);
    setAsDriver(false);
  }
  const set = (p: Partial<Draft>) => setD((x) => ({ ...x, ...p }));
  const linkedDriver = existing?.driver_id ? drivers.find((x) => x.id === existing.driver_id) : null;

  const save = async () => {
    if (!d.first_name.trim() && !d.last_name.trim()) return toast.error("Enter the name");
    if (!d.is_owner && !d.is_der && !d.is_contact) return toast.error("Pick at least one: Owner, DER or Permits / DOT contact");
    setBusy(true);
    const uploaded: FileRef[] = [];
    for (const f of newFiles) {
      const path = docPath(companyId, "people", f.name);
      const up = await sb().storage.from(BUCKET).upload(path, f, { contentType: f.type || undefined });
      if (up.error) {
        if (uploaded.length) await sb().storage.from(BUCKET).remove(uploaded.map((u) => u.path));
        setBusy(false);
        return toast.error(errMsg(up.error));
      }
      uploaded.push({ id: crypto.randomUUID(), name: f.name, path, mime: f.type || null });
    }
    const owner = d.is_owner;
    const row = {
      company_id: companyId,
      first_name: d.first_name.trim(),
      last_name: d.last_name.trim(),
      phone: nul(d.phone),
      email: nul(d.email),
      title: nul(d.title),
      is_owner: d.is_owner,
      is_der: d.is_der,
      is_contact: d.is_contact,
      license_type: owner ? d.license_type || null : null,
      license_number: owner ? nul(d.license_number) : null,
      license_state: owner ? nul(d.license_state.toUpperCase()) : null,
      license_expiry: owner ? d.license_expiry || null : null,
      dob: owner ? d.dob || null : null,
      notes: nul(d.notes),
      files: [...files, ...uploaded],
    };
    const res = existing
      ? await sb().from("tms_company_people").update(row).eq("id", existing.id).select().single()
      : await sb().from("tms_company_people").insert(row).select().single();
    if (res.error) {
      if (uploaded.length) await sb().storage.from(BUCKET).remove(uploaded.map((u) => u.path));
      setBusy(false);
      return toast.error(errMsg(res.error));
    }
    let saved = res.data as CompanyPerson;
    // Files taken off the person are deleted from storage.
    const gone = (existing?.files || []).filter((f) => !files.some((x) => x.id === f.id));
    if (gone.length) await sb().storage.from(BUCKET).remove(gone.map((f) => f.path));

    const driverFields = {
      first_name: row.first_name,
      last_name: row.last_name,
      phone: row.phone,
      email: row.email,
      license_type: (row.license_type as LicenseType | null) || null,
      cdl_number: row.license_number,
      cdl_state: row.license_state,
      cdl_expiry: row.license_expiry,
      dob: row.dob,
    };
    if (owner && asDriver && !saved.driver_id) {
      const drv = await createDriver({ company_id: companyId, status: "active", ...driverFields });
      if (drv) {
        const link = await sb().from("tms_company_people").update({ driver_id: drv.id }).eq("id", saved.id).select().single();
        if (!link.error) saved = link.data as CompanyPerson;
        toast.success(`${fullName(saved)} added as a driver too`);
      }
    } else if (saved.driver_id && linkedDriver) {
      // Keep the linked driver's name, contact and license in step.
      await updateDriver(saved.driver_id, driverFields);
    }
    onSaved(saved);
    setBusy(false);
    toast.success("Saved");
    onClose();
  };
  const remove = async () => {
    if (!existing) return;
    if (!(await confirmDialog({ title: `Remove ${fullName(existing)}?`, body: existing.driver_id ? "Their driver profile stays." : undefined, confirmLabel: "Remove", danger: true }))) return;
    const { error } = await sb().from("tms_company_people").delete().eq("id", existing.id);
    if (error) return toast.error(errMsg(error));
    if (existing.files.length) await sb().storage.from(BUCKET).remove(existing.files.map((f) => f.path));
    onDeleted(existing.id);
    onClose();
  };

  return (
    <Modal
      open={!!person}
      onClose={onClose}
      size="lg"
      title={existing ? fullName(existing) : "Add person"}
      footer={
        <>
          {existing && (
            <Button variant="danger-ghost" onClick={remove} className="mr-auto">
              <Trash2 className="h-4 w-4" /> Remove
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} disabled={busy}>
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        {ROLES.map((r) => (
          <Checkbox key={r.k} checked={d[r.k]} onChange={(v) => set({ [r.k]: v })} label={r.label} />
        ))}
      </div>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="First name" required>
          <Input value={d.first_name} onChange={(e) => set({ first_name: e.target.value })} autoFocus />
        </Field>
        <Field label="Last name">
          <Input value={d.last_name} onChange={(e) => set({ last_name: e.target.value })} />
        </Field>
        <Field label="Phone">
          <Input type="tel" value={d.phone} onChange={(e) => set({ phone: e.target.value })} />
        </Field>
        <Field label="Email">
          <Input type="email" value={d.email} onChange={(e) => set({ email: e.target.value })} />
        </Field>
        <Field label="Role / title" hint="e.g. Office manager, Permits agent" className="sm:col-span-2">
          <Input value={d.title} onChange={(e) => set({ title: e.target.value })} />
        </Field>
      </div>

      {d.is_owner && (
        <div className="mt-5 rounded-lg border border-line p-3 sm:p-4">
          <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-fg-4">Owner&apos;s license</div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field label="Type">
              <Select value={d.license_type} onChange={(e) => set({ license_type: e.target.value as LicenseType | "" })}>
                <option value="">—</option>
                <option value="CDL">CDL</option>
                <option value="DL">DL</option>
                <option value="International CDL">International CDL</option>
              </Select>
            </Field>
            <Field label="Number">
              <Input value={d.license_number} onChange={(e) => set({ license_number: e.target.value })} />
            </Field>
            <Field label="State">
              <Input value={d.license_state} maxLength={2} onChange={(e) => set({ license_state: e.target.value.toUpperCase() })} />
            </Field>
            <Field label="Expires">
              <Input type="date" value={d.license_expiry} onChange={(e) => set({ license_expiry: e.target.value })} />
            </Field>
            <Field label="Date of birth">
              <Input type="date" value={d.dob} onChange={(e) => set({ dob: e.target.value })} />
            </Field>
          </div>
          <div className="mt-3">
            {linkedDriver ? (
              <p className="text-xs text-fg-3">
                Also a driver:{" "}
                <Link href={`/fleet?company=${companyId}&tab=drivers&driver=${linkedDriver.id}`} className="font-medium text-fg hover:underline">
                  {linkedDriver.name}
                </Link>
                . Saving here updates their name, contact and license.
              </p>
            ) : (
              <Checkbox checked={asDriver} onChange={setAsDriver} label="Also a driver: add them to Drivers" />
            )}
          </div>
        </div>
      )}

      <div className="mt-5">
        <div className="mb-1.5 text-xs font-semibold text-fg-2">Files</div>
        <div className="flex flex-wrap gap-1.5">
          {files.map((f) => (
            <span key={f.id} className="inline-flex max-w-[220px] items-center gap-1 rounded-md border border-line px-2 py-0.5 text-xs text-fg-2">
              <Paperclip className="h-3 w-3 shrink-0" />
              <span className="truncate">{f.name}</span>
              <button onClick={() => setFiles((l) => l.filter((x) => x.id !== f.id))} className="text-fg-4 hover:text-fg" aria-label={`Remove ${f.name}`}>
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          {newFiles.map((f, i) => (
            <span key={`n${i}`} className="inline-flex max-w-[220px] items-center gap-1 rounded-md bg-surface-2 px-2 py-0.5 text-xs text-fg-2">
              <Paperclip className="h-3 w-3 shrink-0" />
              <span className="truncate">{f.name}</span>
              <button onClick={() => setNewFiles((l) => l.filter((_, j) => j !== i))} className="text-fg-4 hover:text-fg" aria-label={`Remove ${f.name}`}>
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          <input
            ref={input}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              const picked = Array.from(e.target.files || []);
              setNewFiles((l) => [...l, ...picked]);
              e.target.value = "";
            }}
          />
          <Button size="xs" variant="ghost" onClick={() => input.current?.click()}>
            <Paperclip className="h-3.5 w-3.5" /> {d.is_owner ? "Attach license / files" : "Attach files"}
          </Button>
        </div>
      </div>

      <Field label="Notes" className="mt-4">
        <Textarea rows={2} value={d.notes} onChange={(e) => set({ notes: e.target.value })} />
      </Field>
    </Modal>
  );
}
