"use client";

import Link from "next/link";
import { useMemo } from "react";
import { AlertTriangle, ArrowRight, ArrowUpRight, Building2, CalendarClock, FileWarning, Plus, Truck as TruckIcon } from "lucide-react";
import { ButtonLink } from "@/components/ui/Button";
import { Card, CardHeader, Empty, Page, Pill, Stat } from "@/components/ui/Bits";
import { StatusPill } from "@/components/loads/StatusMenu";
import { BarChart } from "@/components/analytics/Charts";
import { useStore } from "@/lib/store";
import { series } from "@/lib/analytics";
import { balance, payState } from "@/lib/invoice";
import { availability } from "@/lib/pitch";
import { addDays, cn, daysUntil, fmtDay, isCanceled, lane, money, moneyShort, num, today } from "@/lib/format";
import { checklist, fleetPaperwork, problems, shortName } from "@/lib/docs";
import type { Load, Truck } from "@/lib/types";

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export default function Dashboard() {
  const { me, loads, trucks, trailers, drivers, documents, docTypes, invoices, companies, inScope, scopedCompany, driverById, truckById, companyById } = useStore();
  const t = today();
  const month = t.slice(0, 7);

  const L = useMemo(() => loads.filter((l) => inScope(l.company_id)), [loads, inScope]);
  const T = useMemo(() => trucks.filter((x) => inScope(x.company_id)), [trucks, inScope]);

  const k = useMemo(() => {
    const m = L.filter((l) => !isCanceled(l.status) && (l.delivery_date || l.pickup_date || "").startsWith(month));
    const gross = m.reduce((s, l) => s + l.gross_amount, 0);
    const fee = m.reduce((s, l) => s + l.dispatcher_cut, 0);
    const paidFee = m.filter((l) => l.status === "paid").reduce((s, l) => s + l.dispatcher_cut, 0);
    const lm = new Date();
    lm.setMonth(lm.getMonth() - 1);
    const lmKey = `${lm.getFullYear()}-${String(lm.getMonth() + 1).padStart(2, "0")}`;
    const dayOfMonth = new Date().getDate();
    const lastSame = L.filter((l) => {
      const d = l.delivery_date || l.pickup_date || "";
      return !isCanceled(l.status) && d.startsWith(lmKey) && Number(d.slice(8, 10)) <= dayOfMonth;
    }).reduce((s, l) => s + l.gross_amount, 0);
    const transit = L.filter((l) => l.status === "in_transit").length;
    const booked = L.filter((l) => l.status === "booked" || l.status === "new").length;
    const delivered = L.filter((l) => l.status === "delivered");
    return {
      gross,
      fee,
      paidFee,
      count: m.length,
      change: lastSame ? ((gross - lastSame) / lastSame) * 100 : null,
      transit,
      booked,
      ready: delivered.length,
      readyFee: delivered.reduce((s, l) => s + l.dispatcher_cut, 0),
    };
  }, [L, month]);

  // Today's stops
  const todayStops = useMemo(() => {
    const out: { load: Load; i: number; type: "pickup" | "delivery"; time: string; place: string }[] = [];
    for (const l of L) {
      if (isCanceled(l.status)) continue;
      l.stops.forEach((s, i) => {
        if (s.date === t && s.status !== "completed") out.push({ load: l, i, type: s.type, time: s.time || s.appointment || "", place: `${s.city}, ${s.state}` });
      });
      if (!l.stops.length) {
        if (l.pickup_date === t) out.push({ load: l, i: 0, type: "pickup", time: "", place: `${l.origin_city}, ${l.origin_state}` });
        if (l.delivery_date === t) out.push({ load: l, i: 1, type: "delivery", time: "", place: `${l.destination_city}, ${l.destination_state}` });
      }
    }
    return out.sort((a, b) => a.time.localeCompare(b.time));
  }, [L, t]);

  // Fleet board
  const board = useMemo(() => {
    const rank = { in_transit: 0, booked: 1, available: 2, oos: 3 } as const;
    return T.filter((x) => x.status !== "inactive")
      .map((tr) => {
        const mine = L.filter((l) => l.truck_id === tr.id && ["new", "booked", "in_transit"].includes(l.status)).sort((a, b) => (a.pickup_date || "").localeCompare(b.pickup_date || ""));
        const cur = mine.find((l) => l.status === "in_transit") || mine[0];
        const state: keyof typeof rank = tr.status === "out_of_service" ? "oos" : cur ? (cur.status === "in_transit" ? "in_transit" : "booked") : "available";
        return { tr, cur, next: mine.find((l) => l !== cur), state };
      })
      .sort((a, b) => rank[a.state] - rank[b.state]);
  }, [T, L]);
  const needLoad = board.filter((b) => b.state === "available").length;

  // Attention
  const alerts = useMemo(() => {
    const out: { key: string; icon: typeof AlertTriangle; text: string; href: string; tone: "red" | "amber" }[] = [];
    const scopedInvoices = invoices.filter((i) => !i.company_id || inScope(i.company_id));
    for (const i of scopedInvoices.filter((i) => payState(i) === "overdue"))
      out.push({ key: `inv${i.id}`, icon: FileWarning, text: `${i.invoice_number} · ${i.bill_to_name} · ${money(balance(i))} overdue since ${fmtDay(i.due_date)}`, href: `/invoices/${i.id}`, tone: "red" });
    // Loads on the road or waiting to be paid that are missing required paperwork (BOL, POD…).
    let shownLoads = 0;
    for (const l of L.filter((l) => ["in_transit", "delivered", "invoiced"].includes(l.status))) {
      const miss = problems(checklist(docTypes, documents, { scope: "load", id: l.id, companyId: l.company_id, status: l.status }));
      if (!miss.length || shownLoads++ >= 6) continue;
      const names = miss.map((i) => shortName(i.type)).join(", ");
      out.push({ key: `ldoc${l.id}`, icon: FileWarning, text: `${names} missing · ${lane(l)}`, href: `/loads/${l.id}`, tone: l.status === "in_transit" ? "amber" : "red" });
    }
    for (const l of L.filter((l) => ["new", "booked"].includes(l.status) && !l.driver_id && l.pickup_date && l.pickup_date <= addDays(t, 2)))
      out.push({ key: `drv${l.id}`, icon: TruckIcon, text: `No driver · picks up ${fmtDay(l.pickup_date)} · ${lane(l)}`, href: `/loads/${l.id}`, tone: "red" });
    // Carrier, driver and truck paperwork: expired / expiring files one by one,
    // missing required files grouped per carrier.
    const holders = fleetPaperwork({ companies, drivers, trucks, trailers, documents, docTypes }, inScope);
    const missingBy = new Map<string, number>();
    for (const h of holders) {
      for (const i of [...h.bad, ...h.soon]) {
        if (i.state === "missing") {
          missingBy.set(h.companyId, (missingBy.get(h.companyId) || 0) + 1);
          continue;
        }
        if (i.state === "no_date") continue;
        const n = daysUntil(i.doc?.expires_on) ?? 0;
        out.push({
          key: `exp${h.scope}${h.id}${i.type.key}`,
          icon: CalendarClock,
          text: `${h.name}: ${i.type.name} ${n < 0 ? "expired" : `expires in ${n}d`}`,
          href: h.href,
          tone: n < 0 ? "red" : "amber",
        });
      }
    }
    // CDL / medical dates typed on the driver (no file with a date on record).
    for (const d of drivers.filter((d) => inScope(d.company_id) && d.status === "active")) {
      for (const [key, label, date] of [
        ["cdl", "CDL", d.cdl_expiry],
        ["medical_card", "Medical card", d.medical_card_expiry],
      ] as const) {
        const covered = holders.some((h) => h.scope === "driver" && h.id === d.id && h.items.some((i) => i.type.key === key && i.doc?.expires_on));
        const n = daysUntil(date);
        if (!covered && n !== null && n <= 30)
          out.push({ key: `${key}${d.id}`, icon: CalendarClock, text: `${d.name}: ${label} ${n < 0 ? "expired" : `expires in ${n}d`}`, href: `/fleet?company=${d.company_id}&tab=drivers&driver=${d.id}`, tone: n < 0 ? "red" : "amber" });
      }
    }
    for (const [cid, n] of missingBy)
      out.push({ key: `miss${cid}`, icon: FileWarning, text: `${companyById(cid)?.name}: ${n} required document${n === 1 ? "" : "s"} missing`, href: `/fleet?company=${cid}&tab=docs`, tone: "amber" });
    return out;
  }, [L, invoices, documents, docTypes, companies, drivers, trucks, trailers, inScope, companyById, t]);

  const weeks = useMemo(() => series(L.filter((l) => !isCanceled(l.status)), { from: addDays(t, -7 * 11 - ((new Date().getDay() + 6) % 7)), to: t }, "week"), [L, t]);
  const recent = useMemo(() => [...L].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 6), [L]);

  if (!companies.length) {
    return (
      <Page>
        <h1 className="mb-5 text-[22px] font-bold text-fg sm:text-[26px]">
          {greeting()}, {me.fullName.split(" ")[0]}
        </h1>
        <Card>
          <Empty
            icon={Building2}
            title="Welcome to TOSS Cloud"
            body="Start by adding a carrier you dispatch for. Then add its trucks and drivers and book loads from rate confirmations."
            action={
              <ButtonLink href="/fleet?new=company" variant="primary">
                <Plus className="h-4 w-4" /> Add carrier company
              </ButtonLink>
            }
          />
        </Card>
      </Page>
    );
  }

  const paidPct = k.fee ? Math.round((k.paidFee / k.fee) * 100) : 0;

  return (
    <Page>
      <div className="mb-5 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-3">
            {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })} · {scopedCompany ? scopedCompany.name : "All companies"}
          </div>
          <h1 className="text-[22px] font-bold leading-tight text-fg sm:text-[26px]">
            {greeting()}, {me.fullName.split(" ")[0]}
          </h1>
        </div>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Gross this month"
          value={money(k.gross, { cents: false })}
          sub={
            k.change === null ? (
              `${k.count} loads`
            ) : (
              <span>
                {k.count} loads ·{" "}
                <span className={k.change >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}>
                  {k.change >= 0 ? "+" : ""}
                  {k.change.toFixed(0)}%
                </span>{" "}
                vs last month
              </span>
            )
          }
        />
        <Stat label="TOSS fee this month" value={money(k.fee, { cents: false })} sub={`${money(k.paidFee, { cents: false })} paid · ${paidPct}%`}>
          <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full rounded-full bg-emerald-500" style={{ width: `${paidPct}%` }} />
          </div>
        </Stat>
        <Link href="/loads?status=active" className="block">
          <Stat label="On the road" value={num(k.transit + k.booked)} sub={`${k.transit} in transit · ${k.booked} booked`} className="h-full transition-colors hover:border-line-strong" />
        </Link>
        <Link href="/invoices" className="block">
          <Stat label="Ready to bill" value={money(k.readyFee, { cents: false })} sub={`${k.ready} delivered load${k.ready === 1 ? "" : "s"}`} className="h-full transition-colors hover:border-line-strong" />
        </Link>
      </div>

      <div className="mb-5 grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
        {/* Fleet board */}
        <Card>
          <CardHeader
            title="Fleet board"
            subtitle={needLoad ? `${needLoad} truck${needLoad === 1 ? "" : "s"} need a load` : "Every active truck has work"}
            actions={
              <Link href="/fleet" className="inline-flex items-center gap-1 text-xs font-medium text-fg-3 hover:text-fg">
                Fleet <ArrowRight className="h-3 w-3" />
              </Link>
            }
          />
          {board.length === 0 ? (
            <Empty icon={TruckIcon} title="No trucks yet" body="Add trucks under Fleet & Company." className="py-10" />
          ) : (
            <div className="max-h-[420px] overflow-y-auto">
              <table className="w-full text-left text-[13px]">
                <tbody className="divide-y divide-line">
                  {board.map(({ tr, cur, next, state }) => (
                    <BoardRow key={tr.id} tr={tr} cur={cur} next={next} state={state} driver={driverById(tr.assigned_driver_id)?.name} company={scopedCompany ? null : companyById(tr.company_id)?.name} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* Today */}
        <Card>
          <CardHeader title="Today" subtitle={`${todayStops.filter((s) => s.type === "pickup").length} pickups · ${todayStops.filter((s) => s.type === "delivery").length} deliveries`} />
          {todayStops.length === 0 ? (
            <div className="px-5 py-10 text-center text-[13px] text-fg-4">No pickups or deliveries scheduled today.</div>
          ) : (
            <ul className="max-h-[420px] divide-y divide-line overflow-y-auto">
              {todayStops.map((s) => (
                <li key={`${s.load.id}-${s.i}`}>
                  <Link href={`/loads/${s.load.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-2/60 sm:px-5">
                    <span
                      className={cn(
                        "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold",
                        s.type === "pickup" ? "bg-inverse text-inverse-fg" : "bg-brand text-brand-fg",
                      )}
                    >
                      {s.type === "pickup" ? "PU" : "DEL"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium text-fg">{s.place}</div>
                      <div className="truncate text-xs text-fg-3">
                        {driverById(s.load.driver_id)?.name || "No driver"}
                        {truckById(s.load.truck_id) ? ` · #${truckById(s.load.truck_id)!.unit_number}` : ""}
                      </div>
                    </div>
                    <span className="tnum shrink-0 text-xs font-semibold text-fg-2">{s.time || "—"}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="mb-5 grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
        <Card>
          <CardHeader
            title="Gross revenue"
            subtitle="Last 12 weeks"
            actions={
              <Link href="/analytics" className="inline-flex items-center gap-1 text-xs font-medium text-fg-3 hover:text-fg">
                Analytics <ArrowUpRight className="h-3 w-3" />
              </Link>
            }
          />
          <div className="p-4 sm:p-5">
            <BarChart data={weeks.map((w) => ({ label: w.label, value: w.gross, sub: `${w.loads} loads · ${money(w.fee, { cents: false })} fee` }))} format={moneyShort} height={200} />
          </div>
        </Card>
        <Card>
          <CardHeader title="Needs attention" subtitle={alerts.length ? `${alerts.length} item${alerts.length === 1 ? "" : "s"}` : "All clear"} />
          {alerts.length === 0 ? (
            <div className="px-5 py-10 text-center text-[13px] text-fg-4">Nothing overdue, missing or expiring.</div>
          ) : (
            <ul className="max-h-[300px] divide-y divide-line overflow-y-auto">
              {alerts.map((a) => (
                <li key={a.key}>
                  <Link href={a.href} className="flex items-start gap-2.5 px-4 py-2.5 hover:bg-surface-2/60 sm:px-5">
                    <a.icon className={cn("mt-0.5 h-4 w-4 shrink-0", a.tone === "red" ? "text-red-500" : "text-amber-500")} />
                    <span className="text-[13px] leading-snug text-fg-2">{a.text}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Recently added loads"
          actions={
            <Link href="/loads" className="inline-flex items-center gap-1 text-xs font-medium text-fg-3 hover:text-fg">
              All loads <ArrowRight className="h-3 w-3" />
            </Link>
          }
        />
        {recent.length === 0 ? (
          <Empty icon={TruckIcon} title="No loads yet" action={<ButtonLink href="/loads/new" variant="primary">Book a load</ButtonLink>} className="py-10" />
        ) : (
          <ul className="divide-y divide-line">
            {recent.map((l) => (
              <li key={l.id}>
                <Link href={`/loads/${l.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2/60 sm:px-5">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-medium text-fg">{lane(l)}</div>
                    <div className="truncate text-xs text-fg-3">
                      {l.load_number ? `#${l.load_number} · ` : ""}
                      {l.broker_name || "No broker"} · {fmtDay(l.pickup_date)}
                      {!scopedCompany && ` · ${companyById(l.company_id)?.name || ""}`}
                    </div>
                  </div>
                  <span className="tnum hidden text-[13px] font-semibold text-fg sm:block">{money(l.gross_amount, { cents: false })}</span>
                  <StatusPill status={l.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </Page>
  );
}

function BoardRow({
  tr,
  cur,
  next,
  state,
  driver,
  company,
}: {
  tr: Truck;
  cur?: Load;
  next?: Load;
  state: "in_transit" | "booked" | "available" | "oos";
  driver?: string;
  company?: string | null;
}) {
  const pill = {
    in_transit: ["In transit", "bg-blue-500/10 text-blue-700 ring-blue-600/20 dark:text-blue-300"],
    booked: ["Booked", "bg-zinc-500/10 text-zinc-700 ring-zinc-600/20 dark:text-zinc-300"],
    available: ["Needs load", "bg-brand/15 text-fg ring-brand/40"],
    oos: ["Out of service", "bg-red-500/10 text-red-700 ring-red-600/20 dark:text-red-300"],
  }[state];
  return (
    <tr className="hover:bg-surface-2/50">
      <td className="py-2.5 pl-4 pr-2 sm:pl-5">
        <Link href={`/fleet?tab=trucks&truck=${tr.id}`} className="block">
          <div className="font-semibold text-fg">#{tr.unit_number}</div>
          <div className="max-w-[140px] truncate text-xs text-fg-3">{driver || "No driver"}</div>
        </Link>
      </td>
      <td className="px-2 py-2.5">
        <Pill className={pill[1]}>{pill[0]}</Pill>
      </td>
      <td className="min-w-0 px-2 py-2.5">
        {cur ? (
          <Link href={`/loads/${cur.id}`} className="block min-w-0 hover:underline">
            <div className="max-w-[260px] truncate text-fg">{lane(cur)}</div>
            <div className="text-xs text-fg-3">
              {cur.status === "in_transit" ? `Delivers ${fmtDay(cur.delivery_date)}` : `Picks up ${fmtDay(cur.pickup_date)}`}
              {next ? ` · then ${next.destination_city}, ${next.destination_state}` : ""}
            </div>
          </Link>
        ) : (
          <div>
            <div className="max-w-[260px] truncate text-fg-2">{tr.current_location || "Location not set"}</div>
            <div className="text-xs text-fg-3">{availability(tr)}{company ? ` · ${company}` : ""}</div>
          </div>
        )}
      </td>
      <td className="hidden py-2.5 pl-2 pr-4 text-right text-xs text-fg-3 sm:table-cell sm:pr-5">{[tr.trailer_length, tr.trailer_type].filter(Boolean).join(" ")}</td>
    </tr>
  );
}
