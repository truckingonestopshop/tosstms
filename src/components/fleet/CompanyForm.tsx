"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FileText, Plus, UploadCloud, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { useStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import { openDocument, errMsg } from "@/lib/db";
import { cn, US_STATES } from "@/lib/format";
import { docsOf } from "@/lib/docs";
import { AUTHORITY_STATUSES, SERVICES, SOURCES } from "@/lib/services";
import type { AuthorityStatus, Company, CompanyStage, ServiceInfo, ServiceKey, ServiceSource, Services } from "@/lib/types";

/** Service details as typed (numbers stay text until saved). */
type ServiceDraft = Omit<ServiceInfo, "percent" | "cards"> & {
  percent?: string;
  cards?: string;
};

export type CompanyDraft = {
  name: string;
  dba_name: string;
  ein: string;
  mc_number: string;
  dot_number: string;
  dot_status: AuthorityStatus | "";
  mc_status: AuthorityStatus | "";
  status: "active" | "inactive";
  stage: CompanyStage;
  street: string;
  city: string;
  county: string;
  state: string;
  zip: string;
  contact_first_name: string;
  contact_last_name: string;
  contact_phone: string;
  contact_email: string;
  secondary_first_name: string;
  secondary_last_name: string;
  secondary_title: string;
  secondary_phone: string;
  secondary_email: string;
  commission_percent: string;
  billing_cadence: "weekly" | "monthly" | "";
  payment_terms_days: string;
  factoring_company: string;
  factoring_email: string;
  services: Partial<Record<ServiceKey, ServiceDraft>>;
  notes: string;
};

const firstWord = (s?: string | null) => (s || "").trim().split(/\s+/)[0] || "";
const restWords = (s?: string | null) => (s || "").trim().split(/\s+/).slice(1).join(" ");

export const toDraft = (c?: Company | null): CompanyDraft => {
  const hasParts = !!(c?.street || c?.city || c?.state || c?.zip);
  const services: CompanyDraft["services"] = {};
  for (const [k, v] of Object.entries(c?.services ?? {})) {
    services[k as ServiceKey] = {
      ...v,
      percent: v?.percent != null ? String(v.percent) : "",
      cards: v?.cards != null ? String(v.cards) : "",
    };
  }
  return {
    name: c?.name ?? "",
    dba_name: c?.dba_name ?? "",
    ein: c?.ein ?? "",
    mc_number: c?.mc_number ?? "",
    dot_number: c?.dot_number ?? "",
    dot_status: c?.dot_status ?? "",
    mc_status: c?.mc_status ?? "",
    status: c?.status ?? "active",
    stage: c?.stage ?? "client",
    // Carriers from before the address parts: the old one-line address goes in Street.
    street: c?.street ?? (hasParts ? "" : (c?.address ?? "").replace(/\n/g, ", ")),
    city: c?.city ?? "",
    county: c?.county ?? "",
    state: c?.state ?? "",
    zip: c?.zip ?? "",
    contact_first_name: c?.contact_first_name ?? firstWord(c?.contact_name),
    contact_last_name: c?.contact_last_name ?? restWords(c?.contact_name),
    contact_phone: c?.contact_phone ?? "",
    contact_email: c?.contact_email ?? "",
    secondary_first_name: c?.secondary_first_name ?? "",
    secondary_last_name: c?.secondary_last_name ?? "",
    secondary_title: c?.secondary_title ?? "",
    secondary_phone: c?.secondary_phone ?? "",
    secondary_email: c?.secondary_email ?? "",
    // A new carrier starts blank: the dispatch terms are filled in when Dispatch is checked.
    commission_percent: c ? String(c.commission_percent ?? "") : "",
    billing_cadence: c?.billing_cadence ?? "",
    payment_terms_days: c ? String(c.payment_terms_days ?? "") : "",
    factoring_company: c?.factoring_company ?? "",
    factoring_email: c?.factoring_email ?? "",
    services,
    notes: c?.notes ?? "",
  };
};

const nz = (s: string) => s.trim() || null;
const num = (s?: string) => (s && s.trim() !== "" && !Number.isNaN(Number(s)) ? Number(s) : null);

export const fromDraft = (d: CompanyDraft): Partial<Company> => {
  const services: Services = {};
  for (const [k, v] of Object.entries(d.services)) {
    if (!v) continue;
    services[k as ServiceKey] = {
      ...v,
      percent: num(v.percent),
      cards: num(v.cards),
    };
  }
  return {
    name: d.name.trim(),
    dba_name: nz(d.dba_name),
    ein: nz(d.ein),
    mc_number: d.mc_number.replace(/^mc[-\s#]*/i, ""),
    dot_number: d.dot_number.replace(/^(us)?dot[-\s#]*/i, ""),
    dot_status: d.dot_status || null,
    mc_status: d.mc_status || null,
    status: d.status,
    stage: d.stage,
    street: nz(d.street),
    city: nz(d.city),
    county: nz(d.county),
    state: nz(d.state),
    zip: nz(d.zip),
    contact_first_name: nz(d.contact_first_name),
    contact_last_name: nz(d.contact_last_name),
    contact_phone: d.contact_phone,
    contact_email: d.contact_email,
    secondary_first_name: nz(d.secondary_first_name),
    secondary_last_name: nz(d.secondary_last_name),
    secondary_title: nz(d.secondary_title),
    secondary_phone: nz(d.secondary_phone),
    secondary_email: nz(d.secondary_email),
    commission_percent: Math.max(0, Math.min(100, Number(d.commission_percent) || 0)),
    billing_cadence: d.billing_cadence || "weekly",
    payment_terms_days: d.payment_terms_days.trim() === "" ? 7 : Math.max(0, Math.round(Number(d.payment_terms_days) || 0)),
    factoring_company: d.factoring_company,
    factoring_email: d.factoring_email,
    services,
    notes: d.notes,
  };
};

/** What blocks saving, or null. */
export function draftProblem(d: CompanyDraft) {
  if (!d.name.trim()) return "Company name is required.";
  if (!d.dot_number.replace(/\D/g, "")) return "USDOT number is required.";
  if (d.services.dispatch?.on) {
    if (d.commission_percent.trim() === "") return "Dispatch: enter the dispatch fee.";
    if (!d.billing_cadence) return "Dispatch: choose weekly or monthly billing.";
  }
  return null;
}

/** Files picked on a new carrier, by document type; uploaded once it's created. */
export type PendingDocs = Record<string, File[]>;

const label = "mb-2 text-xs font-semibold uppercase tracking-wider text-fg-4";

/** All company fields. Used by the "Add company" modal and the Profile tab. */
export function CompanyFields({
  d,
  set,
  companyId,
  pending,
  onPending,
}: {
  d: CompanyDraft;
  set: (p: Partial<CompanyDraft>) => void;
  /** existing carrier: service documents upload right away */
  companyId?: string;
  pending?: PendingDocs;
  onPending?: (p: PendingDocs) => void;
}) {
  const { members } = useStore();
  const [second, setSecond] = useState(() => !!(d.secondary_first_name || d.secondary_last_name || d.secondary_phone || d.secondary_email));
  const svc = (k: ServiceKey) => d.services[k] ?? {};
  const setSvc = (k: ServiceKey, p: ServiceDraft) => set({ services: { ...d.services, [k]: { ...svc(k), ...p } } });
  const doc = (type: string, title: string) => (
    <ServiceDoc type={type} title={title} companyId={companyId} files={pending?.[type] ?? []} onFiles={(f) => onPending?.({ ...pending, [type]: f })} />
  );
  const person = (k: ServiceKey, field: "sold_by" | "dispatcher" | "sam" | "agent", title: string) => (
    <Field label={title}>
      <Input value={svc(k)[field] || ""} onChange={(e) => setSvc(k, { [field]: e.target.value })} list="toss-team" />
    </Field>
  );
  const date = (k: ServiceKey, title = "Activation date") => (
    <Field label={title}>
      <Input type="date" value={svc(k).activation_date || ""} onChange={(e) => setSvc(k, { activation_date: e.target.value || null })} />
    </Field>
  );
  const percent = (k: ServiceKey, title = "Percentage") => (
    <Field label={title}>
      <Input
        value={svc(k).percent || ""}
        onChange={(e) => setSvc(k, { percent: e.target.value })}
        type="number"
        step="0.25"
        min={0}
        max={100}
        inputMode="decimal"
        suffix="%"
      />
    </Field>
  );

  const details: Record<ServiceKey, React.ReactNode> = {
    dispatch: (
      <>
        <Field label="Dispatch fee" hint="% of gross" required>
          <Input
            value={d.commission_percent}
            onChange={(e) => set({ commission_percent: e.target.value })}
            type="number"
            step="0.25"
            min={0}
            max={100}
            inputMode="decimal"
            suffix="%"
          />
        </Field>
        <Field label="Billing" required>
          <Select
            value={d.billing_cadence}
            onChange={(e) =>
              set({
                billing_cadence: e.target.value as CompanyDraft["billing_cadence"],
              })
            }
          >
            <option value="" disabled>
              Choose…
            </option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </Select>
        </Field>
        <Field label="Payment terms" hint="days">
          <Input
            value={d.payment_terms_days}
            onChange={(e) => set({ payment_terms_days: e.target.value })}
            type="number"
            min={0}
            inputMode="numeric"
            suffix="days"
          />
        </Field>
        {person("dispatch", "dispatcher", "Assigned dispatcher")}
        {person("dispatch", "sold_by", "Sold by")}
        <Field label="Factoring company">
          <Input value={d.factoring_company} onChange={(e) => set({ factoring_company: e.target.value })} placeholder="e.g. RTS Financial" />
        </Field>
        <Field label="Factoring email" className="sm:col-span-2">
          <Input value={d.factoring_email} onChange={(e) => set({ factoring_email: e.target.value })} type="email" placeholder="Where packets are sent" />
        </Field>
      </>
    ),
    dot_compliance: (
      <>
        {person("dot_compliance", "sam", "Safety account manager (SAM)")}
        {person("dot_compliance", "sold_by", "Sold by")}
        <div className="sm:col-span-3">{doc("dot_compliance_agreement", "Agreement")}</div>
      </>
    ),
    mcpt: (
      <>
        {person("mcpt", "agent", "MCPT agent")}
        <div className="flex items-end pb-2">
          <Checkbox checked={!!svc("mcpt").fuel_taxes} onChange={(v) => setSvc("mcpt", { fuel_taxes: v })} label="Fuel taxes" />
        </div>
      </>
    ),
    accounting: (
      <>
        <Field label="Factoring service">
          <Input
            value={svc("accounting").provider || ""}
            onChange={(e) => setSvc("accounting", { provider: e.target.value })}
            placeholder="Factoring company"
          />
        </Field>
        {percent("accounting")}
        <div className="sm:col-span-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {doc("noa", "NOA")}
          {doc("factoring_agreement", "Factoring contract")}
        </div>
      </>
    ),
    factoring: (
      <>
        {percent("factoring")}
        {date("factoring")}
        {person("factoring", "agent", "Factoring agent")}
        {person("factoring", "sold_by", "Sold by")}
        <div className="sm:col-span-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {doc("noa", "NOA")}
          {doc("factoring_agreement", "Factoring contract")}
        </div>
      </>
    ),
    fuel_card: (
      <>
        <Field label="Cards">
          <Input
            value={svc("fuel_card").cards || ""}
            onChange={(e) => setSvc("fuel_card", { cards: e.target.value })}
            type="number"
            min={0}
            inputMode="numeric"
          />
        </Field>
        {date("fuel_card")}
        {person("fuel_card", "agent", "Fuel card agent")}
        {person("fuel_card", "sold_by", "Sold by")}
      </>
    ),
    insurance: (
      <>
        {person("insurance", "agent", "Insurance agent")}
        <Field label="Insurance provider">
          <Input value={svc("insurance").provider || ""} onChange={(e) => setSvc("insurance", { provider: e.target.value })} />
        </Field>
      </>
    ),
  };

  return (
    <div className="space-y-6">
      <datalist id="toss-team">
        {members.map((m) => (
          <option key={m.user_id} value={m.full_name} />
        ))}
      </datalist>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-6">
        <Field label="Company name" required className="sm:col-span-6">
          <Input value={d.name} onChange={(e) => set({ name: e.target.value })} placeholder="Legal name, e.g. Apex Hauling LLC" autoFocus />
        </Field>
        <Field label="DBA name" hint="Optional" className="sm:col-span-3">
          <Input value={d.dba_name} onChange={(e) => set({ dba_name: e.target.value })} />
        </Field>
        <Field label="EIN" hint="Optional" className="sm:col-span-3">
          <Input value={d.ein} onChange={(e) => set({ ein: e.target.value })} placeholder="12-3456789" inputMode="numeric" />
        </Field>
        <Field label="USDOT number" required className="sm:col-span-3">
          <Input value={d.dot_number} onChange={(e) => set({ dot_number: e.target.value })} placeholder="3456789" inputMode="numeric" />
        </Field>
        <Field label="DOT status" className="sm:col-span-3">
          <Select value={d.dot_status} onChange={(e) => set({ dot_status: e.target.value as CompanyDraft["dot_status"] })}>
            <option value="">—</option>
            {AUTHORITY_STATUSES.map((s) => (
              <option key={s.v} value={s.v}>
                {s.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="MC number" className="sm:col-span-3">
          <Input value={d.mc_number} onChange={(e) => set({ mc_number: e.target.value })} placeholder="1234567" inputMode="numeric" />
        </Field>
        <Field label="MC status" className="sm:col-span-3">
          <Select value={d.mc_status} onChange={(e) => set({ mc_status: e.target.value as CompanyDraft["mc_status"] })}>
            <option value="">—</option>
            {AUTHORITY_STATUSES.map((s) => (
              <option key={s.v} value={s.v}>
                {s.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Stage" hint="Lead = prospect · Client = customer" className="sm:col-span-3">
          <Select value={d.stage} onChange={(e) => set({ stage: e.target.value as CompanyStage })}>
            <option value="client">Client</option>
            <option value="lead">Lead</option>
          </Select>
        </Field>
        <Field label="Client status" hint="Working with TOSS" className="sm:col-span-3">
          <Select value={d.status} onChange={(e) => set({ status: e.target.value as "active" | "inactive" })}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </Select>
        </Field>
      </div>

      <div>
        <div className={label}>Address</div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
          <Field label="Street" className="col-span-2 sm:col-span-6">
            <Input value={d.street} onChange={(e) => set({ street: e.target.value })} placeholder="1420 W Carroll Ave" />
          </Field>
          <Field label="City" className="sm:col-span-2">
            <Input value={d.city} onChange={(e) => set({ city: e.target.value })} />
          </Field>
          <Field label="County" hint="Optional" className="sm:col-span-2">
            <Input value={d.county} onChange={(e) => set({ county: e.target.value })} />
          </Field>
          <Field label="State">
            <Select value={d.state} onChange={(e) => set({ state: e.target.value })}>
              <option value="">—</option>
              {US_STATES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="ZIP">
            <Input value={d.zip} onChange={(e) => set({ zip: e.target.value })} inputMode="numeric" />
          </Field>
        </div>
      </div>

      <div>
        <div className={label}>Owner / main contact</div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <Field label="First name">
            <Input value={d.contact_first_name} onChange={(e) => set({ contact_first_name: e.target.value })} />
          </Field>
          <Field label="Last name">
            <Input value={d.contact_last_name} onChange={(e) => set({ contact_last_name: e.target.value })} />
          </Field>
          <Field label="Phone">
            <Input value={d.contact_phone} onChange={(e) => set({ contact_phone: e.target.value })} type="tel" />
          </Field>
          <Field label="Email">
            <Input value={d.contact_email} onChange={(e) => set({ contact_email: e.target.value })} type="email" />
          </Field>
        </div>
        {second ? (
          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between">
              <div className={cn(label, "mb-0")}>Secondary contact</div>
              <button
                type="button"
                className="text-xs text-fg-4 hover:text-fg"
                onClick={() => {
                  setSecond(false);
                  set({
                    secondary_first_name: "",
                    secondary_last_name: "",
                    secondary_title: "",
                    secondary_phone: "",
                    secondary_email: "",
                  });
                }}
              >
                Remove
              </button>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-5">
              <Field label="First name">
                <Input value={d.secondary_first_name} onChange={(e) => set({ secondary_first_name: e.target.value })} />
              </Field>
              <Field label="Last name">
                <Input value={d.secondary_last_name} onChange={(e) => set({ secondary_last_name: e.target.value })} />
              </Field>
              <Field label="Role">
                <Input value={d.secondary_title} onChange={(e) => set({ secondary_title: e.target.value })} placeholder="e.g. Office manager" />
              </Field>
              <Field label="Phone">
                <Input value={d.secondary_phone} onChange={(e) => set({ secondary_phone: e.target.value })} type="tel" />
              </Field>
              <Field label="Email">
                <Input value={d.secondary_email} onChange={(e) => set({ secondary_email: e.target.value })} type="email" />
              </Field>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setSecond(true)} className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-fg-3 hover:text-fg">
            <Plus className="h-3.5 w-3.5" /> Add secondary contact
          </button>
        )}
      </div>

      <div>
        <div className={label}>Services</div>
        <div className="divide-y divide-line overflow-hidden rounded-xl border border-line">
          {SERVICES.map((s) => {
            const on = !!svc(s.key).on;
            return (
              <div key={s.key} className={cn(on && "bg-surface-2/40")}>
                <div className="flex items-center justify-between gap-3 px-3 py-2.5 sm:px-4">
                  <Checkbox
                    checked={on}
                    onChange={(v) => setSvc(s.key, { on: v })}
                    label={<span className="text-[13px] font-medium text-fg">{s.label}</span>}
                  />
                </div>
                {on && (
                  <div className="grid grid-cols-1 gap-3 border-t border-line px-3 pb-4 pt-3 sm:grid-cols-3 sm:px-4">
                    {details[s.key]}
                    <SourcePick v={svc(s.key)} onChange={(p) => setSvc(s.key, p)} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <Field label="Notes">
        <Textarea value={d.notes} onChange={(e) => set({ notes: e.target.value })} rows={3} placeholder="Lanes, preferences, anything the team should know" />
      </Field>
    </div>
  );
}

function SourcePick({ v, onChange }: { v: ServiceDraft; onChange: (p: ServiceDraft) => void }) {
  return (
    <>
      <Field label="Source">
        <Select
          value={v.source || ""}
          onChange={(e) =>
            onChange({
              source: (e.target.value || null) as ServiceSource | null,
            })
          }
        >
          <option value="">—</option>
          {SOURCES.map((s) => (
            <option key={s.v} value={s.v}>
              {s.label}
            </option>
          ))}
        </Select>
      </Field>
      {v.source === "referral" && (
        <Field label="Referred by">
          <Input value={v.referred_by || ""} onChange={(e) => onChange({ referred_by: e.target.value })} placeholder="Client name" />
        </Field>
      )}
    </>
  );
}

/** One service document (agreement, NOA, factoring contract): on file, or drop / pick a file. */
function ServiceDoc({
  type,
  title,
  companyId,
  files,
  onFiles,
}: {
  type: string;
  title: string;
  companyId?: string;
  files: File[];
  onFiles: (f: File[]) => void;
}) {
  const { documents, uploadDocument } = useStore();
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const onFile = useMemo(
    () =>
      companyId
        ? docsOf(documents, { scope: "company", companyId })
            .filter((x) => x.doc_type === type)
            .sort((a, b) => b.uploaded_at.localeCompare(a.uploaded_at))
        : [],
    [documents, companyId, type],
  );
  const add = async (list: FileList | null) => {
    if (!list?.length) return;
    if (!companyId) return onFiles([...files, ...Array.from(list)]);
    setBusy(true);
    for (const f of Array.from(list)) await uploadDocument(f, { company_id: companyId, doc_type: type });
    setBusy(false);
    toast.success(`${title} uploaded`);
  };
  const names = [
    ...onFile.map((x) => ({ key: x.id, name: x.file_name, path: x.file_path })),
    ...files.map((f, i) => ({
      key: `p${i}`,
      name: f.name,
      path: null as string | null,
    })),
  ];
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        add(e.dataTransfer.files);
      }}
      className={cn("rounded-lg border border-dashed px-3 py-2 transition-colors", drag ? "border-brand bg-brand/5" : "border-line-strong")}
    >
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 text-xs font-semibold text-fg-2">{title}</span>
        <Button type="button" variant="ghost" size="sm" onClick={() => input.current?.click()} loading={busy}>
          {!busy && <UploadCloud className="h-3.5 w-3.5" />} {names.length ? "Add" : "Upload"}
        </Button>
      </div>
      {names.length > 0 ? (
        <ul className="mt-1 space-y-0.5">
          {names.map((n) => (
            <li key={n.key} className="flex items-center gap-1.5 text-xs text-fg-3">
              <FileText className="h-3.5 w-3.5 shrink-0 text-fg-4" />
              {n.path ? (
                <button
                  type="button"
                  className="truncate hover:text-fg hover:underline"
                  onClick={() => openDocument(n.path!, n.name).catch((e) => toast.error(`Couldn't open the file: ${errMsg(e)}`))}
                >
                  {n.name}
                </button>
              ) : (
                <>
                  <span className="truncate">{n.name}</span>
                  <button
                    type="button"
                    onClick={() => onFiles(files.filter((f) => f.name !== n.name))}
                    className="text-fg-4 hover:text-fg"
                    aria-label="Remove file"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-0.5 text-[11px] text-fg-4">Drop the file here or upload. {companyId ? "" : "Saved when you add the company."}</p>
      )}
      <input
        ref={input}
        type="file"
        multiple
        className="hidden"
        accept="application/pdf,image/*,.heic,.heif,.doc,.docx"
        onChange={(e) => {
          add(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}

export function NewCompanyModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated?: (c: Company) => void }) {
  const { createCompany, setScope, uploadDocument } = useStore();
  const [d, setD] = useState<CompanyDraft>(toDraft());
  const [pending, setPending] = useState<PendingDocs>({});
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open) {
      setD(toDraft());
      setPending({});
    }
  }, [open]);

  const save = async () => {
    const problem = draftProblem(d);
    if (problem) return toast.error(problem);
    setSaving(true);
    const c = await createCompany(fromDraft(d));
    if (c) {
      let failed = 0;
      for (const [type, files] of Object.entries(pending))
        for (const f of files) if (!(await uploadDocument(f, { company_id: c.id, doc_type: type }))) failed++;
      if (failed) toast.error(`${failed} file${failed === 1 ? "" : "s"} didn't upload. Add ${failed === 1 ? "it" : "them"} from Documents.`);
    }
    setSaving(false);
    if (c) {
      toast.success(`${c.name} added`);
      setScope(c.id);
      onCreated?.(c);
      onClose();
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="Add carrier company"
      subtitle="A carrier TOSS works with. Trucks, drivers, documents and loads live under it."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} loading={saving}>
            Add company
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <CompanyFields d={d} set={(p) => setD((x) => ({ ...x, ...p }))} pending={pending} onPending={setPending} />
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}
