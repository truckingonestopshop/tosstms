import React from 'react';
import { LoadStatus, InvoiceStatus, StopStatus } from '@/types';

interface StatusBadgeProps {
  status: LoadStatus | InvoiceStatus | StopStatus | string;
  type?: 'load' | 'invoice' | 'stop';
  className?: string;
}

export function StatusBadge({ status, type = 'load', className = '' }: StatusBadgeProps) {
  let styleClasses = 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20';
  let label = status.replace(/_/g, ' ');

  if (type === 'load') {
    switch (status as LoadStatus) {
      case 'new':
        styleClasses = 'bg-blue-500/10 text-blue-500 border-blue-500/30';
        break;
      case 'booked':
        styleClasses = 'bg-amber-500/10 text-amber-500 border-amber-500/30';
        break;
      case 'in_transit':
        styleClasses = 'bg-brand-500/15 text-brand-500 border-brand-500/40 font-bold animate-pulse';
        break;
      case 'delivered':
        styleClasses = 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30';
        break;
      case 'invoiced':
        styleClasses = 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30';
        break;
      case 'paid':
        styleClasses = 'bg-green-600/20 text-green-400 border-green-500/40 font-bold';
        break;
      case 'canceled_by_broker':
      case 'canceled_by_carrier':
        styleClasses = 'bg-red-500/10 text-red-400 border-red-500/20 line-through';
        break;
    }
  } else if (type === 'invoice') {
    switch (status as InvoiceStatus) {
      case 'draft':
        styleClasses = 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20';
        break;
      case 'sent':
        styleClasses = 'bg-brand-500/15 text-brand-500 border-brand-500/30 font-semibold';
        break;
      case 'paid':
        styleClasses = 'bg-emerald-500/15 text-emerald-500 border-emerald-500/40 font-bold';
        break;
    }
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border capitalize whitespace-nowrap ${styleClasses} ${className}`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-80" />
      {label}
    </span>
  );
}
