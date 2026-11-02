"use client";

import { useState } from "react";
import { Check, Copy, Link2, Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Checkbox, Field, Input, Select } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { BUCKET, errMsg, sb } from "@/lib/db";
import { useLiveTable } from "@/lib/live";
import { useStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import { relTime } from "@/lib/format";
import { TOSS, autoValue, isEmpty, type SignTemplate } from "@/lib/signing";
import { renderWritten } from "./written";
import { signingPath } from "./Templates";

interface SignLink {
  id: string;
  token: string;
  title: string;
  template_id: string | null;
  company_id: string | null;
  verify_email: boolean;
  active: boolean;
  uses: number;
  created_at: string;
}

const urlOf = (token: string) => `${window.location.origin}/sign/t/${token}`;

/**
 * Public links of a template (like DocuSign PowerForms): post the link (website, text, QR) and
 * anyone fills and signs their own copy, e.g. a driver application filed on the carrier. The
 * template must have one signer; TOSS's fields are filled now from the carrier.
 */
export function PublicLinks({ template, onClose }: { template: SignTemplate | null; onClose: () => void }) {
  const { companies, companyById } = useStore();
  const links = useLiveTable<SignLink>("tms_sign_links");
  const [company, setCompany] = useState("");
  const [title, setTitle] = useState("");
  const [verify, setVerify] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState("");
  const [was, setWas] = useState<string | null>(null);
  if ((template?.id || null) !== was) {
    setWas(template?.id || null);
    setTitle(template?.name || "");
    setCompany("");
    setVerify(false);
  }
  if (!template) return null;
  const mine = links.rows.filter((l) => l.template_id === template.id);

  const create = async () => {
    const signerRoles = template.roles.filter((r) => template.fields.some((f) => f.role === r.key));
    if (signerRoles.length !== 1) return toast.error("A public link needs a template with exactly one signer");
    const c = companyById(company) || null;
    const src = { company: c };
    setBusy(true);
    try {
      let file = { path: template.file_path || "", name: template.file_name || `${template.name}.pdf`, pages: template.pages, fields: template.fields };
      const values: Record<string, string> = {};
      if (template.kind === "written") {
        // The written document becomes its PDF now, with the carrier's values in it.
        const out = await renderWritten(template.body || "", { merge: (k) => (k.startsWith("recipient.") ? "" : autoValue(k, src)), toss: {} });
        const name = `${template.name.replace(/[\\/:*?"<>|]+/g, "_")}.pdf`;
        const path = signingPath("links", name);
        const up = await sb().storage.from(BUCKET).upload(path, new Blob([out.bytes.slice().buffer], { type: "application/pdf" }), { contentType: "application/pdf" });
        if (up.error) throw up.error;
        file = { path, name, pages: out.pages, fields: out.fields };
      } else {
        for (const f of template.fields) if (f.role === TOSS && f.auto && !f.auto.startsWith("recipient.")) values[f.id] = autoValue(f.auto, src);
        const missing = template.fields.find((f) => f.role === TOSS && f.required && isEmpty(f, values[f.id]));
        if (missing) throw new Error(`"${missing.label}" is filled by TOSS and can't be filled for a public link. Make it the signer's, or send the document instead.`);
      }
      const { data, error } = await sb()
        .from("tms_sign_links")
        .insert({ title: title.trim() || template.name, template_id: template.id, company_id: c?.id || null, doc_type: template.doc_type, file_path: file.path, file_name: file.name, pages: file.pages, roles: signerRoles, fields: file.fields, values, verify_email: verify })
        .select()
        .single();
      if (error) throw error;
      links.put(data as SignLink);
      await navigator.clipboard.writeText(urlOf((data as SignLink).token)).catch(() => {});
      toast.success("Public link made and copied");
    } catch (e) {
      toast.error(errMsg(e));
    }
    setBusy(false);
  };
  const toggle = async (l: SignLink) => {
    const { data, error } = await sb().from("tms_sign_links").update({ active: !l.active }).eq("id", l.id).select().single();
    if (error) return toast.error(errMsg(error));
    links.put(data as SignLink);
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title="Public links"
      subtitle={template.name}
      footer={
        <Button variant="primary" onClick={onClose}>
          Done
        </Button>
      }
    >
      <p className="mb-3 text-sm text-fg-3">Anyone with the link fills in and signs their own copy (they type their name and email first). Post it on a website, text it, or print it as a QR code. Each copy is filed on the carrier you pick.</p>
      <div className="grid grid-cols-1 gap-3 rounded-xl border border-line p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <Field label="Title">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Driver application" />
        </Field>
        <Field label="File the signed copies on">
          <Select value={company} onChange={(e) => setCompany(e.target.value)}>
            <option value="">TOSS (no carrier)</option>
            {[...companies]
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </Select>
        </Field>
        <Button variant="primary" onClick={create} disabled={busy}>
          <Plus className="h-4 w-4" /> Make link
        </Button>
        <Checkbox checked={verify} onChange={setVerify} label="Confirm their email with a one-time code" className="sm:col-span-3" />
      </div>

      <ul className="mt-4 space-y-2">
        {mine.length === 0 && <li className="text-xs text-fg-4">No public links for this template yet.</li>}
        {mine.map((l) => (
          <li key={l.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-line p-3">
            <Link2 className="h-4 w-4 text-fg-4" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-semibold text-fg">{l.title}</div>
              <div className="truncate text-xs text-fg-3">
                {companyById(l.company_id)?.name || "TOSS"} · used {l.uses} time{l.uses === 1 ? "" : "s"} · {relTime(l.created_at)}
                {l.verify_email ? " · email code" : ""}
              </div>
            </div>
            <Button
              size="xs"
              variant="outline"
              disabled={!l.active}
              onClick={async () => {
                await navigator.clipboard.writeText(urlOf(l.token));
                setCopied(l.id);
              }}
            >
              {copied === l.id ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {copied === l.id ? "Copied" : "Copy link"}
            </Button>
            <Checkbox checked={l.active} onChange={() => toggle(l)} label="On" className="text-xs" />
          </li>
        ))}
      </ul>
    </Modal>
  );
}

/** Every public link (TossSign → Public links): copy, turn on / off, see how often it's used. */
export function AllLinks() {
  const { companyById } = useStore();
  const links = useLiveTable<SignLink>("tms_sign_links");
  const templates = useLiveTable<SignTemplate>("tms_sign_templates");
  const [copied, setCopied] = useState("");
  const toggle = async (l: SignLink) => {
    const { data, error } = await sb().from("tms_sign_links").update({ active: !l.active }).eq("id", l.id).select().single();
    if (error) return toast.error(errMsg(error));
    links.put(data as SignLink);
  };
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface">
      <div className="border-b border-line px-4 py-3 sm:px-5">
        <div className="text-[14px] font-semibold text-fg">Public links</div>
        <div className="text-xs text-fg-3">Anyone with a link fills and signs their own copy. Make links from a template (the link icon on its card).</div>
      </div>
      {links.rows.length === 0 ? (
        <div className="px-4 py-10 text-center text-sm text-fg-4">No public links yet.</div>
      ) : (
        <ul className="divide-y divide-line">
          {links.rows.map((l) => (
            <li key={l.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface-2 text-fg-3">
                <Link2 className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-semibold text-fg">{l.title}</div>
                <div className="truncate text-xs text-fg-3">
                  {templates.rows.find((t) => t.id === l.template_id)?.name || "Template removed"} · filed on {companyById(l.company_id)?.name || "TOSS"} · used {l.uses} time{l.uses === 1 ? "" : "s"}
                  {l.verify_email ? " · email code" : ""}
                </div>
              </div>
              <Button
                size="xs"
                variant="outline"
                disabled={!l.active}
                onClick={async () => {
                  await navigator.clipboard.writeText(urlOf(l.token));
                  setCopied(l.id);
                }}
              >
                {copied === l.id ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {copied === l.id ? "Copied" : "Copy link"}
              </Button>
              <Checkbox checked={l.active} onChange={() => toggle(l)} label={l.active ? "On" : "Off"} className="text-xs" />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}