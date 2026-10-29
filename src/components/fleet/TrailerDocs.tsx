"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CalendarClock, CheckCircle2, Circle, ExternalLink, FileText, Loader2, Plus, Trash2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { confirmDialog } from "@/components/ui/Confirm";
import { stagger } from "@/components/ui/Motion";
import { useStore } from "@/lib/store";
import { errMsg, openDocument } from "@/lib/db";
import { expiryState } from "@/lib/docs";
import { toast } from "@/lib/toast";
import { cn, fileSize, fmtDay } from "@/lib/format";
import type { DocType, DocumentItem } from "@/lib/types";

export interface DocSlotDef {
  key: string;
  title: string;
  hint: string;
  /** not counted as missing (never on the to-dos) */
  optional?: boolean;
}

/** The truck paperwork asked for when adding a truck. */
export const TRUCK_DOC_SLOTS: DocSlotDef[] = [
  { key: "registration", title: "Truck registration (Cab Card)", hint: "IRP cab card / registration for the truck plate" },
  { key: "inspection", title: "Annual truck inspection", hint: "Annual DOT inspection report or sticker" },
  { key: "truck_title", title: "Title", hint: "Certificate of title", optional: true },
  { key: "truck_lease", title: "Lease agreement", hint: "Only if the truck is leased", optional: true },
];

/** The trailer paperwork asked for when adding a trailer. */
export const TRAILER_DOC_SLOTS: DocSlotDef[] = [
  { key: "trailer_registration", title: "Trailer registration", hint: "Registration card for the trailer plate" },
  { key: "trailer_inspection", title: "Trailer annual inspection", hint: "Annual DOT inspection report or sticker" },
];

/** A file picked before the truck / trailer exists; uploaded when it's saved. A slot can have several
 *  (e.g. both sides of an inspection report). */
export interface PendingDoc {
  slot: string;
  file: File;
  expires: string;
}

const ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp,.heic,.heif";
const OK_FILE = /\.(pdf|png|jpe?g|webp|heic|heif)$/i;

type Owner = "truck" | "trailer";

/** Trailer registration + annual inspection (see EquipmentDocs). */
export function TrailerDocs(p: { trailerId?: string | null; companyId: string; pending?: PendingDoc[]; onPending?: (p: PendingDoc[]) => void }) {
  return <EquipmentDocs owner="trailer" ownerId={p.trailerId} companyId={p.companyId} pending={p.pending} onPending={p.onPending} />;
}

/** Truck registration (cab card) + annual inspection (see EquipmentDocs). */
export function TruckDocs(p: {
  truckId?: string | null;
  companyId: string;
  pending?: PendingDoc[];
  onPending?: (p: PendingDoc[]) => void;
  /** a file was picked for a slot (the form reads the cab card from it) */
  onFile?: (slot: string, file: File) => void;
}) {
  return <EquipmentDocs owner="truck" ownerId={p.truckId} companyId={p.companyId} pending={p.pending} onPending={p.onPending} onFile={p.onFile} />;
}

/**
 * Registration and annual inspection for a truck or trailer, each with one or more files (pages,
 * photos) and an expiry date shared by its files. With `ownerId` changes save right away; without
 * (new truck / trailer), they wait in `pending` and are uploaded when it's saved.
 */
export function EquipmentDocs({
  owner,
  ownerId,
  companyId,
  pending = [],
  onPending,
  onFile,
}: {
  owner: Owner;
  ownerId?: string | null;
  companyId: string;
  pending?: PendingDoc[];
  onPending?: (p: PendingDoc[]) => void;
  onFile?: (slot: string, file: File) => void;
}) {
  const { documents, docTypes } = useStore();
  const SLOTS = owner === "truck" ? TRUCK_DOC_SLOTS : TRAILER_DOC_SLOTS;
  // Every file per slot, oldest first.
  const bySlot = useMemo(() => {
    const m = new Map<string, DocumentItem[]>();
    if (!ownerId) return m;
    for (const d of documents)
      if ((owner === "truck" ? d.truck_id : d.trailer_id) === ownerId) m.set(d.doc_type, [...(m.get(d.doc_type) || []), d]);
    for (const l of m.values()) l.sort((a, b) => a.uploaded_at.localeCompare(b.uploaded_at));
    return m;
  }, [documents, ownerId, owner]);
  const required = SLOTS.filter((s) => !s.optional);
  const done = required.filter((s) => bySlot.get(s.key)?.length || pending.some((p) => p.slot === s.key)).length;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-fg-3">{owner === "truck" ? "Truck documents" : "Trailer documents"}</span>
        <span className={cn("tnum text-xs font-semibold", done === required.length ? "text-emerald-700 dark:text-emerald-300" : "text-fg-4")}>
          {done}/{required.length}
        </span>
      </div>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {SLOTS.map((slot, i) => (
          <DocSlot
            key={slot.key}
            i={i}
            n={i + 1}
            slot={slot}
            owner={owner}
            ownerId={ownerId}
            companyId={companyId}
            saved={bySlot.get(slot.key) || []}
            docType={docTypes.find((t) => t.key === slot.key)}
            pending={pending.filter((p) => p.slot === slot.key)}
            onPending={(p) => onPending?.([...pending.filter((x) => x.slot !== slot.key), ...p])}
            onFile={onFile}
          />
        ))}
      </div>
    </div>
  );
}

function DocSlot({
  i,
  n,
  slot,
  owner,
  ownerId,
  companyId,
  saved,
  docType,
  pending,
  onPending,
  onFile,
}: {
  i: number;
  n: number;
  slot: DocSlotDef;
  owner: Owner;
  ownerId?: string | null;
  companyId: string;
  saved: DocumentItem[];
  docType?: DocType;
  pending: PendingDoc[];
  onPending: (p: PendingDoc[]) => void;
  onFile?: (slot: string, file: File) => void;
}) {
  const { uploadDocument, updateDocument, deleteDocument } = useStore();
  // The newest file decides the status; the date is the same on all of them.
  const last = saved[saved.length - 1];
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const [exp, setExp] = useState(last?.expires_on || pending[0]?.expires || "");
  const expRef = useRef(exp);
  useLayoutEffect(() => {
    expRef.current = exp;
  });
  // Follow the saved document's date (another dispatcher, or a newer upload).
  const savedExp = last?.expires_on || "";
  const [seen, setSeen] = useState(savedExp);
  if (savedExp !== seen) {
    setSeen(savedExp);
    setExp(savedExp);
  }

  const hasExpiry = docType?.has_expiry ?? true;
  const state = last ? expiryState(last, docType) : pending.length ? "ok" : "missing";
  const has = saved.length > 0 || pending.length > 0;

  /** Add one or more files (pages, photos) to the slot. */
  const pick = async (list: FileList | File[] | null | undefined) => {
    const files = [...(list || [])].filter((f) => {
      if (!OK_FILE.test(f.name)) return toast.error(`${f.name}: use a PDF or a photo (JPG, PNG, HEIC).`), false;
      if (f.size > 25 * 1024 * 1024) return toast.error(`${f.name} is over 25 MB.`), false;
      return true;
    });
    if (!files.length) return;
    if (!has) onFile?.(slot.key, files[0]);
    if (!ownerId) return onPending([...pending, ...files.map((file) => ({ slot: slot.key, file, expires: exp }))]);
    setBusy(true);
    let up = 0;
    for (const file of files) {
      const doc = await uploadDocument(file, { company_id: companyId, [owner === "truck" ? "truck_id" : "trailer_id"]: ownerId, doc_type: slot.key, expires_on: exp || null });
      // A date typed while the file was uploading is saved onto the new document.
      if (doc && expRef.current !== (doc.expires_on || "")) await updateDocument(doc.id, { expires_on: expRef.current || null });
      if (doc) up++;
    }
    setBusy(false);
    if (up) toast.success(up > 1 ? `${up} files added to ${slot.title}` : `${slot.title} uploaded`);
  };

  const setExpiry = async (v: string) => {
    setExp(v);
    if (!ownerId) return onPending(pending.map((p) => ({ ...p, expires: v })));
    if (busy) return;
    for (const d of saved) if (v !== (d.expires_on || "")) await updateDocument(d.id, { expires_on: v || null });
  };

  const removeSaved = async (d: DocumentItem) => {
    if (!(await confirmDialog({ title: `Delete ${d.file_name}?`, body: `It's removed from ${slot.title}.`, confirmLabel: "Delete", danger: true }))) return;
    if (await deleteDocument(d.id)) toast.success("File deleted");
  };

  const Icon = state === "ok" ? CheckCircle2 : state === "missing" ? Circle : state === "expired" ? AlertTriangle : CalendarClock;
  const tone =
    state === "ok"
      ? "text-emerald-700 dark:text-emerald-300"
      : state === "missing"
        ? "text-fg-4"
        : state === "expired"
          ? "text-red-700 dark:text-red-300"
          : "text-amber-800 dark:text-amber-300";
  const status = !has
    ? slot.optional
      ? "Optional · only if you have it"
      : "Missing"
    : pending.length && !saved.length
      ? `Will upload when the ${owner} is saved`
      : state === "expired"
        ? `Expired ${fmtDay(last?.expires_on)}`
        : state === "soon"
          ? `Expires ${fmtDay(last?.expires_on)}`
          : state === "no_date"
            ? "Add the expiry date"
            : last?.expires_on
              ? `Valid until ${fmtDay(last.expires_on)}`
              : "On file";

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
        pick(e.dataTransfer.files);
      }}
      className={cn("animate-rise rounded-xl border bg-surface p-3 transition-colors", drag ? "border-brand bg-brand/5" : has ? "border-line" : "border-dashed border-line-strong")}
      style={stagger(i, 40)}
    >
      <div className="flex items-start gap-2">
        <span className={cn("mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold", has ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "bg-surface-2 text-fg-3")}>
          {has ? <CheckCircle2 className="h-3.5 w-3.5" /> : n}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold text-fg">{slot.title}</div>
          <div className={cn("flex items-center gap-1 text-[11px]", tone)}>
            <Icon className="h-3 w-3 shrink-0" />
            <span className="truncate">{status}</span>
          </div>
        </div>
      </div>

      {has && (
        <ul className="mt-2.5 space-y-1">
          {saved.map((d) => (
            <li key={d.id} className="flex items-center gap-2 rounded-lg bg-surface-2/60 px-2.5 py-1.5">
              <FileText className="h-3.5 w-3.5 shrink-0 text-fg-3" />
              <span className="min-w-0 flex-1 truncate text-xs text-fg-2">{d.file_name}</span>
              <span className="shrink-0 text-[11px] text-fg-4">{fileSize(d.file_size)}</span>
              <button
                type="button"
                onClick={() => openDocument(d.file_path, d.file_name).catch((e) => toast.error(`Couldn't open the file: ${errMsg(e)}`))}
                className="rounded p-0.5 text-fg-3 hover:text-fg"
                aria-label={`Open ${d.file_name}`}
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </button>
              <button type="button" onClick={() => removeSaved(d)} className="rounded p-0.5 text-fg-3 hover:text-red-500" aria-label={`Delete ${d.file_name}`}>
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
          {pending.map((p, j) => (
            <li key={`p${j}-${p.file.name}`} className="flex items-center gap-2 rounded-lg bg-surface-2/60 px-2.5 py-1.5">
              <FileText className="h-3.5 w-3.5 shrink-0 text-fg-3" />
              <span className="min-w-0 flex-1 truncate text-xs text-fg-2">{p.file.name}</span>
              <span className="shrink-0 text-[11px] text-fg-4">{fileSize(p.file.size)}</span>
              <button type="button" onClick={() => onPending(pending.filter((_, k) => k !== j))} className="rounded p-0.5 text-fg-3 hover:text-red-500" aria-label={`Remove ${p.file.name}`}>
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-2.5 flex items-end gap-2">
        {hasExpiry && (
          <label className="min-w-0 flex-1">
            <span className="mb-1 block text-[11px] font-medium text-fg-3">Expires</span>
            <Input type="date" value={exp} onChange={(e) => setExpiry(e.target.value)} className="h-8 text-[13px]" />
          </label>
        )}
        <Button size="sm" variant={has ? "outline" : "secondary"} className="h-8 shrink-0" onClick={() => input.current?.click()} disabled={busy}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : has ? <Plus className="h-3.5 w-3.5" /> : <Upload className="h-3.5 w-3.5" />}
          {busy ? "Uploading" : has ? "Add file" : "Upload"}
        </Button>
      </div>
      <p className="mt-1.5 text-[11px] text-fg-4">{slot.hint} · PDF or photos, several allowed</p>
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        multiple
        className="hidden"
        onChange={(e) => {
          pick(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}
