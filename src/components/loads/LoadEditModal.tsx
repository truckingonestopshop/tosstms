'use client';

import React, { useState, useEffect } from 'react';
import { Load, LoadStatus } from '@/types';
import { useApp } from '@/lib/data/AppContext';
import { X, Save, AlertCircle } from 'lucide-react';

interface LoadEditModalProps {
  load: Load | null;
  onClose: () => void;
  onSaved?: () => void;
}

export function LoadEditModal({ load, onClose, onSaved }: LoadEditModalProps) {
  const { updateLoad, scopedDrivers, scopedTrucks } = useApp();

  const [status, setStatus] = useState<LoadStatus>(load?.status || 'booked');
  const [grossAmount, setGrossAmount] = useState<number>(load?.gross_amount || 0);
  const [driverId, setDriverId] = useState<string>(load?.driver_id || '');
  const [truckId, setTruckId] = useState<string>(load?.truck_id || '');
  const [brokerName, setBrokerName] = useState<string>(load?.broker_name || '');
  const [brokerPhone, setBrokerPhone] = useState<string>(load?.broker_phone || '');
  const [brokerNotes, setBrokerNotes] = useState<string>(load?.broker_notes || '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (load) {
      setStatus(load.status);
      setGrossAmount(load.gross_amount);
      setDriverId(load.driver_id || '');
      setTruckId(load.truck_id || '');
      setBrokerName(load.broker_name || '');
      setBrokerPhone(load.broker_phone || '');
      setBrokerNotes(load.broker_notes || '');
    }
  }, [load]);

  if (!load) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await updateLoad(load.id, {
        status,
        gross_amount: Number(grossAmount),
        driver_id: driverId || null,
        truck_id: truckId || null,
        broker_name: brokerName,
        broker_phone: brokerPhone,
        broker_notes: brokerNotes,
      });
      onSaved?.();
      onClose();
    } catch (err) {
      console.error('Failed to update load:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto bg-black/70 backdrop-blur-xs animate-in fade-in">
      <div className="relative w-full max-w-lg rounded-2xl border border-border bg-card p-5 sm:p-6 shadow-2xl space-y-4 my-8">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <h2 className="text-lg font-bold text-text-main">
            Edit Load {load.load_number}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg border border-border bg-card-subtle text-text-muted hover:text-text-main"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          {/* Status */}
          <div>
            <label className="block font-semibold text-text-main mb-1">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as LoadStatus)}
              className="tms-input"
            >
              <option value="booked">Booked</option>
              <option value="in_transit">In Transit</option>
              <option value="delivered">Delivered</option>
              <option value="invoiced">Invoiced</option>
              <option value="paid">Paid</option>
              <option value="canceled_by_broker">Canceled by Broker</option>
              <option value="canceled_by_carrier">Canceled by Carrier</option>
            </select>
          </div>

          {/* Gross Amount */}
          <div>
            <label className="block font-semibold text-text-main mb-1">Gross Rate ($)</label>
            <input
              type="number"
              step="0.01"
              value={grossAmount}
              onChange={(e) => setGrossAmount(parseFloat(e.target.value) || 0)}
              className="tms-input"
            />
          </div>

          {/* Driver & Equipment */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-text-main mb-1">Assigned Driver</label>
              <select
                value={driverId}
                onChange={(e) => setDriverId(e.target.value)}
                className="tms-input"
              >
                <option value="">Unassigned</option>
                {scopedDrivers.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-semibold text-text-main mb-1">Assigned Tractor</label>
              <select
                value={truckId}
                onChange={(e) => setTruckId(e.target.value)}
                className="tms-input"
              >
                <option value="">Unassigned</option>
                {scopedTrucks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.unit_number} ({t.trailer_type})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Broker */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-text-main mb-1">Broker Name</label>
              <input
                type="text"
                value={brokerName}
                onChange={(e) => setBrokerName(e.target.value)}
                className="tms-input"
              />
            </div>
            <div>
              <label className="block font-semibold text-text-main mb-1">Broker Phone</label>
              <input
                type="text"
                value={brokerPhone}
                onChange={(e) => setBrokerPhone(e.target.value)}
                className="tms-input"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block font-semibold text-text-main mb-1">Broker / Dispatch Notes</label>
            <textarea
              rows={3}
              value={brokerNotes}
              onChange={(e) => setBrokerNotes(e.target.value)}
              className="tms-input"
            />
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-border pt-3">
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary text-xs py-1.5 px-3"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="btn-primary text-xs py-1.5 px-4"
            >
              <Save className="h-3.5 w-3.5" />
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
