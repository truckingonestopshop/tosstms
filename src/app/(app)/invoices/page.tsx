"use client";

import Link from "next/link";
import { Suspense, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, Plus, Search, Receipt, ChevronRight, Download } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { Card, CardHeader, Empty, Page, PageHeader, Pill, Stat } from "@/components/ui/Bits";
import { InvoiceBuilder, useBillable } from "@/components/invoices/InvoiceBuilder";
import { useStore } from "@/lib/store";
import { PAY_META, payState, type PayState } from "@/lib/invoice";
import { downloadCsv } from "@/lib/csv";
import { cn, daysUntil, fmtDay, money, today } from "@/lib/format";

type Tab = "all" | PayState;

export default function InvoicesPage() {
  return (
    <Suspense>
      <Invoices />
    </Suspense>
  );
}

function Invoices() {
  const router = useRouter();
  const { invoices, companies, inScope, scopedCompany, companyById } = useStore();
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
    const usd = scoped.filter((i) => i.currency === "USD");
    const open = usd.filter((i) => payState(i) === "open" || payState(i) === "overdue");
    const overdue = usd.filter((i) => payState(i) === "overdue");
    const paidMonth = usd.filter((i) => i.status === "paid" && (i.paid_at || "").startsWith(month));
    return {
      outstanding: open.reduce((s, i) => s + i.total_due, 0),
      openCount: open.length,
      overdue: overdue.reduce((s, i) => s + i.total_due, 0),
      overdueCount: overdue.length,
      paid: paidMonth.reduce((s, i) => s + i.total_due, 0),
      readyFee: ready.reduce((s, l) => s + l.dispatcher_cut, 0),
    };
  }, [scoped, ready]);

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
                  ["Number", "Bill to", "Type", "Issued", "Due", "Status", "Currency", "Load gross", "Amount"],
                  ...list.map((i) => [i.invoice_number, i.bill_to_name, i.invoice_type, i.issue_date, i.due_date, PAY_META[payState(i)].label, i.currency, i.total_gross, i.total_due]),
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
        <Stat label="Ready to bill" value={money(stats.readyFee)} sub={`${ready.length} delivered load${ready.length === 1 ? "" : "s"}`} />
        <Stat label="Outstanding" value={money(stats.outstanding)} sub={`${stats.openCount} open invoice${stats.openCount === 1 ? "" : "s"}`} />
        <Stat
          label="Overdue"
          value={<span className={stats.overdue ? "text-red-600 dark:text-red-400" : undefined}>{money(stats.overdue)}</span>}
          sub={`${stats.overdueCount} past due`}
        />
        <Stat label="Paid this month" value={money(stats.paid)} />
      </div>

      {readyByCompany.length > 0 && (
        <Card className="mb-5">
          <CardHeader title="Ready to bill" subtitle="Delivered loads not on an invoice yet" />
          <ul className="divide-y divide-line">
            {readyByCompany.map(({ company, loads }) => {
              const fee = loads.reduce((s, l) => s + l.dispatcher_cut, 0);
              const oldest = loads.reduce((m, l) => (l.delivery_date && (!m || l.delivery_date < m) ? l.delivery_date : m), "" as string);
              const age = oldest ? -(daysUntil(oldest) || 0) : 0;
              return (
                <li key={company.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
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

      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="scrollbar-none -mx-4 flex gap-1 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          {(["all", "draft", "open", "overdue", "paid", "void"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium",
                tab === t ? "bg-inverse text-inverse-fg" : "text-fg-3 hover:bg-surface-2 hover:text-fg",
              )}
            >
              {t === "all" ? "All" : PAY_META[t].label}
              <span className={cn("tnum text-[11px]", tab === t ? "opacity-70" : "text-fg-4")}>{counts[t] || 0}</span>
            </button>
          ))}
        </div>
        <div className="relative sm:ml-auto sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-4" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Number or customer" className="pl-9" />
        </div>
      </div>

      {list.length === 0 ? (
        <Card>
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
                  <th className="px-3 py-2.5">Due</th>
                  <th className="px-3 py-2.5 text-right">Lines</th>
                  <th className="px-3 py-2.5 text-right">Amount</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {list.map((i) => {
                  const st = payState(i);
                  const due = daysUntil(i.due_date);
                  return (
                    <tr key={i.id} onClick={() => router.push(`/invoices/${i.id}`)} className="cursor-pointer hover:bg-surface-2/60">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-fg">{i.invoice_number}</div>
                        <div className="text-xs text-fg-4">{i.invoice_type === "custom" ? "Custom" : "Dispatch fee"}</div>
                      </td>
                      <td className="max-w-[240px] truncate px-3 py-3 text-fg">{i.bill_to_name || "—"}</td>
                      <td className="tnum whitespace-nowrap px-3 py-3 text-fg-2">{fmtDay(i.issue_date)}</td>
                      <td className="tnum whitespace-nowrap px-3 py-3 text-fg-2">
                        {fmtDay(i.due_date)}
                        {(st === "open" || st === "overdue") && due !== null && (
                          <div className={cn("text-xs", due < 0 ? "text-red-600 dark:text-red-400" : "text-fg-4")}>{due < 0 ? `${-due}d late` : due === 0 ? "today" : `in ${due}d`}</div>
                        )}
                      </td>
                      <td className="tnum px-3 py-3 text-right text-fg-2">{i.lines.length}</td>
                      <td className="tnum whitespace-nowrap px-3 py-3 text-right font-semibold text-fg">{money(i.total_due, { currency: i.currency })}</td>
                      <td className="px-3 py-3">
                        <Pill className={PAY_META[st].pill} dot={PAY_META[st].dot}>
                          {PAY_META[st].label}
                        </Pill>
                      </td>
                      <td className="pr-3 text-fg-4">
                        <ChevronRight className="h-4 w-4" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
          <div className="grid grid-cols-1 gap-2.5 md:hidden">
            {list.map((i) => {
              const st = payState(i);
              return (
                <Link key={i.id} href={`/invoices/${i.id}`} className="flex items-center gap-3 rounded-xl border border-line bg-surface p-3.5 active:bg-surface-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-semibold text-fg">{i.invoice_number}</span>
                      <Pill className={PAY_META[st].pill}>{PAY_META[st].label}</Pill>
                    </div>
                    <div className="truncate text-xs text-fg-3">
                      {i.bill_to_name || "—"} · due {fmtDay(i.due_date)}
                    </div>
                  </div>
                  <div className="tnum text-[15px] font-bold text-fg">{money(i.total_due, { currency: i.currency })}</div>
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
