"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useRef, useState } from "react";
import { BookOpen, Copy, FileSignature, Link2, PenSquare, Plus, Search, Send, Trash2, Upload } from "lucide-react";
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
import { STARTER, fieldsFromBody } from "./written";
import { STARTERS, type Starter } from "./library";
import { SendDialog } from "./SendDialog";
import { PublicLinks } from "./PublicLinks";
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
  const params = useSearchParams();
  const templates = useLiveTable<SignTemplate>("tms_sign_templates", { order: "updated_at" });
  const [creating, setCreating] = useState<"written" | "pdf" | null>(() => (params.get("new") === "pdf" ? "pdf" : params.get("new") === "written" ? "written" : null));
  const [library, setLibrary] = useState(() => params.get("library") === "1");
  const [linking, setLinking] = useState<SignTemplate | null>(null);
  const [sending, setSending] = useState<SignTemplate | null>(null);
  const [cat, setCat] = useState<TemplateCategory | "all">("all");
  const [q, setQ] = useState("");
  const list = templates.rows.filter((t) => (cat === "all" || t.category === cat) && (!q || `${t.name} ${t.description || ""}`.toLowerCase().includes(q.toLowerCase())));

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
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="scrollbar-bold -mx-1 flex gap-1 overflow-x-auto pb-1">
          {[{ v: "all" as const, label: "All" }, ...CATEGORIES].map((c) => (
            <button key={c.v} onClick={() => setCat(c.v)} className={cn("flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-[13px] font-medium", cat === c.v ? "border-transparent bg-inverse text-inverse-fg" : "border-line text-fg-3 hover:text-fg")}>
              {c.label}
              <span className="tnum text-[11px] opacity-70">{templates.rows.filter((t) => c.v === "all" || t.category === c.v).length}</span>
            </button>
          ))}
        </div>
        <div className="flex flex-1 flex-wrap items-center gap-2 lg:justify-end">
          <div className="relative min-w-[180px] flex-1 lg:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-4" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a template" className="h-9 pl-9" />
          </div>
          <Button variant="outline" className="h-9" onClick={() => setLibrary(true)}>
            <BookOpen className="h-4 w-4" /> Library
          </Button>
          <Button variant="primary" className="h-9" onClick={() => setCreating("written")}>
            <Plus className="h-4 w-4" /> New template
          </Button>
        </div>
      </div>

      {!templates.loaded ? (
        <div className="py-10 text-center text-xs text-fg-4">Loading…</div>
      ) : list.length === 0 ? (
        <Card>
          <Empty icon={FileSignature} title={templates.rows.length ? "No template matches" : "No templates yet"} body={templates.rows.length ? undefined : "Write one, upload a PDF, or start from the library (dispatch agreement, driver application, policies, Clearinghouse consent, DER)."} />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {list.map((t) => {
            const ready = t.fields.some((f) => f.role !== "toss");
            return (
              <div key={t.id} className="group flex flex-col overflow-hidden rounded-2xl border border-line bg-surface transition-colors hover:border-line-strong">
                <Link href={`/signing/templates/${t.id}`} className="relative block h-28 overflow-hidden bg-gradient-to-br from-surface-2 to-surface">
                  {/* A small paper preview: lines and the fields' colours */}
                  <div className="absolute left-1/2 top-4 h-32 w-24 -translate-x-1/2 rounded-sm bg-white shadow-md ring-1 ring-black/5 transition-transform group-hover:-translate-y-1">
                    <div className="space-y-1.5 p-2.5">
                      <div className="h-1.5 w-12 rounded bg-zinc-300" />
                      {[16, 14, 18, 12, 15].map((w, i) => (
                        <div key={i} className="h-1 rounded bg-zinc-200" style={{ width: `${w * 4}px` }} />
                      ))}
                      <div className="mt-2 h-3 w-14 rounded-sm border border-dashed border-sky-500 bg-sky-500/10" />
                    </div>
                  </div>
                  <span className="absolute left-3 top-3">
                    <Pill className={neutralPill}>{t.kind === "written" ? "Written" : "PDF"}</Pill>
                  </span>
                </Link>
                <div className="flex flex-1 flex-col p-3.5">
                  <Link href={`/signing/templates/${t.id}`} className="truncate text-[14px] font-semibold text-fg hover:underline">
                    {t.name}
                  </Link>
                  <div className="mt-0.5 line-clamp-2 min-h-[2rem] text-xs text-fg-3">{t.description || `${t.roles.map((r) => r.label).join(", ")} · ${t.fields.length} field${t.fields.length === 1 ? "" : "s"}`}</div>
                  <div className="mt-2 flex items-center gap-1.5 text-[11px] text-fg-4">
                    <span className="rounded-full bg-surface-2 px-2 py-0.5 text-fg-3">{CATEGORIES.find((c) => c.v === t.category)?.label}</span>
                    <span>edited {relTime(t.updated_at)}</span>
                  </div>
                  <div className="mt-3 flex items-center gap-1 border-t border-line pt-2.5">
                    <Button size="xs" variant="secondary" onClick={() => (ready ? setSending(t) : toast.error("Add a field for a signer first"))}>
                      <Send className="h-3.5 w-3.5" /> Send
                    </Button>
                    <button onClick={() => (ready ? setLinking(t) : toast.error("Add a field for a signer first"))} className="rounded p-1.5 text-fg-4 hover:bg-surface-2 hover:text-fg" title="Public link (anyone fills and signs)" aria-label={`Public links of ${t.name}`}>
                      <Link2 className="h-4 w-4" />
                    </button>
                    <button onClick={() => duplicate(t)} className="rounded p-1.5 text-fg-4 hover:bg-surface-2 hover:text-fg" title="Duplicate" aria-label={`Copy ${t.name}`}>
                      <Copy className="h-4 w-4" />
                    </button>
                    <button onClick={() => remove(t)} className="ml-auto rounded p-1.5 text-fg-4 hover:bg-surface-2 hover:text-red-600" title="Delete" aria-label={`Delete ${t.name}`}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <PublicLinks template={linking} onClose={() => setLinking(null)} />
      <SendTemplate template={sending} onClose={() => setSending(null)} />
      <Library
        open={library}
        onClose={() => setLibrary(false)}
        have={templates.rows.map((t) => t.name)}
        onAdded={(t) => {
          templates.put(t);
          router.push(`/signing/templates/${t.id}`);
        }}
      />
      <NewTemplateModal
        open={!!creating}
        initialKind={creating || "written"}
        onClose={() => setCreating(null)}
        onCreated={(t) => {
          templates.put(t);
          router.push(`/signing/templates/${t.id}`);
        }}
      />
    </>
  );
}

/** Send a template from the gallery: pick the company, then the usual send screen with it chosen. */
function SendTemplate({ template, onClose }: { template: SignTemplate | null; onClose: () => void }) {
  const { companies } = useStore();
  const [company, setCompany] = useState("");
  const [q, setQ] = useState("");
  const [was, setWas] = useState<string | null>(null);
  if ((template?.id || null) !== was) {
    setWas(template?.id || null);
    setCompany("");
    setQ("");
  }
  if (!template) return null;
  if (company) return <SendDialog open onClose={onClose} companyId={company} category={template.category} startWith={template} />;
  const list = [...companies].sort((a, b) => a.name.localeCompare(b.name)).filter((c) => !q || `${c.name} ${c.dot_number || ""}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <Modal open onClose={onClose} title={`Send ${template.name}`} subtitle="For which company?" size="sm">
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or DOT" autoFocus />
      <ul className="scrollbar-bold mt-2 max-h-72 divide-y divide-line overflow-y-auto rounded-lg border border-line">
        {list.map((c) => (
          <li key={c.id}>
            <button onClick={() => setCompany(c.id)} className="flex w-full items-center justify-between px-3 py-2 text-left text-[13px] hover:bg-surface-2">
              <span className="truncate font-medium text-fg">{c.name}</span>
              <span className="text-xs text-fg-4">{c.dot_number ? `DOT ${c.dot_number}` : ""}</span>
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}

/** TossSign's starter templates, added in one click (then edited like any other). */
function Library({ open, onClose, have, onAdded }: { open: boolean; onClose: () => void; have: string[]; onAdded: (t: SignTemplate) => void }) {
  const [busy, setBusy] = useState("");
  const add = async (s: Starter) => {
    setBusy(s.key);
    const body = s.body();
    const { data, error } = await sb()
      .from("tms_sign_templates")
      .insert({ name: s.name, description: s.description, category: s.category, doc_type: s.doc_type, kind: "written", letterhead: true, body, roles: s.roles, fields: fieldsFromBody(body), pages: [] })
      .select()
      .single();
    setBusy("");
    if (error) return toast.error(errMsg(error));
    toast.success(`${s.name} added: review the wording, then send it`);
    onAdded(data as SignTemplate);
  };
  return (
    <Modal open={open} onClose={onClose} size="lg" title="Template library" subtitle="Starting points written for TOSS. Add one, review the wording for your needs, and send.">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {STARTERS.map((s) => (
          <div key={s.key} className="flex flex-col rounded-xl border border-line p-3.5">
            <div className="flex items-start justify-between gap-2">
              <div className="text-[13px] font-semibold text-fg">{s.name}</div>
              <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-fg-3">{CATEGORIES.find((c) => c.v === s.category)?.label}</span>
            </div>
            <p className="mt-1 flex-1 text-xs text-fg-3">{s.description}</p>
            <div className="mt-3 flex items-center justify-between">
              <span className="text-[11px] text-fg-4">Signed by: {s.roles.map((r) => r.label).join(", ")}</span>
              <Button size="xs" variant={have.includes(s.name) ? "ghost" : "primary"} onClick={() => add(s)} disabled={!!busy}>
                <Plus className="h-3.5 w-3.5" /> {have.includes(s.name) ? "Add again" : "Add"}
              </Button>
            </div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-fg-4">These are plain-language starting points, not legal advice. Have them checked before you rely on them.</p>
    </Modal>
  );
}

function NewTemplateModal({ open, initialKind = "written", onClose, onCreated }: { open: boolean; initialKind?: "written" | "pdf"; onClose: () => void; onCreated: (t: SignTemplate) => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<TemplateCategory>("company");
  const [docType, setDocType] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [kind, setKind] = useState<"written" | "pdf">(initialKind);
  const [was, setWas] = useState(false);
  if (open !== was) {
    setWas(open);
    if (open) setKind(initialKind);
  }
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
      const row: Record<string, unknown> = up ? { ...base, kind: "pdf", file_path: up.path, file_name: up.name, pages: up.pages } : { ...base, kind: "written", letterhead: true, body: STARTER.replace("Document title", name.trim().replace(/[<>&]/g, "")), pages: [] };
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
