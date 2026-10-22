"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  Building2,
  Copy,
  MapPin,
  MoreHorizontal,
  Pencil,
  Phone,
  Plus,
  Search,
  Trash2,
  Truck as TruckIcon,
  Users,
  FileText,
  Container,
  Network,
  KeyRound,
  Settings2,
  PanelRightOpen,
  ShieldCheck,
  Stamp,
  Layers,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input, Segmented } from "@/components/ui/Field";
import { hasService } from "@/lib/services";
import { Card, CopyButton, Empty, Page, PageHeader, Pill, Tabs, neutralPill } from "@/components/ui/Bits";
import { Popover, MenuItem, MenuSep } from "@/components/ui/Menu";
import { confirmDialog } from "@/components/ui/Confirm";
import { CompanyFields, NewCompanyModal, draftProblem, fromDraft, toDraft, type CompanyDraft } from "@/components/fleet/CompanyForm";
import { TruckForm } from "@/components/fleet/TruckForm";
import { TruckSheet } from "@/components/fleet/TruckSheet";
import { DriverCard, DriverForm, DriverSheet, driverAlert } from "@/components/fleet/Drivers";
import { DriversTable } from "@/components/fleet/DriversTable";
import { DotComplianceTab, McptTab } from "@/components/fleet/Compliance";
import { Vault } from "@/components/fleet/Vault";
import { CompanyLinks, CompanySummary, ServicesOverview } from "@/components/fleet/CompanyProfile";
import { TrailersTab } from "@/components/fleet/Trailers";
import { UnitsTab } from "@/components/fleet/Units";
import { DocumentsPanel } from "@/components/docs/DocumentsPanel";
import { FleetPaperwork } from "@/components/docs/FleetPaperwork";
import { useStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import { ACTIVE_STATUSES, daysUntil, lane, money, num, today } from "@/lib/format";
import { availability, equipmentLine, pitchFor } from "@/lib/pitch";
import type { Company, Driver, Truck } from "@/lib/types";

type Tab = "units" | "trucks" | "trailers" | "drivers" | "docs" | "vault" | "profile" | "services" | "dot" | "mcpt";

export default function FleetPage() {
  return (
    <Suspense>
      <Fleet />
    </Suspense>
  );
}

function Fleet() {
  const params = useSearchParams();
  const router = useRouter();
  const { companies, drivers, trucks, trailers, scopedCompany, setScope } = useStore();
  const [newOpen, setNewOpen] = useState(false);

  // Links from the dashboard and alerts name the carrier (or a driver / truck of it):
  // open that carrier even when "All companies" is selected.
  const wantCompany =
    params.get("company") ||
    drivers.find((d) => d.id === params.get("driver"))?.company_id ||
    trucks.find((t) => t.id === params.get("truck"))?.company_id ||
    trailers.find((t) => t.id === params.get("trailer"))?.company_id ||
    null;
  useEffect(() => {
    if (!wantCompany || !companies.some((c) => c.id === wantCompany)) return;
    if (scopedCompany?.id !== wantCompany) setScope(wantCompany);
    // Drop ?company= once applied, so switching carriers in the header isn't undone.
    if (params.get("company")) {
      const next = new URLSearchParams(params.toString());
      next.delete("company");
      router.replace(`/fleet${next.size ? `?${next}` : ""}`, { scroll: false });
    }
    // Only when the link changes, not when the header switcher changes the scope.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantCompany, companies.length]);

  useEffect(() => {
    if (params.get("new") === "company") {
      setNewOpen(true);
      router.replace("/fleet");
    }
  }, [params, router]);

  return (
    <Page>
      {companies.length === 0 ? (
        <>
          <PageHeader title="Fleet & Company" />
          <Card>
            <Empty
              icon={Building2}
              title="Add your first carrier"
              body="Each carrier company you dispatch for gets its own trucks, drivers, documents, credentials and dispatch fee."
              action={
                <Button variant="primary" onClick={() => setNewOpen(true)}>
                  <Plus className="h-4 w-4" /> Add carrier company
                </Button>
              }
            />
          </Card>
        </>
      ) : scopedCompany ? (
        <CompanyView company={scopedCompany} />
      ) : (
        <CompaniesOverview onAdd={() => setNewOpen(true)} />
      )}
      <NewCompanyModal open={newOpen} onClose={() => setNewOpen(false)} />
    </Page>
  );
}

// ----------------------------------------------------------------------------
// All companies
// ----------------------------------------------------------------------------
function CompaniesOverview({ onAdd }: { onAdd: () => void }) {
  const { companies, trucks, drivers, loads, documents, setScope } = useStore();
  const [q, setQ] = useState("");
  const list = companies.filter((c) => !q || `${c.name} ${c.mc_number} ${c.dot_number}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <>
      <PageHeader
        eyebrow="All companies"
        title="Fleet & Company"
        actions={
          <Button variant="primary" onClick={onAdd}>
            <Plus className="h-4 w-4" /> Add company
          </Button>
        }
      />
      {companies.length > 6 && (
        <div className="relative mb-4 max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-4" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a carrier" className="pl-9" />
        </div>
      )}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {list.map((c) => {
          const t = trucks.filter((x) => x.company_id === c.id);
          const d = drivers.filter((x) => x.company_id === c.id);
          const l = loads.filter((x) => x.company_id === c.id);
          const active = l.filter((x) => ACTIVE_STATUSES.includes(x.status)).length;
          const month = today().slice(0, 7);
          const gross = l.filter((x) => (x.delivery_date || x.pickup_date || "").startsWith(month)).reduce((s, x) => s + x.gross_amount, 0);
          const alerts = d.filter(driverAlert).length + documents.filter((x) => x.company_id === c.id && (daysUntil(x.expires_on) ?? 99) <= 30).length;
          return (
            <button
              key={c.id}
              onClick={() => setScope(c.id)}
              className="group flex flex-col rounded-xl border border-line bg-surface p-4 text-left transition-colors hover:border-line-strong sm:p-5"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-[15px] font-semibold text-fg">{c.name}</div>
                  <div className="mt-0.5 truncate text-xs text-fg-3">
                    {[c.mc_number && `MC ${c.mc_number}`, c.dot_number && `DOT ${c.dot_number}`].filter(Boolean).join(" · ") || "No MC / DOT"}
                  </div>
                </div>
                <Pill className={c.status === "active" ? "bg-brand/10 text-fg ring-brand/30" : neutralPill}>{c.commission_percent}%</Pill>
              </div>
              <div className="mt-4 grid grid-cols-4 gap-2 border-t border-line pt-3">
                {[
                  ["Trucks", t.length],
                  ["Drivers", d.length],
                  ["Active", active],
                  ["This month", money(gross, { cents: false })],
                ].map(([k, v]) => (
                  <div key={k as string} className="min-w-0">
                    <div className="tnum truncate text-sm font-semibold text-fg">{v}</div>
                    <div className="truncate text-[11px] text-fg-4">{k}</div>
                  </div>
                ))}
              </div>
              {alerts > 0 && (
                <div className="mt-3 flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-300">
                  <AlertTriangle className="h-3.5 w-3.5" /> {alerts} expiring item{alerts > 1 ? "s" : ""}
                </div>
              )}
              {c.status === "inactive" && <div className="mt-3 text-xs text-fg-4">Inactive</div>}
            </button>
          );
        })}
      </div>
    </>
  );
}

// ----------------------------------------------------------------------------
// One company
// ----------------------------------------------------------------------------
function CompanyView({ company }: { company: Company }) {
  const params = useSearchParams();
  const router = useRouter();
  const { trucks, trailers, drivers, documents, view } = useStore();
  const office = view === "office";
  const tab = (params.get("tab") as Tab) || (office ? "profile" : "units");
  const setTab = (t: Tab) => router.replace(`/fleet?tab=${t}`, { scroll: false });

  const t = trucks.filter((x) => x.company_id === company.id);
  const tl = trailers.filter((x) => x.company_id === company.id);
  const d = drivers.filter((x) => x.company_id === company.id);
  const docs = documents.filter((x) => x.company_id === company.id);

  const all: Record<Tab, { value: Tab; label: React.ReactNode; count?: number }> = {
    units: { value: "units", label: <><Network className="h-4 w-4" /> Units</>, count: t.filter((x) => x.status !== "inactive").length },
    trucks: { value: "trucks", label: <><TruckIcon className="h-4 w-4" /> Trucks</>, count: t.length },
    trailers: { value: "trailers", label: <><Container className="h-4 w-4" /> Trailers</>, count: tl.length },
    drivers: { value: "drivers", label: <><Users className="h-4 w-4" /> Drivers</>, count: d.length },
    docs: { value: "docs", label: <><FileText className="h-4 w-4" /> Documents</>, count: docs.length },
    vault: { value: "vault", label: <><KeyRound className="h-4 w-4" /> Credentials</> },
    profile: { value: "profile", label: <><Settings2 className="h-4 w-4" /> Profile</> },
    services: { value: "services", label: <><Layers className="h-4 w-4" /> Services</> },
    dot: { value: "dot", label: <><ShieldCheck className="h-4 w-4" /> DOT Compliance</> },
    mcpt: { value: "mcpt", label: <><Stamp className="h-4 w-4" /> MCPT</> },
  };
  const order: Tab[] = office
    ? ["profile", "services", "dot", "mcpt", "drivers", "trucks", "trailers", "docs", "vault", "units"]
    : ["units", "trucks", "trailers", "drivers", "docs", "vault", "services", "dot", "mcpt", "profile"];
  const tabs = order
    .filter((k) => (k === "dot" ? hasService(company, "dot_compliance") : k === "mcpt" ? hasService(company, "mcpt") : true))
    .map((k) => all[k]);

  return (
    <>
      <PageHeader
        eyebrow="Fleet & Company"
        title={company.name}
        actions={
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-fg-3">
            {company.mc_number && (
              <span className="inline-flex items-center gap-0.5 rounded-lg border border-line px-2 py-1">
                MC {company.mc_number}
                <CopyButton text={company.mc_number} />
              </span>
            )}
            {company.dot_number && (
              <span className="inline-flex items-center gap-0.5 rounded-lg border border-line px-2 py-1">
                DOT {company.dot_number}
                <CopyButton text={company.dot_number} />
              </span>
            )}
            {hasService(company, "dispatch") && (
              <span className="rounded-lg border border-line px-2 py-1.5">
                {company.commission_percent}% · {company.billing_cadence}
              </span>
            )}
          </div>
        }
      />
      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        className="mb-5"
        tabs={tabs}
      />
      {tab === "units" && <UnitsTab company={company} />}
      {tab === "trucks" && <TrucksTab company={company} trucks={t} />}
      {tab === "trailers" && <TrailersTab company={company} />}
      {tab === "drivers" && <DriversTab company={company} drivers={d} />}
      {tab === "docs" && <DocsTab company={company} />}
      {tab === "vault" && <Vault companyId={company.id} />}
      {tab === "dot" && <DotComplianceTab key={company.id} company={company} />}
      {tab === "mcpt" && <McptTab key={company.id} company={company} />}
      {tab === "services" && <ServicesOverview company={company} onMore={setTab} />}
      {tab === "profile" && <ProfileTab company={company} />}
    </>
  );
}

function TrucksTab({ company, trucks }: { company: Company; trucks: Truck[] }) {
  const params = useSearchParams();
  const router = useRouter();
  const { driverById, trailerById, memberById, me, loads, deleteTruck } = useStore();
  const [q, setQ] = useState("");
  const [f, setF] = useState<"all" | "ready" | "loaded" | "oos">("all");
  const [form, setForm] = useState<{ open: boolean; truck?: Truck | null }>({ open: false });
  const sheetId = params.get("truck");
  const sheet = trucks.find((x) => x.id === sheetId) || null;
  const openSheet = (id: string | null) => router.replace(id ? `/fleet?tab=trucks&truck=${id}` : "/fleet?tab=trucks", { scroll: false });

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

function DriversTab({ company, drivers }: { company: Company; drivers: Driver[] }) {
  const params = useSearchParams();
  const router = useRouter();
  const { view } = useStore();
  const office = view === "office";
  const [q, setQ] = useState("");
  const [shown, setShown] = useState<"active" | "terminated" | "all">("active");
  const [form, setForm] = useState<{ open: boolean; driver?: Driver | null }>({ open: false });
  const sheet = drivers.find((x) => x.id === params.get("driver")) || null;
  const openSheet = (id: string | null) => router.replace(id ? `/fleet?tab=drivers&driver=${id}` : "/fleet?tab=drivers", { scroll: false });
  const list = drivers
    .filter((d) => !office || shown === "all" || (shown === "terminated") === !!d.termination_date)
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
              { value: "active", label: `Active ${drivers.filter((d) => !d.termination_date).length}` },
              { value: "terminated", label: `Terminated ${drivers.filter((d) => d.termination_date).length}` },
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

function DocsTab({ company }: { company: Company }) {
  const target = useMemo(() => ({ scope: "company" as const, companyId: company.id }), [company.id]);
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="min-w-0">
        <DocumentsPanel target={target} includeAll emptyText="No documents for this carrier yet." />
      </div>
      <div className="min-w-0 xl:order-none">
        <FleetPaperwork companyId={company.id} />
      </div>
    </div>
  );
}

function ProfileTab({ company }: { company: Company }) {
  const { updateCompany, deleteCompany, isOwner, loads, setScope, view } = useStore();
  const [sub, setSub] = useState<"overview" | "details" | "links">(view === "office" ? "overview" : "details");
  const [d, setD] = useState<CompanyDraft>(toDraft(company));
  const [saving, setSaving] = useState(false);
  useEffect(() => setD(toDraft(company)), [company]);
  const dirty = useMemo(() => JSON.stringify(d) !== JSON.stringify(toDraft(company)), [d, company]);
  const loadCount = loads.filter((l) => l.company_id === company.id).length;

  return (
    <>
      <Segmented
        value={sub}
        onChange={setSub}
        className="mb-4"
        options={[
          { value: "overview", label: "Overview" },
          { value: "details", label: "Details" },
          { value: "links", label: "Links" },
        ]}
      />
      {sub === "overview" && (
        <div className="max-w-2xl">
          <CompanySummary company={company} />
        </div>
      )}
      {sub === "links" && (
        <div className="max-w-xl">
          <CompanyLinks company={company} />
        </div>
      )}
      {sub === "details" && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_320px]">
          <Card className="p-4 sm:p-6">
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const problem = draftProblem(d);
                if (problem) return toast.error(problem);
                setSaving(true);
                const ok = await updateCompany(company.id, fromDraft(d));
                setSaving(false);
                if (ok) toast.success("Company saved");
              }}
            >
              <CompanyFields key={company.id} d={d} set={(p) => setD((x) => ({ ...x, ...p }))} companyId={company.id} />
              <div className="mt-6 flex justify-end gap-2 border-t border-line pt-4">
                <Button variant="ghost" disabled={!dirty} onClick={() => setD(toDraft(company))}>
                  Discard
                </Button>
                <Button type="submit" variant="primary" disabled={!dirty} loading={saving}>
                  Save changes
                </Button>
              </div>
            </form>
          </Card>
          <div className="space-y-4">
            {company.services?.dispatch?.on && (
              <Card className="p-4 text-[13px] text-fg-2">
                <div className="font-semibold text-fg">How the dispatch fee works</div>
                <p className="mt-1.5 leading-relaxed text-fg-3">
                  Every new load for {company.name} takes {company.commission_percent}% of its gross as TOSS&apos;s fee. You can change the
                  percentage on any single load. Delivered loads are billed {company.billing_cadence} from Invoices.
                </p>
              </Card>
            )}
            {isOwner && (
              <Card className="border-red-500/25 p-4">
                <div className="text-[13px] font-semibold text-fg">Delete company</div>
                <p className="mt-1 text-[13px] text-fg-3">
                  Removes {company.name} with its trucks, drivers, {loadCount} load{loadCount === 1 ? "" : "s"}, documents and credentials. Invoices stay.
                </p>
                <Button
                  variant="danger"
                  size="sm"
                  className="mt-3"
                  onClick={async () => {
                    if (
                      await confirmDialog({
                        title: `Delete ${company.name}?`,
                        body: "This can't be undone.",
                        confirmLabel: "Delete company",
                        danger: true,
                        typeToConfirm: company.name,
                      })
                    ) {
                      if (await deleteCompany(company.id)) {
                        toast.success("Company deleted");
                        setScope("all");
                      }
                    }
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" /> Delete company
                </Button>
              </Card>
            )}
          </div>
        </div>
      )}
    </>
  );
}
