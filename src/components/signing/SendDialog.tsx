"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, Copy, FileSignature, MessageSquare, Pencil, PenLine, Plus, Save, Upload, UserCheck, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { BUCKET, errMsg, sb, signedUrl } from "@/lib/db";
import { renderWritten } from "./written";
import { useLiveTable } from "@/lib/live";
import { useStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/format";
import {
  CATEGORIES,
  RECIPIENT_KINDS,
  TOSS,
  autoValue,
  fieldTypeLabel,
  inferAutoKey,
  isEmpty,
  resolveFieldValue,
  type RecipientKind,
  type Verify,
  type AutoSource,
  type PageSize,
  type SignField,
  type SignRequest,
  type SignRole,
  type SignTemplate,
  type TemplateCategory,
} from "@/lib/signing";
import type { CompanyPerson } from "@/components/fleet/CompanyPeople";
import type { Driver } from "@/lib/types";
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
  const [perId, setPerId] = useState(personId || "");
  const [pickedContactId, setPickedContactId] = useState("");
  const [saveAsTemplate, setSaveAsTemplate] = useState(true);
  const driver = drivers.find((d) => d.id === drvId) || null;
  const companyDrivers = drivers.filter((d) => d.company_id === companyId).sort((a, b) => a.name.localeCompare(b.name));
  const person = people.rows.find((p) => p.id === perId) || null;
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
      setPerId(personId || "");
      setPickedContactId(driverId ? `d:${driverId}` : personId ? `p:${personId}` : "");
      setSaveAsTemplate(true);
    }
  }

  // Everyone in the database for this company: owners, DERs, contacts, drivers, and main/secondary profile contacts.
  const contacts = useMemo(() => {
    const out: (Who & {
      id: string;
      label: string;
      tags: string[];
      title?: string;
      driverId?: string;
      personId?: string;
      driver?: Driver | null;
      person?: CompanyPerson | null;
    })[] = [];
    const main = [company?.contact_first_name, company?.contact_last_name].filter(Boolean).join(" ");
    if (main) {
      out.push({
        id: "main",
        label: `${main} · Company owner / main contact`,
        tags: ["owner", "signer"],
        name: main,
        email: company?.contact_email || "",
        phone: company?.contact_phone || "",
        title: "Owner",
      });
    }
    const sec = [company?.secondary_first_name, company?.secondary_last_name].filter(Boolean).join(" ");
    if (sec) {
      out.push({
        id: "secondary",
        label: `${sec} · ${company?.secondary_title || "Secondary contact"}`,
        tags: ["contact", "signer"],
        name: sec,
        email: company?.secondary_email || "",
        phone: company?.secondary_phone || "",
        title: company?.secondary_title || undefined,
      });
    }
    for (const p of people.rows) {
      const tags = [p.is_owner && "owner", p.is_der && "der", p.is_contact && "contact"].filter(Boolean) as string[];
      const name = [p.first_name, p.last_name].filter(Boolean).join(" ");
      const linkedDriver = p.driver_id ? drivers.find((d) => d.id === p.driver_id) || null : null;
      out.push({
        id: `p:${p.id}`,
        label: `${name} · ${tags.map((t) => (t === "der" ? "DER" : t === "owner" ? "Owner" : "Contact")).join(", ") || "Person"}`,
        tags,
        name,
        email: p.email || "",
        phone: p.phone || "",
        title: p.title || (p.is_owner ? "Owner" : p.is_der ? "DER" : undefined),
        personId: p.id,
        driverId: p.driver_id || undefined,
        person: p,
        driver: linkedDriver,
      });
    }
    for (const d of companyDrivers) {
      out.push({
        id: `d:${d.id}`,
        label: `${d.name} · Driver${d.cdl_number ? ` (${d.license_type || "CDL"} ${d.cdl_number})` : ""}${d.status !== "active" ? " (inactive)" : ""}`,
        tags: ["driver"],
        name: d.name,
        email: d.email || "",
        phone: d.phone || "",
        title: "Driver",
        driverId: d.id,
        driver: d,
      });
    }
    return out;
  }, [company, people.rows, drivers, companyDrivers]);

  /** The best person from the database for a role, based on where the document is sent from. */
  const guessContact = (role: SignRole) => {
    const key = `${role.key} ${role.label}`.toLowerCase();
    const pick = (id: string | undefined) => contacts.find((c) => c.id === id);
    return (
      (key.includes("driver") && (pick(drvId && `d:${drvId}`) || contacts.find((x) => x.tags.includes("driver")))) ||
      (key.includes("der") && (pick(perId && `p:${perId}`) || contacts.find((x) => x.tags.includes("der")))) ||
      pick(perId && `p:${perId}`) ||
      pick(drvId && `d:${drvId}`) ||
      contacts.find((x) => x.tags.includes("owner")) ||
      contacts[0] ||
      null
    );
  };
  const guess = (role: SignRole): Who => {
    const c = guessContact(role);
    return c ? { name: c.name, email: c.email, phone: c.phone } : noOne;
  };
  const autoSrc = (role?: string, nextWho = who, nextDrv = driver, nextPer = person): AutoSource => ({
    company,
    driver: nextDrv,
    person: nextPer,
    recipient: role ? nextWho[role] || null : Object.values(nextWho)[0] || null,
  });

  /** Computes auto-filled and template-saved values for every field on the document. */
  const fillValues = (s: Source, nextWho: Record<string, Who>, nextDrv: Driver | null, nextPer: CompanyPerson | null, prev: Record<string, string> = {}) => {
    const next: Record<string, string> = { ...prev };
    const firstRec = Object.values(nextWho)[0] || null;
    for (const f of s.fields) {
      const rec = f.role !== TOSS ? nextWho[f.role] || firstRec : firstRec;
      const source: AutoSource = { company, driver: nextDrv, person: nextPer, recipient: rec };
      const key = f.auto || (!f.value ? inferAutoKey(f.label, f.type) : null);
      if (key) {
        next[f.id] = autoValue(key, source) || f.value || "";
      } else if (!(f.id in next) || !next[f.id]) {
        next[f.id] = resolveFieldValue(f, source);
      }
    }
    return next;
  };

  /** Picks a person from the database (driver, owner, DER, contact) and auto-fills signer + all fields. */
  const applyContact = (contactId: string, roleKey?: string) => {
    setPickedContactId(contactId);
    const c = contacts.find((x) => x.id === contactId);
    if (!src) return;
    if (!c) return;
    const nextDrvId = c.driverId ?? (c.id.startsWith("d:") ? c.id.slice(2) : drvId);
    const nextPerId = c.personId ?? (c.id.startsWith("p:") ? c.id.slice(2) : "");
    const nextDrv = drivers.find((x) => x.id === nextDrvId) || c.driver || null;
    const nextPer = people.rows.find((x) => x.id === nextPerId) || c.person || null;
    setDrvId(nextDrvId || "");
    setPerId(nextPerId || "");
    const nextWho = { ...who };
    if (roleKey) {
      nextWho[roleKey] = { ...(nextWho[roleKey] || noOne), name: c.name, email: c.email, phone: c.phone };
    } else {
      const used = src.roles.filter((r) => src.fields.some((f) => f.role === r.key));
      const targetRoles = used.length ? used : src.roles;
      const driverRole = targetRoles.find((r) => `${r.key} ${r.label}`.toLowerCase().includes("driver"));
      const derRole = targetRoles.find((r) => `${r.key} ${r.label}`.toLowerCase().includes("der"));
      const matchedRole = (c.tags.includes("driver") && driverRole) || (c.tags.includes("der") && derRole) || targetRoles[0];
      if (matchedRole) {
        nextWho[matchedRole.key] = { ...(nextWho[matchedRole.key] || noOne), name: c.name, email: c.email, phone: c.phone };
      }
    }
    setWho(nextWho);
    setValues((prev) => fillValues(src, nextWho, nextDrv, nextPer, prev));
  };

  /** Saves placed fields / roles / defaults back to the template so the user never has to place them again. */
  const saveTemplateProgress = async (s: Source, currentValues = values): Promise<Source> => {
    const fieldsWithDefaults = s.fields.map((f) => {
      const hasAuto = !!(f.auto || inferAutoKey(f.label, f.type));
      if (!hasAuto && f.type !== "signature" && f.type !== "initials" && f.type !== "attachment" && currentValues[f.id] !== undefined) {
        return { ...f, value: currentValues[f.id] || f.value || null };
      }
      return f;
    });
    if (s.template) {
      if (s.template.kind === "pdf") {
        const { data, error } = await sb()
          .from("tms_sign_templates")
          .update({ name: s.title.trim() || s.template.name, doc_type: s.docType || null, roles: s.roles, fields: fieldsWithDefaults })
          .eq("id", s.template.id)
          .select()
          .single();
        if (!error && data) {
          const updated = data as SignTemplate;
          templates.put(updated);
          const next = { ...s, template: updated, fields: fieldsWithDefaults };
          setSrc(next);
          return next;
        }
      }
      return s;
    }
    if (!saveAsTemplate) return s;
    const { data, error } = await sb()
      .from("tms_sign_templates")
      .insert({
        name: s.title.trim() || s.name.replace(/\.pdf$/i, ""),
        category: category || "company",
        doc_type: s.docType || null,
        kind: "pdf",
        file_path: s.path,
        file_name: s.name,
        pages: s.pages,
        roles: s.roles,
        fields: fieldsWithDefaults,
      })
      .select()
      .single();
    if (error || !data) {
      if (error) toast.error(errMsg(error));
      return s;
    }
    const created = data as SignTemplate;
    templates.put(created);
    toast.success(`Saved "${created.name}" to Templates for next time`);
    const next = { ...s, template: created, fields: fieldsWithDefaults };
    setSrc(next);
    return next;
  };

  /** Opens the details step: all database and template-saved fields fill themselves automatically. */
  const toDetails = async (s: Source, initialWho: Record<string, Who>, fromPlace = false) => {
    let current = s;
    if (fromPlace) {
      setBusy(true);
      current = await saveTemplateProgress(s);
      setBusy(false);
    }
    const firstRole = current.roles[0];
    const guessed = firstRole ? guessContact(firstRole) : null;
    const nextDrv = driver || guessed?.driver || null;
    const nextPer = person || guessed?.person || null;
    if (!drvId && guessed?.driverId) setDrvId(guessed.driverId);
    if (!perId && guessed?.personId) setPerId(guessed.personId);
    if (!pickedContactId && guessed?.id) setPickedContactId(guessed.id);
    setValues((prev) => fillValues(current, initialWho, nextDrv, nextPer, prev));
    setStep("details");
  };
  const begin = async (s: Source) => {
    const initialWho = Object.fromEntries(s.roles.map((r) => [r.key, guess(r)]));
    setSrc(s);
    setUrl(s.path ? await signedUrl(s.path).catch(() => null) : null);
    setWho(initialWho);
    if (s.template && (s.template.kind === "written" || s.fields.length > 0)) {
      await toDetails(s, initialWho, false);
    } else {
      setStep("place");
    }
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
    // Persist any fixed field values back onto the PDF template so next time they are already filled in.
    const savedSrc = await saveTemplateProgress(src, values);
    // A written template becomes a PDF now: values and TOSS's fields printed in, signer fields placed.
    let file = { path: savedSrc.path, name: savedSrc.name, pages: savedSrc.pages, fields: savedSrc.fields };
    if (savedSrc.template?.kind === "written") {
      try {
        const out = await renderWritten(savedSrc.template.body || "", { merge: (k) => autoValue(k, autoSrc(usedRoles[0]?.key)), toss: values, letterhead: savedSrc.template.letterhead ? { title: savedSrc.title.trim() } : null });
        const name = `${savedSrc.title.trim().replace(/[\\/:*?"<>|]+/g, "_")}.pdf`;
        const path = signingPath(`requests/${companyId}`, name);
        const up = await sb().storage.from(BUCKET).upload(path, new Blob([out.bytes.slice().buffer], { type: "application/pdf" }), { contentType: "application/pdf" });
        if (up.error) throw up.error;
        file = { path, name, pages: out.pages, fields: out.fields };
      } catch (e) {
        setBusy(false);
        return toast.error(errMsg(e));
      }
    }
    // Every field (TOSS and signer pre-filled) starts with its resolved value.
    const all: Record<string, string> = {};
    for (const f of file.fields) {
      const v = values[f.id] ?? resolveFieldValue(f, autoSrc(f.role));
      if (v && !(f.type === "date" && f.auto === "today" && f.role !== TOSS)) all[f.id] = v;
    }
    const { data: req, error } = await sb()
      .from("tms_sign_requests")
      .insert({
        title: savedSrc.title.trim(),
        template_id: savedSrc.template?.id || null,
        company_id: companyId,
        driver_id: drvId || null,
        person_id: perId || null,
        case_id: caseId || null,
        doc_type: savedSrc.docType || null,
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
  const editableFields = src?.fields.filter((f) => f.type !== "signature" && f.type !== "initials" && f.type !== "attachment") || [];
  const usedRoles = src?.roles.filter((r) => src.fields.some((f) => f.role === r.key)) || [];
  const roleLabel = (key: string) => (key === TOSS ? "TOSS" : src?.roles.find((r) => r.key === key)?.label || key);

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
            {src?.template?.kind === "pdf" && (
              <Button
                variant="outline"
                disabled={busy || !src.fields.length}
                onClick={async () => {
                  setBusy(true);
                  await saveTemplateProgress(src);
                  setBusy(false);
                  toast.success("Template saved");
                }}
              >
                <Save className="h-4 w-4" /> Save template
              </Button>
            )}
            <Button
              variant="primary"
              disabled={busy}
              onClick={() => (src?.fields.length ? toDetails(src, Object.fromEntries(src.roles.map((r) => [r.key, who[r.key] || guess(r)])), true) : toast.error("Place at least one field"))}
            >
              {src?.template ? "Save & next: who signs" : saveAsTemplate ? "Save template & next" : "Next: who signs"}
            </Button>
          </>
        ) : step === "details" ? (
          <>
            <Button variant="ghost" onClick={() => setStep(src?.template ? "pick" : "place")} className="mr-auto">
              <ArrowLeft className="h-4 w-4" /> Back
            </Button>
            {(src?.template?.kind === "pdf" || (!src?.template && src?.path)) && (
              <Button variant="outline" onClick={() => setStep("place")} disabled={busy}>
                <Pencil className="h-4 w-4" /> Edit fields on PDF
              </Button>
            )}
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
              <Upload className="h-4 w-4" /> Upload a PDF
            </Button>
          </div>
          {list.length === 0 ? (
            <div className="rounded-lg border border-dashed border-line p-6 text-center text-sm text-fg-3">No templates here yet. Make one in Signing → Templates, or upload a PDF now (it will be saved as a template automatically).</div>
          ) : (
            <ul className="scrollbar-bold max-h-[60dvh] divide-y divide-line overflow-y-auto rounded-lg border border-line">
              {list.map((t) => (
                <li key={t.id}>
                  <button
                    onClick={() => begin({ template: t, title: t.name, path: t.file_path || "", name: t.file_name || "", pages: t.pages, roles: t.roles, fields: t.fields, docType: t.doc_type || "" })}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-2/60"
                  >
                    <FileSignature className="h-4 w-4 shrink-0 text-fg-4" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-semibold text-fg">{t.name}</div>
                      <div className="truncate text-xs text-fg-3">{t.fields.length ? `${t.roles.map((r) => r.label).join(", ")} · ${t.fields.length} fields` : "Click to place fields on this template"}</div>
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
          {!src.template && (
            <Checkbox
              className="mb-3"
              checked={saveAsTemplate}
              onChange={setSaveAsTemplate}
              label="Save as a template so all placed fields, signature positions and texts are kept for next time"
            />
          )}
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
          <section className="rounded-xl border border-brand/30 bg-brand/5 p-3.5">
            <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-fg">
              <UserCheck className="h-4 w-4 text-brand" /> Choose person from database (auto-fills document &amp; signer)
            </div>
            <Select
              value={pickedContactId}
              onChange={(e) => applyContact(e.target.value)}
              disabled={!contacts.length}
              aria-label="Choose person from database"
            >
              <option value="">{contacts.length ? `Pick a driver, owner, DER or contact of ${company?.name || "this company"}…` : "No people or drivers on this company yet — type details below"}</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </Select>
            <p className="mt-1 text-xs text-fg-3">
              Picking a person automatically fills their name, email, phone, license/CDL, dates and company details into the document so you can just click Send.
            </p>
          </section>
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
                      onChange={(e) => applyContact(e.target.value, r.key)}
                      className="h-8 w-auto max-w-[60%] text-xs"
                      aria-label={`Pick ${r.label}`}
                    >
                      <option value="">Pick from database…</option>
                      {contacts.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.label}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <Input
                      value={who[r.key]?.name || ""}
                      onChange={(e) => {
                        const nextWho = { ...who, [r.key]: { ...(who[r.key] || noOne), name: e.target.value } };
                        setWho(nextWho);
                        setValues((prev) => fillValues(src, nextWho, driver, person, prev));
                      }}
                      placeholder="Name"
                      aria-label={`${r.label} name`}
                    />
                    <Input
                      type="email"
                      value={who[r.key]?.email || ""}
                      onChange={(e) => {
                        const nextWho = { ...who, [r.key]: { ...(who[r.key] || noOne), email: e.target.value } };
                        setWho(nextWho);
                        setValues((prev) => fillValues(src, nextWho, driver, person, prev));
                      }}
                      placeholder="Email"
                      aria-label={`${r.label} email`}
                    />
                    <Input
                      type="tel"
                      value={who[r.key]?.phone || ""}
                      onChange={(e) => {
                        const nextWho = { ...who, [r.key]: { ...(who[r.key] || noOne), phone: e.target.value } };
                        setWho(nextWho);
                        setValues((prev) => fillValues(src, nextWho, driver, person, prev));
                      }}
                      placeholder="Phone (for text)"
                      aria-label={`${r.label} phone`}
                    />
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

          {editableFields.length > 0 && (
            <section>
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3 className="text-[13px] font-semibold text-fg">Document fields (auto-filled from database &amp; template)</h3>
                {src.template?.kind === "pdf" && (
                  <Button
                    size="xs"
                    variant="ghost"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      await saveTemplateProgress(src, values);
                      setBusy(false);
                      toast.success("Default texts saved to template");
                    }}
                  >
                    <Save className="h-3.5 w-3.5" /> Save texts to template
                  </Button>
                )}
              </div>
              <div className="scrollbar-bold grid max-h-[380px] grid-cols-1 gap-3 overflow-y-auto rounded-xl border border-line p-3 sm:grid-cols-2">
                {editableFields.map((f) => (
                  <Field
                    key={f.id}
                    label={`${f.label}${f.role === TOSS && f.required ? " *" : ""}`}
                    hint={`${roleLabel(f.role)} · ${fieldTypeLabel(f.type)}${src.template?.kind === "pdf" ? ` · page ${f.page + 1}` : ""}`}
                  >
                    {f.type === "checkbox" ? (
                      <Checkbox checked={values[f.id] === "true"} onChange={(v) => setValues({ ...values, [f.id]: v ? "true" : "" })} label="Checked" />
                    ) : (f.type === "dropdown" || f.type === "radio") && f.options?.length ? (
                      <Select value={values[f.id] || ""} onChange={(e) => setValues({ ...values, [f.id]: e.target.value })}>
                        <option value="">Choose…</option>
                        {f.options.map((o) => (
                          <option key={o} value={o}>
                            {o}
                          </option>
                        ))}
                      </Select>
                    ) : (
                      <Input value={values[f.id] || ""} onChange={(e) => setValues({ ...values, [f.id]: e.target.value })} placeholder={f.role === TOSS ? "Filled by TOSS" : "Pre-filled for signer (optional)"} />
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
