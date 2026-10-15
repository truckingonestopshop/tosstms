"use client";

import { useMemo, useRef, useState } from "react";
import {
  Download,
  ExternalLink,
  FileImage,
  FileText,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  Search,
  Trash2,
  UploadCloud,
  Settings2,
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
import type { DocScope, DocumentItem } from "@/lib/types";
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

const isImage = (d: DocumentItem) => (d.mime_type || "").startsWith("image/") || /\.(png|jpe?g|webp|gif|heic)$/i.test(d.file_name);

/**
 * Upload, list and manage files for a company, load, driver or truck.
 * Files go to the private `tms-docs` bucket; links are short-lived signed URLs.
 */
export function DocumentsPanel({
  companyId,
  loadId = null,
  driverId = null,
  truckId = null,
  scope,
  includeAll = false,
  emptyText,
  compact,
}: {
  companyId: string;
  loadId?: string | null;
  driverId?: string | null;
  truckId?: string | null;
  /** Which document types are offered first. */
  scope: DocScope;
  /** Company view: also list files attached to its loads, drivers and trucks. */
  includeAll?: boolean;
  emptyText?: string;
  compact?: boolean;
}) {
  const { documents, docTypes, uploadDocument, docTypeName, loads, drivers, trucks } = useStore();
  const offered = useMemo(
    () => [...docTypes.filter((t) => t.scope === scope), ...docTypes.filter((t) => t.scope !== scope && t.scope !== "any"), ...docTypes.filter((t) => t.scope === "any")],
    [docTypes, scope],
  );
  const [type, setType] = useState<string>(() => offered[0]?.key || "other");
  const [expires, setExpires] = useState("");
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<string>("all");
  const [typesOpen, setTypesOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const list = useMemo(() => {
    return documents.filter((d) => {
      if (d.company_id !== companyId) return false;
      if (loadId) return d.load_id === loadId;
      if (driverId) return d.driver_id === driverId;
      if (truckId) return d.truck_id === truckId;
      if (!includeAll) return !d.load_id && !d.driver_id && !d.truck_id;
      return true;
    });
  }, [documents, companyId, loadId, driverId, truckId, includeAll]);

  const shown = list.filter((d) => {
    if (filter === "company" && (d.load_id || d.driver_id || d.truck_id)) return false;
    if (filter === "loads" && !d.load_id) return false;
    if (filter === "people" && !d.driver_id && !d.truck_id) return false;
    if (filter.startsWith("t:") && d.doc_type !== filter.slice(2)) return false;
    if (q && !`${d.file_name} ${docTypeName(d.doc_type)}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  const upload = async (files: FileList | File[]) => {
    const arr = Array.from(files);
    if (!arr.length) return;
    setBusy(true);
    let ok = 0;
    for (const f of arr) {
      if (!ALLOWED.test(f.name)) {
        toast.error(`${f.name}: only PDF, images and Office files can be uploaded.`);
        continue;
      }
      if (f.size > 25 * 1024 * 1024) {
        toast.error(`${f.name} is over 25 MB.`);
        continue;
      }
      const res = await uploadDocument(f, {
        company_id: companyId,
        load_id: loadId,
        driver_id: driverId,
        truck_id: truckId,
        doc_type: type,
        expires_on: expires || null,
      });
      if (res) ok++;
    }
    setBusy(false);
    setExpires("");
    if (ok) toast.success(ok === 1 ? "File uploaded" : `${ok} files uploaded`);
    if (fileInput.current) fileInput.current.value = "";
  };

  const where = (d: DocumentItem) => {
    if (d.load_id) {
      const l = loads.find((x) => x.id === d.load_id);
      return l ? `Load ${l.load_number ? `#${l.load_number}` : ""} ${l.origin_city} → ${l.destination_city}` : "Load";
    }
    if (d.driver_id) return `Driver · ${drivers.find((x) => x.id === d.driver_id)?.name || ""}`;
    if (d.truck_id) return `Unit ${trucks.find((x) => x.id === d.truck_id)?.unit_number || ""}`;
    return null;
  };

  const typesUsed = Array.from(new Set(list.map((d) => d.doc_type)));

  return (
    <div className="space-y-3">
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
        className={cn(
          "rounded-xl border border-dashed p-3 transition-colors sm:p-4",
          drag ? "border-brand bg-brand/5" : "border-line-strong bg-surface-2/40",
        )}
      >
        <div className={cn("flex flex-col gap-2.5", !compact && "sm:flex-row sm:items-end")}>
          <Field label="Type" className={cn("min-w-0", !compact && "sm:w-64")}>
            <Select value={type} onChange={(e) => setType(e.target.value)}>
              {offered.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Expires (optional)" className={cn(!compact && "sm:w-44")}>
            <Input type="date" value={expires} onChange={(e) => setExpires(e.target.value)} />
          </Field>
          <div className="flex flex-1 gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => fileInput.current?.click()} loading={busy}>
              {!busy && <UploadCloud className="h-4 w-4" />}
              {busy ? "Uploading…" : "Upload files"}
            </Button>
            <Button variant="ghost" size="icon" title="Document types" onClick={() => setTypesOpen(true)}>
              <Settings2 className="h-4 w-4" />
            </Button>
          </div>
          <input
            ref={fileInput}
            type="file"
            multiple
            accept=".pdf,.png,.jpg,.jpeg,.webp,.heic,.heif,.gif,.tif,.tiff,.doc,.docx,.xls,.xlsx,.csv,.txt"
            className="hidden"
            onChange={(e) => e.target.files && upload(e.target.files)}
          />
        </div>
        <p className="mt-2 hidden text-xs text-fg-4 sm:block">Or drop files here. PDF, images, Office files up to 25 MB.</p>
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
                <option value="company">Company files</option>
                <option value="loads">Load paperwork</option>
                <option value="people">Drivers & trucks</option>
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

      {/* List */}
      {shown.length === 0 ? (
        <Empty icon={FileText} title={list.length ? "No files match" : emptyText || "No files yet"} className="py-8" />
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
          {shown.map((d) => (
            <DocRow key={d.id} d={d} where={includeAll ? where(d) : null} />
          ))}
        </ul>
      )}

      <DocTypesModal open={typesOpen} onClose={() => setTypesOpen(false)} />
    </div>
  );
}

function DocRow({ d, where }: { d: DocumentItem; where: string | null }) {
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
    <li className="group flex items-center gap-3 px-3 py-2.5 hover:bg-surface-2/50 sm:px-4">
      <button onClick={() => open()} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line bg-surface-2 text-fg-3">
          <Icon className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium text-fg group-hover:underline">{d.file_name}</span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-fg-3">
            <span>{docTypeName(d.doc_type)}</span>
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
      <ExpiryBadge date={d.expires_on} />
      <div className="flex shrink-0 items-center">
        <button onClick={() => open(true)} className="hidden rounded-md p-1.5 text-fg-3 hover:bg-surface-2 hover:text-fg sm:block" title="Download">
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
                Edit details
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

function EditDocModal({ d, onClose }: { d: DocumentItem; onClose: () => void }) {
  const { docTypes, updateDocument } = useStore();
  const [name, setName] = useState(d.file_name);
  const [type, setType] = useState(d.doc_type);
  const [exp, setExp] = useState(d.expires_on || "");
  const [notes, setNotes] = useState(d.notes || "");
  const [saving, setSaving] = useState(false);
  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title="Edit file"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={saving}
            onClick={async () => {
              setSaving(true);
              const ok = await updateDocument(d.id, { file_name: name.trim() || d.file_name, doc_type: type, expires_on: exp || null, notes });
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
        <Field label="File name">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Type">
          <Select value={type} onChange={(e) => setType(e.target.value)}>
            {docTypes.map((t) => (
              <option key={t.key} value={t.key}>
                {t.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Expires">
          <Input type="date" value={exp} onChange={(e) => setExp(e.target.value)} />
        </Field>
        <Field label="Notes">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </Field>
      </div>
    </Modal>
  );
}
