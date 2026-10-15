"use client";

import { useEffect, useRef, useState } from "react";
import type { LoadStop } from "./types";

export interface Leg {
  miles: number;
  minutes: number;
}

export interface RouteData {
  /** loaded miles through every stop */
  miles: number;
  minutes: number;
  /** legs[i] = stop i → stop i+1, matched to the stops passed in (0 when unknown) */
  legs: Leg[];
  /** [lng, lat] per stop passed in (null when not found / not filled) */
  points: ([number, number] | null)[];
  line: [number, number][];
  /** index in `line` nearest to each stop */
  breaks: (number | null)[];
  /** empty leg from where the truck is to the first stop */
  deadhead: (Leg & { point: [number, number] | null; line: [number, number][] }) | null;
}

type Q = { address?: string; city?: string; state?: string; zip?: string };
const cache = new Map<string, RouteData>();

const usableStop = (s: Q) => !!((s.city && s.state) || s.zip);
const keyOf = (stops: Q[]) => stops.map((s) => [s.address, s.city, s.state, s.zip].map((x) => (x || "").trim().toLowerCase()).join("|")).join(";");

/** "Dallas, TX 75201" / "Dallas TX" / "75201" → a geocodable stop. */
export function parsePlace(text: string): Q | null {
  const t = text.trim();
  if (!t) return null;
  const zip = /\b(\d{5})(?:-\d{4})?\b/.exec(t)?.[1] || "";
  const rest = t.replace(/\b\d{5}(?:-\d{4})?\b/, "").trim().replace(/[,\s]+$/, "");
  const m = /^(.*?)[,\s]+([A-Za-z]{2})$/.exec(rest);
  if (m) return { city: m[1].replace(/,$/, "").trim(), state: m[2].toUpperCase(), zip };
  return rest ? { city: rest, zip } : { zip };
}

/** Route for stops that are filled in (server shape: one entry per stop sent). */
export async function fetchRoute(stops: Q[], from?: Q | null): Promise<RouteData> {
  const usable = stops.filter((s) => s.city || s.zip);
  const key = `${keyOf(usable)}#${from ? keyOf([from]) : ""}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const res = await fetch("/api/miles", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ stops: usable, from: from || null }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Couldn't calculate miles");
  if (cache.size > 200) cache.clear();
  cache.set(key, json);
  return json;
}

/**
 * Re-indexes a route computed for the filled-in stops back onto the full stop list, so
 * pins, pin numbers and leg miles land on the right stop even with blank rows in between.
 */
function expand(r: RouteData, idx: number[], total: number): RouteData {
  const points: RouteData["points"] = Array.from({ length: total }, () => null);
  const breaks: RouteData["breaks"] = Array.from({ length: total }, () => null);
  const legs: Leg[] = Array.from({ length: Math.max(0, total - 1) }, () => ({ miles: 0, minutes: 0 }));
  idx.forEach((orig, j) => {
    points[orig] = r.points[j] ?? null;
    breaks[orig] = r.breaks?.[j] ?? null;
    if (j > 0 && orig > 0) legs[orig - 1] = r.legs[j - 1] || { miles: 0, minutes: 0 };
  });
  return { ...r, points, breaks, legs };
}

/** Highway route through the stops (and the deadhead leg), recalculated when they change. */
export function useRoute(stops: Pick<LoadStop, "address" | "city" | "state" | "zip">[], opts: { from?: string | null; enabled?: boolean } = {}) {
  const enabled = opts.enabled ?? true;
  const [data, setData] = useState<RouteData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const idx = stops.map((s, i) => (usableStop(s) ? i : -1)).filter((i) => i >= 0);
  const usable = idx.map((i) => stops[i]);
  const from = opts.from ? parsePlace(opts.from) : null;
  const key = `${keyOf(usable)}#${from ? keyOf([from]) : ""}#${idx.join(",")}#${stops.length}`;
  const seq = useRef(0);

  useEffect(() => {
    if (!enabled || usable.length < 2) {
      setData(null);
      setError(null);
      setLoading(false);
      return;
    }
    const n = ++seq.current;
    setLoading(true);
    const t = setTimeout(() => {
      fetchRoute(usable, from)
        .then((r) => {
          if (n !== seq.current) return;
          setData(expand(r, idx, stops.length));
          setError(r.miles ? null : "Couldn't find a driving route for these stops");
        })
        .catch((e) => n === seq.current && setError(e.message))
        .finally(() => n === seq.current && setLoading(false));
    }, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled]);

  return { data, loading, error };
}
