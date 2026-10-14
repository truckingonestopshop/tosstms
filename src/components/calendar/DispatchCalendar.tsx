'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { Load, LoadStatus, TimeRangePreset } from '@/types';
import { useApp } from '@/lib/data/AppContext';
import { StatusBadge } from '@/components/ui/StatusBadge';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Clock,
  CheckCircle2,
  DollarSign,
  TrendingUp,
  Filter,
  Layers,
  MapPin,
  Truck,
  ArrowRight,
  CheckSquare,
  Square,
  RotateCcw,
} from 'lucide-react';

interface DispatchCalendarProps {
  loads: Load[];
  onSelectLoad: (load: Load) => void;
  timeRange: TimeRangePreset;
  onTimeRangeChange: (preset: TimeRangePreset) => void;
  customStartDate?: string;
  customEndDate?: string;
  onCustomDateChange?: (start: string, end: string) => void;
  mode?: 'batch-status' | 'select-only';
  onSelectionChange?: (ids: string[]) => void;
}

const PRESETS: { id: TimeRangePreset; label: string }[] = [
  { id: '7d', label: 'Last 7 Days' },
  { id: '1m', label: 'Last 1 Month' },
  { id: '3m', label: 'Last 3 Months' },
  { id: '6m', label: 'Last 6 Months' },
  { id: '1y', label: '1 Year' },
  { id: 'all', label: 'Lifetime' },
  { id: 'custom', label: 'Custom' },
];

export function DispatchCalendar({
  loads,
  onSelectLoad,
  timeRange,
  onTimeRangeChange,
  customStartDate = '',
  customEndDate = '',
  onCustomDateChange,
  mode = 'batch-status',
  onSelectionChange,
}: DispatchCalendarProps) {
  const { batchChangeLoadStatus } = useApp();

  const [viewMode, setViewMode] = useState<'grid' | 'agenda'>('grid');
  const [selectedLoadIds, setSelectedLoadIds] = useState<string[]>([]);
  const [batchSuccessMsg, setBatchSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    onSelectionChange?.(selectedLoadIds);
  }, [selectedLoadIds, onSelectionChange]);

  // Month navigation for Grid View
  const [currentMonthDate, setCurrentMonthDate] = useState<Date>(() => {
    if (loads.length > 0) {
      const dates = loads
        .map((l) => new Date(l.pickup_date || l.delivery_date).getTime())
        .filter((t) => !isNaN(t));
      if (dates.length > 0) {
        const latest = new Date(Math.max(...dates));
        return new Date(latest.getFullYear(), latest.getMonth(), 1);
      }
    }
    return new Date();
  });

  const [customStart, setCustomStart] = useState<string>(customStartDate || '2026-10-01');
  const [customEnd, setCustomEnd] = useState<string>(customEndDate || '2026-10-31');

  const monthName = currentMonthDate.toLocaleString('default', { month: 'long', year: 'numeric' });

  const prevMonth = () => {
    setCurrentMonthDate(new Date(currentMonthDate.getFullYear(), currentMonthDate.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setCurrentMonthDate(new Date(currentMonthDate.getFullYear(), currentMonthDate.getMonth() + 1, 1));
  };

  const resetToToday = () => {
    setCurrentMonthDate(new Date());
  };

  // Build grid days for the month view
  const calendarDays = useMemo(() => {
    const year = currentMonthDate.getFullYear();
    const month = currentMonthDate.getMonth();

    const firstDayIndex = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();

    const days = [];

    // Previous month filler days
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const d = daysInPrevMonth - i;
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      days.push({ dayNumber: d, dateStr, isCurrentMonth: false });
    }

    // Current month days
    for (let i = 1; i <= daysInMonth; i++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
      days.push({ dayNumber: i, dateStr, isCurrentMonth: true });
    }

    // Next month filler days to complete rows (multiples of 7)
    const remaining = (7 - (days.length % 7)) % 7;
    for (let i = 1; i <= remaining; i++) {
      const dateStr = `${year}-${String(month + 2).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
      days.push({ dayNumber: i, dateStr, isCurrentMonth: false });
    }

    return days;
  }, [currentMonthDate]);

  // Map loads to dates
  const loadsByDate = useMemo(() => {
    const map: Record<string, Load[]> = {};
    loads.forEach((load) => {
      const pDate = load.pickup_date?.split('T')[0];
      const dDate = load.delivery_date?.split('T')[0];

      if (pDate) {
        if (!map[pDate]) map[pDate] = [];
        if (!map[pDate].some((l) => l.id === load.id)) map[pDate].push(load);
      }
      if (dDate && dDate !== pDate) {
        if (!map[dDate]) map[dDate] = [];
        if (!map[dDate].some((l) => l.id === load.id)) map[dDate].push(load);
      }
    });
    return map;
  }, [loads]);

  const toggleSelectLoad = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedLoadIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleBatchStatus = async (status: LoadStatus) => {
    if (selectedLoadIds.length === 0) return;
    await batchChangeLoadStatus(selectedLoadIds, status);
    setBatchSuccessMsg(`Updated ${selectedLoadIds.length} loads to "${status}"`);
    setSelectedLoadIds([]);
    setTimeout(() => setBatchSuccessMsg(null), 3000);
  };

  return (
    <div className="tms-card p-5 space-y-4">
      {/* Top Bar: Presets & Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-border pb-4">
        <div>
          <div className="flex items-center gap-2">
            <CalendarIcon className="h-4 w-4 text-brand-500" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-text-main">
              Dispatch Schedule & Calendar
            </h3>
          </div>
          <p className="text-xs text-text-muted mt-0.5">
            Active pickup and delivery milestones across assigned carrier equipment
          </p>
        </div>

        {/* Preset Selector */}
        <div className="flex flex-wrap items-center gap-1.5">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => onTimeRangeChange(p.id)}
              className={`text-xs px-2.5 py-1 rounded-md font-medium transition-all ${
                timeRange === p.id
                  ? 'bg-brand-500 text-zinc-950 font-bold'
                  : 'bg-card-subtle text-text-muted hover:text-text-main hover:bg-card border border-border'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Sub Header: Month Navigation + View Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={prevMonth}
            className="p-1.5 rounded-md border border-border bg-card text-text-muted hover:text-text-main transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-bold text-text-main min-w-[140px] text-center">
            {monthName}
          </span>
          <button
            onClick={nextMonth}
            className="p-1.5 rounded-md border border-border bg-card text-text-muted hover:text-text-main transition-colors"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <button
            onClick={resetToToday}
            className="text-xs text-text-muted hover:text-text-main px-2 py-1 rounded border border-border bg-card flex items-center gap-1"
          >
            <RotateCcw className="h-3 w-3" /> Today
          </button>
        </div>

        {/* View Toggle */}
        <div className="flex items-center rounded-lg border border-border p-0.5 bg-card-subtle text-xs">
          <button
            onClick={() => setViewMode('grid')}
            className={`px-3 py-1 rounded-md font-medium transition-all ${
              viewMode === 'grid' ? 'bg-card text-text-main shadow-xs font-bold' : 'text-text-muted'
            }`}
          >
            Month Grid
          </button>
          <button
            onClick={() => setViewMode('agenda')}
            className={`px-3 py-1 rounded-md font-medium transition-all ${
              viewMode === 'agenda' ? 'bg-card text-text-main shadow-xs font-bold' : 'text-text-muted'
            }`}
          >
            Timeline Agenda
          </button>
        </div>
      </div>

      {/* Batch Actions Bar (when loads are selected) */}
      {selectedLoadIds.length > 0 && mode === 'batch-status' && (
        <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-lg bg-brand-500/10 border border-brand-500/30 text-xs">
          <div className="flex items-center gap-2 text-text-main font-semibold">
            <CheckSquare className="h-4 w-4 text-brand-500" />
            <span>{selectedLoadIds.length} loads selected</span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => handleBatchStatus('delivered')}
              className="px-2.5 py-1 rounded bg-emerald-600 text-white font-medium hover:bg-emerald-500"
            >
              Mark Delivered
            </button>
            <button
              onClick={() => handleBatchStatus('invoiced')}
              className="px-2.5 py-1 rounded bg-indigo-600 text-white font-medium hover:bg-indigo-500"
            >
              Mark Invoiced
            </button>
            <button
              onClick={() => handleBatchStatus('paid')}
              className="px-2.5 py-1 rounded bg-brand-500 text-zinc-950 font-bold hover:bg-brand-600"
            >
              Mark Paid
            </button>
            <button
              onClick={() => setSelectedLoadIds([])}
              className="px-2 py-1 text-text-muted hover:text-text-main"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {batchSuccessMsg && (
        <div className="p-2 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-500 text-xs font-semibold flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4" />
          <span>{batchSuccessMsg}</span>
        </div>
      )}

      {/* Grid View */}
      {viewMode === 'grid' && (
        <div className="border border-border rounded-lg overflow-hidden">
          {/* Weekday Headers */}
          <div className="grid grid-cols-7 bg-card-subtle border-b border-border text-center py-2 text-[11px] font-bold text-text-muted uppercase tracking-wider">
            <span>Sun</span>
            <span>Mon</span>
            <span>Tue</span>
            <span>Wed</span>
            <span>Thu</span>
            <span>Fri</span>
            <span>Sat</span>
          </div>

          {/* Days Grid */}
          <div className="grid grid-cols-7 divide-x divide-y divide-border bg-card">
            {calendarDays.map((cd, idx) => {
              const dayLoads = loadsByDate[cd.dateStr] || [];
              const isToday = cd.dateStr === new Date().toISOString().split('T')[0];

              return (
                <div
                  key={idx}
                  className={`min-h-[105px] p-1.5 flex flex-col justify-between transition-colors ${
                    !cd.isCurrentMonth
                      ? 'bg-card-subtle/30 text-text-muted opacity-40'
                      : isToday
                      ? 'bg-brand-500/5'
                      : 'hover:bg-card-subtle/20'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center ${
                        isToday ? 'bg-brand-500 text-zinc-950' : 'text-text-main'
                      }`}
                    >
                      {cd.dayNumber}
                    </span>
                    {dayLoads.length > 0 && (
                      <span className="text-[10px] text-text-muted font-medium">
                        {dayLoads.length} load{dayLoads.length > 1 ? 's' : ''}
                      </span>
                    )}
                  </div>

                  {/* Day's Load Pills */}
                  <div className="space-y-1 mt-1 overflow-y-auto max-h-[75px]">
                    {dayLoads.map((load) => {
                      const isSelected = selectedLoadIds.includes(load.id);
                      return (
                        <div
                          key={load.id}
                          onClick={() => onSelectLoad(load)}
                          className={`group cursor-pointer rounded px-1.5 py-1 text-[11px] border transition-all flex items-center justify-between gap-1 ${
                            isSelected
                              ? 'border-brand-500 bg-brand-500/20 text-brand-500'
                              : 'border-border bg-card-subtle hover:border-brand-500/50 hover:bg-card text-text-main'
                          }`}
                        >
                          <div className="truncate font-semibold flex items-center gap-1">
                            <button
                              onClick={(e) => toggleSelectLoad(load.id, e)}
                              className="text-text-muted hover:text-brand-500 shrink-0"
                            >
                              {isSelected ? (
                                <CheckSquare className="h-3 w-3 text-brand-500" />
                              ) : (
                                <Square className="h-3 w-3" />
                              )}
                            </button>
                            <span className="text-text-main font-bold">
                              {load.load_number || load.origin_city}
                            </span>
                            <span className="text-text-muted text-[10px]">
                              → {load.destination_city}
                            </span>
                          </div>
                          <span className="text-emerald-500 font-bold shrink-0 text-[10px] tabular-nums">
                            ${load.gross_amount}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Timeline Agenda View */}
      {viewMode === 'agenda' && (
        <div className="divide-y divide-border border border-border rounded-lg overflow-hidden">
          {loads.length === 0 ? (
            <div className="p-8 text-center text-text-muted text-sm">
              No loads scheduled for this period.
            </div>
          ) : (
            loads.map((load) => {
              const isSelected = selectedLoadIds.includes(load.id);
              return (
                <div
                  key={load.id}
                  onClick={() => onSelectLoad(load)}
                  className={`p-3.5 flex flex-wrap items-center justify-between gap-3 cursor-pointer transition-colors ${
                    isSelected ? 'bg-brand-500/10' : 'hover:bg-card-subtle bg-card'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <button
                      onClick={(e) => toggleSelectLoad(load.id, e)}
                      className="text-text-muted hover:text-brand-500"
                    >
                      {isSelected ? (
                        <CheckSquare className="h-4 w-4 text-brand-500" />
                      ) : (
                        <Square className="h-4 w-4" />
                      )}
                    </button>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-text-main">
                          {load.load_number}
                        </span>
                        <StatusBadge status={load.status} type="load" />
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-text-muted mt-1">
                        <MapPin className="h-3.5 w-3.5 text-brand-500" />
                        <span>
                          {load.origin_city}, {load.origin_state} ({load.pickup_date})
                        </span>
                        <span>→</span>
                        <span>
                          {load.destination_city}, {load.destination_state} ({load.delivery_date})
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-right">
                    <div>
                      <div className="text-sm font-extrabold text-emerald-500 tabular-nums">
                        ${load.gross_amount.toLocaleString()}
                      </div>
                      <div className="text-[11px] text-text-muted">
                        Cut: ${load.dispatcher_cut.toLocaleString()}
                      </div>
                    </div>
                    {load.driver_name && (
                      <div className="hidden sm:block text-xs text-text-muted">
                        <div className="font-semibold text-text-main">{load.driver_name}</div>
                        <div>{load.truck_unit || 'Tractor'}</div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
