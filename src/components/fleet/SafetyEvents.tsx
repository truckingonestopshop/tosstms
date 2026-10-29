"use client";

import { useRef, useState } from "react";
import { AlertOctagon, ClipboardCheck, ExternalLink, FileText, Pencil, Plus, Trash2, UploadCloud, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, Empty } from "@/components/ui/Bits";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { confirmDialog } from "@/components/ui/Confirm";
import { useLiveTable } from "@/lib/live";
import { useStore } from "@/lib/store";
import { errMsg, openDocument, sb } from "@/lib/db";
import { toast } from "@/lib/toast";
import { cn, fileSize, fmtDay, today } from "@/lib/format";
import { truckLabel } from "@/lib/pitch";
import type { Company, DocumentItem, SafetyEvent } from "@/lib/types";

// Inspections and accidents (DOT Compliance tab): one row per inspection / accident with its date,
// truck, driver, level, location, notes and files. Everything can be changed or deleted later. The
// files also show on the truck's and the driver's documents.

type Kind = SafetyEvent["kind"];

export const INSPECTION_LEVELS = ["I – NAS", "II – Walk-around", "III – Driver only", "IV – Special inspection", "V – Vehicle only", "VI – Hazmat"];

/** Where an event's files go: inspections have one pile, accidents one per kind of paper. */
const FILE_SLOTS: Record<Kind, { key: string; label: string }[]> = {
  inspection: [{ key: "inspection_report", label: "Inspection report" }],
  accident: [
    { key: "accident_police_report", label: "Police report" },
    { key: "accident_registry", label: "Accident registry" },
    { key: "accident_drug_test", label: "Post-accident drug & alcohol test" },
    { key: "accident_hos", label: "HOS reports" },
    { key: "accident_maintenance", label: "Vehicle maintenance reports" },
    { key: "accident_other", label: "Other files" },
  ],
};

const COPY: Record<Kind, { title: string; subtitle: string; add: string; one: string; level: string; empty: string; icon: typeof ClipboardCheck }> = {
  inspection: { title: "Inspection reports", subtitle: "One row per inspection · also on the truck's and driver's documents", add: "Add inspection", one: "inspection", level: "Level", empty: "No inspections yet.", icon: ClipboardCheck },
  accident: { title: "Accidents", subtitle: "Police report, accident registry, post-accident tests, HOS and maintenance reports", add: "Add accident", one: "accident", level: "Type", empty: "No accidents recorded.", icon: AlertOctagon },
};

const ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp,.heic,.heif,.doc,.docx";

export function SafetyEvents({ company, kind }: { company: Company; kind: Kind }) {
  const { documents, trucks, drivers } = useStore();
  const events = useLiveTable<SafetyEvent>("tms_safety_events", { order: "event_date", filter: { company_id: company.id } });
  const [open, setOpen] = useState<SafetyEvent | "new" | null>(null);
  const copy = COPY[kind];
  const list = events.rows.filter((e) => e.kind === kind).sort((a, b) => (b.event_date || "").localeCompare(a.event_date || "") || b.created_at.localeCompare(a.created_at));
  const filesOf = (id: string) => documents.filter((d) => d.event_id === id);
  return (
    <Card>
      <CardHeader
        title={copy.title}
        subtitle={copy.subtitle}
        actions={
          <Button size="sm" variant="secondary" onClick={() => setOpen("new")}>
            <Plus className="h-4 w-4" /> {copy.add}
          </Button>
        }
      />
      {list.length === 0 ? (
        <Empty icon={copy.icon} title={copy.empty} className="py-6" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-[13px]">
            <thead className="text-[11px] uppercase tracking-wider text-fg-4">
              <tr className="border-b border-line">
                <th className="px-4 py-2 font-medium sm:px-5">Date</th>
                <th className="px-2 py-2 font-medium">{copy.level}</th>
                <th className="px-2 py-2 font-medium">Truck</th>
                <th className="px-2 py-2 font-medium">Driver</th>
                <th className="px-2 py-2 font-medium">Location / notes</th>
                <th className="px-2 py-2 font-medium">Files</th>
                <th className="w-10 px-4 py-2 sm:px-5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {list.map((e) => {
                const t = trucks.find((x) => x.id === e.truck_id);
                const files = filesOf(e.id);
                return (
                  <tr key={e.id} onClick={() => setOpen(e)} className="cursor-pointer hover:bg-surface-2/50">
                    <td className="tnum whitespace-nowrap px-4 py-2.5 font-medium text-fg sm:px-5">{fmtDay(e.event_date)}</td>
                    <td className="px-2 py-2.5 text-fg-2">{e.level || "—"}</td>
                    <td className="whitespace-nowrap px-2 py-2.5 text-fg-2">{t ? truckLabel(t) : "—"}</td>
                    <td className="px-2 py-2.5 text-fg-2">{drivers.find((x) => x.id === e.driver_id)?.name || "—"}</td>
                    <td className="max-w-[260px] truncate px-2 py-2.5 text-fg-3">{[e.location, e.notes].filter(Boolean).join(" · ") || "—"}</td>
                    <td className="px-2 py-2.5">
                      {files.length ? (
                        <span className="inline-flex items-center gap-1 text-fg-2">
                          <FileText className="h-3.5 w-3.5 text-fg-4" /> {files.length}
                        </span>
                      ) : (
                        <span className="text-amber-700 dark:text-amber-300">None</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right sm:px-5">
                      <Pencil className="ml-auto h-3.5 w-3.5 text-fg-4" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {open && <EventModal company={company} kind={kind} value={open} onClose={() => setOpen(null)} put={events.put} drop={events.drop} />}
    </Card>
  );
}

type Draft = Pick<SafetyEvent, "event_date" | "truck_id" | "driver_id" | "level" | "location" | "notes">;

function EventModal({ company, kind, value, onClose, put, drop }: { company: Company; kind: Kind; value: SafetyEvent | "new"; onClose: () => void; put: (e: SafetyEvent) => void; drop: (id: string) => void }) {
  const { documents, trucks, drivers, uploadDocument, updateDocument, deleteDocument } = useStore();
  const editing = value === "new" ? null : value;
  const copy = COPY[kind];
  const [d, setD] = useState<Draft>(() => ({
    event_date: editing?.event_date ?? today(),
    truck_id: editing?.truck_id ?? null,
    driver_id: editing?.driver_id ?? null,
    level: editing?.level ?? null,
    location: editing?.location ?? null,
    notes: editing?.notes ?? null,
  }));
  // Files picked for a new event wait here until it's saved.
  const [pending, setPending] = useState<{ slot: string; file: File }[]>([]);
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<Draft>) => setD((x) => ({ ...x, ...p }));
  const ownTrucks = trucks.filter((t) => t.company_id === company.id);
  const ownDrivers = drivers.filter((x) => x.company_id === company.id);
  const files = editing ? documents.filter((x) => x.event_id === editing.id) : [];

  const meta = (eventId: string, slot: string) => ({
    company_id: company.id,
    doc_type: slot,
    event_id: eventId,
    truck_id: d.truck_id,
    driver_id: d.driver_id,
    issued_on: d.event_date,
  });

  const addFiles = async (slot: string, list: FileList | null) => {
    if (!list?.length) return;
    if (!editing) return setPending((p) => [...p, ...Array.from(list).map((file) => ({ slot, file }))]);
    setBusy(true);
    let n = 0;
    for (const f of Array.from(list)) if (await uploadDocument(f, meta(editing.id, slot))) n++;
    setBusy(false);
    if (n) toast.success(n === 1 ? "File added" : `${n} files added`);
  };

  const save = async () => {
    setBusy(true);
    const row = { ...d, company_id: company.id, kind, updated_at: new Date().toISOString() };
    const res = editing ? await sb().from("tms_safety_events").update(row).eq("id", editing.id).select().single() : await sb().from("tms_safety_events").insert(row).select().single();
    if (res.error) {
      setBusy(false);
      return toast.error(errMsg(res.error));
    }
    const ev = res.data as SafetyEvent;
    put(ev);
    // Its files follow the date, truck and driver (they show on the truck's and driver's documents).
    for (const f of files)
      if (f.truck_id !== d.truck_id || f.driver_id !== d.driver_id || (f.issued_on || null) !== d.event_date) await updateDocument(f.id, { truck_id: d.truck_id, driver_id: d.driver_id, issued_on: d.event_date });
    let failed = 0;
    for (const p of pending) if (!(await uploadDocument(p.file, meta(ev.id, p.slot)))) failed++;
    setBusy(false);
    if (failed) toast.error(`${failed} file(s) didn't upload. Open the ${copy.one} to add them again.`);
    toast.success(editing ? `${copy.one[0].toUpperCase()}${copy.one.slice(1)} saved` : `${copy.one[0].toUpperCase()}${copy.one.slice(1)} added`);
    onClose();
  };

  const remove = async () => {
    if (!editing) return;
    if (!(await confirmDialog({ title: `Delete this ${copy.one}?`, body: files.length ? `Its ${files.length} file${files.length === 1 ? " is" : "s are"} deleted too.` : undefined, confirmLabel: "Delete", danger: true }))) return;
    setBusy(true);
    for (const f of files) await deleteDocument(f.id);
    const { error } = await sb().from("tms_safety_events").delete().eq("id", editing.id);
    setBusy(false);
    if (error) return toast.error(errMsg(error));
    drop(editing.id);
    toast.success(`${copy.one[0].toUpperCase()}${copy.one.slice(1)} deleted`);
    onClose();
  };

  const removeFile = async (f: DocumentItem) => {
    if (!(await confirmDialog({ title: `Delete ${f.file_name}?`, confirmLabel: "Delete", danger: true }))) return;
    if (await deleteDocument(f.id)) toast.success("File deleted");
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={editing ? `${copy.one[0].toUpperCase()}${copy.one.slice(1)} · ${fmtDay(editing.event_date)}` : copy.add}
      footer={
        <>
          {editing && (
            <Button variant="danger-ghost" onClick={remove} disabled={busy} className="mr-auto">
              <Trash2 className="h-4 w-4" /> Delete
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} loading={busy}>
            {editing ? "Save" : copy.add}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Date">
            <Input type="date" value={d.event_date || ""} onChange={(e) => set({ event_date: e.target.value || null })} />
          </Field>
          <Field label="Truck">
            <Select value={d.truck_id || ""} onChange={(e) => set({ truck_id: e.target.value || null })}>
              <option value="">—</option>
              {ownTrucks.map((t) => (
                <option key={t.id} value={t.id}>
                  {truckLabel(t)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Driver">
            <Select value={d.driver_id || ""} onChange={(e) => set({ driver_id: e.target.value || null })}>
              <option value="">—</option>
              {ownDrivers.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </Select>
          </Field>
          {kind === "inspection" ? (
            <Field label="Level of inspection">
              <Select value={d.level || ""} onChange={(e) => set({ level: e.target.value || null })}>
                <option value="">—</option>
                {[...INSPECTION_LEVELS, ...(d.level && !INSPECTION_LEVELS.includes(d.level) ? [d.level] : [])].map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </Select>
            </Field>
          ) : (
            <Field label="Type">
              <Input value={d.level || ""} onChange={(e) => set({ level: e.target.value || null })} placeholder="e.g. Tow-away, injury, property damage" />
            </Field>
          )}
          <Field label="Location" className="sm:col-span-2">
            <Input value={d.location || ""} onChange={(e) => set({ location: e.target.value || null })} placeholder="City, ST" />
          </Field>
          <Field label="Notes" className="sm:col-span-3">
            <Textarea rows={2} value={d.notes || ""} onChange={(e) => set({ notes: e.target.value || null })} placeholder={kind === "inspection" ? "Violations, out of service…" : "What happened, injuries, tow, citations…"} />
          </Field>
        </div>

        <div className={cn("grid gap-2.5", kind === "accident" && "sm:grid-cols-2")}>
          {FILE_SLOTS[kind].map((s) => (
            <FileSlot
              key={s.key}
              label={s.label}
              saved={files.filter((f) => f.doc_type === s.key)}
              pending={pending.filter((p) => p.slot === s.key).map((p) => p.file)}
              busy={busy}
              onAdd={(l) => addFiles(s.key, l)}
              onRemovePending={(f) => setPending((p) => p.filter((x) => x.file !== f))}
              onRemoveSaved={removeFile}
            />
          ))}
        </div>
      </div>
    </Modal>
  );
}

function FileSlot({
  label,
  saved,
  pending,
  busy,
  onAdd,
  onRemovePending,
  onRemoveSaved,
}: {
  label: string;
  saved: DocumentItem[];
  pending: File[];
  busy: boolean;
  onAdd: (l: FileList | null) => void;
  onRemovePending: (f: File) => void;
  onRemoveSaved: (d: DocumentItem) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const n = saved.length + pending.length;
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
        onAdd(e.dataTransfer.files);
      }}
      className={cn("rounded-xl border p-3 transition-colors", drag ? "border-brand bg-brand/5" : n ? "border-line" : "border-dashed border-line-strong")}
    >
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-fg">{label}</span>
        <span className="text-[11px] text-fg-4">{n ? `${n} file${n === 1 ? "" : "s"}` : "None"}</span>
        <Button size="xs" variant={n ? "ghost" : "secondary"} onClick={() => input.current?.click()} disabled={busy}>
          {n ? <Plus className="h-3.5 w-3.5" /> : <UploadCloud className="h-3.5 w-3.5" />} {n ? "Add" : "Upload"}
        </Button>
      </div>
      {n > 0 && (
        <ul className="mt-2 space-y-1">
          {saved.map((f) => (
            <li key={f.id} className="flex items-center gap-2 rounded-lg bg-surface-2/60 px-2.5 py-1.5">
              <FileText className="h-3.5 w-3.5 shrink-0 text-fg-3" />
              <span className="min-w-0 flex-1 truncate text-xs text-fg-2">{f.file_name}</span>
              <span className="shrink-0 text-[11px] text-fg-4">{fileSize(f.file_size)}</span>
              <button type="button" onClick={() => openDocument(f.file_path, f.file_name).catch((e) => toast.error(`Couldn't open the file: ${errMsg(e)}`))} className="rounded p-0.5 text-fg-3 hover:text-fg" aria-label={`Open ${f.file_name}`}>
                <ExternalLink className="h-3.5 w-3.5" />
              </button>
              <button type="button" onClick={() => onRemoveSaved(f)} className="rounded p-0.5 text-fg-3 hover:text-red-500" aria-label={`Delete ${f.file_name}`}>
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
          {pending.map((f, i) => (
            <li key={`${i}-${f.name}`} className="flex items-center gap-2 rounded-lg bg-surface-2/60 px-2.5 py-1.5">
              <FileText className="h-3.5 w-3.5 shrink-0 text-fg-3" />
              <span className="min-w-0 flex-1 truncate text-xs text-fg-2">{f.name}</span>
              <span className="shrink-0 text-[11px] text-fg-4">{fileSize(f.size)}</span>
              <button type="button" onClick={() => onRemovePending(f)} className="rounded p-0.5 text-fg-3 hover:text-red-500" aria-label={`Remove ${f.name}`}>
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <input
        ref={input}
        type="file"
        multiple
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => {
          onAdd(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}
