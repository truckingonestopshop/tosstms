"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Copy, FileSignature, PenSquare, Plus, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, Empty, Pill, neutralPill } from "@/components/ui/Bits";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { confirmDialog } from "@/components/ui/Confirm";
import { BUCKET, errMsg, sb } from "@/lib/db";
import { useLiveTable } from "@/lib/live";
import { useStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import { cn, relTime } from "@/lib/format";
import { STARTER } from "./written";
import { CATEGORIES, type SignTemplate, type TemplateCategory } from "@/lib/signing";
import { pdfPageSizes } from "./PdfPages";

/** Storage path for a signing PDF (templates and one-off documents). */
export const signingPath = (folder: string, name: string) => `signing/${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${name.normalize("NFKD").replace(/[^\w.\-]+/g, "_").slice(-100)}`;

/** Uploads a PDF for signing; returns where it is and its page sizes. */
export async function uploadSigningPdf(file: File, folder: string) {
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) throw new Error("Pick a PDF file");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const pages = await pdfPageSizes(bytes);
  const path = signingPath(folder, file.name);
  const up = await sb().storage.from(BUCKET).upload(path, file, { contentType: "application/pdf" });
  if (up.error) throw up.error;
  return { path, pages, name: file.name };
}

/** Document types a signed copy can be filed as, for the template's category. */
export function useFileAs(category: TemplateCategory) {
  const { docTypes } = useStore();
  const scope = category === "driver" ? "driver" : "company";
  return docTypes.filter((t) => t.scope === scope || t.scope === "any");
}

export function TemplatesList() {
  const router = useRouter();
  const templates = useLiveTable<SignTemplate>("tms_sign_templates", { order: "updated_at" });
  const [creating, setCreating] = useState(false);
  const [cat, setCat] = useState<TemplateCategory | "all">("all");
  const list = templates.rows.filter((t) => cat === "all" || t.category === cat);

  const duplicate = async (t: SignTemplate) => {
    const { id: _id, created_at: _c, updated_at: _u, ...rest } = t;
    void _id;
    void _c;
    void _u;
    const { data, error } = await sb().from("tms_sign_templates").insert({ ...rest, name: `${t.name} (copy)` }).select().single();
    if (error) return toast.error(errMsg(error));
    templates.put(data as SignTemplate);
    toast.success("Template copied");
  };
  const remove = async (t: SignTemplate) => {
    if (!(await confirmDialog({ title: `Delete ${t.name}?`, body: "Documents already sent with it keep their own copy.", confirmLabel: "Delete", danger: true }))) return;
    const { error } = await sb().from("tms_sign_templates").delete().eq("id", t.id);
    if (error) return toast.error(errMsg(error));
    templates.drop(t.id);
  };

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Select value={cat} onChange={(e) => setCat(e.target.value as TemplateCategory | "all")} className="w-auto" aria-label="Category">
          <option value="all">All templates</option>
          {CATEGORIES.map((c) => (
            <option key={c.v} value={c.v}>
              {c.label}
            </option>
          ))}
        </Select>
        <div className="flex-1" />
        <Button variant="primary" onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" /> New template
        </Button>
      </div>
      <Card>
        {!templates.loaded ? (
          <div className="px-4 py-8 text-center text-xs text-fg-4">Loading…</div>
        ) : list.length === 0 ? (
          <Empty icon={FileSignature} title="No templates yet" body="Upload a PDF (W-9, agreement, employment application, policy…), place the fields and who fills each one. Then send it from any company, DER or driver." />
        ) : (
          <ul className="divide-y divide-line">
            {list.map((t) => (
              <li key={t.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                <Link href={`/signing/templates/${t.id}`} className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-semibold text-fg">{t.name}</div>
                  <div className="truncate text-xs text-fg-3">
                    {t.kind === "written" ? "Written" : `PDF, ${t.pages.length} page${t.pages.length === 1 ? "" : "s"}`} · {t.fields.length} field{t.fields.length === 1 ? "" : "s"} · {t.roles.map((r) => r.label).join(", ")} · edited {relTime(t.updated_at)}
                  </div>
                </Link>
                <Pill className={neutralPill}>{CATEGORIES.find((c) => c.v === t.category)?.label}</Pill>
                <button onClick={() => duplicate(t)} className="text-fg-4 hover:text-fg" aria-label={`Copy ${t.name}`}>
                  <Copy className="h-4 w-4" />
                </button>
                <button onClick={() => remove(t)} className="text-fg-4 hover:text-red-600" aria-label={`Delete ${t.name}`}>
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <NewTemplateModal
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(t) => {
          templates.put(t);
          router.push(`/signing/templates/${t.id}`);
        }}
      />
    </>
  );
}

function NewTemplateModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (t: SignTemplate) => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<TemplateCategory>("company");
  const [docType, setDocType] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [kind, setKind] = useState<"written" | "pdf">("written");
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const fileAs = useFileAs(category);

  const create = async () => {
    if (kind === "pdf" && !file) return toast.error("Pick the PDF");
    if (!name.trim()) return toast.error("Name the template");
    setBusy(true);
    try {
      const roles = [{ key: category === "driver" ? "driver" : category === "der" ? "der" : "signer", label: category === "driver" ? "Driver" : category === "der" ? "DER" : "Signer" }];
      const base = { name: name.trim(), description: description.trim() || null, category, doc_type: docType || null, roles, fields: [] };
      const up = kind === "pdf" && file ? await uploadSigningPdf(file, "templates") : null;
      const row: Record<string, unknown> = up ? { ...base, kind: "pdf", file_path: up.path, file_name: up.name, pages: up.pages } : { ...base, kind: "written", body: STARTER.replace("Document title", name.trim().replace(/[<>&]/g, "")), pages: [] };
      const { data, error } = await sb().from("tms_sign_templates").insert(row).select().single();
      if (error) {
        if (up) await sb().storage.from(BUCKET).remove([up.path]);
        throw error;
      }
      setName("");
      setDescription("");
      setFile(null);
      onCreated(data as SignTemplate);
    } catch (e) {
      toast.error(errMsg(e));
    }
    setBusy(false);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New template"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={create} disabled={busy}>
            {kind === "written" ? "Continue: write it" : "Continue: place fields"}
          </Button>
        </>
      }
    >
      <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {(
          [
            { v: "written", icon: PenSquare, title: "Write it here", body: "Type the document with your letterhead, values that fill themselves and signature fields." },
            { v: "pdf", icon: Upload, title: "Upload a PDF", body: "Use a PDF you already have (W-9, an application form) and place the fields on it." },
          ] as const
        ).map((o) => (
          <button key={o.v} onClick={() => setKind(o.v)} className={cn("rounded-xl border p-3 text-left", kind === o.v ? "border-brand bg-brand/5" : "border-line hover:bg-surface-2/60")}>
            <o.icon className="mb-1.5 h-5 w-5 text-fg-2" />
            <div className="text-[13px] font-semibold text-fg">{o.title}</div>
            <div className="text-xs text-fg-3">{o.body}</div>
          </button>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {kind === "pdf" && (
          <Field label="PDF" required className="sm:col-span-2">
            <input ref={input} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            <Button variant="outline" onClick={() => input.current?.click()} className="w-full justify-start">
              <Upload className="h-4 w-4" /> {file ? file.name : "Choose a PDF"}
            </Button>
          </Field>
        )}
        <Field label="Name" required className="sm:col-span-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Freight Dispatch Agreement" />
        </Field>
        <Field label="Sent from" hint={CATEGORIES.find((c) => c.v === category)?.hint}>
          <Select value={category} onChange={(e) => setCategory(e.target.value as TemplateCategory)}>
            {CATEGORIES.map((c) => (
              <option key={c.v} value={c.v}>
                {c.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="File the signed copy as">
          <Select value={docType} onChange={(e) => setDocType(e.target.value)}>
            <option value="">Other</option>
            {fileAs.map((t) => (
              <option key={t.key} value={t.key}>
                {t.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Description" className="sm:col-span-2">
          <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
