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
import {
  NON_DISPATCH_REMITTANCE,
  blankDraft,
  blankLine,
  draftToRow,
  remittanceDefault,
  withInvoiceSuffix,
  type InvoiceDraft,
} from "@/lib/invoice";
import { itemName, oppNumber, type OppItem, type Opportunity, type Product, type ProductVariant } from "@/lib/sales";
import type { Company, Currency } from "@/lib/types";

type InvoiceService = "mcpt" | "dot_compliance" | "dispatch";

const INVOICE_SERVICES: { key: InvoiceService; label: string; suffix: string }[] = [
  { key: "mcpt", label: "Taxes & Permits (MCPT) · -TP", suffix: "TP" },
  { key: "dot_compliance", label: "DOT Compliance · -DC", suffix: "DC" },
  { key: "dispatch", label: "Dispatch · -D", suffix: "D" },
];

/** The customer block for a carrier. */
const billToDetails = (c: Company) =>
  [[c.mc_number && `MC ${c.mc_number}`, c.dot_number && `DOT ${c.dot_number}`].filter(Boolean).join(" · "), c.address, [c.contact_name, c.contact_email].filter(Boolean).join(" · ")]
    .filter(Boolean)
    .join("\n");

/** Free-form / product invoice (services outside load billing). ?opportunity= / ?company= / ?from=sales fill it in from Sales. */
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
  const fromSales = params.get("from") === "sales" || !!oppId || !!agreementId;
  const backHref = fromSales ? "/sales?tab=invoices" : "/invoices";

  const { settings, companies, createCustomInvoice } = useStore();
  const [d, setD] = useState<InvoiceDraft | null>(null);
  const [service, setService] = useState<InvoiceService>("mcpt");
  const [products, setProducts] = useState<Product[]>([]);
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const [{ data: rawNum }, { data: prods }, { data: vars }] = await Promise.all([
        sb().rpc("tms_next_invoice_number"),
        sb().from("tms_products").select("*").eq("active", true).order("name"),
        sb().from("tms_product_variants").select("*").eq("active", true).order("sort"),
      ]);
      const prodList = (prods || []) as Product[];
      const varList = (vars || []) as ProductVariant[];
      setProducts(prodList);
      setVariants(varList);

      let detectedSvc: InvoiceService = "mcpt";
      const baseNum = (rawNum as string) || "";
      const draft = blankDraft(settings, withInvoiceSuffix(baseNum, detectedSvc, "custom"));
      draft.doc_overrides = {
        remittance_text: NON_DISPATCH_REMITTANCE,
        footer_text: settings?.footer_text || "",
      };

      // From Sales: the opportunity's products become the lines.
      let companyId = companyParam;
      if (oppId) {
        const [o, it] = await Promise.all([
          sb().from("tms_opportunities").select("*").eq("id", oppId).single(),
          sb().from("tms_opportunity_items").select("*").eq("opportunity_id", oppId).order("sort"),
        ]);
        const opp = o.data as Opportunity | null;
        if (opp) {
          companyId = opp.company_id;
          const items = (it.data || []) as OppItem[];
          // A product with variants needs its variant picked before it's invoiced.
          const ids = [...new Set(items.filter((i) => i.product_id && !i.variant_id).map((i) => i.product_id as string))];
          if (ids.length) {
            const missing = items.find((i) => !i.variant_id && varList.some((v) => v.product_id === i.product_id));
            if (missing) {
              toast.error(`Pick the variant of ${missing.name} on the opportunity first`);
              return router.replace(`/sales?tab=opportunities&opp=${opp.id}`);
            }
          }
          // Detect service from first product on the opportunity
          const firstProd = items.map((i) => prodList.find((p) => p.id === i.product_id)).find(Boolean);
          if (firstProd?.service === "dot_compliance") detectedSvc = "dot_compliance";
          else if (firstProd?.service === "dispatch") detectedSvc = "dispatch";
          else detectedSvc = "mcpt";

          // Each product (with its variant), and its discount as a line of its own.
          const rows = items.length
            ? items.flatMap((i) => {
                const line = {
                  description: itemName(i),
                  quantity: Number(i.quantity),
                  unit_price: Number(i.unit_price),
                  amount: Number(i.quantity) * Number(i.unit_price),
                };
                const off = Number(i.discount) || 0;
                return off > 0 ? [line, { description: `Discount · ${itemName(i)}`, quantity: 1, unit_price: -off, amount: -off }] : [line];
              })
            : [{ description: opp.title, quantity: 1, unit_price: Number(opp.value), amount: Number(opp.value) }];
          draft.lines = rows.map((r, n) => ({ ...blankLine(n), ...r, gross_amount: r.amount }));
          draft.notes = `${oppNumber(opp)} · ${opp.title}`;
        }
      }

      setService(detectedSvc);
      draft.invoice_number = withInvoiceSuffix(baseNum, detectedSvc, "custom");
      draft.doc_overrides = {
        ...draft.doc_overrides,
        remittance_text: remittanceDefault(settings, detectedSvc === "dispatch"),
        ...( { service: detectedSvc } as Record<string, string> ),
      };

      const c = companies.find((x) => x.id === companyId);
      if (c) Object.assign(draft, { company_id: c.id, bill_to_name: c.name, bill_to_details: billToDetails(c) });
      setD(draft);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!d) {
    return (
      <Page>
        <div className="py-20 text-center text-sm text-fg-4">Preparing invoice…</div>
      </Page>
    );
  }

  const changeService = (nextSvc: InvoiceService) => {
    setService(nextSvc);
    setD({
      ...d,
      invoice_number: withInvoiceSuffix(d.invoice_number, nextSvc, "custom"),
      doc_overrides: {
        ...d.doc_overrides,
        remittance_text: remittanceDefault(settings, nextSvc === "dispatch"),
        ...( { service: nextSvc } as Record<string, string> ),
      },
    });
  };

  const addProductLine = (val: string) => {
    if (!val) return;
    const [prodId, varId] = val.split("::");
    const p = products.find((x) => x.id === prodId);
    if (!p) return;
    const v = varId ? variants.find((x) => x.id === varId) : undefined;
    const name = v ? `${p.name} — ${v.name}` : p.name;
    const price = Number(v ? v.price : p.price) || 0;

    // Auto-switch service suffix based on product service
    const mappedSvc: InvoiceService =
      p.service === "dot_compliance"
        ? "dot_compliance"
        : p.service === "dispatch"
          ? "dispatch"
          : "mcpt";
    setService(mappedSvc);

    const existingNonEmpty = d.lines.filter((l) => l.description.trim() || l.amount);
    const nextLines = [
      ...existingNonEmpty,
      {
        ...blankLine(existingNonEmpty.length),
        description: name,
        quantity: 1,
        unit_price: price,
        amount: price,
        gross_amount: price,
      },
    ];
    setD({
      ...d,
      invoice_number: withInvoiceSuffix(d.invoice_number, mappedSvc, "custom"),
      doc_overrides: {
        ...d.doc_overrides,
        remittance_text: remittanceDefault(settings, mappedSvc === "dispatch"),
        ...( { service: mappedSvc } as Record<string, string> ),
      },
      lines: nextLines,
    });
  };

  const save = async () => {
    if (!d.bill_to_name?.trim()) return toast.error("Add who the invoice is for.");
    if (!d.lines.some((l) => l.description.trim() && l.amount)) return toast.error("Add at least one line with an amount.");
    setSaving(true);
    const finalDraft: InvoiceDraft = {
      ...d,
      invoice_number: withInvoiceSuffix(d.invoice_number, service, "custom"),
    };
    const inv = await createCustomInvoice({
      invoice: draftToRow(finalDraft),
      lines: finalDraft.lines.filter((l) => l.description.trim() || l.amount),
    });
    setSaving(false);
    if (inv) {
      if (agreementId) await sb().from("tms_agreements").update({ invoice_id: inv.id }).eq("id", agreementId);
      // Made from an opportunity: it moves to Invoice sent now, and to Won (with its cases) once paid.
      if (oppId) await sb().from("tms_invoices").update({ opportunity_id: oppId }).eq("id", inv.id);
      toast.success(`Invoice ${inv.invoice_number} created`);
      router.push(`/invoices/${inv.id}${fromSales ? "?from=sales" : ""}`);
    }
  };

  return (
    <Page>
      <Link href={backHref} className="mb-3 inline-flex items-center gap-1.5 text-[13px] text-fg-3 hover:text-fg">
        <ArrowLeft className="h-3.5 w-3.5" /> {fromSales ? "Sales Invoices" : "Invoices"}
      </Link>
      <PageHeader
        title="New invoice"
        actions={
          <>
            <Button variant="ghost" onClick={() => router.push(backHref)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={save} loading={saving}>
              Create invoice
            </Button>
          </>
        }
      />
      <div className="mb-4 grid max-w-4xl grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
        <Field label="Service type" hint="Sets -D, -TP or -DC on the invoice #">
          <Select value={service} onChange={(e) => changeService(e.target.value as InvoiceService)}>
            {INVOICE_SERVICES.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Add product" hint="Add any product as an invoice line">
          <Select value="" onChange={(e) => addProductLine(e.target.value)}>
            <option value="">Pick a product to add…</option>
            {products.map((p) => {
              const pVars = variants.filter((v) => v.product_id === p.id);
              if (pVars.length > 0) {
                return (
                  <optgroup key={p.id} label={p.name}>
                    {pVars.map((v) => (
                      <option key={v.id} value={`${p.id}::${v.id}`}>
                        {p.name} — {v.name} (${Number(v.price).toLocaleString()})
                      </option>
                    ))}
                  </optgroup>
                );
              }
              return (
                <option key={p.id} value={p.id}>
                  {p.name} (${Number(p.price).toLocaleString()})
                </option>
              );
            })}
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
