// Dashboard numbers for a period, compared with the period just before it. TOSS revenue =
// dispatch fees on loads + one-time charges + subscriptions (their monthly value for the days of the
// period). Everything is limited by the caller to the carriers in view.

import { addDays, isCanceled, today } from "./format";
import { loadDay } from "./analytics";
import { monthly, type Charge } from "./billing";
import type { InvoicePayment, Load } from "./types";

export type Period = "month" | "last_month" | "90d" | "year";
export const PERIODS: { v: Period; label: string }[] = [
  { v: "month", label: "This month" },
  { v: "last_month", label: "Last month" },
  { v: "90d", label: "Last 90 days" },
  { v: "year", label: "This year" },
];

export interface Range {
  from: string;
  to: string;
}

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const days = (r: Range) => Math.round((new Date(r.to).getTime() - new Date(r.from).getTime()) / 86400000) + 1;

/** The period and the one before it (same length; for months, the month before). */
export function ranges(p: Period, t = today()): { cur: Range; prev: Range } {
  const d = new Date(`${t}T12:00:00`);
  if (p === "month" || p === "last_month") {
    const back = p === "month" ? 0 : 1;
    const start = new Date(d.getFullYear(), d.getMonth() - back, 1);
    const end = p === "month" ? d : new Date(d.getFullYear(), d.getMonth(), 0);
    const pStart = new Date(start.getFullYear(), start.getMonth() - 1, 1);
    // This month so far vs the same days of last month.
    const pEnd = p === "month" ? new Date(pStart.getFullYear(), pStart.getMonth(), Math.min(d.getDate(), new Date(start.getFullYear(), start.getMonth(), 0).getDate())) : new Date(start.getFullYear(), start.getMonth(), 0);
    return { cur: { from: ymd(start), to: ymd(end) }, prev: { from: ymd(pStart), to: ymd(pEnd) } };
  }
  if (p === "year") {
    const start = new Date(d.getFullYear(), 0, 1);
    const pStart = new Date(d.getFullYear() - 1, 0, 1);
    const pEnd = new Date(d.getFullYear() - 1, d.getMonth(), d.getDate());
    return { cur: { from: ymd(start), to: t }, prev: { from: ymd(pStart), to: ymd(pEnd) } };
  }
  const from = addDays(t, -89);
  return { cur: { from, to: t }, prev: { from: addDays(from, -90), to: addDays(from, -1) } };
}

export const inRange = (day: string | null | undefined, r: Range) => !!day && day.slice(0, 10) >= r.from && day.slice(0, 10) <= r.to;

/** Days of the subscription that fall in the range. */
function overlap(c: Charge, r: Range) {
  if (c.kind !== "subscription" || c.status === "cancelled") return 0;
  const from = c.start_date && c.start_date > r.from ? c.start_date : r.from;
  const end = c.end_date && c.end_date < r.to ? c.end_date : r.to;
  if (from > end) return 0;
  // Paused subscriptions count only while active (today's status is all we know).
  if (c.status !== "active") return 0;
  return days({ from, to: end });
}

export interface Money {
  fees: number;
  oneTime: number;
  subscriptions: number;
  total: number;
  collected: number;
}

/** TOSS revenue in the range and what was collected. */
export function revenue(loads: Load[], charges: Charge[], payments: InvoicePayment[], r: Range): Money {
  const fees = loads.filter((l) => !isCanceled(l.status) && inRange(loadDay(l), r)).reduce((s, l) => s + (Number(l.dispatcher_cut) || 0), 0);
  const oneTime = charges.filter((c) => c.kind === "one_time" && c.status !== "void" && inRange(c.charge_date, r)).reduce((s, c) => s + (Number(c.amount) || 0), 0);
  const subscriptions = charges.reduce((s, c) => s + (monthly(c) * overlap(c, r)) / 30.44, 0);
  const collected =
    payments.filter((p) => inRange(p.paid_on, r)).reduce((s, p) => s + (Number(p.amount) || 0), 0) +
    charges.filter((c) => c.kind === "one_time" && c.status === "paid" && inRange(c.paid_on, r)).reduce((s, c) => s + (Number(c.amount) || 0), 0);
  return { fees, oneTime, subscriptions, total: fees + oneTime + subscriptions, collected };
}

/** The last n calendar months as ranges (oldest first), with a short label. */
export function lastMonths(n: number, t = today()): (Range & { label: string })[] {
  const d = new Date(`${t}T12:00:00`);
  return Array.from({ length: n }, (_, i) => {
    const start = new Date(d.getFullYear(), d.getMonth() - (n - 1 - i), 1);
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
    return { from: ymd(start), to: ymd(end > d ? d : end), label: start.toLocaleDateString("en-US", { month: "short" }) };
  });
}

/** Change vs the previous period, in percent (null when there's nothing to compare). */
export const change = (cur: number, prev: number) => (prev ? Math.round(((cur - prev) / Math.abs(prev)) * 100) : cur ? null : 0);

export const weeksIn = (r: Range) => Math.max(1, days(r) / 7);
