"use client";

import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Field";
import { Card, CardHeader, Page, PageHeader, Stat, Tabs } from "@/components/ui/Bits";
import { BarChart, LineChart, RankTable } from "@/components/analytics/Charts";
import { useStore } from "@/lib/store";
import { RANGE_LABEL, grainFor, groupBy, inWindow, rangeDates, series, type RangeKey, type Row } from "@/lib/analytics";
import { downloadCsv } from "@/lib/csv";
import { STATUS, STATUS_ORDER, money, moneyShort, num, today } from "@/lib/format";
import { balance, payState } from "@/lib/invoice";

type Breakdown = "carrier" | "driver" | "truck" | "broker" | "lane" | "dispatcher";

export default function AnalyticsPage() {
  const { loads, invoices, payments, inScope, scopedCompany, companyById, driverById, truckById, memberName } = useStore();
  const [range, setRange] = useState<RangeKey>("30d");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [by, setBy] = useState<Breakdown>(scopedCompany ? "driver" : "carrier");
  const [metric, setMetric] = useState<"gross" | "fee" | "loads">("gross");

  const win = rangeDates(range, from, to);
  const scoped = useMemo(() => loads.filter((l) => inScope(l.company_id)), [loads, inScope]);
  const inRange = useMemo(() => scoped.filter((l) => inWindow(l, win)), [scoped, win.from, win.to]); // eslint-disable-line react-hooks/exhaustive-deps
  const grain = grainFor(win, inRange);
  const pts = useMemo(() => series(inRange, win, grain), [inRange, grain, win.from, win.to]); // eslint-disable-line react-hooks/exhaustive-deps

  const t = useMemo(() => {
    const gross = inRange.reduce((s, l) => s + l.gross_amount, 0);
    const fee = inRange.reduce((s, l) => s + l.dispatcher_cut, 0);
    const loaded = inRange.reduce((s, l) => s + l.loaded_miles, 0);
    const dh = inRange.reduce((s, l) => s + l.deadhead_miles, 0);
    return { gross, fee, loaded, dh, n: inRange.length, rpm: loaded ? gross / loaded : 0, allIn: loaded + dh ? gross / (loaded + dh) : 0, avg: inRange.length ? gross / inRange.length : 0 };
  }, [inRange]);

  // Collections: dispatch invoices in scope (any date), USD.
  const coll = useMemo(() => {
    const inv = invoices.filter((i) => i.invoice_type === "load" && i.currency === "USD" && i.company_id && inScope(i.company_id));
    const ids = new Set(inv.map((i) => i.id));
    // Collected = payments received in the window (part payments count when they arrive).
    const received = payments.filter((p) => ids.has(p.invoice_id) && p.paid_on >= win.from && p.paid_on <= win.to);
    const open = inv.filter((i) => ["open", "partial", "overdue"].includes(payState(i)));
    const overdue = inv.filter((i) => payState(i) === "overdue");
    const unbilled = scoped.filter((l) => l.status === "delivered");
    return {
      paid: received.reduce((s, p) => s + p.amount, 0),
      open: open.reduce((s, i) => s + balance(i), 0),
      overdue: overdue.reduce((s, i) => s + balance(i), 0),
      unbilled: unbilled.reduce((s, l) => s + l.dispatcher_cut, 0),
    };
  }, [invoices, payments, scoped, inScope, win.from, win.to]);

  const rows: Row[] = useMemo(() => {
    switch (by) {
      case "carrier":
        return groupBy(inRange, (l) => l.company_id, (k) => companyById(k)?.name || "Deleted company");
      case "driver":
        return groupBy(inRange, (l) => l.driver_id, (k) => driverById(k)?.name || "Deleted driver");
      case "truck":
        return groupBy(inRange, (l) => l.truck_id, (k) => (truckById(k) ? `Unit ${truckById(k)!.unit_number}` : "Deleted truck"));
      case "broker":
        return groupBy(inRange, (l) => (l.broker_name || "").trim() || null, (k) => k);
      case "lane":
        return groupBy(inRange, (l) => `${l.origin_state} → ${l.destination_state}`, (k) => k);
      case "dispatcher":
        return groupBy(inRange, (l) => l.dispatcher_id, (k) => memberName(k));
    }
  }, [by, inRange, companyById, driverById, truckById, memberName]);

  const fmt = (v: number) => (metric === "loads" ? num(v) : moneyShort(v));
  const statusCounts = STATUS_ORDER.map((s) => ({ s, n: scoped.filter((l) => l.status === s && (l.delivery_date || l.pickup_date || "") >= win.from && (l.pickup_date || l.delivery_date || "") <= win.to).length }));

  return (
    <Page>
      <PageHeader
        eyebrow={scopedCompany ? scopedCompany.name : "All companies"}
        title="Analytics"
        actions={
          <Button
            variant="outline"
            onClick={() =>
              downloadCsv(`analytics-${by}-${today()}.csv`, [
                [by[0].toUpperCase() + by.slice(1), "Loads", "Gross", "TOSS fee", "Loaded mi", "Total mi", "RPM"],
                ...rows.map((r) => [r.name, r.loads, r.gross.toFixed(2), r.fee.toFixed(2), r.loaded, r.miles, r.loaded ? (r.gross / r.loaded).toFixed(2) : ""]),
              ])
            }
          >
            <Download className="h-4 w-4" /> CSV
          </Button>
        }
      />

      {/* Filters: one row above everything */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Select value={range} onChange={(e) => setRange(e.target.value as RangeKey)} className="w-44">
          {(Object.keys(RANGE_LABEL) as RangeKey[]).map((k) => (
            <option key={k} value={k}>
              {RANGE_LABEL[k]}
            </option>
          ))}
        </Select>
        {range === "custom" && (
          <>
            <Input type="date" value={from || win.from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
            <span className="text-fg-4">–</span>
            <Input type="date" value={to || win.to} onChange={(e) => setTo(e.target.value)} className="w-40" />
          </>
        )}
        <span className="text-xs text-fg-4">Loads count on their delivery date. Canceled loads are left out.</span>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Gross revenue" value={money(t.gross, { cents: false })} sub={`${num(t.n)} loads · ${money(t.avg, { cents: false })} avg`} />
        <Stat label="TOSS fee" value={money(t.fee, { cents: false })} sub={t.gross ? `${((t.fee / t.gross) * 100).toFixed(1)}% of gross` : "—"} />
        <Stat label="Rate per mile" value={t.rpm ? `$${t.rpm.toFixed(2)}` : "—"} sub={t.allIn ? `$${t.allIn.toFixed(2)} all-in with deadhead` : "Loaded miles"} />
        <Stat
          label="Miles"
          value={num(t.loaded + t.dh)}
          sub={t.loaded + t.dh ? `${((t.dh / (t.loaded + t.dh)) * 100).toFixed(0)}% deadhead` : "—"}
        />
      </div>

      <div className="mb-5 grid grid-cols-1 gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title={metric === "gross" ? "Gross revenue" : metric === "fee" ? "TOSS fee" : "Loads delivered"}
            subtitle={`By ${grain} · ${RANGE_LABEL[range]}`}
            actions={
              <Select value={metric} onChange={(e) => setMetric(e.target.value as typeof metric)} className="h-8 w-32 text-[13px]">
                <option value="gross">Gross</option>
                <option value="fee">TOSS fee</option>
                <option value="loads">Loads</option>
              </Select>
            }
          />
          <div className="p-4 sm:p-5">
            <BarChart
              data={pts.map((p) => ({ label: p.label, value: p[metric], sub: `${p.loads} load${p.loads === 1 ? "" : "s"}` }))}
              format={fmt}
              height={220}
            />
          </div>
        </Card>
        <Card>
          <CardHeader title="Collections" subtitle="Dispatch fee invoices" />
          <div className="space-y-3 p-4 sm:p-5">
            {[
              ["Collected in period", coll.paid, "text-emerald-700 dark:text-emerald-300"],
              ["Outstanding", coll.open, "text-fg"],
              ["Overdue", coll.overdue, coll.overdue ? "text-red-600 dark:text-red-400" : "text-fg"],
              ["Delivered, not billed", coll.unbilled, "text-fg"],
            ].map(([k, v, c]) => (
              <div key={k as string} className="flex items-baseline justify-between gap-3 border-b border-line pb-3 last:border-0 last:pb-0">
                <span className="text-[13px] text-fg-3">{k}</span>
                <span className={`tnum text-lg font-bold ${c}`}>{money(v as number, { cents: false })}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="mb-5 grid grid-cols-1 gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Average rate per mile" subtitle={`Loaded miles · by ${grain}`} />
          <div className="p-4 sm:p-5">
            <LineChart
              data={pts.map((p) => ({ label: p.label, value: p.loaded ? Math.round((p.gross / p.loaded) * 100) / 100 : 0, sub: `${num(p.loaded)} loaded mi` }))}
              format={(v) => `$${v.toFixed(2)}`}
              height={200}
            />
          </div>
        </Card>
        <Card>
          <CardHeader title="Loads by status" subtitle={RANGE_LABEL[range]} />
          <ul className="divide-y divide-line">
            {statusCounts
              .filter((x) => x.n > 0)
              .map((x) => (
                <li key={x.s} className="flex items-center gap-2.5 px-4 py-2 text-[13px] sm:px-5">
                  <span className={`h-2 w-2 rounded-full ${STATUS[x.s].dot}`} />
                  <span className="flex-1 text-fg-2">{STATUS[x.s].label}</span>
                  <span className="tnum font-semibold text-fg">{x.n}</span>
                </li>
              ))}
            {statusCounts.every((x) => !x.n) && <li className="px-5 py-8 text-center text-[13px] text-fg-4">No loads in this period</li>}
          </ul>
        </Card>
      </div>

      <Card>
        <div className="px-4 pt-2 sm:px-5">
          <Tabs<Breakdown>
            value={by}
            onChange={setBy}
            tabs={[
              { value: "carrier", label: "Carriers" },
              { value: "driver", label: "Drivers" },
              { value: "truck", label: "Trucks" },
              { value: "broker", label: "Brokers" },
              { value: "lane", label: "Lanes" },
              { value: "dispatcher", label: "Dispatchers" },
            ]}
          />
        </div>
        <RankTable
          rows={rows}
          barOf={(i) => rows[i].gross}
          empty="No loads in this period"
          columns={[
            { label: "Loads", value: (i) => rows[i].loads },
            { label: "Gross", value: (i) => money(rows[i].gross, { cents: false }) },
            { label: "TOSS fee", value: (i) => money(rows[i].fee, { cents: false }), className: "hidden sm:table-cell" },
            { label: "Miles", value: (i) => num(rows[i].miles), className: "hidden md:table-cell" },
            { label: "RPM", value: (i) => (rows[i].loaded ? `$${(rows[i].gross / rows[i].loaded).toFixed(2)}` : "—") },
          ]}
        />
      </Card>
    </Page>
  );
}
