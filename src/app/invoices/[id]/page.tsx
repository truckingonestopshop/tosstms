'use client';

import React, { use, Suspense } from 'react';
import Link from 'next/link';
import { useApp } from '@/lib/data/AppContext';
import { InvoiceDocument } from '@/components/invoices/InvoiceDocument';
import { ArrowLeft, CheckCircle2, Send } from 'lucide-react';

function SingleInvoiceContent({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const { invoices, updateInvoiceStatus } = useApp();

  const invoice = invoices.find((inv) => inv.id === resolvedParams.id);

  if (!invoice) {
    return (
      <div className="text-center py-16 space-y-3">
        <h2 className="text-lg font-bold text-text-main">Invoice not found</h2>
        <Link href="/invoices" className="btn-primary text-xs">
          Return to Invoices
        </Link>
      </div>
    );
  }

  const handleMarkStatus = async (status: 'draft' | 'sent' | 'paid') => {
    await updateInvoiceStatus(invoice.id, status);
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-4 no-print">
        <div className="flex items-center gap-3">
          <Link
            href="/invoices"
            className="p-1.5 rounded-lg border border-border bg-card text-text-muted hover:text-text-main"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-text-main">
              Invoice Statement {invoice.invoice_number}
            </h1>
            <p className="text-xs text-text-muted">
              Carrier Client: <span className="font-semibold text-text-main">{invoice.company_name}</span>
            </p>
          </div>
        </div>

        {/* Quick Status Buttons */}
        <div className="flex items-center gap-2">
          {invoice.status !== 'sent' && invoice.status !== 'paid' && (
            <button
              onClick={() => handleMarkStatus('sent')}
              className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5"
            >
              <Send className="h-3.5 w-3.5" />
              <span>Mark Sent</span>
            </button>
          )}
          {invoice.status !== 'paid' && (
            <button
              onClick={() => handleMarkStatus('paid')}
              className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1.5"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>Mark Paid</span>
            </button>
          )}
        </div>
      </div>

      {/* Invoice Document Component */}
      <InvoiceDocument invoice={invoice} />
    </div>
  );
}

export default function SingleInvoicePage(props: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<div className="p-8 text-center text-xs text-text-muted">Loading invoice...</div>}>
      <SingleInvoiceContent {...props} />
    </Suspense>
  );
}
