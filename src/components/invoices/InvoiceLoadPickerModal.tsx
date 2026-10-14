'use client';

import React, { useState } from 'react';
import { Load } from '@/types';
import { DispatchCalendar } from '@/components/calendar/DispatchCalendar';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { X, Check, CheckSquare, Square, ArrowRight, DollarSign } from 'lucide-react';

interface InvoiceLoadPickerModalProps {
  availableLoads: Load[];
  selectedLoadIds: string[];
  onConfirm: (selectedLoads: Load[]) => void;
  onClose: () => void;
}

export function InvoiceLoadPickerModal({
  availableLoads,
  selectedLoadIds: initialSelected,
  onConfirm,
  onClose,
}: InvoiceLoadPickerModalProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>(initialSelected);
  const [timeRange, setTimeRange] = useState<'7d' | '1m' | '3m' | '6m' | '1y' | 'all' | 'custom'>('1m');

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    if (selectedIds.length === availableLoads.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(availableLoads.map((l) => l.id));
    }
  };

  const selectedLoads = availableLoads.filter((l) => selectedIds.includes(l.id));
  const totalGross = selectedLoads.reduce((sum, l) => sum + l.gross_amount, 0);
  const totalCommission = selectedLoads.reduce((sum, l) => sum + l.dispatcher_cut, 0);

  const handleConfirm = () => {
    onConfirm(selectedLoads);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-xs overflow-y-auto animate-in fade-in">
      <div className="relative w-full max-w-4xl rounded-2xl border border-border bg-card p-5 sm:p-6 shadow-2xl space-y-4 my-8">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div>
            <h2 className="text-lg font-bold text-text-main">
              Select Delivered Loads for Invoice
            </h2>
            <p className="text-xs text-text-muted">
              Choose loads to batch into this carrier commission statement
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg border border-border bg-card-subtle text-text-muted hover:text-text-main"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Dispatch Calendar Selection Mode */}
        <DispatchCalendar
          loads={availableLoads}
          onSelectLoad={(l) => toggleSelect(l.id)}
          timeRange={timeRange}
          onTimeRangeChange={setTimeRange}
          mode="select-only"
          onSelectionChange={(ids) => {
            // calendar multi-selection sync
          }}
        />

        {/* Load List Table */}
        <div className="border border-border rounded-xl overflow-hidden max-h-60 overflow-y-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-card-subtle text-text-muted uppercase text-[10px] tracking-wider border-b border-border sticky top-0">
              <tr>
                <th className="p-3 w-8">
                  <button onClick={handleSelectAll} className="flex items-center">
                    {selectedIds.length === availableLoads.length && availableLoads.length > 0 ? (
                      <CheckSquare className="h-4 w-4 text-brand-500" />
                    ) : (
                      <Square className="h-4 w-4 text-text-muted" />
                    )}
                  </button>
                </th>
                <th className="p-3 font-semibold">Load #</th>
                <th className="p-3 font-semibold">Lane</th>
                <th className="p-3 font-semibold">Delivery Date</th>
                <th className="p-3 font-semibold text-right">Gross Rate</th>
                <th className="p-3 font-semibold text-right">Dispatch Cut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-card">
              {availableLoads.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-text-muted italic">
                    No loads available for invoicing under this carrier.
                  </td>
                </tr>
              ) : (
                availableLoads.map((load) => {
                  const isSelected = selectedIds.includes(load.id);
                  return (
                    <tr
                      key={load.id}
                      onClick={() => toggleSelect(load.id)}
                      className={`cursor-pointer transition-colors ${
                        isSelected ? 'bg-brand-500/10' : 'hover:bg-card-subtle'
                      }`}
                    >
                      <td className="p-3">
                        {isSelected ? (
                          <CheckSquare className="h-4 w-4 text-brand-500" />
                        ) : (
                          <Square className="h-4 w-4 text-text-muted" />
                        )}
                      </td>
                      <td className="p-3 font-bold text-text-main">
                        {load.load_number}
                      </td>
                      <td className="p-3 text-text-muted">
                        {load.origin_city}, {load.origin_state} → {load.destination_city}, {load.destination_state}
                      </td>
                      <td className="p-3 text-text-muted">{load.delivery_date}</td>
                      <td className="p-3 text-right font-medium text-emerald-500 tabular-nums">
                        ${load.gross_amount.toLocaleString()}
                      </td>
                      <td className="p-3 text-right font-bold text-brand-500 tabular-nums">
                        ${load.dispatcher_cut.toLocaleString()}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Summary Footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
          <div className="text-xs text-text-muted flex items-center gap-4">
            <span>
              <strong className="text-text-main">{selectedIds.length}</strong> loads selected
            </span>
            <span>
              Total Gross:{' '}
              <strong className="text-emerald-500 tabular-nums">
                ${totalGross.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </strong>
            </span>
            <span>
              Dispatch Commission:{' '}
              <strong className="text-brand-500 tabular-nums">
                ${totalCommission.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </strong>
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary text-xs py-1.5 px-3"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={selectedIds.length === 0}
              className="btn-primary text-xs py-1.5 px-4"
            >
              <Check className="h-4 w-4" />
              Attach Selected Loads
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
