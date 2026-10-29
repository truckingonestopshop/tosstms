"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, Layers } from "lucide-react";
import { Card, CardHeader, Empty, Page, PageHeader, Pill, neutralPill } from "@/components/ui/Bits";
import { Segmented } from "@/components/ui/Field";
import { BarChart } from "@/components/analytics/Charts";
import { BarRow, Delta, Kpi, amber, green, red } from "@/components/dashboard/Widgets";
import { sb } from "@/lib/db";
import { useLiveTable } from "@/lib/live";
import { useStore } from "@/lib/store";
import { cn, fmtDay, isCanceled, money, moneyShort, num, today } from "@/lib/format";
import { SERVICES, hasService, sourceLabel } from "@/lib/services";
import { monthly, runningSub, type Charge } from "@/lib/billing";
import { isOpen, type Opportunity } from "@/lib/sales";
import type { Case } from "@/lib/cases";
import { muteActive, pendingItems, useMutes } from "@/lib/pending";
import { loadDay } from "@/lib/analytics";
import { PERIODS, inRange, ranges, revenue, type Period, type Range } from "@/lib/dashboard";
import type { Company, ServiceInfo, ServiceKey } from "@/lib/types";

// Services: a dashboard of every TOSS service across the companies in view. For each service: how
// many carriers are active (and new this period vs before), the money it brings (subscriptions,
// one-time charges; dispatch also its fees on loads), and what's related to it: loads, trucks,
// drivers, paperwork, open cases and opportunities. Click a service for its carriers and their own
// numbers. Each carrier's Services tab (Companies) is unchanged.

/** Who looks after the carrier in this service. */
const OWNER: Record<ServiceKey, { label: string; get: (s: ServiceInfo) => string | null | undefined }> = {
  dispatch: { label: "Dispatcher", get: (s) => s.dispatcher },
  dot_compliance: { label: "Safety account manager", get: (s) => s.sam },
  mcpt: { label: "MCPT agent", get: (s) => s.agent },
  accounting: { label: "Agent", get: (s) => s.agent },
  factoring: { label: "Factoring agent", get: (s) => s.agent },
  fuel_card: { label: "Agent", get: (s) => s.agent },
  insurance: { label: "Agent", get: (s) => s.agent },
};

/** When the carrier started this service (activation date, else when it became a client). */
const startedOn = (c: Company, k: ServiceKey) => c.services?.[k]?.activation_date || c.became_client_at || c.created_at;

function top(values: (string | null | undefined)[]) {
  const n = new Map<string, number>();
  for (const v of values) if (v?.trim()) n.set(v.trim(), (n.get(v.trim()) || 0) + 1);
  return [...n.entries()].sort((a, b) => b[1] - a[1]);
}

type Clients = "active" | "all";

export default function ServicesPage() {
  const { companies, loads, trucks, drivers, trailers, documents, docTypes, payments, invoices, inScope, scope, scopedCompany } = useStore();
  const opps = useLiveTable<Opportunity>("tms_opportunities");
  const cases = useLiveTable<Case>("tms_cases");
  const { mutes } = useMutes();
  const [charges, setCharges] = useState<Charge[]>([]);
  const [period, setPeriod] = useState<Period>("month");
  const [clients, setClients] = useState<Clients>("active");
  const [open, setOpen] = useState<ServiceKey | null>(null);
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

  const pool = companies.filter((c) => inScope(c.id) && c.stage !== "lead" && (clients === "all" || c.status !== "inactive"));
  const invIds = new Set(invoices.filter((i) => !i.company_id || inScope(i.company_id)).map((i) => i.id));
  const pay = payments.filter((p) => invIds.has(p.invoice_id));

  // Paperwork issues per carrier (Pending's rules, turned-off reminders left out).
  const issuesBy = useMemo(() => {
    const muted = new Set(mutes.filter(muteActive).map((m) => m.key));
    const m = new Map<string, { expired: number; soon: number; missing: number }>();
    for (const i of pendingItems({ companies, drivers, trucks, trailers, documents, docTypes, loads: [] }, inScope)) {
      if (muted.has(i.key)) continue;
      const r = m.get(i.companyId) || { expired: 0, soon: 0, missing: 0 };
      if (i.state === "expired") r.expired++;
      else if (i.state === "missing") r.missing++;
      else r.soon++;
      m.set(i.companyId, r);
    }
    return m;
  }, [companies, drivers, trucks, trailers, documents, docTypes, inScope, mutes]);

  /** Everything for one service and the period. */
  const stats = (key: ServiceKey, r: Range) => {
    const list = pool.filter((c) => hasService(c, key));
    const ids = new Set(list.map((c) => c.id));
    const ch = charges.filter((c) => c.service === key && ids.has(c.company_id));
    // Dispatch fees on loads count for Dispatch.
    const L = key === "dispatch" ? loads.filter((l) => ids.has(l.company_id)) : [];
    const money_ = revenue(L, ch, key === "dispatch" ? pay : [], r);
    return { list, ids, ch, money: money_, isNew: list.filter((c) => inRange(startedOn(c, key), r)).length };
  };

  const cards = SERVICES.map(({ key, label }) => {
    const s = stats(key, cur);
    const p = stats(key, prev);
    const info = s.list.map((c) => c.services?.[key] ?? {});
    const tr = trucks.filter((x) => s.ids.has(x.company_id) && x.status === "active");
    const dr = drivers.filter((x) => s.ids.has(x.company_id) && !x.termination_date && x.status === "active");
    const live = loads.filter((l) => s.ids.has(l.company_id) && !isCanceled(l.status));
    const inCur = live.filter((l) => inRange(loadDay(l), cur));
    const issues = [...s.ids].reduce((a, id) => {
      const x = issuesBy.get(id);
      return { expired: a.expired + (x?.expired || 0), soon: a.soon + (x?.soon || 0), missing: a.missing + (x?.missing || 0) };
    }, { expired: 0, soon: 0, missing: 0 });
    const openCases = cases.rows.filter((c) => c.status !== "closed" && c.category === key && (!c.company_id || inScope(c.company_id)));
    const openOpps = opps.rows.filter((o) => isOpen(o) && o.service === key && inScope(o.company_id));
    const mrr = s.ch.filter((c) => runningSub(c, t)).reduce((a, c) => a + monthly(c), 0);
    const pending = s.ch.filter((c) => c.kind === "one_time" && c.status === "unpaid").reduce((a, c) => a + Number(c.amount), 0);

    // What's related to this service.
    const related: [string, React.ReactNode, string?][] = [];
    if (key === "dispatch") {
      const gross = inCur.reduce((a, l) => a + l.gross_amount, 0);
      const miles = inCur.reduce((a, l) => a + (Number(l.loaded_miles) || 0), 0);
      related.push(
        ["Active loads", num(live.filter((l) => ["new", "booked", "in_transit"].includes(l.status)).length)],
        ["Loads", num(inCur.length)],
        ["Gross", money(gross, { cents: false })],
        ["Rate per mile", miles ? `$${(gross / miles).toFixed(2)}` : "—"],
      );
    }
    if (key === "dispatch" || key === "dot_compliance" || key === "mcpt" || key === "insurance" || key === "fuel_card") related.push(["Trucks", num(tr.length)], ["Drivers", num(dr.length)]);
    if (key === "dot_compliance" || key === "mcpt" || key === "insurance")
      related.push(
        ["Expired docs", num(issues.expired), issues.expired ? red : undefined],
        ["Expiring ≤ 30 days", num(issues.soon), issues.soon ? amber : undefined],
        ["Missing docs", num(issues.missing)],
      );
    if (key === "mcpt") related.push(["With fuel taxes", num(info.filter((x) => x.fuel_taxes).length)]);
    if (key === "factoring" || key === "accounting") {
      const pc = info.map((x) => Number(x.percent)).filter((x) => x > 0);
      related.push(["Average %", pc.length ? `${(pc.reduce((a, b) => a + b, 0) / pc.length).toFixed(1)}%` : "—"], ["Companies used", num(new Set(info.map((x) => x.provider).filter(Boolean)).size)]);
    }
    if (key === "fuel_card") related.push(["Cards", num(info.reduce((a, x) => a + (Number(x.cards) || 0), 0))]);
    if (key === "insurance") related.push(["Providers", num(new Set(info.map((x) => x.provider).filter(Boolean)).size)]);

    return {
      key,
      label,
      count: s.list.length,
      isNew: s.isNew,
      prevNew: p.isNew,
      revenue: s.money.total,
      prevRevenue: p.money.total,
      mrr,
      pending,
      cross: info.filter((x) => x.source === "cross_sale").length,
      seller: top(info.map((x) => x.sold_by))[0],
      owners: top(info.map((x) => OWNER[key].get(x))),
      related,
      openCases: openCases.length,
      openOpps: openOpps.length,
      oppValue: openOpps.reduce((a, o) => a + Number(o.value), 0),
    };
  });

  const withService = pool.filter((c) => SERVICES.some((s) => hasService(c, s.key)));
  const sold = cards.reduce((a, c) => a + c.count, 0);
  const newCur = cards.reduce((a, c) => a + c.isNew, 0);
  const newPrev = cards.reduce((a, c) => a + c.prevNew, 0);
  const revCur = cards.reduce((a, c) => a + c.revenue, 0);
  const revPrev = cards.reduce((a, c) => a + c.prevRevenue, 0);
  const mrr = cards.reduce((a, c) => a + c.mrr, 0);
  const perClient = withService.length ? sold / withService.length : 0;
  const periodLabel = PERIODS.find((p) => p.v === period)!.label.toLowerCase();
  const maxCount = Math.max(1, ...cards.map((c) => c.count));
  const sel = cards.find((c) => c.key === open) || null;

  return (
    <Page>
      <PageHeader
        eyebrow={scopedCompany ? scopedCompany.name : "All companies"}
        title="Services"
        actions={
          <>
            <Segmented
              value={clients}
              onChange={setClients}
              options={[
                { value: "active", label: "Active clients" },
                { value: "all", label: "Incl. inactive" },
              ]}
            />
            <Segmented value={period} onChange={setPeriod} options={PERIODS.map((p) => ({ value: p.v, label: p.label }))} className="scrollbar-none overflow-x-auto" />
          </>
        }
      />

      {/* Key numbers */}
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Clients with a service" value={num(withService.length)} sub={`${pool.length - withService.length} without one`} href="/fleet" />
        <Kpi label="Services sold" value={num(sold)} sub={`${perClient.toFixed(1)} per client`} />
        <Kpi label="New service sign-ups" value={num(newCur)} cur={newCur} prev={newPrev} sub={periodLabel} />
        <Kpi label="Cross sales" value={num(cards.reduce((a, c) => a + c.cross, 0))} sub="Sold to existing clients" />
        <Kpi label="Service revenue" value={money(revCur, { cents: false })} cur={revCur} prev={revPrev} sub={periodLabel} href="/billing" />
        <Kpi label="Monthly recurring" value={money(mrr, { cents: false })} sub="Subscriptions" href="/billing" />
      </div>

      {/* Carriers and revenue per service */}
      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Active carriers per service" subtitle="Click a service to see its carriers" />
          <div className="space-y-2 p-4 sm:p-5">
            {cards.map((c) => (
              <BarRow key={c.key} label={c.label} value={c.count} max={maxCount} right={`${c.count} carrier${c.count === 1 ? "" : "s"}`} onClick={() => setOpen((o) => (o === c.key ? null : c.key))} active={open === c.key} />
            ))}
          </div>
        </Card>
        <Card>
          <CardHeader title={`Revenue per service · ${periodLabel}`} subtitle="Subscriptions and one-time charges; Dispatch also its fees on loads" />
          <div className="p-4 sm:p-5">
            <BarChart data={cards.map((c) => ({ label: c.label.replace("DOT Compliance", "DOT").replace("Fuel Card", "Fuel"), value: Math.round(c.revenue), sub: `${moneyShort(c.mrr)}/mo recurring` }))} format={(v) => moneyShort(v)} height={180} />
          </div>
        </Card>
      </div>

      {pool.length === 0 ? (
        <Card>
          <Empty icon={Layers} title="No clients yet" body="Add a carrier under Companies and check the services it's active in." />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {cards.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => setOpen((o) => (o === c.key ? null : c.key))}
              aria-expanded={open === c.key}
              className={cn("flex flex-col rounded-xl border bg-surface p-4 text-left transition-colors hover:border-line-strong sm:p-5", open === c.key ? "border-brand ring-1 ring-brand/40" : "border-line", c.count === 0 && "opacity-60")}
            >
              <div className="mb-3 flex items-start justify-between gap-2">
                <div>
                  <div className="text-[15px] font-semibold text-fg">{c.label}</div>
                  <div className="mt-0.5 flex items-center gap-1.5 text-xs text-fg-3">
                    {c.isNew} new {periodLabel} <Delta cur={c.isNew} prev={c.prevNew} />
                  </div>
                </div>
                <Pill className={neutralPill}>
                  {num(c.count)} carrier{c.count === 1 ? "" : "s"}
                </Pill>
              </div>

              <dl className="grid grid-cols-3 gap-x-3 gap-y-2.5 border-b border-line pb-3">
                {(
                  [
                    ["Revenue", money(c.revenue, { cents: false })],
                    ["Recurring", c.mrr ? `${moneyShort(c.mrr)}/mo` : "—"],
                    ["Pending", c.pending ? money(c.pending, { cents: false }) : "—", c.pending ? amber : undefined],
                  ] as [string, string, string?][]
                ).map(([k, v, tone]) => (
                  <div key={k} className="min-w-0">
                    <dt className="truncate text-[10.5px] font-semibold uppercase tracking-wider text-fg-4">{k}</dt>
                    <dd className={cn("tnum truncate text-[14px] font-semibold text-fg", tone)}>{v}</dd>
                  </div>
                ))}
              </dl>

              {c.related.length > 0 && (
                <dl className="grid grid-cols-2 gap-x-3 gap-y-2 border-b border-line py-3">
                  {c.related.map(([k, v, tone]) => (
                    <div key={k} className="flex min-w-0 items-baseline justify-between gap-2">
                      <dt className="truncate text-xs text-fg-3">{k}</dt>
                      <dd className={cn("tnum shrink-0 text-[13px] font-semibold text-fg", tone)}>{v}</dd>
                    </div>
                  ))}
                </dl>
              )}

              <div className="space-y-1 pt-3 text-xs text-fg-3">
                <div className="flex justify-between gap-2">
                  <span>Open cases</span>
                  <span className={cn("tnum font-semibold", c.openCases ? "text-fg" : "text-fg-4")}>{c.openCases}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span>Open opportunities</span>
                  <span className="tnum font-semibold text-fg">{c.openOpps ? `${c.openOpps} · ${moneyShort(c.oppValue)}` : <span className="text-fg-4">0</span>}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span>{OWNER[c.key].label}s</span>
                  <span className="truncate text-fg-2">{c.owners.length ? c.owners.slice(0, 2).map(([n, k]) => `${n} (${k})`).join(", ") : "—"}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span>Top seller</span>
                  <span className="truncate text-fg-2">{c.seller ? `${c.seller[0]} (${c.seller[1]})` : "—"}</span>
                </div>
              </div>
              <div className={cn("mt-3 text-xs font-medium", open === c.key ? "text-fg" : "text-fg-3")}>{open === c.key ? "Hide carriers" : "See carriers →"}</div>
            </button>
          ))}
        </div>
      )}

      {sel && <ServiceCarriers service={sel.key} label={sel.label} list={pool.filter((c) => hasService(c, sel.key))} range={cur} charges={charges} issuesBy={issuesBy} />}
    </Page>
  );
}

/** One service's carriers, each with its own numbers for that service. */
function ServiceCarriers({
  service,
  label,
  list,
  range,
  charges,
  issuesBy,
}: {
  service: ServiceKey;
  label: string;
  list: Company[];
  range: Range;
  charges: Charge[];
  issuesBy: Map<string, { expired: number; soon: number; missing: number }>;
}) {
  const { setScope, trucks, drivers, loads } = useStore();
  const t = today();
  const tab = service === "dispatch" ? "dispatch" : service === "dot_compliance" ? "dot" : service === "mcpt" ? "mcpt" : "services";
  const href = (id: string) => (tab === "dispatch" ? "/dispatch" : `/fleet?company=${id}&tab=${tab}`);
  return (
    <Card className="mt-4" id="service-carriers">
      <CardHeader title={`${label} · ${list.length} carrier${list.length === 1 ? "" : "s"}`} subtitle="Click a carrier to open it" />
      {list.length === 0 ? (
        <div className="px-5 py-8 text-center text-sm text-fg-4">No carriers in this service yet. Turn it on in a company&apos;s Profile → Edit → Services.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-[13px]">
            <thead>
              <tr className="border-b border-line text-left text-[11px] uppercase tracking-wider text-fg-4">
                <th className="px-4 py-2 font-semibold sm:px-5">Carrier</th>
                <th className="px-3 py-2 font-semibold">{OWNER[service].label}</th>
                <th className="px-3 py-2 font-semibold">Sold by · source</th>
                <th className="px-3 py-2 font-semibold">Since</th>
                <th className="px-3 py-2 text-right font-semibold">Trucks</th>
                <th className="px-3 py-2 text-right font-semibold">Drivers</th>
                {service === "dispatch" && <th className="px-3 py-2 text-right font-semibold">Loads · gross</th>}
                <th className="px-3 py-2 text-right font-semibold">Recurring</th>
                <th className="px-3 py-2 text-right font-semibold">Paperwork</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {[...list]
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((c) => {
                  const s = c.services?.[service] ?? {};
                  const tr = trucks.filter((x) => x.company_id === c.id && x.status === "active").length;
                  const dr = drivers.filter((x) => x.company_id === c.id && !x.termination_date && x.status === "active").length;
                  const ld = loads.filter((l) => l.company_id === c.id && !isCanceled(l.status) && inRange(loadDay(l), range));
                  const rec = charges.filter((x) => x.company_id === c.id && x.service === service && runningSub(x, t)).reduce((a, x) => a + monthly(x), 0);
                  const iss = issuesBy.get(c.id);
                  const since = startedOn(c, service);
                  return (
                    <tr key={c.id} className="border-b border-line last:border-b-0 hover:bg-surface-2/50">
                      <td className="px-4 py-2.5 sm:px-5">
                        <Link href={href(c.id)} onClick={() => setScope(c.id)} className="font-medium text-fg hover:underline">
                          {c.name}
                        </Link>
                        <div className="text-[11px] text-fg-4">{[c.mc_number && `MC ${c.mc_number}`, c.dot_number && `DOT ${c.dot_number}`].filter(Boolean).join(" · ")}</div>
                      </td>
                      <td className="px-3 py-2.5 text-fg-2">{OWNER[service].get(s) || "—"}</td>
                      <td className="px-3 py-2.5 text-fg-2">
                        {s.sold_by || "—"}
                        {s.source && <div className="text-[11px] text-fg-4">{sourceLabel(s.source)}</div>}
                      </td>
                      <td className="px-3 py-2.5 text-fg-2">{since ? fmtDay(since) : "—"}</td>
                      <td className="tnum px-3 py-2.5 text-right text-fg">{tr}</td>
                      <td className="tnum px-3 py-2.5 text-right text-fg">{dr}</td>
                      {service === "dispatch" && (
                        <td className="tnum px-3 py-2.5 text-right text-fg">
                          {ld.length} · {moneyShort(ld.reduce((a, l) => a + l.gross_amount, 0))}
                        </td>
                      )}
                      <td className="tnum px-3 py-2.5 text-right text-fg">{rec ? `${moneyShort(rec)}/mo` : "—"}</td>
                      <td className="px-3 py-2.5 text-right">
                        {iss && (iss.expired || iss.soon || iss.missing) ? (
                          <span className={cn("inline-flex items-center gap-1 text-xs", iss.expired ? red : amber)}>
                            <AlertTriangle className="h-3.5 w-3.5" />
                            {[iss.expired && `${iss.expired} expired`, iss.soon && `${iss.soon} soon`, iss.missing && `${iss.missing} missing`].filter(Boolean).join(" · ")}
                          </span>
                        ) : (
                          <span className={cn("text-xs", green)}>OK</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <Link href={href(c.id)} onClick={() => setScope(c.id)} aria-label={`Open ${c.name}`} className="text-fg-4 hover:text-fg">
                          <ArrowRight className="h-4 w-4" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

