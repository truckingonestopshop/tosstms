import React from 'react';
import { LoadStop } from '@/types';
import { MapPin, ArrowDown, Clock, Building } from 'lucide-react';

interface LoadStopsTimelineProps {
  stops?: LoadStop[];
  className?: string;
}

export function LoadStopsTimeline({ stops = [], className = '' }: LoadStopsTimelineProps) {
  if (!stops || stops.length === 0) {
    return (
      <div className="text-xs text-text-muted italic py-2">
        No intermediate stops recorded for this lane.
      </div>
    );
  }

  return (
    <div className={`space-y-3 relative ${className}`}>
      {stops.map((stop, idx) => {
        const isPickup = stop.type === 'pickup';
        const isDelivery = stop.type === 'delivery';

        return (
          <div key={stop.id || idx} className="flex items-start gap-3 relative">
            {/* Dot & Connecting Line */}
            <div className="flex flex-col items-center">
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                  isPickup
                    ? 'bg-emerald-500/20 text-emerald-500 border border-emerald-500/40'
                    : isDelivery
                    ? 'bg-brand-500/20 text-brand-500 border border-brand-500/40'
                    : 'bg-zinc-500/20 text-zinc-400 border border-zinc-500/30'
                }`}
              >
                {stop.stop_number}
              </div>
              {idx < stops.length - 1 && (
                <div className="w-0.5 h-8 bg-border my-1 shrink-0" />
              )}
            </div>

            {/* Stop Content */}
            <div className="flex-1 pb-1">
              <div className="flex flex-wrap items-center justify-between gap-1">
                <span className="text-xs font-bold text-text-main">
                  {stop.facility_name || (isPickup ? 'Origin Shipper' : 'Destination Receiver')}
                </span>
                <span className="text-[11px] font-medium text-text-muted">
                  {stop.date} {stop.appointment_time ? `• ${stop.appointment_time}` : ''}
                </span>
              </div>
              <div className="text-xs text-text-muted">
                {stop.address ? `${stop.address}, ` : ''}
                {stop.city}, {stop.state} {stop.zip || ''}
              </div>
              {stop.miles_from_previous !== undefined && stop.miles_from_previous > 0 && (
                <div className="text-[11px] font-mono font-medium text-brand-500 mt-1 flex items-center gap-1.5">
                  <span className="bg-brand-500/10 px-1.5 py-0.5 rounded border border-brand-500/20">
                    +{stop.miles_from_previous} mi from Stop {idx}
                  </span>
                  {stop.leg_summary && (
                    <span className="text-text-muted text-[10px] italic">
                      via {stop.leg_summary}
                    </span>
                  )}
                </div>
              )}
              {stop.commodities && (
                <div className="text-[11px] text-text-muted mt-0.5">
                  Commodity: {stop.commodities}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
