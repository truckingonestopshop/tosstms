// Truck Map: where each truck will be empty, and when, worked out from its loads (not GPS).
//
// A broker asks "a truck near Dallas on Oct 30, 8 AM?". For every active truck:
//   1. the load it is on or last ran before that moment → it is empty at that load's LAST
//      delivery, at the delivery time (+ unloading);
//   2. no load before then → the Units "Truck at" location and Ready date;
//   3. the dispatcher's Units info wins when its Ready date is after the last load;
//   4. deadhead from the empty point to the broker's city, at 50 mph with a 10 h break
//      every 550 mi → arrival vs the pickup time: makes it / tight / too late.

import { isCanceled, today } from "@/lib/format";
import type { Load, LoadStop, Truck } from "@/lib/types";

export type LngLat = [number, number];

/** Statuses after which the truck is empty at the delivery. */
const DONE = new Set(["delivered", "invoiced", "paid"]);
/** Unloading after the delivery appointment, before the truck is empty. */
const UNLOAD_MIN = 120;
/** Delivery or pickup with no time on the load. */
const DEFAULT_DELIVERY = "15:00";
const DEFAULT_PICKUP = "08:00";
/** Under this many minutes to spare = tight. */
const TIGHT_MIN = 180;

/** Minutes since epoch for "YYYY-MM-DD" + "HH:MM" (local time). */
export function at(day: string, hhmm = "00:00") {
  const [y, m, d] = day.split("-").map(Number);
  const [h, mi] = hhmm.split(":").map(Number);
  return Math.round(new Date(y, (m || 1) - 1, d || 1, h || 0, mi || 0).getTime() / 60000);
}
export const nowMin = () => Math.round(Date.now() / 60000);

/** First "HH:MM" in a stop's time or window ("FCFS 08:00–15:00" → 08:00). */
function stopTime(s: LoadStop | undefined) {
  const m = `${s?.time || ""} ${s?.appointment || ""}`.match(/\b(\d{1,2}):(\d{2})\s*(am|pm)?/i);
  if (!m) return null;
  let h = Number(m[1]);
  if (m[3]?.toLowerCase() === "pm" && h < 12) h += 12;
  if (m[3]?.toLowerCase() === "am" && h === 12) h = 0;
  return `${String(h).padStart(2, "0")}:${m[2]}`;
}

export const placeKey = (city?: string | null, state?: string | null) => [city?.trim(), state?.trim().toUpperCase()].filter(Boolean).join(", ");

export interface Leg {
  load: Load;
  from: string;
  to: string;
  /** first pickup, minutes */
  start: number;
  /** empty after the last delivery, minutes */
  end: number;
  done: boolean;
  /** the delivery has no time on the load (end is a guess) */
  guessed: boolean;
}

/** A load as a leg of the truck's schedule: first pickup → last delivery. */
export function legOf(l: Load): Leg | null {
  const stops = l.stops || [];
  const pu = stops.find((s) => s.type === "pickup");
  const del = [...stops].reverse().find((s) => s.type === "delivery");
  const puDay = pu?.date || l.pickup_date;
  const delDay = del?.date || l.delivery_date || puDay;
  if (!puDay || !delDay) return null;
  const delTime = stopTime(del);
  return {
    load: l,
    from: placeKey(pu?.city || l.origin_city, pu?.state || l.origin_state),
    to: placeKey(del?.city || l.destination_city, del?.state || l.destination_state),
    start: at(puDay, stopTime(pu) || DEFAULT_PICKUP),
    end: at(delDay, delTime || DEFAULT_DELIVERY) + UNLOAD_MIN,
    done: DONE.has(l.status),
    guessed: !delTime,
  };
}

export interface TruckSpot {
  truck: Truck;
  /** where it is (or will be) empty for the asked moment */
  empty: string | null;
  /** when it is empty there, minutes */
  emptyAt: number | null;
  /** where that came from */
  source: "load" | "units" | "none";
  /** the load it is on / last ran before the asked moment */
  leg: Leg | null;
  /** the next booked load after the asked moment */
  next: Leg | null;
  /** on a load right now: heading from → to */
  now: { leg: Leg; progress: number } | null;
  /** load still not delivered although its delivery time has passed */
  stale: boolean;
  driverId: string | null;
}

/**
 * Where each truck is empty for the moment `when` (minutes). Loads that are canceled or have no
 * dates are skipped; a delivered load counts as empty at its delivery even if delivered early.
 */
export function truckSpots(trucks: Truck[], loads: Load[], when: number, now: number): TruckSpot[] {
  const byTruck = new Map<string, Leg[]>();
  for (const l of loads) {
    if (!l.truck_id || isCanceled(l.status)) continue;
    const leg = legOf(l);
    if (!leg) continue;
    const arr = byTruck.get(l.truck_id) || [];
    arr.push(leg);
    byTruck.set(l.truck_id, arr);
  }
  return trucks.map((t) => {
    const legs = (byTruck.get(t.id) || []).sort((a, b) => a.start - b.start);
    // The load running at / last before the asked moment (a delivered one ends no later than now).
    const before = legs.filter((g) => g.start <= when);
    const leg = before[before.length - 1] || null;
    const next = legs.find((g) => g.start > when) || null;
    const running = legs.filter((g) => !g.done && g.start <= now && g.end > now).pop();
    const nowLeg = running
      ? {
          leg: running,
          progress: Math.min(1, Math.max(0, (now - running.start) / Math.max(1, running.end - UNLOAD_MIN - running.start))),
        }
      : null;

    const unitsAt = t.current_location?.trim() || null;
    const unitsReady = t.available_date ? at(t.available_date, t.available_time || "00:00") : null;
    let empty: string | null = null;
    let emptyAt: number | null = null;
    let source: TruckSpot["source"] = "none";
    if (leg) {
      empty = leg.to;
      emptyAt = leg.done ? Math.min(leg.end, now) : leg.end;
      source = "load";
    }
    // Units info is the dispatcher's own update: it wins when it's newer than the last load.
    if (unitsAt && (!leg || (unitsReady != null && unitsReady >= (emptyAt ?? 0) && unitsReady <= when))) {
      empty = unitsAt;
      emptyAt = unitsReady != null ? Math.max(unitsReady, Math.min(now, when)) : Math.min(now, when);
      source = "units";
    }
    return {
      truck: t,
      empty,
      emptyAt,
      source,
      leg,
      next,
      now: nowLeg,
      stale: !!leg && !leg.done && leg.end < at(today()),
      driverId: t.assigned_driver_id || leg?.load.driver_id || null,
    };
  });
}

/** Straight-line miles. */
export function airMiles(a: LngLat, b: LngLat) {
  const r = (d: number) => (d * Math.PI) / 180;
  const dLat = r(b[1] - a[1]);
  const dLng = r(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a[1])) * Math.cos(r(b[1])) * Math.sin(dLng / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.sqrt(h));
}
/** Road miles are usually ~18% more than straight-line; used until the real ones arrive. */
export const ROAD_FACTOR = 1.18;

/** Driving time for `miles`: 50 mph, plus a 10 h break for every 550 mi. */
export function driveMinutes(miles: number) {
  return Math.round((miles / 50) * 60 + Math.floor(miles / 550) * 600);
}

export type Verdict = "makes" | "tight" | "late";

/** Can a truck empty at `emptyAt` drive `miles` and be there by `deadline`? */
export function verdict(emptyAt: number, miles: number, deadline: number): { verdict: Verdict; arrive: number; spare: number } {
  const arrive = emptyAt + driveMinutes(miles);
  const spare = deadline - arrive;
  return {
    verdict: spare < 0 ? "late" : spare < TIGHT_MIN ? "tight" : "makes",
    arrive,
    spare,
  };
}

/** A point part of the way from a to b (straight line; an estimate). */
export const between = (a: LngLat, b: LngLat, f: number): LngLat => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];

/** "Oct 29, 2:00 PM" from minutes. */
export function fmtMoment(min: number) {
  const d = new Date(min * 60000);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** "5h 20m" / "1d 4h" */
export function fmtSpan(min: number) {
  const m = Math.abs(Math.round(min));
  if (m >= 24 * 60) return `${Math.floor(m / 1440)}d ${Math.floor((m % 1440) / 60)}h`;
  if (m >= 60) return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
  return `${m}m`;
}

export { DEFAULT_PICKUP };

/**
 * The point `f` (0–1) of the way along a road line, and the rest of the line from there
 * (where the truck still has to drive).
 */
export function alongLine(line: LngLat[], f: number): { point: LngLat; rest: LngLat[] } {
  if (line.length < 2) return { point: line[0], rest: line };
  const seg: number[] = [];
  let total = 0;
  for (let i = 1; i < line.length; i++) {
    const d = airMiles(line[i - 1], line[i]);
    seg.push(d);
    total += d;
  }
  let goal = Math.min(1, Math.max(0, f)) * total;
  for (let i = 0; i < seg.length; i++) {
    if (goal <= seg[i] || i === seg.length - 1) {
      const point = between(line[i], line[i + 1], seg[i] ? Math.min(1, goal / seg[i]) : 0);
      return { point, rest: [point, ...line.slice(i + 1)] };
    }
    goal -= seg[i];
  }
  return { point: line[line.length - 1], rest: [line[line.length - 1]] };
}
