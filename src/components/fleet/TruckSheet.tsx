"use client";

import { useState } from "react";
import { Check, Pencil } from "lucide-react";
import { Drawer } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { CopyButton, Eyebrow, Pill, neutralPill } from "@/components/ui/Bits";
import { DocumentsPanel } from "@/components/docs/DocumentsPanel";
import { TrailerPicker, trailerLine } from "./Trailers";
import { SheetFiles } from "./SheetFiles";
import { useStore } from "@/lib/store";
import { cn, num } from "@/lib/format";
import { availability, equipmentLine, truckModelLine } from "@/lib/pitch";
import type { Truck } from "@/lib/types";

/** A truck at a glance: its trailer, what brokers ask for (one tap to copy) and its paperwork. Edit
 *  changes the trailer and the documents. */
export function TruckSheet({ truck, onClose, onEdit }: { truck: Truck | null; onClose: () => void; onEdit: (t: Truck) => void }) {
  const { companyById, driverById, trailerById, documents } = useStore();
  const [manageId, setManageId] = useState<string | null>(null);
  if (!truck) return null;
  const manage = manageId === truck.id;
  const company = companyById(truck.company_id);
  const driver = driverById(truck.assigned_driver_id);
  const trailer = trailerById(truck.trailer_id);

  const copyRows: [string, string | null | undefined][] = [
    ["Driver", driver?.name],
    ["Driver phone", driver?.phone],
    ["MC", company?.mc_number],
    ["DOT", company?.dot_number],
    ["Truck #", truck.unit_number],
    ["Year / make / model", truckModelLine(truck) || null],
    ["Trailer #", truck.trailer_number],
    ["Equipment", equipmentLine(truck)],
    ["Max weight", truck.max_weight ? `${num(truck.max_weight)} lbs` : null],
    ["VIN", truck.vin_number],
    ["Plate", [truck.plate, truck.plate_state].filter(Boolean).join(" · ") || null],
    ["GVWR", truck.gvwr ? `${num(truck.gvwr)} lbs` : null],
    ["Leased or owned", truck.ownership === "leased" ? "Leased" : truck.ownership === "owned" ? "Owned" : null],
    ["Doors", truck.door_type],
    ["Suspension", truck.suspension],
  ];


  return (
    <Drawer
      open
      onClose={onClose}
      width="max-w-3xl"
      title={
        <span className="flex items-center gap-2">
          Unit {truck.unit_number}
          <Pill className={truck.status === "active" ? "bg-emerald-500/10 text-emerald-700 ring-emerald-600/20 dark:text-emerald-300" : neutralPill}>
            {availability(truck)}
          </Pill>
        </span>
      }
      subtitle={`${company?.name || ""} · ${equipmentLine(truck)}`}
      actions={
        manage ? (
          <>
            <Button size="sm" variant="ghost" onClick={() => onEdit(truck)}>
              <Pencil className="h-3.5 w-3.5" /> Edit details
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setManageId(null)}>
              <Check className="h-3.5 w-3.5" /> Done
            </Button>
          </>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => setManageId(truck.id)}>
            <Pencil className="h-3.5 w-3.5" /> Edit
          </Button>
        )
      }
    >
      <div className="space-y-6 p-5">
        <section>
          <Eyebrow className="mb-2">Trailer</Eyebrow>
          {manage ? (
            <TrailerPicker companyId={truck.company_id} value={truck.trailer_id} truckId={truck.id} />
          ) : (
            <div className="rounded-xl border border-line px-3.5 py-2.5 text-[13px] text-fg-2">{trailer ? `${trailer.unit_number} · ${trailerLine(trailer)}` : "Power only (no trailer)"}</div>
          )}
        </section>

        {/* Quick copy */}
        <section>
          <Eyebrow className="mb-2">Quick copy</Eyebrow>
          <div className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-2">
            {copyRows.map(([k, v]) => (
              <div key={k} className="flex items-center gap-3 bg-surface px-3.5 py-2.5">
                <span className="w-24 shrink-0 text-xs text-fg-3">{k}</span>
                <span className={cn("min-w-0 flex-1 truncate text-[13px] font-medium", v ? "text-fg" : "text-fg-4")}>{v || "—"}</span>
                <CopyButton text={v} />
              </div>
            ))}
          </div>
          {truck.important_info && (
            <div className="mt-2 flex items-start gap-3 rounded-xl border border-line bg-surface px-3.5 py-2.5">
              <span className="w-24 shrink-0 text-xs text-fg-3">Features</span>
              <span className="min-w-0 flex-1 text-[13px] text-fg">{truck.important_info}</span>
              <CopyButton text={truck.important_info} />
            </div>
          )}
        </section>

        {manage ? (
          <>
            <section>
              <Eyebrow className="mb-2">Truck documents</Eyebrow>
              <DocumentsPanel target={{ scope: "truck", id: truck.id, companyId: truck.company_id }} compact emptyText="No truck files yet." />
            </section>
          </>
        ) : (
          <SheetFiles title="Truck documents" docs={documents.filter((x) => x.truck_id === truck.id)} empty="No truck files yet. Click Edit to add them." />
        )}
      </div>
    </Drawer>
  );
}

