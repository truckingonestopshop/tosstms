"use client";

import { useEffect, useState } from "react";
import { Printer } from "lucide-react";
import { LogoMark } from "@/components/brand/Logo";
import { Button } from "@/components/ui/Button";
import { useStore } from "@/lib/store";
import { STATUS, fmtDay, money, num, rpm, totalMiles } from "@/lib/format";

/** Clean, printable load report (opened from Loads → Export → Printable report). */
export default function LoadReport() {
  const { loads, driverById, truckById, companyById, scopedCompany } = useStore();
  const [ids, setIds] = useState<string[] | null>(null);
  useEffect(() => {
    try {
      setIds(JSON.parse(sessionStorage.getItem("toss-tms-report") || "[]"));
    } catch {
      setIds([]);
    }
  }, []);
  if (ids === null) return null;
  const rows = loads.filter((l) => ids.includes(l.id)).sort((a, b) => (a.pickup_date || "").localeCompare(b.pickup_date || ""));
  const gross = rows.reduce((s, l) => s + l.gross_amount, 0);
  const fee = rows.reduce((s, l) => s + l.dispatcher_cut, 0);
  const loaded = rows.reduce((s, l) => s + l.loaded_miles, 0);
  const miles = rows.reduce((s, l) => s + totalMiles(l), 0);
  const first = rows[0]?.pickup_date;
  const last = rows.reduce((m, l) => ((l.delivery_date || "") > m ? l.delivery_date || "" : m), "");

  return (
    <div className="mx-auto max-w-[1100px] px-4 py-6 print:p-0">
      <div className="no-print mb-4 flex justify-end">
        <Button variant="secondary" onClick={() => window.print()}>
          <Printer className="h-4 w-4" /> Print / save as PDF
        </Button>
      </div>
      <div className="print-sheet rounded-xl border border-line bg-white p-8 text-[#111] shadow-pop">
        <div className="flex items-start justify-between border-b border-zinc-200 pb-5">
          <div>
            <LogoMark className="h-8 w-auto text-[#1F2825]" />
            <div className="mt-2 text-xs text-zinc-500">Trucking One Stop Shop · Dispatch</div>
          </div>
          <div className="text-right">
            <div className="text-lg font-bold">Load report</div>
            <div className="text-xs text-zinc-500">{scopedCompany?.name || "All companies"}</div>
            {first && (
              <div className="text-xs text-zinc-500">
                {fmtDay(first, true)} – {fmtDay(last, true)}
              </div>
            )}
          </div>
        </div>
        <div className="grid grid-cols-4 gap-4 border-b border-zinc-200 py-4 text-sm">
          {[
            ["Loads", num(rows.length)],
            ["Gross", money(gross)],
            ["Dispatch fee", money(fee)],
            ["Avg RPM", loaded ? `$${(gross / loaded).toFixed(2)} · ${num(miles)} mi` : "—"],
          ].map(([k, v]) => (
            <div key={k}>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{k}</div>
              <div className="tnum mt-0.5 font-bold">{v}</div>
            </div>
          ))}
        </div>
        <table className="mt-4 w-full text-left text-[11px]">
          <thead>
            <tr className="border-b border-zinc-300 text-[10px] uppercase tracking-wider text-zinc-500">
              <th className="py-1.5 pr-2">Load #</th>
              <th className="py-1.5 pr-2">Pickup</th>
              <th className="py-1.5 pr-2">Lane</th>
              <th className="py-1.5 pr-2">Broker</th>
              <th className="py-1.5 pr-2">Driver / unit</th>
              <th className="py-1.5 pr-2 text-right">Miles</th>
              <th className="py-1.5 pr-2 text-right">Gross</th>
              <th className="py-1.5 pr-2 text-right">RPM</th>
              <th className="py-1.5 pr-2 text-right">Fee</th>
              <th className="py-1.5">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((l) => (
              <tr key={l.id} className="border-b border-zinc-100 align-top">
                <td className="py-1.5 pr-2 font-semibold">{l.load_number || "—"}</td>
                <td className="tnum py-1.5 pr-2">{fmtDay(l.pickup_date)}</td>
                <td className="py-1.5 pr-2">
                  {l.origin_city}, {l.origin_state} → {l.destination_city}, {l.destination_state}
                  {scopedCompany ? "" : <div className="text-zinc-500">{companyById(l.company_id)?.name}</div>}
                </td>
                <td className="py-1.5 pr-2">{l.broker_name}</td>
                <td className="py-1.5 pr-2">
                  {driverById(l.driver_id)?.name || "—"}
                  {truckById(l.truck_id) ? ` · #${truckById(l.truck_id)!.unit_number}` : ""}
                </td>
                <td className="tnum py-1.5 pr-2 text-right">{num(l.loaded_miles)}</td>
                <td className="tnum py-1.5 pr-2 text-right font-semibold">{money(l.gross_amount)}</td>
                <td className="tnum py-1.5 pr-2 text-right">{rpm(l) ? `$${rpm(l).toFixed(2)}` : "—"}</td>
                <td className="tnum py-1.5 pr-2 text-right">{money(l.dispatcher_cut)}</td>
                <td className="py-1.5">{STATUS[l.status].label}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="py-10 text-center text-sm text-zinc-500">No loads were selected. Go back to Loads and export again.</p>}
        <div className="mt-6 text-[10px] text-zinc-400">Generated {new Date().toLocaleString("en-US")}</div>
      </div>
    </div>
  );
}
