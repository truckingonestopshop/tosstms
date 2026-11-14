"use client";

import { DispatchFrame, DispatchGate } from "@/components/fleet/CompanyNav";
import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronDown,
  ClipboardCopy,
  Map as MapIcon,
  Columns3,
  Download,
  FileCheck2,
  List,
  Mail,
  MoreHorizontal,
  Pencil,
  Phone,
  Plus,
  Printer,
  Search,
  Trash2,
  Truck as TruckIcon,
  X,
  XCircle,
  Copy,
} from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Checkbox, Input, Segmented, Select, inputBase } from "@/components/ui/Field";
import { Card, CardHeader, CopyButton, Empty, Eyebrow, KV, Page, PageHeader, Stat } from "@/components/ui/Bits";
import { Drawer } from "@/components/ui/Modal";
import { MemberAvatar } from "@/components/team/MemberAvatar";
import { Popover, MenuItem, MenuLabel, MenuSep } from "@/components/ui/Menu";
import { confirmDialog } from "@/components/ui/Confirm";
import { StatusMenu, StatusPill } from "@/components/loads/StatusMenu";
import { LoadsBoard } from "@/components/loads/LoadsBoard";
import { LoadsCalendar } from "@/components/loads/LoadsCalendar";
import { TruckMap } from "@/components/loads/TruckMap";
import { RouteMap } from "@/components/loads/RouteMap";
import { DocumentsPanel } from "@/components/docs/DocumentsPanel";
import { useStore } from "@/lib/store";
import { CompanyFilter } from "@/components/layout/CompanyFilter";
import { truckLabel } from "@/lib/pitch";
import { useRoute } from "@/lib/route";
import { contactLine } from "@/lib/profile";
import { toast } from "@/lib/toast";
import { downloadCsv } from "@/lib/csv";
import { driverSheet } from "@/app/(app)/loads/[id]/page";
import {
  STATUS,
  STATUS_ORDER,
  addDays,
  cn,
  fmtDateTime,
  fmtDay,
  isCanceled,
  lane,
  localDay,
  money,
  num,
  rpm,
  rpmAllIn,
  stopTypeNumbers,
  today,
  totalMiles,
} from "@/lib/format";
import type { Load, LoadStatus, LoadStop, StopStatus } from "@/lib/types";

type View = "list" | "board" | "calendar" | "map";
type StatusTab = "all" | "active" | LoadStatus | "canceled";
type Range = "all" | "today" | "week" | "30d" | "month" | "last_month" | "custom";
type SortKey =
  | "pickup_desc"
  | "pickup_asc"
  | "booked_desc"
  | "booked_asc"
  | "dropoff_desc"
  | "dropoff_asc"
  | "gross_desc"
  | "gross_asc"
  | "rpm_desc"
  | "rpm_asc"
  | "created_desc";

const PAGE = 25;

export default function LoadsPage() {
  return (
    <DispatchGate>
      <Suspense>
        <Loads />
      </Suspense>
    </DispatchGate>
  );
}

function inRange(l: Load, r: Range, customFrom?: string, customTo?: string) {
  if (r === "all") return true;
  const d = l.pickup_date || l.delivery_date || localDay(l.created_at);
  if (!d) return false;
  const t = today();
  if (r === "today") return l.pickup_date === t || l.delivery_date === t;
  if (r === "week") return d >= addDays(t, -7) && d <= addDays(t, 7);
  if (r === "30d") return d >= addDays(t, -30);
  if (r === "month") return d.slice(0, 7) === t.slice(0, 7);
  if (r === "last_month") {
    const lm = new Date();
    lm.setMonth(lm.getMonth() - 1);
    return d.slice(0, 7) === `${lm.getFullYear()}-${String(lm.getMonth() + 1).padStart(2, "0")}`;
  }
  if (r === "custom") {
    if (customFrom && d < customFrom) return false;
    if (customTo && d > customTo) return false;
    return true;
  }
  return true;
}

/** Multi-select dropdown filter with a checkbox for every option and a "Select all" checkbox at the top. */
function MultiCheckFilter({
  allLabel,
  options,
  selected,
  onChange,
  allChecked,
  onToggleAll,
  className,
  width = 240,
}: {
  allLabel: string;
  options: { value: string; label: string; dot?: string }[];
  selected: Set<string>;
  onChange: (next: Set<string>, allChecked: boolean) => void;
  allChecked: boolean;
  onToggleAll: (checked: boolean) => void;
  className?: string;
  width?: number;
}) {
  const activeFilter = !allChecked && selected.size > 0;
  const label = !activeFilter
    ? allLabel
    : selected.size === 1
      ? options.find((o) => selected.has(o.value))?.label || allLabel
      : `${selected.size} selected`;

  const toggleItem = (v: string) => {
    const next = new Set(allChecked ? options.map((o) => o.value) : selected);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    onChange(next, next.size === options.length && options.length > 0);
  };

  return (
    <Popover
      align="start"
      width={width}
      trigger={({ toggle, ref }) => (
        <button
          ref={ref}
          type="button"
          onClick={toggle}
          className={cn(
            inputBase,
            "relative flex h-9 items-center justify-between pr-8 text-left",
            activeFilter && "border-brand/60 bg-brand/5 font-medium",
            className,
          )}
        >
          <span className="truncate">{label}</span>
          <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-3" />
        </button>
      )}
    >
      {() => (
        <div className="max-h-72 overflow-y-auto p-1">
          <div className="flex items-center justify-between border-b border-line px-2 py-1.5">
            <Checkbox
              checked={allChecked || (options.length > 0 && selected.size === options.length)}
              indeterminate={!allChecked && selected.size > 0 && selected.size < options.length}
              onChange={(v) => onToggleAll(v)}
              label={<span className="text-xs font-semibold text-fg">Select all</span>}
            />
            {(selected.size > 0 || allChecked) && (
              <button
                type="button"
                onClick={() => onChange(new Set(), false)}
                className="text-[11px] font-medium text-fg-3 hover:text-fg"
              >
                Clear
              </button>
            )}
          </div>
          <div className="mt-1 space-y-0.5">
            {options.length === 0 ? (
              <div className="px-2.5 py-2 text-xs text-fg-4">No options</div>
            ) : (
              options.map((o) => {
                const isChecked = allChecked || selected.has(o.value);
                return (
                  <div
                    key={o.value}
                    onClick={() => toggleItem(o.value)}
                    className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] text-fg-2 hover:bg-surface-2 hover:text-fg"
                  >
                    <Checkbox checked={isChecked} onChange={() => toggleItem(o.value)} />
                    {o.dot && <span className={cn("h-2 w-2 shrink-0 rounded-full", o.dot)} />}
                    <span className="min-w-0 flex-1 truncate">{o.label}</span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </Popover>
  );
}

function useMultiState(initialValue?: string | null) {
  const [selected, setSelected] = useState<Set<string>>(() =>
    initialValue && initialValue !== "all" ? new Set([initialValue]) : new Set(),
  );
  const [allChecked, setAllChecked] = useState(false);
  return {
    selected,
    allChecked,
    onChange: (next: Set<string>, all: boolean) => {
      setSelected(next);
      setAllChecked(all);
    },
    onToggleAll: (checked: boolean, allIds: string[]) => {
      setAllChecked(checked);
      setSelected(checked ? new Set(allIds) : new Set());
    },
    reset: () => {
      setSelected(new Set());
      setAllChecked(false);
    },
  };
}

function Loads() {
  const params = useSearchParams();
  const router = useRouter();
  const {
    loads,
    companies,
    inScope,
    drivers,
    trucks,
    driverById,
    truckById,
    companyById,
    documents,
    setLoadStatus,
    deleteLoads,
    duplicateLoad,
    scope,
    members,
    memberName,
    me,
  } = useStore();

  const [view, setViewState] = useState<View>((params.get("view") as View) || "list");
  const [tab, setTab] = useState<StatusTab>((params.get("status") as StatusTab) || "all");
  const [q, setQ] = useState("");

  const companyFilter = useMultiState(null);
  const driverFilter = useMultiState(null);
  const truckFilter = useMultiState(null);
  const initDisp = params.get("dispatcher");
  const dispatcherFilter = useMultiState(initDisp === "me" ? me.id : initDisp);
  const statusFilter = useMultiState(null);

  const [range, setRange] = useState<Range>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [sort, setSort] = useState<SortKey>("pickup_desc");
  const [page, setPage] = useState(1);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [openLoadId, setOpenLoadId] = useState<string | null>(null);

  useEffect(() => {
    try {
      const v = localStorage.getItem("toss-tms-loads-view") as View | null;
      if (v && !params.get("view")) setViewState(v);
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const setView = (v: View) => {
    setViewState(v);
    try {
      localStorage.setItem("toss-tms-loads-view", v);
    } catch {}
  };

  const scoped = useMemo(() => loads.filter((l) => inScope(l.company_id)), [loads, inScope]);
  const scopedCompanies = useMemo(() => companies.filter((c) => inScope(c.id)), [companies, inScope]);
  const scopedDrivers = useMemo(() => drivers.filter((d) => inScope(d.company_id)), [drivers, inScope]);
  const scopedTrucks = useMemo(() => trucks.filter((t) => inScope(t.company_id)), [trucks, inScope]);

  const companyOpts = useMemo(() => scopedCompanies.map((c) => ({ value: c.id, label: c.name })), [scopedCompanies]);
  const driverOpts = useMemo(() => scopedDrivers.map((d) => ({ value: d.id, label: d.name })), [scopedDrivers]);
  const truckOpts = useMemo(() => scopedTrucks.map((t) => ({ value: t.id, label: truckLabel(t) })), [scopedTrucks]);
  const dispatcherOpts = useMemo(
    () => [
      { value: me.id, label: "My loads" },
      ...members.filter((m) => m.user_id !== me.id).map((m) => ({ value: m.user_id, label: m.full_name || m.email })),
    ],
    [members, me.id],
  );
  const statusOpts = useMemo(
    () => STATUS_ORDER.map((s) => ({ value: s, label: STATUS[s].label, dot: STATUS[s].dot })),
    [],
  );

  // Everything except the status tab / status dropdown (so tab counts reflect the other filters).
  const base = useMemo(() => {
    const s = q.trim().toLowerCase();
    const filterCompany = !companyFilter.allChecked && companyFilter.selected.size > 0;
    const filterDriver = !driverFilter.allChecked && driverFilter.selected.size > 0;
    const filterTruck = !truckFilter.allChecked && truckFilter.selected.size > 0;
    const filterDisp = !dispatcherFilter.allChecked && dispatcherFilter.selected.size > 0;

    return scoped.filter((l) => {
      if (filterCompany && !companyFilter.selected.has(l.company_id)) return false;
      if (filterDriver && (!l.driver_id || !driverFilter.selected.has(l.driver_id))) return false;
      if (filterTruck && (!l.truck_id || !truckFilter.selected.has(l.truck_id))) return false;
      if (filterDisp && (!l.dispatcher_id || !dispatcherFilter.selected.has(l.dispatcher_id))) return false;
      if (!inRange(l, range, customFrom, customTo)) return false;
      if (s) {
        const hay = [
          l.load_number,
          l.rate_con_number,
          l.broker_name,
          l.origin_city,
          l.origin_state,
          l.destination_city,
          l.destination_state,
          driverById(l.driver_id)?.name,
          truckById(l.truck_id)?.unit_number,
          companyById(l.company_id)?.name,
          memberName(l.dispatcher_id),
        ]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(s)) return false;
      }
      return true;
    });
  }, [
    scoped,
    q,
    companyFilter.allChecked,
    companyFilter.selected,
    driverFilter.allChecked,
    driverFilter.selected,
    truckFilter.allChecked,
    truckFilter.selected,
    dispatcherFilter.allChecked,
    dispatcherFilter.selected,
    range,
    customFrom,
    customTo,
    driverById,
    truckById,
    companyById,
    memberName,
  ]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: base.length, active: 0, canceled: 0 };
    for (const l of base) {
      c[l.status] = (c[l.status] || 0) + 1;
      if (["new", "booked", "in_transit"].includes(l.status)) c.active++;
      if (isCanceled(l.status)) c.canceled++;
    }
    return c;
  }, [base]);

  const filtered = useMemo(() => {
    const filterStatus = !statusFilter.allChecked && statusFilter.selected.size > 0;
    const out = base.filter((l) => {
      if (filterStatus && !statusFilter.selected.has(l.status)) return false;
      return tab === "all"
        ? true
        : tab === "active"
          ? ["new", "booked", "in_transit"].includes(l.status)
          : tab === "canceled"
            ? isCanceled(l.status)
            : l.status === tab;
    });
    const cmp: Record<SortKey, (a: Load, b: Load) => number> = {
      pickup_desc: (a, b) => (b.pickup_date || "").localeCompare(a.pickup_date || "") || b.created_at.localeCompare(a.created_at),
      pickup_asc: (a, b) => (a.pickup_date || "9").localeCompare(b.pickup_date || "9"),
      booked_desc: (a, b) => b.created_at.localeCompare(a.created_at),
      booked_asc: (a, b) => a.created_at.localeCompare(b.created_at),
      dropoff_desc: (a, b) => (b.delivery_date || "").localeCompare(a.delivery_date || "") || b.created_at.localeCompare(a.created_at),
      dropoff_asc: (a, b) => (a.delivery_date || "9").localeCompare(b.delivery_date || "9"),
      gross_desc: (a, b) => b.gross_amount - a.gross_amount,
      gross_asc: (a, b) => a.gross_amount - b.gross_amount,
      rpm_desc: (a, b) => rpm(b) - rpm(a),
      rpm_asc: (a, b) => (rpm(a) || Number.MAX_SAFE_INTEGER) - (rpm(b) || Number.MAX_SAFE_INTEGER),
      created_desc: (a, b) => b.created_at.localeCompare(a.created_at),
    };
    return out.sort(cmp[sort]);
  }, [base, tab, sort, statusFilter.allChecked, statusFilter.selected]);

  useEffect(() => {
    setPage(1);
    setSel(new Set());
  }, [
    tab,
    q,
    companyFilter.selected,
    driverFilter.selected,
    truckFilter.selected,
    dispatcherFilter.selected,
    statusFilter.selected,
    range,
    customFrom,
    customTo,
    scope,
  ]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const rows = filtered.slice((page - 1) * PAGE, page * PAGE);
  const chosen = filtered.filter((l) => sel.has(l.id));
  const target = chosen.length ? chosen : filtered;

  const stats = useMemo(() => {
    const live = filtered.filter((l) => !isCanceled(l.status));
    const gross = live.reduce((s, l) => s + l.gross_amount, 0);
    const fee = live.reduce((s, l) => s + l.dispatcher_cut, 0);
    const loaded = live.reduce((s, l) => s + l.loaded_miles, 0);
    const miles = live.reduce((s, l) => s + totalMiles(l), 0);
    const canceledList = base.filter((l) => isCanceled(l.status));
    const canceled = canceledList.length;
    const canceledGross = canceledList.reduce((s, l) => s + l.gross_amount, 0);
    return {
      count: live.length,
      gross,
      fee,
      loaded,
      miles,
      rpm: loaded ? gross / loaded : 0,
      allIn: miles ? gross / miles : 0,
      canceled,
      canceledGross,
    };
  }, [filtered, base]);

  const exportCsv = () => {
    downloadCsv(`loads-${today()}.csv`, [
      ["Load #", "Rate con #", "Status", "Carrier", "Broker", "Origin", "Destination", "Pickup", "Delivery", "Driver", "Truck", "Dispatcher", "Added by", "Loaded mi", "DH mi", "Gross", "Fee %", "Fee", "RPM"],
      ...target.map((l) => [
        l.load_number,
        l.rate_con_number,
        STATUS[l.status].label,
        companyById(l.company_id)?.name,
        l.broker_name,
        `${l.origin_city}, ${l.origin_state}`,
        `${l.destination_city}, ${l.destination_state}`,
        l.pickup_date,
        l.delivery_date,
        driverById(l.driver_id)?.name,
        truckById(l.truck_id)?.unit_number,
        memberName(l.dispatcher_id),
        memberName(l.created_by),
        l.loaded_miles,
        l.deadhead_miles,
        l.gross_amount.toFixed(2),
        l.commission_percent,
        l.dispatcher_cut.toFixed(2),
        rpm(l) ? rpm(l).toFixed(2) : "",
      ]),
    ]);
  };

  const printReport = () => {
    try {
      sessionStorage.setItem("toss-tms-report", JSON.stringify(target.map((l) => l.id)));
    } catch {}
    window.open("/loads/report", "_blank");
  };

  const hasDocs = (id: string, type: string) => documents.some((d) => d.load_id === id && d.doc_type === type);

  const TABS: { v: StatusTab; label: string }[] = [
    { v: "all", label: "All" },
    { v: "active", label: "Active" },
    { v: "new", label: "New" },
    { v: "booked", label: "Booked" },
    { v: "in_transit", label: "In transit" },
    { v: "delivered", label: "Delivered" },
    { v: "invoiced", label: "Invoiced" },
    { v: "paid", label: "Paid" },
    { v: "canceled", label: "Canceled" },
  ];

  const openLoad = openLoadId ? loads.find((l) => l.id === openLoadId) || null : null;

  return (
    <Page>
      <DispatchFrame />
      <PageHeader
        eyebrow={<CompanyFilter />}
        title="Loads"
        actions={
          <>
            <Segmented
              value={view}
              onChange={setView}
              options={[
                { value: "list", label: <><List className="h-3.5 w-3.5" /> <span className="hidden sm:inline">List</span></> },
                { value: "board", label: <><Columns3 className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Board</span></> },
                { value: "calendar", label: <><CalendarDays className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Calendar</span></> },
                { value: "map", label: <><MapIcon className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Map</span></> },
              ]}
            />
            <Popover
              align="end"
              width={210}
              trigger={({ toggle, ref }) => (
                <Button ref={ref} variant="outline" size="md" onClick={toggle}>
                  <Download className="h-4 w-4" /> <span className="hidden sm:inline">Export</span>
                </Button>
              )}
            >
              {(close) => (
                <>
                  <MenuLabel>{chosen.length ? `${chosen.length} selected` : `${filtered.length} shown`}</MenuLabel>
                  <MenuItem icon={Download} onClick={() => (close(), exportCsv())}>
                    Spreadsheet (CSV)
                  </MenuItem>
                  <MenuItem icon={Printer} onClick={() => (close(), printReport())}>
                    Printable report
                  </MenuItem>
                </>
              )}
            </Popover>
            <ButtonLink href="/loads/new" variant="primary" className="hidden md:inline-flex">
              <Plus className="h-4 w-4" /> New load
            </ButtonLink>
          </>
        }
      />

      {view === "map" ? (
        <TruckMap />
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat
              label="Loads"
              value={num(stats.count)}
              sub={`${counts.in_transit || 0} in transit · ${counts.booked || 0} booked · ${counts.delivered || 0} delivered · ${counts.canceled || 0} canceled`}
            />
            <Stat label="Gross" value={money(stats.gross, { cents: false })} sub={`${money(stats.fee)} TOSS fee`}>
              {stats.canceled > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    statusFilter.reset();
                    setTab("canceled");
                  }}
                  title="Canceled loads aren't counted in gross or fees"
                  className="mt-2.5 inline-flex max-w-full items-center gap-1.5 rounded-full bg-red-500/10 px-2 py-0.5 text-[11px] font-medium text-red-600 transition-colors hover:bg-red-500/15 dark:text-red-400"
                >
                  <XCircle className="h-3 w-3 shrink-0" />
                  <span className="truncate">
                    {stats.canceled} canceled · {money(stats.canceledGross, { cents: false })} not counted
                  </span>
                </button>
              )}
            </Stat>
            <Stat label="Avg RPM" value={stats.rpm ? `$${stats.rpm.toFixed(2)}` : "—"} sub={stats.allIn ? `$${stats.allIn.toFixed(2)} all-in` : "Loaded miles"} />
            <Stat label="Miles" value={num(stats.miles)} sub={`${num(stats.loaded)} loaded · ${num(stats.miles - stats.loaded)} DH`} />
          </div>

          {/* Filters */}
          <div className="mb-3 flex flex-col gap-2 xl:flex-row xl:items-center">
            <div className="relative min-w-[200px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-4" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Load #, rate con, broker, city, driver, unit…" className="pl-9" />
              {q && (
                <button onClick={() => setQ("")} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-fg-4 hover:text-fg" aria-label="Clear search">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:flex xl:flex-wrap xl:items-center">
              <MultiCheckFilter
                allLabel="All companies"
                options={companyOpts}
                selected={companyFilter.selected}
                allChecked={companyFilter.allChecked}
                onChange={companyFilter.onChange}
                onToggleAll={(v) => companyFilter.onToggleAll(v, companyOpts.map((o) => o.value))}
                className="xl:w-36"
              />
              <MultiCheckFilter
                allLabel="All drivers"
                options={driverOpts}
                selected={driverFilter.selected}
                allChecked={driverFilter.allChecked}
                onChange={driverFilter.onChange}
                onToggleAll={(v) => driverFilter.onToggleAll(v, driverOpts.map((o) => o.value))}
                className="xl:w-36"
              />
              <MultiCheckFilter
                allLabel="All trucks"
                options={truckOpts}
                selected={truckFilter.selected}
                allChecked={truckFilter.allChecked}
                onChange={truckFilter.onChange}
                onToggleAll={(v) => truckFilter.onToggleAll(v, truckOpts.map((o) => o.value))}
                className="xl:w-32"
              />
              <MultiCheckFilter
                allLabel="All dispatchers"
                options={dispatcherOpts}
                selected={dispatcherFilter.selected}
                allChecked={dispatcherFilter.allChecked}
                onChange={dispatcherFilter.onChange}
                onToggleAll={(v) => dispatcherFilter.onToggleAll(v, dispatcherOpts.map((o) => o.value))}
                className="xl:w-36"
              />
              <MultiCheckFilter
                allLabel="All statuses"
                options={statusOpts}
                selected={statusFilter.selected}
                allChecked={statusFilter.allChecked}
                onChange={(next, all) => {
                  statusFilter.onChange(next, all);
                  if (next.size > 0 && !all) setTab("all");
                }}
                onToggleAll={(v) => {
                  statusFilter.onToggleAll(v, statusOpts.map((o) => o.value));
                  setTab("all");
                }}
                className="xl:w-36"
              />
              <Select value={range} onChange={(e) => setRange(e.target.value as Range)} className="xl:w-36">
                <option value="all">Any date</option>
                <option value="today">Today</option>
                <option value="week">This week ±7d</option>
                <option value="30d">Last 30 days</option>
                <option value="month">This month</option>
                <option value="last_month">Last month</option>
                <option value="custom">Custom dates</option>
              </Select>
              {range === "custom" && (
                <div className="col-span-2 flex items-center gap-1.5 sm:col-span-2">
                  <Input
                    type="date"
                    value={customFrom}
                    onChange={(e) => setCustomFrom(e.target.value)}
                    className="h-9 w-[134px] px-2 text-xs"
                    aria-label="From date"
                  />
                  <span className="text-xs text-fg-4">→</span>
                  <Input
                    type="date"
                    value={customTo}
                    onChange={(e) => setCustomTo(e.target.value)}
                    className="h-9 w-[134px] px-2 text-xs"
                    aria-label="To date"
                  />
                </div>
              )}
              <Select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="xl:w-40">
                <option value="pickup_desc">Newest pickup</option>
                <option value="pickup_asc">Oldest pickup</option>
                <option value="booked_desc">Newest booked</option>
                <option value="booked_asc">Oldest booked</option>
                <option value="dropoff_desc">Newest Drop off</option>
                <option value="dropoff_asc">Oldest Drop off</option>
                <option value="gross_desc">Highest rate</option>
                <option value="gross_asc">Lowest Rate</option>
                <option value="rpm_desc">Highest Rate/mi</option>
                <option value="rpm_asc">Lowest Rate/mi</option>
                <option value="created_desc">Recently added</option>
              </Select>
            </div>
          </div>

          {view !== "board" && (
            <div className="scrollbar-none -mx-4 mb-4 flex gap-1 overflow-x-auto px-4 sm:mx-0 sm:px-0">
              {TABS.map((t) => (
                <button
                  key={t.v}
                  onClick={() => {
                    statusFilter.reset();
                    setTab(t.v);
                  }}
                  className={cn(
                    "flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors",
                    tab === t.v && (statusFilter.allChecked || statusFilter.selected.size === 0)
                      ? "bg-inverse text-inverse-fg"
                      : "text-fg-3 hover:bg-surface-2 hover:text-fg",
                  )}
                >
                  {t.label}
                  <span className={cn("tnum text-[11px]", tab === t.v ? "opacity-70" : "text-fg-4")}>{counts[t.v] || 0}</span>
                </button>
              ))}
            </div>
          )}

          {/* Bulk bar */}
          {sel.size > 0 && (
            <div className="animate-pop sticky top-[60px] z-20 mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2 shadow-pop">
              <span className="text-[13px] font-semibold text-fg">{sel.size} selected</span>
              <span className="tnum text-xs text-fg-3">{money(chosen.reduce((s, l) => s + l.gross_amount, 0), { cents: false })}</span>
              <div className="ml-auto flex flex-wrap items-center gap-1.5">
                <Popover
                  width={200}
                  align="end"
                  trigger={({ toggle, ref }) => (
                    <Button ref={ref} size="sm" variant="outline" onClick={toggle}>
                      Set status
                    </Button>
                  )}
                >
                  {(close) =>
                    STATUS_ORDER.map((s) => (
                      <MenuItem
                        key={s}
                        onClick={async () => {
                          close();
                          if (await setLoadStatus([...sel], s)) {
                            toast.success(`${sel.size} loads → ${STATUS[s].label}`);
                            setSel(new Set());
                          }
                        }}
                      >
                        <span className="flex items-center gap-2">
                          <span className={cn("h-2 w-2 rounded-full", STATUS[s].dot)} />
                          {STATUS[s].label}
                        </span>
                      </MenuItem>
                    ))
                  }
                </Popover>
                <Button size="sm" variant="outline" onClick={exportCsv}>
                  <Download className="h-3.5 w-3.5" /> CSV
                </Button>
                <Button size="sm" variant="outline" onClick={printReport}>
                  <Printer className="h-3.5 w-3.5" /> Report
                </Button>
                <Button
                  size="sm"
                  variant="danger-ghost"
                  onClick={async () => {
                    if (
                      await confirmDialog({
                        title: `Delete ${sel.size} load${sel.size > 1 ? "s" : ""}?`,
                        body: "Their documents are deleted too. This can't be undone.",
                        confirmLabel: "Delete",
                        danger: true,
                      })
                    ) {
                      if (await deleteLoads([...sel])) {
                        toast.success("Deleted");
                        setSel(new Set());
                      }
                    }
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </Button>
                <Button size="icon-sm" variant="ghost" onClick={() => setSel(new Set())} aria-label="Clear selection">
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {view === "board" ? (
            <LoadsBoard loads={base} onOpen={(l) => setOpenLoadId(l.id)} />
          ) : view === "calendar" ? (
            <LoadsCalendar loads={filtered} onOpen={(l) => setOpenLoadId(l.id)} />
          ) : filtered.length === 0 ? (
            <Card>
              <Empty
                icon={TruckIcon}
                title={scoped.length ? "No loads match these filters" : "No loads yet"}
                body={scoped.length ? "Try another status or clear the search." : "Book the first load from a rate confirmation or by hand."}
                action={
                  !scoped.length && (
                    <ButtonLink href="/loads/new" variant="primary">
                      <Plus className="h-4 w-4" /> New load
                    </ButtonLink>
                  )
                }
              />
            </Card>
          ) : (
            <>
              {/* Desktop table */}
              <Card className="hidden overflow-hidden lg:block">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-[13px]">
                    <thead>
                      <tr className="border-b border-line text-[11px] font-semibold uppercase tracking-wider text-fg-4">
                        <th className="w-10 py-2.5 pl-4">
                          <Checkbox
                            checked={rows.length > 0 && rows.every((r) => sel.has(r.id))}
                            indeterminate={rows.some((r) => sel.has(r.id))}
                            onChange={(v) =>
                              setSel((s) => {
                                const n = new Set(s);
                                rows.forEach((r) => (v ? n.add(r.id) : n.delete(r.id)));
                                return n;
                              })
                            }
                          />
                        </th>
                        <th className="px-3 py-2.5">Load</th>
                        <th className="px-3 py-2.5">Lane</th>
                        <th className="px-3 py-2.5">Dates</th>
                        <th className="px-3 py-2.5">Driver / unit</th>
                        <th className="px-3 py-2.5">Dispatcher</th>
                        <th className="px-3 py-2.5 text-right">Miles</th>
                        <th className="px-3 py-2.5 text-right">Gross</th>
                        <th className="px-3 py-2.5 text-right">RPM</th>
                        <th className="px-3 py-2.5 text-right">Fee</th>
                        <th className="px-3 py-2.5">Status</th>
                        <th className="w-10 py-2.5 pr-3" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {rows.map((l) => {
                        const d = driverById(l.driver_id);
                        const t = truckById(l.truck_id);
                        return (
                          <tr
                            key={l.id}
                            onClick={() => setOpenLoadId(l.id)}
                            className={cn(
                              "group cursor-pointer transition-colors hover:bg-surface-2/60",
                              sel.has(l.id) && "bg-brand/5",
                              openLoadId === l.id && "bg-surface-2",
                            )}
                          >
                            <td className="py-3 pl-4" onClick={(e) => e.stopPropagation()}>
                              <Checkbox
                                checked={sel.has(l.id)}
                                onChange={(v) =>
                                  setSel((s) => {
                                    const n = new Set(s);
                                    if (v) n.add(l.id);
                                    else n.delete(l.id);
                                    return n;
                                  })
                                }
                              />
                            </td>
                            <td className="max-w-[180px] px-3 py-3">
                              <div className="truncate font-semibold text-fg">{l.load_number ? `#${l.load_number}` : "—"}</div>
                              <div className="truncate text-xs text-fg-3">{l.broker_name || "No broker"}</div>
                              {scope === "all" && <div className="truncate text-[11px] text-fg-4">{companyById(l.company_id)?.name}</div>}
                            </td>
                            <td className="max-w-[260px] px-3 py-3">
                              <div className="truncate font-medium text-fg">{lane(l)}</div>
                              <div className="flex items-center gap-1.5 text-xs text-fg-3">
                                {l.stops.length > 2 && <span>{l.stops.length} stops</span>}
                                {hasDocs(l.id, "rate_confirmation") && (
                                  <span title="Rate con on file">
                                    <FileCheck2 className="h-3 w-3 text-fg-4" />
                                  </span>
                                )}
                                {["delivered", "invoiced"].includes(l.status) && !hasDocs(l.id, "pod") && (
                                  <span className="text-amber-600 dark:text-amber-400">POD missing</span>
                                )}
                              </div>
                            </td>
                            <td className="whitespace-nowrap px-3 py-3 text-fg-2">
                              <div className="tnum">{fmtDay(l.pickup_date)}</div>
                              <div className="tnum text-xs text-fg-4">→ {fmtDay(l.delivery_date)}</div>
                            </td>
                            <td className="max-w-[150px] px-3 py-3">
                              <div className="truncate text-fg">{d?.name || <span className="text-fg-4">Unassigned</span>}</div>
                              <div className="text-xs text-fg-3">{t ? `Unit ${t.unit_number}` : ""}</div>
                            </td>
                            <td className="max-w-[150px] px-3 py-3">
                              <DispatcherTag id={l.dispatcher_id} />
                            </td>
                            <td className="tnum whitespace-nowrap px-3 py-3 text-right text-fg-2">
                              {num(l.loaded_miles)}
                              {l.deadhead_miles > 0 && <div className="text-xs text-fg-4">+{num(l.deadhead_miles)} DH</div>}
                            </td>
                            <td className="tnum whitespace-nowrap px-3 py-3 text-right font-semibold text-fg">{money(l.gross_amount, { cents: false })}</td>
                            <td className="tnum whitespace-nowrap px-3 py-3 text-right text-fg-2">{rpm(l) ? `$${rpm(l).toFixed(2)}` : "—"}</td>
                            <td className="tnum whitespace-nowrap px-3 py-3 text-right text-fg-2">{money(l.dispatcher_cut)}</td>
                            <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                              <StatusMenu status={l.status} onChange={(s) => setLoadStatus([l.id], s)} />
                            </td>
                            <td className="py-3 pr-3" onClick={(e) => e.stopPropagation()}>
                              <RowMenu
                                onOpen={() => router.push(`/loads/${l.id}`)}
                                onEdit={() => router.push(`/loads/${l.id}/edit`)}
                                onDuplicate={async () => {
                                  const c = await duplicateLoad(l.id);
                                  if (c) router.push(`/loads/${c.id}/edit`);
                                }}
                                onDelete={async () => {
                                  if (await confirmDialog({ title: "Delete this load?", body: lane(l), confirmLabel: "Delete", danger: true }))
                                    if (await deleteLoads([l.id])) toast.success("Load deleted");
                                }}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>

              {/* Phone / tablet cards */}
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:hidden">
                {rows.map((l) => {
                  const d = driverById(l.driver_id);
                  const t = truckById(l.truck_id);
                  return (
                    <button
                      key={l.id}
                      type="button"
                      onClick={() => setOpenLoadId(l.id)}
                      className="block w-full rounded-xl border border-line bg-surface p-3.5 text-left active:bg-surface-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate text-[13px] font-semibold text-fg">{lane(l)}</div>
                          <div className="mt-0.5 truncate text-xs text-fg-3">
                            {l.load_number ? `#${l.load_number} · ` : ""}
                            {l.broker_name || "No broker"}
                          </div>
                        </div>
                        <StatusPill status={l.status} />
                      </div>
                      <div className="mt-3 flex items-end justify-between gap-2">
                        <div className="min-w-0 text-xs text-fg-3">
                          <div className="tnum">
                            {fmtDay(l.pickup_date)} → {fmtDay(l.delivery_date)}
                          </div>
                          <div className="truncate">
                            {d?.name || "No driver"}
                            {t ? ` · #${t.unit_number}` : ""}
                          </div>
                          <div className="truncate text-fg-4">Dispatcher: {memberName(l.dispatcher_id)}</div>
                        </div>
                        <div className="text-right">
                          <div className="tnum text-[15px] font-bold text-fg">{money(l.gross_amount, { cents: false })}</div>
                          <div className="tnum text-[11px] text-fg-3">
                            {num(l.loaded_miles)} mi{rpm(l) ? ` · $${rpm(l).toFixed(2)}` : ""}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {pages > 1 && (
                <div className="mt-4 flex items-center justify-between text-[13px] text-fg-3">
                  <span className="tnum">
                    {(page - 1) * PAGE + 1}–{Math.min(page * PAGE, filtered.length)} of {filtered.length}
                  </span>
                  <div className="flex gap-1.5">
                    <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
                      Previous
                    </Button>
                    <Button size="sm" variant="outline" disabled={page === pages} onClick={() => setPage((p) => p + 1)}>
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}

      <LoadSheet load={openLoad} onClose={() => setOpenLoadId(null)} />
    </Page>
  );
}

const FLOW: LoadStatus[] = ["booked", "in_transit", "delivered", "invoiced", "paid"];
const STOP_FLOW: { s: StopStatus; label: string }[] = [
  { s: "pending", label: "Pending" },
  { s: "en_route", label: "En route" },
  { s: "arrived", label: "Arrived" },
  { s: "completed", label: "Done" },
];

/** Side drawer preview when selecting a load on /loads (similar to DriverSheet). */
function LoadSheet({ load, onClose }: { load: Load | null; onClose: () => void }) {
  const {
    companyById,
    driverById,
    truckById,
    trailerById,
    trailers,
    drivers,
    trucks,
    invoices,
    updateLoad,
    setLoadStatus,
    deleteLoads,
    memberName,
    memberById,
    members,
    me,
  } = useStore();
  const route = useRoute(load?.stops.length ? load.stops : [], { from: load?.deadhead_from });
  const types = useMemo(() => (load?.stops || []).map((s) => s.type), [load?.stops]);
  const stopNums = useMemo(() => stopTypeNumbers(load?.stops || []), [load?.stops]);

  if (!load) return null;
  const company = companyById(load.company_id);
  const driver = driverById(load.driver_id);
  const truck = truckById(load.truck_id);
  const invoice = invoices.find((i) => i.lines.some((li) => li.load_id === load.id));
  const flowIdx = FLOW.indexOf(load.status);

  const setStop = (sid: string, p: Partial<LoadStop>) =>
    updateLoad(load.id, { stops: load.stops.map((s) => (s.id === sid ? { ...s, ...p } : s)) });

  return (
    <Drawer
      open
      onClose={onClose}
      width="max-w-2xl"
      title={
        <div className="flex flex-wrap items-center gap-2">
          <span>{lane(load)}</span>
        </div>
      }
      subtitle={
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="font-semibold text-fg-2">{load.load_number ? `Load #${load.load_number}` : "Load"}</span>
          {load.load_number && <CopyButton text={load.load_number} />}
          {company && <span>· {company.name}</span>}
          <span>
            · {fmtDay(load.pickup_date)} → {fmtDay(load.delivery_date)}
          </span>
        </span>
      }
      actions={
        <>
          <ButtonLink size="sm" variant="ghost" href={`/loads/${load.id}`}>
            <ArrowUpRight className="h-3.5 w-3.5" /> Open
          </ButtonLink>
          <ButtonLink size="sm" variant="ghost" href={`/loads/${load.id}/edit`}>
            <Pencil className="h-3.5 w-3.5" /> Edit
          </ButtonLink>
          <Button
            size="sm"
            variant="ghost"
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
            <ClipboardCopy className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="icon-sm"
            variant="danger-ghost"
            aria-label="Delete load"
            onClick={async () => {
              if (
                await confirmDialog({
                  title: "Delete this load?",
                  body: `${lane(load)} will be removed for good.`,
                  confirmLabel: "Delete load",
                  danger: true,
                })
              ) {
                if (await deleteLoads([load.id])) {
                  toast.success("Load deleted");
                  onClose();
                }
              }
            }}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </>
      }
    >
      <div className="space-y-5 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <StatusMenu status={load.status} onChange={(s) => setLoadStatus([load.id], s)} />
          {invoice && (
            <Link href={`/invoices/${invoice.id}`} className="rounded-lg bg-surface-2 px-2.5 py-1 text-xs font-medium text-fg-2 hover:bg-surface-3">
              Invoice {invoice.invoice_number} · <span className="capitalize text-fg">{invoice.status}</span>
            </Link>
          )}
        </div>

        {!isCanceled(load.status) && (
          <div className="scrollbar-none flex overflow-x-auto rounded-xl border border-line bg-surface-2/50 p-1">
            {FLOW.map((s, i) => {
              const done = flowIdx >= i;
              const current = load.status === s;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => !current && setLoadStatus([load.id], s)}
                  className={cn(
                    "flex min-w-[92px] flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors",
                    current ? "bg-inverse text-inverse-fg" : done ? "text-fg hover:bg-surface" : "text-fg-4 hover:bg-surface hover:text-fg",
                  )}
                >
                  {done && !current ? <Check className="h-3 w-3" /> : <span className={cn("h-1.5 w-1.5 rounded-full", current ? "bg-brand" : "bg-fg-4")} />}
                  {STATUS[s].label}
                </button>
              );
            })}
          </div>
        )}

        {/* Rate & Miles */}
        <Card>
          <div className="p-4">
            <div className="flex items-baseline justify-between gap-3">
              <div>
                <Eyebrow>Gross rate</Eyebrow>
                <div className="tnum mt-0.5 text-2xl font-bold tracking-tight text-fg">{money(load.gross_amount)}</div>
              </div>
              <div className="text-right text-xs text-fg-3">
                <div>
                  TOSS fee ({load.commission_percent}%): <b className="tnum text-fg">{money(load.dispatcher_cut)}</b>
                </div>
                <div>
                  Carrier keeps: <b className="tnum text-fg">{money(load.gross_amount - load.dispatcher_cut)}</b>
                </div>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-3 border-t border-line pt-3">
              <KV label="Loaded / DH">
                {num(load.loaded_miles)} / {num(load.deadhead_miles)} mi
              </KV>
              <KV label="RPM loaded">{rpm(load) ? `$${rpm(load).toFixed(2)}` : null}</KV>
              <KV label="RPM all-in">{rpmAllIn(load) ? `$${rpmAllIn(load).toFixed(2)}` : null}</KV>
            </div>
          </div>
        </Card>

        {/* Stops */}
        <Card>
          <CardHeader title="Stops" subtitle={route.data?.miles ? `${num(route.data.miles)} mi by road` : undefined} />
          <ol className="divide-y divide-line">
            {load.stops.map((s, i) => (
              <li key={s.id} className="flex gap-3 p-3.5">
                <div className="flex flex-col items-center">
                  <span
                    className={cn(
                      "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                      s.type === "pickup" ? "bg-inverse text-inverse-fg" : "bg-brand text-brand-fg",
                    )}
                  >
                    {stopNums[i]}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[11px] font-semibold uppercase tracking-wider text-fg-4">
                        {s.type === "pickup" ? `Pickup ${stopNums[i]}` : `Delivery ${stopNums[i]}`}
                      </div>
                      <div className="truncate text-sm font-semibold text-fg">{s.facility_name || [s.city, s.state].filter(Boolean).join(", ")}</div>
                      <div className="text-xs text-fg-2">
                        {[s.address, [s.city, s.state].filter(Boolean).join(", "), s.zip].filter(Boolean).join(" · ")}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="tnum text-xs font-semibold text-fg">
                        {fmtDay(s.date)} {s.time}
                      </div>
                      {s.appointment && <div className="text-[11px] text-fg-3">{s.appointment}</div>}
                    </div>
                  </div>
                  <div className="mt-2 inline-flex rounded-lg border border-line p-0.5">
                    {STOP_FLOW.map((f) => (
                      <button
                        key={f.s}
                        type="button"
                        onClick={() => setStop(s.id, { status: f.s })}
                        className={cn(
                          "rounded-md px-2 py-0.5 text-[11px] font-medium",
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
          </ol>
        </Card>

        <RouteMap
          route={route.data}
          types={types}
          loading={route.loading}
          loadedMiles={load.loaded_miles}
          deadheadMiles={load.deadhead_miles}
          from={load.deadhead_from}
          className="h-52"
        />

        {/* Assignment */}
        <Card>
          <CardHeader title="Assignment" />
          <div className="grid grid-cols-2 gap-3 p-4">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-fg-2">Truck</span>
              <Select
                value={load.truck_id || ""}
                onChange={(e) => {
                  const t = truckById(e.target.value);
                  updateLoad(load.id, {
                    truck_id: e.target.value || null,
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
                      {truckLabel(t)}
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
          </div>
          <div className="flex items-center justify-between border-t border-line px-4 py-2.5 text-xs text-fg-3">
            <span className="flex items-center gap-2">
              <MemberAvatar id={load.created_by} className="h-5 w-5 text-[10px]" />
              Added by <b className="font-semibold text-fg-2">{load.created_by === me.id ? "you" : memberName(load.created_by)}</b> · {fmtDateTime(load.created_at)}
            </span>
          </div>
        </Card>

        {/* Broker & freight */}
        <Card>
          <CardHeader title="Broker & freight" />
          <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3">
            <KV label="Broker">{load.broker_name}</KV>
            <KV label="Broker MC">{load.broker_mc}</KV>
            <KV label="Contact">{load.broker_contact}</KV>
            <KV label="Phone">
              {load.broker_phone && (
                <a href={`tel:${load.broker_phone}`} className="inline-flex items-center gap-1 hover:underline">
                  <Phone className="h-3 w-3 text-fg-4" />
                  {load.broker_phone}
                </a>
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
        </Card>

        {/* Paperwork */}
        <Card>
          <CardHeader title="Paperwork" />
          <div className="p-4">
            <DocumentsPanel
              target={{ scope: "load", id: load.id, companyId: load.company_id, status: load.status }}
              compact
              emptyText="No files on this load yet."
            />
          </div>
        </Card>
      </div>
    </Drawer>
  );
}

function RowMenu({
  onOpen,
  onEdit,
  onDuplicate,
  onDelete,
}: {
  onOpen: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  return (
    <Popover
      align="end"
      width={170}
      trigger={({ toggle, ref }) => (
        <button ref={ref} onClick={toggle} className="rounded-md p-1 text-fg-4 opacity-60 hover:bg-surface-3 hover:text-fg group-hover:opacity-100" aria-label="Load actions">
          <MoreHorizontal className="h-4 w-4" />
        </button>
      )}
    >
      {(close) => (
        <>
          <MenuItem icon={ArrowUpRight} onClick={() => (close(), onOpen())}>
            Open full page
          </MenuItem>
          <MenuItem icon={Pencil} onClick={() => (close(), onEdit())}>
            Edit
          </MenuItem>
          <MenuItem icon={Copy} onClick={() => (close(), onDuplicate())}>
            Duplicate
          </MenuItem>
          <MenuSep />
          <MenuItem icon={Trash2} danger onClick={() => (close(), onDelete())}>
            Delete
          </MenuItem>
        </>
      )}
    </Popover>
  );
}

/** Avatar + first name of the dispatcher on a load ("You" for the signed-in user). */
function DispatcherTag({ id }: { id: string | null }) {
  const { memberName, me } = useStore();
  if (!id) return <span className="text-xs text-fg-4">—</span>;
  const name = memberName(id);
  return (
    <span className="flex min-w-0 items-center gap-2" title={name}>
      <MemberAvatar id={id} name={name} className="h-6 w-6 text-[10px]" />
      <span className="truncate text-[13px] text-fg-2">{id === me.id ? "You" : name.split(/\s+/)[0]}</span>
    </span>
  );
}
