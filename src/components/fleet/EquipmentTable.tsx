"use client";

import { useState } from "react";
import { Check, Download, Minus, Search, Truck as TruckIcon, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CopyButton, Empty } from "@/components/ui/Bits";
import { Input, Segmented } from "@/components/ui/Field";
import { useStore } from "@/lib/store";
import { checklist, type CheckItem } from "@/lib/docs";
import { downloadCsv } from "@/lib/csv";
import { cn, num } from "@/lib/format";
import type { Trailer, Truck } from "@/lib/types";

// Equipment list (like the office's Excel): trucks and trailers in one table with their
// registration details, owned or leased, and the paperwork on file. Click a row to open it.

type Row = {
  kind: "truck" | "trailer";
  id: string;
  companyId: string;
  unit: string;
  type: string;
  year: number | null;
  make: string | null;
  model: string | null;
  gvwr: number | null;
  vin: string | null;
  plate: string | null;
  plateState: string | null;
  ownership: string | null | undefined;
  status: string;
};

/** Paperwork columns: [truck key, trailer key, label]. Title and lease are optional. */
const DOCS: [string, string | null, string][] = [
  ["registration", "trailer_registration", "Registration"],
  ["inspection", "trailer_inspection", "Annual insp."],
  ["truck_title", null, "Title"],
  ["truck_lease", "trailer_lease", "Lease"],
];

export function EquipmentTable({ trucks, trailers, showCompany, onOpen }: { trucks: Truck[]; trailers: Trailer[]; showCompany?: boolean; onOpen: (kind: "truck" | "trailer", id: string) => void }) {
  const { docTypes, documents, companyById } = useStore();
  const [kind, setKind] = useState<"all" | "truck" | "trailer">("all");
  const [own, setOwn] = useState<"all" | "owned" | "leased" | "unset">("all");
  const [q, setQ] = useState("");

  const rows: Row[] = [
    ...trucks.map((t) => ({
      kind: "truck" as const,
      id: t.id,
      companyId: t.company_id,
      unit: t.unit_number,
      type: "Truck tractor",
      year: t.year,
      make: t.make,
      model: t.model ?? null,
      gvwr: t.gvwr ?? null,
      vin: t.vin_number,
      plate: t.plate,
      plateState: t.plate_state ?? null,
      ownership: t.ownership,
      status: t.status,
    })),
    ...trailers.map((t) => ({
      kind: "trailer" as const,
      id: t.id,
      companyId: t.company_id,
      unit: t.unit_number,
      type: "Trailer",
      year: t.year,
      make: t.make,
      model: [t.trailer_length, t.trailer_type].filter(Boolean).join(" ") || null,
      gvwr: t.gvwr ?? null,
      vin: t.vin_number,
      plate: t.plate,
      plateState: t.plate_state ?? null,
      ownership: t.ownership,
      status: t.status,
    })),
  ].sort((a, b) => (a.kind === b.kind ? a.unit.localeCompare(b.unit, undefined, { numeric: true }) : a.kind === "truck" ? -1 : 1));

  const shown = rows
    .filter((r) => kind === "all" || r.kind === kind)
    .filter((r) => own === "all" || (own === "unset" ? !r.ownership : r.ownership === own))
    .filter((r) => !q || `${r.unit} ${r.vin} ${r.plate} ${r.make} ${r.model}`.toLowerCase().includes(q.toLowerCase()));

  const items = (r: Row) => new Map(checklist(docTypes, documents, { scope: r.kind, id: r.id, companyId: r.companyId }).map((i) => [i.type.key, i]));
  const ownLabel = (o: string | null | undefined) => (o === "owned" ? "Owned" : o === "leased" ? "Leased" : "");

  const exportCsv = () =>
    downloadCsv("equipment.csv", [
      ["Unit #", "Vehicle type", "Year", "Make", "Model", "GVWR", "VIN", "License plate #", "Plate state", "Leased or owned", ...(showCompany ? ["Company"] : [])],
      ...shown.map((r) => [r.unit, r.type, r.year, r.make, r.model, r.gvwr, r.vin, r.plate, r.plateState, ownLabel(r.ownership), ...(showCompany ? [companyById(r.companyId)?.name] : [])]),
    ]);

  const count = (o: "owned" | "leased" | "unset") => rows.filter((r) => (o === "unset" ? !r.ownership : r.ownership === o)).length;

  return (
    <>
      <div className="mb-4 flex flex-col gap-2 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-4" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Unit, VIN, plate, make" className="pl-9" />
        </div>
        <Segmented
          value={kind}
          onChange={setKind}
          options={[
            { value: "all", label: `All ${rows.length}` },
            { value: "truck", label: `Trucks ${trucks.length}` },
            { value: "trailer", label: `Trailers ${trailers.length}` },
          ]}
        />
        <Segmented
          value={own}
          onChange={setOwn}
          options={[
            { value: "all", label: "Any ownership" },
            { value: "owned", label: `Owned ${count("owned")}` },
            { value: "leased", label: `Leased ${count("leased")}` },
            ...(count("unset") ? [{ value: "unset" as const, label: `Not set ${count("unset")}` }] : []),
          ]}
        />
        <Button variant="outline" onClick={exportCsv} disabled={!shown.length}>
          <Download className="h-4 w-4" /> Export
        </Button>
      </div>
      {shown.length === 0 ? (
        <Card>
          <Empty icon={TruckIcon} title={rows.length ? "Nothing matches these filters" : "No trucks or trailers yet"} />
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-surface">
          <table className="w-full min-w-[1200px] text-left text-[13px]">
            <thead className="border-b border-line text-[11px] uppercase tracking-wider text-fg-4">
              <tr>
                {["Unit #", "Vehicle type", "Year", "Make", "Model", "GVWR", "VIN", "Plate #", "Plate state", "Leased / owned", ...(showCompany ? ["Company"] : [])].map((h) => (
                  <th key={h} className="whitespace-nowrap px-3 py-2.5 font-medium">
                    {h}
                  </th>
                ))}
                {DOCS.map(([, , label]) => (
                  <th key={label} className="whitespace-nowrap px-2 py-2.5 text-center font-medium">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {shown.map((r) => {
                const it = items(r);
                return (
                  <tr key={`${r.kind}-${r.id}`} onClick={() => onOpen(r.kind, r.id)} className={cn("cursor-pointer hover:bg-surface-2/50", r.status === "inactive" && "text-fg-3")}>
                    <td className="whitespace-nowrap px-3 py-2.5 font-semibold text-fg">{r.unit}</td>
                    <td className="whitespace-nowrap px-3 py-2.5">{r.type}</td>
                    <td className="tnum px-3 py-2.5">{r.year || <Dash />}</td>
                    <td className="px-3 py-2.5">{r.make || <Dash />}</td>
                    <td className="px-3 py-2.5">{r.model || <Dash />}</td>
                    <td className="tnum whitespace-nowrap px-3 py-2.5">{r.gvwr ? num(r.gvwr) : <Dash />}</td>
                    <td className="tnum whitespace-nowrap px-3 py-2.5">{r.vin ? <Copyable text={r.vin} /> : <Dash />}</td>
                    <td className="tnum whitespace-nowrap px-3 py-2.5">{r.plate ? <Copyable text={r.plate} /> : <Dash />}</td>
                    <td className="px-3 py-2.5">{r.plateState || <Dash />}</td>
                    <td className="px-3 py-2.5">
                      {r.ownership ? (
                        <span className={cn("rounded-md px-1.5 py-0.5 text-xs font-medium", r.ownership === "leased" ? "bg-sky-500/10 text-sky-700 dark:text-sky-300" : "bg-surface-2 text-fg-2")}>{ownLabel(r.ownership)}</span>
                      ) : (
                        <Dash />
                      )}
                    </td>
                    {showCompany && <td className="max-w-[180px] truncate px-3 py-2.5">{companyById(r.companyId)?.name}</td>}
                    {DOCS.map(([truckKey, trailerKey, label]) => {
                      const key = r.kind === "truck" ? truckKey : trailerKey;
                      // A lease only matters for leased equipment; a trailer has no title column.
                      const na = !key || (label === "Lease" && r.ownership === "owned");
                      return (
                        <td key={label} className="px-2 py-2.5 text-center">
                          {na ? <span className="text-[10px] font-semibold text-fg-4">N/A</span> : <Mark item={it.get(key!)} optional={label === "Title" || label === "Lease"} />}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

const Dash = () => <span className="text-fg-4">—</span>;

function Copyable({ text }: { text: string }) {
  return (
    <span className="group/copy inline-flex items-center gap-1">
      {text}
      <span onClick={(e) => e.stopPropagation()} className="opacity-0 transition-opacity group-hover/copy:opacity-100">
        <CopyButton text={text} />
      </span>
    </span>
  );
}

/** On file (check), expiring (amber), expired (red x), missing (dash). */
function Mark({ item, optional }: { item?: CheckItem; optional?: boolean }) {
  const state = item?.doc ? item.state : "missing";
  const title = state === "missing" ? (optional ? "Not on file (optional)" : "Missing") : state === "expired" ? "Expired" : state === "soon" ? "Expires within 30 days" : "On file";
  return (
    <span title={title} className="inline-flex h-5 w-5 items-center justify-center" aria-label={title}>
      {state === "missing" ? (
        <Minus className={cn("h-4 w-4", optional ? "text-fg-4/60" : "text-fg-4")} />
      ) : state === "expired" ? (
        <X className="h-4 w-4 text-red-600 dark:text-red-400" />
      ) : (
        <Check className={cn("h-4 w-4", state === "ok" || state === "no_date" ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400")} />
      )}
    </span>
  );
}
