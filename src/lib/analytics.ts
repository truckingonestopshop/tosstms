import type { Load } from "./types";
import { addDays, isCanceled, parseDay, toDay, today } from "./format";

export type RangeKey = "7d" | "30d" | "90d" | "mtd" | "last_month" | "ytd" | "12m" | "all" | "custom";

export const RANGE_LABEL: Record<RangeKey, string> = {
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  mtd: "This month",
  last_month: "Last month",
  ytd: "This year",
  "12m": "Last 12 months",
  all: "All time",
  custom: "Custom",
};

export function rangeDates(k: RangeKey, from?: string, to?: string): { from: string; to: string } {
  const t = today();
  const d = new Date();
  switch (k) {
    case "7d":
      return { from: addDays(t, -6), to: t };
    case "30d":
      return { from: addDays(t, -29), to: t };
    case "90d":
      return { from: addDays(t, -89), to: t };
    case "mtd":
      return { from: toDay(new Date(d.getFullYear(), d.getMonth(), 1)), to: t };
    case "last_month":
      return { from: toDay(new Date(d.getFullYear(), d.getMonth() - 1, 1)), to: toDay(new Date(d.getFullYear(), d.getMonth(), 0)) };
    case "ytd":
      return { from: `${d.getFullYear()}-01-01`, to: t };
    case "12m":
      return { from: toDay(new Date(d.getFullYear(), d.getMonth() - 11, 1)), to: t };
    case "custom":
      return { from: from || addDays(t, -29), to: to || t };
    default:
      return { from: "2000-01-01", to: "2999-12-31" };
  }
}

/** A load counts on its delivery day (pickup day if not set). Canceled loads never count. */
export const loadDay = (l: Load) => l.delivery_date || l.pickup_date || l.created_at.slice(0, 10);
export const inWindow = (l: Load, r: { from: string; to: string }) => {
  const d = loadDay(l);
  return !isCanceled(l.status) && d >= r.from && d <= r.to;
};

export type Grain = "day" | "week" | "month";
export function grainFor(r: { from: string; to: string }, loads: Load[]): Grain {
  const from = r.from === "2000-01-01" && loads.length ? loads.map(loadDay).sort()[0] : r.from;
  const days = ((parseDay(r.to)?.getTime() || 0) - (parseDay(from)?.getTime() || 0)) / 86400000;
  if (days <= 31) return "day";
  if (days <= 190) return "week";
  return "month";
}

function bucket(day: string, g: Grain) {
  if (g === "day") return day;
  const d = parseDay(day)!;
  if (g === "month") return `${day.slice(0, 7)}-01`;
  const w = new Date(d);
  w.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return toDay(w);
}

export function bucketLabel(key: string, g: Grain) {
  const d = parseDay(key)!;
  if (g === "month") return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
  if (g === "week") return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export interface Point {
  key: string;
  label: string;
  gross: number;
  fee: number;
  loads: number;
  loaded: number;
  miles: number;
}

/** Time series with empty buckets filled in, so gaps read as zero, not as missing. */
export function series(loads: Load[], r: { from: string; to: string }, g: Grain): Point[] {
  const m = new Map<string, Point>();
  const keys: string[] = [];
  const first = r.from === "2000-01-01" ? (loads.map(loadDay).sort()[0] ?? today()) : r.from;
  let cur = bucket(first, g);
  const end = bucket(r.to > today() && r.to === "2999-12-31" ? today() : r.to, g);
  let guard = 0;
  while (cur <= end && guard++ < 400) {
    keys.push(cur);
    m.set(cur, { key: cur, label: bucketLabel(cur, g), gross: 0, fee: 0, loads: 0, loaded: 0, miles: 0 });
    const d = parseDay(cur)!;
    if (g === "day") d.setDate(d.getDate() + 1);
    else if (g === "week") d.setDate(d.getDate() + 7);
    else d.setMonth(d.getMonth() + 1);
    cur = toDay(d);
  }
  for (const l of loads) {
    const p = m.get(bucket(loadDay(l), g));
    if (!p) continue;
    p.gross += l.gross_amount;
    p.fee += l.dispatcher_cut;
    p.loads++;
    p.loaded += l.loaded_miles;
    p.miles += l.loaded_miles + l.deadhead_miles;
  }
  return keys.map((k) => m.get(k)!);
}

export interface Row {
  key: string;
  name: string;
  loads: number;
  gross: number;
  fee: number;
  loaded: number;
  miles: number;
}

export function groupBy(loads: Load[], keyOf: (l: Load) => string | null, nameOf: (k: string) => string): Row[] {
  const m = new Map<string, Row>();
  for (const l of loads) {
    const k = keyOf(l) || "—";
    const r = m.get(k) || { key: k, name: k === "—" ? "Unassigned" : nameOf(k), loads: 0, gross: 0, fee: 0, loaded: 0, miles: 0 };
    r.loads++;
    r.gross += l.gross_amount;
    r.fee += l.dispatcher_cut;
    r.loaded += l.loaded_miles;
    r.miles += l.loaded_miles + l.deadhead_miles;
    m.set(k, r);
  }
  return [...m.values()].sort((a, b) => b.gross - a.gross);
}
