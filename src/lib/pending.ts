"use client";

// Pending: every document that has expired or expires soon, and the required paperwork still
// missing, for carriers, drivers, trucks, trailers and loads on the road. Same rules as the
// carrier's Documents tab and the Dispatch dashboard alerts (lib/docs).
//
// A reminder can be turned off with a reason (tms_reminder_mutes, migration 0027). Its key includes
// the document, so a renewed document gets reminders again.

import { useEffect, useState } from "react";
import { sb } from "@/lib/db";
import { checklist, fleetPaperwork, problems } from "@/lib/docs";
import { daysUntil, lane, today } from "@/lib/format";
import type { Company, DocType, DocumentItem, Driver, Load, Trailer, Truck } from "@/lib/types";

export type PendingKind = "carrier" | "driver" | "truck" | "trailer" | "load" | "toss";
export type PendingState = "expired" | "soon" | "missing" | "no_date";

export interface PendingItem {
  key: string;
  companyId: string;
  kind: PendingKind;
  /** who / what it belongs to: carrier name, driver, "Unit 101", a load's lane */
  holder: string;
  /** the document: "Medical card", "Insurance (COI)" */
  what: string;
  state: PendingState;
  /** expiry date when there is one */
  date: string | null;
  /** days until it expires (negative = expired) */
  days: number | null;
  href: string;
}

const KIND: Record<string, PendingKind> = { company: "carrier", driver: "driver", truck: "truck", trailer: "trailer" };

export function pendingItems(
  data: { companies: Company[]; drivers: Driver[]; trucks: Truck[]; trailers: Trailer[]; documents: DocumentItem[]; docTypes: DocType[]; loads: Load[] },
  inScope: (id: string) => boolean,
): PendingItem[] {
  const out: PendingItem[] = [];
  const holders = fleetPaperwork(data, inScope);
  for (const h of holders) {
    for (const i of [...h.bad, ...h.soon]) {
      const days = i.doc?.expires_on ? daysUntil(i.doc.expires_on) : null;
      out.push({
        key: `${h.scope}:${h.id}:${i.type.key}:${i.doc?.id || "none"}`,
        companyId: h.companyId,
        kind: KIND[h.scope],
        holder: h.name,
        what: i.type.name,
        state: i.state === "ok" ? "soon" : i.state,
        date: i.doc?.expires_on || null,
        days,
        href: h.href,
      });
    }
  }
  // License / medical dates typed on the driver when no dated file is on record.
  for (const d of data.drivers.filter((d) => inScope(d.company_id) && d.status === "active")) {
    for (const [key, label, date] of [
      ["cdl", d.license_type || "Driving license", d.cdl_expiry],
      ["medical_card", "Medical card", d.medical_card_expiry],
    ] as const) {
      const covered = holders.some((h) => h.scope === "driver" && h.id === d.id && h.items.some((i) => i.type.key === key && i.doc?.expires_on));
      const n = daysUntil(date);
      if (covered || n === null || n > 30) continue;
      out.push({
        key: `driver:${d.id}:${key}:typed:${date}`,
        companyId: d.company_id,
        kind: "driver",
        holder: d.name,
        what: label,
        state: n < 0 ? "expired" : "soon",
        date,
        days: n,
        href: `/fleet?company=${d.company_id}&tab=drivers&driver=${d.id}`,
      });
    }
  }
  // Loads on the road or waiting to be paid that miss required paperwork (BOL, POD…).
  for (const l of data.loads.filter((l) => inScope(l.company_id) && ["in_transit", "delivered", "invoiced"].includes(l.status))) {
    for (const i of problems(checklist(data.docTypes, data.documents, { scope: "load", id: l.id, companyId: l.company_id, status: l.status }))) {
      out.push({
        key: `load:${l.id}:${i.type.key}`,
        companyId: l.company_id,
        kind: "load",
        holder: `${l.load_number ? `#${l.load_number} · ` : ""}${lane(l)}`,
        what: i.type.name,
        state: "missing",
        date: null,
        days: null,
        href: `/loads/${l.id}`,
      });
    }
  }
  return out;
}

/** TOSS's own documents (Documents section) with an expiry date: expired or expiring within 30 days. */
export function ownDocItems(docs: { id: string; name: string; folder: string; expires_on: string | null }[]): PendingItem[] {
  const out: PendingItem[] = [];
  for (const d of docs) {
    const n = daysUntil(d.expires_on);
    if (n === null || n > 30) continue;
    out.push({
      key: `toss:${d.id}:${d.expires_on}`,
      companyId: "",
      kind: "toss",
      holder: `TOSS · ${d.folder}`,
      what: d.name,
      state: n < 0 ? "expired" : "soon",
      date: d.expires_on,
      days: n,
      href: "/documents",
    });
  }
  return out;
}

export interface Mute {
  id: string;
  key: string;
  company_id: string | null;
  label: string;
  reason: string;
  until: string | null;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
}

/** A turned-off reminder still applies (no end date, or the end date hasn't come). */
export const muteActive = (m: Mute) => !m.until || m.until >= today();

/** The turned-off reminders, kept live. */
export function useMutes() {
  const [mutes, setMutes] = useState<Mute[]>([]);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let alive = true;
    sb()
      .from("tms_reminder_mutes")
      .select("*")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (!alive) return;
        setMutes((data || []) as Mute[]);
        setLoaded(true);
      });
    const ch = sb()
      .channel("reminder-mutes")
      .on("postgres_changes", { event: "*", schema: "public", table: "tms_reminder_mutes" }, (p) => {
        if (p.eventType === "DELETE") return setMutes((l) => l.filter((m) => m.id !== (p.old as Mute).id));
        const row = p.new as Mute;
        setMutes((l) => [row, ...l.filter((m) => m.id !== row.id)]);
      })
      .subscribe();
    return () => {
      alive = false;
      sb().removeChannel(ch);
    };
  }, []);
  return { mutes, setMutes, loaded };
}
