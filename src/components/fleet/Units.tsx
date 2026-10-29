"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Container, GripVertical, Link2Off, Phone, Plus, Truck as TruckIcon, User, UserMinus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, Empty } from "@/components/ui/Bits";
import { Select } from "@/components/ui/Field";
import { Popover, MenuItem, MenuLabel, MenuSep } from "@/components/ui/Menu";
import { stagger } from "@/components/ui/Motion";
import { useStore } from "@/lib/store";
import { useFleetHref, useOpenSheet } from "./fleetLinks";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/format";
import { availability, truckModelLine, truckLabel } from "@/lib/pitch";
import { specsLine } from "@/lib/trailerSpecs";
import type { Company, Driver, Trailer, Truck } from "@/lib/types";
import { TrailerForm, trailerLine } from "./Trailers";

// ---------------------------------------------------------------------------
// Drag & drop: a trailer or a driver card can be dragged onto a truck's slot.
// Every drop has a click alternative (the slot's menu) for phones and keyboards.
// ---------------------------------------------------------------------------
type Drag = { kind: "trailer" | "driver"; id: string };
const MIME = "application/x-tms-unit";
const setDrag = (e: React.DragEvent, d: Drag) => {
  e.dataTransfer.setData(MIME, JSON.stringify(d));
  e.dataTransfer.effectAllowed = "move";
};
const readDrag = (e: React.DragEvent): Drag | null => {
  try {
    return JSON.parse(e.dataTransfer.getData(MIME));
  } catch {
    return null;
  }
};

type RigState = "ready" | "no_driver" | "no_trailer" | "empty" | "down";
const RIG: Record<RigState, { label: string; cls: string }> = {
  ready: { label: "Ready to dispatch", cls: "bg-emerald-500/10 text-emerald-700 ring-emerald-600/20 dark:text-emerald-300" },
  no_driver: { label: "Needs a driver", cls: "bg-amber-500/10 text-amber-800 ring-amber-600/25 dark:text-amber-300" },
  no_trailer: { label: "Power only", cls: "bg-sky-500/10 text-sky-700 ring-sky-600/20 dark:text-sky-300" },
  empty: { label: "Needs driver & trailer", cls: "bg-amber-500/10 text-amber-800 ring-amber-600/25 dark:text-amber-300" },
  down: { label: "Out of service", cls: "bg-zinc-500/10 text-zinc-600 ring-zinc-600/20 dark:text-zinc-300" },
};
const rigState = (t: Truck): RigState =>
  t.status !== "active" ? "down" : !t.assigned_driver_id && !t.trailer_id ? "empty" : !t.assigned_driver_id ? "no_driver" : !t.trailer_id ? "no_trailer" : "ready";

/**
 * The carrier's rigs at a glance: each truck with the trailer it pulls and the driver
 * who drives it, plus what's free (trailers in the yard, drivers without a truck).
 */
export function UnitsTab({ company }: { company: Company }) {
  const { trucks, trailers, drivers, hookTrailer, assignDriver, trailerById, driverById } = useStore();
  const router = useRouter();
  const href = useFleetHref();
  const openSheet = useOpenSheet();
  const [newTrailerFor, setNewTrailerFor] = useState<string | null>(null);
  const own = useMemo(() => trucks.filter((t) => t.company_id === company.id && t.status !== "inactive"), [trucks, company.id]);
  const ownTrailers = trailers.filter((t) => t.company_id === company.id && t.status !== "inactive");
  const ownDrivers = drivers.filter((d) => d.company_id === company.id && d.status === "active");
  const yard = ownTrailers.filter((t) => !trucks.some((x) => x.trailer_id === t.id));
  const free = ownDrivers.filter((d) => !trucks.some((x) => x.assigned_driver_id === d.id));
  const ready = own.filter((t) => rigState(t) === "ready").length;

  const hook = async (truck: Truck, trailerId: string | null) => {
    if (truck.trailer_id === trailerId) return;
    const from = trailerId ? trucks.find((x) => x.trailer_id === trailerId && x.id !== truck.id) : undefined;
    const t = trailerById(trailerId);
    if (await hookTrailer(truck.id, trailerId))
      toast.success(trailerId ? `Trailer ${t?.unit_number} hooked to unit ${truck.unit_number}${from ? ` (unit ${from.unit_number} is now power only)` : ""}` : `Unit ${truck.unit_number} dropped its trailer`);
  };
  const assign = async (truck: Truck, driverId: string | null) => {
    if (truck.assigned_driver_id === driverId) return;
    const from = driverId ? trucks.find((x) => x.assigned_driver_id === driverId && x.id !== truck.id) : undefined;
    if (await assignDriver(truck.id, driverId))
      toast.success(driverId ? `${driverById(driverId)?.name} now drives unit ${truck.unit_number}${from ? ` (left unit ${from.unit_number})` : ""}` : `Unit ${truck.unit_number} has no driver`);
  };
  const onDrop = (truck: Truck, accept: Drag["kind"]) => (e: React.DragEvent) => {
    const d = readDrag(e);
    if (!d || d.kind !== accept) return;
    e.preventDefault();
    if (d.kind === "trailer") hook(truck, d.id);
    else assign(truck, d.id);
  };

  if (!own.length) {
    return (
      <Card>
        <Empty
          icon={TruckIcon}
          title="No trucks yet"
          body="Add the carrier's trucks first. Then hook a trailer and put a driver on each one here."
          action={
            <Button variant="primary" onClick={() => router.replace(href("trucks"))}>
              Go to trucks
            </Button>
          }
        />
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
      <div className="min-w-0 space-y-3">
        {/* The company the rigs belong to, and how many are ready */}
        <div className="animate-rise flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-line bg-surface px-4 py-3">
          <Building2 className="h-4 w-4 text-fg-4" />
          <span className="text-sm font-semibold text-fg">{company.name}</span>
          <span className="text-[13px] text-fg-3">
            {ready} of {own.length} truck{own.length === 1 ? "" : "s"} ready to dispatch · {yard.length} trailer{yard.length === 1 ? "" : "s"} in the yard · {free.length} driver
            {free.length === 1 ? "" : "s"} without a truck
          </span>
          <span className="ml-auto hidden text-xs text-fg-4 md:inline">Drag a trailer or driver onto a truck, or click a slot</span>
        </div>

        <ul className="space-y-2.5">
          {own.map((truck, i) => (
            <RigRow
              key={truck.id}
              i={i}
              truck={truck}
              trailer={trailerById(truck.trailer_id)}
              driver={driverById(truck.assigned_driver_id)}
              trailers={ownTrailers}
              drivers={ownDrivers}
              trucks={trucks}
              onHook={(id) => hook(truck, id)}
              onAssign={(id) => assign(truck, id)}
              onDropTrailer={onDrop(truck, "trailer")}
              onDropDriver={onDrop(truck, "driver")}
              onNewTrailer={() => setNewTrailerFor(truck.id)}
              open={(_tab, key, id) => openSheet(key, id)}
            />
          ))}
        </ul>
      </div>

      {/* What's free: drag from here onto a truck */}
      <aside className="space-y-4 xl:sticky xl:top-[72px] xl:self-start">
        <Pool title="Trailers in the yard" empty="Every trailer is hooked." count={yard.length}>
          {yard.map((t, i) => (
            <Chip key={t.id} i={i} drag={{ kind: "trailer", id: t.id }} icon={Container} title={t.unit_number} sub={trailerLine(t)} onClick={() => openSheet("trailer", t.id)} />
          ))}
        </Pool>
        <Pool title="Drivers without a truck" empty="Every driver has a truck." count={free.length}>
          {free.map((d, i) => (
            <Chip key={d.id} i={i} drag={{ kind: "driver", id: d.id }} icon={User} title={d.name} sub={d.phone || "No phone"} onClick={() => openSheet("driver", d.id)} />
          ))}
        </Pool>
      </aside>

      <TrailerForm open={!!newTrailerFor} onClose={() => setNewTrailerFor(null)} companyId={company.id} hookTo={newTrailerFor} />
    </div>
  );
}

function RigRow({
  i,
  truck,
  trailer,
  driver,
  trailers,
  drivers,
  trucks,
  onHook,
  onAssign,
  onDropTrailer,
  onDropDriver,
  onNewTrailer,
  open,
}: {
  i: number;
  truck: Truck;
  trailer?: Trailer;
  driver?: Driver;
  trailers: Trailer[];
  drivers: Driver[];
  trucks: Truck[];
  onHook: (id: string | null) => void;
  onAssign: (id: string | null) => void;
  onDropTrailer: (e: React.DragEvent) => void;
  onDropDriver: (e: React.DragEvent) => void;
  onNewTrailer: () => void;
  open: (tab: "trucks" | "trailers" | "drivers", key: "truck" | "trailer" | "driver", id: string) => void;
}) {
  const st = RIG[rigState(truck)];
  const onTruck = (pred: (t: Truck) => boolean) => trucks.find((t) => t.id !== truck.id && pred(t));
  const yardTrailers = trailers.filter((t) => !trucks.some((x) => x.trailer_id === t.id));
  const busyTrailers = trailers.filter((t) => t.id !== truck.trailer_id && trucks.some((x) => x.trailer_id === t.id));
  const freeDrivers = drivers.filter((d) => !trucks.some((x) => x.assigned_driver_id === d.id));
  const busyDrivers = drivers.filter((d) => d.id !== truck.assigned_driver_id && trucks.some((x) => x.assigned_driver_id === d.id));

  return (
    <li className="animate-rise rounded-xl border border-line bg-surface p-3 sm:p-4" style={stagger(i, 40)}>
      <div className="flex flex-col gap-2 md:flex-row md:items-stretch md:gap-0">
        {/* Truck */}
        <button
          onClick={() => open("trucks", "truck", truck.id)}
          className="group flex min-w-0 items-center gap-3 rounded-lg border border-line bg-surface-2/50 px-3 py-2.5 text-left transition-colors hover:border-line-strong md:w-[30%]"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-inverse text-inverse-fg">
            <TruckIcon className="h-4 w-4" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-fg group-hover:underline">Unit {truck.unit_number}</span>
            <span className="block truncate text-xs text-fg-3">
              {truckModelLine(truck) || "Truck"} · {availability(truck)}
            </span>
          </span>
        </button>

        <Link on={!!trailer} />

        {/* Trailer slot */}
        <Slot
          filled={!!trailer}
          accept="trailer"
          onDrop={onDropTrailer}
          drag={trailer ? { kind: "trailer", id: trailer.id } : undefined}
          icon={Container}
          title={trailer ? trailer.unit_number : "No trailer"}
          sub={trailer ? [trailerLine(trailer), specsLine(trailer.trailer_type, trailer.specs)].filter(Boolean).join(" · ") : "Power only · drop a trailer here"}
          onOpen={trailer ? () => open("trailers", "trailer", trailer.id) : undefined}
          menu={(close) => (
            <>
              {yardTrailers.length > 0 && <MenuLabel>In the yard</MenuLabel>}
              {yardTrailers.map((t) => (
                <MenuItem key={t.id} icon={Container} onClick={() => (close(), onHook(t.id))} hint={trailerLine(t)}>
                  {t.unit_number}
                </MenuItem>
              ))}
              {busyTrailers.length > 0 && <MenuLabel>Take from another truck</MenuLabel>}
              {busyTrailers.map((t) => (
                <MenuItem key={t.id} icon={Container} onClick={() => (close(), onHook(t.id))} hint={`unit ${onTruck((x) => x.trailer_id === t.id)?.unit_number}`}>
                  {t.unit_number}
                </MenuItem>
              ))}
              <MenuSep />
              <MenuItem icon={Plus} onClick={() => (close(), onNewTrailer())}>
                New trailer
              </MenuItem>
              {trailer && (
                <MenuItem icon={Link2Off} danger onClick={() => (close(), onHook(null))}>
                  Drop trailer (power only)
                </MenuItem>
              )}
            </>
          )}
        />

        <Link on={!!driver} />

        {/* Driver slot */}
        <Slot
          filled={!!driver}
          accept="driver"
          onDrop={onDropDriver}
          drag={driver ? { kind: "driver", id: driver.id } : undefined}
          icon={User}
          title={driver ? driver.name : "No driver"}
          sub={driver ? driver.phone || "No phone" : "Drop a driver here"}
          onOpen={driver ? () => open("drivers", "driver", driver.id) : undefined}
          extra={
            driver?.phone ? (
              <a href={`tel:${driver.phone}`} onClick={(e) => e.stopPropagation()} className="rounded-md p-1.5 text-fg-3 hover:bg-surface-2 hover:text-fg" aria-label={`Call ${driver.name}`}>
                <Phone className="h-3.5 w-3.5" />
              </a>
            ) : null
          }
          menu={(close) => (
            <>
              {freeDrivers.length > 0 && <MenuLabel>Without a truck</MenuLabel>}
              {freeDrivers.map((d) => (
                <MenuItem key={d.id} icon={User} onClick={() => (close(), onAssign(d.id))} hint={d.phone || undefined}>
                  {d.name}
                </MenuItem>
              ))}
              {busyDrivers.length > 0 && <MenuLabel>Move from another truck</MenuLabel>}
              {busyDrivers.map((d) => (
                <MenuItem key={d.id} icon={User} onClick={() => (close(), onAssign(d.id))} hint={`unit ${onTruck((x) => x.assigned_driver_id === d.id)?.unit_number}`}>
                  {d.name}
                </MenuItem>
              ))}
              {!freeDrivers.length && !busyDrivers.length && <div className="px-2.5 py-2 text-[13px] text-fg-3">No other active drivers. Add one in Drivers.</div>}
              {driver && (
                <>
                  <MenuSep />
                  <MenuItem icon={UserMinus} danger onClick={() => (close(), onAssign(null))}>
                    Take driver off this truck
                  </MenuItem>
                </>
              )}
            </>
          )}
        />
      </div>
      <div className="mt-2 flex items-center justify-between gap-2 pl-0.5">
        <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset", st.cls)}>{st.label}</span>
        {truck.current_location && <span className="truncate text-xs text-fg-4">{truck.current_location}</span>}
      </div>
    </li>
  );
}

/** The line between truck, trailer and driver: solid when connected, dashed when empty. */
function Link({ on }: { on: boolean }) {
  return (
    <div aria-hidden className="flex shrink-0 items-center justify-center md:w-8">
      <span className={cn("block h-4 w-px md:h-px md:w-full", on ? "bg-brand" : "border-l border-dashed border-line-strong md:border-l-0 md:border-t")} />
      {on && <span className="absolute hidden h-1.5 w-1.5 rounded-full bg-brand md:block" />}
    </div>
  );
}

function Slot({
  filled,
  accept,
  onDrop,
  drag,
  icon: Icon,
  title,
  sub,
  onOpen,
  menu,
  extra,
}: {
  filled: boolean;
  accept: Drag["kind"];
  onDrop: (e: React.DragEvent) => void;
  drag?: Drag;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  sub: string;
  onOpen?: () => void;
  menu: (close: () => void) => React.ReactNode;
  extra?: React.ReactNode;
}) {
  const [over, setOver] = useState(false);
  return (
    <div
      onDragOver={(e) => {
        if (![...e.dataTransfer.types].includes(MIME)) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        setOver(false);
        onDrop(e);
      }}
      draggable={!!drag}
      onDragStart={drag ? (e) => setDrag(e, drag) : undefined}
      className={cn(
        "group relative flex min-w-0 flex-1 items-center gap-2.5 rounded-lg border px-3 py-2.5 transition-[border-color,background-color,transform] duration-150",
        filled ? "border-line bg-surface" : "border-dashed border-line-strong bg-transparent",
        over && "scale-[1.01] border-brand bg-brand/5",
        drag && "cursor-grab active:cursor-grabbing",
      )}
      data-accept={accept}
    >
      {drag && <GripVertical className="h-3.5 w-3.5 shrink-0 text-fg-4 opacity-0 transition-opacity group-hover:opacity-100" />}
      <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", filled ? "bg-surface-2 text-fg-2" : "text-fg-4")}>
        <Icon className="h-4 w-4" />
      </span>
      <button onClick={onOpen} disabled={!onOpen} className="min-w-0 flex-1 text-left disabled:cursor-default">
        <span className={cn("block truncate text-[13px] font-semibold", filled ? "text-fg group-hover:underline" : "text-fg-3")}>{title}</span>
        <span className="block truncate text-xs text-fg-3">{sub}</span>
      </button>
      {extra}
      <Popover
        align="end"
        width={260}
        trigger={({ toggle, ref }) => (
          <Button ref={ref} size="xs" variant={filled ? "ghost" : "outline"} onClick={toggle} aria-label={filled ? `Change ${accept}` : `Add ${accept}`}>
            {filled ? "Change" : accept === "trailer" ? "Hook" : "Assign"}
          </Button>
        )}
      >
        {(close) => <div className="max-h-80 overflow-y-auto p-1">{menu(close)}</div>}
      </Popover>
    </div>
  );
}

function Pool({ title, empty, count, children }: { title: string; empty: string; count: number; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-surface">
      <div className="flex items-center justify-between border-b border-line px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-fg-3">{title}</span>
        <span className="tnum text-xs text-fg-4">{count}</span>
      </div>
      <div className="space-y-1.5 p-2">{count ? children : <div className="px-1.5 py-2 text-xs text-fg-4">{empty}</div>}</div>
    </div>
  );
}

function Chip({
  drag,
  icon: Icon,
  title,
  sub,
  onClick,
  i,
}: {
  drag: Drag;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  sub: string;
  onClick: () => void;
  i: number;
}) {
  return (
    <button
      draggable
      onDragStart={(e) => setDrag(e, drag)}
      onClick={onClick}
      className="animate-rise group flex w-full cursor-grab items-center gap-2.5 rounded-lg border border-line bg-surface-2/40 px-2.5 py-2 text-left transition-colors hover:border-line-strong active:cursor-grabbing"
      style={stagger(i, 30)}
      title="Drag onto a truck"
    >
      <GripVertical className="h-3.5 w-3.5 shrink-0 text-fg-4" />
      <Icon className="h-4 w-4 shrink-0 text-fg-3" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium text-fg">{title}</span>
        <span className="block truncate text-[11px] text-fg-3">{sub}</span>
      </span>
    </button>
  );
}

/**
 * The rig a driver drives: pick the truck (moves the driver off any other truck) and see
 * the trailer it pulls. Used in the driver sheet.
 */
export function DriverRig({ driver, readOnly }: { driver: Driver; readOnly?: boolean }) {
  const { trucks, trailerById, assignDriver } = useStore();
  const openSheet = useOpenSheet();
  const [busy, setBusy] = useState(false);
  const truck = trucks.find((t) => t.assigned_driver_id === driver.id);
  const trailer = trailerById(truck?.trailer_id);
  const own = trucks.filter((t) => t.company_id === driver.company_id && t.status !== "inactive");
  const change = async (truckId: string) => {
    setBusy(true);
    if (truckId) {
      const t = trucks.find((x) => x.id === truckId);
      if (await assignDriver(truckId, driver.id)) toast.success(`${driver.name} now drives unit ${t?.unit_number}`);
    } else if (truck && (await assignDriver(truck.id, null))) toast.success(`${driver.name} is off unit ${truck.unit_number}`);
    setBusy(false);
  };
  return (
    <div className="rounded-xl border border-line bg-surface p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <span className="text-xs font-semibold uppercase tracking-wider text-fg-4 sm:w-14">Drives</span>
        {readOnly ? (
          <span className="text-[13px] text-fg-2">{truck ? "" : "No truck"}</span>
        ) : (
        <Select
          value={truck?.id || ""}
          disabled={busy}
          onChange={(e) => change(e.target.value)}
          aria-label="Truck this driver drives"
          className="flex-1"
        >
          <option value="">No truck</option>
          {own.map((t) => {
            const other = t.assigned_driver_id && t.assigned_driver_id !== driver.id;
            return (
              <option key={t.id} value={t.id}>
                {truckLabel(t)}
                {t.trailer_number ? ` · ${t.trailer_number} ${t.trailer_type || ""}` : " · power only"}
                {other ? " · has a driver" : ""}
              </option>
            );
          })}
        </Select>
        )}
      </div>
      {truck && (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[13px]">
          <button onClick={() => openSheet("truck", truck.id)} className="inline-flex items-center gap-1.5 rounded-md bg-surface-2 px-2 py-1 font-medium text-fg hover:bg-surface-3">
            <TruckIcon className="h-3.5 w-3.5" /> Unit {truck.unit_number}
          </button>
          <span className="h-px w-4 bg-brand" aria-hidden />
          {trailer ? (
            <button onClick={() => openSheet("trailer", trailer.id)} className="inline-flex items-center gap-1.5 rounded-md bg-surface-2 px-2 py-1 font-medium text-fg hover:bg-surface-3">
              <Container className="h-3.5 w-3.5" /> {trailer.unit_number} · {trailerLine(trailer)}
            </button>
          ) : (
            <span className="text-fg-3">Power only</span>
          )}
        </div>
      )}
    </div>
  );
}
