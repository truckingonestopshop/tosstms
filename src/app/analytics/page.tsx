'use client';

import React, { useMemo } from 'react';
import { useApp } from '@/lib/data/AppContext';
import {
  BarChart3,
  TrendingUp,
  DollarSign,
  Truck,
  MapPin,
  Calendar,
  Layers,
} from 'lucide-react';

export default function AnalyticsPage() {
  const { scopedLoads, companies } = useApp();

  const metrics = useMemo(() => {
    let grossTotal = 0;
    let cutTotal = 0;
    let totalMiles = 0;
    let rpmSum = 0;
    let rpmCount = 0;

    const laneMap: Record<string, { loads: number; gross: number; cut: number }> = {};
    const carrierMap: Record<string, { loads: number; gross: number; cut: number; name: string }> = {};

    scopedLoads.forEach((load) => {
      grossTotal += load.gross_amount;
      cutTotal += load.dispatcher_cut;
      const miles = load.total_miles || load.loaded_miles || 0;
      totalMiles += miles;

      if (load.rate_per_mile && load.rate_per_mile > 0) {
        rpmSum += load.rate_per_mile;
        rpmCount++;
      } else if (miles > 0 && load.gross_amount > 0) {
        rpmSum += load.gross_amount / miles;
        rpmCount++;
      }

      // Lane aggregation
      const laneKey = `${load.origin_state} → ${load.destination_state}`;
      if (!laneMap[laneKey]) laneMap[laneKey] = { loads: 0, gross: 0, cut: 0 };
      laneMap[laneKey].loads++;
      laneMap[laneKey].gross += load.gross_amount;
      laneMap[laneKey].cut += load.dispatcher_cut;

      // Carrier aggregation
      const cId = load.company_id || 'other';
      if (!carrierMap[cId]) {
        carrierMap[cId] = {
          loads: 0,
          gross: 0,
          cut: 0,
          name: load.company_name || companies.find((c) => c.id === cId)?.name || 'Carrier',
        };
      }
      carrierMap[cId].loads++;
      carrierMap[cId].gross += load.gross_amount;
      carrierMap[cId].cut += load.dispatcher_cut;
    });

    const avgRpm = rpmCount > 0 ? rpmSum / rpmCount : 3.85;

    return {
      grossTotal,
      cutTotal,
      totalMiles,
      avgRpm,
      topLanes: Object.entries(laneMap).sort((a, b) => b[1].gross - a[1].gross),
      carrierBreakdown: Object.entries(carrierMap).sort((a, b) => b[1].gross - a[1].gross),
    };
  }, [scopedLoads, companies]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="border-b border-border pb-4">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-brand-500" />
          <h1 className="text-2xl font-black tracking-tight text-text-main">
            Revenue & Margin Analytics
          </h1>
        </div>
        <p className="text-xs text-text-muted mt-0.5">
          Rate per mile (RPM), operational margins, lane profitability, and carrier performance
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="tms-card p-4">
          <span className="text-[11px] font-bold uppercase tracking-wider text-text-muted block">
            Total Freight Volume
          </span>
          <div className="text-xl sm:text-2xl font-black text-emerald-500 tabular-nums mt-2">
            ${metrics.grossTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
          <span className="text-[10px] text-text-muted mt-1 block">
            Gross freight handled
          </span>
        </div>

        <div className="tms-card p-4">
          <span className="text-[11px] font-bold uppercase tracking-wider text-text-muted block">
            Net Dispatch Cuts
          </span>
          <div className="text-xl sm:text-2xl font-black text-brand-500 tabular-nums mt-2">
            ${metrics.cutTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
          <span className="text-[10px] text-text-muted mt-1 block">
            Earned operational fees
          </span>
        </div>

        <div className="tms-card p-4">
          <span className="text-[11px] font-bold uppercase tracking-wider text-text-muted block">
            Average Rate Per Mile (RPM)
          </span>
          <div className="text-xl sm:text-2xl font-black text-text-main tabular-nums mt-2">
            ${metrics.avgRpm.toFixed(2)}/mi
          </div>
          <span className="text-[10px] text-text-muted mt-1 block">
            Across all active loads
          </span>
        </div>

        <div className="tms-card p-4">
          <span className="text-[11px] font-bold uppercase tracking-wider text-text-muted block">
            Total Highway Miles
          </span>
          <div className="text-xl sm:text-2xl font-black text-text-main tabular-nums mt-2">
            {metrics.totalMiles.toLocaleString()} mi
          </div>
          <span className="text-[10px] text-text-muted mt-1 block">
            Dispatch transit tracking
          </span>
        </div>
      </div>

      {/* Top Lanes & Carrier Performance */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top Lanes */}
        <div className="tms-card p-5 space-y-4">
          <div className="flex items-center gap-2 border-b border-border pb-3">
            <MapPin className="h-4 w-4 text-brand-500" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-text-main">
              Top Lanes by Volume
            </h3>
          </div>

          <div className="space-y-3 text-xs">
            {metrics.topLanes.length === 0 ? (
              <p className="text-text-muted italic">No lane data recorded yet.</p>
            ) : (
              metrics.topLanes.map(([lane, data]) => {
                const percent = metrics.grossTotal > 0 ? (data.gross / metrics.grossTotal) * 100 : 0;
                return (
                  <div key={lane} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-text-main">{lane}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-text-muted font-medium">{data.loads} load(s)</span>
                        <span className="font-bold text-emerald-500 tabular-nums">
                          ${data.gross.toLocaleString()}
                        </span>
                      </div>
                    </div>
                    {/* Progress Bar */}
                    <div className="w-full h-1.5 rounded-full bg-card-subtle overflow-hidden">
                      <div
                        className="h-full bg-brand-500 rounded-full transition-all"
                        style={{ width: `${Math.max(5, percent)}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Carrier Breakdown */}
        <div className="tms-card p-5 space-y-4">
          <div className="flex items-center gap-2 border-b border-border pb-3">
            <Truck className="h-4 w-4 text-brand-500" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-text-main">
              Carrier Volume & Performance
            </h3>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-card-subtle text-text-muted uppercase text-[10px] tracking-wider border-b border-border">
                <tr>
                  <th className="p-2.5">Carrier</th>
                  <th className="p-2.5">Loads</th>
                  <th className="p-2.5 text-right">Gross Freight</th>
                  <th className="p-2.5 text-right">Dispatcher Cut</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-card">
                {metrics.carrierBreakdown.map(([id, data]) => (
                  <tr key={id} className="hover:bg-card-subtle/50">
                    <td className="p-2.5 font-bold text-text-main">{data.name}</td>
                    <td className="p-2.5 text-text-muted">{data.loads}</td>
                    <td className="p-2.5 text-right font-medium text-emerald-500 tabular-nums">
                      ${data.gross.toLocaleString()}
                    </td>
                    <td className="p-2.5 text-right font-bold text-brand-500 tabular-nums">
                      ${data.cut.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
