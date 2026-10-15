"use client";

import Link from "next/link";
import { useMemo } from "react";
import { AlertTriangle, CalendarClock, CheckCircle2, ChevronRight, Truck as TruckIcon, User } from "lucide-react";
import { useStore } from "@/lib/store";
import { cn, fmtDay } from "@/lib/format";
import { fleetPaperwork, type CheckItem, type Holder } from "@/lib/docs";

const chip = (i: CheckItem) =>
  i.state === "missing"
    ? { text: `${i.type.name} missing`, cls: "border-dashed border-line-strong text-fg-3" }
    : i.state === "expired"
      ? { text: `${i.type.name} expired ${fmtDay(i.doc?.expires_on)}`, cls: "border-red-600/30 bg-red-500/5 text-red-700 dark:text-red-300" }
      : i.state === "soon"
        ? { text: `${i.type.name} expires ${fmtDay(i.doc?.expires_on)}`, cls: "border-amber-600/30 bg-amber-500/5 text-amber-800 dark:text-amber-300" }
        : { text: `${i.type.name}: no expiry date`, cls: "border-amber-600/30 bg-amber-500/5 text-amber-800 dark:text-amber-300" };

/** Drivers and trucks of one carrier, each with what's missing, expired or expiring. */
export function FleetPaperwork({ companyId }: { companyId: string }) {
  const { companies, drivers, trucks, documents, docTypes } = useStore();
  const rows = useMemo(
    () => fleetPaperwork({ companies, drivers, trucks, documents, docTypes }, (id) => id === companyId).filter((h) => h.scope !== "company"),
    [companies, drivers, trucks, documents, docTypes, companyId],
  );
  if (!rows.length) return null;
  const issues = rows.filter((r) => r.bad.length || r.soon.length).length;

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface">
      <div className="flex items-center justify-between border-b border-line px-3 py-2 sm:px-4">
        <span className="text-xs font-semibold uppercase tracking-wider text-fg-3">Drivers & trucks</span>
        <span className={cn("text-xs font-semibold", issues ? "text-amber-800 dark:text-amber-300" : "text-emerald-700 dark:text-emerald-300")}>
          {issues ? `${issues} need attention` : "All on file"}
        </span>
      </div>
      <ul className="divide-y divide-line">
        {rows.map((r) => (
          <Row key={`${r.scope}${r.id}`} r={r} />
        ))}
      </ul>
    </div>
  );
}

function Row({ r }: { r: Holder }) {
  const Icon = r.scope === "driver" ? User : TruckIcon;
  const list = [...r.bad, ...r.soon];
  const req = r.items.filter((i) => i.required);
  const done = req.filter((i) => i.state !== "missing" && i.state !== "expired").length;
  return (
    <li>
      <Link href={r.href} className="flex items-center gap-3 px-3 py-2.5 hover:bg-surface-2/50 sm:px-4">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-line bg-surface-2 text-fg-3">
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-[13px] font-medium text-fg">{r.name}</span>
            <span className="tnum text-xs text-fg-4">
              {done}/{req.length}
            </span>
          </div>
          {list.length ? (
            <div className="mt-1 flex flex-wrap gap-1">
              {list.map((i) => {
                const c = chip(i);
                return (
                  <span key={i.type.key} className={cn("inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium", c.cls)}>
                    {i.state === "missing" ? null : i.state === "expired" ? <AlertTriangle className="h-3 w-3" /> : <CalendarClock className="h-3 w-3" />}
                    {c.text}
                  </span>
                );
              })}
            </div>
          ) : (
            <div className="mt-0.5 inline-flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="h-3.5 w-3.5" /> Everything required is on file
            </div>
          )}
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-fg-4" />
      </Link>
    </li>
  );
}
