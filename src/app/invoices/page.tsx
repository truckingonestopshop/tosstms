'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useApp } from '@/lib/data/AppContext';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { InvoiceStatus } from '@/types';
import {
  FileSpreadsheet,
  Plus,
  Printer,
  Eye,
  CheckCircle2,
  DollarSign,
  ArrowRight,
} from 'lucide-react';

export default function InvoicesPage() {
  const { scopedInvoices, updateInvoiceStatus, activeCompany } = useApp();
  const [filterStatus, setFilterStatus] = useState<string>('all');

  const filteredInvoices = scopedInvoices.filter((inv) => {
    if (filterStatus === 'all') return true;
    return inv.status === filterStatus;
  });

  const totalCommission = filteredInvoices.reduce((sum, inv) => sum + inv.total_commission, 0);
  const totalGross = filteredInvoices.reduce((sum, inv) => sum + inv.total_gross, 0);

  const handleMarkPaid = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await updateInvoiceStatus(id, 'paid');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-4">
        <div>
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-brand-500" />
            <h1 className="text-2xl font-black tracking-tight text-text-main">
              Invoices & Settlements
            </h1>
          </div>
          <p className="text-xs text-text-muted mt-0.5">
            Carrier commission invoices, billing cycles, and factoring statements
          </p>
        </div>

        <Link
          href="/invoices/new"
          className="btn-primary text-xs py-2 px-3.5 shadow-xs self-start sm:self-auto"
        >
          <Plus className="h-4 w-4" />
          <span>Create Invoice</span>
        </Link>
      </div>

      {/* KPI Highlights */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="tms-card p-4">
          <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted block">
            Total Billed Freight
          </span>
          <span className="text-xl font-black text-emerald-500 tabular-nums">
            ${totalGross.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </span>
        </div>
        <div className="tms-card p-4">
          <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted block">
            Dispatch Commission Invoiced
          </span>
          <span className="text-xl font-black text-brand-500 tabular-nums">
            ${totalCommission.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </span>
        </div>
        <div className="tms-card p-4">
          <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted block">
            Total Invoices Recorded
          </span>
          <span className="text-xl font-black text-text-main tabular-nums">
            {filteredInvoices.length} Statements
          </span>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1.5 text-xs">
        {['all', 'draft', 'sent', 'paid'].map((tab) => (
          <button
            key={tab}
            onClick={() => setFilterStatus(tab)}
            className={`px-3 py-1.5 rounded-lg font-semibold capitalize transition-all ${
              filterStatus === tab
                ? 'bg-brand-500 text-zinc-950 font-bold'
                : 'bg-card border border-border text-text-muted hover:text-text-main'
            }`}
          >
            {tab === 'all' ? 'All Invoices' : tab}
          </button>
        ))}
      </div>

      {/* Invoices Table */}
      <div className="tms-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-card-subtle text-text-muted uppercase text-[10px] tracking-wider border-b border-border">
              <tr>
                <th className="p-3.5 font-bold">Invoice #</th>
                <th className="p-3.5 font-bold">Status</th>
                <th className="p-3.5 font-bold">Carrier Client</th>
                <th className="p-3.5 font-bold">Billing Period</th>
                <th className="p-3.5 font-bold">Due Date</th>
                <th className="p-3.5 font-bold text-right">Gross Freight</th>
                <th className="p-3.5 font-bold text-right">Dispatch Due</th>
                <th className="p-3.5 font-bold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-card">
              {filteredInvoices.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-text-muted">
                    No invoices recorded for this filter.
                  </td>
                </tr>
              ) : (
                filteredInvoices.map((inv) => (
                  <tr
                    key={inv.id}
                    className="hover:bg-card-subtle/50 transition-colors"
                  >
                    <td className="p-3.5 font-bold text-text-main font-mono">
                      <Link href={`/invoices/${inv.id}`} className="hover:text-brand-500 hover:underline">
                        {inv.invoice_number}
                      </Link>
                    </td>
                    <td className="p-3.5">
                      <StatusBadge status={inv.status} type="invoice" />
                    </td>
                    <td className="p-3.5 font-medium text-text-main">
                      {inv.company_name || 'Carrier Partner'}
                    </td>
                    <td className="p-3.5 text-text-muted">
                      {inv.period_start} → {inv.period_end}
                    </td>
                    <td className="p-3.5 text-text-muted">
                      {inv.due_date || 'Due Upon Receipt'}
                    </td>
                    <td className="p-3.5 text-right font-medium text-emerald-500 tabular-nums">
                      ${inv.total_gross.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                    <td className="p-3.5 text-right font-bold text-brand-500 tabular-nums">
                      ${inv.total_commission.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                    <td className="p-3.5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {inv.status !== 'paid' && (
                          <button
                            onClick={(e) => handleMarkPaid(inv.id, e)}
                            className="px-2 py-1 rounded bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 font-bold text-[10px]"
                          >
                            Mark Paid
                          </button>
                        )}
                        <Link
                          href={`/invoices/${inv.id}`}
                          className="p-1.5 rounded hover:bg-card-subtle text-text-muted hover:text-text-main"
                          title="View / Print Invoice"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
