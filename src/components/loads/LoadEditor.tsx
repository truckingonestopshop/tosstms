"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { Card, CardHeader } from "@/components/ui/Bits";
import { RateConDrop } from "./RateConDrop";
import { StopsEditor, newStop } from "./StopsEditor";
import { RouteMap } from "./RouteMap";
import { useStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import { useRoute } from "@/lib/route";
import { STATUS, STATUS_ORDER, cn, cut, money, num } from "@/lib/format";
import { TrailerTypeSelect } from "@/components/fleet/Trailers";
import type { ReadResult } from "@/lib/ratecon/client";
import type { Load, LoadStatus, LoadStop } from "@/lib/types";

type Draft = {
  company_id: string;
  driver_id: string;
  truck_id: string;
  trailer_id: string;
  status: LoadStatus;
  load_number: string;
  rate_con_number: string;
  broker_name: string;
  broker_mc: string;
  broker_contact: string;
  broker_email: string;
  broker_phone: string;
  gross_amount: string;
  commission_percent: string;
  loaded_miles: string;
  deadhead_miles: string;
  deadhead_from: string;
  weight_lbs: string;
  commodity: string;
  equipment_type: string;
  broker_notes: string;
  internal_notes: string;
  stops: LoadStop[];
};

const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const clean = (v: string) => v.replace(/[^0-9.]/g, "");
const squash = (x: string) => x.toLowerCase().replace(/[^a-z0-9]/g, "");

function fromLoad(l: Load): Draft {
  return {
    company_id: l.company_id,
    driver_id: s(l.driver_id),
    truck_id: s(l.truck_id),
    trailer_id: s(l.trailer_id),
    status: l.status,
    load_number: s(l.load_number),
    rate_con_number: s(l.rate_con_number),
    broker_name: l.broker_name,
    broker_mc: s(l.broker_mc),
    broker_contact: s(l.broker_contact),
    broker_email: s(l.broker_email),
    broker_phone: s(l.broker_phone),
    gross_amount: l.gross_amount ? String(l.gross_amount) : "",
    commission_percent: String(l.commission_percent),
    loaded_miles: l.loaded_miles ? String(l.loaded_miles) : "",
    deadhead_miles: l.deadhead_miles ? String(l.deadhead_miles) : "",
    deadhead_from: s(l.deadhead_from),
    weight_lbs: l.weight_lbs ? String(l.weight_lbs) : "",
    commodity: s(l.commodity),
    equipment_type: s(l.equipment_type),
    broker_notes: s(l.broker_notes),
    internal_notes: s(l.internal_notes),
    stops: l.stops.length
      ? l.stops.map((x) => newStop(x.type, x))
      : [
          newStop("pickup", { city: l.origin_city, state: l.origin_state, date: s(l.pickup_date) }),
          newStop("delivery", { city: l.destination_city, state: l.destination_state, date: s(l.delivery_date) }),
        ],
  };
}

export function LoadEditor({ load, onDone }: { load?: Load; onDone?: (l: Load) => void }) {
  const router = useRouter();
  const { companies, drivers, trucks, trailers, scope, companyById, truckById, createLoad, updateLoad, uploadDocument, loads } = useStore();
  const editing = !!load;

  const initialCompany = load?.company_id || (scope !== "all" ? scope : companies.length === 1 ? companies[0].id : "");
  const [d, setD] = useState<Draft>(() =>
    load
      ? fromLoad(load)
      : {
          company_id: initialCompany,
          driver_id: "",
          truck_id: "",
          trailer_id: "",
          status: "booked",
          load_number: "",
          rate_con_number: "",
          broker_name: "",
          broker_mc: "",
          broker_contact: "",
          broker_email: "",
          broker_phone: "",
          gross_amount: "",
          commission_percent: String(companyById(initialCompany)?.commission_percent ?? ""),
          loaded_miles: "",
          deadhead_miles: "",
          deadhead_from: "",
          weight_lbs: "",
          commodity: "",
          equipment_type: "",
          broker_notes: "",
          internal_notes: "",
          stops: [newStop("pickup"), newStop("delivery")],
        },
  );
  const set = (p: Partial<Draft>) => setD((x) => ({ ...x, ...p }));
  const [milesAuto, setMilesAuto] = useState(!load || !load.loaded_miles);
  const [rcFile, setRcFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [dhAuto, setDhAuto] = useState(!load || !load.deadhead_miles);
  const dhTouched = useRef(!!load?.deadhead_from);
  const pctTouched = useRef(editing);

  const company = companyById(d.company_id);
  const companyDrivers = drivers.filter((x) => x.company_id === d.company_id);
  const companyTrucks = trucks.filter((x) => x.company_id === d.company_id);
  const companyTrailers = trailers.filter((x) => x.company_id === d.company_id && (x.status !== "inactive" || x.id === d.trailer_id));

  // New company → its dispatch fee, unless the % was changed by hand.
  useEffect(() => {
    if (!pctTouched.current && company) set({ commission_percent: String(company.commission_percent) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d.company_id]);

  const route = useRoute(d.stops, { from: d.deadhead_from });
  useEffect(() => {
    if (milesAuto && route.data?.miles) set({ loaded_miles: String(route.data.miles) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.data?.miles, milesAuto]);
  // Deadhead follows the routed empty leg until it is typed by hand.
  const routedDh = route.data?.deadhead?.point ? route.data.deadhead.miles : null;
  useEffect(() => {
    if (dhAuto && routedDh !== null) set({ deadhead_miles: routedDh ? String(routedDh) : "0" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routedDh, dhAuto]);

  const gross = Number(d.gross_amount) || 0;
  const pct = Number(d.commission_percent) || 0;
  const loaded = Number(d.loaded_miles) || 0;
  const dh = Number(d.deadhead_miles) || 0;
  const fee = cut(gross, pct);
  const rpmLoaded = loaded ? gross / loaded : 0;
  const rpmAll = loaded + dh ? gross / (loaded + dh) : 0;
  const types = useMemo(() => d.stops.map((x) => x.type), [d.stops]);

  const applyRead = (r: ReadResult) => {
    const x = r.data;
    let companyId = d.company_id;
    if (x.carrier_name) {
      const c = companies.find((c) => squash(c.name).includes(squash(x.carrier_name!)) || squash(x.carrier_name!).includes(squash(c.name)));
      if (c) companyId = c.id;
    }
    const pool = drivers.filter((v) => !companyId || v.company_id === companyId);
    const drv = x.driver_name ? pool.find((v) => squash(v.name).includes(squash(x.driver_name!)) || squash(x.driver_name!).includes(squash(v.name))) : undefined;
    const tPool = trucks.filter((v) => !companyId || v.company_id === companyId);
    const trk = x.truck_unit ? tPool.find((v) => squash(v.unit_number) === squash(x.truck_unit!)) : undefined;
    const trlPool = trailers.filter((v) => !companyId || v.company_id === companyId);
    const trl = x.trailer_number ? trlPool.find((v) => squash(v.unit_number) === squash(x.trailer_number!)) : undefined;
    const stops = (x.stops || []).map((st) => newStop(st.type || "pickup", st));
    while (stops.length < 2) stops.push(newStop(stops.length === 0 ? "pickup" : "delivery"));
    const statedMiles = x.loaded_miles && x.loaded_miles > 0;
    setD((p) => ({
      ...p,
      company_id: companyId,
      driver_id: drv?.id || (trk?.assigned_driver_id ?? p.driver_id),
      truck_id: trk?.id || p.truck_id,
      trailer_id: trl?.id || trk?.trailer_id || p.trailer_id,
      load_number: x.load_number || p.load_number,
      rate_con_number: x.rate_con_number || p.rate_con_number,
      broker_name: x.broker_name || p.broker_name,
      broker_mc: x.broker_mc || p.broker_mc,
      broker_contact: x.broker_contact || p.broker_contact,
      broker_email: x.broker_email || p.broker_email,
      broker_phone: x.broker_phone || p.broker_phone,
      gross_amount: x.gross_amount ? String(x.gross_amount) : p.gross_amount,
      loaded_miles: statedMiles ? String(Math.round(x.loaded_miles!)) : r.routeMiles ? String(r.routeMiles) : p.loaded_miles,
      weight_lbs: x.weight_lbs ? String(x.weight_lbs) : p.weight_lbs,
      commodity: x.commodity || p.commodity,
      equipment_type: x.equipment_type || p.equipment_type,
      broker_notes: x.broker_notes || p.broker_notes,
      stops: x.stops?.length ? stops : p.stops,
    }));
    setMilesAuto(!statedMiles);
  };

  // The truck's previous delivery is a good guess for where it will be empty.
  const lastDrop = useMemo(() => {
    if (!d.truck_id) return null;
    const prev = loads
      .filter((l) => l.truck_id === d.truck_id && l.id !== load?.id && l.delivery_date)
      .sort((a, b) => (b.delivery_date || "").localeCompare(a.delivery_date || ""))[0];
    return prev ? `${prev.destination_city}, ${prev.destination_state}` : null;
  }, [d.truck_id, loads, load?.id]);

  // Where the truck is empty: its location on file, else its last drop. Typing wins.
  const truckLoc = truckById(d.truck_id)?.current_location || "";
  useEffect(() => {
    if (dhTouched.current) return;
    const guess = truckLoc || lastDrop || "";
    if (guess !== d.deadhead_from) set({ deadhead_from: guess });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [truckLoc, lastDrop]);

  const save = async () => {
    if (!d.company_id) return toast.error("Pick the carrier company.");
    const filled = d.stops.filter((x) => x.city.trim() || x.zip.trim());
    if (filled.length < 2) return toast.error("Add at least a pickup and a delivery city.");
    // Empty extra rows are dropped so they can't become the origin or destination.
    const first = filled.find((x) => x.type === "pickup") || filled[0];
    const last = [...filled].reverse().find((x) => x.type === "delivery") || filled[filled.length - 1];
    const row = {
      company_id: d.company_id,
      driver_id: d.driver_id || null,
      truck_id: d.truck_id || null,
      trailer_id: d.trailer_id || null,
      status: d.status,
      load_number: d.load_number || null,
      rate_con_number: d.rate_con_number || null,
      broker_name: d.broker_name,
      broker_mc: d.broker_mc || null,
      broker_contact: d.broker_contact || null,
      broker_email: d.broker_email || null,
      broker_phone: d.broker_phone || null,
      origin_city: first.city,
      origin_state: first.state,
      destination_city: last.city,
      destination_state: last.state,
      // Pickup day = first pickup's date, delivery day = last delivery's (falls back to the ends).
      pickup_date: first.date || filled[0].date || null,
      delivery_date: last.date || filled[filled.length - 1].date || null,
      gross_amount: gross,
      commission_percent: pct,
      loaded_miles: loaded,
      deadhead_miles: dh,
      deadhead_from: d.deadhead_from.trim() || null,
      weight_lbs: Number(d.weight_lbs) || null,
      commodity: d.commodity || null,
      equipment_type: d.equipment_type || null,
      broker_notes: d.broker_notes || null,
      internal_notes: d.internal_notes || null,
      stops: filled,
    };
    setSaving(true);
    if (editing && load) {
      const ok = await updateLoad(load.id, row);
      setSaving(false);
      if (ok) {
        toast.success("Load saved");
        onDone?.({ ...load, ...row, dispatcher_cut: fee });
      }
      return;
    }
    const created = await createLoad(row);
    if (!created) return setSaving(false);
    if (rcFile) await uploadDocument(rcFile, { company_id: created.company_id, load_id: created.id, doc_type: "rate_confirmation" });
    toast.success("Load booked");
    router.push(`/loads/${created.id}`);
  };

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="min-w-0 space-y-5">
        {!editing && <RateConDrop file={rcFile} onFile={setRcFile} onRead={applyRead} />}

        <Card>
          <CardHeader title="Carrier & assignment" />
          <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 sm:p-5 xl:grid-cols-5">
            <Field label="Carrier company" required className="sm:col-span-2 xl:col-span-1">
              <Select value={d.company_id} onChange={(e) => set({ company_id: e.target.value, driver_id: "", truck_id: "", trailer_id: "" })}>
                <option value="">Select…</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Truck">
              <Select
                value={d.truck_id}
                disabled={!d.company_id}
                onChange={(e) => {
                  const t = truckById(e.target.value);
                  set({ truck_id: e.target.value, driver_id: t?.assigned_driver_id || d.driver_id, trailer_id: t?.trailer_id || "" });
                }}
              >
                <option value="">Unassigned</option>
                {companyTrucks.map((t) => (
                  <option key={t.id} value={t.id}>
                    Unit {t.unit_number}
                    {t.trailer_type ? ` · ${t.trailer_type}` : " · power only"}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Trailer" hint={d.truck_id && d.trailer_id && truckById(d.truck_id)?.trailer_id !== d.trailer_id ? "Not the truck's hooked trailer" : undefined}>
              <Select value={d.trailer_id} disabled={!d.company_id} onChange={(e) => set({ trailer_id: e.target.value })}>
                <option value="">None / power only</option>
                {companyTrailers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.unit_number} · {[t.trailer_length, t.trailer_type].filter(Boolean).join(" ")}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Driver">
              <Select value={d.driver_id} disabled={!d.company_id} onChange={(e) => set({ driver_id: e.target.value })}>
                <option value="">Unassigned</option>
                {companyDrivers.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Status">
              <Select value={d.status} onChange={(e) => set({ status: e.target.value as LoadStatus })}>
                {STATUS_ORDER.map((st) => (
                  <option key={st} value={st}>
                    {STATUS[st].label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </Card>

        <Card>
          <CardHeader title="Stops" subtitle="First stop is the origin, last stop is the destination" />
          <div className="p-4 sm:p-5">
            <StopsEditor stops={d.stops} onChange={(stops) => set({ stops })} legs={route.data?.legs} />
          </div>
        </Card>

        <Card>
          <CardHeader title="Broker" />
          <div className="grid grid-cols-2 gap-3 p-4 sm:p-5 xl:grid-cols-4">
            <Field label="Broker" className="col-span-2">
              <Input value={d.broker_name} onChange={(e) => set({ broker_name: e.target.value })} placeholder="e.g. TQL" />
            </Field>
            <Field label="Broker MC">
              <Input value={d.broker_mc} onChange={(e) => set({ broker_mc: e.target.value })} inputMode="numeric" />
            </Field>
            <Field label="Contact">
              <Input value={d.broker_contact} onChange={(e) => set({ broker_contact: e.target.value })} />
            </Field>
            <Field label="Phone">
              <Input value={d.broker_phone} onChange={(e) => set({ broker_phone: e.target.value })} type="tel" />
            </Field>
            <Field label="Email">
              <Input value={d.broker_email} onChange={(e) => set({ broker_email: e.target.value })} type="email" />
            </Field>
            <Field label="Load #">
              <Input value={d.load_number} onChange={(e) => set({ load_number: e.target.value })} />
            </Field>
            <Field label="Rate con / PO #">
              <Input value={d.rate_con_number} onChange={(e) => set({ rate_con_number: e.target.value })} />
            </Field>
          </div>
        </Card>

        <Card>
          <CardHeader title="Freight & notes" />
          <div className="grid grid-cols-2 gap-3 p-4 sm:p-5 xl:grid-cols-4">
            <Field label="Commodity" className="col-span-2">
              <Input value={d.commodity} onChange={(e) => set({ commodity: e.target.value })} />
            </Field>
            <Field label="Weight">
              <Input value={d.weight_lbs} onChange={(e) => set({ weight_lbs: clean(e.target.value) })} inputMode="numeric" suffix="lbs" />
            </Field>
            <Field label="Equipment">
              <TrailerTypeSelect value={d.equipment_type} onChange={(v) => set({ equipment_type: v })} />
            </Field>
            <Field label="Broker requirements" className="col-span-2">
              <Textarea value={d.broker_notes} onChange={(e) => set({ broker_notes: e.target.value })} rows={3} placeholder="Tracking, tarps, temp, lumper, detention…" />
            </Field>
            <Field label="Internal notes" hint="Only the team sees these" className="col-span-2">
              <Textarea value={d.internal_notes} onChange={(e) => set({ internal_notes: e.target.value })} rows={3} />
            </Field>
          </div>
        </Card>
      </div>

      {/* Money & miles */}
      <div className="space-y-4 lg:sticky lg:top-[72px] lg:self-start">
        <Card>
          <CardHeader title="Rate & miles" />
          <div className="space-y-3 p-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Gross rate" className="col-span-2">
                <Input value={d.gross_amount} onChange={(e) => set({ gross_amount: clean(e.target.value) })} inputMode="decimal" prefix="$" className="text-base font-semibold" />
              </Field>
              <Field label="Dispatch fee">
                <Input
                  value={d.commission_percent}
                  onChange={(e) => {
                    pctTouched.current = true;
                    set({ commission_percent: clean(e.target.value) });
                  }}
                  inputMode="decimal"
                  suffix="%"
                />
              </Field>
              <div className="flex flex-col justify-end">
                <div className="rounded-lg bg-surface-2 px-3 py-2">
                  <div className="text-[11px] text-fg-3">TOSS fee</div>
                  <div className="tnum text-sm font-bold text-fg">{money(fee)}</div>
                </div>
              </div>
              <Field
                label={
                  <span className="flex w-full items-center justify-between">
                    Loaded miles
                    {route.loading && <Loader2 className="h-3 w-3 animate-spin text-fg-4" />}
                  </span>
                }
                hint={
                  route.data?.miles ? (
                    <span className="flex items-center gap-1">
                      Route {num(route.data.miles)} mi
                      {!milesAuto && Number(d.loaded_miles) !== route.data.miles && (
                        <button
                          type="button"
                          className="inline-flex items-center gap-0.5 font-semibold text-fg underline-offset-2 hover:underline"
                          onClick={() => {
                            setMilesAuto(true);
                            set({ loaded_miles: String(route.data!.miles) });
                          }}
                        >
                          <RotateCcw className="h-3 w-3" /> use
                        </button>
                      )}
                    </span>
                  ) : (
                    route.error || "From the stops"
                  )
                }
              >
                <Input
                  value={d.loaded_miles}
                  onChange={(e) => {
                    setMilesAuto(false);
                    set({ loaded_miles: clean(e.target.value) });
                  }}
                  inputMode="numeric"
                  suffix="mi"
                />
              </Field>
              <Field
                label={
                  <span className="flex w-full items-center justify-between">
                    Deadhead
                    {route.loading && d.deadhead_from.trim() && <Loader2 className="h-3 w-3 animate-spin text-fg-4" />}
                  </span>
                }
                hint={
                  routedDh !== null ? (
                    <span className="flex items-center gap-1">
                      Route {num(routedDh)} mi
                      {!dhAuto && Number(d.deadhead_miles) !== routedDh && (
                        <button
                          type="button"
                          className="inline-flex items-center gap-0.5 font-semibold text-fg underline-offset-2 hover:underline"
                          onClick={() => {
                            setDhAuto(true);
                            set({ deadhead_miles: String(routedDh) });
                          }}
                        >
                          <RotateCcw className="h-3 w-3" /> use
                        </button>
                      )}
                    </span>
                  ) : (
                    "Empty miles to pickup"
                  )
                }
              >
                <Input
                  value={d.deadhead_miles}
                  onChange={(e) => {
                    setDhAuto(false);
                    set({ deadhead_miles: clean(e.target.value) });
                  }}
                  inputMode="numeric"
                  suffix="mi"
                />
              </Field>
            </div>
            <Field label="Truck empty at" hint={lastDrop && d.deadhead_from !== lastDrop ? `Last drop: ${lastDrop}` : "City, ST or ZIP — deadhead is routed from here"}>
              <div className="flex gap-2">
                <Input
                  value={d.deadhead_from}
                  onChange={(e) => {
                    dhTouched.current = true;
                    setDhAuto(true);
                    set({ deadhead_from: e.target.value });
                  }}
                  placeholder={lastDrop || "e.g. Chicago, IL"}
                  className="flex-1"
                />
                {lastDrop && d.deadhead_from !== lastDrop && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-9"
                    onClick={() => {
                      dhTouched.current = true;
                      setDhAuto(true);
                      set({ deadhead_from: lastDrop });
                    }}
                  >
                    Last drop
                  </Button>
                )}
              </div>
            </Field>
            <div className="grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-line bg-line text-center">
              {[
                ["Total mi", num(loaded + dh)],
                ["RPM", rpmLoaded ? `$${rpmLoaded.toFixed(2)}` : "—"],
                ["All-in", rpmAll ? `$${rpmAll.toFixed(2)}` : "—"],
              ].map(([k, v]) => (
                <div key={k} className="bg-surface px-2 py-2">
                  <div className="tnum text-sm font-semibold text-fg">{v}</div>
                  <div className="text-[10px] uppercase tracking-wider text-fg-4">{k}</div>
                </div>
              ))}
            </div>
          </div>
        </Card>

        <RouteMap route={route.data} types={types} loading={route.loading} loadedMiles={loaded} deadheadMiles={dh} from={d.deadhead_from} className="h-56 lg:h-64" />

        <div className="hidden gap-2 lg:flex">
          <Button variant="ghost" className="flex-1" onClick={() => (editing && load ? onDone?.(load) : router.back())}>
            Cancel
          </Button>
          <Button variant="primary" className="flex-[2]" onClick={save} loading={saving}>
            {editing ? "Save changes" : "Book load"}
          </Button>
        </div>
      </div>

      {/* Phone save bar */}
      <div className={cn("pb-safe fixed inset-x-0 bottom-[60px] z-30 border-t border-line bg-surface/95 px-4 py-2.5 backdrop-blur md:bottom-0 lg:hidden")}>
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="tnum truncate text-sm font-bold text-fg">{money(gross, { cents: false })}</div>
            <div className="tnum truncate text-[11px] text-fg-3">
              Fee {money(fee)} · {num(loaded)} mi{rpmLoaded ? ` · $${rpmLoaded.toFixed(2)}/mi` : ""}
            </div>
          </div>
          <Button variant="primary" onClick={save} loading={saving}>
            {editing ? "Save" : "Book load"}
          </Button>
        </div>
      </div>
    </div>
  );
}
