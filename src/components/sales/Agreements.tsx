"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { Copy, FileSignature, FileText, Paperclip, Plus, Printer, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, Empty, Pill } from "@/components/ui/Bits";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { confirmDialog } from "@/components/ui/Confirm";
import { BUCKET, errMsg, openDocument, sb } from "@/lib/db";
import { useStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import { cn, fmtDay } from "@/lib/format";
import { AGREEMENT_STATUSES, fillTemplate, oppNumber, type Agreement, type AgreementStatus, type Opportunity } from "@/lib/sales";
import { useSales } from "./SalesProvider";

// Agreements: a template filled for a company (and its opportunity with the products), then
// draft → sent → signed (with the signed copy attached) or void. "Create invoice" bills it.

const statusOf = (s: AgreementStatus) => AGREEMENT_STATUSES.find((x) => x.v === s) ?? AGREEMENT_STATUSES[0];

export function printText(title: string, text: string) {
  const w = window.open("", "_blank");
  if (!w) return;
  const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
  w.document.write(`<!doctype html><title>${esc(title)}</title><body style="font:14px/1.6 Georgia,serif;max-width:720px;margin:48px auto;padding:0 24px;white-space:pre-wrap">${esc(text)}</body>`);
  w.document.close();
  w.focus();
  w.print();
}

/** Every agreement (Templates & Agreements tab). */
export function AgreementsList() {
  const { agreements, opps } = useSales();
  const { companyById, inScope } = useStore();
  const [status, setStatus] = useState<AgreementStatus | "all">("all");
  const [open, setOpen] = useState<Agreement | "new" | null>(null);
  const list = agreements.rows.filter((a) => (!a.company_id || inScope(a.company_id)) && (status === "all" || a.status === status));
  return (
    <Card>
      <CardHeader
        title="Agreements"
        subtitle={`${agreements.rows.filter((a) => a.status === "sent").length} waiting for signature`}
        actions={
          <>
            <Select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className="h-8 w-auto text-[13px]" aria-label="Status">
              <option value="all">All</option>
              {AGREEMENT_STATUSES.map((s) => (
                <option key={s.v} value={s.v}>
                  {s.label}
                </option>
              ))}
            </Select>
            <Button size="sm" variant="outline" onClick={() => setOpen("new")}>
              <Plus className="h-4 w-4" /> New agreement
            </Button>
          </>
        }
      />
      {list.length === 0 ? (
        <Empty icon={FileSignature} title="No agreements yet" body="Make one from a template for a company or an opportunity, then mark it sent and signed." />
      ) : (
        <ul className="divide-y divide-line">
          {list.map((a) => {
            const o = opps.rows.find((x) => x.id === a.opportunity_id);
            const st = statusOf(a.status);
            return (
              <li key={a.id}>
                <button type="button" onClick={() => setOpen(a)} className="flex w-full flex-wrap items-center gap-2 px-4 py-2.5 text-left hover:bg-surface-2/50 sm:px-5">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-medium text-fg">{a.title}</div>
                    <div className="truncate text-[11px] text-fg-4">
                      {companyById(a.company_id)?.name || "—"}
                      {o ? ` · ${oppNumber(o)} ${o.title}` : ""}
                    </div>
                  </div>
                  {a.signed_file && <Paperclip className="h-3.5 w-3.5 text-fg-4" />}
                  <Pill className={st.pill}>{st.label}</Pill>
                  <span className="w-20 text-right text-[11px] text-fg-4">{fmtDay((a.signed_at || a.sent_at || a.created_at).slice(0, 10))}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <AgreementModal value={open} onClose={() => setOpen(null)} />
    </Card>
  );
}

/** Agreements of one opportunity (inside its card). */
export function OppAgreements({ opportunity }: { opportunity: Opportunity }) {
  const { agreements } = useSales();
  const [open, setOpen] = useState<Agreement | "new" | null>(null);
  const list = agreements.rows.filter((a) => a.opportunity_id === opportunity.id);
  return (
    <Card>
      <CardHeader
        title="Agreements"
        actions={
          <Button size="sm" variant="outline" onClick={() => setOpen("new")}>
            <Plus className="h-4 w-4" /> From template
          </Button>
        }
      />
      {list.length === 0 ? (
        <div className="px-4 py-5 text-center text-xs text-fg-4">None yet.</div>
      ) : (
        <ul className="divide-y divide-line">
          {list.map((a) => {
            const st = statusOf(a.status);
            return (
              <li key={a.id}>
                <button type="button" onClick={() => setOpen(a)} className="flex w-full items-center gap-2 px-4 py-2 text-left hover:bg-surface-2/50">
                  <span className="min-w-0 flex-1 truncate text-[13px] text-fg">{a.title}</span>
                  {a.signed_file && <Paperclip className="h-3.5 w-3.5 text-fg-4" />}
                  <Pill className={st.pill}>{st.label}</Pill>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <AgreementModal value={open} onClose={() => setOpen(null)} opportunity={opportunity} />
    </Card>
  );
}

type Draft = { template_id: string; title: string; company_id: string; opportunity_id: string; body: string };

function AgreementModal({ value, onClose, opportunity }: { value: Agreement | "new" | null; onClose: () => void; opportunity?: Opportunity }) {
  const { templates, agreements, opps, items } = useSales();
  const { companies, companyById, scopedCompany } = useStore();
  const [d, setD] = useState<Draft | null>(null);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  // A new agreement becomes the one being edited after its first save.
  const [savedId, setSavedId] = useState("");
  const k = value === "new" ? "new" : value?.id || "";
  const editingId = value === "new" ? savedId : value?.id || "";
  const editing = agreements.rows.find((a) => a.id === editingId) || (value && value !== "new" ? value : null);
  if (k !== key) {
    setKey(k);
    setSavedId("");
    setD(
      !value
        ? null
        : editing
          ? { template_id: editing.template_id || "", title: editing.title, company_id: editing.company_id || "", opportunity_id: editing.opportunity_id || "", body: editing.body }
          : { template_id: "", title: "", company_id: opportunity?.company_id || scopedCompany?.id || "", opportunity_id: opportunity?.id || "", body: "" },
    );
  }
  if (!value || !d) return null;
  const set = (p: Partial<Draft>) => setD({ ...d, ...p });
  const fill = (templateId: string, companyId: string, oppId: string) => {
    const tpl = templates.rows.find((t) => t.id === templateId);
    if (!tpl) return d.body;
    const o = opps.rows.find((x) => x.id === oppId);
    return fillTemplate(tpl.body, companyById(companyId), o ? { opp: o, items: items.rows.filter((i) => i.opportunity_id === o.id) } : undefined);
  };
  const companyOpps = opps.rows.filter((o) => o.company_id === d.company_id);

  const write = async (patch: Partial<Agreement>) => {
    setBusy(true);
    const row = { template_id: d.template_id || null, title: d.title.trim() || "Agreement", company_id: d.company_id || null, opportunity_id: d.opportunity_id || null, body: d.body, ...patch };
    const res = editing ? await sb().from("tms_agreements").update(row).eq("id", editing.id).select().single() : await sb().from("tms_agreements").insert(row).select().single();
    setBusy(false);
    if (res.error) return toast.error(errMsg(res.error)), null;
    agreements.put(res.data as Agreement);
    setSavedId((res.data as Agreement).id);
    return res.data as Agreement;
  };
  const save = async () => {
    if (!d.company_id) return toast.error("Pick the company");
    if (await write({})) {
      toast.success("Agreement saved");
      onClose();
    }
  };
  const setStatus = async (status: AgreementStatus) => {
    if (!d.company_id) return toast.error("Pick the company");
    if (await write({ status })) toast.success(`Marked ${status}`);
  };
  const upload = async (f: File) => {
    if (!d.company_id) return toast.error("Pick the company");
    const saved = editing || (await write({}));
    if (!saved) return;
    setBusy(true);
    const path = `agreements/${saved.id}/${f.name.replace(/[^\w.\- ]+/g, "_")}`;
    const up = await sb().storage.from(BUCKET).upload(path, f, { upsert: true, contentType: f.type || undefined });
    setBusy(false);
    if (up.error) return toast.error(errMsg(up.error));
    const res = await sb()
      .from("tms_agreements")
      .update({ signed_file: { path, name: f.name, mime: f.type || null }, status: "signed" })
      .eq("id", saved.id)
      .select()
      .single();
    if (res.error) return toast.error(errMsg(res.error));
    agreements.put(res.data as Agreement);
    toast.success("Signed copy attached");
  };
  const remove = async () => {
    if (!editing || !(await confirmDialog({ title: `Delete ${editing.title}?`, confirmLabel: "Delete", danger: true }))) return;
    if (editing.signed_file) await sb().storage.from(BUCKET).remove([editing.signed_file.path]);
    const { error } = await sb().from("tms_agreements").delete().eq("id", editing.id);
    if (error) return toast.error(errMsg(error));
    agreements.drop(editing.id);
    onClose();
  };
  const st = statusOf(editing?.status || "draft");

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={
        <span className="flex items-center gap-2">
          {editing ? editing.title : "New agreement"} <Pill className={st.pill}>{st.label}</Pill>
        </span>
      }
      subtitle={editing ? [editing.sent_at && `Sent ${fmtDay(editing.sent_at.slice(0, 10))}`, editing.signed_at && `Signed ${fmtDay(editing.signed_at.slice(0, 10))}`].filter(Boolean).join(" · ") || undefined : "Pick a template; it fills with the company and opportunity details"}
      footer={
        <>
          {editing && (
            <Button variant="danger-ghost" onClick={remove} className="mr-auto">
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
          <Button
            variant="ghost"
            onClick={() => {
              navigator.clipboard.writeText(d.body);
              toast.success("Copied");
            }}
            disabled={!d.body}
          >
            <Copy className="h-4 w-4" />
          </Button>
          <Button variant="ghost" onClick={() => printText(d.title || "Agreement", d.body)} disabled={!d.body}>
            <Printer className="h-4 w-4" /> PDF
          </Button>
          <Button variant="primary" onClick={save} loading={busy}>
            Save
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Template">
          <Select
            value={d.template_id}
            onChange={(e) => {
              const tpl = templates.rows.find((t) => t.id === e.target.value);
              set({ template_id: e.target.value, title: d.title || tpl?.name || "", body: tpl ? fill(tpl.id, d.company_id, d.opportunity_id) : d.body });
            }}
          >
            <option value="">None (write it below)</option>
            {templates.rows
              .filter((t) => t.kind !== "email")
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
          </Select>
        </Field>
        <Field label="Title">
          <Input value={d.title} onChange={(e) => set({ title: e.target.value })} placeholder="Dispatch Service Agreement" />
        </Field>
        <Field label="Company" required>
          <Select value={d.company_id} onChange={(e) => set({ company_id: e.target.value, opportunity_id: "", body: d.template_id ? fill(d.template_id, e.target.value, "") : d.body })} disabled={!!opportunity}>
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
        <Field label="Opportunity">
          <Select value={d.opportunity_id} onChange={(e) => set({ opportunity_id: e.target.value, body: d.template_id ? fill(d.template_id, d.company_id, e.target.value) : d.body })} disabled={!!opportunity}>
            <option value="">None</option>
            {companyOpps.map((o) => (
              <option key={o.id} value={o.id}>
                {oppNumber(o)} {o.title}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Text" className="sm:col-span-2" hint={d.body.includes("____") ? "Blanks (____) are details the company doesn't have yet" : undefined}>
          <Textarea rows={12} value={d.body} onChange={(e) => set({ body: e.target.value })} className="font-serif text-[13px]" />
        </Field>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface-2/40 p-3">
        <span className="mr-1 text-[13px] font-semibold text-fg">Status</span>
        {AGREEMENT_STATUSES.map((s) => (
          <button
            key={s.v}
            type="button"
            disabled={busy}
            onClick={() => setStatus(s.v)}
            className={cn("rounded-full px-2.5 py-1 text-xs font-medium ring-1", (editing?.status || "draft") === s.v ? s.pill : "text-fg-3 ring-line hover:text-fg")}
          >
            {s.label}
          </button>
        ))}
        <div className="ml-auto flex flex-wrap gap-2">
          {editing?.signed_file ? (
            <Button size="sm" variant="outline" onClick={() => openDocument(editing.signed_file!.path, editing.signed_file!.name)}>
              <Paperclip className="h-4 w-4" /> {editing.signed_file.name}
            </Button>
          ) : null}
          <Button size="sm" variant="outline" onClick={() => file.current?.click()} disabled={busy}>
            <Paperclip className="h-4 w-4" /> {editing?.signed_file ? "Replace signed copy" : "Attach signed copy"}
          </Button>
          <input ref={file} type="file" hidden accept=".pdf,image/*,.doc,.docx" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          {editing && (
            <Link href={`/invoices/new?${editing.opportunity_id ? `opportunity=${editing.opportunity_id}&` : `company=${editing.company_id}&`}agreement=${editing.id}`} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line-strong bg-surface px-3 text-[13px] font-semibold text-fg hover:bg-surface-2">
              <FileText className="h-4 w-4" /> {editing.invoice_id ? "Invoice again" : "Create invoice"}
            </Link>
          )}
        </div>
      </div>
    </Modal>
  );
}
