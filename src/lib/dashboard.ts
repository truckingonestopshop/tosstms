// Dashboard numbers for a period, compared with the period just before it. TOSS revenue =
// dispatch fees on loads + one-time charges + subscriptions (their monthly value for the days of the
// period). Everything is limited by the caller to the carriers in view.

import { addDays, fmtDay, isCanceled, today } from "./format";
import { loadDay } from "./analytics";
import { monthly, type Charge } from "./billing";
import type { InvoicePayment, Load } from "./types";

export type Period = "today" | "yesterday" | "week" | "last_week" | "month" | "last_month" | "90d" | "year" | "custom";
export const PERIODS: { v: Period; label: string }[] = [
  { v: "today", label: "Today" },
  { v: "yesterday", label: "Yesterday" },
  { v: "week", label: "This week" },
  { v: "last_week", label: "Last week" },
  { v: "month", label: "This month" },
  { v: "last_month", label: "Last month" },
  { v: "90d", label: "Last 90 days" },
  { v: "year", label: "This year" },
  { v: "custom", label: "Custom" },
];

export interface Range {
  from: string;
  to: string;
}

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const days = (r: Range) => Math.round((new Date(r.to).getTime() - new Date(r.from).getTime()) / 86400000) + 1;

/** The period and the one before it (same length; for months, the month before). */
export function ranges(p: Period, t = today(), custom?: Range): { cur: Range; prev: Range } {
  const d = new Date(`${t}T12:00:00`);
  // Dates the person picked (either order) vs the same number of days just before.
  if (p === "custom" && custom?.from && custom.to) {
    const [from, to] = custom.from <= custom.to ? [custom.from, custom.to] : [custom.to, custom.from];
    const n = days({ from, to });
    return { cur: { from, to }, prev: { from: addDays(from, -n), to: addDays(from, -1) } };
  }
  if (p === "custom") return ranges("month", t);
  // A day vs the day before.
  if (p === "today" || p === "yesterday") {
    const day = p === "today" ? t : addDays(t, -1);
    return { cur: { from: day, to: day }, prev: { from: addDays(day, -1), to: addDays(day, -1) } };
  }
  // Weeks run Monday to Sunday; this week so far vs the same days of last week.
  if (p === "week" || p === "last_week") {
    const monday = addDays(t, -((d.getDay() + 6) % 7));
    if (p === "week") return { cur: { from: monday, to: t }, prev: { from: addDays(monday, -7), to: addDays(t, -7) } };
    return { cur: { from: addDays(monday, -7), to: addDays(monday, -1) }, prev: { from: addDays(monday, -14), to: addDays(monday, -8) } };
  }
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

/** How a period reads in a sentence ("this month", "10/01/2026 – 10/15/2026"). */
export const periodName = (p: Period, cur: Range) => (p === "custom" ? `${fmtDay(cur.from)} – ${fmtDay(cur.to)}` : PERIODS.find((x) => x.v === p)!.label.toLowerCase());

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
