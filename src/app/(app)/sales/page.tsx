"use client";

import Link from "next/link";
import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FileSignature, FileText, GitBranch, LayoutGrid, Package, Plus, Target } from "lucide-react";
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
import { fmtDay, money } from "@/lib/format";
import { Select } from "@/components/ui/Field";
import { isOpen, oppNumber } from "@/lib/sales";
import { PAY_META, balance, payState } from "@/lib/invoice";

// Sales like GHL: a dashboard, Opportunities (board / list per pipeline), Pipelines (stages, lost
// reasons, custom fields), Products, Templates & Agreements and Invoices.

type Tab = "dashboard" | "opportunities" | "pipelines" | "products" | "templates" | "invoices";
const TABS: Tab[] = ["dashboard", "opportunities", "pipelines", "products", "templates", "invoices"];

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
  const { scopedCompany, inScope, invoices } = useStore();
  const { opps, products, templates, pipelines, agreements } = useSales();
  const inv = invoices.filter((i) => !i.company_id || inScope(i.company_id));

  return (
    <Page>
      <PageHeader eyebrow={scopedCompany ? scopedCompany.name : "All companies"} title="Sales" />
      <Tabs<Tab>
        value={tab}
        onChange={(v) => window.history.replaceState(null, "", `/sales?tab=${v}`)}
        className="mb-5"
        tabs={[
          { value: "dashboard", label: <><LayoutGrid className="h-4 w-4" /> Dashboard</> },
          { value: "opportunities", label: <><Target className="h-4 w-4" /> Opportunities</>, count: opps.rows.filter((o) => isOpen(o) && inScope(o.company_id)).length },
          { value: "pipelines", label: <><GitBranch className="h-4 w-4" /> Pipelines</>, count: pipelines.rows.length },
          { value: "products", label: <><Package className="h-4 w-4" /> Products</>, count: products.rows.filter((p) => p.active).length },
          { value: "templates", label: <><FileSignature className="h-4 w-4" /> Templates & Agreements</>, count: templates.rows.length + agreements.rows.length },
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
          <Templates templates={templates.rows} put={templates.put} drop={templates.drop} />
        </div>
      )}
      {tab === "invoices" && <SalesInvoices />}
    </Page>
  );
}

/** TOSS Cloud's invoices (dispatch fees and custom invoices), with what's still owed. */
function SalesInvoices() {
  const router = useRouter();
  const { invoices, inScope } = useStore();
  const { opps } = useSales();
  const list = invoices.filter((i) => !i.company_id || inScope(i.company_id)).sort((a, b) => b.issue_date.localeCompare(a.issue_date));
  const won = opps.rows.filter((o) => o.status === "won" && inScope(o.company_id)).sort((a, b) => (b.closed_at || "").localeCompare(a.closed_at || ""));
  return (
    <>
      <div className="mb-3 flex flex-wrap justify-end gap-2">
        {won.length > 0 && (
          <Select value="" onChange={(e) => e.target.value && router.push(`/invoices/new?opportunity=${e.target.value}`)} className="w-auto" aria-label="Invoice from opportunity">
            <option value="">Invoice from a won opportunity…</option>
            {won.map((o) => (
              <option key={o.id} value={o.id}>
                {oppNumber(o)} {o.title} · {money(Number(o.value), { cents: false })}
              </option>
            ))}
          </Select>
        )}
        <ButtonLink href="/invoices" variant="outline">
          Open Invoices
        </ButtonLink>
        <ButtonLink href="/invoices/new" variant="primary">
          <Plus className="h-4 w-4" /> New invoice
        </ButtonLink>
      </div>
      {list.length === 0 ? (
        <Card>
          <Empty icon={FileText} title="No invoices yet" />
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
                  <tr key={i.id} className="border-b border-line last:border-b-0 hover:bg-surface-2/50">
                    <td className="px-4 py-2.5">
                      <Link href={`/invoices/${i.id}`} className="font-medium text-fg hover:underline">
                        {i.invoice_number}
                      </Link>
                      <div className="text-[11px] text-fg-4">{i.invoice_type === "load" ? "Dispatch fee" : "Custom"}</div>
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
