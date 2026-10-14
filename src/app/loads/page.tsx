'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useApp } from '@/lib/data/AppContext';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { LoadQuickViewModal } from '@/components/loads/LoadQuickViewModal';
import { LoadEditModal } from '@/components/loads/LoadEditModal';
import { LoadDeleteModal } from '@/components/loads/LoadDeleteModal';
import { Load, LoadStatus } from '@/types';
import {
  Truck,
  Plus,
  Search,
  Filter,
  Eye,
  Edit,
  Trash2,
  MapPin,
  ExternalLink,
} from 'lucide-react';

function LoadsBoardContent() {
  const searchParams = useSearchParams();
  const initialStatus = searchParams.get('status') || 'all';

  const { scopedLoads } = useApp();
  const [activeStatus, setActiveStatus] = useState<string>(initialStatus);
  const [searchQuery, setSearchQuery] = useState('');

  // Modals state
  const [quickViewLoad, setQuickViewLoad] = useState<Load | null>(null);
  const [editLoad, setEditLoad] = useState<Load | null>(null);
  const [deleteLoadItem, setDeleteLoadItem] = useState<Load | null>(null);

  const filteredLoads = useMemo(() => {
    return scopedLoads.filter((load) => {
      // Status filter
      if (activeStatus !== 'all' && load.status !== activeStatus) {
        return false;
      }
      // Search filter
      if (searchQuery.trim().length > 0) {
        const q = searchQuery.toLowerCase();
        const matchNumber = load.load_number?.toLowerCase().includes(q);
        const matchBroker = load.broker_name?.toLowerCase().includes(q);
        const matchOrigin = load.origin_city?.toLowerCase().includes(q);
        const matchDest = load.destination_city?.toLowerCase().includes(q);
        const matchDriver = load.driver_name?.toLowerCase().includes(q);
        const matchRef = load.rate_con_number?.toLowerCase().includes(q);
        return matchNumber || matchBroker || matchOrigin || matchDest || matchDriver || matchRef;
      }
      return true;
    });
  }, [scopedLoads, activeStatus, searchQuery]);

  const totalGross = filteredLoads.reduce((sum, l) => sum + l.gross_amount, 0);
  const totalCut = filteredLoads.reduce((sum, l) => sum + l.dispatcher_cut, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Truck className="h-5 w-5 text-brand-500" />
            <h1 className="text-2xl font-black tracking-tight text-text-main">
              Loads Board
            </h1>
          </div>
          <p className="text-xs text-text-muted mt-0.5">
            Active freight pipeline, dispatch assignments, and load lifecycles
          </p>
        </div>

        <Link
          href="/loads/new"
          className="btn-primary text-xs py-2 px-3.5 shadow-xs self-start sm:self-auto"
        >
          <Plus className="h-4 w-4" />
          <span>Book Load (Import Rate Con)</span>
        </Link>
      </div>

      {/* Filters & Search Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Status Filter Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto pb-1 text-xs">
          {[
            { id: 'all', label: 'All Loads' },
            { id: 'booked', label: 'Booked' },
            { id: 'in_transit', label: 'In Transit' },
            { id: 'delivered', label: 'Delivered' },
            { id: 'invoiced', label: 'Invoiced' },
            { id: 'paid', label: 'Paid' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveStatus(tab.id)}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
                activeStatus === tab.id
                  ? 'bg-brand-500 text-zinc-950 font-bold'
                  : 'bg-card border border-border text-text-muted hover:text-text-main hover:bg-card-subtle'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search Bar */}
        <div className="relative min-w-[240px]">
          <Search className="h-4 w-4 text-text-muted absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search load #, broker, city, driver..."
            className="tms-input pl-9 text-xs"
          />
        </div>
      </div>

      {/* Loads Table */}
      <div className="tms-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-card-subtle text-text-muted uppercase text-[10px] tracking-wider border-b border-border">
              <tr>
                <th className="p-3.5 font-bold">Load #</th>
                <th className="p-3.5 font-bold">Status</th>
                <th className="p-3.5 font-bold">Lane (Origin → Dest)</th>
                <th className="p-3.5 font-bold">Dates</th>
                <th className="p-3.5 font-bold">Broker</th>
                <th className="p-3.5 font-bold">Driver / Tractor</th>
                <th className="p-3.5 font-bold text-right">Gross Freight</th>
                <th className="p-3.5 font-bold text-right">Dispatch Cut</th>
                <th className="p-3.5 font-bold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-card">
              {filteredLoads.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-text-muted">
                    No loads found matching the active criteria.
                  </td>
                </tr>
              ) : (
                filteredLoads.map((load) => (
                  <tr
                    key={load.id}
                    className="hover:bg-card-subtle/50 transition-colors"
                  >
                    <td className="p-3.5 font-bold text-text-main font-mono">
                      <button
                        onClick={() => setQuickViewLoad(load)}
                        className="hover:text-brand-500 hover:underline"
                      >
                        {load.load_number}
                      </button>
                    </td>
                    <td className="p-3.5">
                      <StatusBadge status={load.status} type="load" />
                    </td>
                    <td className="p-3.5">
                      <div className="font-semibold text-text-main flex items-center gap-1">
                        <span>{load.origin_city}, {load.origin_state}</span>
                        <span className="text-text-muted">→</span>
                        <span>{load.destination_city}, {load.destination_state}</span>
                      </div>
                      <span className="text-[10px] text-text-muted">
                        {load.total_miles ? `${load.total_miles} mi` : ''}
                        {load.rate_per_mile ? ` • $${load.rate_per_mile.toFixed(2)}/mi` : ''}
                      </span>
                    </td>
                    <td className="p-3.5 text-text-muted">
                      <div>{load.pickup_date}</div>
                      <div className="text-[10px]">{load.delivery_date}</div>
                    </td>
                    <td className="p-3.5">
                      <div className="font-medium text-text-main">{load.broker_name}</div>
                      <span className="text-[10px] text-text-muted">{load.rate_con_number}</span>
                    </td>
                    <td className="p-3.5 text-text-muted">
                      {load.driver_name ? (
                        <div>
                          <span className="font-semibold text-text-main">{load.driver_name}</span>
                          <span className="block text-[10px]">{load.truck_unit || 'Tractor'}</span>
                        </div>
                      ) : (
                        <span className="text-amber-500 font-medium italic">Unassigned</span>
                      )}
                    </td>
                    <td className="p-3.5 text-right font-semibold text-emerald-500 tabular-nums">
                      ${load.gross_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                    <td className="p-3.5 text-right font-bold text-brand-500 tabular-nums">
                      ${load.dispatcher_cut.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                    <td className="p-3.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => setQuickViewLoad(load)}
                          title="Quick View"
                          className="p-1.5 rounded hover:bg-card-subtle text-text-muted hover:text-text-main"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => setEditLoad(load)}
                          title="Edit Load"
                          className="p-1.5 rounded hover:bg-card-subtle text-text-muted hover:text-text-main"
                        >
                          <Edit className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => setDeleteLoadItem(load)}
                          title="Delete Load"
                          className="p-1.5 rounded hover:bg-card-subtle text-text-muted hover:text-red-500"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Footer Totals */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 bg-card-subtle border-t border-border text-xs text-text-muted">
          <span>
            Showing <strong className="text-text-main">{filteredLoads.length}</strong> loads
          </span>
          <div className="flex items-center gap-4">
            <span>
              Total Freight:{' '}
              <strong className="text-emerald-500 tabular-nums">
                ${totalGross.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </strong>
            </span>
            <span>
              Total Dispatch Cut:{' '}
              <strong className="text-brand-500 tabular-nums">
                ${totalCut.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </strong>
            </span>
          </div>
        </div>
      </div>

      {/* Modals */}
      <LoadQuickViewModal
        load={quickViewLoad}
        onClose={() => setQuickViewLoad(null)}
        onEdit={(l) => setEditLoad(l)}
      />

      <LoadEditModal
        load={editLoad}
        onClose={() => setEditLoad(null)}
      />

      <LoadDeleteModal
        load={deleteLoadItem}
        onClose={() => setDeleteLoadItem(null)}
      />
    </div>
  );
}

export default function LoadsPage() {
  return (
    <React.Suspense fallback={<div className="p-8 text-center text-xs text-text-muted">Loading Loads Board...</div>}>
      <LoadsBoardContent />
    </React.Suspense>
  );
}
