'use client';

import React, { use, useState, Suspense } from 'react';
import Link from 'next/link';
import { notFound, useRouter } from 'next/navigation';
import { useApp } from '@/lib/data/AppContext';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { MapboxRoutePreview } from '@/components/loads/MapboxRoutePreview';
import { LoadStopsTimeline } from '@/components/loads/LoadStopsTimeline';
import { LoadEditModal } from '@/components/loads/LoadEditModal';
import { FactoringPacketModal } from '@/components/invoices/FactoringPacketModal';
import {
  ArrowLeft,
  Truck,
  User,
  DollarSign,
  Calendar,
  Building,
  Phone,
  Mail,
  Edit,
  Download,
  FileCheck,
  FileText,
  Upload,
} from 'lucide-react';

function LoadDetailContent({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const router = useRouter();
  const { loads, updateLoad } = useApp();

  const load = loads.find((l) => l.id === resolvedParams.id);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isFactoringOpen, setIsFactoringOpen] = useState(false);

  if (!load) {
    return (
      <div className="text-center py-16 space-y-3">
        <h2 className="text-lg font-bold text-text-main">Load not found</h2>
        <Link href="/loads" className="btn-primary text-xs">
          Return to Loads Board
        </Link>
      </div>
    );
  }

  const carrierNet = load.gross_amount - load.dispatcher_cut;

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Top Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-4">
        <div className="flex items-center gap-3">
          <Link
            href="/loads"
            className="p-1.5 rounded-lg border border-border bg-card text-text-muted hover:text-text-main"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-bold tracking-tight text-text-main">
                Load {load.load_number}
              </h1>
              <StatusBadge status={load.status} type="load" />
            </div>
            <p className="text-xs text-text-muted">
              Carrier: <span className="font-semibold text-text-main">{load.company_name}</span>
              {load.rate_con_number ? ` • Rate Con: ${load.rate_con_number}` : ''}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsFactoringOpen(true)}
            className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5"
          >
            <FileCheck className="h-4 w-4 text-emerald-500" />
            <span>Factoring Packet</span>
          </button>
          <button
            type="button"
            onClick={() => setIsEditOpen(true)}
            className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1.5"
          >
            <Edit className="h-4 w-4" />
            <span>Edit Load</span>
          </button>
        </div>
      </div>

      {/* Financial Split Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="tms-card p-4">
          <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted block">
            Gross Freight
          </span>
          <span className="text-xl font-black text-emerald-500 tabular-nums">
            ${load.gross_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </span>
        </div>
        <div className="tms-card p-4">
          <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted block">
            Dispatcher Cut
          </span>
          <span className="text-xl font-black text-brand-500 tabular-nums">
            ${load.dispatcher_cut.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </span>
        </div>
        <div className="tms-card p-4">
          <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted block">
            Carrier Net Payout
          </span>
          <span className="text-xl font-black text-text-main tabular-nums">
            ${carrierNet.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </span>
        </div>
        <div className="tms-card p-4">
          <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted block">
            Rate Per Mile
          </span>
          <span className="text-xl font-black text-text-main tabular-nums">
            {load.rate_per_mile ? `$${load.rate_per_mile.toFixed(2)}` : '—'}
          </span>
        </div>
      </div>

      {/* Mapbox Route Preview */}
      <div>
        <MapboxRoutePreview load={load} />
      </div>

      {/* Load Details Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
        {/* Stops & Timeline */}
        <div className="tms-card p-5 space-y-4">
          <h3 className="font-bold uppercase tracking-wider text-text-main text-[11px] border-b border-border pb-2">
            Lane Stops & Schedule
          </h3>
          <LoadStopsTimeline stops={load.stops} />
        </div>

        {/* Broker & Equipment */}
        <div className="space-y-4">
          {/* Equipment */}
          <div className="tms-card p-5 space-y-3">
            <h3 className="font-bold uppercase tracking-wider text-text-main text-[11px] border-b border-border pb-2">
              Assigned Equipment & Driver
            </h3>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-brand-500" />
                <span className="font-bold text-text-main text-sm">
                  {load.driver_name || 'Unassigned Driver'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Truck className="h-4 w-4 text-brand-500" />
                <span className="font-medium text-text-main">
                  {load.truck_unit || 'Unassigned Tractor'}
                </span>
              </div>
            </div>
          </div>

          {/* Broker */}
          <div className="tms-card p-5 space-y-3">
            <h3 className="font-bold uppercase tracking-wider text-text-main text-[11px] border-b border-border pb-2">
              Broker Details
            </h3>
            <div className="space-y-1.5">
              <div className="font-bold text-text-main text-sm">{load.broker_name}</div>
              {load.broker_contact && (
                <div className="text-text-muted">Contact: {load.broker_contact}</div>
              )}
              {load.broker_phone && (
                <div className="flex items-center gap-1.5 text-text-muted">
                  <Phone className="h-3.5 w-3.5" />
                  <span>{load.broker_phone}</span>
                </div>
              )}
              {load.broker_email && (
                <div className="flex items-center gap-1.5 text-text-muted">
                  <Mail className="h-3.5 w-3.5" />
                  <span>{load.broker_email}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      <LoadEditModal
        load={isEditOpen ? load : null}
        onClose={() => setIsEditOpen(false)}
      />

      <FactoringPacketModal
        load={isFactoringOpen ? load : null}
        onClose={() => setIsFactoringOpen(false)}
      />
    </div>
  );
}

export default function LoadDetailPage(props: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<div className="p-8 text-center text-xs text-text-muted">Loading load details...</div>}>
      <LoadDetailContent {...props} />
    </Suspense>
  );
}
