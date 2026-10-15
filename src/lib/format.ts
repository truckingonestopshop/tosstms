import { twMerge } from "tailwind-merge";
import type { Currency, Load, LoadStatus } from "./types";

/** Joins class names; later Tailwind classes win over conflicting earlier ones. */
export function cn(...parts: (string | false | null | undefined | 0)[]) {
  return twMerge(parts.filter(Boolean).join(" "));
}

export function money(n: number | null | undefined, opts: { cents?: boolean; currency?: Currency } = {}) {
  const v = Number(n) || 0;
  const cents = opts.cents ?? true;
  const s = v.toLocaleString("en-US", { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 });
  const c = opts.currency ?? "USD";
  if (c === "EUR") return `€${s}`;
  if (c === "MDL") return `${s} MDL`;
  return v < 0 ? `-$${s.replace("-", "")}` : `$${s}`;
}

/** $12.4k style for tight spaces. */
export function moneyShort(n: number) {
  const v = Number(n) || 0;
  if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 10_000) return `$${(v / 1000).toFixed(1)}k`;
  return money(v, { cents: false });
}

export const num = (n: number | null | undefined, digits = 0) =>
  (Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });

/** "YYYY-MM-DD" → local Date (no UTC shift). */
export function parseDay(s: string | null | undefined): Date | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) {
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

export function toDay(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export const today = () => toDay(new Date());

/** Local calendar day of a timestamp (UTC slicing would be a day ahead on US evenings). */
export const localDay = (ts: string | null | undefined) => (ts ? toDay(new Date(ts)) : "");

export function addDays(day: string, n: number) {
  const d = parseDay(day) ?? new Date();
  d.setDate(d.getDate() + n);
  return toDay(d);
}

/** "Oct 14" (adds the year when it isn't this year). */
export function fmtDay(s: string | null | undefined, withYear?: boolean) {
  const d = parseDay(s);
  if (!d) return "—";
  const showYear = withYear ?? d.getFullYear() !== new Date().getFullYear();
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(showYear ? { year: "numeric" } : {}) });
}

export function fmtDateTime(s: string | null | undefined) {
  if (!s) return "—";
  const d = new Date(s);
  return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function relTime(s: string) {
  const diff = (Date.now() - new Date(s).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`;
  return fmtDay(s.slice(0, 10));
}

/** Days from today until the date (negative = past). */
export function daysUntil(s: string | null | undefined) {
  const d = parseDay(s);
  if (!d) return null;
  const t = parseDay(today())!;
  return Math.round((d.getTime() - t.getTime()) / 86400000);
}

export function fileSize(bytes: number | null | undefined) {
  const b = Number(bytes) || 0;
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

export const lane = (l: Pick<Load, "origin_city" | "origin_state" | "destination_city" | "destination_state">) =>
  `${place(l.origin_city, l.origin_state)} → ${place(l.destination_city, l.destination_state)}`;

export const place = (city?: string | null, state?: string | null) =>
  [city, state].filter(Boolean).join(", ") || "—";

export const totalMiles = (l: Pick<Load, "loaded_miles" | "deadhead_miles">) =>
  (Number(l.loaded_miles) || 0) + (Number(l.deadhead_miles) || 0);

/** Loaded rate per mile. */
export const rpm = (l: Pick<Load, "gross_amount" | "loaded_miles">) =>
  Number(l.loaded_miles) > 0 ? Number(l.gross_amount) / Number(l.loaded_miles) : 0;

/** All-in rate per mile (loaded + deadhead). */
export const rpmAllIn = (l: Pick<Load, "gross_amount" | "loaded_miles" | "deadhead_miles">) => {
  const t = totalMiles(l);
  return t > 0 ? Number(l.gross_amount) / t : 0;
};

export const cut = (gross: number, pct: number) => Math.round(((Number(gross) || 0) * (Number(pct) || 0)) ) / 100;

// ---------------------------------------------------------------------------
// Load status vocabulary (one place: list, board, calendar, filters all agree)
// ---------------------------------------------------------------------------
export interface StatusMeta {
  label: string;
  short: string;
  /** pill classes */
  pill: string;
  dot: string;
  /** calendar chip */
  chip: string;
}

export const STATUS: Record<LoadStatus, StatusMeta> = {
  new: {
    label: "New",
    short: "New",
    pill: "bg-sky-500/10 text-sky-700 ring-sky-600/20 dark:text-sky-300 dark:ring-sky-400/20",
    dot: "bg-sky-500",
    chip: "border-l-sky-500",
  },
  booked: {
    label: "Booked",
    short: "Booked",
    pill: "bg-zinc-500/10 text-zinc-700 ring-zinc-600/20 dark:text-zinc-300 dark:ring-zinc-400/20",
    dot: "bg-zinc-400",
    chip: "border-l-zinc-400",
  },
  in_transit: {
    label: "In transit",
    short: "Transit",
    pill: "bg-blue-500/10 text-blue-700 ring-blue-600/20 dark:text-blue-300 dark:ring-blue-400/25",
    dot: "bg-blue-500",
    chip: "border-l-blue-500",
  },
  delivered: {
    label: "Delivered",
    short: "Delivered",
    pill: "bg-amber-500/10 text-amber-800 ring-amber-600/25 dark:text-amber-300 dark:ring-amber-400/25",
    dot: "bg-amber-500",
    chip: "border-l-amber-500",
  },
  invoiced: {
    label: "Invoiced",
    short: "Invoiced",
    pill: "bg-violet-500/10 text-violet-700 ring-violet-600/20 dark:text-violet-300 dark:ring-violet-400/25",
    dot: "bg-violet-500",
    chip: "border-l-violet-500",
  },
  paid: {
    label: "Paid",
    short: "Paid",
    pill: "bg-emerald-500/10 text-emerald-700 ring-emerald-600/20 dark:text-emerald-300 dark:ring-emerald-400/25",
    dot: "bg-emerald-500",
    chip: "border-l-emerald-500",
  },
  canceled_by_broker: {
    label: "Canceled · broker",
    short: "Canceled",
    pill: "bg-red-500/10 text-red-700 ring-red-600/20 dark:text-red-300 dark:ring-red-400/25",
    dot: "bg-red-500",
    chip: "border-l-red-500",
  },
  canceled_by_carrier: {
    label: "Canceled · carrier",
    short: "Canceled",
    pill: "bg-red-500/10 text-red-700 ring-red-600/20 dark:text-red-300 dark:ring-red-400/25",
    dot: "bg-red-500",
    chip: "border-l-red-500",
  },
};

export const STATUS_ORDER: LoadStatus[] = [
  "new",
  "booked",
  "in_transit",
  "delivered",
  "invoiced",
  "paid",
  "canceled_by_broker",
  "canceled_by_carrier",
];

/** Statuses that are still on the road or about to be. */
export const ACTIVE_STATUSES: LoadStatus[] = ["new", "booked", "in_transit"];
export const isCanceled = (s: LoadStatus) => s === "canceled_by_broker" || s === "canceled_by_carrier";

export const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","DC","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY",
  "AB","BC","MB","NB","NL","NS","ON","PE","QC","SK",
];

export const TRAILER_TYPES = [
  "Dry Van",
  "Reefer",
  "Flatbed",
  "Step Deck",
  "Conestoga",
  "Double Drop",
  "RGN",
  "Lowboy",
  "Hotshot",
  "Power Only",
  "Box Truck",
  "Car Hauler",
  "Tanker",
  "Hopper",
];

export const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
