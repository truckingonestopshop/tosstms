'use client';

import React, { useRef } from 'react';
import { Invoice } from '@/types';
import { LogoMark } from '@/components/ui/Logo';
import { Printer, Download, FileCheck, Building } from 'lucide-react';

interface InvoiceDocumentProps {
  invoice: Invoice;
  className?: string;
}

export function InvoiceDocument({ invoice, className = '' }: InvoiceDocumentProps) {
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Top Action Bar */}
      <div className="flex items-center justify-between no-print">
        <div>
          <h2 className="text-lg font-bold text-text-main">
            Invoice {invoice.invoice_number}
          </h2>
          <span className="text-xs text-text-muted">
            Created on {new Date(invoice.created_at).toLocaleDateString()}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handlePrint}
            className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5"
          >
            <Printer className="h-4 w-4" />
            <span>Print Invoice</span>
          </button>
        </div>
      </div>

      {/* Formal Invoice Sheet */}
      <div
        ref={printRef}
        className="tms-card p-8 sm:p-12 bg-white text-zinc-900 border border-zinc-200 shadow-lg space-y-8 print:p-0 print:border-none print:shadow-none"
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-zinc-200 pb-6">
          <div>
            <div className="flex items-center gap-2">
              <LogoMark tone="light" className="h-8 w-auto" />
              <span className="text-xs font-black tracking-widest uppercase px-2 py-0.5 rounded bg-brand-500 text-zinc-950">
                TMS
              </span>
            </div>
            <div className="text-xs text-zinc-500 mt-2 space-y-0.5">
              <p className="font-bold text-zinc-800">Trucking One Stop Shop LLC</p>
              <p>Dispatch & Freight Operations</p>
              <p>billing@truckingonestopshop.net</p>
              <p>truckingonestopshop.net</p>
            </div>
          </div>

          <div className="text-right">
            <h1 className="text-2xl font-black text-zinc-950 uppercase tracking-tight">
              INVOICE
            </h1>
            <div className="text-xs text-zinc-600 mt-1 space-y-0.5">
              <p>
                <span className="font-semibold text-zinc-700">Invoice #: </span>
                <span className="font-mono font-bold text-zinc-900">{invoice.invoice_number}</span>
              </p>
              <p>
                <span className="font-semibold text-zinc-700">Billing Period: </span>
                {invoice.period_start} to {invoice.period_end}
              </p>
              {invoice.due_date && (
                <p>
                  <span className="font-semibold text-zinc-700">Payment Due: </span>
                  <span className="font-bold text-zinc-900">{invoice.due_date}</span>
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Bill To */}
        <div className="border-b border-zinc-200 pb-6">
          <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block mb-1">
            Bill To (Carrier Client)
          </span>
          <h3 className="text-base font-bold text-zinc-900">
            {invoice.company_name || 'Carrier Partner'}
          </h3>
          <p className="text-xs text-zinc-500 mt-0.5">
            Dispatch Management & Freight Brokerage Representation Services
          </p>
        </div>

        {/* Line Items Table */}
        <div>
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b-2 border-zinc-900 text-zinc-600 uppercase tracking-wider text-[10px]">
                <th className="py-2 font-bold">Item Description</th>
                <th className="py-2 font-bold text-right">Gross Freight</th>
                <th className="py-2 font-bold text-right">Commission Rate</th>
                <th className="py-2 font-bold text-right">Dispatch Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200">
              {invoice.line_items && invoice.line_items.length > 0 ? (
                invoice.line_items.map((item, idx) => (
                  <tr key={item.id || idx}>
                    <td className="py-3 font-medium text-zinc-800">
                      {item.description}
                      {item.load_number && (
                        <span className="block text-[11px] text-zinc-400 font-mono mt-0.5">
                          Load: {item.load_number} ({item.pickup_date} - {item.delivery_date})
                        </span>
                      )}
                    </td>
                    <td className="py-3 text-right font-medium text-zinc-700 tabular-nums">
                      ${item.gross_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-3 text-right text-zinc-600 tabular-nums">
                      {item.commission_percent}%
                    </td>
                    <td className="py-3 text-right font-bold text-zinc-900 tabular-nums">
                      ${item.commission_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="py-3 font-medium text-zinc-800">
                    Dispatch Services (Loads completed {invoice.period_start} to {invoice.period_end})
                  </td>
                  <td className="py-3 text-right font-medium text-zinc-700 tabular-nums">
                    ${invoice.total_gross.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </td>
                  <td className="py-3 text-right text-zinc-600 tabular-nums">10.0%</td>
                  <td className="py-3 text-right font-bold text-zinc-900 tabular-nums">
                    ${invoice.total_commission.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Totals Section */}
        <div className="flex justify-end pt-4 border-t border-zinc-200">
          <div className="w-64 space-y-2 text-xs">
            <div className="flex justify-between text-zinc-600">
              <span>Total Gross Freight:</span>
              <span className="font-medium text-zinc-800 tabular-nums">
                ${invoice.total_gross.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div className="flex justify-between text-sm font-black text-zinc-950 border-t border-zinc-300 pt-2">
              <span>Total Dispatch Due:</span>
              <span className="text-base text-brand-600 tabular-nums">
                ${invoice.total_commission.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        </div>

        {/* Remittance & Notes */}
        <div className="pt-6 border-t border-zinc-200 text-xs text-zinc-500 space-y-2">
          <p className="font-bold text-zinc-700 uppercase tracking-wider text-[10px]">
            Remittance Instructions
          </p>
          <p>
            Please remit payments via direct ACH Bank Transfer, Zelle, or credit card autopay.
          </p>
          <p className="text-[11px] italic text-zinc-400">
            {invoice.notes || 'Thank you for moving freight with Trucking One Stop Shop.'}
          </p>
        </div>
      </div>
    </div>
  );
}
