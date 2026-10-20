import type { Invoice, InvoiceLine, PaymentMethod, Settings } from "./types";
import { addDays, today, uid } from "./format";

/** Monday of the week a day ("YYYY-MM-DD") falls in. */
export function mondayOf(day: string) {
  const [y, m, d] = day.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
  return addDays(day, -((dow + 6) % 7));
}

/**
 * Service period, always Monday to Monday: from the Monday of the first day's week to the
 * Monday after the last day's week (one week: Mon 10/12 – Mon 10/19).
 */
export function servicePeriod(days: string[]) {
  const list = days.filter(Boolean).sort();
  const first = list[0] || today();
  const last = list[list.length - 1] || first;
  return { period_start: mondayOf(first), period_end: addDays(mondayOf(last), 7) };
}

/** Auto charge date: the day after the invoice is built. */
export const autoChargeDate = () => addDays(today(), 1);

export type PayState = "draft" | "open" | "partial" | "overdue" | "paid" | "void";

/** What is still owed on an invoice. */
export const balance = (i: Pick<Invoice, "total_due" | "amount_paid" | "status">) =>
  i.status === "void" || i.status === "draft" ? 0 : Math.max(0, Math.round((i.total_due - (i.amount_paid || 0)) * 100) / 100);

/**
 * What the invoice means for collections. Overdue is worked out from the due date, never
 * stored, so it can't go stale; money received before then shows as part paid.
 */
export function payState(i: Pick<Invoice, "status" | "due_date" | "total_due" | "amount_paid">): PayState {
  if (i.status === "void") return "void";
  if (i.status === "paid") return "paid";
  if (i.status === "draft") return "draft";
  if (i.due_date && i.due_date < today()) return "overdue";
  return (i.amount_paid || 0) > 0 ? "partial" : "open";
}

export const PAY_META: Record<PayState, { label: string; pill: string; dot: string }> = {
  draft: { label: "Draft", pill: "bg-zinc-500/10 text-zinc-700 ring-zinc-600/20 dark:text-zinc-300", dot: "bg-zinc-400" },
  open: { label: "Sent", pill: "bg-blue-500/10 text-blue-700 ring-blue-600/20 dark:text-blue-300", dot: "bg-blue-500" },
  partial: { label: "Part paid", pill: "bg-teal-500/10 text-teal-700 ring-teal-600/20 dark:text-teal-300", dot: "bg-teal-500" },
  overdue: { label: "Overdue", pill: "bg-red-500/10 text-red-700 ring-red-600/20 dark:text-red-300", dot: "bg-red-500" },
  paid: { label: "Paid", pill: "bg-emerald-500/10 text-emerald-700 ring-emerald-600/20 dark:text-emerald-300", dot: "bg-emerald-500" },
  void: { label: "Void", pill: "bg-zinc-500/10 text-zinc-500 ring-zinc-600/20 line-through", dot: "bg-zinc-400" },
};

export const METHODS: { v: PaymentMethod; label: string }[] = [
  { v: "ach", label: "ACH" },
  { v: "zelle", label: "Zelle" },
  { v: "wire", label: "Wire" },
  { v: "check", label: "Check" },
  { v: "card", label: "Card" },
  { v: "cash", label: "Cash" },
  { v: "factoring", label: "Factoring company" },
  { v: "other", label: "Other" },
];
export const methodLabel = (m: PaymentMethod) => METHODS.find((x) => x.v === m)?.label || m;

/** Receivables by how late they are (standard A/R aging buckets). */
export const AGING = [
  { key: "current", label: "Not due", tone: "bg-emerald-500" },
  { key: "d30", label: "1–30 days", tone: "bg-amber-400" },
  { key: "d60", label: "31–60", tone: "bg-orange-500" },
  { key: "d90", label: "61–90", tone: "bg-red-500" },
  { key: "d90p", label: "90+", tone: "bg-red-700" },
] as const;
export type AgingKey = (typeof AGING)[number]["key"];

export function agingKey(due: string | null): AgingKey {
  if (!due || due >= today()) return "current";
  const days = Math.round((new Date(today()).getTime() - new Date(due).getTime()) / 86400000);
  return days <= 30 ? "d30" : days <= 60 ? "d60" : days <= 90 ? "d90" : "d90p";
}

export function aging(invoices: Invoice[]) {
  const out: Record<AgingKey, { amount: number; count: number }> = {
    current: { amount: 0, count: 0 },
    d30: { amount: 0, count: 0 },
    d60: { amount: 0, count: 0 },
    d90: { amount: 0, count: 0 },
    d90p: { amount: 0, count: 0 },
  };
  for (const i of invoices) {
    const b = balance(i);
    if (!b || i.currency !== "USD") continue;
    const k = agingKey(i.due_date);
    out[k].amount += b;
    out[k].count++;
  }
  return out;
}

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
    due_date: autoChargeDate(),
    ...servicePeriod([t]),
    total_gross: 0,
    total_due: 0,
    amount_paid: 0,
    notes: "",
    issuer_name: s?.issuer_name || "Trucking One Stop Shop LLC",
    issuer_address: s?.issuer_address || "",
    issuer_email: s?.issuer_email || "",
    issuer_phone: s?.issuer_phone || "",
    issuer_website: s?.issuer_website || "",
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
  kind: "item",
  truck_number: null,
  loaded_miles: null,
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

const r2 = (n: number) => Math.round(n * 100) / 100;
const sum = (lines: { amount: number }[]) => r2(lines.reduce((s, l) => s + (Number(l.amount) || 0), 0));

/**
 * Invoice math: line items (load fees / custom lines) + additional charges − credits.
 * Credits are stored as positive amounts with kind "credit".
 */
export const totals = (d: Pick<InvoiceDraft, "lines" | "invoice_type">) => {
  const items = d.lines.filter((l) => (l.kind || "item") === "item");
  const subtotal = sum(items);
  const charges = sum(d.lines.filter((l) => l.kind === "charge"));
  const credits = sum(d.lines.filter((l) => l.kind === "credit"));
  const due = Math.max(0, r2(subtotal + charges - credits));
  const gross = r2(items.reduce((s, l) => s + (Number(l.gross_amount) || 0), 0));
  return { subtotal, charges, credits, due, gross: d.invoice_type === "load" ? gross : subtotal };
};

export const CHARGE_PRESETS = ["Late payment fee", "Additional dispatch service", "Detention / layover handling", "Factoring setup fee", "Paperwork & document handling"];
export const CREDIT_PRESETS = ["Discount", "Credit from previous invoice", "Fee waived", "Overpayment credit", "Canceled load credit"];

/** A billing adjustment line (additional charge or credit). */
export const adjustmentLine = (kind: "charge" | "credit", position: number, description = "", amount = 0): InvoiceDraft["lines"][number] => ({
  ...blankLine(position),
  kind,
  description,
  quantity: 1,
  unit_price: amount,
  amount,
  gross_amount: 0,
});

/** Header row for saving (totals recomputed from lines). */
export function draftToRow(d: InvoiceDraft) {
  const t = totals(d);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { lines, ...head } = d;
  // amount_paid is never written here: it is the sum of recorded payments (database trigger).
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { amount_paid, ...rest } = head;
  return { ...rest, total_due: t.due, total_gross: t.gross };
}

export const remittanceDefault = (s: Settings | null) =>
  s?.remittance_text || "Please pay by ACH, wire transfer or Zelle within the agreed payment terms.";
