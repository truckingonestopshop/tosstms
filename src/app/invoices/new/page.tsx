'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useApp } from '@/lib/data/AppContext';
import { InvoiceLoadPickerModal } from '@/components/invoices/InvoiceLoadPickerModal';
import { Load, InvoiceLineItem } from '@/types';
import {
  FileSpreadsheet,
  Calendar,
  Building,
  Plus,
  ArrowLeft,
  Trash2,
  Save,
  CheckCircle2,
} from 'lucide-react';

export default function NewInvoicePage() {
  const router = useRouter();
  const { createInvoice, companies, scopedLoads, activeCompany } = useApp();

  const [companyId, setCompanyId] = useState<string>(
    activeCompany?.id || companies[0]?.id || 'comp-001'
  );
  const [invoiceNumber, setInvoiceNumber] = useState(
    `INV-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`
  );
  const [periodStart, setPeriodStart] = useState(
    new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0]
  );
  const [periodEnd, setPeriodEnd] = useState(new Date().toISOString().split('T')[0]);
  const [dueDate, setDueDate] = useState(
    new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]
  );
  const [notes, setNotes] = useState(
    'Weekly dispatch commission statement. Thank you for your partnership!'
  );

  const [selectedLoads, setSelectedLoads] = useState<Load[]>([]);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Available delivered loads under this carrier
  const availableLoads = scopedLoads.filter(
    (l) => l.company_id === companyId && (l.status === 'delivered' || l.status === 'booked' || l.status === 'in_transit')
  );

  const targetComp = companies.find((c) => c.id === companyId);
  const commPercent = targetComp?.commission_percent ?? 10.0;

  const totalGross = selectedLoads.reduce((sum, l) => sum + l.gross_amount, 0);
  const totalCommission = (totalGross * commPercent) / 100;

  const handleAttachLoads = (loads: Load[]) => {
    setSelectedLoads(loads);
  };

  const handleRemoveLoad = (id: string) => {
    setSelectedLoads((prev) => prev.filter((l) => l.id !== id));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const lineItems: InvoiceLineItem[] = selectedLoads.map((load) => ({
        id: `item-${load.id}`,
        description: `Load ${load.load_number} — ${load.origin_city}, ${load.origin_state} to ${load.destination_city}, ${load.destination_state}`,
        load_id: load.id,
        load_number: load.load_number,
        pickup_date: load.pickup_date,
        delivery_date: load.delivery_date,
        gross_amount: load.gross_amount,
        commission_percent: commPercent,
        commission_amount: (load.gross_amount * commPercent) / 100,
      }));

      const newInv = await createInvoice(
        {
          company_id: companyId,
          invoice_number: invoiceNumber,
          period_start: periodStart,
          period_end: periodEnd,
          due_date: dueDate,
          status: 'draft',
          total_gross: totalGross,
          total_commission: totalCommission,
          notes,
          line_items: lineItems,
        },
        selectedLoads.map((l) => l.id)
      );

      router.push(`/invoices/${newInv.id}`);
    } catch (err) {
      console.error('Invoice create error:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border pb-4">
        <div className="flex items-center gap-3">
          <Link
            href="/invoices"
            className="p-1.5 rounded-lg border border-border bg-card text-text-muted hover:text-text-main"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-text-main">
              Create Carrier Invoice
            </h1>
            <p className="text-xs text-text-muted">
              Assemble delivered loads into a formal dispatch commission statement
            </p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6 text-xs">
        {/* Invoice Metadata */}
        <div className="tms-card p-5 space-y-4">
          <h3 className="text-sm font-bold uppercase tracking-wider text-text-main border-b border-border pb-2">
            1. Invoice Details & Billing Period
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold text-text-main mb-1">Carrier Client</label>
              <select
                value={companyId}
                onChange={(e) => {
                  setCompanyId(e.target.value);
                  setSelectedLoads([]);
                }}
                className="tms-input"
                required
              >
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.commission_percent}% Cut)
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-semibold text-text-main mb-1">Invoice Number</label>
              <input
                type="text"
                required
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                className="tms-input font-mono font-bold"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block font-semibold text-text-main mb-1">Period Start</label>
              <input
                type="date"
                required
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
                className="tms-input"
              />
            </div>
            <div>
              <label className="block font-semibold text-text-main mb-1">Period End</label>
              <input
                type="date"
                required
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
                className="tms-input"
              />
            </div>
            <div>
              <label className="block font-semibold text-text-main mb-1">Payment Due Date</label>
              <input
                type="date"
                required
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="tms-input"
              />
            </div>
          </div>
        </div>

        {/* Line Items & Attached Loads */}
        <div className="tms-card p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-border pb-2">
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-text-main">
                2. Attached Loads for Billing ({selectedLoads.length})
              </h3>
              <p className="text-xs text-text-muted mt-0.5">
                Commission calculated at {commPercent}% of gross freight revenue
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsPickerOpen(true)}
              className="btn-primary text-xs py-1.5 px-3"
            >
              <Plus className="h-4 w-4" />
              <span>Select Loads from Calendar</span>
            </button>
          </div>

          {selectedLoads.length === 0 ? (
            <div className="p-8 text-center text-text-muted border border-dashed border-border rounded-xl">
              <FileSpreadsheet className="h-8 w-8 mx-auto text-text-muted mb-2 opacity-50" />
              <p className="font-semibold text-text-main">No loads attached yet</p>
              <p className="text-[11px] text-text-muted mt-0.5">
                Click &quot;Select Loads from Calendar&quot; to pick completed loads for this statement.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto border border-border rounded-xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-card-subtle text-text-muted uppercase text-[10px] tracking-wider border-b border-border">
                  <tr>
                    <th className="p-3">Load #</th>
                    <th className="p-3">Lane</th>
                    <th className="p-3">Delivery</th>
                    <th className="p-3 text-right">Gross Freight</th>
                    <th className="p-3 text-right">Cut ({commPercent}%)</th>
                    <th className="p-3 text-right">Remove</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border bg-card">
                  {selectedLoads.map((load) => (
                    <tr key={load.id} className="hover:bg-card-subtle/50">
                      <td className="p-3 font-bold text-text-main">{load.load_number}</td>
                      <td className="p-3 text-text-muted">
                        {load.origin_city}, {load.origin_state} → {load.destination_city}, {load.destination_state}
                      </td>
                      <td className="p-3 text-text-muted">{load.delivery_date}</td>
                      <td className="p-3 text-right font-medium text-emerald-500 tabular-nums">
                        ${load.gross_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td className="p-3 text-right font-bold text-brand-500 tabular-nums">
                        ${((load.gross_amount * commPercent) / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td className="p-3 text-right">
                        <button
                          type="button"
                          onClick={() => handleRemoveLoad(load.id)}
                          className="p-1 rounded text-text-muted hover:text-red-500"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Statement Totals */}
          {selectedLoads.length > 0 && (
            <div className="flex justify-end pt-3">
              <div className="w-64 p-3 rounded-xl bg-card-subtle border border-border space-y-1.5 text-right">
                <div className="flex justify-between text-text-muted text-xs">
                  <span>Gross Freight:</span>
                  <span className="font-bold text-emerald-500 tabular-nums">
                    ${totalGross.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="flex justify-between text-sm font-black text-text-main border-t border-border pt-1.5">
                  <span>Total Dispatch Cut:</span>
                  <span className="text-base text-brand-500 tabular-nums">
                    ${totalCommission.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Submit */}
        <div className="flex items-center justify-end gap-3 border-t border-border pt-4">
          <Link href="/invoices" className="btn-secondary text-xs py-2 px-4">
            Cancel
          </Link>
          <button
            type="submit"
            disabled={isSubmitting || selectedLoads.length === 0}
            className="btn-primary text-xs py-2 px-6 shadow-md"
          >
            <Save className="h-4 w-4" />
            <span>{isSubmitting ? 'Generating Invoice...' : 'Create & View Invoice'}</span>
          </button>
        </div>
      </form>

      {/* Calendar Load Picker Modal */}
      {isPickerOpen && (
        <InvoiceLoadPickerModal
          availableLoads={availableLoads}
          selectedLoadIds={selectedLoads.map((l) => l.id)}
          onConfirm={handleAttachLoads}
          onClose={() => setIsPickerOpen(false)}
        />
      )}
    </div>
  );
}
