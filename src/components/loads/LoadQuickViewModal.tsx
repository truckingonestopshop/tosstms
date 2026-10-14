'use client';

import React from 'react';
import { Load } from '@/types';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { MapboxRoutePreview } from '@/components/loads/MapboxRoutePreview';
import { LoadStopsTimeline } from '@/components/loads/LoadStopsTimeline';
import {
  X,
  Truck,
  User,
  DollarSign,
  Calendar,
  Building,
  FileText,
  Phone,
  Mail,
  Edit,
  ExternalLink,
} from 'lucide-react';
import Link from 'next/link';

interface LoadQuickViewModalProps {
  load: Load | null;
  onClose: () => void;
  onEdit?: (load: Load) => void;
}

export function LoadQuickViewModal({ load, onClose, onEdit }: LoadQuickViewModalProps) {
  if (!load) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto bg-black/70 backdrop-blur-xs animate-in fade-in">
      <div className="relative w-full max-w-2xl rounded-2xl border border-border bg-card p-5 sm:p-6 shadow-2xl space-y-5 my-8">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-border pb-4">
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-xl font-black text-text-main tracking-tight">
                {load.load_number}
              </h2>
              <StatusBadge status={load.status} type="load" />
            </div>
            <p className="text-xs text-text-muted mt-1">
              Carrier: <span className="font-semibold text-text-main">{load.company_name || 'Carrier'}</span>
              {load.rate_con_number ? ` • Ref: ${load.rate_con_number}` : ''}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg border border-border bg-card-subtle text-text-muted hover:text-text-main transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Financial Highlights */}
        <div className="grid grid-cols-3 gap-3 p-3.5 rounded-xl bg-card-subtle border border-border text-center">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted block">
              Gross Revenue
            </span>
            <span className="text-lg sm:text-xl font-black text-emerald-500 tabular-nums">
              ${load.gross_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </span>
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted block">
              Dispatcher Fee
            </span>
            <span className="text-lg sm:text-xl font-black text-brand-500 tabular-nums">
              ${load.dispatcher_cut.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </span>
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted block">
              Rate Per Mile
            </span>
            <span className="text-lg sm:text-xl font-black text-text-main tabular-nums">
              {load.rate_per_mile ? `$${load.rate_per_mile.toFixed(2)}` : '—'}
            </span>
          </div>
        </div>

        {/* Mapbox Route Preview */}
        <div>
          <MapboxRoutePreview load={load} />
        </div>

        {/* Driver & Broker Breakdown */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          {/* Driver & Equipment */}
          <div className="p-3.5 rounded-xl border border-border bg-card space-y-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted block">
              Assigned Equipment & Driver
            </span>
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-brand-500 shrink-0" />
              <span className="font-bold text-text-main">
                {load.driver_name || 'Unassigned Driver'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Truck className="h-4 w-4 text-brand-500 shrink-0" />
              <span className="font-medium text-text-main">
                {load.truck_unit || 'Unassigned Tractor'}
              </span>
            </div>
          </div>

          {/* Broker Information */}
          <div className="p-3.5 rounded-xl border border-border bg-card space-y-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted block">
              Broker Details
            </span>
            <div className="font-bold text-text-main flex items-center gap-2">
              <Building className="h-4 w-4 text-text-muted shrink-0" />
              <span>{load.broker_name}</span>
            </div>
            {load.broker_phone && (
              <div className="flex items-center gap-2 text-text-muted">
                <Phone className="h-3.5 w-3.5 shrink-0" />
                <span>{load.broker_phone}</span>
              </div>
            )}
            {load.broker_email && (
              <div className="flex items-center gap-2 text-text-muted">
                <Mail className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{load.broker_email}</span>
              </div>
            )}
          </div>
        </div>

        {/* Stops Timeline */}
        {load.stops && load.stops.length > 0 && (
          <div className="p-4 rounded-xl border border-border bg-card space-y-3">
            <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted block">
              Scheduled Stops
            </span>
            <LoadStopsTimeline stops={load.stops} />
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex items-center justify-between border-t border-border pt-4">
          <Link
            href={`/loads/${load.id}`}
            className="text-xs font-semibold text-brand-500 hover:underline flex items-center gap-1"
          >
            <span>Open Dedicated Load Page</span>
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>

          <div className="flex items-center gap-2">
            {onEdit && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onEdit(load);
                }}
                className="btn-secondary text-xs py-1.5 px-3"
              >
                <Edit className="h-3.5 w-3.5" />
                Edit Load
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="btn-primary text-xs py-1.5 px-4"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
