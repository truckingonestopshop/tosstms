"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { Empty } from "@/components/ui/Bits";
import { CountUp, stagger } from "@/components/ui/Motion";
import { AdjustmentsEditor, adjustmentsTotal, type Adjustment } from "./AdjustmentsEditor";
import { useStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import { addDays, cut, fmtDay, lane, money, today } from "@/lib/format";
import { checklist, problems, shortName } from "@/lib/docs";
import type { Load } from "@/lib/types";

/** Loads that can still be billed: delivered and not on a live invoice. */
export function useBillable() {
  const { loads, invoices } = useStore();
  return useMemo(() => {
    const onInvoice = new Set(invoices.filter((i) => i.status !== "void").flatMap((i) => i.lines.map((l) => l.load_id).filter(Boolean)));
    return loads.filter((l) => l.status === "delivered" && !onInvoice.has(l.id));
  }, [loads, invoices]);
}

export function InvoiceBuilder({ open, onClose, companyId: initial }: { open: boolean; onClose: () => void; companyId?: string | null }) {
  const router = useRouter();
  const { companies, companyById, createInvoiceFromLoads, loads, documents, docTypes } = useStore();
  // Paperwork a delivered load should have (rate con, BOL, POD): shown so nothing gets billed blind.
  const missingFor = (l: Load) =>
    problems(checklist(docTypes, documents, { scope: "load", id: l.id, companyId: l.company_id, status: l.status }))
      .map((i) => shortName(i.type))
      .join(", ");
  const billable = useBillable();
  const [companyId, setCompanyId] = useState(initial || "");
  const [showAll, setShowAll] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [issue, setIssue] = useState(today());
  const [due, setDue] = useState("");
  const [notes, setNotes] = useState("");
  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);
  const [saving, setSaving] = useState(false);
  const company = companyById(companyId);

  const candidates: Load[] = useMemo(() => {
    if (!companyId) return [];
    const base = showAll
      ? loads.filter((l) => l.company_id === companyId && ["booked", "in_transit", "delivered"].includes(l.status) && (billable.includes(l) || l.status !== "delivered"))
      : billable.filter((l) => l.company_id === companyId);
    return base.sort((a, b) => (a.delivery_date || "").localeCompare(b.delivery_date || ""));
  }, [companyId, showAll, billable, loads]);

  useEffect(() => {
    if (!open) return;
    const c = initial || (companies.length === 1 ? companies[0].id : "");
    setCompanyId(c);
    setShowAll(false);
    setIssue(today());
    setNotes("");
    setAdjustments([]);
  }, [open, initial, companies]);

  useEffect(() => {
    setPicked(new Set(billable.filter((l) => l.company_id === companyId).map((l) => l.id)));
    setAmounts({});
    if (company) setDue(addDays(issue, company.payment_terms_days));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  const fee = (l: Load) => (amounts[l.id] !== undefined ? Number(amounts[l.id]) || 0 : cut(l.gross_amount, l.commission_percent));
  const chosen = candidates.filter((l) => picked.has(l.id));
  const fees = chosen.reduce((s, l) => s + fee(l), 0);
  const total = Math.max(0, fees + adjustmentsTotal(adjustments));
  const gross = chosen.reduce((s, l) => s + l.gross_amount, 0);

  const create = async () => {
    if (!companyId || !chosen.length) return;
    if (adjustments.some((a) => !a.description.trim() || !(Number(a.amount) > 0)))
      return toast.error("Each billing adjustment needs a description and an amount (or remove it).");
    setSaving(true);
    const inv = await createInvoiceFromLoads(companyId, chosen.map((l) => l.id), {
      issue_date: issue,
      due_date: due || undefined,
      notes: notes || undefined,
      amounts: Object.fromEntries(chosen.map((l) => [l.id, fee(l)])),
      adjustments: adjustments.map((a) => ({ kind: a.kind, description: a.description, amount: Number(a.amount) || 0 })),
    });
    setSaving(false);
    if (inv) {
      toast.success(`Invoice ${inv.invoice_number} created`);
      onClose();
      router.push(`/invoices/${inv.id}`);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="Bill delivered loads"
      subtitle="Creates a dispatch fee invoice for one carrier. Loads move to Invoiced."
      footer={
        <>
          <div className="mr-auto text-[13px] text-fg-3">
            <span className="tnum font-semibold text-fg">{money(total)}</span> · {chosen.length} load{chosen.length === 1 ? "" : "s"}
          </div>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={create} loading={saving} disabled={!chosen.length}>
            Create invoice
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Carrier" className="sm:col-span-3">
            <Select value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
              <option value="">Select…</option>
              {companies.map((c) => {
                const n = billable.filter((l) => l.company_id === c.id).length;
                return (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {n ? ` — ${n} ready` : ""}
                  </option>
                );
              })}
            </Select>
          </Field>
          <Field label="Issue date">
            <Input type="date" value={issue} onChange={(e) => setIssue(e.target.value)} />
          </Field>
          <Field label="Due date" hint={company ? `Net ${company.payment_terms_days} days` : undefined}>
            <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          </Field>
          <Field label="Fee">
            <div className="flex h-9 items-center rounded-lg bg-surface-2 px-3 text-sm text-fg-2">{company ? `${company.commission_percent}% · ${company.billing_cadence}` : "—"}</div>
          </Field>
        </div>

        {companyId && (
          <div>
            <div className="mb-2 flex items-center justify-between">
              <Checkbox
                checked={candidates.length > 0 && candidates.every((l) => picked.has(l.id))}
                indeterminate={chosen.length > 0}
                onChange={(v) => setPicked(v ? new Set(candidates.map((l) => l.id)) : new Set())}
                label={<span className="text-xs font-semibold text-fg-2">Select all</span>}
              />
              <Checkbox checked={showAll} onChange={setShowAll} label={<span className="text-xs text-fg-3">Include loads not delivered yet</span>} />
            </div>
            {candidates.length === 0 ? (
              <Empty title="Nothing ready to bill" body="Mark loads Delivered first, or include loads not delivered yet." className="py-8" />
            ) : (
              <ul className="divide-y divide-line rounded-xl border border-line">
                {candidates.map((l, n) => (
                  <li key={l.id} className="animate-rise flex items-center gap-3 px-3 py-2.5" style={stagger(n)}>
                    <Checkbox
                      checked={picked.has(l.id)}
                      onChange={(v) =>
                        setPicked((s) => {
                          const n = new Set(s);
                          if (v) n.add(l.id);
                          else n.delete(l.id);
                          return n;
                        })
                      }
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-medium text-fg">{lane(l)}</div>
                      <div className="truncate text-xs text-fg-3">
                        {l.load_number ? `#${l.load_number} · ` : ""}
                        {fmtDay(l.delivery_date)} · {money(l.gross_amount, { cents: false })} gross
                        {l.status !== "delivered" ? ` · ${l.status.replace("_", " ")}` : ""}
                      </div>
                      {missingFor(l) && <div className="truncate text-xs font-medium text-amber-800 dark:text-amber-300">Missing {missingFor(l)}</div>}
                    </div>
                    <Input
                      value={amounts[l.id] ?? cut(l.gross_amount, l.commission_percent).toFixed(2)}
                      onChange={(e) => setAmounts((a) => ({ ...a, [l.id]: e.target.value.replace(/[^0-9.]/g, "") }))}
                      prefix="$"
                      inputMode="decimal"
                      className="h-8 w-28 text-right"
                    />
                  </li>
                ))}
              </ul>
            )}
            {chosen.length > 0 && (
              <div className="tnum mt-2 text-right text-xs text-fg-3">
                <CountUp value={gross} format={(v) => money(v)} /> gross → <CountUp value={fees} format={(v) => money(v)} /> fees
                {adjustments.length > 0 && <> → <span className="font-semibold text-fg"><CountUp value={total} format={(v) => money(v)} /></span> due</>}
              </div>
            )}
          </div>
        )}
        {companyId && <AdjustmentsEditor value={adjustments} onChange={setAdjustments} />}
        <Field label="Note on the invoice" hint="Leave empty for the standard note">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </Field>
      </div>
    </Modal>
  );
}
