"use client";

import Link from "next/link";
import { use, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
  ClipboardCopy,
  Copy,
  FileStack,
  Mail,
  MoreHorizontal,
  Pencil,
  Phone,
  Printer,
  Trash2,
} from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Select } from "@/components/ui/Field";
import { Card, CardHeader, CopyButton, Empty, Eyebrow, KV, Page } from "@/components/ui/Bits";
import { MemberAvatar } from "@/components/team/MemberAvatar";
import { contactLine } from "@/lib/profile";
import { Popover, MenuItem, MenuSep } from "@/components/ui/Menu";
import { confirmDialog } from "@/components/ui/Confirm";
import { StatusMenu } from "@/components/loads/StatusMenu";
import { RouteMap } from "@/components/loads/RouteMap";
import { Activity } from "@/components/loads/Activity";
import { DocumentsPanel } from "@/components/docs/DocumentsPanel";
import { useStore } from "@/lib/store";
import { useRoute } from "@/lib/route";
import { toast } from "@/lib/toast";
import { buildPacket } from "@/lib/packet";
import { checklist, problems, type DocTarget } from "@/lib/docs";
import { STATUS, cn, fmtDateTime, fmtDay, isCanceled, lane, money, num, rpm, rpmAllIn, totalMiles } from "@/lib/format";
import type { Load, LoadStatus, LoadStop, StopStatus } from "@/lib/types";

const FLOW: LoadStatus[] = ["booked", "in_transit", "delivered", "invoiced", "paid"];
const STOP_FLOW: { s: StopStatus; label: string }[] = [
  { s: "pending", label: "Pending" },
  { s: "en_route", label: "En route" },
  { s: "arrived", label: "Arrived" },
  { s: "completed", label: "Done" },
];

export default function LoadPage({ params }: PageProps<"/loads/[id]">) {
  const { id } = use(params);
  const { loads } = useStore();
  const load = loads.find((l) => l.id === id);
  if (!load) {
    return (
      <Page>
        <Card>
          <Empty title="Load not found" body="It may have been deleted." action={<ButtonLink href="/loads">Back to loads</ButtonLink>} />
        </Card>
      </Page>
    );
  }
  return <LoadView load={load} />;
}

function driverSheet(l: Load, company?: string, driver?: string, truck?: string, dispatcher?: string) {
  const stops = l.stops
    .map(
      (s, i) =>
        `${i + 1}. ${s.type === "pickup" ? "PICKUP" : "DELIVERY"} ${s.date ? fmtDay(s.date, false) : ""} ${s.time || ""} ${s.appointment || ""}\n   ${s.facility_name || ""}\n   ${[s.address, [s.city, s.state].filter(Boolean).join(", "), s.zip].filter(Boolean).join(" ")}${s.reference_numbers ? `\n   Ref: ${s.reference_numbers}` : ""}${s.phone ? `\n   Phone: ${s.phone}` : ""}${s.instructions ? `\n   Notes: ${s.instructions}` : ""}`,
    )
    .join("\n\n");
  return [
    `LOAD ${l.load_number ? `#${l.load_number}` : ""} · ${company || ""}`,
    `Truck ${truck || "—"} · Driver ${driver || "—"}`,
    `${l.commodity || ""}${l.weight_lbs ? ` · ${num(l.weight_lbs)} lbs` : ""} · ${num(l.loaded_miles)} loaded mi`,
    "",
    stops,
    l.broker_notes ? `\nRequirements: ${l.broker_notes}` : "",
    dispatcher ? `\nDispatcher: ${dispatcher}` : "",
  ]
    .join("\n")
    .trim();
}

function LoadView({ load }: { load: Load }) {
  const router = useRouter();
  const {
    companyById,
    driverById,
    truckById,
    trailerById,
    trailers,
    drivers,
    trucks,
    documents,
    docTypes,
    invoices,
    updateLoad,
    setLoadStatus,
    deleteLoads,
    duplicateLoad,
    memberName,
    memberById,
    members,
    me,
  } = useStore();
  const company = companyById(load.company_id);
  const driver = driverById(load.driver_id);
  const truck = truckById(load.truck_id);
  const route = useRoute(load.stops.length ? load.stops : [], { from: load.deadhead_from });
  const types = useMemo(() => load.stops.map((s) => s.type), [load.stops]);
  const docs = documents.filter((d) => d.load_id === load.id);
  const invoice = invoices.find((i) => i.lines.some((li) => li.load_id === load.id));
  const [packing, setPacking] = useState(false);

  const setStop = (sid: string, p: Partial<LoadStop>) => updateLoad(load.id, { stops: load.stops.map((s) => (s.id === sid ? { ...s, ...p } : s)) });

  const docTarget = useMemo<DocTarget>(() => ({ scope: "load", id: load.id, companyId: load.company_id, status: load.status }), [load.id, load.company_id, load.status]);
  // Billing packet: rate con, BOL, POD, receipts… in the order set in document rules.
  const packetDocs = useMemo(() => {
    const order = new Map(docTypes.filter((t) => t.in_packet).map((t) => [t.key, t.sort]));
    return docs.filter((d) => order.has(d.doc_type)).sort((a, b) => order.get(a.doc_type)! - order.get(b.doc_type)! || a.uploaded_at.localeCompare(b.uploaded_at));
  }, [docs, docTypes]);
  const missingDocs = useMemo(() => problems(checklist(docTypes, documents, docTarget)).map((i) => i.type.name), [docTypes, documents, docTarget]);

  const remove = async () => {
    if (
      await confirmDialog({
        title: "Delete this load?",
        body: `${lane(load)} and its ${docs.length} file(s) will be removed for good.`,
        confirmLabel: "Delete load",
        danger: true,
      })
    ) {
      if (await deleteLoads([load.id])) {
        toast.success("Load deleted");
        router.push("/loads");
      }
    }
  };

  const flowIdx = FLOW.indexOf(load.status);

  return (
    <Page>
      <div className="no-print mb-3 flex items-center justify-between gap-2">
        <Link href="/loads" className="inline-flex items-center gap-1.5 text-[13px] text-fg-3 hover:text-fg">
          <ArrowLeft className="h-3.5 w-3.5" /> Loads
        </Link>
      </div>

      {/* Title */}
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="mb-1 flex flex-wrap items-center gap-2 text-[13px] text-fg-3">
            <span className="font-semibold text-fg-2">{load.load_number ? `Load #${load.load_number}` : "Load"}</span>
            {load.load_number && <CopyButton text={load.load_number} />}
            {company && <span>· {company.name}</span>}
          </div>
          <h1 className="text-[22px] font-bold leading-tight text-fg sm:text-[26px]">{lane(load)}</h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[13px] text-fg-3">
            <StatusMenu status={load.status} onChange={(s) => setLoadStatus([load.id], s)} />
            <span>
              {fmtDay(load.pickup_date)} → {fmtDay(load.delivery_date)}
            </span>
            {load.stops.length > 2 && <span>· {load.stops.length} stops</span>}
          </div>
        </div>
        <div className="no-print flex items-center gap-2">
          <ButtonLink href={`/loads/${load.id}/edit`} variant="secondary" size="sm">
            <Pencil className="h-3.5 w-3.5" /> Edit
          </ButtonLink>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              navigator.clipboard.writeText(
                driverSheet(
                  load,
                  company?.name,
                  driver?.name,
                  [truck?.unit_number, trailerById(load.trailer_id) && `trailer ${trailerById(load.trailer_id)!.unit_number}`].filter(Boolean).join(" · ") || undefined,
                  contactLine(memberById(load.dispatcher_id)) || undefined,
                ),
              );
              toast.success("Driver dispatch copied");
            }}
          >
            <ClipboardCopy className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Copy for driver</span>
          </Button>
          <Popover
            align="end"
            width={200}
            trigger={({ toggle, ref }) => (
              <Button ref={ref} size="icon-sm" variant="outline" onClick={toggle} aria-label="More">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            )}
          >
            {(close) => (
              <>
                <MenuItem
                  icon={Copy}
                  onClick={async () => {
                    close();
                    const c = await duplicateLoad(load.id);
                    if (c) {
                      toast.success("Copy created");
                      router.push(`/loads/${c.id}/edit`);
                    }
                  }}
                >
                  Duplicate
                </MenuItem>
                <MenuItem icon={Printer} onClick={() => (close(), setTimeout(() => window.print(), 50))}>
                  Print
                </MenuItem>
                <MenuSep />
                <MenuItem icon={Trash2} danger onClick={() => (close(), remove())}>
                  Delete load
                </MenuItem>
              </>
            )}
          </Popover>
        </div>
      </div>

      {/* Progress */}
      {!isCanceled(load.status) && (
        <div className="no-print scrollbar-none mb-5 flex overflow-x-auto rounded-xl border border-line bg-surface p-1">
          {FLOW.map((s, i) => {
            const done = flowIdx >= i;
            const current = load.status === s;
            return (
              <button
                key={s}
                onClick={() => !current && setLoadStatus([load.id], s)}
                className={cn(
                  "flex min-w-[110px] flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-[13px] font-medium transition-colors",
                  current ? "bg-inverse text-inverse-fg" : done ? "text-fg hover:bg-surface-2" : "text-fg-4 hover:bg-surface-2 hover:text-fg",
                )}
              >
                {done && !current ? <Check className="h-3.5 w-3.5" /> : <span className={cn("h-1.5 w-1.5 rounded-full", current ? "bg-brand" : "bg-fg-4")} />}
                {STATUS[s].label}
              </button>
            );
          })}
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-5">
          {/* Stops */}
          <Card>
            <CardHeader title="Stops" subtitle={route.data?.miles ? `${num(route.data.miles)} mi by road · ${Math.round(route.data.minutes / 60)} h drive` : undefined} />
            <ol className="divide-y divide-line">
              {load.stops.map((s, i) => (
                <li key={s.id} className="flex gap-3 p-4 sm:px-5">
                  <div className="flex flex-col items-center">
                    <span
                      className={cn(
                        "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                        s.type === "pickup" ? "bg-inverse text-inverse-fg" : "bg-brand text-brand-fg",
                      )}
                    >
                      {i + 1}
                    </span>
                    {i < load.stops.length - 1 && route.data?.legs[i] && (
                      <span className="tnum mt-2 text-[10px] text-fg-4">{num(route.data.legs[i].miles)} mi</span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-[11px] font-semibold uppercase tracking-wider text-fg-4">{s.type === "pickup" ? "Pickup" : "Delivery"}</div>
                        <div className="truncate text-sm font-semibold text-fg">{s.facility_name || [s.city, s.state].filter(Boolean).join(", ")}</div>
                        <div className="text-[13px] text-fg-2">
                          {[s.address, [s.city, s.state].filter(Boolean).join(", "), s.zip].filter(Boolean).join(" · ")}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="tnum text-[13px] font-semibold text-fg">
                          {fmtDay(s.date)} {s.time}
                        </div>
                        {s.appointment && <div className="text-xs text-fg-3">{s.appointment}</div>}
                      </div>
                    </div>
                    {(s.reference_numbers || s.phone || s.contact_name || s.commodity || s.weight) && (
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-fg-3">
                        {s.reference_numbers && (
                          <span className="inline-flex items-center gap-1">
                            Ref {s.reference_numbers} <CopyButton text={s.reference_numbers} />
                          </span>
                        )}
                        {(s.contact_name || s.phone) && (
                          <span>
                            {s.contact_name} {s.phone && <a href={`tel:${s.phone}`} className="hover:text-fg">{s.phone}</a>}
                          </span>
                        )}
                        {s.commodity && <span>{s.commodity}</span>}
                        {s.weight && <span>{s.weight}</span>}
                      </div>
                    )}
                    {s.instructions && <p className="mt-2 whitespace-pre-wrap rounded-lg bg-surface-2/70 px-3 py-2 text-xs text-fg-2">{s.instructions}</p>}
                    <div className="no-print mt-3 inline-flex rounded-lg border border-line p-0.5">
                      {STOP_FLOW.map((f) => (
                        <button
                          key={f.s}
                          onClick={() => setStop(s.id, { status: f.s })}
                          className={cn(
                            "rounded-md px-2.5 py-1 text-xs font-medium",
                            (s.status || "pending") === f.s ? (f.s === "completed" ? "bg-emerald-600 text-white" : "bg-surface-3 text-fg") : "text-fg-3 hover:text-fg",
                          )}
                        >
                          {f.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </li>
              ))}
              {load.stops.length === 0 && <li className="p-5 text-[13px] text-fg-4">No stops. Edit the load to add them.</li>}
            </ol>
          </Card>

          {/* Broker & freight */}
          <Card>
            <CardHeader title="Broker & freight" />
            <div className="grid grid-cols-2 gap-4 p-4 sm:grid-cols-3 sm:p-5">
              <KV label="Broker">{load.broker_name}</KV>
              <KV label="Broker MC">{load.broker_mc}</KV>
              <KV label="Contact">{load.broker_contact}</KV>
              <KV label="Phone">
                {load.broker_phone && (
                  <span className="inline-flex items-center gap-1">
                    <Phone className="h-3 w-3 text-fg-4" />
                    <a href={`tel:${load.broker_phone}`} className="hover:underline">
                      {load.broker_phone}
                    </a>
                  </span>
                )}
              </KV>
              <KV label="Email" className="col-span-2">
                {load.broker_email && (
                  <span className="inline-flex min-w-0 items-center gap-1">
                    <Mail className="h-3 w-3 shrink-0 text-fg-4" />
                    <a href={`mailto:${load.broker_email}`} className="truncate hover:underline">
                      {load.broker_email}
                    </a>
                    <CopyButton text={load.broker_email} />
                  </span>
                )}
              </KV>
              <KV label="Rate con #">{load.rate_con_number}</KV>
              <KV label="Commodity">{load.commodity}</KV>
              <KV label="Weight">{load.weight_lbs ? `${num(load.weight_lbs)} lbs` : null}</KV>
              <KV label="Equipment">{load.equipment_type}</KV>
            </div>
            {(load.broker_notes || load.internal_notes) && (
              <div className="grid grid-cols-1 gap-3 border-t border-line p-4 sm:grid-cols-2 sm:p-5">
                {load.broker_notes && (
                  <div>
                    <Eyebrow className="mb-1">Broker requirements</Eyebrow>
                    <p className="whitespace-pre-wrap text-[13px] text-fg-2">{load.broker_notes}</p>
                  </div>
                )}
                {load.internal_notes && (
                  <div>
                    <Eyebrow className="mb-1">Internal notes</Eyebrow>
                    <p className="whitespace-pre-wrap text-[13px] text-fg-2">{load.internal_notes}</p>
                  </div>
                )}
              </div>
            )}
          </Card>

          <Card className="no-print">
            <CardHeader title="Activity" />
            <div className="p-4 sm:p-5">
              <Activity loadId={load.id} />
            </div>
          </Card>
        </div>

        {/* Side */}
        <div className="space-y-5">
          <Card>
            <div className="p-4 sm:p-5">
              <Eyebrow>Gross rate</Eyebrow>
              <div className="tnum mt-1 text-3xl font-bold tracking-tight text-fg">{money(load.gross_amount)}</div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <KV label={`TOSS fee · ${load.commission_percent}%`}>{money(load.dispatcher_cut)}</KV>
                <KV label="Carrier keeps">{money(load.gross_amount - load.dispatcher_cut)}</KV>
                <KV label="Loaded / DH">
                  {num(load.loaded_miles)} / {num(load.deadhead_miles)} mi
                </KV>
                <KV label="Total miles">{num(totalMiles(load))} mi</KV>
                <KV label="RPM loaded">{rpm(load) ? `$${rpm(load).toFixed(2)}` : null}</KV>
                <KV label="RPM all-in">{rpmAllIn(load) ? `$${rpmAllIn(load).toFixed(2)}` : null}</KV>
              </div>
              {invoice && (
                <Link href={`/invoices/${invoice.id}`} className="mt-4 flex items-center justify-between rounded-lg bg-surface-2 px-3 py-2 text-[13px] hover:bg-surface-3">
                  <span className="text-fg-2">On invoice {invoice.invoice_number}</span>
                  <span className="font-semibold capitalize text-fg">{invoice.status}</span>
                </Link>
              )}
            </div>
          </Card>

          <Card className="no-print">
            <CardHeader title="Assignment" />
            <div className="space-y-3 p-4">
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-fg-2">Truck</span>
                <Select
                  value={load.truck_id || ""}
                  onChange={(e) => {
                    const t = truckById(e.target.value);
                    updateLoad(load.id, {
                      truck_id: e.target.value || null,
                      // The truck's hooked trailer goes with it (change it below if it was swapped).
                      trailer_id: t?.trailer_id ?? null,
                      ...(t?.assigned_driver_id && !load.driver_id ? { driver_id: t.assigned_driver_id } : {}),
                    });
                  }}
                >
                  <option value="">Unassigned</option>
                  {trucks
                    .filter((t) => t.company_id === load.company_id)
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        Unit {t.unit_number}
                      </option>
                    ))}
                </Select>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-fg-2">Trailer</span>
                <Select value={load.trailer_id || ""} onChange={(e) => updateLoad(load.id, { trailer_id: e.target.value || null })}>
                  <option value="">None / power only</option>
                  {trailers
                    .filter((t) => t.company_id === load.company_id && (t.status !== "inactive" || t.id === load.trailer_id))
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.unit_number} · {[t.trailer_length, t.trailer_type].filter(Boolean).join(" ")}
                      </option>
                    ))}
                </Select>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-fg-2">Driver</span>
                <Select value={load.driver_id || ""} onChange={(e) => updateLoad(load.id, { driver_id: e.target.value || null })}>
                  <option value="">Unassigned</option>
                  {drivers
                    .filter((d) => d.company_id === load.company_id)
                    .map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                </Select>
              </label>
              {driver?.phone && (
                <a href={`tel:${driver.phone}`} className="flex items-center gap-2 text-[13px] text-fg-2 hover:text-fg">
                  <Phone className="h-3.5 w-3.5 text-fg-4" /> Call {driver.name.split(" ")[0]} · {driver.phone}
                </a>
              )}
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-fg-2">Dispatcher</span>
                <Select value={load.dispatcher_id || ""} onChange={(e) => updateLoad(load.id, { dispatcher_id: e.target.value || null })}>
                  <option value="">No dispatcher</option>
                  {members.map((m) => (
                    <option key={m.user_id} value={m.user_id}>
                      {m.full_name || m.email}
                      {m.user_id === me.id ? " (you)" : ""}
                    </option>
                  ))}
                </Select>
              </label>
              <div className="flex items-center gap-2 border-t border-line pt-3 text-xs text-fg-3">
                <MemberAvatar id={load.created_by} className="h-6 w-6 text-[10px]" />
                <span>
                  Added by <b className="font-semibold text-fg-2">{load.created_by === me.id ? "you" : memberName(load.created_by)}</b> · {fmtDateTime(load.created_at)}
                </span>
              </div>
            </div>
          </Card>

          <RouteMap route={route.data} types={types} loading={route.loading} loadedMiles={load.loaded_miles} deadheadMiles={load.deadhead_miles} from={load.deadhead_from} className="no-print h-60" />

          <Card className="no-print">
            <CardHeader
              title="Paperwork"
              actions={
                <Button
                  size="xs"
                  variant="outline"
                  loading={packing}
                  disabled={!packetDocs.length}
                  title={missingDocs.length ? `Missing: ${missingDocs.join(", ")}` : "Rate con, BOL, POD and receipts in one PDF"}
                  onClick={async () => {
                    setPacking(true);
                    try {
                      const r = await buildPacket(packetDocs, `${load.load_number || "load"}-packet.pdf`);
                      toast.success(r.skipped.length ? `Packet ready. Skipped: ${r.skipped.join(", ")}` : `Packet ready (${r.added} files)`);
                      if (missingDocs.length) toast.info(`Packet made without: ${missingDocs.join(", ")}`);
                    } catch (e) {
                      toast.error((e as Error).message);
                    } finally {
                      setPacking(false);
                    }
                  }}
                >
                  {!packing && <FileStack className="h-3.5 w-3.5" />} Packet
                </Button>
              }
            />
            <div className="space-y-3 p-4">
              <DocumentsPanel target={docTarget} compact emptyText="No files on this load yet." />
            </div>
          </Card>
        </div>
      </div>
    </Page>
  );
}
