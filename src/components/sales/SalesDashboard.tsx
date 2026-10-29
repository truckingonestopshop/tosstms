"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AlertTriangle, CheckSquare, FileSignature, Target, Trophy, Users } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/Bits";
import { Select } from "@/components/ui/Field";
import { Kpi, Panel, Mini, BarRow, red, amber, green } from "@/components/dashboard/Widgets";
import { sb } from "@/lib/db";
import { useStore } from "@/lib/store";
import { cn, fmtDay, money, num, today } from "@/lib/format";
import { PERIODS, inRange, lastMonths, ranges, type Period, type Range } from "@/lib/dashboard";
import { PeriodMenu, defaultCustom } from "@/components/dashboard/PeriodPicker";
import { billingTotals, type Charge } from "@/lib/billing";
import { payState, balance } from "@/lib/invoice";
import { isRotting, oppNumber, weighted, type Opportunity } from "@/lib/sales";
import { stagesOf, useSales } from "./SalesProvider";
import { svcLabel } from "./Opportunities";

const oppHref = (o: Opportunity) => `/sales?tab=opportunities&opp=${o.id}`;
const daysBetween = (a: string, b: string) => Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000));

/** Sales at a glance: pipeline, forecast, won / lost, people, sources, and what needs a push. */
export function SalesDashboard() {
  const { pipelines, stages, opps, tasks, reasons, agreements } = useSales();
  const { inScope, memberName, invoices, payments, scope, companies } = useStore();
  const [period, setPeriod] = useState<Period>("month");
  const [custom, setCustom] = useState(defaultCustom);
  const [pid, setPid] = useState("");
  const [now] = useState(() => Date.now());
  const [charges, setCharges] = useState<Charge[]>([]);
  const t = today();
  useEffect(() => {
    let alive = true;
    let q = sb().from("tms_charges").select("*");
    if (scope !== "all") q = q.eq("company_id", scope);
    q.then(({ data }) => alive && setCharges(((data || []) as Charge[]).map((c) => ({ ...c, amount: Number(c.amount) || 0 }))));
    return () => {
      alive = false;
    };
  }, [scope]);

  const { cur, prev } = ranges(period, t, custom);
  const all = opps.rows.filter((o) => inScope(o.company_id) && (!pid || o.pipeline_id === pid));
  const stageOf = (o: Opportunity) => stages.rows.find((s) => s.id === o.stage_id);
  const open = all.filter((o) => o.status === "open");
  const closedIn = (r: Range, s: "won" | "lost") => all.filter((o) => o.status === s && inRange(o.closed_at, r));
  const sum = (l: Opportunity[]) => l.reduce((a, o) => a + Number(o.value), 0);
  const won = closedIn(cur, "won");
  const wonPrev = closedIn(prev, "won");
  const lost = closedIn(cur, "lost");
  const lostPrev = closedIn(prev, "lost");
  const rate = (w: number, l: number) => (w + l ? Math.round((w / (w + l)) * 100) : 0);
  const created = all.filter((o) => inRange(o.created_at, cur));
  const createdPrev = all.filter((o) => inRange(o.created_at, prev));
  const avgDeal = won.length ? sum(won) / won.length : 0;
  const avgDays = won.length ? Math.round(won.reduce((a, o) => a + daysBetween(o.created_at, o.closed_at || o.updated_at), 0) / won.length) : 0;
  const forecast = open.reduce((a, o) => a + weighted(o, stageOf(o)), 0);

  // Funnel for one pipeline (the picked one, or the first).
  const funnelPipe = pipelines.rows.find((p) => p.id === pid) || pipelines.rows.find((p) => p.active) || pipelines.rows[0];
  const funnel = stagesOf(stages.rows, funnelPipe?.id).map((s) => {
    const items = open.filter((o) => o.stage_id === s.id);
    return { s, n: items.length, value: sum(items), w: items.reduce((a, o) => a + weighted(o, s), 0) };
  });
  const funnelMax = Math.max(1, ...funnel.map((f) => f.value));

  const months = lastMonths(6, t).map((m) => ({ ...m, won: sum(closedIn(m, "won")), lost: sum(closedIn(m, "lost")), wonN: closedIn(m, "won").length }));
  const monthMax = Math.max(1, ...months.map((m) => Math.max(m.won, m.lost)));

  const owners = new Map<string, { open: number; value: number; won: number; wonValue: number; lost: number }>();
  for (const o of all) {
    const k = o.owner_id || "";
    const r = owners.get(k) || { open: 0, value: 0, won: 0, wonValue: 0, lost: 0 };
    if (o.status === "open") {
      r.open++;
      r.value += Number(o.value);
    }
    if (o.status === "won" && inRange(o.closed_at, cur)) {
      r.won++;
      r.wonValue += Number(o.value);
    }
    if (o.status === "lost" && inRange(o.closed_at, cur)) r.lost++;
    owners.set(k, r);
  }
  const sources = new Map<string, { n: number; won: number }>();
  for (const o of created) {
    const k = o.source || "Not set";
    const r = sources.get(k) || { n: 0, won: 0 };
    r.n++;
    sources.set(k, r);
  }
  for (const o of won) {
    const k = o.source || "Not set";
    const r = sources.get(k) || { n: 0, won: 0 };
    r.won += Number(o.value);
    sources.set(k, r);
  }
  const srcMax = Math.max(1, ...[...sources.values()].map((x) => x.n));
  const lostBy = new Map<string, number>();
  for (const o of lost) lostBy.set(reasons.rows.find((r) => r.id === o.lost_reason_id)?.name || "No reason", (lostBy.get(reasons.rows.find((r) => r.id === o.lost_reason_id)?.name || "No reason") || 0) + 1);
  const lostMax = Math.max(1, ...lostBy.values());
  const bySvc = new Map<string, number>();
  for (const o of open) bySvc.set(o.service, (bySvc.get(o.service) || 0) + Number(o.value));
  const svcMax = Math.max(1, ...bySvc.values());

  // Needs a push.
  const rotting = open.filter((o) => isRotting(o, stageOf(o), now));
  const pastClose = open.filter((o) => o.expected_close && o.expected_close < t);
  const openIds = new Set(open.map((o) => o.id));
  const lateTasks = tasks.rows.filter((x) => !x.done && x.due_date && x.due_date <= t && openIds.has(x.opportunity_id));
  const waiting = agreements.rows.filter((a) => a.status === "sent" && (!a.company_id || inScope(a.company_id)));
  const inv = invoices.filter((i) => !i.company_id || inScope(i.company_id));
  const owed = inv.filter((i) => ["open", "partial", "overdue"].includes(payState(i)));
  const billing = billingTotals(charges, inv, payments, t);
  const newClients = companies.filter((c) => inScope(c.id) && c.stage !== "lead" && inRange(c.became_client_at, cur)).length;
  const attention = [
    ...pastClose.map((o) => ({ o, why: `Close date passed (${fmtDay(o.expected_close)})`, tone: red })),
    ...rotting.filter((o) => !pastClose.includes(o)).map((o) => ({ o, why: `Stuck in ${stageOf(o)?.name}`, tone: amber })),
  ].slice(0, 8);

  return (
    <>
      <div className="mb-4 flex flex-wrap gap-2">
        <PeriodMenu value={period} onChange={setPeriod} options={PERIODS} custom={custom} onCustom={setCustom} />
        <Select value={pid} onChange={(e) => setPid(e.target.value)} className="w-auto" aria-label="Pipeline">
          <option value="">All pipelines</option>
          {pipelines.rows.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Open pipeline" value={money(sum(open), { cents: false })} sub={`${num(open.length)} open`} href="/sales?tab=opportunities" />
        <Kpi label="Weighted forecast" value={money(forecast, { cents: false })} sub="value × stage win %" />
        <Kpi label="Won" value={money(sum(won), { cents: false })} cur={sum(won)} prev={sum(wonPrev)} sub={`${num(won.length)} deals`} />
        <Kpi label="Win rate" value={`${rate(won.length, lost.length)}%`} cur={rate(won.length, lost.length)} prev={rate(wonPrev.length, lostPrev.length)} sub={`${won.length} won · ${lost.length} lost`} />
        <Kpi label="New opportunities" value={num(created.length)} cur={created.length} prev={createdPrev.length} sub={money(sum(created), { cents: false })} />
        <Kpi label="Average deal" value={money(avgDeal, { cents: false })} sub="won in the period" />
        <Kpi label="Days to close" value={won.length ? `${avgDays}` : "—"} sub="average, won deals" />
        <Kpi label="Monthly recurring" value={money(billing.recurring, { cents: false })} sub={`${num(newClients)} new clients`} href="/billing" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title={`Pipeline · ${funnelPipe?.name || ""}`} subtitle="Open value by stage, weighted in grey" />
          <div className="space-y-2.5 p-4 sm:p-5">
            {funnel.map((f) => (
              <Link key={f.s.id} href={`/sales?tab=opportunities`} className="flex items-center gap-3 text-[13px] hover:opacity-80">
                <span className="w-28 shrink-0 truncate text-fg-2">{f.s.name}</span>
                <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
                  <div className="absolute inset-y-0 left-0 rounded-full opacity-35" style={{ width: `${(f.value / funnelMax) * 100}%`, background: f.s.color || "#a1a1aa" }} />
                  <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${(f.w / funnelMax) * 100}%`, background: f.s.color || "#a1a1aa" }} />
                </div>
                <span className="tnum w-32 shrink-0 text-right text-fg">
                  {money(f.value, { cents: false })} <span className="text-fg-4">({f.n})</span>
                </span>
              </Link>
            ))}
            {funnel.length === 0 && <div className="py-6 text-center text-sm text-fg-4">No stages.</div>}
          </div>
        </Card>

        <Card>
          <CardHeader title="Won vs lost" subtitle="Last 6 months, by value" />
          <div className="flex h-[180px] items-end gap-3 p-4 sm:p-5">
            {months.map((m) => (
              <div key={m.from} className="flex flex-1 flex-col items-center gap-1">
                <div className="flex h-[120px] w-full items-end justify-center gap-1">
                  <div className="w-1/3 rounded-t bg-emerald-500" style={{ height: `${(m.won / monthMax) * 100}%` }} title={`Won ${money(m.won, { cents: false })}`} />
                  <div className="w-1/3 rounded-t bg-red-400/70" style={{ height: `${(m.lost / monthMax) * 100}%` }} title={`Lost ${money(m.lost, { cents: false })}`} />
                </div>
                <span className="text-[11px] text-fg-4">{m.label}</span>
                <span className="tnum text-[10px] text-fg-3">{m.wonN ? money(m.won, { cents: false }) : "—"}</span>
              </div>
            ))}
          </div>
        </Card>

        <Panel title="Needs a push" href="/sales?tab=opportunities" icon={AlertTriangle}>
          <Mini
            cols={3}
            items={[
              ["Stuck in stage", num(rotting.length), rotting.length ? amber : undefined],
              ["Close date passed", num(pastClose.length), pastClose.length ? red : undefined],
              ["Tasks due", num(lateTasks.length), lateTasks.length ? red : undefined],
            ]}
          />
          {attention.length > 0 && (
            <ul className="mt-3 divide-y divide-line">
              {attention.map(({ o, why, tone }) => (
                <li key={o.id}>
                  <Link href={oppHref(o)} className="flex items-center justify-between gap-2 py-2 text-[13px] hover:opacity-80">
                    <span className="min-w-0 truncate text-fg">
                      <span className="tnum mr-1 text-[11px] font-semibold text-fg-4">{oppNumber(o)}</span>
                      {o.title}
                    </span>
                    <span className={cn("shrink-0 text-[11px] font-medium", tone)}>{why}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {lateTasks.length > 0 && (
            <ul className="mt-2 space-y-1">
              {lateTasks.slice(0, 5).map((x) => {
                const o = all.find((y) => y.id === x.opportunity_id)!;
                return (
                  <li key={x.id}>
                    <Link href={oppHref(o)} className="flex items-center gap-2 text-[12px] text-fg-2 hover:text-fg">
                      <CheckSquare className="h-3.5 w-3.5 text-red-500" />
                      <span className="truncate">{x.title}</span>
                      <span className="ml-auto shrink-0 text-fg-4">
                        {x.assignee ? memberName(x.assignee) : ""} · {fmtDay(x.due_date)}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        <Panel title="People" href="/sales?tab=opportunities" icon={Users}>
          {owners.size === 0 ? (
            <div className="py-6 text-center text-sm text-fg-4">No opportunities yet.</div>
          ) : (
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-left text-[10.5px] uppercase tracking-wider text-fg-4">
                  <th className="pb-1.5 font-semibold">Owner</th>
                  <th className="pb-1.5 text-right font-semibold">Open</th>
                  <th className="pb-1.5 text-right font-semibold">Won</th>
                  <th className="pb-1.5 text-right font-semibold">Win %</th>
                </tr>
              </thead>
              <tbody>
                {[...owners.entries()]
                  .sort((a, b) => b[1].wonValue - a[1].wonValue || b[1].value - a[1].value)
                  .map(([id, r], i) => (
                    <tr key={id || "none"} className="border-t border-line">
                      <td className="py-1.5 text-fg">
                        {i === 0 && r.wonValue > 0 && <Trophy className="mr-1 inline h-3.5 w-3.5 text-amber-500" />}
                        {id ? memberName(id) : "Unassigned"}
                      </td>
                      <td className="tnum py-1.5 text-right text-fg-2">
                        {r.open} · {money(r.value, { cents: false })}
                      </td>
                      <td className={cn("tnum py-1.5 text-right", r.won ? green : "text-fg-4")}>{r.won ? `${r.won} · ${money(r.wonValue, { cents: false })}` : "—"}</td>
                      <td className="tnum py-1.5 text-right text-fg-2">{r.won + r.lost ? `${rate(r.won, r.lost)}%` : "—"}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
        </Panel>

        <Card>
          <CardHeader title="Sources" subtitle="New opportunities in the period · won value" />
          <div className="space-y-2 p-4 sm:p-5">
            {[...sources.entries()]
              .sort((a, b) => b[1].n - a[1].n)
              .map(([k, r]) => (
                <BarRow key={k} label={k} value={r.n} max={srcMax} right={<>{r.n}{r.won ? <span className={cn("ml-1", green)}>{money(r.won, { cents: false })}</span> : null}</>} />
              ))}
            {sources.size === 0 && <div className="py-6 text-center text-sm text-fg-4">Nothing in this period.</div>}
          </div>
        </Card>

        <Card>
          <CardHeader title="Why deals were lost" subtitle="In the period" />
          <div className="space-y-2 p-4 sm:p-5">
            {[...lostBy.entries()]
              .sort((a, b) => b[1] - a[1])
              .map(([k, n]) => (
                <BarRow key={k} label={k} value={n} max={lostMax} right={n} color="bg-red-400" />
              ))}
            {lostBy.size === 0 && <div className="py-6 text-center text-sm text-fg-4">Nothing lost in this period.</div>}
          </div>
        </Card>

        <Card>
          <CardHeader title="Open pipeline by service" />
          <div className="space-y-2 p-4 sm:p-5">
            {[...bySvc.entries()]
              .sort((a, b) => b[1] - a[1])
              .map(([s, v]) => (
                <BarRow key={s} label={svcLabel(s as Opportunity["service"])} value={v} max={svcMax} right={money(v, { cents: false })} />
              ))}
            {bySvc.size === 0 && <div className="py-6 text-center text-sm text-fg-4">Nothing open.</div>}
          </div>
        </Card>

        <Panel title="Paperwork & money" href="/sales?tab=templates" icon={FileSignature}>
          <Mini
            items={[
              ["Waiting for signature", num(waiting.length), waiting.length ? amber : undefined],
              ["Invoices owed", money(owed.reduce((a, i) => a + balance(i), 0), { cents: false })],
            ]}
          />
          {waiting.length > 0 && (
            <ul className="mt-3 divide-y divide-line">
              {waiting.slice(0, 5).map((a) => (
                <li key={a.id} className="flex justify-between gap-2 py-1.5 text-[13px]">
                  <span className="truncate text-fg">{a.title}</span>
                  <span className="shrink-0 text-[11px] text-fg-4">sent {fmtDay(a.sent_at?.slice(0, 10))}</span>
                </li>
              ))}
            </ul>
          )}
          {owed.length > 0 && (
            <Link href="/sales?tab=invoices" className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-fg-3 hover:text-fg">
              <Target className="h-3.5 w-3.5" /> {owed.length} unpaid invoice{owed.length === 1 ? "" : "s"}
            </Link>
          )}
        </Panel>
      </div>
    </>
  );
}
