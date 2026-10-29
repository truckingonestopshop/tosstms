"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Field, Select } from "@/components/ui/Field";
import { Page, PageHeader } from "@/components/ui/Bits";
import { InvoiceDoc } from "@/components/invoices/InvoiceDoc";
import { useStore } from "@/lib/store";
import { sb } from "@/lib/db";
import { toast } from "@/lib/toast";
import { blankDraft, blankLine, draftToRow, remittanceDefault, type InvoiceDraft } from "@/lib/invoice";
import { itemTotal, oppNumber, type OppItem, type Opportunity } from "@/lib/sales";
import type { Company, Currency } from "@/lib/types";

/** The customer block for a carrier. */
const billToDetails = (c: Company) =>
  [[c.mc_number && `MC ${c.mc_number}`, c.dot_number && `DOT ${c.dot_number}`].filter(Boolean).join(" · "), c.address, [c.contact_name, c.contact_email].filter(Boolean).join(" · ")].filter(Boolean).join("\n");

/** Free-form invoice (services outside load billing). ?opportunity= / ?company= fill it in from Sales. */
export default function NewInvoicePage() {
  return (
    <Suspense>
      <NewInvoice />
    </Suspense>
  );
}

function NewInvoice() {
  const router = useRouter();
  const params = useSearchParams();
  const oppId = params.get("opportunity");
  const companyParam = params.get("company");
  const agreementId = params.get("agreement");
  const { settings, companies, createCustomInvoice } = useStore();
  const [d, setD] = useState<InvoiceDraft | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await sb().rpc("tms_next_invoice_number");
      const draft = blankDraft(settings, (data as string) || "");
      draft.doc_overrides = { remittance_text: remittanceDefault(settings), footer_text: settings?.footer_text || "" };
      // From Sales: the opportunity's products become the lines.
      let companyId = companyParam;
      if (oppId) {
        const [o, it] = await Promise.all([sb().from("tms_opportunities").select("*").eq("id", oppId).single(), sb().from("tms_opportunity_items").select("*").eq("opportunity_id", oppId).order("sort")]);
        const opp = o.data as Opportunity | null;
        if (opp) {
          companyId = opp.company_id;
          const items = (it.data || []) as OppItem[];
          const rows = items.length
            ? items.map((i) => ({ description: i.name, quantity: Number(i.quantity), unit_price: Number(i.unit_price), amount: itemTotal(i) }))
            : [{ description: opp.title, quantity: 1, unit_price: Number(opp.value), amount: Number(opp.value) }];
          draft.lines = rows.map((r, n) => ({ ...blankLine(n), ...r, gross_amount: r.amount }));
          draft.notes = `${oppNumber(opp)} · ${opp.title}`;
        }
      }
      const c = companies.find((x) => x.id === companyId);
      if (c) Object.assign(draft, { company_id: c.id, bill_to_name: c.name, bill_to_details: billToDetails(c) });
      setD(draft);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!d) return <Page><div className="py-20 text-center text-sm text-fg-4">Preparing invoice…</div></Page>;

  const save = async () => {
    if (!d.bill_to_name?.trim()) return toast.error("Add who the invoice is for.");
    if (!d.lines.some((l) => l.description.trim() && l.amount)) return toast.error("Add at least one line with an amount.");
    setSaving(true);
    const inv = await createCustomInvoice({ invoice: draftToRow(d), lines: d.lines.filter((l) => l.description.trim() || l.amount) });
    setSaving(false);
    if (inv) {
      if (agreementId) await sb().from("tms_agreements").update({ invoice_id: inv.id }).eq("id", agreementId);
      toast.success(`Invoice ${inv.invoice_number} created`);
      router.push(`/invoices/${inv.id}`);
    }
  };

  return (
    <Page>
      <Link href="/invoices" className="mb-3 inline-flex items-center gap-1.5 text-[13px] text-fg-3 hover:text-fg">
        <ArrowLeft className="h-3.5 w-3.5" /> Invoices
      </Link>
      <PageHeader
        title="Custom invoice"
        actions={
          <>
            <Button variant="ghost" onClick={() => router.push("/invoices")}>
              Cancel
            </Button>
            <Button variant="primary" onClick={save} loading={saving}>
              Create invoice
            </Button>
          </>
        }
      />
      <div className="mb-4 grid max-w-2xl grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Bill a carrier" hint="Fills in the customer block">
          <Select
            value={d.company_id || ""}
            onChange={(e) => {
              const c = companies.find((x) => x.id === e.target.value);
              setD({
                ...d,
                company_id: c?.id || null,
                bill_to_name: c?.name || d.bill_to_name,
                bill_to_details: c ? billToDetails(c) : d.bill_to_details,
              });
            }}
          >
            <option value="">Someone else (type below)</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Currency">
          <Select value={d.currency} onChange={(e) => setD({ ...d, currency: e.target.value as Currency })}>
            <option value="USD">USD $</option>
            <option value="EUR">EUR €</option>
            <option value="MDL">MDL</option>
          </Select>
        </Field>
      </div>
      <div className="overflow-x-auto pb-2">
        <InvoiceDoc d={d} editing onChange={setD} />
      </div>
    </Page>
  );
}
