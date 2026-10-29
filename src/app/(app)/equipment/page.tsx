"use client";

import Link from "next/link";
import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, Container, Download, Network, Plus, Search, Truck as TruckIcon, Users, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, Empty, Page, PageHeader, Pill, Stat, Tabs, neutralPill } from "@/components/ui/Bits";
import { Checkbox, Field, Input, Segmented, Select } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { FleetPlaceProvider } from "@/components/fleet/fleetLinks";
import { UnitsTab } from "@/components/fleet/Units";
import { TruckForm } from "@/components/fleet/TruckForm";
import { TruckSheet } from "@/components/fleet/TruckSheet";
import { TrailerForm, TrailerSheet } from "@/components/fleet/Trailers";
import { DriverForm, DriverSheet } from "@/components/fleet/Drivers";
import { useStore } from "@/lib/store";
import { cn, daysUntil, fmtDay } from "@/lib/format";
import { availability } from "@/lib/pitch";
import { downloadCsv } from "@/lib/csv";
import { muteActive, pendingItems, useMutes } from "@/lib/pending";
import type { Company, Driver, Load, Trailer, Truck } from "@/lib/types";

// Equipment & Drivers: Units, Trucks, Trailers and Drivers of every company in one place, with the
// company on every row. Filter by company (the "By company" table or the picker), status, type,
// paperwork. Rows open the same sheets and forms as inside a company (Companies), so an edit here
// shows there and the other way round. With one company picked, Units also has the desk view.

type Tab = "units" | "trucks" | "trailers" | "drivers";
type Row = { id: string; company: Company | undefined; cells: React.ReactNode[]; csv: (string | number | null)[]; status: string; type: string; issues: number; search: string };

const TABS: Tab[] = ["units", "trucks", "trailers", "drivers"];

/** Expiry text with its color (expired red, ≤ 30 days amber). */
function Exp({ date }: { date: string | null | undefined }) {
  const n = daysUntil(date);
  if (n === null) return <span className="text-fg-4">—</span>;
  return <span className={n < 0 ? "text-red-600 dark:text-red-400" : n <= 30 ? "text-amber-600 dark:text-amber-400" : "text-fg-2"}>{fmtDay(date)}</span>;
}

export default function EquipmentPage() {
  return (
    <Suspense>
      <FleetPlaceProvider value="sections">
        <Equipment />
      </FleetPlaceProvider>
    </Suspense>
  );
}

function Equipment() {
  const params = useSearchParams();
  const router = useRouter();
  const { companies, trucks, trailers, drivers, loads, documents, docTypes, inScope, scopedCompany, setScope } = useStore();
  const { mutes } = useMutes();
  const tab: Tab = TABS.find((t) => t === params.get("tab")) || "units";
  const co = (params.get("co") || "").split(",").filter(Boolean);
  const [status, setStatus] = useState("all");
  const [type, setType] = useState("all");
  const [issuesOnly, setIssuesOnly] = useState(false);
  const [q, setQ] = useState("");
  const [group, setGroup] = useState(false);
  const [unitsView, setUnitsView] = useState<"table" | "desk">("table");
  const [adding, setAdding] = useState<{ what: Exclude<Tab, "units">; companyId: string } | null>(null);
  const [editing, setEditing] = useState<{ truck?: Truck; trailer?: Trailer; driver?: Driver } | null>(null);

  // The URL keeps the tab, the companies picked and the open sheet.
  const go = (p: { tab?: Tab; co?: string[]; sheet?: [string, string] | null }) => {
    const next = new URLSearchParams();
    next.set("tab", p.tab ?? tab);
    const c = p.co ?? co;
    if (c.length) next.set("co", c.join(","));
    if (p.sheet) next.set(p.sheet[0], p.sheet[1]);
    router.replace(`/equipment?${next}`, { scroll: false });
  };
  const toggleCo = (id: string) => go({ co: co.includes(id) ? co.filter((x) => x !== id) : [...co, id] });

  const pool = companies.filter((c) => inScope(c.id)).sort((a, b) => a.name.localeCompare(b.name));
  const companyById = (id: string) => companies.find((c) => c.id === id);
  const picked = (companyId: string) => inScope(companyId) && (!co.length || co.includes(companyId));

  const T = trucks.filter((x) => inScope(x.company_id));
  const TL = trailers.filter((x) => inScope(x.company_id));
  const D = drivers.filter((x) => inScope(x.company_id));

  // What each truck is doing (same rule as the company's Trucks tab).
  const loadOf = (truckId: string): Load | undefined =>
    loads.find((l) => l.truck_id === truckId && l.status === "in_transit") || loads.find((l) => l.truck_id === truckId && ["booked", "new"].includes(l.status));
  const truckState = (t: Truck) => {
    if (t.status === "out_of_service") return { key: "oos", label: "Out of service", pill: "bg-red-500/10 text-red-700 ring-red-600/20 dark:text-red-300" };
    if (t.status === "inactive") return { key: "inactive", label: "Inactive", pill: neutralPill };
    const l = loadOf(t.id);
    if (l) return { key: "loaded", label: l.status === "in_transit" ? "In transit" : "Booked", pill: "bg-blue-500/10 text-blue-700 ring-blue-600/20 dark:text-blue-300" };
    return { key: "available", label: availability(t), pill: "bg-emerald-500/10 text-emerald-700 ring-emerald-600/20 dark:text-emerald-300" };
  };

  // Paperwork issues per truck / trailer / driver (Pending's rules, turned-off reminders left out).
  const issues = useMemo(() => {
    const muted = new Set(mutes.filter(muteActive).map((m) => m.key));
    const m = new Map<string, number>();
    for (const i of pendingItems({ companies, drivers, trucks, trailers, documents, docTypes, loads: [] }, inScope)) {
      if (muted.has(i.key) || i.kind === "carrier" || i.kind === "load") continue;
      const id = i.key.split(":")[1];
      m.set(id, (m.get(id) || 0) + 1);
    }
    return m;
  }, [companies, drivers, trucks, trailers, documents, docTypes, inScope, mutes]);

  /** Latest expiry on file for a truck / trailer document type. */
  const expiry = (field: "truck_id" | "trailer_id", id: string, docType: string) =>
    documents
      .filter((d) => d[field] === id && d.doc_type === docType)
      .sort((a, b) => b.uploaded_at.localeCompare(a.uploaded_at))[0]?.expires_on ?? null;

  const truckOfTrailer = (id: string) => trucks.find((t) => t.trailer_id === id);
  const truckOfDriver = (id: string) => trucks.find((t) => t.assigned_driver_id === id);
  const companyCell = (c: Company | undefined) =>
    c ? (
      <Link href={`/fleet?company=${c.id}&tab=${tab}`} onClick={(e) => (e.stopPropagation(), setScope(c.id))} className="text-fg-2 hover:text-fg hover:underline">
        {c.name}
      </Link>
    ) : (
      "—"
    );
  const open = (key: "truck" | "trailer" | "driver", id: string, onTab?: Tab) => go({ tab: onTab ?? tab, sheet: [key, id] });

  // Everything connected is clickable on every tab: it opens that truck / trailer / driver (or load,
  // or company) without leaving the row's tab.
  const linkBtn = (key: "truck" | "trailer" | "driver", id: string, label: React.ReactNode, sub?: string | null) => (
    <button
      key={key + id}
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        open(key, id);
      }}
      className="text-left text-fg hover:underline"
    >
      {label}
      {sub && <span className="block text-[11px] text-fg-4">{sub}</span>}
    </button>
  );
  const truckLink = (t: Truck | undefined) => (t ? linkBtn("truck", t.id, `#${t.unit_number}`) : <span className="text-fg-4">—</span>);
  const trailerLink = (x: Trailer | undefined) => (x ? linkBtn("trailer", x.id, `#${x.unit_number}`, [x.trailer_length, x.trailer_type].filter(Boolean).join(" ")) : <span className="text-fg-4">No trailer</span>);
  const driverLink = (d: Driver | undefined) => (d ? linkBtn("driver", d.id, d.name, d.phone) : <span className="text-amber-600 dark:text-amber-400">No driver</span>);
  const loadLink = (l: Load | undefined) =>
    l ? (
      <Link key="l" href={`/loads/${l.id}`} onClick={(e) => e.stopPropagation()} className="text-fg hover:underline">
        {l.load_number ? `#${l.load_number}` : "Load"} · {l.origin_state}→{l.destination_state}
      </Link>
    ) : (
      <span className="text-fg-4">—</span>
    );

  // ---- rows per tab ---------------------------------------------------------------------------
  // Every tab shows the whole chain: company · truck · trailer · driver · current load.
  const issueCell = (n: number) =>
    n ? (
      <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
        <AlertTriangle className="h-3.5 w-3.5" /> {n}
      </span>
    ) : (
      <span className="text-fg-4">—</span>
    );
  const rows: Row[] = useMemo(() => {
    if (tab === "units" || tab === "trucks") {
      return T.map((t) => {
        const c = companyById(t.company_id);
        const st = truckState(t);
        const trailer = trailers.find((x) => x.id === t.trailer_id);
        const drv = drivers.find((d) => d.id === t.assigned_driver_id);
        const l = loadOf(t.id);
        const n = issues.get(t.id) || 0;
        const model = [t.year, t.make, t.model].filter(Boolean).join(" ");
        const base = {
          id: t.id,
          company: c,
          status: st.key,
          type: t.trailer_type || "",
          issues: n,
          search: `${t.unit_number} ${t.vin_number || ""} ${t.plate || ""} ${drv?.name || ""} ${drv?.phone || ""} ${trailer?.unit_number || ""} ${c?.name || ""} ${t.current_location || ""} ${l?.load_number || ""}`,
        };
        if (tab === "units")
          return {
            ...base,
            cells: [
              linkBtn("truck", t.id, <b>#{t.unit_number}</b>, model || null),
              companyCell(c),
              trailerLink(trailer),
              driverLink(drv),
              <Pill key="s" className={st.pill}>{st.label}</Pill>,
              t.current_location || "—",
              loadLink(l),
              issueCell(n),
            ],
            csv: [t.unit_number, c?.name || "", model, trailer?.unit_number || "", drv?.name || "", drv?.phone || "", st.label, t.current_location || "", l?.load_number || "", n],
          };
        const reg = expiry("truck_id", t.id, "registration");
        const insp = expiry("truck_id", t.id, "inspection");
        return {
          ...base,
          cells: [
            linkBtn("truck", t.id, <b>#{t.unit_number}</b>),
            companyCell(c),
            model || "—",
            t.plate || "—",
            t.vin_number ? <span key="v" className="font-mono text-[12px]">{t.vin_number}</span> : "—",
            trailerLink(trailer),
            driverLink(drv),
            loadLink(l),
            <Pill key="s" className={st.pill}>{st.label}</Pill>,
            <Exp key="r" date={reg} />,
            <Exp key="i" date={insp} />,
            issueCell(n),
          ],
          csv: [t.unit_number, c?.name || "", model, t.plate || "", t.vin_number || "", trailer?.unit_number || "", drv?.name || "", l?.load_number || "", st.label, reg || "", insp || "", n],
        };
      });
    }
    if (tab === "trailers") {
      return TL.map((x) => {
        const c = companyById(x.company_id);
        const truck = truckOfTrailer(x.id);
        const drv = truck ? drivers.find((d) => d.id === truck.assigned_driver_id) : undefined;
        const l = truck ? loadOf(truck.id) : undefined;
        const n = issues.get(x.id) || 0;
        const st =
          x.status !== "active"
            ? { key: x.status === "out_of_service" ? "oos" : "inactive", label: x.status === "out_of_service" ? "Out of service" : "Inactive", pill: neutralPill }
            : truck
              ? { key: "hooked", label: "Hooked", pill: "bg-blue-500/10 text-blue-700 ring-blue-600/20 dark:text-blue-300" }
              : { key: "yard", label: "In the yard", pill: "bg-emerald-500/10 text-emerald-700 ring-emerald-600/20 dark:text-emerald-300" };
        const reg = expiry("trailer_id", x.id, "trailer_registration");
        const insp = expiry("trailer_id", x.id, "trailer_inspection");
        return {
          id: x.id,
          company: c,
          status: st.key,
          type: x.trailer_type || "",
          issues: n,
          search: `${x.unit_number} ${x.vin_number || ""} ${x.plate || ""} ${x.trailer_type || ""} ${truck?.unit_number || ""} ${drv?.name || ""} ${c?.name || ""}`,
          cells: [
            linkBtn("trailer", x.id, <b>#{x.unit_number}</b>),
            companyCell(c),
            [x.trailer_length, x.trailer_type].filter(Boolean).join(" ") || "—",
            truck ? truckLink(truck) : <span className="text-fg-4">In the yard</span>,
            truck ? driverLink(drv) : <span className="text-fg-4">—</span>,
            loadLink(l),
            x.plate || "—",
            <Pill key="s" className={st.pill}>{st.label}</Pill>,
            <Exp key="r" date={reg} />,
            <Exp key="i" date={insp} />,
            issueCell(n),
          ],
          csv: [x.unit_number, c?.name || "", [x.trailer_length, x.trailer_type].filter(Boolean).join(" "), truck?.unit_number || "", drv?.name || "", l?.load_number || "", x.plate || "", st.label, reg || "", insp || "", n],
        };
      });
    }
    return D.map((d) => {
      const c = companyById(d.company_id);
      const truck = truckOfDriver(d.id);
      const trailer = truck ? trailers.find((x) => x.id === truck.trailer_id) : undefined;
      const l = truck ? loadOf(truck.id) : undefined;
      const n = issues.get(d.id) || 0;
      const gone = !!d.termination_date || d.status === "inactive";
      const st = gone
        ? { key: "inactive", label: d.termination_date ? "Terminated" : "Inactive", pill: neutralPill }
        : truck
          ? { key: "on_truck", label: "On a truck", pill: "bg-blue-500/10 text-blue-700 ring-blue-600/20 dark:text-blue-300" }
          : { key: "no_truck", label: "No truck", pill: "bg-amber-500/10 text-amber-700 ring-amber-600/20 dark:text-amber-300" };
      return {
        id: d.id,
        company: c,
        status: st.key,
        type: d.license_type || "",
        issues: n,
        search: `${d.name} ${d.phone || ""} ${d.email || ""} ${d.cdl_number || ""} ${truck?.unit_number || ""} ${trailer?.unit_number || ""} ${c?.name || ""}`,
        cells: [
          linkBtn("driver", d.id, <b>{d.name}</b>, d.email),
          companyCell(c),
          d.phone ? (
            <a key="p" href={`tel:${d.phone}`} onClick={(e) => e.stopPropagation()} className="hover:underline">
              {d.phone}
            </a>
          ) : (
            "—"
          ),
          truck ? truckLink(truck) : <span className="text-amber-600 dark:text-amber-400">No truck</span>,
          truck ? trailerLink(trailer) : <span className="text-fg-4">—</span>,
          loadLink(l),
          d.license_type || "—",
          <Exp key="c" date={d.cdl_expiry} />,
          <Exp key="m" date={d.medical_card_expiry} />,
          <Pill key="s" className={st.pill}>{st.label}</Pill>,
          d.hire_date ? fmtDay(d.hire_date) : "—",
          issueCell(n),
        ],
        csv: [d.name, c?.name || "", d.phone || "", d.email || "", truck?.unit_number || "", trailer?.unit_number || "", l?.load_number || "", d.license_type || "", d.cdl_expiry || "", d.medical_card_expiry || "", st.label, d.hire_date || "", n],
      };
    });
    // Recomputed from the store data; helpers read the same values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, T, TL, D, trailers, trucks, drivers, loads, documents, issues, companies]);

  const HEAD: Record<Tab, string[]> = {
    units: ["Unit", "Company", "Trailer", "Driver", "Status", "Location", "Current load", "Paperwork"],
    trucks: ["Unit", "Company", "Truck", "Plate", "VIN", "Trailer", "Driver", "Current load", "Status", "Registration", "Inspection", "Paperwork"],
    trailers: ["Trailer", "Company", "Type", "Truck", "Driver", "Current load", "Plate", "Status", "Registration", "Inspection", "Paperwork"],
    drivers: ["Driver", "Company", "Phone", "Truck", "Trailer", "Current load", "License", "License expires", "Medical expires", "Status", "Hired", "Paperwork"],
  };
  // CSV headers (a few columns split in two: driver + phone, etc.)
  const CSV_HEAD: Record<Tab, string[]> = {
    units: ["Unit", "Company", "Truck", "Trailer", "Driver", "Driver phone", "Status", "Location", "Current load", "Paperwork issues"],
    trucks: ["Unit", "Company", "Truck", "Plate", "VIN", "Trailer", "Driver", "Current load", "Status", "Registration expires", "Inspection expires", "Paperwork issues"],
    trailers: ["Trailer", "Company", "Type", "Truck", "Driver", "Current load", "Plate", "Status", "Registration expires", "Inspection expires", "Paperwork issues"],
    drivers: ["Driver", "Company", "Phone", "Email", "Truck", "Trailer", "Current load", "License", "License expires", "Medical expires", "Status", "Hired", "Paperwork issues"],
  };
  const STATUSES: Record<Tab, [string, string][]> = {
    units: [["available", "Available"], ["loaded", "On a load"], ["oos", "Out of service"], ["inactive", "Inactive"]],
    trucks: [["available", "Available"], ["loaded", "On a load"], ["oos", "Out of service"], ["inactive", "Inactive"]],
    trailers: [["hooked", "Hooked"], ["yard", "In the yard"], ["oos", "Out of service"], ["inactive", "Inactive"]],
    drivers: [["on_truck", "On a truck"], ["no_truck", "No truck"], ["inactive", "Terminated / inactive"]],
  };
  const types = [...new Set(rows.map((r) => r.type).filter(Boolean))].sort();

  const shown = rows
    .filter((r) => r.company && picked(r.company.id))
    .filter((r) => status === "all" || r.status === status)
    .filter((r) => type === "all" || r.type === type)
    .filter((r) => !issuesOnly || r.issues > 0)
    .filter((r) => !q || r.search.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (a.company?.name || "").localeCompare(b.company?.name || "") || String(a.csv[0]).localeCompare(String(b.csv[0]), undefined, { numeric: true }));

  // Not in a unit (Units tab): drivers without a truck, trailers in the yard.
  const loose =
    tab === "units"
      ? {
          drivers: D.filter((d) => picked(d.company_id) && !d.termination_date && d.status === "active" && !truckOfDriver(d.id)),
          trailers: TL.filter((x) => picked(x.company_id) && x.status === "active" && !truckOfTrailer(x.id)),
        }
      : null;

  // ---- overview ---------------------------------------------------------------------------------
  const inPick = { t: T.filter((x) => picked(x.company_id)), tl: TL.filter((x) => picked(x.company_id)), d: D.filter((x) => picked(x.company_id)) };
  const activeTrucks = inPick.t.filter((x) => x.status === "active");
  const onLoad = activeTrucks.filter((x) => loadOf(x.id)).length;
  const activeDrivers = inPick.d.filter((x) => !x.termination_date && x.status === "active");
  const drvExpiring = activeDrivers.filter((x) => [x.cdl_expiry, x.medical_card_expiry].some((d) => (daysUntil(d) ?? 999) <= 30)).length;
  const paperwork = [...inPick.t, ...inPick.tl, ...inPick.d].reduce((s, x) => s + (issues.get(x.id) || 0), 0);

  const singleCompany = co.length === 1 ? companyById(co[0]) : scopedCompany || undefined;
  const sheetTruck = trucks.find((x) => x.id === params.get("truck")) || null;
  const sheetTrailer = trailers.find((x) => x.id === params.get("trailer")) || null;
  const sheetDriver = drivers.find((x) => x.id === params.get("driver")) || null;

  const addWhat: Exclude<Tab, "units"> = tab === "units" ? "trucks" : tab;
  const startAdd = () => setAdding({ what: addWhat, companyId: singleCompany?.id || "" });

  const exportCsv = () =>
    downloadCsv(`toss-${tab}-${new Date().toISOString().slice(0, 10)}.csv`, [CSV_HEAD[tab], ...shown.map((r) => r.csv)]);

  const tableRows = (list: Row[]) =>
    list.map((r) => (
      <tr
        key={r.id}
        onClick={() => open(tab === "drivers" ? "driver" : tab === "trailers" ? "trailer" : "truck", r.id)}
        className="cursor-pointer border-b border-line last:border-b-0 hover:bg-surface-2/50"
      >
        {r.cells.map((c, i) => (
          <td key={i} className={cn("whitespace-nowrap px-3 py-2.5 text-fg-2", i === 0 && "pl-4")}>
            {c}
          </td>
        ))}
      </tr>
    ));

  return (
    <Page>
      <PageHeader
        eyebrow={scopedCompany ? scopedCompany.name : "All companies"}
        title="Equipment & Drivers"
        actions={
          <>
            <Button variant="outline" onClick={exportCsv} disabled={!shown.length}>
              <Download className="h-4 w-4" /> Export
            </Button>
            <Button variant="primary" onClick={startAdd} disabled={!pool.length}>
              <Plus className="h-4 w-4" /> Add {addWhat === "drivers" ? "driver" : addWhat === "trailers" ? "trailer" : "truck"}
            </Button>
          </>
        }
      />

      {/* Units · Trucks · Trailers · Drivers */}
      <Tabs<Tab>
        value={tab}
        onChange={(v) => {
          setStatus("all");
          setType("all");
          go({ tab: v });
        }}
        className="mb-4"
        tabs={[
          { value: "units", label: <><Network className="h-4 w-4" /> Units</>, count: inPick.t.filter((x) => x.status !== "inactive").length },
          { value: "trucks", label: <><TruckIcon className="h-4 w-4" /> Trucks</>, count: inPick.t.length },
          { value: "trailers", label: <><Container className="h-4 w-4" /> Trailers</>, count: inPick.tl.length },
          { value: "drivers", label: <><Users className="h-4 w-4" /> Drivers</>, count: inPick.d.length },
        ]}
      />

      {/* Overview */}
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Trucks" value={activeTrucks.length} sub={`${onLoad} on a load · ${activeTrucks.length - onLoad} available · ${inPick.t.filter((x) => x.status === "out_of_service").length} out of service`} />
        <Stat label="Trailers" value={inPick.tl.filter((x) => x.status === "active").length} sub={`${inPick.tl.filter((x) => truckOfTrailer(x.id)).length} hooked · ${inPick.tl.filter((x) => x.status === "active" && !truckOfTrailer(x.id)).length} in the yard`} />
        <Stat label="Drivers" value={activeDrivers.length} sub={`${activeDrivers.filter((x) => !truckOfDriver(x.id)).length} without a truck · ${drvExpiring} license / medical ≤ 30 days`} />
        <Stat label="Paperwork issues" value={<span className={paperwork ? "text-amber-600 dark:text-amber-400" : ""}>{paperwork}</span>} sub="Expired, expiring or missing (as on Pending)" />
      </div>

      {/* By company */}
      <Card className="mb-4 overflow-x-auto">
        <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
          <span className="text-[13px] font-semibold text-fg">By company</span>
          <span className="text-xs text-fg-3">{co.length ? `${co.length} picked · ` : ""}Click a company to filter{co.length ? "" : " (several allowed)"}</span>
        </div>
        <table className="w-full min-w-[640px] text-[13px]">
          <thead>
            <tr className="border-b border-line text-left text-[11px] uppercase tracking-wider text-fg-4">
              <th className="px-4 py-2 font-semibold">Company</th>
              <th className="px-3 py-2 text-right font-semibold">Trucks</th>
              <th className="px-3 py-2 text-right font-semibold">Available</th>
              <th className="px-3 py-2 text-right font-semibold">Trailers</th>
              <th className="px-3 py-2 text-right font-semibold">Drivers</th>
              <th className="px-4 py-2 text-right font-semibold">Paperwork</th>
            </tr>
          </thead>
          <tbody>
            {pool
              .filter((c) => T.some((x) => x.company_id === c.id) || TL.some((x) => x.company_id === c.id) || D.some((x) => x.company_id === c.id) || co.includes(c.id))
              .map((c) => {
                const t = T.filter((x) => x.company_id === c.id);
                const at = t.filter((x) => x.status === "active");
                const tl = TL.filter((x) => x.company_id === c.id);
                const d = D.filter((x) => x.company_id === c.id && !x.termination_date && x.status === "active");
                const n = [...t, ...tl, ...D.filter((x) => x.company_id === c.id)].reduce((s, x) => s + (issues.get(x.id) || 0), 0);
                const on = co.includes(c.id);
                return (
                  <tr key={c.id} onClick={() => toggleCo(c.id)} className={cn("cursor-pointer border-b border-line last:border-b-0", on ? "bg-brand/10" : "hover:bg-surface-2/50")}>
                    <td className="px-4 py-2">
                      <span className="inline-flex items-center gap-2">
                        <input type="checkbox" readOnly checked={on} className="pointer-events-none accent-[var(--brand)]" aria-label={`Filter by ${c.name}`} />
                        <span className={cn("font-medium", on ? "text-fg" : "text-fg-2")}>{c.name}</span>
                        {c.stage === "lead" && <Pill className={neutralPill}>Lead</Pill>}
                      </span>
                    </td>
                    <td className="tnum px-3 py-2 text-right text-fg">{at.length}</td>
                    <td className="tnum px-3 py-2 text-right text-emerald-600 dark:text-emerald-400">{at.filter((x) => !loadOf(x.id)).length}</td>
                    <td className="tnum px-3 py-2 text-right text-fg">{tl.filter((x) => x.status === "active").length}</td>
                    <td className="tnum px-3 py-2 text-right text-fg">{d.length}</td>
                    <td className={cn("tnum px-4 py-2 text-right", n ? "text-amber-600 dark:text-amber-400" : "text-fg-4")}>{n || "—"}</td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </Card>

      {/* Filters */}
      <div className="mb-3 flex flex-col gap-2 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-4" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Unit, VIN, plate, driver, phone, company…" className="pl-9" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={co.length === 1 ? co[0] : co.length ? "several" : "all"} onChange={(e) => go({ co: e.target.value === "all" ? [] : [e.target.value] })} className="w-auto" aria-label="Company">
            <option value="all">All companies</option>
            {co.length > 1 && <option value="several">{co.length} companies</option>}
            {pool.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-auto" aria-label="Status">
            <option value="all">Any status</option>
            {STATUSES[tab].map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
          {types.length > 0 && (
            <Select value={type} onChange={(e) => setType(e.target.value)} className="w-auto" aria-label={tab === "drivers" ? "License" : "Equipment"}>
              <option value="all">{tab === "drivers" ? "Any license" : "Any equipment"}</option>
              {types.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          )}
          <Checkbox checked={issuesOnly} onChange={setIssuesOnly} label="Paperwork issues" />
          <Checkbox checked={group} onChange={setGroup} label="Group by company" />
          {(co.length > 0 || status !== "all" || type !== "all" || issuesOnly || q) && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setStatus("all");
                setType("all");
                setIssuesOnly(false);
                setQ("");
                go({ co: [] });
              }}
            >
              <X className="h-3.5 w-3.5" /> Clear
            </Button>
          )}
          {tab === "units" && singleCompany && (
            <Segmented
              size="sm"
              value={unitsView}
              onChange={setUnitsView}
              options={[
                { value: "table", label: "Table" },
                { value: "desk", label: "Desk" },
              ]}
            />
          )}
        </div>
      </div>

      {tab === "units" && unitsView === "desk" && singleCompany ? (
        <UnitsTab company={singleCompany} />
      ) : shown.length === 0 ? (
        <Card>
          <Empty icon={tab === "drivers" ? Users : tab === "trailers" ? Container : TruckIcon} title={rows.length ? "Nothing matches these filters" : `No ${tab === "units" ? "trucks" : tab} yet`} />
        </Card>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-line text-left text-[11px] uppercase tracking-wider text-fg-4">
                {HEAD[tab].map((h, i) => (
                  <th key={h} className={cn("whitespace-nowrap px-3 py-2 font-semibold", i === 0 && "pl-4")}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {group
                ? [...new Map(shown.map((r) => [r.company?.id || "", r.company])).entries()].map(([id, c]) => {
                    const list = shown.filter((r) => (r.company?.id || "") === id);
                    return [
                      <tr key={`g-${id}`} className="border-b border-line bg-surface-2/60">
                        <td colSpan={HEAD[tab].length} className="px-4 py-1.5 text-xs font-semibold text-fg">
                          {c?.name || "—"} <span className="font-normal text-fg-3">· {list.length}</span>
                        </td>
                      </tr>,
                      ...tableRows(list),
                    ];
                  })
                : tableRows(shown)}
            </tbody>
          </table>
        </Card>
      )}

      {/* Units: what isn't in a unit */}
      {loose && (loose.drivers.length > 0 || loose.trailers.length > 0) && !(unitsView === "desk" && singleCompany) && (
        <Card className="mt-4">
          <div className="border-b border-line px-4 py-2.5 text-[13px] font-semibold text-fg">Not in a unit</div>
          <div className="grid gap-4 p-4 sm:grid-cols-2">
            <div>
              <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-fg-4">Drivers without a truck · {loose.drivers.length}</div>
              <ul className="space-y-1 text-[13px]">
                {loose.drivers.map((d) => (
                  <li key={d.id}>
                    <button onClick={() => open("driver", d.id, "drivers")} className="text-fg hover:underline">
                      {d.name}
                    </button>{" "}
                    <span className="text-fg-4">· {companyById(d.company_id)?.name}</span>
                  </li>
                ))}
                {!loose.drivers.length && <li className="text-fg-4">None</li>}
              </ul>
            </div>
            <div>
              <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-fg-4">Trailers in the yard · {loose.trailers.length}</div>
              <ul className="space-y-1 text-[13px]">
                {loose.trailers.map((x) => (
                  <li key={x.id}>
                    <button onClick={() => open("trailer", x.id, "trailers")} className="text-fg hover:underline">
                      #{x.unit_number}
                    </button>{" "}
                    <span className="text-fg-4">
                      · {[x.trailer_length, x.trailer_type].filter(Boolean).join(" ")} · {companyById(x.company_id)?.name}
                    </span>
                  </li>
                ))}
                {!loose.trailers.length && <li className="text-fg-4">None</li>}
              </ul>
            </div>
          </div>
        </Card>
      )}

      {/* The same sheets and forms as inside a company */}
      <TruckSheet truck={sheetTruck} onClose={() => go({ sheet: null })} onEdit={(t) => setEditing({ truck: t })} />
      <TrailerSheet trailer={sheetTrailer} onClose={() => go({ sheet: null })} onEdit={(t) => setEditing({ trailer: t })} />
      <DriverSheet driver={sheetDriver} onClose={() => go({ sheet: null })} onEdit={(d) => setEditing({ driver: d })} />
      {editing?.truck && <TruckForm open truck={editing.truck} companyId={editing.truck.company_id} onClose={() => setEditing(null)} />}
      {editing?.trailer && <TrailerForm open trailer={editing.trailer} companyId={editing.trailer.company_id} onClose={() => setEditing(null)} />}
      {editing?.driver && <DriverForm open driver={editing.driver} companyId={editing.driver.company_id} onClose={() => setEditing(null)} />}

      <AddFor value={adding} companies={pool} onClose={() => setAdding(null)} />
    </Page>
  );
}

/** "Add" asks which company first, then opens the same form as inside that company. */
function AddFor({ value, companies, onClose }: { value: { what: "trucks" | "trailers" | "drivers"; companyId: string } | null; companies: Company[]; onClose: () => void }) {
  const [companyId, setCompanyId] = useState("");
  const [go, setGo] = useState(false);
  const [was, setWas] = useState<typeof value>(null);
  if (value !== was) {
    setWas(value);
    setCompanyId(value?.companyId || "");
    setGo(!!value?.companyId);
  }
  if (!value) return null;
  const done = () => {
    setGo(false);
    onClose();
  };
  if (go && companyId) {
    if (value.what === "trucks") return <TruckForm open companyId={companyId} onClose={done} />;
    if (value.what === "trailers") return <TrailerForm open companyId={companyId} onClose={done} />;
    return <DriverForm open companyId={companyId} onClose={done} />;
  }
  const what = value.what === "drivers" ? "driver" : value.what === "trailers" ? "trailer" : "truck";
  return (
    <Modal
      open
      onClose={done}
      title={`Add a ${what}`}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={done}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!companyId} onClick={() => setGo(true)}>
            Continue
          </Button>
        </>
      }
    >
      <Field label="For which company?" required>
        <Select value={companyId} onChange={(e) => setCompanyId(e.target.value)} autoFocus>
          <option value="">Select…</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </Field>
    </Modal>
  );
}
