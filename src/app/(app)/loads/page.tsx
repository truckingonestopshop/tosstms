"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  CalendarDays,
  Columns3,
  Download,
  FileCheck2,
  List,
  MoreHorizontal,
  Pencil,
  Plus,
  Printer,
  Search,
  Trash2,
  Truck as TruckIcon,
  X,
  Copy,
} from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Checkbox, Input, Segmented, Select } from "@/components/ui/Field";
import { Avatar, Card, Empty, Page, PageHeader, Stat } from "@/components/ui/Bits";
import { Popover, MenuItem, MenuLabel, MenuSep } from "@/components/ui/Menu";
import { confirmDialog } from "@/components/ui/Confirm";
import { StatusMenu, StatusPill } from "@/components/loads/StatusMenu";
import { LoadsBoard } from "@/components/loads/LoadsBoard";
import { LoadsCalendar } from "@/components/loads/LoadsCalendar";
import { useStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import { downloadCsv } from "@/lib/csv";
import { STATUS, STATUS_ORDER, addDays, cn, fmtDay, isCanceled, lane, money, num, rpm, today, totalMiles } from "@/lib/format";
import type { Load, LoadStatus } from "@/lib/types";

type View = "list" | "board" | "calendar";
type StatusTab = "all" | "active" | LoadStatus | "canceled";
type Range = "all" | "today" | "week" | "30d" | "month" | "last_month";

const PAGE = 25;

export default function LoadsPage() {
  return (
    <Suspense>
      <Loads />
    </Suspense>
  );
}

function inRange(l: Load, r: Range) {
  if (r === "all") return true;
  const d = l.pickup_date || l.delivery_date;
  if (!d) return false;
  const t = today();
  if (r === "today") return l.pickup_date === t || l.delivery_date === t;
  if (r === "week") return d >= addDays(t, -7) && d <= addDays(t, 7);
  if (r === "30d") return d >= addDays(t, -30);
  if (r === "month") return d.slice(0, 7) === t.slice(0, 7);
  const lm = new Date();
  lm.setMonth(lm.getMonth() - 1);
  return d.slice(0, 7) === `${lm.getFullYear()}-${String(lm.getMonth() + 1).padStart(2, "0")}`;
}

function Loads() {
  const params = useSearchParams();
  const router = useRouter();
  const { loads, inScope, scopedCompany, drivers, trucks, driverById, truckById, companyById, documents, setLoadStatus, deleteLoads, duplicateLoad, scope, members, memberName, me } = useStore();

  const [view, setViewState] = useState<View>((params.get("view") as View) || "list");
  const [tab, setTab] = useState<StatusTab>((params.get("status") as StatusTab) || "all");
  const [q, setQ] = useState("");
  const [driver, setDriver] = useState("all");
  const [truck, setTruck] = useState("all");
  // "all", "me" (my loads) or a member's user id
  const [dispatcher, setDispatcher] = useState((params.get("dispatcher") as string) || "all");
  const [range, setRange] = useState<Range>("all");
  const [sort, setSort] = useState<"pickup_desc" | "pickup_asc" | "gross_desc" | "created_desc">("pickup_desc");
  const [page, setPage] = useState(1);
  const [sel, setSel] = useState<Set<string>>(new Set());

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

  // Everything except the status tab (so tab counts reflect the other filters).
  const base = useMemo(() => {
    const s = q.trim().toLowerCase();
    return scoped.filter((l) => {
      if (driver !== "all" && l.driver_id !== driver) return false;
      if (truck !== "all" && l.truck_id !== truck) return false;
      if (dispatcher !== "all" && l.dispatcher_id !== (dispatcher === "me" ? me.id : dispatcher)) return false;
      if (!inRange(l, range)) return false;
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
  }, [scoped, q, driver, truck, dispatcher, range, driverById, truckById, companyById, memberName, me.id]);

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
    const out = base.filter((l) =>
      tab === "all" ? true : tab === "active" ? ["new", "booked", "in_transit"].includes(l.status) : tab === "canceled" ? isCanceled(l.status) : l.status === tab,
    );
    const cmp: Record<typeof sort, (a: Load, b: Load) => number> = {
      pickup_desc: (a, b) => (b.pickup_date || "").localeCompare(a.pickup_date || "") || b.created_at.localeCompare(a.created_at),
      pickup_asc: (a, b) => (a.pickup_date || "9").localeCompare(b.pickup_date || "9"),
      gross_desc: (a, b) => b.gross_amount - a.gross_amount,
      created_desc: (a, b) => b.created_at.localeCompare(a.created_at),
    };
    return out.sort(cmp[sort]);
  }, [base, tab, sort]);

  useEffect(() => {
    setPage(1);
    setSel(new Set());
  }, [tab, q, driver, truck, range, scope]);

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
    return { count: live.length, gross, fee, loaded, miles, rpm: loaded ? gross / loaded : 0, allIn: miles ? gross / miles : 0 };
  }, [filtered]);

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

  const scopedDrivers = drivers.filter((d) => inScope(d.company_id));
  const scopedTrucks = trucks.filter((t) => inScope(t.company_id));
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

  return (
    <Page>
      <PageHeader
        eyebrow={scopedCompany ? scopedCompany.name : "All companies"}
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
          </>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Loads" value={num(stats.count)} sub={`${counts.in_transit || 0} in transit · ${counts.booked || 0} booked`} />
        <Stat label="Gross" value={money(stats.gross, { cents: false })} sub={`${money(stats.fee)} TOSS fee`} />
        <Stat label="Avg RPM" value={stats.rpm ? `$${stats.rpm.toFixed(2)}` : "—"} sub={stats.allIn ? `$${stats.allIn.toFixed(2)} all-in` : "Loaded miles"} />
        <Stat label="Miles" value={num(stats.miles)} sub={`${num(stats.loaded)} loaded · ${num(stats.miles - stats.loaded)} DH`} />
      </div>

      {/* Filters */}
      <div className="mb-3 flex flex-col gap-2 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-4" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Load #, rate con, broker, city, driver, unit…" className="pl-9" />
          {q && (
            <button onClick={() => setQ("")} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-fg-4 hover:text-fg" aria-label="Clear search">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5 lg:flex">
          <Select value={driver} onChange={(e) => setDriver(e.target.value)} className="lg:w-40">
            <option value="all">All drivers</option>
            {scopedDrivers.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
          <Select value={truck} onChange={(e) => setTruck(e.target.value)} className="lg:w-32">
            <option value="all">All trucks</option>
            {scopedTrucks.map((t) => (
              <option key={t.id} value={t.id}>
                Unit {t.unit_number}
              </option>
            ))}
          </Select>
          <Select value={dispatcher} onChange={(e) => setDispatcher(e.target.value)} className="lg:w-40" aria-label="Dispatcher">
            <option value="all">All dispatchers</option>
            <option value="me">My loads</option>
            {members
              .filter((m) => m.user_id !== me.id)
              .map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {m.full_name || m.email}
                </option>
              ))}
          </Select>
          <Select value={range} onChange={(e) => setRange(e.target.value as Range)} className="lg:w-36">
            <option value="all">Any date</option>
            <option value="today">Today</option>
            <option value="week">This week ±7d</option>
            <option value="30d">Last 30 days</option>
            <option value="month">This month</option>
            <option value="last_month">Last month</option>
          </Select>
          <Select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="lg:w-40">
            <option value="pickup_desc">Newest pickup</option>
            <option value="pickup_asc">Oldest pickup</option>
            <option value="gross_desc">Highest rate</option>
            <option value="created_desc">Recently added</option>
          </Select>
        </div>
      </div>

      {view !== "board" && (
        <div className="scrollbar-none -mx-4 mb-4 flex gap-1 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          {TABS.map((t) => (
            <button
              key={t.v}
              onClick={() => setTab(t.v)}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors",
                tab === t.v ? "bg-inverse text-inverse-fg" : "text-fg-3 hover:bg-surface-2 hover:text-fg",
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
        <LoadsBoard loads={base} />
      ) : view === "calendar" ? (
        <LoadsCalendar loads={filtered} />
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
                        onChange={(v) => setSel((s) => {
                          const n = new Set(s);
                          rows.forEach((r) => (v ? n.add(r.id) : n.delete(r.id)));
                          return n;
                        })}
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
                        onClick={() => router.push(`/loads/${l.id}`)}
                        className={cn("group cursor-pointer transition-colors hover:bg-surface-2/60", sel.has(l.id) && "bg-brand/5")}
                      >
                        <td className="py-3 pl-4" onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={sel.has(l.id)}
                            onChange={(v) => setSel((s) => {
                              const n = new Set(s);
                              if (v) n.add(l.id);
                              else n.delete(l.id);
                              return n;
                            })}
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
                            {hasDocs(l.id, "rate_confirmation") && <span title="Rate con on file"><FileCheck2 className="h-3 w-3 text-fg-4" /></span>}
                            {["delivered", "invoiced"].includes(l.status) && !hasDocs(l.id, "pod") && <span className="text-amber-600 dark:text-amber-400">POD missing</span>}
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
                <Link key={l.id} href={`/loads/${l.id}`} className="block rounded-xl border border-line bg-surface p-3.5 active:bg-surface-2">
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
                </Link>
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
    </Page>
  );
}

function RowMenu({ onEdit, onDuplicate, onDelete }: { onEdit: () => void; onDuplicate: () => void; onDelete: () => void }) {
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
      <Avatar name={name} className="h-6 w-6 text-[10px]" />
      <span className="truncate text-[13px] text-fg-2">{id === me.id ? "You" : name.split(/\s+/)[0]}</span>
    </span>
  );
}
