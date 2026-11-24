"use client";

import { useMemo, useRef, useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { InvoiceDoc } from "@/components/invoices/InvoiceDoc";
import { normInvoice } from "@/lib/db";
import { balance, draftOf, PAY_META, payState } from "@/lib/invoice";
import { saveElementPdf } from "@/lib/pdf";
import { money } from "@/lib/format";
import type { Invoice } from "@/lib/types";

/** The invoice as the carrier sees it from their link, with a PDF download. */
export function PublicInvoice({ invoice }: { invoice: Invoice }) {
  const inv = useMemo(() => normInvoice(invoice), [invoice]);
  const d = useMemo(() => draftOf(inv), [inv]);
  const st = payState(inv);
  const left = balance(inv);
  const ref = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);

  const download = async () => {
    if (!ref.current) return;
    setBusy(true);
    try {
      await saveElementPdf(ref.current, inv.invoice_number);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-dvh bg-zinc-100 px-3 py-6 text-zinc-900 sm:py-10">
      <div className="mx-auto max-w-[900px]">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.08em] text-zinc-500">TOSS · Trucking One Stop Shop</div>
            <h1 className="text-xl font-bold">Invoice {inv.invoice_number}</h1>
            <div className="text-sm text-zinc-600">
              {PAY_META[st].label}
              {left > 0 && st !== "void" ? ` · ${money(left, { currency: inv.currency })} due` : ""}
            </div>
          </div>
          <Button variant="primary" onClick={download} loading={busy}>
            {!busy && <Download className="h-4 w-4" />} Download PDF
          </Button>
        </div>
        <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
          <InvoiceDoc ref={ref} d={d} editing={false} onChange={() => {}} statusLabel={PAY_META[st].label} />
        </div>
        <p className="mt-4 text-center text-xs text-zinc-500">Questions about this invoice? Reply to the text or email it came with.</p>
      </div>
    </main>
  );
}
