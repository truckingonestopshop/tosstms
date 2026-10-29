"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, Copy, MapPin, MoreHorizontal, PanelRightOpen, Pencil, Phone, Plus, Search, Trash2, Truck as TruckIcon, Users } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input, Segmented } from "@/components/ui/Field";
import { Card, Empty, Pill } from "@/components/ui/Bits";
import { Popover, MenuItem, MenuSep } from "@/components/ui/Menu";
import { confirmDialog } from "@/components/ui/Confirm";
import { TruckForm } from "@/components/fleet/TruckForm";
import { TruckSheet } from "@/components/fleet/TruckSheet";
import { DriverCard, DriverForm, DriverSheet, driverAlert, isTerminated } from "@/components/fleet/Drivers";
import { DriversTable } from "@/components/fleet/DriversTable";
import { useStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import { lane, num } from "@/lib/format";
import { availability, equipmentLine, pitchFor } from "@/lib/pitch";
import type { Company, Driver, Truck } from "@/lib/types";
import { useFleetHref } from "./fleetLinks";

/** A carrier's trucks (Companies → Trucks, and per carrier on Trucks & Equipment). */
export function TrucksTab({ company, trucks }: { company: Company; trucks: Truck[] }) {
  const params = useSearchParams();
  const router = useRouter();
  const href = useFleetHref();
  const { driverById, trailerById, memberById, me, loads, deleteTruck, isOwner } = useStore();
  const [q, setQ] = useState("");
  const [f, setF] = useState<"all" | "ready" | "loaded" | "oos">("all");
  const [form, setForm] = useState<{ open: boolean; truck?: Truck | null }>({ open: false });
  const sheetId = params.get("truck");
  const sheet = trucks.find((x) => x.id === sheetId) || null;
  const openSheet = (id: string | null) => router.replace(id ? href("trucks", "truck", id) : href("trucks"), { scroll: false });

  const onLoad = (t: Truck) => loads.find((l) => l.truck_id === t.id && l.status === "in_transit") || loads.find((l) => l.truck_id === t.id && ["booked", "new"].includes(l.status));
  const list = trucks.filter((t) => {
    if (q && !`${t.unit_number} ${t.trailer_number} ${t.trailer_type} ${t.current_location} ${driverById(t.assigned_driver_id)?.name}`.toLowerCase().includes(q.toLowerCase())) return false;
    if (f === "ready") return t.status === "active" && !onLoad(t);
    if (f === "loaded") return !!onLoad(t);
    if (f === "oos") return t.status !== "active";
    return true;
  });

  return (
    <>
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <Segmented
          value={f}
          onChange={setF}
          options={[
            { value: "all", label: "All" },
            { value: "ready", label: "Available" },
            { value: "loaded", label: "On a load" },
            { value: "oos", label: "Out of service" },
          ]}
          className="scrollbar-none overflow-x-auto"
        />
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-4" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Unit, trailer, driver, location" className="pl-9" />
        </div>
        <Button variant="secondary" onClick={() => setForm({ open: true, truck: null })}>
          <Plus className="h-4 w-4" /> Add truck
        </Button>
      </div>

      {list.length === 0 ? (
        <Card>
          <Empty icon={TruckIcon} title={trucks.length ? "No trucks match" : "No trucks yet"} body={trucks.length ? undefined : `Add ${company.name}'s power units and trailers.`} />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {list.map((t) => {
            const driver = driverById(t.assigned_driver_id);
            const load = onLoad(t);
            return (
              <Card key={t.id} className="flex flex-col p-4 transition-colors hover:border-line-strong">
                <div className="flex items-start gap-3">
                  <button onClick={() => openSheet(t.id)} className="min-w-0 flex-1 text-left">
                    <div className="flex items-center gap-2">
                      <span className="text-[17px] font-bold text-fg">Unit {t.unit_number}</span>
                      {t.trailer_number && <span className="truncate text-xs text-fg-3">Trailer {t.trailer_number}</span>}
                    </div>
                    <div className="mt-0.5 truncate text-[13px] text-fg-2">{equipmentLine(t)}</div>
                  </button>
                  <Pill
                    className={
                      t.status !== "active"
                        ? "bg-red-500/10 text-red-700 ring-red-600/20 dark:text-red-300"
                        : load
                          ? "bg-blue-500/10 text-blue-700 ring-blue-600/20 dark:text-blue-300"
                          : "bg-emerald-500/10 text-emerald-700 ring-emerald-600/20 dark:text-emerald-300"
                    }
                  >
                    {t.status !== "active" ? availability(t) : load ? (load.status === "in_transit" ? "In transit" : "Booked") : availability(t)}
                  </Pill>
                  <Popover
                    align="end"
                    width={190}
                    trigger={({ toggle, ref }) => (
                      <button ref={ref} onClick={toggle} className="-mr-1 rounded-md p-1 text-fg-3 hover:bg-surface-2" aria-label="Truck actions">
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                    )}
                  >
                    {(close) => (
                      <>
                        <MenuItem icon={PanelRightOpen} onClick={() => (close(), openSheet(t.id))}>
                          Broker sheet
                        </MenuItem>
                        <MenuItem icon={Pencil} onClick={() => (close(), setForm({ open: true, truck: t }))}>
                          Edit
                        </MenuItem>
                        {isOwner && (
                          <>
                            <MenuSep />
                            <MenuItem
                              icon={Trash2}
                              danger
                              onClick={async () => {
                                close();
                                if (await confirmDialog({ title: `Delete unit ${t.unit_number}?`, body: "Loads keep their history but lose the truck link.", confirmLabel: "Delete", danger: true }))
                                  if (await deleteTruck(t.id)) toast.success("Truck deleted");
                              }}
                            >
                              Delete
                            </MenuItem>
                          </>
                        )}
                      </>
                    )}
                  </Popover>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-[13px]">
                  <div className="min-w-0">
                    <div className="text-[11px] text-fg-4">Driver</div>
                    <div className="truncate text-fg">{driver?.name || <span className="text-fg-4">Unassigned</span>}</div>
                    {driver?.phone && (
                      <a href={`tel:${driver.phone}`} className="flex items-center gap-1 truncate text-xs text-fg-3 hover:text-fg">
                        <Phone className="h-3 w-3" /> {driver.phone}
                      </a>
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="text-[11px] text-fg-4">Location</div>
                    <div className="flex items-center gap-1 truncate text-fg">
                      <MapPin className="h-3 w-3 shrink-0 text-fg-4" />
                      <span className="truncate">{t.current_location || "—"}</span>
                    </div>
                    <div className="text-xs text-fg-3">{t.max_weight ? `${num(t.max_weight)} lbs` : ""}</div>
                  </div>
                </div>

                {load && (
                  <div className="mt-3 truncate rounded-lg bg-surface-2/70 px-2.5 py-1.5 text-xs text-fg-2">
                    {lane(load)}
                  </div>
                )}

                {t.accessories.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1">
                    {t.accessories.slice(0, 5).map((a) => (
                      <span key={a.id} className="rounded-md border border-line px-1.5 py-0.5 text-[11px] text-fg-3">
                        {a.quantity}× {a.name}
                      </span>
                    ))}
                    {t.accessories.length > 5 && <span className="px-1 py-0.5 text-[11px] text-fg-4">+{t.accessories.length - 5}</span>}
                  </div>
                )}

                <div className="mt-auto flex gap-2 pt-4">
                  <Button size="sm" variant="outline" className="flex-1" onClick={() => openSheet(t.id)}>
                    <PanelRightOpen className="h-3.5 w-3.5" /> Broker sheet
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      navigator.clipboard.writeText(pitchFor(t, company, driver, trailerById(t.trailer_id), memberById(me.id)));
                      toast.success("Pitch copied");
                    }}
                  >
                    <Copy className="h-3.5 w-3.5" /> Pitch
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <TruckForm open={form.open} truck={form.truck} companyId={company.id} onClose={() => setForm({ open: false })} />
      <TruckSheet truck={sheet} onClose={() => openSheet(null)} onEdit={(tr) => setForm({ open: true, truck: tr })} />
    </>
  );
}

/** A carrier's drivers (Companies → Drivers, and per carrier on Drivers). */
export function DriversTab({ company, drivers }: { company: Company; drivers: Driver[] }) {
  const params = useSearchParams();
  const router = useRouter();
  const href = useFleetHref();
  const { view } = useStore();
  const office = view === "office";
  const [q, setQ] = useState("");
  const [shown, setShown] = useState<"active" | "terminated" | "all">("active");
  const [form, setForm] = useState<{ open: boolean; driver?: Driver | null }>({ open: false });
  const sheet = drivers.find((x) => x.id === params.get("driver")) || null;
  const openSheet = (id: string | null) => router.replace(id ? href("drivers", "driver", id) : href("drivers"), { scroll: false });
  const list = drivers
    .filter((d) => !office || shown === "all" || (shown === "terminated") === isTerminated(d))
    .filter((d) => !q || `${d.name} ${d.phone} ${d.email} ${d.cdl_number}`.toLowerCase().includes(q.toLowerCase()));
  const alerts = drivers.filter(driverAlert).length;

  return (
    <>
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-4" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, phone, email, license #" className="pl-9" />
        </div>
        {alerts > 0 && (
          <span className="inline-flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-300">
            <AlertTriangle className="h-3.5 w-3.5" /> {alerts} with license or medical card expiring
          </span>
        )}
        {office && (
          <Segmented
            value={shown}
            onChange={setShown}
            options={[
              { value: "active", label: `Active ${drivers.filter((d) => !isTerminated(d)).length}` },
              { value: "terminated", label: `Terminated ${drivers.filter((d) => isTerminated(d)).length}` },
              { value: "all", label: "All" },
            ]}
          />
        )}
        <Button variant="secondary" onClick={() => setForm({ open: true, driver: null })}>
          <Plus className="h-4 w-4" /> Add driver
        </Button>
      </div>
      {list.length === 0 ? (
        <Card>
          <Empty icon={Users} title={drivers.length ? "No drivers match" : "No drivers yet"} />
        </Card>
      ) : office ? (
        <DriversTable drivers={list} onOpen={openSheet} />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {list.map((d) => (
            <DriverCard key={d.id} d={d} onOpen={() => openSheet(d.id)} />
          ))}
        </div>
      )}
      <DriverForm open={form.open} driver={form.driver} companyId={company.id} onClose={() => setForm({ open: false })} />
      <DriverSheet driver={sheet} onClose={() => openSheet(null)} onEdit={(d) => setForm({ open: true, driver: d })} />
    </>
  );
}

