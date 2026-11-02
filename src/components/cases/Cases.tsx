"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Briefcase, Clock, DollarSign, Headset, MessageSquare, Paperclip, Plus, Search, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, Empty, Pill, Stat, neutralPill } from "@/components/ui/Bits";
import { Field, Input, Segmented, Select, Textarea } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { confirmDialog } from "@/components/ui/Confirm";
import { EditListButton, useOptions, type OptionListKey } from "@/components/ui/OptionList";
import { BUCKET, docPath, errMsg, openDocument, sb } from "@/lib/db";
import { useLiveTable } from "@/lib/live";
import { useStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import { cn, fmtDay, money, num, relTime, today } from "@/lib/format";
import { CASE_STATUSES, PRIORITIES, hoursLabel, isClosed, priorityOf, statusOf, type Case, type CaseEntry, type CaseKind, type CasePriority, type CaseStatus, type EntryKind } from "@/lib/cases";
import type { Opportunity } from "@/lib/sales";

// Cases (kind "work") and Customer Service (kind "customer_service"): the same screen. A case
// belongs to a company, can be connected to an invoice and an opportunity, and keeps a log of
// notes (with files), work (time spent) and expenses. Opening it and each status change show on
// the company's Timeline. Cases are opened on the customer (its Cases tab) or from an invoice /
// opportunity, so the company is never picked by hand. Completed or Cancelled closes a case.

const COPY: Record<CaseKind, { one: string; many: string; categoryLabel: string; empty: string; icon: typeof Briefcase }> = {
  work: { one: "case", many: "Cases", categoryLabel: "Service", empty: "Track work you do for a client: connect it to an invoice or opportunity, log the time and expenses.", icon: Briefcase },
  customer_service: {
    one: "customer service case",
    many: "Customer service",
    categoryLabel: "What happened",
    empty: "When a customer reports an overcharge, is unhappy with a service, their dispatcher or safety account manager, or has a suggestion.",
    icon: Headset,
  },
};

const CATEGORY_LIST: Record<CaseKind, OptionListKey> = { work: "case_work", customer_service: "case_cs" };
/** Case category names come from an editable list (Edit list next to the field). */
export const useCategoryLabel = (kind: CaseKind) => useOptions(CATEGORY_LIST[kind]).label;

type Show = "open" | "mine" | "closed" | "all";

/**
 * The list of cases with Open / Mine / Closed / All. On the Cases and Customer Service pages it
 * shows every company in view; with `companyId` (a customer's Cases tab) only that customer's.
 */
export function CasesView({ kind, companyId }: { kind: CaseKind; companyId?: string }) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { me, inScope, companyById, memberName, scopedCompany } = useStore();
  const cases = useLiveTable<Case>("tms_cases", { filter: companyId ? { kind, company_id: companyId } : { kind } });
  const entries = useLiveTable<CaseEntry>("tms_case_entries", { order: "created_at", ascending: true });
  const [show, setShow] = useState<Show>("open");
  const [q, setQ] = useState("");
  // Links: ?new=1&company=…&opportunity=… (from an opportunity / invoice) and ?case=<id>.
  const [creating, setCreating] = useState(() => !!params.get("new"));
  const [openId, setOpenId] = useState<string | null>(() => params.get("case"));
  const t = today();
  const copy = COPY[kind];
  const catLabel = useCategoryLabel(kind);
  // The customer a new case goes to: never picked by hand.
  const newFor = companyId || params.get("company") || scopedCompany?.id || "";

  const scoped = cases.rows.filter((c) => (companyId ? c.company_id === companyId && c.kind === kind : !c.company_id || inScope(c.company_id)));
  const list = scoped
    .filter((c) => (show === "open" ? !isClosed(c.status) : show === "closed" ? isClosed(c.status) : show === "mine" ? c.owner_id === me.id && !isClosed(c.status) : true))
    .filter((c) => !q || `#${c.number} ${c.title} ${companyById(c.company_id)?.name || ""} ${memberName(c.owner_id)} ${catLabel(c.category)} ${statusOf(c.status).label}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => Number(isClosed(a.status)) - Number(isClosed(b.status)) || PRIORITIES.findIndex((p) => p.v === b.priority) - PRIORITIES.findIndex((p) => p.v === a.priority) || b.created_at.localeCompare(a.created_at));

  const ids = new Set(scoped.map((c) => c.id));
  const month = t.slice(0, 7);
  const open = scoped.filter((c) => !isClosed(c.status));
  const overdue = open.filter((c) => c.due_date && c.due_date < t);
  const closedMonth = scoped.filter((c) => (c.closed_at || "").startsWith(month));
  const expMonth = entries.rows.filter((e) => ids.has(e.case_id) && e.kind === "expense" && (e.spent_on || e.created_at).startsWith(month)).reduce((s, e) => s + Number(e.amount || 0), 0);
  const opened = cases.rows.find((c) => c.id === openId) || null;

  const close = () => {
    setOpenId(null);
    setCreating(false);
    if (params.get("case") || params.get("new")) {
      if (!companyId) return router.replace(kind === "work" ? "/cases" : "/customer-service", { scroll: false });
      const keep = new URLSearchParams(params.toString());
      ["case", "new", "opportunity", "invoice"].forEach((k) => keep.delete(k));
      router.replace(`${pathname}?${keep}`, { scroll: false });
    }
  };

  return (
    <>
      <div className={cn("mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4", companyId && "hidden")}>
        <Stat label="Open" value={num(open.length)} sub={`${num(open.filter((c) => c.owner_id === me.id).length)} mine`} />
        <Stat label="Overdue" value={<span className={overdue.length ? "text-red-600 dark:text-red-400" : ""}>{num(overdue.length)}</span>} sub="Past their due date" />
        <Stat label="Closed this month" value={num(closedMonth.length)} sub={`${num(scoped.length)} in total`} />
        <Stat label="Expenses this month" value={money(expMonth, { cents: false })} sub="Logged on cases" />
      </div>

      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <Segmented<Show>
          value={show}
          onChange={setShow}
          options={[
            { value: "open", label: "Open" },
            { value: "mine", label: "Mine" },
            { value: "closed", label: "Closed" },
            { value: "all", label: "All" },
          ]}
        />
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-4" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Case #, title, company, owner" className="pl-9" />
        </div>
        {newFor && (
          <Button variant="primary" onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" /> New {copy.one}
          </Button>
        )}
      </div>

      {list.length === 0 ? (
        <Card>
          <Empty
            icon={copy.icon}
            title={scoped.length ? "No cases match" : kind === "work" ? "No cases yet" : "No customer service cases yet"}
            body={scoped.length ? undefined : newFor ? copy.empty : `${copy.empty} Open one from the customer's Cases tab or from an invoice.`}
          />
        </Card>
      ) : (
        <Card>
          <ul className="divide-y divide-line">
            {list.map((c) => {
              const st = statusOf(c.status);
              const pr = priorityOf(c.priority);
              const log = entries.rows.filter((e) => e.case_id === c.id);
              const mins = log.reduce((s, e) => s + (e.kind === "work" ? e.minutes || 0 : 0), 0);
              const spent = log.reduce((s, e) => s + (e.kind === "expense" ? Number(e.amount || 0) : 0), 0);
              const late = !isClosed(c.status) && c.due_date && c.due_date < t;
              return (
                <li key={c.id}>
                  <button onClick={() => setOpenId(c.id)} className="flex w-full flex-col gap-1 px-4 py-3 text-left hover:bg-surface-2/50 sm:flex-row sm:items-center sm:gap-4 sm:px-5">
                    <span className="tnum w-14 shrink-0 text-xs font-semibold text-fg-4">#{c.number}</span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-semibold text-fg">{c.title}</div>
                      <div className="truncate text-xs text-fg-3">
                        {[companyId ? "" : companyById(c.company_id)?.name, catLabel(c.category), c.owner_id ? memberName(c.owner_id) : "Unassigned"].filter(Boolean).join(" · ")}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {(c.priority === "high" || c.priority === "urgent") && <Pill className={pr.pill}>{pr.label}</Pill>}
                      <Pill className={st.pill}>{st.label}</Pill>
                      {c.invoice_id && <Pill className={neutralPill}>Invoice</Pill>}
                      {mins > 0 && <span className="text-xs text-fg-3">{hoursLabel(mins)}</span>}
                      {spent > 0 && <span className="tnum text-xs text-fg-3">{money(spent)}</span>}
                      <span className={cn("text-xs", late ? "text-red-600 dark:text-red-400" : "text-fg-4")}>{c.due_date ? `Due ${fmtDay(c.due_date)}` : relTime(c.created_at)}</span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <NewCaseModal
        kind={kind}
        open={creating}
        onClose={close}
        preset={{ company: newFor, opportunity: params.get("opportunity") || "", invoice: params.get("invoice") || "" }}
        onCreated={(c) => {
          cases.put(c);
          setCreating(false);
          setOpenId(c.id);
        }}
      />
      <CaseModal c={opened} entries={entries.rows.filter((e) => e.case_id === openId)} onClose={close} onSaved={cases.put} onDeleted={cases.drop} onEntry={entries.put} onEntryDeleted={entries.drop} />
    </>
  );
}

function useOpportunities(companyId: string) {
  const [opps, setOpps] = useState<Opportunity[]>([]);
  useEffect(() => {
    let alive = true;
    if (!companyId) return;
    sb()
      .from("tms_opportunities")
      .select("*")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .then(({ data }) => alive && setOpps((data || []) as Opportunity[]));
    return () => {
      alive = false;
    };
  }, [companyId]);
  return companyId ? opps : [];
}

function CategorySelect({ kind, value, onChange }: { kind: CaseKind; value: string; onChange: (v: string) => void }) {
  const opts = useOptions(CATEGORY_LIST[kind]);
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">—</option>
      {opts.choices(value).map((c) => (
        <option key={c.value} value={c.value}>
          {c.label}
        </option>
      ))}
    </Select>
  );
}

function NewCaseModal({ kind, open, onClose, preset, onCreated }: { kind: CaseKind; open: boolean; onClose: () => void; preset: { company: string; opportunity: string; invoice: string }; onCreated: (c: Case) => void }) {
  const { companyById, members, me, invoices } = useStore();
  const blank = () => ({
    company_id: preset.company,
    title: "",
    category: "",
    priority: "normal" as CasePriority,
    owner_id: me.id,
    due_date: "",
    opportunity_id: preset.opportunity || "",
    invoice_id: preset.invoice,
    description: "",
  });
  const [d, setD] = useState(blank);
  const [was, setWas] = useState(false);
  if (open !== was) {
    setWas(open);
    if (open) setD(blank());
  }
  const set = (p: Partial<ReturnType<typeof blank>>) => setD((x) => ({ ...x, ...p }));
  const opps = useOpportunities(d.company_id);
  const companyInvoices = invoices.filter((i) => i.company_id === d.company_id);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!d.company_id) return toast.error("Open the case from the customer's Cases tab or from an invoice");
    if (!d.title.trim()) return toast.error("Give the case a title");
    setSaving(true);
    const row = {
      kind,
      company_id: d.company_id,
      title: d.title.trim(),
      category: d.category || null,
      priority: d.priority,
      owner_id: d.owner_id || null,
      due_date: d.due_date || null,
      opportunity_id: d.opportunity_id || null,
      invoice_id: d.invoice_id || null,
      description: d.description.trim() || null,
    };
    const { data, error } = await sb().from("tms_cases").insert(row).select().single();
    setSaving(false);
    if (error) return toast.error(errMsg(error));
    toast.success(`Case #${(data as Case).number} opened`);
    onCreated(data as Case);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`New ${COPY[kind].one}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} disabled={saving}>
            Open case
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Company" className="sm:col-span-2">
          <div className="flex h-9 items-center rounded-lg border border-line bg-surface-2/60 px-3 text-[13px] font-medium text-fg">{companyById(d.company_id)?.name || "—"}</div>
        </Field>
        <Field label="Title" required className="sm:col-span-2">
          <Input value={d.title} onChange={(e) => set({ title: e.target.value })} placeholder={kind === "customer_service" ? "e.g. Charged twice for October" : "e.g. Renew IFTA and file Q3"} autoFocus />
        </Field>
        <Field label={COPY[kind].categoryLabel} action={<EditListButton list={CATEGORY_LIST[kind]} />}>
          <CategorySelect kind={kind} value={d.category} onChange={(v) => set({ category: v })} />
        </Field>
        <Field label="Priority">
          <Select value={d.priority} onChange={(e) => set({ priority: e.target.value as CasePriority })}>
            {PRIORITIES.map((p) => (
              <option key={p.v} value={p.v}>
                {p.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Owner">
          <Select value={d.owner_id} onChange={(e) => set({ owner_id: e.target.value })}>
            <option value="">Nobody</option>
            {members.map((m) => (
              <option key={m.user_id} value={m.user_id}>
                {m.full_name || m.email}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Due date">
          <Input type="date" value={d.due_date} onChange={(e) => set({ due_date: e.target.value })} />
        </Field>
        <Field label="Invoice" hint="Can be connected later too">
          <Select value={d.invoice_id} onChange={(e) => set({ invoice_id: e.target.value })} disabled={!d.company_id}>
            <option value="">None</option>
            {companyInvoices.map((i) => (
              <option key={i.id} value={i.id}>
                {i.invoice_number} · {money(Number(i.total_due))}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Opportunity">
          <Select value={d.opportunity_id} onChange={(e) => set({ opportunity_id: e.target.value })} disabled={!d.company_id}>
            <option value="">None</option>
            {opps.map((o) => (
              <option key={o.id} value={o.id}>
                {o.number ? `OPP-${o.number} ` : ""}{o.title}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Details" className="sm:col-span-2">
          <Textarea rows={4} value={d.description} onChange={(e) => set({ description: e.target.value })} />
        </Field>
      </div>
    </Modal>
  );
}

type Attachment = CaseEntry["attachments"][number];
type CaseDraft = Pick<Case, "status" | "priority" | "owner_id" | "due_date" | "invoice_id" | "opportunity_id">;
const draftOf = (c: Case): CaseDraft => ({ status: c.status, priority: c.priority, owner_id: c.owner_id, due_date: c.due_date, invoice_id: c.invoice_id, opportunity_id: c.opportunity_id });

/**
 * One case: its details, the log, and adding notes (with files) / work / expenses. Changes to the
 * details are kept until Save; Save also adds a note still being typed. Picking Completed or
 * Cancelled closes the case on Save.
 */
function CaseModal({
  c,
  entries,
  onClose,
  onSaved,
  onDeleted,
  onEntry,
  onEntryDeleted,
}: {
  c: Case | null;
  entries: CaseEntry[];
  onClose: () => void;
  onSaved: (c: Case) => void;
  onDeleted: (id: string) => void;
  onEntry: (e: CaseEntry) => void;
  onEntryDeleted: (id: string) => void;
}) {
  const { companyById, members, invoices, me, isOwner } = useStore();
  const opps = useOpportunities(c?.company_id || "");
  const catLabel = useCategoryLabel(c?.kind ?? "work");
  const [entryKind, setEntryKind] = useState<EntryKind>("note");
  const [body, setBody] = useState("");
  const [minutes, setMinutes] = useState("");
  const [amount, setAmount] = useState("");
  const [spentOn, setSpentOn] = useState(today());
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<CaseDraft | null>(c ? draftOf(c) : null);
  const [draftFor, setDraftFor] = useState(c?.id);
  if (c?.id !== draftFor) {
    setDraftFor(c?.id);
    setDraft(c ? draftOf(c) : null);
    setBody("");
    setFiles([]);
  }
  const totals = useMemo(
    () => ({
      mins: entries.reduce((s, e) => s + (e.kind === "work" ? e.minutes || 0 : 0), 0),
      spent: entries.reduce((s, e) => s + (e.kind === "expense" ? Number(e.amount || 0) : 0), 0),
    }),
    [entries],
  );
  if (!c || !draft) return null;
  const company = companyById(c.company_id);
  const invoice = invoices.find((i) => i.id === draft.invoice_id);
  const opp = opps.find((o) => o.id === draft.opportunity_id);
  const set = (p: Partial<CaseDraft>) => setDraft((d) => (d ? { ...d, ...p } : d));
  const changes = (Object.keys(draft) as (keyof CaseDraft)[]).filter((k) => (draft[k] || null) !== (c[k] || null));
  const pendingEntry = !!(body.trim() || files.length || (entryKind === "work" && minutes) || (entryKind === "expense" && amount));
  const dirty = changes.length > 0 || pendingEntry;
  // Only the person the case is assigned to moves its status (TOSS Cloud owners can too).
  const canStatus = draft.owner_id === me.id || isOwner;

  const upload = async (list: File[]): Promise<Attachment[] | null> => {
    const out: Attachment[] = [];
    for (const f of list) {
      const path = docPath(c.company_id || "no-company", `cases/${c.id}`, f.name);
      const up = await sb().storage.from(BUCKET).upload(path, f, { contentType: f.type || undefined });
      if (up.error) {
        if (out.length) await sb().storage.from(BUCKET).remove(out.map((a) => a.path));
        toast.error(errMsg(up.error));
        return null;
      }
      out.push({ id: crypto.randomUUID(), name: f.name, path, mime: f.type || null });
    }
    return out;
  };
  /** Adds the entry being typed. Returns false when it couldn't (and says why). */
  const addEntry = async (): Promise<boolean> => {
    const row: Partial<CaseEntry> = { case_id: c.id, kind: entryKind, body: body.trim() || null };
    if (entryKind === "work") {
      const m = Math.round(Number(minutes) || 0);
      if (m <= 0) return toast.error("How long did it take (minutes)?"), false;
      row.minutes = m;
    }
    if (entryKind === "expense") {
      const a = Number(amount) || 0;
      if (a <= 0) return toast.error("Enter the expense amount"), false;
      row.amount = a;
      row.spent_on = spentOn || today();
    }
    if (entryKind === "note" && !row.body && !files.length) return true;
    const attachments = await upload(files);
    if (!attachments) return false;
    row.attachments = attachments;
    const { data, error } = await sb().from("tms_case_entries").insert(row).select().single();
    if (error) {
      if (attachments.length) await sb().storage.from(BUCKET).remove(attachments.map((a) => a.path));
      return toast.error(errMsg(error)), false;
    }
    onEntry(data as CaseEntry);
    setBody("");
    setMinutes("");
    setAmount("");
    setFiles([]);
    return true;
  };
  const add = async () => {
    setBusy(true);
    await addEntry();
    setBusy(false);
  };
  const save = async () => {
    setBusy(true);
    const note = entryKind === "note" ? body.trim() : "";
    if (pendingEntry && !(await addEntry())) return setBusy(false);
    if (changes.length) {
      const p: Partial<Case> = Object.fromEntries(changes.map((k) => [k, draft[k] || null]));
      // Closing: the note typed with it is the resolution on the Timeline.
      if (isClosed(draft.status) && !isClosed(c.status)) p.resolution = note || null;
      const { data, error } = await sb().from("tms_cases").update(p).eq("id", c.id).select().single();
      if (error) {
        setBusy(false);
        return toast.error(errMsg(error));
      }
      onSaved(data as Case);
      if (isClosed(draft.status) && !isClosed(c.status)) toast.success(`Case #${c.number} ${draft.status === "completed" ? "completed" : "cancelled"} and closed`);
      else toast.success("Saved");
    } else if (pendingEntry) toast.success("Saved");
    setBusy(false);
  };
  const leave = async () => {
    if (dirty && !(await confirmDialog({ title: "Discard your changes?", body: "They haven't been saved.", confirmLabel: "Discard", danger: true }))) return;
    onClose();
  };
  const removeEntry = async (e: CaseEntry) => {
    const { error } = await sb().from("tms_case_entries").delete().eq("id", e.id);
    if (error) return toast.error(errMsg(error));
    if (e.attachments?.length) await sb().storage.from(BUCKET).remove(e.attachments.map((a) => a.path));
    onEntryDeleted(e.id);
  };
  const remove = async () => {
    if (!(await confirmDialog({ title: `Delete case #${c.number}?`, body: "Its log, files and expenses are deleted too. The company's Timeline keeps the history.", confirmLabel: "Delete", danger: true }))) return;
    const paths = entries.flatMap((e) => (e.attachments || []).map((a) => a.path));
    const { error } = await sb().from("tms_cases").delete().eq("id", c.id);
    if (error) return toast.error(errMsg(error));
    if (paths.length) await sb().storage.from(BUCKET).remove(paths);
    onDeleted(c.id);
    onClose();
  };
  const open = (a: Attachment) => openDocument(a.path, a.name).catch((e) => toast.error(errMsg(e)));

  return (
    <Modal
      open
      onClose={leave}
      size="lg"
      title={`#${c.number} · ${c.title}`}
      subtitle={[company?.name, catLabel(c.category)].filter(Boolean).join(" · ")}
      footer={
        <>
          {isOwner && (
            <Button variant="danger-ghost" onClick={remove} className="mr-auto">
              <Trash2 className="h-4 w-4" /> Delete
            </Button>
          )}
          <Button variant="ghost" onClick={leave}>
            {dirty ? "Cancel" : "Close"}
          </Button>
          <Button variant="primary" onClick={save} disabled={busy || !dirty}>
            Save
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field
          label="Status"
          className="col-span-2"
          hint={canStatus ? undefined : draft.owner_id ? `Only ${members.find((m) => m.user_id === draft.owner_id)?.full_name || "the owner"} can change it` : "Assign an owner to move it along"}
        >
          <Select value={draft.status} onChange={(e) => set({ status: e.target.value as CaseStatus })} disabled={!canStatus}>
            {CASE_STATUSES.map((s) => (
              <option key={s.v} value={s.v}>
                {s.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Priority">
          <Select value={draft.priority} onChange={(e) => set({ priority: e.target.value as CasePriority })}>
            {PRIORITIES.map((p) => (
              <option key={p.v} value={p.v}>
                {p.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Due date">
          <Input type="date" value={draft.due_date || ""} onChange={(e) => set({ due_date: e.target.value || null })} />
        </Field>
        <Field label="Owner" className="col-span-2">
          <Select value={draft.owner_id || ""} onChange={(e) => set({ owner_id: e.target.value || null })}>
            <option value="">Nobody</option>
            {members.map((m) => (
              <option key={m.user_id} value={m.user_id}>
                {m.full_name || m.email}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Invoice">
          <div className="flex items-center gap-2">
            <Select value={draft.invoice_id || ""} onChange={(e) => set({ invoice_id: e.target.value || null })}>
              <option value="">Not connected</option>
              {invoices
                .filter((i) => i.company_id === c.company_id)
                .map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.invoice_number} · {money(Number(i.total_due))}
                  </option>
                ))}
            </Select>
            {invoice && (
              <Link href={`/invoices/${invoice.id}`} className="shrink-0 text-xs font-medium text-fg-3 hover:text-fg">
                Open →
              </Link>
            )}
          </div>
        </Field>
        <Field label="Opportunity">
          <div className="flex items-center gap-2">
            <Select value={draft.opportunity_id || ""} onChange={(e) => set({ opportunity_id: e.target.value || null })}>
              <option value="">Not connected</option>
              {opps.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.number ? `OPP-${o.number} ` : ""}{o.title}
                </option>
              ))}
            </Select>
            {opp && (
              <Link href={`/sales?tab=opportunities&opp=${opp.id}`} className="shrink-0 text-xs font-medium text-fg-3 hover:text-fg">
                Sales →
              </Link>
            )}
          </div>
        </Field>
      </div>
      {isClosed(draft.status) && !isClosed(c.status) && <p className="mt-2 text-xs text-fg-3">Saving closes the case. A note typed below is kept as the outcome.</p>}

      {c.description && <p className="mt-4 whitespace-pre-wrap rounded-lg bg-surface-2/60 p-3 text-[13px] text-fg-2">{c.description}</p>}
      {isClosed(c.status) && (
        <p className="mt-3 text-[13px] text-fg-2">
          <b className="text-fg">Closed</b> {c.closed_at ? fmtDay(c.closed_at.slice(0, 10)) : ""}
          {c.resolution ? ` · ${c.resolution}` : ""}
        </p>
      )}

      <div className="mt-5 flex items-center justify-between">
        <h3 className="text-[13px] font-semibold text-fg">Work log</h3>
        <span className="text-xs text-fg-3">
          {hoursLabel(totals.mins)} worked · {money(totals.spent)} expenses
        </span>
      </div>
      <ul className="mt-2 space-y-2">
        {entries.length === 0 && <li className="text-xs text-fg-4">Nothing logged yet.</li>}
        {entries.map((e) => (
          <li key={e.id} className="group flex gap-2.5 rounded-lg border border-line px-3 py-2">
            {e.kind === "work" ? <Clock className="mt-0.5 h-4 w-4 shrink-0 text-violet-500" /> : e.kind === "expense" ? <DollarSign className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" /> : <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-fg-4" />}
            <div className="min-w-0 flex-1">
              <div className="text-[13px] text-fg">
                {e.kind === "work" && <b>{hoursLabel(e.minutes || 0)} · </b>}
                {e.kind === "expense" && (
                  <b>
                    {money(Number(e.amount || 0))}
                    {e.spent_on ? ` on ${fmtDay(e.spent_on)}` : ""} ·{" "}
                  </b>
                )}
                <span className="whitespace-pre-wrap">{e.body}</span>
              </div>
              {!!e.attachments?.length && (
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {e.attachments.map((a) => (
                    <button key={a.id} onClick={() => open(a)} className="inline-flex max-w-[220px] items-center gap-1 rounded-md border border-line px-2 py-0.5 text-xs text-fg-2 hover:bg-surface-2">
                      <Paperclip className="h-3 w-3 shrink-0" />
                      <span className="truncate">{a.name}</span>
                    </button>
                  ))}
                </div>
              )}
              <div className="text-[11px] text-fg-4">
                {e.actor_name || "Someone"} · {relTime(e.created_at)}
              </div>
            </div>
            {(e.actor_id === me.id || isOwner) && (
              <button onClick={() => removeEntry(e)} className="self-start text-fg-4 opacity-0 hover:text-fg group-hover:opacity-100" aria-label="Delete entry">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </li>
        ))}
      </ul>

      <div className="mt-3 rounded-lg border border-line p-3">
        <Segmented<EntryKind>
          size="sm"
          value={entryKind}
          onChange={setEntryKind}
          options={[
            { value: "note", label: "Note" },
            { value: "work", label: "Work time" },
            { value: "expense", label: "Expense" },
          ]}
        />
        <div className="mt-2 grid grid-cols-2 gap-2">
          {entryKind === "work" && <Input type="number" min={1} value={minutes} onChange={(e) => setMinutes(e.target.value)} placeholder="Minutes" suffix="min" />}
          {entryKind === "expense" && (
            <>
              <Input type="number" min={0} step="0.01" prefix="$" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount" />
              <Input type="date" value={spentOn} onChange={(e) => setSpentOn(e.target.value)} />
            </>
          )}
          <Textarea className="col-span-2" rows={2} value={body} onChange={(e) => setBody(e.target.value)} placeholder={entryKind === "note" ? "Add a note…" : entryKind === "work" ? "What was done" : "What it was for"} />
        </div>
        {files.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {files.map((f, i) => (
              <span key={i} className="inline-flex max-w-[220px] items-center gap-1 rounded-md bg-surface-2 px-2 py-0.5 text-xs text-fg-2">
                <Paperclip className="h-3 w-3 shrink-0" />
                <span className="truncate">{f.name}</span>
                <button onClick={() => setFiles((l) => l.filter((_, j) => j !== i))} className="text-fg-4 hover:text-fg" aria-label={`Remove ${f.name}`}>
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="mt-2 flex items-center justify-between">
          <input
            ref={fileInput}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              const picked = Array.from(e.target.files || []);
              setFiles((l) => [...l, ...picked]);
              e.target.value = "";
            }}
          />
          <Button size="sm" variant="ghost" onClick={() => fileInput.current?.click()}>
            <Paperclip className="h-3.5 w-3.5" /> Attach files
          </Button>
          <Button size="sm" variant="secondary" onClick={add} disabled={busy}>
            Add {entryKind === "work" ? "work" : entryKind}
          </Button>
        </div>
      </div>

      {company && (
        <div className="mt-3 text-right">
          <Link href={`/fleet?company=${company.id}&tab=profile`} className="text-xs font-medium text-fg-3 hover:text-fg">
            {company.name}: Profile & Timeline →
          </Link>
        </div>
      )}
    </Modal>
  );
}
