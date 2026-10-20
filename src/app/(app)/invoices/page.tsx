"use client";

import Link from "next/link";
import { Suspense, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, Plus, Search, Receipt, ChevronRight, Download } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { Card, CardHeader, Empty, Page, PageHeader, Pill, Stat } from "@/components/ui/Bits";
import { CountUp, MotionTabs, Progress, stagger } from "@/components/ui/Motion";
import { InvoiceBuilder, useBillable } from "@/components/invoices/InvoiceBuilder";
import { useStore } from "@/lib/store";
import { AGING, PAY_META, aging, balance, payState, type PayState } from "@/lib/invoice";
import { downloadCsv } from "@/lib/csv";
import { cn, daysUntil, fmtDay, money, today } from "@/lib/format";

type Tab = "all" | PayState;
const TABS: Tab[] = ["all", "draft", "open", "partial", "overdue", "paid", "void"];
const usd = (n: number) => money(n);

export default function InvoicesPage() {
  return (
    <Suspense>
      <Invoices />
    </Suspense>
  );
}

function Invoices() {
  const router = useRouter();
  const { invoices, payments, companies, inScope, scopedCompany, companyById } = useStore();
  const billable = useBillable();
  const [builder, setBuilder] = useState<{ open: boolean; companyId?: string | null }>({ open: false });
  const [tab, setTab] = useState<Tab>("all");
  const [q, setQ] = useState("");

  // Custom invoices have no carrier; they show under "All companies" only.
  const scoped = useMemo(() => invoices.filter((i) => (i.company_id ? inScope(i.company_id) : !scopedCompany)), [invoices, inScope, scopedCompany]);
  const ready = billable.filter((l) => inScope(l.company_id));
  const readyByCompany = useMemo(() => {
    const m = new Map<string, typeof ready>();
    for (const l of ready) m.set(l.company_id, [...(m.get(l.company_id) || []), l]);
    return [...m.entries()].map(([id, ls]) => ({ company: companyById(id)!, loads: ls })).filter((x) => x.company);
  }, [ready, companyById]);

  const stats = useMemo(() => {
    const month = today().slice(0, 7);
    const dollars = scoped.filter((i) => i.currency === "USD");
    const open = dollars.filter((i) => balance(i) > 0);
    const overdue = dollars.filter((i) => payState(i) === "overdue");
    const ids = new Set(dollars.map((i) => i.id));
    // Cash actually received this month (from payments, so part payments count).
    const received = payments.filter((p) => ids.has(p.invoice_id) && p.paid_on.startsWith(month)).reduce((s, p) => s + p.amount, 0);
    return {
      outstanding: open.reduce((s, i) => s + balance(i), 0),
      openCount: open.length,
      overdue: overdue.reduce((s, i) => s + balance(i), 0),
      overdueCount: overdue.length,
      received,
      readyFee: ready.reduce((s, l) => s + l.dispatcher_cut, 0),
    };
  }, [scoped, payments, ready]);

  const ages = useMemo(() => aging(scoped), [scoped]);
  const ageTotal = AGING.reduce((s, a) => s + ages[a.key].amount, 0);
  // Who owes the most (open balance by carrier / customer).
  const owed = useMemo(() => {
    const m = new Map<string, { name: string; amount: number; late: number }>();
    for (const i of scoped) {
      const b = balance(i);
      if (!b || i.currency !== "USD") continue;
      const k = i.company_id || i.bill_to_name || "—";
      const row = m.get(k) || { name: i.bill_to_name || companyById(i.company_id || "")?.name || "—", amount: 0, late: 0 };
      row.amount += b;
      if (payState(i) === "overdue") row.late += b;
      m.set(k, row);
    }
    return [...m.values()].sort((a, b) => b.amount - a.amount).slice(0, 5);
  }, [scoped, companyById]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: scoped.length };
    scoped.forEach((i) => (c[payState(i)] = (c[payState(i)] || 0) + 1));
    return c;
  }, [scoped]);

  const list = scoped
    .filter((i) => tab === "all" || payState(i) === tab)
    .filter((i) => !q || `${i.invoice_number} ${i.bill_to_name}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => b.issue_date.localeCompare(a.issue_date) || b.created_at.localeCompare(a.created_at));

  return (
    <Page>
      <PageHeader
        eyebrow={scopedCompany ? scopedCompany.name : "All companies"}
        title="Invoices"
        actions={
          <>
            <Button
              variant="outline"
              onClick={() =>
                downloadCsv(`invoices-${today()}.csv`, [
                  ["Number", "Bill to", "Type", "Issued", "Auto charge date", "Status", "Currency", "Load gross", "Amount", "Paid", "Balance"],
                  ...list.map((i) => [i.invoice_number, i.bill_to_name, i.invoice_type, i.issue_date, i.due_date, PAY_META[payState(i)].label, i.currency, i.total_gross, i.total_due, i.amount_paid, balance(i)]),
                ])
              }
            >
              <Download className="h-4 w-4" /> <span className="hidden sm:inline">CSV</span>
            </Button>
            <ButtonLink href="/invoices/new" variant="outline">
              <Plus className="h-4 w-4" /> Custom
            </ButtonLink>
            <Button variant="primary" onClick={() => setBuilder({ open: true, companyId: scopedCompany?.id })} disabled={!companies.length}>
              <Receipt className="h-4 w-4" /> Bill loads
            </Button>
          </>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Ready to bill", value: stats.readyFee, sub: `${ready.length} delivered load${ready.length === 1 ? "" : "s"}` },
          { label: "Outstanding", value: stats.outstanding, sub: `${stats.openCount} unpaid invoice${stats.openCount === 1 ? "" : "s"}` },
          { label: "Overdue", value: stats.overdue, sub: `${stats.overdueCount} past due`, red: stats.overdue > 0 },
          { label: "Received this month", value: stats.received, sub: "Payments recorded" },
        ].map((s, i) => (
          <Stat
            key={s.label}
            className="animate-rise"
            label={s.label}
            value={
              <span className={s.red ? "text-red-600 dark:text-red-400" : undefined}>
                <CountUp value={s.value} format={usd} />
              </span>
            }
            sub={s.sub}
            style={stagger(i, 50)}
          />
        ))}
      </div>

      {(ageTotal > 0 || readyByCompany.length > 0) && (
        <div className="mb-5 grid grid-cols-1 gap-5 xl:grid-cols-2">
          {ageTotal > 0 && (
            <Card className="animate-rise" style={stagger(4, 50)}>
              <CardHeader title="Receivables aging" subtitle={`${money(ageTotal)} unpaid, by days past due`} />
              <div className="space-y-4 p-4 sm:p-5">
                <div className="flex h-3 overflow-hidden rounded-full bg-surface-3">
                  {AGING.map((a, i) =>
                    ages[a.key].amount > 0 ? (
                      <div
                        key={a.key}
                        className={cn("animate-grow h-full first:rounded-l-full last:rounded-r-full", a.tone)}
                        style={{ width: `${(ages[a.key].amount / ageTotal) * 100}%`, ...stagger(i, 90) }}
                        title={`${a.label}: ${money(ages[a.key].amount)}`}
                      />
                    ) : null,
                  )}
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 sm:grid-cols-5">
                  {AGING.map((a, i) => (
                    <div key={a.key} className="animate-rise min-w-0" style={stagger(i + 2, 40)}>
                      <div className="flex items-center gap-1.5 text-[11px] font-medium text-fg-3">
                        <span className={cn("h-2 w-2 rounded-full", a.tone)} />
                        {a.label}
                      </div>
                      <div className={cn("tnum mt-0.5 text-sm font-bold", ages[a.key].amount ? "text-fg" : "text-fg-4")}>{money(ages[a.key].amount, { cents: false })}</div>
                      <div className="text-[11px] text-fg-4">
                        {ages[a.key].count} invoice{ages[a.key].count === 1 ? "" : "s"}
                      </div>
                    </div>
                  ))}
                </div>
                {owed.length > 0 && (
                  <div className="border-t border-line pt-3">
                    <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-fg-4">Largest balances</div>
                    <ul className="space-y-2">
                      {owed.map((o, i) => (
                        <li key={o.name} className="animate-rise" style={stagger(i + 4, 40)}>
                          <div className="flex items-center justify-between gap-3 text-[13px]">
                            <span className="truncate text-fg">{o.name}</span>
                            <span className="tnum shrink-0 font-semibold text-fg">
                              {money(o.amount)}
                              {o.late > 0 && <span className="ml-1.5 text-xs font-medium text-red-600 dark:text-red-400">{money(o.late, { cents: false })} late</span>}
                            </span>
                          </div>
                          <Progress value={(o.amount / owed[0].amount) * 100} tone={o.late ? "bg-red-500" : "bg-fg-3"} className="mt-1 h-1" />
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </Card>
          )}

          {readyByCompany.length > 0 && (
            <Card className="animate-rise self-start" style={stagger(5, 50)}>
              <CardHeader title="Ready to bill" subtitle="Delivered loads not on an invoice yet" />
              <ul className="divide-y divide-line">
                {readyByCompany.map(({ company, loads }, i) => {
                  const fee = loads.reduce((s, l) => s + l.dispatcher_cut, 0);
                  const oldest = loads.reduce((m, l) => (l.delivery_date && (!m || l.delivery_date < m) ? l.delivery_date : m), "" as string);
                  const age = oldest ? -(daysUntil(oldest) || 0) : 0;
                  return (
                    <li key={company.id} className="animate-rise flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5" style={stagger(i + 2)}>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-fg">{company.name}</div>
                        <div className="text-xs text-fg-3">
                          {loads.length} load{loads.length === 1 ? "" : "s"} · {company.commission_percent}% · billed {company.billing_cadence}
                          {age > 7 && <span className="text-amber-700 dark:text-amber-300"> · oldest delivered {age} days ago</span>}
                        </div>
                      </div>
                      <div className="tnum text-sm font-bold text-fg">{money(fee)}</div>
                      <Button size="sm" variant="secondary" onClick={() => setBuilder({ open: true, companyId: company.id })}>
                        Create invoice
                      </Button>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}
        </div>
      )}

      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="scrollbar-none -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <MotionTabs
            value={tab}
            onChange={setTab}
            options={TABS.filter((t) => t === "all" || t === tab || counts[t]).map((t) => ({ value: t, label: t === "all" ? "All" : PAY_META[t].label, count: counts[t] || 0 }))}
          />
        </div>
        <div className="relative sm:ml-auto sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-4" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Number or customer" className="pl-9" />
        </div>
      </div>

      {list.length === 0 ? (
        <Card className="animate-rise">
          <Empty icon={FileText} title={scoped.length ? "No invoices here" : "No invoices yet"} body={scoped.length ? undefined : "Bill delivered loads to a carrier, or create a custom invoice."} />
        </Card>
      ) : (
        <>
          <Card className="hidden overflow-hidden md:block">
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className="border-b border-line text-[11px] font-semibold uppercase tracking-wider text-fg-4">
                  <th className="px-4 py-2.5">Invoice</th>
                  <th className="px-3 py-2.5">Bill to</th>
                  <th className="px-3 py-2.5">Issued</th>
                  <th className="px-3 py-2.5">Auto charge</th>
                  <th className="px-3 py-2.5 text-right">Lines</th>
                  <th className="px-3 py-2.5 text-right">Amount</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="w-8" />
                </tr>
              </thead>
              {/* key: the rows rise in again when the filter changes */}
              <tbody key={tab} className="divide-y divide-line">
                {list.map((i, n) => {
                  const st = payState(i);
                  const due = daysUntil(i.due_date);
                  const left = balance(i);
                  return (
                    <tr
                      key={i.id}
                      onClick={() => router.push(`/invoices/${i.id}`)}
                      className="animate-rise group cursor-pointer transition-colors hover:bg-surface-2/60"
                      style={stagger(n, 22)}
                    >
                      <td className="px-4 py-3">
                        <div className="font-semibold text-fg">{i.invoice_number}</div>
                        <div className="text-xs text-fg-4">{i.invoice_type === "custom" ? "Custom" : "Dispatch fee"}</div>
                      </td>
                      <td className="max-w-[240px] truncate px-3 py-3 text-fg">{i.bill_to_name || "—"}</td>
                      <td className="tnum whitespace-nowrap px-3 py-3 text-fg-2">{fmtDay(i.issue_date)}</td>
                      <td className="tnum whitespace-nowrap px-3 py-3 text-fg-2">
                        {fmtDay(i.due_date)}
                        {left > 0 && due !== null && (
                          <div className={cn("text-xs", due < 0 ? "text-red-600 dark:text-red-400" : "text-fg-4")}>{due < 0 ? `${-due}d late` : due === 0 ? "today" : `in ${due}d`}</div>
                        )}
                      </td>
                      <td className="tnum px-3 py-3 text-right text-fg-2">{i.lines.length}</td>
                      <td className="tnum whitespace-nowrap px-3 py-3 text-right">
                        <div className="font-semibold text-fg">{money(i.total_due, { currency: i.currency })}</div>
                        {i.amount_paid > 0 && left > 0 && <div className="text-xs text-fg-3">{money(left, { currency: i.currency })} left</div>}
                      </td>
                      <td className="px-3 py-3">
                        <Pill className={PAY_META[st].pill} dot={PAY_META[st].dot}>
                          {PAY_META[st].label}
                        </Pill>
                      </td>
                      <td className="pr-3 text-fg-4">
                        <ChevronRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
          <div key={tab} className="grid grid-cols-1 gap-2.5 md:hidden">
            {list.map((i, n) => {
              const st = payState(i);
              const left = balance(i);
              return (
                <Link
                  key={i.id}
                  href={`/invoices/${i.id}`}
                  className="animate-rise flex items-center gap-3 rounded-xl border border-line bg-surface p-3.5 transition-transform active:scale-[0.99] active:bg-surface-2"
                  style={stagger(n, 22)}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-semibold text-fg">{i.invoice_number}</span>
                      <Pill className={PAY_META[st].pill}>{PAY_META[st].label}</Pill>
                    </div>
                    <div className="truncate text-xs text-fg-3">
                      {i.bill_to_name || "—"} · auto charge {fmtDay(i.due_date)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="tnum text-[15px] font-bold text-fg">{money(i.total_due, { currency: i.currency })}</div>
                    {i.amount_paid > 0 && left > 0 && <div className="tnum text-[11px] text-fg-3">{money(left, { currency: i.currency })} left</div>}
                  </div>
                </Link>
              );
            })}
          </div>
        </>
      )}

      <InvoiceBuilder open={builder.open} companyId={builder.companyId} onClose={() => setBuilder({ open: false })} />
    </Page>
  );
}
