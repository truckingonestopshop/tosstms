"use client";

import { useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Circle,
  Download,
  ExternalLink,
  FileImage,
  FileText,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { Popover, MenuItem, MenuSep } from "@/components/ui/Menu";
import { Empty, Pill, neutralPill } from "@/components/ui/Bits";
import { confirmDialog } from "@/components/ui/Confirm";
import { useStore } from "@/lib/store";
import { openDocument, errMsg } from "@/lib/db";
import { toast } from "@/lib/toast";
import { cn, daysUntil, fileSize, fmtDay, relTime } from "@/lib/format";
import { checklist, docsOf, groupTypes, guessType, isPhotoDoc, scopeOf, supersededIds, typesFor, type CheckItem, type DocTarget } from "@/lib/docs";
import type { DocumentItem } from "@/lib/types";
import { DocTypesModal } from "./DocTypesModal";

export function ExpiryBadge({ date }: { date: string | null }) {
  const d = daysUntil(date);
  if (d === null) return null;
  if (d < 0) return <Pill className="bg-red-500/10 text-red-700 ring-red-600/20 dark:text-red-300">Expired {fmtDay(date)}</Pill>;
  if (d <= 30) return <Pill className="bg-amber-500/10 text-amber-800 ring-amber-600/25 dark:text-amber-300">Expires {fmtDay(date)}</Pill>;
  return <Pill className={neutralPill}>Exp. {fmtDay(date)}</Pill>;
}

/** Same list as the file picker; drag-and-drop skips the picker's filter. */
const ALLOWED = /\.(pdf|png|jpe?g|webp|heic|heif|gif|tiff?|doc|docx|xls|xlsx|csv|txt)$/i;
const ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp,.heic,.heif,.gif,.tif,.tiff,.doc,.docx,.xls,.xlsx,.csv,.txt";
const AUTO = "__auto";

const isImage = (d: DocumentItem) => (d.mime_type || "").startsWith("image/") || /\.(png|jpe?g|webp|gif|heic)$/i.test(d.file_name);

/**
 * Paperwork for one load, driver, truck or carrier: a checklist of what is required
 * (and what's expiring), an upload that recognises the document type from the file
 * name, and every file on record. Files go to the private `tms-docs` bucket; links
 * are short-lived signed URLs.
 */
export function DocumentsPanel({
  target,
  includeAll = false,
  emptyText,
  compact,
}: {
  target: DocTarget;
  /** Carrier view: also list files attached to its loads, drivers and trucks. */
  includeAll?: boolean;
  emptyText?: string;
  compact?: boolean;
}) {
  const { documents, docTypes, uploadDocument, docTypeName, loads, drivers, trucks, trailers } = useStore();
  const scope = target.scope;
  const offered = useMemo(() => typesFor(docTypes, scope), [docTypes, scope]);
  const items = useMemo(() => checklist(docTypes, documents, target), [docTypes, documents, target]);
  const [type, setType] = useState<string>(AUTO);
  const [expires, setExpires] = useState("");
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<string>("all");
  const [typesOpen, setTypesOpen] = useState(false);
  const [askExpiry, setAskExpiry] = useState<DocumentItem | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const slotInput = useRef<HTMLInputElement>(null);
  const slotType = useRef<string | null>(null);

  const list = useMemo(() => {
    const own = (includeAll && scope === "company" ? documents.filter((d) => d.company_id === target.companyId) : docsOf(documents, target)).filter(
      (d) => !isPhotoDoc(d.doc_type),
    );
    return [...own].sort((a, b) => b.uploaded_at.localeCompare(a.uploaded_at));
  }, [documents, target, includeAll, scope]);
  const old = useMemo(() => supersededIds(list), [list]);
  const chosen = docTypes.find((t) => t.key === type);

  const shown = list.filter((d) => {
    if (filter === "company" && (d.load_id || d.driver_id || d.truck_id || d.trailer_id)) return false;
    if (filter === "loads" && !d.load_id) return false;
    if (filter === "people" && !d.driver_id && !d.truck_id && !d.trailer_id) return false;
    if (filter.startsWith("t:") && d.doc_type !== filter.slice(2)) return false;
    if (q && !`${d.file_name} ${docTypeName(d.doc_type)} ${d.notes || ""}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  /** Uploads files; `forced` is the type picked from a checklist row. */
  const upload = async (files: FileList | File[], forced?: string | null) => {
    const arr = Array.from(files);
    if (!arr.length) return;
    setBusy(true);
    const done: DocumentItem[] = [];
    const unknown: string[] = [];
    for (const f of arr) {
      if (!ALLOWED.test(f.name)) {
        toast.error(`${f.name}: only PDF, images and Office files can be uploaded.`);
        continue;
      }
      if (f.size > 25 * 1024 * 1024) {
        toast.error(`${f.name} is over 25 MB.`);
        continue;
      }
      const picked = forced || (type !== AUTO ? type : guessType(f.name, scope, docTypes));
      if (!picked) unknown.push(f.name);
      const res = await uploadDocument(f, {
        company_id: target.companyId,
        load_id: scope === "load" ? target.id : null,
        driver_id: scope === "driver" ? target.id : null,
        truck_id: scope === "truck" ? target.id : null,
        trailer_id: scope === "trailer" ? target.id : null,
        doc_type: picked || "other",
        expires_on: forced ? null : expires || null,
      });
      if (res) done.push(res);
    }
    setBusy(false);
    setExpires("");
    if (fileInput.current) fileInput.current.value = "";
    if (!done.length) return;
    toast.success(done.length === 1 ? `${docTypeName(done[0].doc_type)} uploaded` : `${done.length} files uploaded`);
    if (unknown.length) toast.info(`Couldn't tell the type of ${unknown.join(", ")}. Set it from the file's menu (Edit).`);
    // An expiring document without a date can't remind anyone: ask for it right away.
    const needsDate = done.find((d) => !d.expires_on && docTypes.find((t) => t.key === d.doc_type)?.has_expiry);
    if (needsDate) setAskExpiry(needsDate);
  };

  const uploadFor = (key: string) => {
    slotType.current = key;
    slotInput.current?.click();
  };

  const where = (d: DocumentItem) => {
    if (d.load_id) {
      const l = loads.find((x) => x.id === d.load_id);
      return l ? `Load ${l.load_number ? `#${l.load_number} ` : ""}${l.origin_city} → ${l.destination_city}` : "Load";
    }
    if (d.driver_id) return `Driver · ${drivers.find((x) => x.id === d.driver_id)?.name || ""}`;
    if (d.truck_id) return `Unit ${trucks.find((x) => x.id === d.truck_id)?.unit_number || ""}`;
    if (d.trailer_id) return `Trailer ${trailers.find((x) => x.id === d.trailer_id)?.unit_number || ""}`;
    return null;
  };

  const typesUsed = Array.from(new Set(list.map((d) => d.doc_type)));

  return (
    <div className="space-y-3">
      {items.length > 0 && <Checklist items={items} compact={compact} onUpload={uploadFor} onEdit={setAskExpiry} busy={busy} />}

      {/* Upload zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          upload(e.dataTransfer.files);
        }}
        className={cn("rounded-xl border border-dashed p-3 transition-colors sm:p-4", drag ? "border-brand bg-brand/5" : "border-line-strong bg-surface-2/40")}
      >
        <div className={cn("flex flex-col gap-2.5", !compact && "sm:flex-row sm:items-end")}>
          <Field label="Type" className={cn("min-w-0", !compact && "sm:w-64")}>
            <Select value={type} onChange={(e) => setType(e.target.value)}>
              <option value={AUTO}>Detect from file name</option>
              {groupTypes(offered).map((g) =>
                g.label ? (
                  <optgroup key={g.label} label={g.label}>
                    {g.types.map((t) => (
                      <option key={t.key} value={t.key}>
                        {t.name}
                      </option>
                    ))}
                  </optgroup>
                ) : (
                  g.types.map((t) => (
                    <option key={t.key} value={t.key}>
                      {t.name}
                    </option>
                  ))
                ),
              )}
            </Select>
          </Field>
          {/* Any document can carry an expiry date; types that expire ask for it. */}
          {type !== AUTO && (
            <Field label={chosen?.has_expiry ? "Expires" : "Expires (optional)"} className={cn(!compact && "sm:w-44")}>
              <Input type="date" value={expires} onChange={(e) => setExpires(e.target.value)} />
            </Field>
          )}
          <div className="flex flex-1 gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => fileInput.current?.click()} loading={busy}>
              {!busy && <UploadCloud className="h-4 w-4" />}
              {busy ? "Uploading…" : "Upload files"}
            </Button>
            <Button variant="ghost" size="icon" title="Document types & rules" aria-label="Document types and rules" onClick={() => setTypesOpen(true)}>
              <Settings2 className="h-4 w-4" />
            </Button>
          </div>
          <input ref={fileInput} type="file" multiple accept={ACCEPT} className="hidden" onChange={(e) => e.target.files && upload(e.target.files)} />
          <input
            ref={slotInput}
            type="file"
            accept={ACCEPT}
            className="hidden"
            onChange={(e) => {
              if (e.target.files) upload(e.target.files, slotType.current);
              e.target.value = "";
            }}
          />
        </div>
        <p className="mt-2 hidden text-xs text-fg-4 sm:block">Drop several files at once; each one is filed by its name (BOL, POD, COI, CDL…). PDF, images, Office up to 25 MB.</p>
      </div>

      {/* Filters */}
      {list.length > 4 && (
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-4" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search files" className="pl-9" />
          </div>
          <Select value={filter} onChange={(e) => setFilter(e.target.value)} className="sm:w-56">
            <option value="all">All files ({list.length})</option>
            {includeAll && (
              <>
                <option value="company">Carrier files</option>
                <option value="loads">Load paperwork</option>
                <option value="people">Drivers, trucks & trailers</option>
              </>
            )}
            {typesUsed.map((t) => (
              <option key={t} value={`t:${t}`}>
                {docTypeName(t)}
              </option>
            ))}
          </Select>
        </div>
      )}

      {/* Every file */}
      {shown.length === 0 ? (
        <Empty icon={FileText} title={list.length ? "No files match" : emptyText || "No files yet"} className="py-6" />
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
          {shown.map((d) => (
            <DocRow key={d.id} d={d} where={includeAll ? where(d) : null} old={old.has(d.id)} />
          ))}
        </ul>
      )}

      <DocTypesModal open={typesOpen} onClose={() => setTypesOpen(false)} />
      {askExpiry && <EditDocModal d={askExpiry} onClose={() => setAskExpiry(null)} focusExpiry />}
    </div>
  );
}

const STATE_UI: Record<CheckItem["state"], { label: string; cls: string }> = {
  ok: { label: "On file", cls: "text-emerald-700 dark:text-emerald-300" },
  missing: { label: "Missing", cls: "text-fg-3" },
  expired: { label: "Expired", cls: "text-red-700 dark:text-red-300" },
  soon: { label: "Expiring", cls: "text-amber-800 dark:text-amber-300" },
  no_date: { label: "No expiry date", cls: "text-amber-800 dark:text-amber-300" },
};

/** Required paperwork (and anything expiring) with one-click upload per row. */
function Checklist({
  items,
  compact,
  onUpload,
  onEdit,
  busy,
}: {
  items: CheckItem[];
  compact?: boolean;
  onUpload: (key: string) => void;
  onEdit: (d: DocumentItem) => void;
  busy: boolean;
}) {
  const need = items.filter((i) => i.required && i.state !== "ok").length;
  const req = items.filter((i) => i.required).length;
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface">
      <div className="flex items-center justify-between border-b border-line px-3 py-2 sm:px-4">
        <span className="text-xs font-semibold uppercase tracking-wider text-fg-3">Required paperwork</span>
        {req > 0 && (
          <span className={cn("tnum text-xs font-semibold", need ? "text-amber-800 dark:text-amber-300" : "text-emerald-700 dark:text-emerald-300")}>
            {req - need}/{req} complete
          </span>
        )}
      </div>
      <ul className="divide-y divide-line">
        {items.map((i) => {
          const ui = STATE_UI[i.state];
          const bad = i.state === "missing" || i.state === "expired";
          const Icon = i.state === "ok" ? CheckCircle2 : i.state === "missing" ? Circle : i.state === "expired" ? AlertTriangle : CalendarClock;
          return (
            <li key={i.type.key} className="flex items-center gap-2.5 px-3 py-2 sm:px-4">
              <Icon className={cn("h-4 w-4 shrink-0", ui.cls)} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-[13px] font-medium text-fg">{i.type.name}</span>
                  {!i.required && <span className="text-[10px] font-medium uppercase tracking-wide text-fg-4">optional</span>}
                </div>
                <div className={cn("truncate text-xs", ui.cls)}>
                  {i.doc ? (
                    <>
                      {i.state === "ok" || i.state === "no_date" ? ui.label : `${ui.label} ${fmtDay(i.doc.expires_on)}`}
                      {i.doc.expires_on && i.state === "ok" && <span className="text-fg-4"> · exp. {fmtDay(i.doc.expires_on)}</span>}
                      {!compact && <span className="text-fg-4"> · {i.doc.file_name}</span>}
                    </>
                  ) : (
                    ui.label
                  )}
                </div>
              </div>
              {i.doc && (
                <button
                  onClick={() => openDocument(i.doc!.file_path, i.doc!.file_name).catch((e) => toast.error(`Couldn't open the file: ${errMsg(e)}`))}
                  className="rounded-md p-1.5 text-fg-3 hover:bg-surface-2 hover:text-fg"
                  title="Open"
                  aria-label={`Open ${i.type.name}`}
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </button>
              )}
              {i.state === "no_date" && i.doc ? (
                <Button size="xs" variant="outline" onClick={() => onEdit(i.doc!)}>
                  Add date
                </Button>
              ) : (
                <Button size="xs" variant={bad ? "secondary" : "ghost"} disabled={busy} onClick={() => onUpload(i.type.key)} title={i.doc ? "Upload a newer version" : "Upload"}>
                  {i.doc ? <RefreshCw className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                  {i.doc ? (compact ? "" : "New version") : "Upload"}
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function DocRow({ d, where, old }: { d: DocumentItem; where: string | null; old: boolean }) {
  const { docTypeName, deleteDocument, replaceDocumentFile } = useStore();
  const [editing, setEditing] = useState(false);
  const replaceInput = useRef<HTMLInputElement>(null);
  const Icon = isImage(d) ? FileImage : FileText;

  const open = async (download = false) => {
    try {
      await openDocument(d.file_path, d.file_name, download);
    } catch (e) {
      toast.error(`Couldn't open the file: ${errMsg(e)}`);
    }
  };

  return (
    <li className={cn("group flex items-center gap-3 px-3 py-2.5 hover:bg-surface-2/50 sm:px-4", old && "opacity-60")}>
      <button onClick={() => open()} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line bg-surface-2 text-fg-3">
          <Icon className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium text-fg group-hover:underline">{d.file_name}</span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-fg-3">
            <span className={cn(d.doc_type === "other" && "font-medium text-amber-800 dark:text-amber-300")}>{d.doc_type === "other" ? "Type not set" : docTypeName(d.doc_type)}</span>
            <span className="text-fg-4">·</span>
            <span>{fileSize(d.file_size)}</span>
            <span className="text-fg-4">·</span>
            <span>{relTime(d.uploaded_at)}</span>
            {where && (
              <>
                <span className="text-fg-4">·</span>
                <span className="truncate">{where}</span>
              </>
            )}
          </span>
        </span>
      </button>
      {old ? <Pill className={neutralPill}>Older version</Pill> : <ExpiryBadge date={d.expires_on} />}
      <div className="flex shrink-0 items-center">
        <button onClick={() => open(true)} className="hidden rounded-md p-1.5 text-fg-3 hover:bg-surface-2 hover:text-fg sm:block" title="Download" aria-label="Download">
          <Download className="h-4 w-4" />
        </button>
        <Popover
          align="end"
          width={200}
          trigger={({ toggle, ref }) => (
            <button ref={ref} onClick={toggle} className="rounded-md p-1.5 text-fg-3 hover:bg-surface-2 hover:text-fg" aria-label="File actions">
              <MoreHorizontal className="h-4 w-4" />
            </button>
          )}
        >
          {(close) => (
            <>
              <MenuItem icon={ExternalLink} onClick={() => (close(), open())}>
                Open
              </MenuItem>
              <MenuItem icon={Download} onClick={() => (close(), open(true))}>
                Download
              </MenuItem>
              <MenuItem icon={Pencil} onClick={() => (close(), setEditing(true))}>
                Edit type, date, notes
              </MenuItem>
              <MenuItem icon={RefreshCw} onClick={() => (close(), replaceInput.current?.click())}>
                Replace file
              </MenuItem>
              <MenuSep />
              <MenuItem
                icon={Trash2}
                danger
                onClick={async () => {
                  close();
                  if (await confirmDialog({ title: "Delete this file?", body: `${d.file_name} will be removed permanently.`, confirmLabel: "Delete", danger: true }))
                    if (await deleteDocument(d.id)) toast.success("File deleted");
                }}
              >
                Delete
              </MenuItem>
            </>
          )}
        </Popover>
        <input
          ref={replaceInput}
          type="file"
          accept={ACCEPT}
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (f && (await replaceDocumentFile(d.id, f))) toast.success("File replaced");
            e.target.value = "";
          }}
        />
      </div>
      {editing && <EditDocModal d={d} onClose={() => setEditing(false)} />}
    </li>
  );
}

function EditDocModal({ d, onClose, focusExpiry }: { d: DocumentItem; onClose: () => void; focusExpiry?: boolean }) {
  const { docTypes, updateDocument } = useStore();
  const scope = scopeOf(d);
  const [name, setName] = useState(d.file_name);
  const [type, setType] = useState(d.doc_type);
  const [exp, setExp] = useState(d.expires_on || "");
  const [notes, setNotes] = useState(d.notes || "");
  const [saving, setSaving] = useState(false);
  const t = docTypes.find((x) => x.key === type);
  const own = typesFor(docTypes, scope);
  const rest = docTypes.filter((x) => !own.includes(x) && !isPhotoDoc(x.key));
  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={focusExpiry ? "When does it expire?" : "Edit file"}
      subtitle={focusExpiry ? `${t?.name || "This document"} expires. Add the date to get a reminder 30 days before.` : undefined}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {focusExpiry ? "Later" : "Cancel"}
          </Button>
          <Button
            variant="primary"
            loading={saving}
            onClick={async () => {
              setSaving(true);
              const ok = await updateDocument(d.id, { file_name: name.trim() || d.file_name, doc_type: type, expires_on: exp || null, notes: notes || null });
              setSaving(false);
              if (ok) onClose();
            }}
          >
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {focusExpiry ? (
          <Field label="Expires">
            <Input type="date" value={exp} onChange={(e) => setExp(e.target.value)} autoFocus />
          </Field>
        ) : (
          <>
            <Field label="Type">
              <Select value={type} onChange={(e) => setType(e.target.value)}>
                {own.map((x) => (
                  <option key={x.key} value={x.key}>
                    {x.name}
                  </option>
                ))}
                {rest.length > 0 && (
                  <optgroup label="Other types">
                    {rest.map((x) => (
                      <option key={x.key} value={x.key}>
                        {x.name}
                      </option>
                    ))}
                  </optgroup>
                )}
              </Select>
            </Field>
            <Field label={t?.has_expiry ? "Expires" : "Expires (optional)"}>
              <Input type="date" value={exp} onChange={(e) => setExp(e.target.value)} />
            </Field>
            <Field label="File name">
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Notes">
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
            </Field>
          </>
        )}
      </div>
    </Modal>
  );
}
