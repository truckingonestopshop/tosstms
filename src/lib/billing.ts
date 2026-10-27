// Billing: everything TOSS charges a carrier, across services. Subscriptions and one-time charges
// live in tms_charges (migration 0024); invoices are TOSS Cloud's own (dispatch fees today).

import type { Invoice, InvoicePayment, ServiceKey } from "./types";

export type ChargeService = ServiceKey | "other";
export type ChargeInterval = "weekly" | "monthly" | "quarterly" | "yearly";

export interface Charge {
  id: string;
  company_id: string;
  service: ChargeService;
  kind: "subscription" | "one_time";
  description: string;
  amount: number;
  billing_interval: ChargeInterval | null;
  start_date: string | null;
  end_date: string | null;
  charge_date: string | null;
  paid_on: string | null;
  status: "active" | "paused" | "cancelled" | "unpaid" | "paid" | "void";
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export const INTERVALS: { v: ChargeInterval; label: string; per: string }[] = [
  { v: "weekly", label: "Weekly", per: "/ week" },
  { v: "monthly", label: "Monthly", per: "/ month" },
  { v: "quarterly", label: "Quarterly", per: "/ quarter" },
  { v: "yearly", label: "Yearly", per: "/ year" },
];
export const intervalPer = (v: ChargeInterval | null) => INTERVALS.find((i) => i.v === v)?.per ?? "";

/** What a subscription brings in per month. */
export function monthly(c: Pick<Charge, "amount" | "billing_interval">) {
  const a = Number(c.amount) || 0;
  switch (c.billing_interval) {
    case "weekly":
      return (a * 52) / 12;
    case "quarterly":
      return a / 3;
    case "yearly":
      return a / 12;
    default:
      return a;
  }
}

/** A subscription counts while active and not ended. */
export const runningSub = (c: Charge, today: string) => c.kind === "subscription" && c.status === "active" && (!c.end_date || c.end_date >= today);

/** What's still owed on an invoice (sent, not fully paid). */
export const invoiceOpen = (i: Invoice) => (i.status === "sent" ? Math.max(0, (Number(i.total_due) || 0) - (Number(i.amount_paid) || 0)) : 0);

export interface BillingTotals {
  recurring: number;
  billedThisMonth: number;
  pending: number;
  collectedThisMonth: number;
  byService: Record<ChargeService, { recurring: number; oneTime: number; pending: number }>;
}

const SERVICE_KEYS: ChargeService[] = ["dispatch", "dot_compliance", "mcpt", "accounting", "factoring", "fuel_card", "insurance", "other"];

/** The dashboard numbers for the charges and invoices given (already limited to the carriers shown). */
export function billingTotals(charges: Charge[], invoices: Invoice[], payments: InvoicePayment[], today: string): BillingTotals {
  const month = today.slice(0, 7);
  const byService = Object.fromEntries(SERVICE_KEYS.map((k) => [k, { recurring: 0, oneTime: 0, pending: 0 }])) as BillingTotals["byService"];
  const t: BillingTotals = { recurring: 0, billedThisMonth: 0, pending: 0, collectedThisMonth: 0, byService };
  for (const c of charges) {
    const s = byService[c.service] ?? byService.other;
    if (runningSub(c, today)) {
      t.recurring += monthly(c);
      s.recurring += monthly(c);
    }
    if (c.kind === "one_time" && c.status !== "void") {
      if ((c.charge_date || "").startsWith(month)) {
        t.billedThisMonth += Number(c.amount) || 0;
        s.oneTime += Number(c.amount) || 0;
      }
      if (c.status === "unpaid") {
        t.pending += Number(c.amount) || 0;
        s.pending += Number(c.amount) || 0;
      }
      if (c.status === "paid" && (c.paid_on || "").startsWith(month)) t.collectedThisMonth += Number(c.amount) || 0;
    }
  }
  // TOSS Cloud invoices are dispatch fees.
  const ids = new Set(invoices.map((i) => i.id));
  for (const i of invoices) {
    if (i.status === "void" || i.status === "draft") continue;
    if (i.issue_date.startsWith(month)) t.billedThisMonth += Number(i.total_due) || 0;
    const open = invoiceOpen(i);
    t.pending += open;
    byService.dispatch.pending += open;
  }
  for (const p of payments) if (ids.has(p.invoice_id) && p.paid_on.startsWith(month)) t.collectedThisMonth += Number(p.amount) || 0;
  return t;
}
