"use client";

import { useEffect, useState } from "react";
import { sb } from "@/lib/db";

/**
 * Rows of a TOSS Cloud table, loaded once and kept live (realtime inserts, updates, deletes).
 * Used by the Sales and Cases sections. `filter` limits the rows ({ column: value }).
 */
export function useLiveTable<T extends { id: string }>(table: string, opts: { order?: string; ascending?: boolean; filter?: Record<string, string> } = {}) {
  const [rows, setRows] = useState<T[]>([]);
  const [loaded, setLoaded] = useState(false);
  const order = opts.order ?? "created_at";
  const asc = opts.ascending ?? false;
  const filterKey = JSON.stringify(opts.filter || {});

  useEffect(() => {
    let alive = true;
    const filter = JSON.parse(filterKey) as Record<string, string>;
    let q = sb().from(table).select("*").order(order, { ascending: asc });
    for (const [k, v] of Object.entries(filter)) q = q.eq(k, v);
    q.then(({ data }) => {
      if (!alive) return;
      setRows((data || []) as T[]);
      setLoaded(true);
    });
    const matches = (r: Record<string, unknown>) => Object.entries(filter).every(([k, v]) => String(r[k]) === v);
    const ch = sb()
      .channel(`live-${table}-${filterKey}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table }, (p) => {
        if (p.eventType === "DELETE") return setRows((l) => l.filter((x) => x.id !== (p.old as T).id));
        const row = p.new as T;
        setRows((l) => {
          const rest = l.filter((x) => x.id !== row.id);
          if (!matches(row as unknown as Record<string, unknown>)) return rest;
          return asc ? [...rest, row] : [row, ...rest];
        });
      })
      .subscribe();
    return () => {
      alive = false;
      sb().removeChannel(ch);
    };
  }, [table, order, asc, filterKey]);

  /** Put a saved row in place right away (realtime confirms it). */
  const put = (row: T) => setRows((l) => (l.some((x) => x.id === row.id) ? l.map((x) => (x.id === row.id ? row : x)) : asc ? [...l, row] : [row, ...l]));
  const drop = (id: string) => setRows((l) => l.filter((x) => x.id !== id));
  return { rows, loaded, put, drop };
}
