"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FileSignature, FileText, GitBranch, LayoutGrid, Package, Plus, Search, Target, X } from "lucide-react";
import { ButtonLink } from "@/components/ui/Button";
import { Card, Empty, Page, PageHeader, Pill, Tabs } from "@/components/ui/Bits";
import { SalesProvider, useSales } from "@/components/sales/SalesProvider";
import { SalesDashboard } from "@/components/sales/SalesDashboard";
import { Opportunities } from "@/components/sales/Opportunities";
import { PipelinesSetup } from "@/components/sales/Pipelines";
import { Products } from "@/components/sales/Products";
import { Templates } from "@/components/sales/Templates";
import { AgreementsList } from "@/components/sales/Agreements";
import { useStore } from "@/lib/store";
import { CompanyFilter } from "@/components/layout/CompanyFilter";
import { fmtDay, money } from "@/lib/format";
import { Input, Select } from "@/components/ui/Field";
import { isOpen, oppNumber, type Template } from "@/lib/sales";
import { PAY_META, balance, isSalesInvoice, payState, type PayState } from "@/lib/invoice";
import type { Invoice } from "@/lib/types";

// Sales like GHL: a dashboard, Opportunities (board / list per pipeline), Pipelines (stages, lost
// reasons, custom fields), Products, Templates & Agreements and Invoices.

type Tab = "dashboard" | "opportunities" | "pipelines" | "products" | "templates" | "invoices";
const TABS: Tab[] = ["dashboard", "opportunities", "pipelines", "products", "templates", "invoices"];

/** True when a template belongs to Sales (excludes driver HR / compliance files like Employment Application or Drug & Alcohol Policy). */
export function isSalesTemplate(t: Template): boolean {
  const name = (t.name || "").trim().toLowerCase();
  const file = (t.file_name || "").trim().toLowerCase();
  const hay = `${name} ${file}`;
  if (
    name === "emp" ||
    name === "policy" ||
    hay.includes("employment application") ||
    hay.includes("drug and alcohol") ||
    hay.includes("drug & alcohol")
  ) {
    return false;
  }
  return true;
}

function invoiceServiceLabel(i: Invoice): string {
  const num = (i.invoice_number || "").toUpperCase();
  const svc = (i.doc_overrides as { service?: string } | null)?.service;
  if (num.endsWith("-DC") || svc === "dot_compliance" || svc === "mcs150") return "DOT Compliance (-DC)";
  if (num.endsWith("-TP") || svc === "mcpt" || svc === "ifta" || svc === "ucr" || svc === "boc3") return "Taxes & Permits · MCPT (-TP)";
  if (num.endsWith("-D") || svc === "dispatch" || i.invoice_type === "load") return "Dispatch (-D)";
  return "Product / Service";
}

export default function SalesPage() {
  return (
    <Suspense>
      <SalesProvider>
        <Sales />
      </SalesProvider>
    </Suspense>
  );
}

function Sales() {
  const params = useSearchParams();
  const tab: Tab = TABS.find((t) => t === params.get("tab")) || "dashboard";
  const { inScope, invoices } = useStore();
  const { opps, products, templates, pipelines, agreements } = useSales();
  const salesTemplates = templates.rows.filter(isSalesTemplate);
  const inv = invoices.filter((i) => isSalesInvoice(i) && (!i.company_id || inScope(i.company_id)));

  return (
    <Page>
      <PageHeader eyebrow={<CompanyFilter />} title="Sales" />
      <Tabs<Tab>
        value={tab}
        onChange={(v) => window.history.replaceState(null, "", `/sales?tab=${v}`)}
        className="mb-5"
        tabs={[
          { value: "dashboard", label: <><LayoutGrid className="h-4 w-4" /> Dashboard</> },
          { value: "opportunities", label: <><Target className="h-4 w-4" /> Opportunities</>, count: opps.rows.filter((o) => isOpen(o) && inScope(o.company_id)).length },
          { value: "pipelines", label: <><GitBranch className="h-4 w-4" /> Pipelines</>, count: pipelines.rows.length },
          { value: "products", label: <><Package className="h-4 w-4" /> Products</>, count: products.rows.filter((p) => p.active).length },
          { value: "templates", label: <><FileSignature className="h-4 w-4" /> Templates & Agreements</>, count: salesTemplates.length + agreements.rows.length },
          { value: "invoices", label: <><FileText className="h-4 w-4" /> Invoices</>, count: inv.filter((i) => ["open", "partial", "overdue"].includes(payState(i))).length },
        ]}
      />
      {tab === "dashboard" && <SalesDashboard />}
      {tab === "opportunities" && <Opportunities />}
      {tab === "pipelines" && <PipelinesSetup />}
      {tab === "products" && <Products products={products.rows} put={products.put} drop={products.drop} />}
      {tab === "templates" && (
        <div className="space-y-5">
          <AgreementsList />
          <Templates templates={salesTemplates} put={templates.put} drop={templates.drop} />
        </div>
      )}
      {tab === "invoices" && <SalesInvoices />}
    </Page>
  );
}

/** Sales & Product invoices (Taxes & Permits -TP, DOT Compliance -DC, etc.). Dispatch load invoices are excluded. */
function SalesInvoices() {
  const router = useRouter();
  const { invoices, inScope } = useStore();
  const { opps } = useSales();
  const [q, setQ] = useState("");
  const [svcFilter, setSvcFilter] = useState<"all" | "TP" | "DC">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | PayState>("all");

  const list = invoices
    .filter((i) => isSalesInvoice(i) && (!i.company_id || inScope(i.company_id)))
    .filter((i) => {
      if (svcFilter === "TP") {
        const svc = (i.doc_overrides as { service?: string } | null)?.service;
        return (i.invoice_number || "").toUpperCase().endsWith("-TP") || svc === "mcpt";
      }
      if (svcFilter === "DC") {
        const svc = (i.doc_overrides as { service?: string } | null)?.service;
        return (i.invoice_number || "").toUpperCase().endsWith("-DC") || svc === "dot_compliance" || svc === "mcs150";
      }
      return true;
    })
    .filter((i) => statusFilter === "all" || payState(i) === statusFilter)
    .filter((i) => {
      const s = q.trim().toLowerCase();
      if (!s) return true;
      return `${i.invoice_number} ${i.bill_to_name} ${i.notes || ""}`.toLowerCase().includes(s);
    })
    .sort((a, b) => b.issue_date.localeCompare(a.issue_date));

  const won = opps.rows.filter((o) => o.status === "won" && inScope(o.company_id)).sort((a, b) => (b.closed_at || "").localeCompare(a.closed_at || ""));
  return (
    <>
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-4" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search invoice #, customer or product…" className="pl-9" />
          {q && (
            <button onClick={() => setQ("")} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-fg-4 hover:text-fg" aria-label="Clear search">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={svcFilter} onChange={(e) => setSvcFilter(e.target.value as typeof svcFilter)} className="w-auto" aria-label="Service filter">
            <option value="all">All services</option>
            <option value="TP">Taxes &amp; Permits (-TP)</option>
            <option value="DC">DOT Compliance (-DC)</option>
          </Select>
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)} className="w-auto" aria-label="Status filter">
            <option value="all">All statuses</option>
            <option value="draft">Draft</option>
            <option value="open">Sent</option>
            <option value="partial">Part paid</option>
            <option value="overdue">Overdue</option>
            <option value="paid">Paid</option>
            <option value="void">Void</option>
          </Select>
          {won.length > 0 && (
            <Select
              value=""
              onChange={(e) => e.target.value && router.push(`/invoices/new?from=sales&opportunity=${e.target.value}`)}
              className="w-auto"
              aria-label="Invoice from opportunity"
            >
              <option value="">Invoice from a won opportunity…</option>
              {won.map((o) => (
                <option key={o.id} value={o.id}>
                  {oppNumber(o)} {o.title} · {money(Number(o.value), { cents: false })}
                </option>
              ))}
            </Select>
          )}
          <ButtonLink href="/invoices/new?from=sales" variant="primary">
            <Plus className="h-4 w-4" /> New invoice
          </ButtonLink>
        </div>
      </div>
      {list.length === 0 ? (
        <Card>
          <Empty
            icon={FileText}
            title="No sales invoices yet"
            body="Create an invoice for Taxes & Permits (-TP), DOT Compliance (-DC), or any product from a won opportunity or by hand."
            action={
              <ButtonLink href="/invoices/new?from=sales" variant="primary">
                <Plus className="h-4 w-4" /> New invoice
              </ButtonLink>
            }
          />
        </Card>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-[13px]">
            <thead>
              <tr className="border-b border-line text-left text-[11px] uppercase tracking-wider text-fg-4">
                <th className="px-4 py-2 font-semibold">Invoice</th>
                <th className="px-3 py-2 font-semibold">Bill to</th>
                <th className="px-3 py-2 font-semibold">Issued</th>
                <th className="px-3 py-2 font-semibold">Status</th>
                <th className="px-3 py-2 text-right font-semibold">Total</th>
                <th className="px-4 py-2 text-right font-semibold">Owed</th>
              </tr>
            </thead>
            <tbody>
              {list.map((i) => {
                const st = PAY_META[payState(i)];
                return (
                  <tr
                    key={i.id}
                    onClick={() => router.push(`/invoices/${i.id}?from=sales`)}
                    className="cursor-pointer border-b border-line last:border-b-0 hover:bg-surface-2/50"
                  >
                    <td className="px-4 py-2.5">
                      <Link href={`/invoices/${i.id}?from=sales`} onClick={(e) => e.stopPropagation()} className="font-medium text-fg hover:underline">
                        {i.invoice_number}
                      </Link>
                      <div className="text-[11px] text-fg-4">{invoiceServiceLabel(i)}</div>
                    </td>
                    <td className="px-3 py-2.5 text-fg-2">{i.bill_to_name || "—"}</td>
                    <td className="px-3 py-2.5 text-fg-2">{fmtDay(i.issue_date)}</td>
                    <td className="px-3 py-2.5">
                      <Pill className={st.pill}>{st.label}</Pill>
                    </td>
                    <td className="tnum px-3 py-2.5 text-right text-fg">{money(Number(i.total_due))}</td>
                    <td className="tnum px-4 py-2.5 text-right font-medium text-fg">{money(balance(i))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
