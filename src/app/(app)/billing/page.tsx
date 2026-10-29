"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Pencil, Plus, Trash2 } from "lucide-react";
import { BillingFrame } from "@/components/fleet/CompanyNav";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, Empty, Page, PageHeader, Pill, Stat, neutralPill } from "@/components/ui/Bits";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { confirmDialog } from "@/components/ui/Confirm";
import { errMsg, sb } from "@/lib/db";
import { useStore } from "@/lib/store";
import { CompanyFilter } from "@/components/layout/CompanyFilter";
import { toast } from "@/lib/toast";
import { cn, fmtDay, money, today } from "@/lib/format";
import { SERVICES, serviceLabel } from "@/lib/services";
import { INTERVALS, billingTotals, intervalPer, invoiceOpen, monthly, runningSub, type Charge, type ChargeService } from "@/lib/billing";
import type { ServiceKey } from "@/lib/types";

// Billing: everything TOSS charges the carrier (or every carrier) for all services: subscriptions,
// one-time charges (à la carte) and pending invoices, with the totals on top.

const SERVICE_OPTIONS: { v: ChargeService; label: string }[] = [...SERVICES.map((s) => ({ v: s.key as ChargeService, label: s.label })), { v: "other", label: "Other" }];
const chargeServiceLabel = (s: ChargeService) => (s === "other" ? "Other" : serviceLabel(s as ServiceKey));

const SUB_STATUS: Record<string, { label: string; cls: string }> = {
  active: { label: "Active", cls: "bg-emerald-500/10 text-emerald-700 ring-emerald-600/20 dark:text-emerald-300" },
  paused: { label: "Paused", cls: "bg-amber-500/10 text-amber-800 ring-amber-600/25 dark:text-amber-300" },
  cancelled: { label: "Cancelled", cls: neutralPill },
  unpaid: { label: "Unpaid", cls: "bg-amber-500/10 text-amber-800 ring-amber-600/25 dark:text-amber-300" },
  paid: { label: "Paid", cls: "bg-emerald-500/10 text-emerald-700 ring-emerald-600/20 dark:text-emerald-300" },
  void: { label: "Void", cls: neutralPill },
};

export default function BillingPage() {
  const { scope, companies, invoices, payments } = useStore();
  const [charges, setCharges] = useState<Charge[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [edit, setEdit] = useState<{ kind: Charge["kind"]; charge?: Charge } | null>(null);
  const t = today();
  const all = scope === "all";
  const company = all ? undefined : companies.find((c) => c.id === scope);
  const nameOf = (id: string | null) => companies.find((c) => c.id === id)?.name ?? "—";

  useEffect(() => {
    let alive = true;
    let q = sb().from("tms_charges").select("*").order("created_at", { ascending: false });
    if (!all) q = q.eq("company_id", scope);
    q.then(({ data }) => {
      if (!alive) return;
      setCharges(((data || []) as Charge[]).map((c) => ({ ...c, amount: Number(c.amount) || 0 })));
      setLoaded(true);
    });
    const ch = sb()
      .channel(`charges-${scope}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tms_charges" }, (p) => {
        if (p.eventType === "DELETE") return setCharges((l) => l.filter((c) => c.id !== (p.old as Charge).id));
        const row = { ...(p.new as Charge), amount: Number((p.new as Charge).amount) || 0 };
        if (!all && row.company_id !== scope) return;
        setCharges((l) => [row, ...l.filter((c) => c.id !== row.id)]);
      })
      .subscribe();
    return () => {
      alive = false;
      sb().removeChannel(ch);
    };
  }, [scope, all]);

  const inv = useMemo(() => invoices.filter((i) => all || i.company_id === scope), [invoices, all, scope]);
  const totals = useMemo(() => billingTotals(charges, inv, payments, t), [charges, inv, payments, t]);
  const subs = charges.filter((c) => c.kind === "subscription");
  const once = charges.filter((c) => c.kind === "one_time").sort((a, b) => (b.charge_date || "").localeCompare(a.charge_date || ""));
  const open = inv.filter((i) => invoiceOpen(i) > 0).sort((a, b) => (a.due_date || a.issue_date).localeCompare(b.due_date || b.issue_date));
  const activeSubs = subs.filter((c) => runningSub(c, t)).length;
  const serviceRows = SERVICE_OPTIONS.map((s) => ({ ...s, ...totals.byService[s.v] })).filter((r) => r.recurring || r.oneTime || r.pending);

  const markPaid = async (c: Charge) => {
    const { error } = await sb().from("tms_charges").update({ status: "paid", paid_on: t }).eq("id", c.id);
    if (error) return toast.error(errMsg(error));
    setCharges((l) => l.map((x) => (x.id === c.id ? { ...x, status: "paid", paid_on: t } : x)));
    toast.success("Marked paid");
  };

  return (
    <Page>
      <BillingFrame />
      <PageHeader
        eyebrow={<CompanyFilter />}
        title="Billing"
        actions={
          <>
            <Button variant="secondary" onClick={() => setEdit({ kind: "one_time" })} disabled={!companies.length}>
              <Plus className="h-4 w-4" /> One-time charge
            </Button>
            <Button variant="primary" onClick={() => setEdit({ kind: "subscription" })} disabled={!companies.length}>
              <Plus className="h-4 w-4" /> Subscription
            </Button>
          </>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Monthly recurring" value={money(totals.recurring, { cents: false })} sub={`${activeSubs} active subscription${activeSubs === 1 ? "" : "s"}`} />
        <Stat label="Billed this month" value={money(totals.billedThisMonth, { cents: false })} sub="One-time charges and invoices" />
        <Stat label="Pending" value={money(totals.pending, { cents: false })} sub={`${open.length} open invoice${open.length === 1 ? "" : "s"} · unpaid charges`} />
        <Stat label="Collected this month" value={money(totals.collectedThisMonth, { cents: false })} sub="Payments received" />
      </div>

      {serviceRows.length > 0 && (
        <Card className="mb-4">
          <CardHeader title="By service" />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-[13px]">
              <thead className="text-[11px] uppercase tracking-wider text-fg-4">
                <tr>
                  <th className="px-4 py-2 font-medium sm:px-5">Service</th>
                  <th className="px-3 py-2 text-right font-medium">Monthly recurring</th>
                  <th className="px-3 py-2 text-right font-medium">One-time this month</th>
                  <th className="px-4 py-2 text-right font-medium sm:px-5">Pending</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {serviceRows.map((r) => (
                  <tr key={r.v}>
                    <td className="px-4 py-2 font-medium text-fg sm:px-5">{r.label}</td>
                    <td className="tnum px-3 py-2 text-right">{r.recurring ? money(r.recurring) : "—"}</td>
                    <td className="tnum px-3 py-2 text-right">{r.oneTime ? money(r.oneTime) : "—"}</td>
                    <td className={cn("tnum px-4 py-2 text-right sm:px-5", r.pending && "text-amber-700 dark:text-amber-300")}>{r.pending ? money(r.pending) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title="Subscriptions" subtitle="Recurring charges per service" />
          {!subs.length ? (
            <Empty title={loaded ? "No subscriptions yet" : "Loading…"} className="py-8" />
          ) : (
            <ul className="divide-y divide-line">
              {subs.map((c) => (
                <li key={c.id} className="group flex items-center gap-3 px-4 py-2.5 sm:px-5">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-medium text-fg">{c.description}</div>
                    <div className="truncate text-xs text-fg-3">
                      {all && `${nameOf(c.company_id)} · `}
                      {chargeServiceLabel(c.service)} · since {c.start_date ? fmtDay(c.start_date, true) : "—"}
                      {c.end_date ? ` · until ${fmtDay(c.end_date, true)}` : ""}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="tnum text-[13px] font-semibold text-fg">
                      {money(c.amount)} <span className="font-normal text-fg-3">{intervalPer(c.billing_interval)}</span>
                    </div>
                    {c.billing_interval !== "monthly" && <div className="tnum text-[11px] text-fg-4">{money(monthly(c))} / month</div>}
                  </div>
                  <Pill className={SUB_STATUS[c.status].cls}>{SUB_STATUS[c.status].label}</Pill>
                  <button onClick={() => setEdit({ kind: c.kind, charge: c })} className="rounded p-1 text-fg-4 hover:text-fg" aria-label="Edit">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="One-time charges" subtitle="À la carte services" />
          {!once.length ? (
            <Empty title={loaded ? "No one-time charges yet" : "Loading…"} className="py-8" />
          ) : (
            <ul className="divide-y divide-line">
              {once.map((c) => (
                <li key={c.id} className="group flex items-center gap-3 px-4 py-2.5 sm:px-5">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-medium text-fg">{c.description}</div>
                    <div className="truncate text-xs text-fg-3">
                      {all && `${nameOf(c.company_id)} · `}
                      {chargeServiceLabel(c.service)} · {c.charge_date ? fmtDay(c.charge_date, true) : "—"}
                      {c.status === "paid" && c.paid_on ? ` · paid ${fmtDay(c.paid_on, true)}` : ""}
                    </div>
                  </div>
                  <div className="tnum text-[13px] font-semibold text-fg">{money(c.amount)}</div>
                  <Pill className={SUB_STATUS[c.status].cls}>{SUB_STATUS[c.status].label}</Pill>
                  {c.status === "unpaid" && (
                    <button onClick={() => markPaid(c)} className="rounded p-1 text-fg-4 hover:text-emerald-600" aria-label="Mark paid" title="Mark paid">
                      <CheckCircle2 className="h-4 w-4" />
                    </button>
                  )}
                  <button onClick={() => setEdit({ kind: c.kind, charge: c })} className="rounded p-1 text-fg-4 hover:text-fg" aria-label="Edit">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader title="Pending invoices" subtitle="Sent and not fully paid" />
        {!open.length ? (
          <Empty title="No pending invoices" className="py-8" />
        ) : (
          <ul className="divide-y divide-line">
            {open.map((i) => (
              <li key={i.id}>
                <Link href={`/invoices/${i.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-2/50 sm:px-5">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-medium text-fg">{i.invoice_number}</div>
                    <div className="truncate text-xs text-fg-3">
                      {all && `${nameOf(i.company_id)} · `}Dispatch · issued {fmtDay(i.issue_date, true)}
                      {i.due_date ? ` · charge ${fmtDay(i.due_date, true)}` : ""}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="tnum text-[13px] font-semibold text-fg">{money(invoiceOpen(i), { currency: i.currency })}</div>
                    {Number(i.amount_paid) > 0 && <div className="tnum text-[11px] text-fg-4">of {money(i.total_due, { currency: i.currency })}</div>}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {edit && (
        <ChargeModal
          kind={edit.kind}
          charge={edit.charge}
          companyId={company?.id ?? null}
          onClose={() => setEdit(null)}
          onSaved={(c) => setCharges((l) => [c, ...l.filter((x) => x.id !== c.id)])}
          onDeleted={(id) => setCharges((l) => l.filter((x) => x.id !== id))}
        />
      )}
    </Page>
  );
}

function ChargeModal({
  kind,
  charge,
  companyId,
  onClose,
  onSaved,
  onDeleted,
}: {
  kind: Charge["kind"];
  charge?: Charge;
  /** the carrier on screen; null = choose one */
  companyId: string | null;
  onClose: () => void;
  onSaved: (c: Charge) => void;
  onDeleted: (id: string) => void;
}) {
  const { companies } = useStore();
  const sub = kind === "subscription";
  const [d, setD] = useState({
    company_id: charge?.company_id ?? companyId ?? "",
    service: (charge?.service ?? "dispatch") as ChargeService,
    description: charge?.description ?? "",
    amount: charge ? String(charge.amount) : "",
    billing_interval: charge?.billing_interval ?? "monthly",
    start_date: charge?.start_date ?? today(),
    end_date: charge?.end_date ?? "",
    charge_date: charge?.charge_date ?? today(),
    paid_on: charge?.paid_on ?? "",
    status: charge?.status ?? (sub ? "active" : "unpaid"),
    notes: charge?.notes ?? "",
  });
  const [saving, setSaving] = useState(false);
  const set = (p: Partial<typeof d>) => setD((x) => ({ ...x, ...p }));

  const save = async () => {
    if (!d.company_id) return toast.error("Choose the carrier.");
    if (!d.description.trim()) return toast.error("Describe the charge.");
    const amount = Number(d.amount);
    if (!(amount >= 0) || d.amount.trim() === "") return toast.error("Enter the amount.");
    const row = {
      company_id: d.company_id,
      service: d.service,
      kind,
      description: d.description.trim(),
      amount,
      billing_interval: sub ? d.billing_interval : null,
      start_date: sub ? d.start_date || null : null,
      end_date: sub ? d.end_date || null : null,
      charge_date: sub ? null : d.charge_date || today(),
      paid_on: !sub && d.status === "paid" ? d.paid_on || today() : null,
      status: d.status,
      notes: d.notes.trim() || null,
    };
    setSaving(true);
    const res = charge ? await sb().from("tms_charges").update(row).eq("id", charge.id).select().single() : await sb().from("tms_charges").insert(row).select().single();
    setSaving(false);
    if (res.error) return toast.error(errMsg(res.error));
    onSaved({ ...(res.data as Charge), amount: Number((res.data as Charge).amount) || 0 });
    toast.success(charge ? "Saved" : sub ? "Subscription added" : "Charge added");
    onClose();
  };

  const remove = async () => {
    if (!charge || !(await confirmDialog({ title: `Delete "${charge.description}"?`, confirmLabel: "Delete", danger: true }))) return;
    const { error } = await sb().from("tms_charges").delete().eq("id", charge.id);
    if (error) return toast.error(errMsg(error));
    onDeleted(charge.id);
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`${charge ? "Edit" : "Add"} ${sub ? "subscription" : "one-time charge"}`}
      footer={
        <>
          {charge && (
            <Button variant="ghost" className="mr-auto text-red-600" onClick={remove}>
              <Trash2 className="h-4 w-4" /> Delete
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} loading={saving}>
            Save
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        {!companyId && (
          <Field label="Carrier" required className="col-span-2">
            <Select value={d.company_id} onChange={(e) => set({ company_id: e.target.value })}>
              <option value="">Choose…</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Service">
          <Select value={d.service} onChange={(e) => set({ service: e.target.value as ChargeService })}>
            {SERVICE_OPTIONS.map((s) => (
              <option key={s.v} value={s.v}>
                {s.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Amount" required>
          <Input value={d.amount} onChange={(e) => set({ amount: e.target.value })} type="number" min={0} step="0.01" inputMode="decimal" />
        </Field>
        <Field label="Description" required className="col-span-2">
          <Input value={d.description} onChange={(e) => set({ description: e.target.value })} placeholder={sub ? "e.g. DOT compliance monthly plan" : "e.g. MCS-150 update, UCR filing"} />
        </Field>
        {sub ? (
          <>
            <Field label="Charged">
              <Select value={d.billing_interval} onChange={(e) => set({ billing_interval: e.target.value as typeof d.billing_interval })}>
                {INTERVALS.map((i) => (
                  <option key={i.v} value={i.v}>
                    {i.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Status">
              <Select value={d.status} onChange={(e) => set({ status: e.target.value as Charge["status"] })}>
                <option value="active">Active</option>
                <option value="paused">Paused</option>
                <option value="cancelled">Cancelled</option>
              </Select>
            </Field>
            <Field label="Start date">
              <Input type="date" value={d.start_date} onChange={(e) => set({ start_date: e.target.value })} />
            </Field>
            <Field label="End date" hint="Optional">
              <Input type="date" value={d.end_date} onChange={(e) => set({ end_date: e.target.value })} />
            </Field>
          </>
        ) : (
          <>
            <Field label="Date">
              <Input type="date" value={d.charge_date} onChange={(e) => set({ charge_date: e.target.value })} />
            </Field>
            <Field label="Status">
              <Select value={d.status} onChange={(e) => set({ status: e.target.value as Charge["status"], paid_on: e.target.value === "paid" ? d.paid_on || today() : "" })}>
                <option value="unpaid">Unpaid</option>
                <option value="paid">Paid</option>
                <option value="void">Void</option>
              </Select>
            </Field>
            {d.status === "paid" && (
              <Field label="Paid on">
                <Input type="date" value={d.paid_on} onChange={(e) => set({ paid_on: e.target.value })} />
              </Field>
            )}
          </>
        )}
        <Field label="Notes" className="col-span-2">
          <Textarea value={d.notes} onChange={(e) => set({ notes: e.target.value })} rows={2} />
        </Field>
      </div>
    </Modal>
  );
}
