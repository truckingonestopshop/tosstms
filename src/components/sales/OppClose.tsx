"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Checkbox, Field, Select, Textarea } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { errMsg, sb } from "@/lib/db";
import { useStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import { money, today } from "@/lib/format";
import { itemTotal, type OppStatus, type Opportunity } from "@/lib/sales";
import { useSales } from "./SalesProvider";

// Closing opportunities: Lost asks for a reason, Won offers the next steps (lead → client, the
// products into Billing, an invoice or a case). Abandoned and Reopen apply straight away.

type Pending = { ids: string[]; status: OppStatus };

/** Writes a patch to several opportunities and keeps the live list in step. */
export function usePatchOpps() {
  const { opps } = useSales();
  return async (ids: string[], patch: Partial<Opportunity>) => {
    if (!ids.length) return false;
    const { data, error } = await sb().from("tms_opportunities").update(patch).in("id", ids).select();
    if (error) return toast.error(errMsg(error)), false;
    for (const o of (data || []) as Opportunity[]) opps.put(o);
    return true;
  };
}

export function useCloseFlow() {
  const [pending, setPending] = useState<Pending | null>(null);
  const patch = usePatchOpps();
  const close = async (ids: string[], status: OppStatus) => {
    if (status === "won" || status === "lost") return setPending({ ids, status });
    if (await patch(ids, { status, lost_reason_id: null })) toast.success(status === "open" ? "Reopened" : `Marked ${status}`);
  };
  const node = <CloseModal value={pending} onClose={() => setPending(null)} />;
  return [close, node] as const;
}

function CloseModal({ value, onClose }: { value: Pending | null; onClose: () => void }) {
  const router = useRouter();
  const { opps, items, reasons } = useSales();
  const { companyById, updateCompany } = useStore();
  const patch = usePatchOpps();
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [makeClient, setMakeClient] = useState(true);
  const [billing, setBilling] = useState(true);
  const [next, setNext] = useState<"" | "invoice" | "case">("");
  const [busy, setBusy] = useState(false);
  const [opened, setOpened] = useState<Pending | null>(null);
  if (value !== opened) {
    setOpened(value);
    setReason("");
    setNote("");
    setMakeClient(true);
    setBilling(true);
    setNext("");
  }
  if (!value) return null;

  const list = opps.rows.filter((o) => value.ids.includes(o.id));
  const leads = [...new Set(list.map((o) => o.company_id))].map((id) => companyById(id)).filter((c) => c?.stage === "lead");
  const lines = items.rows.filter((i) => value.ids.includes(i.opportunity_id));
  const one = list.length === 1 ? list[0] : null;
  const won = value.status === "won";

  const go = async () => {
    if (!won && !reason) return toast.error("Pick why it was lost");
    setBusy(true);
    const ok = await patch(value.ids, { status: value.status, lost_reason_id: won ? null : reason });
    if (!ok) return setBusy(false);
    if (note.trim()) await sb().from("tms_opportunity_events").insert(value.ids.map((id) => ({ opportunity_id: id, kind: "note", message: note.trim() })));
    if (won) {
      if (makeClient) for (const c of leads) if (c) await updateCompany(c.id, { stage: "client" });
      if (billing && lines.length) {
        const t = today();
        const rows = lines.map((i) => {
          const o = list.find((x) => x.id === i.opportunity_id)!;
          const sub = i.kind === "subscription";
          return {
            company_id: o.company_id,
            service: i.service,
            kind: i.kind,
            description: Number(i.quantity) !== 1 ? `${i.name} × ${Number(i.quantity)}` : i.name,
            amount: itemTotal(i),
            billing_interval: sub ? i.billing_interval || "monthly" : null,
            start_date: sub ? t : null,
            charge_date: sub ? null : t,
            status: sub ? "active" : "unpaid",
            notes: `From OPP-${o.number}`,
          };
        });
        const { error } = await sb().from("tms_charges").insert(rows);
        if (error) toast.error(`Billing: ${errMsg(error)}`);
      }
    }
    setBusy(false);
    toast.success(won ? `Won${list.length > 1 ? ` (${list.length})` : ""}` : `Marked lost${list.length > 1 ? ` (${list.length})` : ""}`);
    onClose();
    if (won && one && next === "invoice") router.push(`/invoices/new?opportunity=${one.id}`);
    if (won && one && next === "case") router.push(`/cases?new=1&company=${one.company_id}&opportunity=${one.id}`);
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={won ? (one ? `Won: ${one.title}` : `Mark ${list.length} won`) : one ? `Lost: ${one.title}` : `Mark ${list.length} lost`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant={won ? "primary" : "danger"} onClick={go} loading={busy}>
            {won ? "Mark won" : "Mark lost"}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {!won && (
          <Field label="Why was it lost?" required>
            <Select value={reason} onChange={(e) => setReason(e.target.value)} autoFocus>
              <option value="">Select…</option>
              {reasons.rows
                .filter((r) => r.active)
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
            </Select>
          </Field>
        )}
        {won && (
          <div className="space-y-2.5">
            <div className="text-[13px] font-semibold text-fg">Next steps</div>
            {leads.length > 0 && (
              <Checkbox checked={makeClient} onChange={setMakeClient} label={leads.length === 1 ? `Make ${leads[0]!.name} a client` : `Make ${leads.length} leads clients`} />
            )}
            {lines.length > 0 && (
              <Checkbox
                checked={billing}
                onChange={setBilling}
                label={`Add ${lines.length} product${lines.length === 1 ? "" : "s"} to Billing (${money(
                  lines.reduce((s, i) => s + itemTotal(i), 0),
                  { cents: false },
                )})`}
              />
            )}
            {one && (
              <Field label="Then">
                <Select value={next} onChange={(e) => setNext(e.target.value as typeof next)}>
                  <option value="">Stay here</option>
                  <option value="invoice">Create an invoice</option>
                  <option value="case">Open a case (onboarding)</option>
                </Select>
              </Field>
            )}
          </div>
        )}
        <Field label="Note" hint="Saved in the history">
          <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
