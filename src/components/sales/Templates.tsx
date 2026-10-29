"use client";

import { useRef, useState } from "react";
import { Copy, FileSignature, Paperclip, Plus, Printer, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, Empty, Pill, neutralPill } from "@/components/ui/Bits";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { confirmDialog } from "@/components/ui/Confirm";
import { BUCKET, errMsg, openDocument, sb } from "@/lib/db";
import { useStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import { fmtDay } from "@/lib/format";
import { SERVICES, serviceLabel } from "@/lib/services";
import { PLACEHOLDERS, TEMPLATE_KINDS, fillTemplate, type Template, type TemplateKind } from "@/lib/sales";
import type { ChargeService } from "@/lib/billing";
import type { Company, ServiceKey } from "@/lib/types";

const svcLabel = (s: ChargeService) => (s === "other" ? "General" : serviceLabel(s as ServiceKey));
const kindLabel = (k: TemplateKind) => TEMPLATE_KINDS.find((x) => x.v === k)?.label ?? k;

/** Agreements and templates; fill one for a company (copy or print to PDF). */
export function Templates({ templates, put, drop }: { templates: Template[]; put: (t: Template) => void; drop: (id: string) => void }) {
  const [edit, setEdit] = useState<Template | "new" | null>(null);
  const [use, setUse] = useState<Template | null>(null);
  const [kind, setKind] = useState<TemplateKind | "all">("all");
  const list = templates.filter((t) => kind === "all" || t.kind === kind).sort((a, b) => a.name.localeCompare(b.name));
  return (
    <>
      <div className="mb-3 flex items-center gap-2">
        <Select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} className="w-auto">
          <option value="all">All kinds</option>
          {TEMPLATE_KINDS.map((k) => (
            <option key={k.v} value={k.v}>
              {k.label}s
            </option>
          ))}
        </Select>
        <Button variant="primary" className="ml-auto" onClick={() => setEdit("new")}>
          <Plus className="h-4 w-4" /> New template
        </Button>
      </div>
      {list.length === 0 ? (
        <Card>
          <Empty icon={FileSignature} title="No templates yet" body="Add your dispatch agreement, service agreements, letters or emails. Use {{company_name}}, {{dot_number}}… and fill them for any company." />
        </Card>
      ) : (
        <Card>
          <ul className="divide-y divide-line">
            {list.map((t) => (
              <li key={t.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:px-5">
                <button onClick={() => setEdit(t)} className="min-w-0 flex-1 text-left">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-[13px] font-semibold text-fg">{t.name}</span>
                    <Pill className={neutralPill}>{kindLabel(t.kind)}</Pill>
                    <span className="text-xs text-fg-4">{svcLabel(t.service)}</span>
                  </div>
                  <div className="truncate text-xs text-fg-3">
                    {t.body ? `${t.body.slice(0, 120)}${t.body.length > 120 ? "…" : ""}` : "No text"}
                    {t.file_name ? ` · file: ${t.file_name}` : ""}
                  </div>
                  <div className="text-[11px] text-fg-4">Updated {fmtDay(t.updated_at.slice(0, 10))}</div>
                </button>
                <div className="flex shrink-0 gap-1.5">
                  {t.file_path && (
                    <Button size="sm" variant="ghost" onClick={() => openDocument(t.file_path!, t.file_name || undefined)}>
                      <Paperclip className="h-3.5 w-3.5" /> File
                    </Button>
                  )}
                  {t.body && (
                    <Button size="sm" variant="outline" onClick={() => setUse(t)}>
                      Fill for a company
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <TemplateModal value={edit} onClose={() => setEdit(null)} put={put} drop={drop} />
      <FillModal template={use} onClose={() => setUse(null)} />
    </>
  );
}

type Draft = Pick<Template, "name" | "kind" | "service" | "body" | "file_path" | "file_name">;
const blank: Draft = { name: "", kind: "agreement", service: "dispatch", body: "", file_path: null, file_name: null };

function TemplateModal({ value, onClose, put, drop }: { value: Template | "new" | null; onClose: () => void; put: (t: Template) => void; drop: (id: string) => void }) {
  const [d, setD] = useState<Draft>(blank);
  const [opened, setOpened] = useState("");
  const [saving, setSaving] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const body = useRef<HTMLTextAreaElement>(null);
  const editing = value && value !== "new" ? value : null;
  const key = value === "new" ? "new" : value?.id ?? "";
  if (value !== null && opened !== key) {
    setOpened(key);
    setD(editing ? { name: editing.name, kind: editing.kind, service: editing.service, body: editing.body, file_path: editing.file_path, file_name: editing.file_name } : blank);
    setFile(null);
  }
  if (value === null && opened) setOpened("");
  const set = (p: Partial<Draft>) => setD((x) => ({ ...x, ...p }));

  const insert = (k: string) => {
    const el = body.current;
    const tag = `{{${k}}}`;
    if (!el) return set({ body: d.body + tag });
    const at = el.selectionStart ?? d.body.length;
    set({ body: d.body.slice(0, at) + tag + d.body.slice(el.selectionEnd ?? at) });
  };

  const save = async () => {
    if (!d.name.trim()) return toast.error("Give the template a name");
    setSaving(true);
    let row: Draft = { ...d, name: d.name.trim() };
    if (file) {
      const path = `templates/${crypto.randomUUID()}/${file.name.replace(/[^\w.\- ]+/g, "_")}`;
      const up = await sb().storage.from(BUCKET).upload(path, file, { upsert: false, contentType: file.type || undefined });
      if (up.error) {
        setSaving(false);
        return toast.error(errMsg(up.error));
      }
      if (editing?.file_path) await sb().storage.from(BUCKET).remove([editing.file_path]);
      row = { ...row, file_path: path, file_name: file.name };
    }
    const res = editing ? await sb().from("tms_templates").update(row).eq("id", editing.id).select().single() : await sb().from("tms_templates").insert(row).select().single();
    setSaving(false);
    if (res.error) return toast.error(errMsg(res.error));
    put(res.data as Template);
    toast.success("Template saved");
    onClose();
  };
  const remove = async () => {
    if (!editing) return;
    if (!(await confirmDialog({ title: `Delete ${editing.name}?`, confirmLabel: "Delete", danger: true }))) return;
    const { error } = await sb().from("tms_templates").delete().eq("id", editing.id);
    if (error) return toast.error(errMsg(error));
    if (editing.file_path) await sb().storage.from(BUCKET).remove([editing.file_path]);
    drop(editing.id);
    onClose();
  };

  return (
    <Modal
      open={value !== null}
      onClose={onClose}
      title={editing ? "Template" : "New template"}
      size="lg"
      footer={
        <>
          {editing && (
            <Button variant="danger-ghost" onClick={remove} className="mr-auto">
              <Trash2 className="h-4 w-4" /> Delete
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} disabled={saving}>
            Save
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="Name" required className="sm:col-span-3">
          <Input value={d.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Dispatch Service Agreement" />
        </Field>
        <Field label="Kind">
          <Select value={d.kind} onChange={(e) => set({ kind: e.target.value as TemplateKind })}>
            {TEMPLATE_KINDS.map((k) => (
              <option key={k.v} value={k.v}>
                {k.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Service">
          <Select value={d.service} onChange={(e) => set({ service: e.target.value as ChargeService })}>
            {SERVICES.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
            <option value="other">General</option>
          </Select>
        </Field>
        <Field label="File (optional)" hint="A signed PDF / Word version">
          <input ref={fileRef} type="file" className="hidden" accept=".pdf,.doc,.docx,.odt,.txt,.png,.jpg,.jpeg" onChange={(e) => setFile(e.target.files?.[0] || null)} />
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
              <Paperclip className="h-3.5 w-3.5" /> {file || d.file_name ? "Replace" : "Attach"}
            </Button>
            <span className="min-w-0 truncate text-xs text-fg-3">{file?.name || d.file_name || ""}</span>
            {(file || d.file_name) && (
              <button
                type="button"
                onClick={() => {
                  setFile(null);
                  set({ file_path: null, file_name: null });
                }}
                className="text-fg-4 hover:text-fg"
                aria-label="Remove file"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </Field>
        <Field label="Text" className="sm:col-span-3" hint="Click a field below to insert it where the cursor is.">
          <Textarea ref={body} rows={12} value={d.body} onChange={(e) => set({ body: e.target.value })} placeholder="This Dispatch Service Agreement is made on {{date}} between Trucking One Stop Shop and {{company_name}} (USDOT {{dot_number}})…" />
        </Field>
        <div className="flex flex-wrap gap-1.5 sm:col-span-3">
          {PLACEHOLDERS.map((p) => (
            <button key={p.key} type="button" onClick={() => insert(p.key)} className="rounded-full border border-line px-2 py-0.5 text-[11px] text-fg-2 hover:bg-surface-2" title={`{{${p.key}}}`}>
              {p.label}
            </button>
          ))}
        </div>
      </div>
    </Modal>
  );
}

/** The template filled with a company's details: copy, or print / save as PDF. */
function FillModal({ template, onClose }: { template: Template | null; onClose: () => void }) {
  const { companies, scopedCompany } = useStore();
  const [companyId, setCompanyId] = useState("");
  const company: Company | undefined = companies.find((c) => c.id === (companyId || scopedCompany?.id));
  const text = template ? fillTemplate(template.body, company) : "";
  const print = () => {
    const w = window.open("", "_blank");
    if (!w) return;
    const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
    w.document.write(
      `<!doctype html><title>${esc(template?.name || "Agreement")}</title><body style="font:14px/1.6 Georgia,serif;max-width:720px;margin:48px auto;padding:0 24px;white-space:pre-wrap">${esc(text)}</body>`,
    );
    w.document.close();
    w.focus();
    w.print();
  };
  return (
    <Modal
      open={!!template}
      onClose={onClose}
      title={template?.name || ""}
      subtitle="Filled with the company's details"
      size="lg"
      footer={
        <>
          <Button
            variant="outline"
            onClick={() => {
              navigator.clipboard.writeText(text);
              toast.success("Copied");
            }}
            disabled={!company}
          >
            <Copy className="h-4 w-4" /> Copy
          </Button>
          <Button variant="primary" onClick={print} disabled={!company}>
            <Printer className="h-4 w-4" /> Print / PDF
          </Button>
        </>
      }
    >
      <Field label="Company">
        <Select value={companyId || scopedCompany?.id || ""} onChange={(e) => setCompanyId(e.target.value)}>
          <option value="">Select…</option>
          {[...companies]
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
        </Select>
      </Field>
      <div className="mt-3 max-h-[55dvh] overflow-y-auto whitespace-pre-wrap rounded-lg border border-line bg-surface-2/50 p-4 text-[13px] leading-relaxed text-fg">
        {company ? text : <span className="text-fg-4">Pick a company to fill in its details.</span>}
      </div>
      {company && text.includes("____") && <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">Blanks (____) are details this company doesn&apos;t have yet.</p>}
    </Modal>
  );
}
