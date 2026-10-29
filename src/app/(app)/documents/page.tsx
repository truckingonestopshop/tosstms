"use client";

import { useRef, useState } from "react";
import { Download, ExternalLink, FileText, Folder, Pencil, Search, Trash2, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, Empty, Page, PageHeader } from "@/components/ui/Bits";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { confirmDialog } from "@/components/ui/Confirm";
import { BUCKET, errMsg, openDocument, sb } from "@/lib/db";
import { useLiveTable } from "@/lib/live";
import { useStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import { cn, daysUntil, fileSize, fmtDay } from "@/lib/format";

// Documents: TOSS's own files (agreements, licenses, insurance, tax, forms), in folders, with
// expiry dates. Each carrier's documents stay in its own Documents tab (Companies).

interface OwnDoc {
  id: string;
  folder: string;
  name: string;
  file_path: string;
  file_name: string;
  file_size: number | null;
  mime_type: string | null;
  expires_on: string | null;
  notes: string | null;
  uploaded_by: string | null;
  uploaded_by_name: string | null;
  created_at: string;
}

const FOLDERS = ["Agreements", "Licenses & permits", "Insurance", "Tax & accounting", "Forms", "General"];
const ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp,.heic,.doc,.docx,.xls,.xlsx,.csv,.txt,.odt";

function Expiry({ date }: { date: string | null }) {
  const n = daysUntil(date);
  if (n === null) return null;
  return (
    <span className={cn("text-xs", n < 0 ? "text-red-600 dark:text-red-400" : n <= 30 ? "text-amber-600 dark:text-amber-400" : "text-fg-3")}>
      {n < 0 ? `Expired ${fmtDay(date)}` : `Expires ${fmtDay(date)}`}
    </span>
  );
}

export default function DocumentsPage() {
  const { me, memberById } = useStore();
  const docs = useLiveTable<OwnDoc>("tms_own_documents");
  const [folder, setFolder] = useState("all");
  const [q, setQ] = useState("");
  const [upFolder, setUpFolder] = useState("General");
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState<OwnDoc | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const folders = [...new Set([...FOLDERS, ...docs.rows.map((d) => d.folder)])];
  const list = docs.rows
    .filter((d) => folder === "all" || d.folder === folder)
    .filter((d) => !q || `${d.name} ${d.file_name} ${d.folder} ${d.notes || ""}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => a.folder.localeCompare(b.folder) || a.name.localeCompare(b.name));
  const expiring = docs.rows.filter((d) => (daysUntil(d.expires_on) ?? 999) <= 30).length;

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    let ok = 0;
    for (const file of Array.from(files)) {
      const path = `toss/${crypto.randomUUID()}/${file.name.replace(/[^\w.\- ]+/g, "_")}`;
      const up = await sb().storage.from(BUCKET).upload(path, file, { contentType: file.type || undefined });
      if (up.error) {
        toast.error(`${file.name}: ${errMsg(up.error)}`);
        continue;
      }
      const { data, error } = await sb()
        .from("tms_own_documents")
        .insert({
          folder: folder !== "all" ? folder : upFolder,
          name: file.name.replace(/\.[a-z0-9]+$/i, ""),
          file_path: path,
          file_name: file.name,
          file_size: file.size,
          mime_type: file.type || null,
          uploaded_by_name: memberById(me.id)?.full_name || me.fullName || me.email,
        })
        .select()
        .single();
      if (error) {
        await sb().storage.from(BUCKET).remove([path]);
        toast.error(`${file.name}: ${errMsg(error)}`);
        continue;
      }
      docs.put(data as OwnDoc);
      ok++;
    }
    setBusy(false);
    if (ok) toast.success(`${ok} file${ok > 1 ? "s" : ""} uploaded`);
    if (input.current) input.current.value = "";
  };

  return (
    <Page>
      <PageHeader
        eyebrow="Trucking One Stop Shop"
        title="Documents"
        actions={
          <>
            {folder === "all" && (
              <Select value={upFolder} onChange={(e) => setUpFolder(e.target.value)} className="w-auto" aria-label="Upload to folder">
                {folders.map((f) => (
                  <option key={f} value={f}>
                    Upload to: {f}
                  </option>
                ))}
              </Select>
            )}
            <input ref={input} type="file" multiple accept={ACCEPT} className="hidden" onChange={(e) => upload(e.target.files)} />
            <Button variant="primary" onClick={() => input.current?.click()} loading={busy}>
              <UploadCloud className="h-4 w-4" /> Upload
            </Button>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
        <Card className="self-start p-2">
          {[["all", "All documents"], ...folders.map((f) => [f, f])].map(([v, label]) => (
            <button
              key={v}
              onClick={() => setFolder(v)}
              className={cn("flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px]", folder === v ? "bg-surface-2 font-medium text-fg" : "text-fg-3 hover:bg-surface-2/60 hover:text-fg")}
            >
              <Folder className="h-4 w-4 shrink-0" />
              <span className="flex-1 truncate">{label}</span>
              <span className="text-[11px] text-fg-4">{v === "all" ? docs.rows.length : docs.rows.filter((d) => d.folder === v).length}</span>
            </button>
          ))}
          {expiring > 0 && <div className="mt-1 px-2.5 py-1 text-xs text-amber-600 dark:text-amber-400">{expiring} expiring within 30 days</div>}
        </Card>

        <div className="min-w-0">
          <div className="relative mb-3">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-4" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a document" className="pl-9" />
          </div>
          {list.length === 0 ? (
            <Card>
              <Empty icon={FileText} title={docs.rows.length ? "No documents match" : "No documents yet"} body={docs.rows.length ? undefined : "Upload TOSS's own agreements, licenses, insurance, tax papers and forms."} />
            </Card>
          ) : (
            <Card>
              <ul className="divide-y divide-line">
                {list.map((d) => (
                  <li key={d.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
                    <FileText className="hidden h-5 w-5 shrink-0 text-fg-4 sm:block" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-medium text-fg">{d.name}</div>
                      <div className="flex flex-wrap gap-x-2 text-xs text-fg-3">
                        <span>{d.folder}</span>
                        <span>· {d.file_name}</span>
                        {d.file_size ? <span>· {fileSize(d.file_size)}</span> : null}
                        <span>
                          · {d.uploaded_by_name || "Someone"}, {fmtDay(d.created_at.slice(0, 10))}
                        </span>
                      </div>
                      <Expiry date={d.expires_on} />
                      {d.notes && <div className="truncate text-xs text-fg-4">{d.notes}</div>}
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button size="icon-sm" variant="ghost" onClick={() => openDocument(d.file_path, d.file_name)} aria-label="Open" title="Open">
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                      <Button size="icon-sm" variant="ghost" onClick={() => openDocument(d.file_path, d.file_name, true)} aria-label="Download" title="Download">
                        <Download className="h-4 w-4" />
                      </Button>
                      <Button size="icon-sm" variant="ghost" onClick={() => setEdit(d)} aria-label="Edit" title="Edit">
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>

      <EditDoc doc={edit} folders={folders} onClose={() => setEdit(null)} put={docs.put} drop={docs.drop} />
    </Page>
  );
}

function EditDoc({ doc, folders, onClose, put, drop }: { doc: OwnDoc | null; folders: string[]; onClose: () => void; put: (d: OwnDoc) => void; drop: (id: string) => void }) {
  const [d, setD] = useState<OwnDoc | null>(null);
  const [newFolder, setNewFolder] = useState("");
  if (doc && d?.id !== doc.id) setD(doc);
  if (!doc && d) setD(null);
  if (!d) return null;
  const save = async () => {
    const folder = newFolder.trim() || d.folder;
    const { data, error } = await sb()
      .from("tms_own_documents")
      .update({ name: d.name.trim() || d.file_name, folder, expires_on: d.expires_on || null, notes: d.notes?.trim() || null })
      .eq("id", d.id)
      .select()
      .single();
    if (error) return toast.error(errMsg(error));
    put(data as OwnDoc);
    setNewFolder("");
    onClose();
  };
  const remove = async () => {
    if (!(await confirmDialog({ title: `Delete ${d.name}?`, body: "The file is removed for everyone.", confirmLabel: "Delete", danger: true }))) return;
    const { error } = await sb().from("tms_own_documents").delete().eq("id", d.id);
    if (error) return toast.error(errMsg(error));
    await sb().storage.from(BUCKET).remove([d.file_path]);
    drop(d.id);
    onClose();
  };
  return (
    <Modal
      open
      onClose={onClose}
      title="Document"
      size="sm"
      footer={
        <>
          <Button variant="danger-ghost" onClick={remove} className="mr-auto">
            <Trash2 className="h-4 w-4" /> Delete
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Name">
          <Input value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Folder">
            <Select value={d.folder} onChange={(e) => setD({ ...d, folder: e.target.value })}>
              {folders.map((f) => (
                <option key={f}>{f}</option>
              ))}
            </Select>
          </Field>
          <Field label="Or a new folder">
            <Input value={newFolder} onChange={(e) => setNewFolder(e.target.value)} placeholder="Folder name" />
          </Field>
        </div>
        <Field label="Expires (optional)">
          <Input type="date" value={d.expires_on || ""} onChange={(e) => setD({ ...d, expires_on: e.target.value || null })} />
        </Field>
        <Field label="Notes">
          <Textarea rows={2} value={d.notes || ""} onChange={(e) => setD({ ...d, notes: e.target.value })} />
        </Field>
      </div>
    </Modal>
  );
}
