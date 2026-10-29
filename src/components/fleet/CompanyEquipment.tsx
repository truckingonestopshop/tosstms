"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Container, Network, Sheet, Truck as TruckIcon, Users } from "lucide-react";
import { Tabs } from "@/components/ui/Bits";
import { useStore } from "@/lib/store";
import type { Company, Driver, Trailer, Truck } from "@/lib/types";
import { UnitsTab } from "./Units";
import { DriversTab, TrucksTab } from "./FleetTabs";
import { TrailerForm, TrailerSheet, TrailersTab } from "./Trailers";
import { TruckForm } from "./TruckForm";
import { TruckSheet } from "./TruckSheet";
import { DriverForm, DriverSheet } from "./Drivers";
import { useOpenSheet } from "./fleetLinks";
import { EquipmentTable } from "./EquipmentTable";

// A company's Equipment & Drivers tab: Units · Trucks · Trailers · Drivers in one place. The URL
// keeps the old tab names (/fleet?tab=trucks&truck=…), so every existing link still works.
// Clicking a truck, trailer or driver opens its panel on the right without leaving the screen.

export type EquipmentTab = "units" | "trucks" | "trailers" | "drivers" | "equipment_list";
export const EQUIPMENT_TABS: EquipmentTab[] = ["units", "trucks", "trailers", "drivers", "equipment_list"];
export const isEquipmentTab = (t: string): t is EquipmentTab => (EQUIPMENT_TABS as string[]).includes(t);

export function CompanyEquipment({ company, tab, onTab }: { company: Company; tab: EquipmentTab; onTab: (t: EquipmentTab) => void }) {
  const { trucks, trailers, drivers } = useStore();
  const t = trucks.filter((x) => x.company_id === company.id);
  const tl = trailers.filter((x) => x.company_id === company.id);
  const d = drivers.filter((x) => x.company_id === company.id);
  const openSheet = useOpenSheet();
  return (
    <>
      <Tabs<EquipmentTab>
        value={tab}
        onChange={onTab}
        className="mb-4"
        tabs={[
          { value: "units", label: <><Network className="h-4 w-4" /> Units</>, count: t.filter((x) => x.status !== "inactive").length },
          { value: "trucks", label: <><TruckIcon className="h-4 w-4" /> Trucks</>, count: t.length },
          { value: "trailers", label: <><Container className="h-4 w-4" /> Trailers</>, count: tl.length },
          { value: "drivers", label: <><Users className="h-4 w-4" /> Drivers</>, count: d.length },
          { value: "equipment_list", label: <><Sheet className="h-4 w-4" /> Equipment list</>, count: t.length + tl.length },
        ]}
      />
      {tab === "units" && <UnitsTab company={company} />}
      {tab === "trucks" && <TrucksTab company={company} trucks={t} />}
      {tab === "trailers" && <TrailersTab company={company} />}
      {tab === "drivers" && <DriversTab company={company} drivers={d} />}
      {tab === "equipment_list" && <EquipmentTable trucks={t} trailers={tl} onOpen={(k, id) => openSheet(k, id)} />}
      <SheetHost tab={tab} />
    </>
  );
}

/**
 * The panels the current screen doesn't show itself (Trucks shows trucks, Trailers trailers, Drivers
 * drivers; Units shows none), so e.g. a driver clicked on Units opens right there.
 */
function SheetHost({ tab }: { tab: EquipmentTab }) {
  const params = useSearchParams();
  const { trucks, trailers, drivers } = useStore();
  const openSheet = useOpenSheet();
  const [edit, setEdit] = useState<{ truck?: Truck; trailer?: Trailer; driver?: Driver } | null>(null);
  const truck = tab !== "trucks" ? trucks.find((x) => x.id === params.get("truck")) || null : null;
  const trailer = tab !== "trailers" ? trailers.find((x) => x.id === params.get("trailer")) || null : null;
  const driver = tab !== "drivers" ? drivers.find((x) => x.id === params.get("driver")) || null : null;
  return (
    <>
      {tab !== "trucks" && <TruckSheet truck={truck} onClose={() => openSheet("truck", null)} onEdit={(x) => setEdit({ truck: x })} />}
      {tab !== "trailers" && <TrailerSheet trailer={trailer} onClose={() => openSheet("trailer", null)} onEdit={(x) => setEdit({ trailer: x })} />}
      {tab !== "drivers" && <DriverSheet driver={driver} onClose={() => openSheet("driver", null)} onEdit={(x) => setEdit({ driver: x })} />}
      {edit?.truck && <TruckForm open truck={edit.truck} companyId={edit.truck.company_id} onClose={() => setEdit(null)} />}
      {edit?.trailer && <TrailerForm open trailer={edit.trailer} companyId={edit.trailer.company_id} onClose={() => setEdit(null)} />}
      {edit?.driver && <DriverForm open driver={edit.driver} companyId={edit.driver.company_id} onClose={() => setEdit(null)} />}
    </>
  );
}
