"use client";

import { useMemo, useRef, useState } from "react";
import { AlertTriangle, CalendarClock, CheckCircle2, Circle, ExternalLink, FileText, Loader2, RefreshCw, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { stagger } from "@/components/ui/Motion";
import { useStore } from "@/lib/store";
import { errMsg, openDocument } from "@/lib/db";
import { expiryState, latestByType } from "@/lib/docs";
import { toast } from "@/lib/toast";
import { cn, fileSize, fmtDay } from "@/lib/format";
import type { DocType, DocumentItem } from "@/lib/types";

export interface DocSlotDef {
  key: string;
  title: string;
  hint: string;
}

/** The truck paperwork asked for when adding a truck. */
export const TRUCK_DOC_SLOTS: DocSlotDef[] = [
  { key: "registration", title: "Truck registration (Cab Card)", hint: "IRP cab card / registration for the truck plate" },
  { key: "inspection", title: "Annual truck inspection", hint: "Annual DOT inspection report or sticker" },
];

/** The trailer paperwork asked for when adding a trailer. */
export const TRAILER_DOC_SLOTS: DocSlotDef[] = [
  { key: "trailer_registration", title: "Trailer registration", hint: "Registration card for the trailer plate" },
  { key: "trailer_inspection", title: "Trailer annual inspection", hint: "Annual DOT inspection report or sticker" },
];

/** A document picked before the trailer exists; uploaded when it's saved. */
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
export function TruckDocs(p: { truckId?: string | null; companyId: string; pending?: PendingDoc[]; onPending?: (p: PendingDoc[]) => void }) {
  return <EquipmentDocs owner="truck" ownerId={p.truckId} companyId={p.companyId} pending={p.pending} onPending={p.onPending} />;
}

/**
 * Registration and annual inspection for a truck or trailer, each with its expiry date.
 * With `ownerId` changes save right away; without (new truck / trailer), they wait in
 * `pending` and are uploaded when it's saved.
 */
export function EquipmentDocs({
  owner,
  ownerId,
  companyId,
  pending = [],
  onPending,
}: {
  owner: Owner;
  ownerId?: string | null;
  companyId: string;
  pending?: PendingDoc[];
  onPending?: (p: PendingDoc[]) => void;
}) {
  const { documents, docTypes } = useStore();
  const SLOTS = owner === "truck" ? TRUCK_DOC_SLOTS : TRAILER_DOC_SLOTS;
  const latest = useMemo(
    () => latestByType(ownerId ? documents.filter((d) => (owner === "truck" ? d.truck_id : d.trailer_id) === ownerId) : []),
    [documents, ownerId, owner],
  );
  const done = SLOTS.filter((s) => latest.has(s.key) || pending.some((p) => p.slot === s.key)).length;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-fg-3">{owner === "truck" ? "Truck documents" : "Trailer documents"}</span>
        <span className={cn("tnum text-xs font-semibold", done === SLOTS.length ? "text-emerald-700 dark:text-emerald-300" : "text-fg-4")}>
          {done}/{SLOTS.length}
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
            saved={latest.get(slot.key)}
            docType={docTypes.find((t) => t.key === slot.key)}
            pending={pending.find((p) => p.slot === slot.key)}
            onPending={(p) => onPending?.([...pending.filter((x) => x.slot !== slot.key), ...(p ? [p] : [])])}
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
}: {
  i: number;
  n: number;
  slot: DocSlotDef;
  owner: Owner;
  ownerId?: string | null;
  companyId: string;
  saved?: DocumentItem;
  docType?: DocType;
  pending?: PendingDoc;
  onPending: (p: PendingDoc | null) => void;
}) {
  const { uploadDocument, updateDocument } = useStore();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const [exp, setExp] = useState(saved?.expires_on || "");
  const expRef = useRef(exp);
  expRef.current = exp;
  // Follow the saved document's date (another dispatcher, or a newer upload).
  const savedExp = saved?.expires_on || "";
  const [seen, setSeen] = useState(savedExp);
  if (savedExp !== seen) {
    setSeen(savedExp);
    setExp(savedExp);
  }

  const hasExpiry = docType?.has_expiry ?? true;
  const state = saved ? expiryState(saved, docType) : pending ? "ok" : "missing";
  const has = !!saved || !!pending;

  const pick = async (f: File | undefined) => {
    if (!f) return;
    if (!OK_FILE.test(f.name)) return toast.error("Use a PDF or a photo (JPG, PNG, HEIC).");
    if (f.size > 25 * 1024 * 1024) return toast.error(`${f.name} is over 25 MB.`);
    if (!ownerId) return onPending({ slot: slot.key, file: f, expires: pending?.expires || "" });
    setBusy(true);
    const doc = await uploadDocument(f, { company_id: companyId, [owner === "truck" ? "truck_id" : "trailer_id"]: ownerId, doc_type: slot.key, expires_on: exp || null });
    // A date typed while the file was uploading is saved onto the new document.
    if (doc && expRef.current !== (doc.expires_on || "")) await updateDocument(doc.id, { expires_on: expRef.current || null });
    setBusy(false);
    if (doc) toast.success(`${slot.title} uploaded`);
  };

  const setExpiry = async (v: string) => {
    setExp(v);
    if (!ownerId) {
      if (pending) onPending({ ...pending, expires: v });
      return;
    }
    if (saved && !busy && v !== (saved.expires_on || "")) await updateDocument(saved.id, { expires_on: v || null });
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
    ? "Missing"
    : pending && !saved
      ? "Will upload when the trailer is saved"
      : state === "expired"
        ? `Expired ${fmtDay(saved?.expires_on)}`
        : state === "soon"
          ? `Expires ${fmtDay(saved?.expires_on)}`
          : state === "no_date"
            ? "Add the expiry date"
            : saved?.expires_on
              ? `Valid until ${fmtDay(saved.expires_on)}`
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
        pick(e.dataTransfer.files?.[0]);
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

      {(saved || pending) && (
        <div className="mt-2.5 flex items-center gap-2 rounded-lg bg-surface-2/60 px-2.5 py-1.5">
          <FileText className="h-3.5 w-3.5 shrink-0 text-fg-3" />
          <span className="min-w-0 flex-1 truncate text-xs text-fg-2">{saved ? saved.file_name : pending!.file.name}</span>
          <span className="shrink-0 text-[11px] text-fg-4">{fileSize(saved ? saved.file_size : pending!.file.size)}</span>
          {saved ? (
            <button
              type="button"
              onClick={() => openDocument(saved.file_path, saved.file_name).catch((e) => toast.error(`Couldn't open the file: ${errMsg(e)}`))}
              className="rounded p-0.5 text-fg-3 hover:text-fg"
              aria-label={`Open ${slot.title}`}
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </button>
          ) : (
            <button type="button" onClick={() => onPending(null)} className="rounded p-0.5 text-fg-3 hover:text-red-500" aria-label="Remove file">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}

      <div className="mt-2.5 flex items-end gap-2">
        {hasExpiry && (
          <label className="min-w-0 flex-1">
            <span className="mb-1 block text-[11px] font-medium text-fg-3">Expires</span>
            <Input type="date" value={ownerId ? exp : pending?.expires || exp} onChange={(e) => setExpiry(e.target.value)} className="h-8 text-[13px]" />
          </label>
        )}
        <Button size="sm" variant={has ? "outline" : "secondary"} className="h-8 shrink-0" onClick={() => input.current?.click()} disabled={busy}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : has ? <RefreshCw className="h-3.5 w-3.5" /> : <Upload className="h-3.5 w-3.5" />}
          {busy ? "Uploading" : has ? "Replace" : "Upload"}
        </Button>
      </div>
      <p className="mt-1.5 text-[11px] text-fg-4">{slot.hint} · PDF or photo</p>
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => {
          pick(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </div>
  );
}
