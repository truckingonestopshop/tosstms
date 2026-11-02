"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, Copy, FileSignature, MessageSquare, PenLine, Plus, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { BUCKET, errMsg, sb, signedUrl } from "@/lib/db";
import { renderWritten } from "./written";
import { useLiveTable } from "@/lib/live";
import { useStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/format";
import { CATEGORIES, RECIPIENT_KINDS, TOSS, autoValue, fieldTypeLabel, isEmpty, type RecipientKind, type Verify, type AutoSource, type PageSize, type SignField, type SignRequest, type SignRole, type SignTemplate, type TemplateCategory } from "@/lib/signing";
import type { CompanyPerson } from "@/components/fleet/CompanyPeople";
import { FieldBuilder } from "./FieldBuilder";
import { signingPath, uploadSigningPdf, useFileAs } from "./Templates";

type Who = { name: string; email: string; phone: string; verify?: Verify; code?: string; inPerson?: boolean };
const noOne: Who = { name: "", email: "", phone: "" };
type Other = Who & { kind: Exclude<RecipientKind, "signer"> };
/** A short access code that is easy to read out (no 0/O, 1/I). */
const newCode = () => Array.from({ length: 6 }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 32)]).join("");
type Source = { template: SignTemplate | null; title: string; path: string; name: string; pages: PageSize[]; roles: SignRole[]; fields: SignField[]; docType: string };
interface Sent {
  name: string;
  email: string | null;
  phone: string | null;
  link: string;
  emailed: boolean;
  error: string | null;
  /** signs on this device: no link was emailed */
  inPerson?: boolean;
}

/**
 * Send a document for signing from a company, a DER / owner / contact, a driver or a case: a
 * template, or a PDF uploaded for this one time (fields placed here). TOSS fills its fields, picks
 * who signs each role (and who gets a copy), then the links go out by email and can be copied or
 * texted.
 */
export function SendDialog({
  open,
  onClose,
  companyId,
  driverId,
  personId,
  caseId,
  category,
  onSent,
  startWith,
}: {
  open: boolean;
  onClose: () => void;
  companyId: string;
  driverId?: string;
  personId?: string;
  caseId?: string;
  category?: TemplateCategory;
  onSent?: (r: SignRequest) => void;
  /** open straight on this template (Send from the template gallery) */
  startWith?: SignTemplate;
}) {
  const { companyById, drivers } = useStore();
  const templates = useLiveTable<SignTemplate>("tms_sign_templates", { order: "name", ascending: true });
  const people = useLiveTable<CompanyPerson>("tms_company_people", { filter: { company_id: companyId } });
  const company = companyById(companyId);
  // The driver the document is about: their details fill the driver fields, they are suggested as
  // the driver signer, and the signed copy is filed on them. Starts as the driver it is sent from.
  const [drvId, setDrvId] = useState(driverId || "");
  const driver = drivers.find((d) => d.id === drvId);
  const companyDrivers = drivers.filter((d) => d.company_id === companyId && (d.status === "active" || d.id === drvId)).sort((a, b) => a.name.localeCompare(b.name));
  const person = people.rows.find((p) => p.id === personId);
  const fileInput = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<"pick" | "place" | "details" | "done">("pick");
  const [src, setSrc] = useState<Source | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [who, setWho] = useState<Record<string, Who>>({});
  const [cc, setCc] = useState<Other[]>([]);
  const [remind, setRemind] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [inOrder, setInOrder] = useState(false);
  const [message, setMessage] = useState("");
  const [expires, setExpires] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<{ list: Sent[]; emailReady: boolean } | null>(null);
  const [copied, setCopied] = useState("");
  const [was, setWas] = useState(false);
  const [show, setShow] = useState<TemplateCategory | "all">(category || "all");
  const fileAs = useFileAs(category || "company");

  if (open !== was) {
    setWas(open);
    if (open) {
      setStep("pick");
      setSrc(null);
      setUrl(null);
      setWho({});
      setCc([]);
      setRemind("");
      setValues({});
      setInOrder(false);
      setMessage("");
      setExpires("");
      setSent(null);
      setShow(category || "all");
      setDrvId(driverId || "");
    }
  }

  // Who can be picked: the carrier's main contact, its owners / DERs / contacts, its drivers.
  const contacts = useMemo(() => {
    const out: (Who & { id: string; label: string; tags: string[] })[] = [];
    const main = [company?.contact_first_name, company?.contact_last_name].filter(Boolean).join(" ");
    if (main) out.push({ id: "main", label: `${main} · main contact`, tags: ["signer"], name: main, email: company?.contact_email || "", phone: company?.contact_phone || "" });
    for (const p of people.rows) {
      const tags = [p.is_owner && "owner", p.is_der && "der", p.is_contact && "contact"].filter(Boolean) as string[];
      const name = [p.first_name, p.last_name].filter(Boolean).join(" ");
      out.push({ id: `p:${p.id}`, label: `${name} · ${tags.map((t) => (t === "der" ? "DER" : t)).join(", ")}`, tags, name, email: p.email || "", phone: p.phone || "" });
    }
    for (const d of drivers.filter((d) => d.company_id === companyId && d.status === "active")) out.push({ id: `d:${d.id}`, label: `${d.name} · driver`, tags: ["driver"], name: d.name, email: d.email || "", phone: d.phone || "" });
    return out;
  }, [company, people.rows, drivers, companyId]);

  /** The best person for a role, from where the document is sent. */
  const guess = (role: SignRole): Who => {
    const key = `${role.key} ${role.label}`.toLowerCase();
    const pick = (id: string | undefined) => contacts.find((c) => c.id === id);
    const c =
      (key.includes("driver") && (pick(drvId && `d:${drvId}`) || contacts.find((x) => x.tags.includes("driver")))) ||
      (key.includes("der") && (pick(personId && `p:${personId}`) || contacts.find((x) => x.tags.includes("der")))) ||
      pick(personId && `p:${personId}`) ||
      pick(drvId && `d:${drvId}`) ||
      contacts.find((x) => x.tags.includes("owner")) ||
      contacts[0];
    return c ? { name: c.name, email: c.email, phone: c.phone } : noOne;
  };
  const autoSrc = (role?: string): AutoSource => ({ company, driver: driver || null, recipient: role ? who[role] || null : Object.values(who)[0] || null });
  /** Picks the driver: driver signers become them, and TOSS's driver fields refill with their details. */
  const pickDriver = (id: string) => {
    setDrvId(id);
    const d = drivers.find((x) => x.id === id);
    if (!src) return;
    setWho((w) => {
      const next = { ...w };
      for (const r of src.roles) if (`${r.key} ${r.label}`.toLowerCase().includes("driver")) next[r.key] = d ? { ...(w[r.key] || noOne), name: d.name, email: d.email || "", phone: d.phone || "" } : { ...noOne };
      return next;
    });
    setValues((v) => {
      const next = { ...v };
      for (const f of src.fields) if (f.role === TOSS && f.auto?.startsWith("driver.")) next[f.id] = autoValue(f.auto, { company, driver: d || null });
      return next;
    });
  };
  // The driver picker shows when the document has anything about a driver.
  const usesDriver =
    !!src &&
    (src.roles.some((r) => `${r.key} ${r.label}`.toLowerCase().includes("driver")) ||
      src.fields.some((f) => f.auto?.startsWith("driver.")) ||
      (src.template?.kind === "written" && /data-merge="driver\./.test(src.template.body || "")) ||
      src.template?.category === "driver");

  /** Opens the details step: TOSS's auto fields fill themselves (they can still be typed over). */
  const toDetails = (s: Source, people: Record<string, Who>) => {
    const first = Object.values(people)[0] || null;
    setValues((v) => {
      const next = { ...v };
      for (const f of s.fields) if (f.role === TOSS && f.auto && !(f.id in v)) next[f.id] = autoValue(f.auto, { company, driver: driver || null, recipient: first });
      return next;
    });
    setStep("details");
  };
  const begin = async (s: Source) => {
    const people = Object.fromEntries(s.roles.map((r) => [r.key, guess(r)]));
    setSrc(s);
    setUrl(s.path ? await signedUrl(s.path).catch(() => null) : null);
    setWho(people);
    if (s.template) toDetails(s, people);
    else setStep("place");
  };
  // Sent from the gallery: skip picking, once the company's people are known (to suggest signers).
  const started = useRef<string | null>(null);
  useEffect(() => {
    if (!open) {
      started.current = null;
      return;
    }
    if (!startWith || !people.loaded || started.current === startWith.id) return;
    started.current = startWith.id;
    const t = startWith;
    void Promise.resolve().then(() => begin({ template: t, title: t.name, path: t.file_path || "", name: t.file_name || "", pages: t.pages, roles: t.roles, fields: t.fields, docType: t.doc_type || "" }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, startWith, people.loaded]);

  const upload = async (file: File) => {
    setBusy(true);
    try {
      const up = await uploadSigningPdf(file, `requests/${companyId}`);
      await begin({ template: null, title: up.name.replace(/\.pdf$/i, ""), path: up.path, name: up.name, pages: up.pages, roles: [{ key: "signer", label: "Signer" }], fields: [], docType: "" });
    } catch (e) {
      toast.error(errMsg(e));
    }
    setBusy(false);
  };

  const send = async () => {
    if (!src) return;
    if (!src.title.trim()) return toast.error("Give the document a title");
    if (!src.fields.length) return toast.error("Place at least one field");
    const usedRoles = src.roles.filter((r) => src.fields.some((f) => f.role === r.key));
    for (const r of usedRoles) {
      const w = who[r.key];
      if (!w?.name.trim()) return toast.error(`Who is "${r.label}"?`);
      if (!w.inPerson && !w.email.trim() && !w.phone.trim()) return toast.error(`${w.name}: add an email or a phone (or tick "Signs in person")`);
      if (!w.inPerson && w.verify === "code" && (w.code || "").trim().length < 4) return toast.error(`${w.name}: the access code needs at least 4 characters`);
      if (!w.inPerson && w.verify === "email" && !w.email.trim()) return toast.error(`${w.name}: an emailed code needs their email`);
    }
    const tossMissing = src.fields.find((f) => f.role === TOSS && f.required && isEmpty(f, values[f.id]));
    if (tossMissing) return toast.error(`Fill in "${tossMissing.label}"`);
    setBusy(true);
    // A written template becomes a PDF now: values and TOSS's fields printed in, signer fields placed.
    let file = { path: src.path, name: src.name, pages: src.pages, fields: src.fields };
    if (src.template?.kind === "written") {
      try {
        const out = await renderWritten(src.template.body || "", { merge: (k) => autoValue(k, autoSrc(usedRoles[0]?.key)), toss: values });
        const name = `${src.title.trim().replace(/[\\/:*?"<>|]+/g, "_")}.pdf`;
        const path = signingPath(`requests/${companyId}`, name);
        const up = await sb().storage.from(BUCKET).upload(path, new Blob([out.bytes.slice().buffer], { type: "application/pdf" }), { contentType: "application/pdf" });
        if (up.error) throw up.error;
        file = { path, name, pages: out.pages, fields: out.fields };
      } catch (e) {
        setBusy(false);
        return toast.error(errMsg(e));
      }
    }
    // Signers' auto fields start filled (they can change them).
    const all = { ...values };
    for (const f of file.fields) if (f.role !== TOSS && f.auto && f.auto !== "today") all[f.id] = autoValue(f.auto, autoSrc(f.role)) || "";
    const { data: req, error } = await sb()
      .from("tms_sign_requests")
      .insert({
        title: src.title.trim(),
        template_id: src.template?.id || null,
        company_id: companyId,
        driver_id: drvId || null,
        person_id: personId || null,
        case_id: caseId || null,
        doc_type: src.docType || null,
        file_path: file.path,
        file_name: file.name,
        pages: file.pages,
        roles: usedRoles,
        fields: file.fields,
        values: all,
        in_order: inOrder,
        remind_every_days: remind ? Number(remind) : null,
        message: message.trim() || null,
        expires_at: expires ? new Date(`${expires}T23:59:59`).toISOString() : null,
      })
      .select()
      .single();
    if (error) {
      setBusy(false);
      return toast.error(errMsg(error));
    }
    const rows = [
      ...usedRoles.map((r, i) => ({
        request_id: req.id,
        role: r.key,
        kind: "signer",
        name: who[r.key].name.trim(),
        email: who[r.key].email.trim() || null,
        phone: who[r.key].phone.trim() || null,
        position: i + 1,
        verify: who[r.key].inPerson ? "none" : who[r.key].verify || "none",
        access_code: who[r.key].verify === "code" ? (who[r.key].code || "").trim() || null : null,
        in_person: !!who[r.key].inPerson,
      })),
      // Approvers and reviewers act after the signers; copies only get the signed PDF.
      ...cc
        .filter((c) => c.name.trim() && (c.email.trim() || c.phone.trim()))
        .map((c, i) => ({ request_id: req.id, role: null, kind: c.kind, name: c.name.trim(), email: c.email.trim() || null, phone: c.phone.trim() || null, position: c.kind === "cc" ? 100 + i : usedRoles.length + 1 + i })),
    ];
    const ins = await sb().from("tms_sign_recipients").insert(rows);
    if (ins.error) {
      await sb().from("tms_sign_requests").delete().eq("id", req.id);
      setBusy(false);
      return toast.error(errMsg(ins.error));
    }
    const res = await fetch("/api/sign/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestId: req.id }) });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return toast.error(body.error || "Couldn't send"), onSent?.(req as SignRequest);
    setSent({ list: body.sent, emailReady: body.emailReady });
    setStep("done");
    onSent?.({ ...(req as SignRequest), status: "sent" });
  };

  const list = templates.rows.filter((t) => show === "all" || t.category === show);
  const tossFields = src?.fields.filter((f) => f.role === TOSS) || [];
  const usedRoles = src?.roles.filter((r) => src.fields.some((f) => f.role === r.key)) || [];

  return (
    <Modal
      open={open}
      onClose={onClose}
      size={step === "place" ? "full" : "lg"}
      title={step === "done" ? "Sent for signing" : step === "pick" ? "Send a document for signing" : src?.title || "Document"}
      subtitle={[company?.name, driver?.name, person && [person.first_name, person.last_name].join(" ")].filter(Boolean).join(" · ")}
      footer={
        step === "done" ? (
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        ) : step === "place" ? (
          <>
            <Button variant="ghost" onClick={() => setStep("pick")} className="mr-auto">
              <ArrowLeft className="h-4 w-4" /> Back
            </Button>
            <Button variant="primary" onClick={() => (src?.fields.length ? toDetails(src, Object.fromEntries(src.roles.map((r) => [r.key, who[r.key] || guess(r)]))) : toast.error("Place at least one field"))}>
              Next: who signs
            </Button>
          </>
        ) : step === "details" ? (
          <>
            <Button variant="ghost" onClick={() => setStep(src?.template ? "pick" : "place")} className="mr-auto">
              <ArrowLeft className="h-4 w-4" /> Back
            </Button>
            <Button variant="primary" onClick={send} disabled={busy}>
              Send for signing
            </Button>
          </>
        ) : (
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        )
      }
    >
      {step === "pick" && (
        <div>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Select value={show} onChange={(e) => setShow(e.target.value as TemplateCategory | "all")} className="w-auto" aria-label="Templates">
              <option value="all">All templates</option>
              {CATEGORIES.map((c) => (
                <option key={c.v} value={c.v}>
                  {c.label} templates
                </option>
              ))}
            </Select>
            <div className="flex-1" />
            <input ref={fileInput} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
            <Button variant="outline" onClick={() => fileInput.current?.click()} disabled={busy}>
              <Upload className="h-4 w-4" /> Upload a one-time PDF
            </Button>
          </div>
          {list.length === 0 ? (
            <div className="rounded-lg border border-dashed border-line p-6 text-center text-sm text-fg-3">No templates here yet. Make one in Signing → Templates, or upload a PDF for this one time.</div>
          ) : (
            <ul className="divide-y divide-line rounded-lg border border-line">
              {list.map((t) => (
                <li key={t.id}>
                  <button
                    onClick={() => begin({ template: t, title: t.name, path: t.file_path || "", name: t.file_name || "", pages: t.pages, roles: t.roles, fields: t.fields, docType: t.doc_type || "" })}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-2/60"
                    disabled={!t.fields.length}
                  >
                    <FileSignature className="h-4 w-4 shrink-0 text-fg-4" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-semibold text-fg">{t.name}</div>
                      <div className="truncate text-xs text-fg-3">{t.fields.length ? `${t.roles.map((r) => r.label).join(", ")} · ${t.fields.length} fields` : "No fields yet: open it in Templates first"}</div>
                    </div>
                    <span className="text-xs text-fg-4">{CATEGORIES.find((c) => c.v === t.category)?.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {step === "place" && src && (
        <div>
          <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Title">
              <Input value={src.title} onChange={(e) => setSrc({ ...src, title: e.target.value })} />
            </Field>
            <Field label="File the signed copy as">
              <Select value={src.docType} onChange={(e) => setSrc({ ...src, docType: e.target.value })}>
                <option value="">Other</option>
                {fileAs.map((d) => (
                  <option key={d.key} value={d.key}>
                    {d.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <FieldBuilder src={url} pages={src.pages} roles={src.roles} fields={src.fields} onRoles={(roles) => setSrc({ ...src, roles })} onFields={(fields) => setSrc({ ...src, fields })} />
        </div>
      )}

      {step === "details" && src && (
        <div className="space-y-5">
          {src.template && (
            <Field label="Title">
              <Input value={src.title} onChange={(e) => setSrc({ ...src, title: e.target.value })} />
            </Field>
          )}
          {usesDriver && (
            <section className="rounded-xl border border-line bg-surface-2/40 p-3">
              <Field label="Driver" hint={companyDrivers.length ? "Their name, contact, license and dates fill in; the signed copy is filed on them" : "This company has no drivers yet: add them in Equipment & Drivers"}>
                <Select value={drvId} onChange={(e) => pickDriver(e.target.value)} disabled={!companyDrivers.length}>
                  <option value="">Pick a driver of {company?.name || "this company"}…</option>
                  {companyDrivers.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                      {d.cdl_number ? ` · ${d.license_type || "CDL"} ${d.cdl_number}` : ""}
                      {d.status !== "active" ? " (inactive)" : ""}
                    </option>
                  ))}
                </Select>
              </Field>
            </section>
          )}
          <section>
            <h3 className="mb-2 text-[13px] font-semibold text-fg">Who signs</h3>
            <div className="space-y-3">
              {usedRoles.map((r, i) => (
                <div key={r.key} className="rounded-lg border border-line p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-fg-2">
                      {inOrder ? `${i + 1}. ` : ""}
                      {r.label}
                    </span>
                    <Select
                      value=""
                      onChange={(e) => {
                        const c = contacts.find((x) => x.id === e.target.value);
                        if (c) setWho({ ...who, [r.key]: { name: c.name, email: c.email, phone: c.phone } });
                      }}
                      className="h-8 w-auto max-w-[60%] text-xs"
                      aria-label={`Pick ${r.label}`}
                    >
                      <option value="">Pick from this company…</option>
                      {contacts.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.label}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <Input value={who[r.key]?.name || ""} onChange={(e) => setWho({ ...who, [r.key]: { ...(who[r.key] || noOne), name: e.target.value } })} placeholder="Name" aria-label={`${r.label} name`} />
                    <Input type="email" value={who[r.key]?.email || ""} onChange={(e) => setWho({ ...who, [r.key]: { ...(who[r.key] || noOne), email: e.target.value } })} placeholder="Email" aria-label={`${r.label} email`} />
                    <Input type="tel" value={who[r.key]?.phone || ""} onChange={(e) => setWho({ ...who, [r.key]: { ...(who[r.key] || noOne), phone: e.target.value } })} placeholder="Phone (for text)" aria-label={`${r.label} phone`} />
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
                    <Checkbox
                      checked={!!who[r.key]?.inPerson}
                      onChange={(v) => setWho({ ...who, [r.key]: { ...(who[r.key] || noOne), inPerson: v } })}
                      label="Signs in person on this device"
                      className="text-xs"
                    />
                    {!who[r.key]?.inPerson && (
                      <Select
                        value={who[r.key]?.verify || "none"}
                        onChange={(e) => {
                          const v = e.target.value as Verify;
                          setWho({ ...who, [r.key]: { ...(who[r.key] || noOne), verify: v, code: v === "code" ? who[r.key]?.code || newCode() : who[r.key]?.code } });
                        }}
                        className="h-8 w-auto text-xs"
                        aria-label={`${r.label} verification`}
                      >
                        <option value="none">No code to open</option>
                        <option value="email">Email them a one-time code</option>
                        <option value="code">Access code I give them</option>
                      </Select>
                    )}
                    {!who[r.key]?.inPerson && who[r.key]?.verify === "code" && (
                      <Input
                        value={who[r.key]?.code || ""}
                        onChange={(e) => setWho({ ...who, [r.key]: { ...(who[r.key] || noOne), code: e.target.value.toUpperCase() } })}
                        className="h-8 w-28 font-mono text-xs tracking-widest"
                        aria-label={`${r.label} access code`}
                        title="Tell them this code by phone or text; it isn't in the email"
                      />
                    )}
                  </div>
                </div>
              ))}
            </div>
            {usedRoles.length > 1 && <Checkbox checked={inOrder} onChange={setInOrder} className="mt-2" label="Sign in this order (each one gets the link after the one before signs)" />}
          </section>

          <section>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-[13px] font-semibold text-fg">Also involved</h3>
              <Button size="xs" variant="ghost" onClick={() => setCc([...cc, { ...noOne, kind: "cc" }])}>
                <Plus className="h-3.5 w-3.5" /> Add
              </Button>
            </div>
            {cc.length === 0 && <p className="text-xs text-fg-4">Nobody else. Add someone who approves, needs to view it, or gets the signed copy.</p>}
            {cc.map((c, i) => (
              <div key={i} className="mb-2 flex flex-wrap gap-2 sm:flex-nowrap">
                <Select value={c.kind} onChange={(e) => setCc(cc.map((x, j) => (j === i ? { ...x, kind: e.target.value as Other["kind"] } : x)))} className="sm:w-40" aria-label="What they do">
                  {RECIPIENT_KINDS.filter((k) => k.v !== "signer").map((k) => (
                    <option key={k.v} value={k.v}>
                      {k.label}
                    </option>
                  ))}
                </Select>
                <Input value={c.name} onChange={(e) => setCc(cc.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} placeholder="Name" />
                <Input type="email" value={c.email} onChange={(e) => setCc(cc.map((x, j) => (j === i ? { ...x, email: e.target.value } : x)))} placeholder="Email" />
                <button onClick={() => setCc(cc.filter((_, j) => j !== i))} className="text-fg-4 hover:text-fg" aria-label="Remove">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </section>

          {tossFields.length > 0 && (
            <section>
              <h3 className="mb-2 text-[13px] font-semibold text-fg">Filled by TOSS before sending</h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {tossFields.map((f) => (
                  <Field key={f.id} label={`${f.label}${f.required ? "" : " (optional)"}`} hint={`${fieldTypeLabel(f.type)} · page ${f.page + 1}`}>
                    {f.type === "checkbox" ? (
                      <Checkbox checked={values[f.id] === "true"} onChange={(v) => setValues({ ...values, [f.id]: v ? "true" : "" })} label="Checked" />
                    ) : f.type === "signature" || f.type === "initials" ? (
                      <p className="text-xs text-fg-3">TOSS signatures go on when TOSS signs as a signer. Make this field a signer&apos;s instead.</p>
                    ) : (
                      <Input value={values[f.id] || ""} onChange={(e) => setValues({ ...values, [f.id]: e.target.value })} />
                    )}
                  </Field>
                ))}
              </div>
            </section>
          )}

          <section className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_200px]">
            <Field label="Message" hint="Goes in the email with the link">
              <Textarea rows={3} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Hi, please review and sign. Thank you!" />
            </Field>
            <div className="space-y-3">
              <Field label="Expires" hint="Optional: no signing after this day">
                <Input type="date" value={expires} onChange={(e) => setExpires(e.target.value)} />
              </Field>
              <Field label="Remind them">
                <Select value={remind} onChange={(e) => setRemind(e.target.value)}>
                  <option value="">Never (remind by hand)</option>
                  <option value="1">Every day</option>
                  <option value="2">Every 2 days</option>
                  <option value="3">Every 3 days</option>
                  <option value="7">Every week</option>
                </Select>
              </Field>
            </div>
          </section>
        </div>
      )}

      {step === "done" && sent && (
        <div>
          <p className="mb-3 text-sm text-fg-2">
            {sent.emailReady ? "The links went out by email. You can also copy a link or text it." : "Email isn't connected yet, so nothing was emailed. Copy each link or text it from your phone."}
          </p>
          <ul className="space-y-2">
            {sent.list.map((s) => (
              <li key={s.link} className="rounded-lg border border-line p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[13px] font-semibold text-fg">{s.name}</span>
                  <span className={cn("text-xs", s.emailed ? "text-emerald-600" : "text-fg-3")}>{s.emailed ? `Emailed to ${s.email}` : s.email ? `Not emailed: ${s.error}` : "No email"}</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    size="xs"
                    variant="outline"
                    onClick={async () => {
                      await navigator.clipboard.writeText(s.link);
                      setCopied(s.link);
                    }}
                  >
                    {copied === s.link ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {copied === s.link ? "Copied" : "Copy link"}
                  </Button>
                  {s.inPerson && (
                    <a href={s.link} target="_blank" rel="noreferrer" className="inline-flex h-7 items-center gap-1.5 rounded-lg bg-brand px-2.5 text-xs font-semibold text-black">
                      <PenLine className="h-3.5 w-3.5" /> Sign now on this device
                    </a>
                  )}
                  {s.phone && !s.inPerson && (
                    <a href={`sms:${s.phone.replace(/[^\d+]/g, "")}?&body=${encodeURIComponent(`Hi ${s.name.split(" ")[0]}, please review and sign: ${s.link}`)}`} className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-line px-2.5 text-xs font-medium text-fg hover:bg-surface-2">
                      <MessageSquare className="h-3.5 w-3.5" /> Text it
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ul>
          {sent.list.length === 0 && <p className="text-sm text-fg-3">Nobody to send to right now.</p>}
        </div>
      )}
    </Modal>
  );
}
