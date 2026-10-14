'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { useApp } from '@/lib/data/AppContext';
import { DispatchCalendar } from '@/components/calendar/DispatchCalendar';
import { LoadQuickViewModal } from '@/components/loads/LoadQuickViewModal';
import { LiveBrokerDeskModal } from '@/components/company/LiveBrokerDeskModal';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Load, TimeRangePreset } from '@/types';
import {
  DollarSign,
  TrendingUp,
  Truck,
  FileCheck2,
  Plus,
  ArrowRight,
  Building,
  Calendar,
  Layers,
  MapPin,
} from 'lucide-react';

export default function DashboardPage() {
  const { scopedLoads, activeCompany } = useApp();
  const [selectedLoad, setSelectedLoad] = useState<Load | null>(null);
  const [isBrokerDeskOpen, setIsBrokerDeskOpen] = useState(false);
  const [timeRange, setTimeRange] = useState<TimeRangePreset>('1m');

  // KPI Calculations
  const stats = useMemo(() => {
    let grossTotal = 0;
    let cutTotal = 0;
    let inTransitGross = 0;
    let uninvoicedGross = 0;

    const counts = {
      booked: 0,
      in_transit: 0,
      delivered: 0,
      invoiced: 0,
      paid: 0,
    };

    scopedLoads.forEach((load) => {
      grossTotal += load.gross_amount;
      cutTotal += load.dispatcher_cut;

      if (load.status === 'in_transit') {
        counts.in_transit++;
        inTransitGross += load.gross_amount;
      } else if (load.status === 'delivered') {
        counts.delivered++;
        uninvoicedGross += load.gross_amount;
      } else if (load.status === 'booked') {
        counts.booked++;
      } else if (load.status === 'invoiced') {
        counts.invoiced++;
      } else if (load.status === 'paid') {
        counts.paid++;
      }
    });

    return {
      grossTotal,
      cutTotal,
      inTransitGross,
      uninvoicedGross,
      counts,
    };
  }, [scopedLoads]);

  return (
    <div className="space-y-6">
      {/* Top Banner: Welcome & Quick Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-text-main">
            Operations Control Center
          </h1>
          <p className="text-xs text-text-muted mt-0.5">
            {activeCompany
              ? `Active Scope: ${activeCompany.name} (MC# ${activeCompany.mc_number})`
              : 'Master View: All Managed Carriers'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsBrokerDeskOpen(true)}
            className="btn-secondary text-xs py-2 px-3 shadow-xs"
          >
            <Building className="h-4 w-4 text-brand-500" />
            <span>Broker Desk</span>
          </button>
          <Link
            href="/loads/new"
            className="btn-primary text-xs py-2 px-3.5 shadow-xs"
          >
            <Plus className="h-4 w-4" />
            <span>Book New Load</span>
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Gross Revenue */}
        <div className="tms-card p-4 sm:p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-text-muted">
            <span className="text-[11px] font-bold uppercase tracking-wider">Gross Volume</span>
            <DollarSign className="h-4 w-4 text-emerald-500" />
          </div>
          <div className="mt-3">
            <div className="text-xl sm:text-2xl font-black text-emerald-500 tabular-nums">
              ${stats.grossTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </div>
            <span className="text-[10px] text-text-muted mt-0.5 block">
              Across {scopedLoads.length} recorded loads
            </span>
          </div>
        </div>

        {/* Dispatcher Cut */}
        <div className="tms-card p-4 sm:p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-text-muted">
            <span className="text-[11px] font-bold uppercase tracking-wider">Commission Cut</span>
            <TrendingUp className="h-4 w-4 text-brand-500" />
          </div>
          <div className="mt-3">
            <div className="text-xl sm:text-2xl font-black text-brand-500 tabular-nums">
              ${stats.cutTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </div>
            <span className="text-[10px] text-text-muted mt-0.5 block">
              Net dispatch operations revenue
            </span>
          </div>
        </div>

        {/* Active In-Transit */}
        <div className="tms-card p-4 sm:p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-text-muted">
            <span className="text-[11px] font-bold uppercase tracking-wider">Active In-Transit</span>
            <Truck className="h-4 w-4 text-blue-500" />
          </div>
          <div className="mt-3">
            <div className="text-xl sm:text-2xl font-black text-text-main tabular-nums">
              {stats.counts.in_transit} <span className="text-xs text-text-muted font-normal">loads</span>
            </div>
            <span className="text-[10px] text-text-muted mt-0.5 block">
              ${stats.inTransitGross.toLocaleString()} freight on road
            </span>
          </div>
        </div>

        {/* Uninvoiced Delivered */}
        <div className="tms-card p-4 sm:p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-text-muted">
            <span className="text-[11px] font-bold uppercase tracking-wider">Ready to Bill</span>
            <FileCheck2 className="h-4 w-4 text-amber-500" />
          </div>
          <div className="mt-3">
            <div className="text-xl sm:text-2xl font-black text-amber-500 tabular-nums">
              {stats.counts.delivered} <span className="text-xs text-text-muted font-normal">loads</span>
            </div>
            <span className="text-[10px] text-text-muted mt-0.5 block">
              ${stats.uninvoicedGross.toLocaleString()} delivered pending invoice
            </span>
          </div>
        </div>
      </div>

      {/* Quick Status Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
        {[
          { label: 'Booked', count: stats.counts.booked, status: 'booked' },
          { label: 'In Transit', count: stats.counts.in_transit, status: 'in_transit' },
          { label: 'Delivered', count: stats.counts.delivered, status: 'delivered' },
          { label: 'Invoiced', count: stats.counts.invoiced, status: 'invoiced' },
          { label: 'Paid', count: stats.counts.paid, status: 'paid' },
        ].map((item) => (
          <Link
            key={item.label}
            href={`/loads?status=${item.status}`}
            className="p-2.5 rounded-xl border border-border bg-card hover:bg-card-subtle transition-colors flex items-center justify-between"
          >
            <span className="font-semibold text-text-muted">{item.label}</span>
            <span className="font-extrabold text-text-main tabular-nums bg-card-subtle px-2 py-0.5 rounded-full border border-border">
              {item.count}
            </span>
          </Link>
        ))}
      </div>

      {/* Interactive Dispatch Calendar Component */}
      <DispatchCalendar
        loads={scopedLoads}
        onSelectLoad={setSelectedLoad}
        timeRange={timeRange}
        onTimeRangeChange={setTimeRange}
      />

      {/* Recent Loads Table */}
      <div className="tms-card p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-text-main">
              Recent Load Activity
            </h3>
            <p className="text-xs text-text-muted">
              Live freight movements across assigned equipment
            </p>
          </div>
          <Link
            href="/loads"
            className="text-xs font-semibold text-brand-500 hover:underline flex items-center gap-1"
          >
            <span>View All Loads</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-card-subtle text-text-muted uppercase text-[10px] tracking-wider border-b border-border">
              <tr>
                <th className="p-3">Load #</th>
                <th className="p-3">Status</th>
                <th className="p-3">Lane</th>
                <th className="p-3">Dates</th>
                <th className="p-3">Broker</th>
                <th className="p-3">Equipment</th>
                <th className="p-3 text-right">Gross Rate</th>
                <th className="p-3 text-right">Dispatch Cut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-card">
              {scopedLoads.slice(0, 5).map((load) => (
                <tr
                  key={load.id}
                  onClick={() => setSelectedLoad(load)}
                  className="hover:bg-card-subtle cursor-pointer transition-colors"
                >
                  <td className="p-3 font-bold text-text-main">{load.load_number}</td>
                  <td className="p-3">
                    <StatusBadge status={load.status} type="load" />
                  </td>
                  <td className="p-3 text-text-main font-medium">
                    {load.origin_city}, {load.origin_state} → {load.destination_city}, {load.destination_state}
                  </td>
                  <td className="p-3 text-text-muted">
                    {load.pickup_date} → {load.delivery_date}
                  </td>
                  <td className="p-3 text-text-muted">{load.broker_name}</td>
                  <td className="p-3 text-text-muted">
                    {load.driver_name ? `${load.driver_name} (${load.truck_unit})` : 'Unassigned'}
                  </td>
                  <td className="p-3 text-right font-semibold text-emerald-500 tabular-nums">
                    ${load.gross_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </td>
                  <td className="p-3 text-right font-bold text-brand-500 tabular-nums">
                    ${load.dispatcher_cut.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Quick View Modal */}
      <LoadQuickViewModal
        load={selectedLoad}
        onClose={() => setSelectedLoad(null)}
      />

      {/* Live Broker Desk Modal */}
      <LiveBrokerDeskModal
        isOpen={isBrokerDeskOpen}
        onClose={() => setIsBrokerDeskOpen(false)}
      />
    </div>
  );
}
