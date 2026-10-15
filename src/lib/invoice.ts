import type { Invoice, InvoiceLine, Settings } from "./types";
import { addDays, today, uid } from "./format";

export type PayState = "draft" | "open" | "overdue" | "paid" | "void";

/** What the invoice means for collections (draft / open / overdue / paid / void). */
export function payState(i: Pick<Invoice, "status" | "due_date">): PayState {
  if (i.status === "void") return "void";
  if (i.status === "paid") return "paid";
  if (i.status === "draft") return "draft";
  return i.due_date && i.due_date < today() ? "overdue" : "open";
}

export const PAY_META: Record<PayState, { label: string; pill: string; dot: string }> = {
  draft: { label: "Draft", pill: "bg-zinc-500/10 text-zinc-700 ring-zinc-600/20 dark:text-zinc-300", dot: "bg-zinc-400" },
  open: { label: "Sent", pill: "bg-blue-500/10 text-blue-700 ring-blue-600/20 dark:text-blue-300", dot: "bg-blue-500" },
  overdue: { label: "Overdue", pill: "bg-red-500/10 text-red-700 ring-red-600/20 dark:text-red-300", dot: "bg-red-500" },
  paid: { label: "Paid", pill: "bg-emerald-500/10 text-emerald-700 ring-emerald-600/20 dark:text-emerald-300", dot: "bg-emerald-500" },
  void: { label: "Void", pill: "bg-zinc-500/10 text-zinc-500 ring-zinc-600/20 line-through", dot: "bg-zinc-400" },
};

/** Editable copy of an invoice (header fields + lines). */
export type InvoiceDraft = Omit<Invoice, "id" | "created_at" | "updated_at" | "sent_at" | "paid_at" | "lines"> & {
  lines: (Omit<InvoiceLine, "id" | "invoice_id"> & { id?: string })[];
};

export function draftOf(i: Invoice): InvoiceDraft {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { id, created_at, updated_at, sent_at, paid_at, lines, ...rest } = i;
  return { ...rest, doc_overrides: { ...(i.doc_overrides || {}) }, lines: lines.map((l) => ({ ...l })) };
}

export function blankDraft(s: Settings | null, number: string): InvoiceDraft {
  const t = today();
  return {
    company_id: null,
    invoice_number: number,
    invoice_type: "custom",
    status: "draft",
    currency: "USD",
    issue_date: t,
    due_date: addDays(t, 30),
    period_start: t,
    period_end: t,
    total_gross: 0,
    total_due: 0,
    amount_paid: 0,
    notes: "",
    issuer_name: s?.issuer_name || "Trucking One Stop Shop LLC",
    issuer_address: s?.issuer_address || "",
    issuer_email: s?.issuer_email || "",
    issuer_phone: s?.issuer_phone || "",
    bill_to_name: "",
    bill_to_details: "",
    doc_overrides: {},
    lines: [blankLine(0)],
  };
}

export const blankLine = (position: number): InvoiceDraft["lines"][number] => ({
  id: uid(),
  load_id: null,
  position,
  description: "",
  line_date: today(),
  quantity: 1,
  unit_price: 0,
  gross_amount: 0,
  amount: 0,
  load_number: null,
  rate_con_number: null,
  broker_name: null,
  driver_name: null,
  origin: null,
  destination: null,
  pickup_date: null,
  delivery_date: null,
});

export const totals = (d: Pick<InvoiceDraft, "lines" | "invoice_type">) => {
  const due = Math.round(d.lines.reduce((s, l) => s + (Number(l.amount) || 0), 0) * 100) / 100;
  const gross = Math.round(d.lines.reduce((s, l) => s + (Number(l.gross_amount) || 0), 0) * 100) / 100;
  return { due, gross: d.invoice_type === "load" ? gross : due };
};

/** Header row for saving (totals recomputed from lines). */
export function draftToRow(d: InvoiceDraft) {
  const t = totals(d);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { lines, ...head } = d;
  return { ...head, total_due: t.due, total_gross: t.gross, amount_paid: d.status === "paid" ? t.due : 0 };
}

export const remittanceDefault = (s: Settings | null) =>
  s?.remittance_text || "Please pay by ACH, wire transfer or Zelle within the agreed payment terms.";
