"use client";

import { Check, Minus, X } from "lucide-react";
import { useStore } from "@/lib/store";
import { cn, fmtDay, licenseRegionLabel } from "@/lib/format";
import { checklist, type CheckItem } from "@/lib/docs";
import type { Driver } from "@/lib/types";

/** The paperwork the office checks on every driver (same as the required driver documents). */
const COLUMNS: { key: string; label: string }[] = [
  { key: "cdl", label: "License" },
  { key: "medical_card", label: "Medical" },
  { key: "driver_application", label: "Application" },
  { key: "mvr", label: "MVR" },
  { key: "past_employment_verification", label: "PEV" },
  { key: "pre_employment_drug_test", label: "Drug test" },
];

const terminated = (d: Driver) => !!d.termination_date;

/** Office view: drivers as a list with their paperwork status, like the office spreadsheet. */
export function DriversTable({ drivers, onOpen }: { drivers: Driver[]; onOpen: (id: string) => void }) {
  const { docTypes, documents } = useStore();
  const sorted = [...drivers].sort(
    (a, b) => (a.last_name || a.name).localeCompare(b.last_name || b.name) || (a.first_name || "").localeCompare(b.first_name || ""),
  );
  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-surface">
      <table className="w-full min-w-[1100px] text-left text-[13px]">
        <thead className="border-b border-line text-[11px] uppercase tracking-wider text-fg-4">
          <tr>
            {["First name", "Last name", "License #", "Jurisdiction", "Phone", "Email", "Hired", "Terminated"].map((h) => (
              <th key={h} className="px-3 py-2.5 font-medium">
                {h}
              </th>
            ))}
            {COLUMNS.map((c) => (
              <th key={c.key} className="px-2 py-2.5 text-center font-medium">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {sorted.map((d) => {
            const items = new Map(
              checklist(docTypes, documents, { scope: "driver", id: d.id, companyId: d.company_id, licenseExpiry: d.cdl_expiry }).map((i) => [i.type.key, i]),
            );
            return (
              <tr key={d.id} onClick={() => onOpen(d.id)} className={cn("cursor-pointer hover:bg-surface-2/50", terminated(d) && "text-fg-3")}>
                <td className="px-3 py-2.5 font-medium text-fg">{d.first_name || d.name}</td>
                <td className="px-3 py-2.5 font-medium text-fg">{d.last_name || ""}</td>
                <td className="tnum px-3 py-2.5">{d.cdl_number || <Dash />}</td>
                <td className="px-3 py-2.5">{d.cdl_state ? licenseRegionLabel(d.cdl_state) : <Dash />}</td>
                <td className="tnum whitespace-nowrap px-3 py-2.5">{d.phone || <Dash />}</td>
                <td className="max-w-[200px] truncate px-3 py-2.5">{d.email || <Dash />}</td>
                <td className="whitespace-nowrap px-3 py-2.5">{d.hire_date ? fmtDay(d.hire_date, true) : <Dash />}</td>
                <td className="whitespace-nowrap px-3 py-2.5">{d.termination_date ? fmtDay(d.termination_date, true) : <Dash />}</td>
                {COLUMNS.map((c) => (
                  <td key={c.key} className="px-2 py-2.5 text-center">
                    <Mark item={items.get(c.key)} />
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const Dash = () => <span className="text-fg-4">—</span>;

/** On file (check), expiring soon (amber check), expired (red x) or missing (dash). */
function Mark({ item }: { item?: CheckItem }) {
  const state = item?.state ?? "missing";
  const title = state === "missing" ? "Missing" : state === "expired" ? "Expired" : state === "soon" ? "Expires within 30 days" : state === "no_date" ? "On file, no expiry date" : "On file";
  return (
    <span title={title} className="inline-flex h-5 w-5 items-center justify-center" aria-label={title}>
      {state === "missing" ? (
        <Minus className="h-4 w-4 text-fg-4" />
      ) : state === "expired" ? (
        <X className="h-4 w-4 text-red-600 dark:text-red-400" />
      ) : (
        <Check className={cn("h-4 w-4", state === "ok" ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400")} />
      )}
    </span>
  );
}
