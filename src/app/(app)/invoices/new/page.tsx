"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Field, Select } from "@/components/ui/Field";
import { Page, PageHeader } from "@/components/ui/Bits";
import { InvoiceDoc } from "@/components/invoices/InvoiceDoc";
import { useStore } from "@/lib/store";
import { sb } from "@/lib/db";
import { toast } from "@/lib/toast";
import { blankDraft, draftToRow, remittanceDefault, type InvoiceDraft } from "@/lib/invoice";
import type { Currency } from "@/lib/types";

/** Free-form invoice (services outside load billing). */
export default function NewInvoicePage() {
  const router = useRouter();
  const { settings, companies, createCustomInvoice } = useStore();
  const [d, setD] = useState<InvoiceDraft | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    sb()
      .rpc("tms_next_invoice_number")
      .then(({ data }) => {
        const draft = blankDraft(settings, (data as string) || "");
        draft.doc_overrides = { remittance_text: remittanceDefault(settings), footer_text: settings?.footer_text || "" };
        setD(draft);
      });
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
                bill_to_details: c
                  ? [[c.mc_number && `MC ${c.mc_number}`, c.dot_number && `DOT ${c.dot_number}`].filter(Boolean).join(" · "), c.address, [c.contact_name, c.contact_email].filter(Boolean).join(" · ")]
                      .filter(Boolean)
                      .join("\n")
                  : d.bill_to_details,
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
