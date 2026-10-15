"use client";

import { useEffect, useRef, useState } from "react";
import type { LoadStop } from "./types";

export interface RouteData {
  miles: number;
  minutes: number;
  legs: { miles: number; minutes: number }[];
  points: ([number, number] | null)[];
  line: [number, number][];
}

type Q = { address?: string; city?: string; state?: string; zip?: string };
const cache = new Map<string, RouteData>();

const keyOf = (stops: Q[]) => stops.map((s) => [s.address, s.city, s.state, s.zip].map((x) => (x || "").trim().toLowerCase()).join("|")).join(";");

export async function fetchRoute(stops: Q[]): Promise<RouteData> {
  const usable = stops.filter((s) => s.city || s.zip);
  const key = keyOf(usable);
  const hit = cache.get(key);
  if (hit) return hit;
  const res = await fetch("/api/miles", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ stops: usable }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Couldn't calculate miles");
  cache.set(key, json);
  return json;
}

/** Highway route through the stops, recalculated (debounced) when they change. */
export function useRoute(stops: Pick<LoadStop, "address" | "city" | "state" | "zip">[], enabled = true) {
  const [data, setData] = useState<RouteData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const usable = stops.filter((s) => (s.city && s.state) || s.zip);
  const key = keyOf(usable);
  const seq = useRef(0);

  useEffect(() => {
    if (!enabled || usable.length < 2) {
      setData(null);
      setError(null);
      return;
    }
    const n = ++seq.current;
    setLoading(true);
    const t = setTimeout(() => {
      fetchRoute(usable)
        .then((r) => {
          if (n === seq.current) {
            setData(r);
            setError(r.miles ? null : "Couldn't find a driving route for these stops");
          }
        })
        .catch((e) => n === seq.current && setError(e.message))
        .finally(() => n === seq.current && setLoading(false));
    }, 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled]);

  return { data, loading, error };
}
