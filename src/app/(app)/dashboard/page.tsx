"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Briefcase,
  Building2,
  CalendarClock,
  FileWarning,
  Headset,
  Route,
  Target,
  TrendingUp,
  Truck as TruckIcon,
  Wallet,
} from "lucide-react";
import { Card, Page, PageHeader } from "@/components/ui/Bits";
import { Segmented } from "@/components/ui/Field";
import { BarChart } from "@/components/analytics/Charts";
import { BarRow, Kpi, Mini, Panel, amber, green, red } from "@/components/dashboard/Widgets";
import { sb } from "@/lib/db";
import { useLiveTable } from "@/lib/live";
import { useStore } from "@/lib/store";
import { addDays, cn, isCanceled, money, moneyShort, num, today } from "@/lib/format";
import { SERVICES, serviceLabel } from "@/lib/services";
import { billingTotals, invoiceOpen, monthly, runningSub, type Charge, type ChargeService } from "@/lib/billing";
import { isOpen, type Agreement, type OppTask, type Opportunity, type Pipeline, type Stage } from "@/lib/sales";
import { PRIORITIES, type Case } from "@/lib/cases";
import { useOptions } from "@/components/ui/OptionList";
import { muteActive, ownDocItems, pendingItems, useMutes } from "@/lib/pending";
import { payState } from "@/lib/invoice";
import { loadDay, series } from "@/lib/analytics";
import { PERIODS, inRange, lastMonths, ranges, revenue, weeksIn, type Period } from "@/lib/dashboard";
import type { ServiceKey } from "@/lib/types";

// Dashboard: every area at a glance. Key numbers with the change vs the period before, TOSS revenue
// over the last 6 months, a panel per area (Sales, Dispatch, Clients, Subscriptions, Cases &
// Customer service) and what needs attention now. Each part opens its section. Follows the carrier
// picked at the top (or all companies).

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

const svcLabel = (s: ChargeService) => (s === "other" ? "Other" : serviceLabel(s as ServiceKey));

export default function DashboardPage() {
  const { me, scope, scopedCompany, inScope, companies, loads, trucks, drivers, trailers, documents, docTypes, invoices, payments, companyById, memberName } = useStore();
  const opps = useLiveTable<Opportunity>("tms_opportunities");
  const pipes = useLiveTable<Pipeline>("tms_pipelines", { order: "sort", ascending: true }).rows;
  const stageRows = useLiveTable<Stage>("tms_pipeline_stages", { order: "sort", ascending: true }).rows;
  const oppTasks = useLiveTable<OppTask>("tms_opportunity_tasks", { filter: { done: "false" } }).rows;
  const sentAgreements = useLiveTable<Agreement>("tms_agreements", { filter: { status: "sent" } }).rows;
  const cases = useLiveTable<Case>("tms_cases");
  const { mutes } = useMutes();
  const [charges, setCharges] = useState<Charge[]>([]);
  const [period, setPeriod] = useState<Period>("month");
  const t = today();
  const { cur, prev } = ranges(period, t);

  useEffect(() => {
    let alive = true;
    let q = sb().from("tms_charges").select("*");
    if (scope !== "all") q = q.eq("company_id", scope);
    q.then(({ data }) => alive && setCharges(((data || []) as Charge[]).map((c) => ({ ...c, amount: Number(c.amount) || 0 }))));
    return () => {
      alive = false;
    };
  }, [scope]);

  // ---- data in view ------------------------------------------------------------------------------
  const co = companies.filter((c) => inScope(c.id));
  const L = loads.filter((l) => inScope(l.company_id));
  const inv = invoices.filter((i) => !i.company_id || inScope(i.company_id));
  const invIds = new Set(inv.map((i) => i.id));
  const pay = payments.filter((p) => invIds.has(p.invoice_id));
  const op = opps.rows.filter((o) => inScope(o.company_id));
  const cs = cases.rows.filter((c) => !c.company_id || inScope(c.company_id));

  // ---- money --------------------------------------------------------------------------------------
  const rev = revenue(L, charges, pay, cur);
  const revPrev = revenue(L, charges, pay, prev);
  const billing = billingTotals(charges, inv, pay, t);
  const subs = charges.filter((c) => runningSub(c, t));
  const months = lastMonths(6, t).map((m) => ({ ...m, money: revenue(L, charges, pay, m) }));

  // ---- sales & clients ------------------------------------------------------------------------------
  const openOpps = op.filter(isOpen);
  const pipeline = openOpps.reduce((s, o) => s + Number(o.value), 0);
  const closedIn = (r: typeof cur) => op.filter((o) => (o.status === "won" || o.status === "lost") && inRange(o.closed_at, r));
  const wonIn = (r: typeof cur) => closedIn(r).filter((o) => o.status === "won");
  // Stages of the main pipeline (the first active one).
  const mainPipe = pipes.find((p) => p.active) || pipes[0];
  const mainStages = stageRows.filter((s) => s.pipeline_id === mainPipe?.id).sort((a, b) => a.sort - b.sort);
  const won = wonIn(cur);
  const wonV = won.reduce((s, o) => s + Number(o.value), 0);
  const wonPrevV = wonIn(prev).reduce((s, o) => s + Number(o.value), 0);
  const winRate = closedIn(cur).length ? Math.round((won.length / closedIn(cur).length) * 100) : null;
  const newClients = (r: typeof cur) => co.filter((c) => c.stage !== "lead" && inRange(c.became_client_at, r)).length;
  const newLeads = (r: typeof cur) => co.filter((c) => inRange(c.created_at, r) && (c.stage === "lead" || (c.became_client_at && c.became_client_at.slice(0, 10) > c.created_at.slice(0, 10)))).length;
  const clients = co.filter((c) => c.stage !== "lead" && c.status !== "inactive");
  const leads = co.filter((c) => c.stage === "lead");
  const staleLeads = leads.filter((c) => c.created_at.slice(0, 10) < addDays(t, -30));

  // ---- dispatch -----------------------------------------------------------------------------------------
  const live = L.filter((l) => !isCanceled(l.status));
  const inCur = live.filter((l) => inRange(loadDay(l), cur));
  const inPrev = live.filter((l) => inRange(loadDay(l), prev));
  const gross = inCur.reduce((s, l) => s + l.gross_amount, 0);
  const grossPrev = inPrev.reduce((s, l) => s + l.gross_amount, 0);
  const loaded = inCur.reduce((s, l) => s + (Number(l.loaded_miles) || 0), 0);
  const activeLoads = live.filter((l) => ["new", "booked", "in_transit"].includes(l.status));
  const T = trucks.filter((x) => inScope(x.company_id) && x.status === "active");
  const busy = new Set(activeLoads.map((l) => l.truck_id).filter(Boolean));
  const perTruckWeek = T.length ? gross / T.length / weeksIn(cur) : 0;
  const weekly = series(live, { from: addDays(t, -7 * 9), to: t }, "week");

  // ---- cases ------------------------------------------------------------------------------------------------
  const work = cs.filter((c) => c.kind === "work");
  const service = cs.filter((c) => c.kind === "customer_service");
  const csCats = useOptions("case_cs");
  const open = (l: Case[]) => l.filter((c) => c.status !== "closed");
  const closedCases = cs.filter((c) => inRange(c.closed_at, cur));
  const avgClose = closedCases.length ? closedCases.reduce((s, c) => s + (new Date(c.closed_at!).getTime() - new Date(c.created_at).getTime()) / 86400000, 0) / closedCases.length : null;
  const overdueCases = open(cs).filter((c) => c.due_date && c.due_date < t);

  // ---- needs attention ----------------------------------------------------------------------------------
  const ownDocs = useLiveTable<{ id: string; name: string; folder: string; expires_on: string | null }>("tms_own_documents").rows;
  const pending = useMemo(() => {
    const muted = new Set(mutes.filter(muteActive).map((m) => m.key));
    return [...pendingItems({ companies, drivers, trucks, trailers, documents, docTypes, loads }, inScope), ...(scopedCompany ? [] : ownDocItems(ownDocs))].filter((i) => !muted.has(i.key));
  }, [companies, drivers, trucks, trailers, documents, docTypes, loads, inScope, mutes, scopedCompany, ownDocs]);
  const overdueInv = inv.filter((i) => payState(i) === "overdue");
  const unpaid = charges.filter((c) => c.kind === "one_time" && c.status === "unpaid");
  const lateOpps = openOpps.filter((o) => o.expected_close && o.expected_close < t);
  const closingSoon = openOpps.filter((o) => o.expected_close && o.expected_close >= t && o.expected_close <= addDays(t, 7));
  const noDriver = activeLoads.filter((l) => ["new", "booked"].includes(l.status) && !l.driver_id && l.pickup_date && l.pickup_date <= addDays(t, 2));
  const csWaiting = open(service).filter((c) => c.created_at.slice(0, 10) <= addDays(t, -3));

  type Alert = { key: string; icon: typeof AlertTriangle; text: string; sub?: string; href: string; tone: "red" | "amber" | "blue" };
  const attention: Alert[] = [];
  if (overdueInv.length) attention.push({ key: "inv", icon: FileWarning, text: `${overdueInv.length} overdue invoice${overdueInv.length > 1 ? "s" : ""}`, sub: money(overdueInv.reduce((s, i) => s + invoiceOpen(i), 0)), href: "/invoices", tone: "red" });
  for (const c of overdueCases.slice(0, 4)) attention.push({ key: `case${c.id}`, icon: Briefcase, text: `Case #${c.number} overdue: ${c.title}`, sub: companyById(c.company_id)?.name, href: `/${c.kind === "work" ? "cases" : "customer-service"}?case=${c.id}`, tone: "red" });
  for (const l of noDriver.slice(0, 3)) attention.push({ key: `nd${l.id}`, icon: TruckIcon, text: `No driver · picks up ${l.pickup_date}`, sub: `${l.origin_city}, ${l.origin_state} → ${l.destination_city}, ${l.destination_state}`, href: `/loads/${l.id}`, tone: "red" });
  const expired = pending.filter((i) => i.state === "expired").length;
  if (expired) attention.push({ key: "exp", icon: CalendarClock, text: `${expired} expired document${expired > 1 ? "s" : ""}`, sub: "Carriers, drivers, trucks, trailers", href: "/pending", tone: "red" });
  for (const c of open(cs).filter((c) => c.priority === "urgent").slice(0, 3)) attention.push({ key: `urg${c.id}`, icon: AlertTriangle, text: `Urgent: #${c.number} ${c.title}`, sub: companyById(c.company_id)?.name, href: `/${c.kind === "work" ? "cases" : "customer-service"}?case=${c.id}`, tone: "red" });
  if (csWaiting.length) attention.push({ key: "csw", icon: Headset, text: `${csWaiting.length} customer service case${csWaiting.length > 1 ? "s" : ""} open over 3 days`, href: "/customer-service", tone: "amber" });
  if (unpaid.length) attention.push({ key: "unp", icon: Wallet, text: `${unpaid.length} unpaid charge${unpaid.length > 1 ? "s" : ""}`, sub: money(unpaid.reduce((s, c) => s + Number(c.amount), 0)), href: "/billing", tone: "amber" });
  if (lateOpps.length) attention.push({ key: "lopp", icon: Target, text: `${lateOpps.length} opportunit${lateOpps.length > 1 ? "ies" : "y"} past expected close`, sub: money(lateOpps.reduce((s, o) => s + Number(o.value), 0), { cents: false }), href: "/sales?tab=opportunities", tone: "amber" });
  const soonDocs = pending.filter((i) => i.state === "soon").length;
  if (soonDocs) attention.push({ key: "soon", icon: CalendarClock, text: `${soonDocs} document${soonDocs > 1 ? "s" : ""} expiring within 30 days`, href: "/pending", tone: "amber" });
  if (staleLeads.length) attention.push({ key: "stale", icon: Building2, text: `${staleLeads.length} lead${staleLeads.length > 1 ? "s" : ""} waiting over 30 days`, href: "/fleet", tone: "amber" });
  const openOppIds = new Set(openOpps.map((o) => o.id));
  const dueTasks = oppTasks.filter((x) => x.due_date && x.due_date <= t && openOppIds.has(x.opportunity_id));
  if (dueTasks.length) attention.push({ key: "otask", icon: Target, text: `${dueTasks.length} sales task${dueTasks.length > 1 ? "s" : ""} due`, sub: dueTasks.slice(0, 2).map((x) => x.title).join(" · "), href: "/sales?tab=dashboard", tone: "amber" });
  const waitingSign = sentAgreements.filter((a) => !a.company_id || inScope(a.company_id));
  if (waitingSign.length) attention.push({ key: "agr", icon: FileWarning, text: `${waitingSign.length} agreement${waitingSign.length > 1 ? "s" : ""} waiting for signature`, href: "/sales?tab=templates", tone: "blue" });
  if (closingSoon.length) attention.push({ key: "cs7", icon: Target, text: `${closingSoon.length} opportunit${closingSoon.length > 1 ? "ies" : "y"} closing this week`, sub: money(closingSoon.reduce((s, o) => s + Number(o.value), 0), { cents: false }), href: "/sales?tab=opportunities", tone: "blue" });
  const idle = T.filter((x) => !busy.has(x.id)).length;
  if (idle) attention.push({ key: "idle", icon: Route, text: `${idle} truck${idle > 1 ? "s" : ""} without a load`, sub: "Find them freight", href: "/loads?view=map", tone: "blue" });

  const firstName = (me.fullName || "").split(" ")[0];
  const periodLabel = PERIODS.find((p) => p.v === period)!.label.toLowerCase();
  const maxStage = Math.max(1, ...mainStages.map((s) => openOpps.filter((o) => o.stage_id === s.id).reduce((a, o) => a + Number(o.value), 0)));
  const subsBySvc = new Map<string, number>();
  for (const c of subs) subsBySvc.set(c.service, (subsBySvc.get(c.service) || 0) + monthly(c));
  const maxSub = Math.max(1, ...subsBySvc.values());

  return (
    <Page>
      <PageHeader
        eyebrow={`${new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })} · ${scopedCompany ? scopedCompany.name : "All companies"}`}
        title={`${greeting()}${firstName ? `, ${firstName}` : ""}`}
        actions={<Segmented value={period} onChange={setPeriod} options={PERIODS.map((p) => ({ value: p.v, label: p.label }))} className="scrollbar-none overflow-x-auto" />}
      />

      {/* Key numbers, vs the period before */}
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label="TOSS revenue" value={money(rev.total, { cents: false })} cur={rev.total} prev={revPrev.total} sub={revPrev.total || revPrev.collected ? "vs previous period" : undefined} href="/billing" />
        <Kpi label="Collected" value={money(rev.collected, { cents: false })} cur={rev.collected} prev={revPrev.collected} sub={revPrev.total || revPrev.collected ? "vs previous period" : undefined} href="/billing" />
        <Kpi label="Monthly recurring" value={money(billing.recurring, { cents: false })} sub={`${subs.length} active subscriptions`} href="/billing" />
        <Kpi label="Won" value={money(wonV, { cents: false })} cur={wonV} prev={wonPrevV} sub={`${won.length} deal${won.length === 1 ? "" : "s"}`} href="/sales" />
        <Kpi label="New clients" value={num(newClients(cur))} cur={newClients(cur)} prev={newClients(prev)} sub={`${num(newLeads(cur))} new leads`} href="/fleet" />
        <Kpi label="Dispatch gross" value={money(gross, { cents: false })} cur={gross} prev={grossPrev} sub={`${inCur.length} loads`} href="/dispatch" />
      </div>

      <div className="mb-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        {/* Revenue over 6 months */}
        <Card className="xl:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3 sm:px-5">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-fg-4" />
              <span className="text-[14px] font-semibold text-fg">TOSS revenue · last 6 months</span>
            </div>
            <span className="text-xs text-fg-3">
              {periodLabel}: {money(rev.fees, { cents: false })} dispatch fees · {money(rev.subscriptions, { cents: false })} subscriptions · {money(rev.oneTime, { cents: false })} one-time
            </span>
          </div>
          <div className="p-4 sm:p-5">
            <BarChart data={months.map((m) => ({ label: m.label, value: Math.round(m.money.total), sub: `Fees ${moneyShort(m.money.fees)} · Subs ${moneyShort(m.money.subscriptions)} · One-time ${moneyShort(m.money.oneTime)}` }))} format={(v) => moneyShort(v)} height={190} />
          </div>
        </Card>

        {/* Needs attention */}
        <Card className="flex flex-col">
          <div className="flex items-center gap-2 border-b border-line px-4 py-3 sm:px-5">
            <AlertTriangle className="h-4 w-4 text-fg-4" />
            <span className="text-[14px] font-semibold text-fg">Needs attention</span>
            <span className="ml-auto text-xs text-fg-3">{attention.length}</span>
          </div>
          {attention.length === 0 ? (
            <div className="flex flex-1 items-center justify-center px-5 py-10 text-sm text-fg-4">All clear.</div>
          ) : (
            <ul className="max-h-[300px] divide-y divide-line overflow-y-auto">
              {attention.map((a) => (
                <li key={a.key}>
                  <Link href={a.href} className="flex items-start gap-2.5 px-4 py-2.5 hover:bg-surface-2/60 sm:px-5">
                    <a.icon className={cn("mt-0.5 h-4 w-4 shrink-0", a.tone === "red" ? red : a.tone === "amber" ? amber : "text-sky-600 dark:text-sky-400")} />
                    <div className="min-w-0">
                      <div className="truncate text-[13px] text-fg">{a.text}</div>
                      {a.sub && <div className="truncate text-xs text-fg-3">{a.sub}</div>}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3">
        <Panel title="Sales & opportunities" href="/sales" icon={Target}>
          <Mini
            items={[
              ["Open pipeline", money(pipeline, { cents: false })],
              ["Open opportunities", num(openOpps.length)],
              [`Won · ${periodLabel}`, money(wonV, { cents: false }), wonV ? green : undefined],
              ["Win rate", winRate == null ? "—" : `${winRate}%`],
            ]}
          />
          <div className="mt-4 space-y-2">
            {mainStages.map((s) => {
              const items = openOpps.filter((o) => o.stage_id === s.id);
              const v = items.reduce((a, o) => a + Number(o.value), 0);
              return <BarRow key={s.id} label={`${s.name} (${items.length})`} value={v} max={maxStage} right={moneyShort(v)} />;
            })}
          </div>
          {openOpps.length > 0 && (
            <ul className="mt-4 space-y-1 border-t border-line pt-3 text-[13px]">
              {[...openOpps]
                .sort((a, b) => Number(b.value) - Number(a.value))
                .slice(0, 3)
                .map((o) => (
                  <li key={o.id} className="flex justify-between gap-2">
                    <span className="min-w-0 truncate text-fg-2">
                      {o.title} <span className="text-fg-4">· {o.owner_id ? memberName(o.owner_id) : companyById(o.company_id)?.name}</span>
                    </span>
                    <span className="tnum shrink-0 text-fg">{moneyShort(Number(o.value))}</span>
                  </li>
                ))}
            </ul>
          )}
        </Panel>

        <Panel title="Dispatch" href="/dispatch" icon={Route}>
          <Mini
            items={[
              ["Active loads", num(activeLoads.length)],
              ["Trucks · busy / free", `${busy.size} / ${Math.max(0, T.length - busy.size)}`],
              [`TOSS fee · ${periodLabel}`, money(rev.fees, { cents: false })],
              ["Rate per mile", loaded ? `$${(gross / loaded).toFixed(2)}` : "—"],
              ["Gross per truck / week", perTruckWeek ? money(perTruckWeek, { cents: false }) : "—"],
              ["Loads", num(inCur.length)],
            ]}
          />
          <div className="mt-4">
            <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-wider text-fg-4">Gross per week</div>
            <BarChart data={weekly.map((w) => ({ label: w.label, value: Math.round(w.gross), sub: `${w.loads} loads` }))} format={(v) => moneyShort(v)} height={120} />
          </div>
        </Panel>

        <Panel title="Clients & leads" href="/fleet" icon={Building2}>
          <Mini
            items={[
              ["Active clients", num(clients.length)],
              ["Leads", num(leads.length)],
              [`New clients · ${periodLabel}`, num(newClients(cur)), newClients(cur) ? green : undefined],
              [`New leads · ${periodLabel}`, num(newLeads(cur))],
              ["Leads over 30 days", num(staleLeads.length), staleLeads.length ? amber : undefined],
              ["In more than one service", num(clients.filter((c) => SERVICES.filter((s) => c.services?.[s.key]?.on).length > 1).length)],
            ]}
          />
          <div className="mt-4 space-y-2">
            {SERVICES.map((s) => {
              const n = clients.filter((c) => c.services?.[s.key]?.on).length;
              return n ? <BarRow key={s.key} label={s.label} value={n} max={Math.max(1, clients.length)} right={`${n} client${n > 1 ? "s" : ""}`} /> : null;
            })}
          </div>
        </Panel>

        <Panel title="Subscriptions & billing" href="/billing" icon={Wallet}>
          <Mini
            items={[
              ["Monthly recurring", money(billing.recurring, { cents: false })],
              ["Active subscriptions", num(subs.length)],
              [`Collected · ${periodLabel}`, money(rev.collected, { cents: false })],
              ["Pending", money(billing.pending, { cents: false }), billing.pending ? amber : undefined],
              ["Overdue invoices", num(overdueInv.length), overdueInv.length ? red : undefined],
              ["Unpaid charges", num(unpaid.length), unpaid.length ? amber : undefined],
            ]}
          />
          {subsBySvc.size > 0 && (
            <div className="mt-4 space-y-2">
              {[...subsBySvc.entries()]
                .sort((a, b) => b[1] - a[1])
                .map(([s, v]) => (
                  <BarRow key={s} label={svcLabel(s as ChargeService)} value={v} max={maxSub} right={`${moneyShort(v)}/mo`} />
                ))}
            </div>
          )}
        </Panel>

        <Panel title="Cases" href="/cases" icon={Briefcase}>
          <Mini
            items={[
              ["Open", num(open(work).length)],
              ["Overdue", num(open(work).filter((c) => c.due_date && c.due_date < t).length), open(work).some((c) => c.due_date && c.due_date < t) ? red : undefined],
              [`Closed · ${periodLabel}`, num(work.filter((c) => inRange(c.closed_at, cur)).length)],
              ["Avg. days to close", avgClose == null ? "—" : avgClose.toFixed(1)],
            ]}
          />
          <div className="mt-4 space-y-2">
            {PRIORITIES.slice()
              .reverse()
              .map((p) => {
                const n = open(work).filter((c) => c.priority === p.v).length;
                return <BarRow key={p.v} label={p.label} value={n} max={Math.max(1, open(work).length)} right={num(n)} color={p.v === "urgent" ? "bg-red-500" : p.v === "high" ? "bg-amber-500" : "bg-fg-4"} />;
              })}
          </div>
        </Panel>

        <Panel title="Customer service" href="/customer-service" icon={Headset}>
          <Mini
            items={[
              ["Open", num(open(service).length)],
              ["Open over 3 days", num(csWaiting.length), csWaiting.length ? amber : undefined],
              [`Opened · ${periodLabel}`, num(service.filter((c) => inRange(c.created_at, cur)).length)],
              [`Closed · ${periodLabel}`, num(service.filter((c) => inRange(c.closed_at, cur)).length)],
            ]}
          />
          <div className="mt-4 space-y-2">
            {csCats.rows.map((c) => {
              const n = service.filter((x) => x.category === c.value && inRange(x.created_at, cur)).length;
              return n ? <BarRow key={c.value} label={c.label} value={n} max={Math.max(1, service.filter((x) => inRange(x.created_at, cur)).length)} right={num(n)} color="bg-sky-500" /> : null;
            })}
            {service.filter((x) => inRange(x.created_at, cur)).length === 0 && <div className="text-xs text-fg-4">No customer service cases {periodLabel}.</div>}
          </div>
        </Panel>
      </div>
    </Page>
  );
}
