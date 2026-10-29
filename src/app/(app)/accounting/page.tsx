"use client";

import Link from "next/link";
import { useState } from "react";
import { AlertTriangle, ArrowDownLeft, ArrowLeftRight, ArrowUpRight, CreditCard, FolderTree, Landmark, Plus, Receipt, Repeat, Store, Users } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, Page, PageHeader } from "@/components/ui/Bits";
import { Segmented } from "@/components/ui/Field";
import { BarChart, LineChart } from "@/components/analytics/Charts";
import { BarRow, Kpi, Panel, amber, red } from "@/components/dashboard/Widgets";
import { useAcc } from "@/components/accounting/AccountingProvider";
import { TxModal } from "@/components/accounting/TxModal";
import { useStore } from "@/lib/store";
import { addDays, cn, fmtDay, money, moneyShort, today } from "@/lib/format";
import { PERIODS, inRange, lastMonths, ranges, type Period, type Range } from "@/lib/dashboard";
import { balances, missingFile, perMonth, type AccTransaction, type TxKind } from "@/lib/accounting";

// TOSS Accounting dashboard: money in / out / net and available funds, vs the period before (or all
// time); 12 months of out / in / net; where the money comes from (incoming categories and senders);
// where it goes (categories vs budget, merchants, people, payment methods); account balances; what
// needs attention; the latest transactions. Everything opens the tracker filtered.

// "All time" is Accounting's own: total money in / out since the first transaction.
type AccPeriod = Period | "all";
const ACC_PERIODS: { v: AccPeriod; label: string }[] = [...PERIODS, { v: "all", label: "All time" }];
const accRanges = (p: AccPeriod, t: string) => (p === "all" ? { cur: { from: "1900-01-01", to: t }, prev: null } : ranges(p, t));
type Chart = "out" | "in" | "net";

const days = (r: Range) => Math.round((new Date(r.to).getTime() - new Date(r.from).getTime()) / 86400000) + 1;

export default function AccountingDashboard() {
  const { memberName, me } = useStore();
  const { txs, categories, merchants, methods, accounts, recurring, settings } = useAcc();
  const [period, setPeriod] = useState<AccPeriod>("month");
  const [chart, setChart] = useState<Chart>("out");
  const [adding, setAdding] = useState<TxKind | null>(null);
  const [editing, setEditing] = useState<AccTransaction | null>(null);
  const t = today();
  const { cur, prev } = accRanges(period, t);
  const periodLabel = ACC_PERIODS.find((p) => p.v === period)!.label.toLowerCase();

  const sum = (kind: TxKind, r: Range) => txs.rows.filter((x) => x.kind === kind && inRange(x.date, r)).reduce((s, x) => s + Number(x.amount), 0);
  const inCur = sum("income", cur);
  const outCur = sum("expense", cur);
  const inPrev = prev ? sum("income", prev) : undefined;
  const outPrev = prev ? sum("expense", prev) : undefined;
  const bal = balances(accounts.rows, txs.rows, methods.rows);
  const cash = accounts.rows.filter((a) => a.active && a.kind !== "card").reduce((s, a) => s + (bal.get(a.id) ?? 0), 0);
  const cardDebt = accounts.rows.filter((a) => a.active && a.kind === "card").reduce((s, a) => s + (bal.get(a.id) ?? 0), 0);
  const fixed = recurring.rows.filter((r) => r.active && r.kind === "expense").reduce((s, r) => s + perMonth(r), 0);
  const missing = txs.rows.filter((x) => missingFile(x, settings));
  const uncategorized = txs.rows.filter((x) => x.kind !== "transfer" && !x.category_id);
  const months = lastMonths(12, t).map((m) => ({ ...m, out: sum("expense", m), in: sum("income", m) }));

  const spent = txs.rows.filter((x) => x.kind === "expense" && inRange(x.date, cur));
  // Budgets are monthly; over "all time" they don't apply.
  const factor = period === "all" ? 0 : days(cur) / 30.44;
  const byCat = categories.rows
    .filter((c) => c.kind === "expense")
    .map((c) => {
      const kids = new Set([c.id, ...categories.rows.filter((x) => x.parent_id === c.id).map((x) => x.id)]);
      const v = spent.filter((x) => x.category_id && (c.parent_id ? x.category_id === c.id : kids.has(x.category_id))).reduce((s, x) => s + Number(x.amount), 0);
      return { c, v, budget: c.budget_monthly ? Number(c.budget_monthly) * factor : 0 };
    })
    .filter((x) => !x.c.parent_id && (x.v || x.budget))
    .sort((a, b) => b.v - a.v);
  const over = byCat.filter((x) => x.budget && x.v > x.budget);
  const group = (key: (x: AccTransaction) => string | null) => {
    const m = new Map<string, number>();
    for (const x of spent) {
      const k = key(x);
      if (k) m.set(k, (m.get(k) || 0) + Number(x.amount));
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };
  const byMerchant = group((x) => merchants.rows.find((m) => m.id === x.merchant_id)?.name || x.counterparty);
  const byPerson = group((x) => (x.processed_by ? memberName(x.processed_by) : null));
  const byMethod = group((x) => methods.rows.find((m) => m.id === x.payment_method_id)?.name || null);
  const maxCat = Math.max(1, ...byCat.map((x) => Math.max(x.v, x.budget)));
  // Where the money came from: incoming by category, and by who sent it.
  const received = txs.rows.filter((x) => x.kind === "income" && inRange(x.date, cur));
  const inByCat = categories.rows
    .filter((c) => c.kind === "income" && !c.parent_id)
    .map((c) => {
      const kids = new Set([c.id, ...categories.rows.filter((x) => x.parent_id === c.id).map((x) => x.id)]);
      return { c, v: received.filter((x) => x.category_id && kids.has(x.category_id)).reduce((s, x) => s + Number(x.amount), 0) };
    })
    .filter((x) => x.v)
    .sort((a, b) => b.v - a.v);
  const inUncat = received.filter((x) => !x.category_id).reduce((s, x) => s + Number(x.amount), 0);
  const maxIn = Math.max(1, inUncat, ...inByCat.map((x) => x.v));
  const bySource = (() => {
    const m = new Map<string, number>();
    for (const x of received) if (x.counterparty) m.set(x.counterparty, (m.get(x.counterparty) || 0) + Number(x.amount));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  })();
  const due = recurring.rows.filter((r) => r.active && r.next_date <= addDays(t, 7));
  const pending = txs.rows.filter((x) => x.status === "pending");

  type Alert = { key: string; icon: typeof AlertTriangle; text: string; href: string; tone: "red" | "amber" };
  const attention: Alert[] = [];
  if (missing.length) attention.push({ key: "rec", icon: Receipt, text: `${missing.length} transaction${missing.length > 1 ? "s" : ""} missing a receipt / proof`, href: "/accounting/transactions?range=all&missing=1", tone: "amber" });
  if (uncategorized.length) attention.push({ key: "unc", icon: FolderTree, text: `${uncategorized.length} uncategorized`, href: "/accounting/transactions?range=all&uncategorized=1", tone: "amber" });
  for (const r of due.filter((r) => r.next_date < t)) attention.push({ key: `od${r.id}`, icon: Repeat, text: `${r.name} overdue since ${fmtDay(r.next_date)} · ${money(Number(r.amount))}`, href: "/accounting/recurring", tone: "red" });
  const dueSoon = due.filter((r) => r.next_date >= t);
  if (dueSoon.length) attention.push({ key: "due", icon: Repeat, text: `${dueSoon.length} recurring due this week · ${money(dueSoon.reduce((s, r) => s + Number(r.amount), 0), { cents: false })}`, href: "/accounting/recurring", tone: "amber" });
  for (const x of over) attention.push({ key: `ob${x.c.id}`, icon: AlertTriangle, text: `${x.c.name} over budget: ${money(x.v, { cents: false })} of ${money(x.budget, { cents: false })}`, href: `/accounting/transactions?category=${x.c.id}`, tone: "red" });
  if (pending.length) attention.push({ key: "pen", icon: ArrowLeftRight, text: `${pending.length} pending (not cleared in the bank)`, href: "/accounting/transactions?range=all", tone: "amber" });

  const firstName = (me.fullName || "").split(" ")[0];
  const recent = [...txs.rows].sort((a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at)).slice(0, 8);
  const who = (x: AccTransaction) =>
    x.kind === "expense" ? merchants.rows.find((m) => m.id === x.merchant_id)?.name || x.counterparty || "—" : x.kind === "income" ? x.counterparty || "—" : `${accounts.rows.find((a) => a.id === x.account_id)?.name} → ${accounts.rows.find((a) => a.id === x.to_account_id)?.name}`;

  return (
    <Page>
      <PageHeader
        eyebrow={`TOSS Accounting · ${new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}`}
        title={firstName ? `Money, ${firstName}` : "Money"}
        actions={
          <>
            <Segmented value={period} onChange={setPeriod} options={ACC_PERIODS.map((p) => ({ value: p.v, label: p.label }))} className="scrollbar-none overflow-x-auto" />
            <Button variant="secondary" onClick={() => setAdding("income")}>
              <ArrowDownLeft className="h-4 w-4" /> Incoming
            </Button>
            <Button variant="primary" onClick={() => setAdding("expense")}>
              <Plus className="h-4 w-4" /> Expense
            </Button>
          </>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Money in" value={money(inCur, { cents: false })} cur={inCur} prev={inPrev} sub={prev ? "vs before" : "Total received"} href="/accounting/transactions?kind=income" />
        <Kpi label="Money out" value={money(outCur, { cents: false })} cur={outCur} prev={outPrev} lowerIsBetter sub={prev ? "vs before" : "Total spent"} href="/accounting/transactions?kind=expense" />
        <Kpi label="Net" value={money(inCur - outCur, { cents: false })} cur={inCur - outCur} prev={prev ? inPrev! - outPrev! : undefined} sub={periodLabel} />
        <Kpi label="Available funds" value={money(cash, { cents: false })} sub={cardDebt ? `${money(cardDebt, { cents: false })} on cards` : "Banks, cash, online"} href="/accounting/setup?tab=accounts" />
        <Kpi label="Fixed costs / month" value={money(fixed, { cents: false })} sub="Recurring expenses" href="/accounting/recurring" />
        <Kpi label="Missing receipts" value={String(missing.length)} sub={missing.length ? "Need a file" : "All filed"} href="/accounting/transactions?range=all&missing=1" />
      </div>

      <div className="mb-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3 sm:px-5">
            <span className="text-[14px] font-semibold text-fg">{chart === "out" ? "Money out" : chart === "in" ? "Money in" : "Net"} · last 12 months</span>
            <Segmented
              value={chart}
              onChange={setChart}
              options={[
                { value: "out", label: "Out" },
                { value: "in", label: "In" },
                { value: "net", label: "Net" },
              ]}
            />
          </div>
          <div className="p-4 sm:p-5">
            {chart === "net" ? (
              <LineChart data={months.map((m) => ({ label: m.label, value: Math.round(m.in - m.out), sub: `In ${moneyShort(m.in)} · Out ${moneyShort(m.out)}` }))} format={(v) => moneyShort(v)} height={200} />
            ) : (
              <BarChart
                data={months.map((m) => ({ label: m.label, value: Math.round(chart === "out" ? m.out : m.in), sub: chart === "out" ? `In ${moneyShort(m.in)} · Net ${moneyShort(m.in - m.out)}` : `Out ${moneyShort(m.out)} · Net ${moneyShort(m.in - m.out)}` }))}
                format={(v) => moneyShort(v)}
                height={200}
              />
            )}
          </div>
        </Card>
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
                    <a.icon className={cn("mt-0.5 h-4 w-4 shrink-0", a.tone === "red" ? red : amber)} />
                    <span className="text-[13px] text-fg">{a.text}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3">
        <Panel title={`Spending by category · ${periodLabel}`} href="/accounting/transactions?kind=expense" icon={FolderTree}>
          {byCat.length === 0 ? (
            <div className="text-sm text-fg-4">No expenses {periodLabel}.</div>
          ) : (
            <div className="space-y-2.5">
              {byCat.map((x) => (
                <Link key={x.c.id} href={`/accounting/transactions?category=${x.c.id}`} className="block">
                  <BarRow label={x.c.name} value={x.v} max={maxCat} right={x.budget ? `${moneyShort(x.v)} / ${moneyShort(x.budget)}` : moneyShort(x.v)} color={x.budget && x.v > x.budget ? "bg-red-500" : ""} />
                </Link>
              ))}
            </div>
          )}
        </Panel>

        <Panel title={`Incoming by category · ${periodLabel}`} href="/accounting/transactions?kind=income" icon={ArrowDownLeft}>
          {inByCat.length === 0 && !inUncat ? (
            <div className="text-sm text-fg-4">No money in {periodLabel}.</div>
          ) : (
            <div className="space-y-2.5">
              {inByCat.map((x) => (
                <Link key={x.c.id} href={`/accounting/transactions?category=${x.c.id}`} className="block">
                  <BarRow label={x.c.name} value={x.v} max={maxIn} right={moneyShort(x.v)} color="bg-emerald-500" />
                </Link>
              ))}
              {inUncat > 0 && <BarRow label="Uncategorized" value={inUncat} max={maxIn} right={moneyShort(inUncat)} color="bg-emerald-500/50" />}
            </div>
          )}
        </Panel>

        <Panel title={`Where it came from · ${periodLabel}`} href="/accounting/transactions?kind=income" icon={Landmark}>
          {bySource.length === 0 ? (
            <div className="text-sm text-fg-4">No money in {periodLabel}.</div>
          ) : (
            <div className="space-y-2">
              {bySource.slice(0, 8).map(([n, v]) => (
                <BarRow key={n} label={n} value={v} max={bySource[0][1]} right={moneyShort(v)} color="bg-emerald-500" />
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Top merchants" href="/accounting/setup?tab=merchants" icon={Store}>
          {byMerchant.length === 0 ? (
            <div className="text-sm text-fg-4">No expenses {periodLabel}.</div>
          ) : (
            <div className="space-y-2">
              {byMerchant.slice(0, 8).map(([n, v]) => (
                <BarRow key={n} label={n} value={v} max={byMerchant[0][1]} right={moneyShort(v)} />
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Account balances" href="/accounting/setup?tab=accounts" icon={Landmark}>
          {accounts.rows.length === 0 ? (
            <div className="text-sm text-fg-4">
              Add TOSS&apos;s accounts on{" "}
              <Link href="/accounting/setup?tab=accounts" className="underline">
                Setup
              </Link>
              .
            </div>
          ) : (
            <ul className="space-y-2 text-[13px]">
              {accounts.rows
                .filter((a) => a.active)
                .map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-2">
                    <span className="inline-flex min-w-0 items-center gap-2 text-fg-2">
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: a.color || "#9ca3af" }} />
                      <span className="truncate">{a.name}</span>
                    </span>
                    <span className={cn("tnum font-semibold", (bal.get(a.id) ?? 0) < 0 ? red : "text-fg")}>{money(bal.get(a.id) ?? 0)}</span>
                  </li>
                ))}
            </ul>
          )}
        </Panel>

        <Panel title={`By person · ${periodLabel}`} href="/accounting/transactions" icon={Users}>
          {byPerson.length === 0 ? <div className="text-sm text-fg-4">—</div> : <div className="space-y-2">{byPerson.slice(0, 8).map(([n, v]) => <BarRow key={n} label={n} value={v} max={byPerson[0][1]} right={moneyShort(v)} color="bg-violet-500" />)}</div>}
        </Panel>

        <Panel title={`By payment method · ${periodLabel}`} href="/accounting/setup?tab=methods" icon={CreditCard}>
          {byMethod.length === 0 ? <div className="text-sm text-fg-4">—</div> : <div className="space-y-2">{byMethod.slice(0, 8).map(([n, v]) => <BarRow key={n} label={n} value={v} max={byMethod[0][1]} right={moneyShort(v)} color="bg-sky-500" />)}</div>}
        </Panel>

        <Panel title="Latest transactions" href="/accounting/transactions?range=all" icon={ArrowLeftRight}>
          {recent.length === 0 ? (
            <div className="text-sm text-fg-4">Nothing recorded yet.</div>
          ) : (
            <ul className="space-y-1.5 text-[13px]">
              {recent.map((x) => (
                <li key={x.id}>
                  <button type="button" onClick={() => setEditing(x)} className="flex w-full items-center gap-2 rounded-md px-1 py-0.5 text-left hover:bg-surface-2/60">
                    {x.kind === "income" ? <ArrowDownLeft className="h-3.5 w-3.5 shrink-0 text-emerald-500" /> : x.kind === "expense" ? <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-fg-4" /> : <ArrowLeftRight className="h-3.5 w-3.5 shrink-0 text-sky-500" />}
                    <span className="min-w-0 flex-1 truncate text-fg-2">{who(x)}</span>
                    <span className="text-[11px] text-fg-4">{fmtDay(x.date)}</span>
                    <span className={cn("tnum w-20 shrink-0 text-right font-semibold", x.kind === "income" ? "text-emerald-600 dark:text-emerald-400" : "text-fg")}>
                      {x.kind === "expense" ? "−" : x.kind === "income" ? "+" : ""}
                      {moneyShort(Number(x.amount))}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <TxModal open={!!adding} kind={adding || "expense"} onClose={() => setAdding(null)} />
      <TxModal open={!!editing} kind={editing?.kind || "expense"} tx={editing} onClose={() => setEditing(null)} />
    </Page>
  );
}
