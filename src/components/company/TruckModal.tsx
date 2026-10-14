'use client';

import React, { useState, useEffect } from 'react';
import { Truck } from '@/types';
import { useApp } from '@/lib/data/AppContext';
import { X, Save, Truck as TruckIcon } from 'lucide-react';

interface TruckModalProps {
  truck: Truck | null;
  isOpen: boolean;
  onClose: () => void;
}

export function TruckModal({ truck, isOpen, onClose }: TruckModalProps) {
  const { addTruck, updateTruck, scopedDrivers, activeCompany, companies } = useApp();

  const [unitNumber, setUnitNumber] = useState('');
  const [trailerNumber, setTrailerNumber] = useState('');
  const [trailerType, setTrailerType] = useState('53ft Dry Van');
  const [plate, setPlate] = useState('');
  const [vinNumber, setVinNumber] = useState('');
  const [maxWeight, setMaxWeight] = useState(45000);
  const [currentLocation, setCurrentLocation] = useState('');
  const [emptyDate, setEmptyDate] = useState('Ready Now');
  const [assignedDriverId, setAssignedDriverId] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (truck) {
      setUnitNumber(truck.unit_number);
      setTrailerNumber(truck.trailer_number || '');
      setTrailerType(truck.trailer_type || '53ft Dry Van');
      setPlate(truck.plate || '');
      setVinNumber(truck.vin_number || '');
      setMaxWeight(truck.max_weight || 45000);
      setCurrentLocation(truck.current_location || '');
      setEmptyDate(truck.empty_date || 'Ready Now');
      setAssignedDriverId(truck.assigned_driver_id || '');
      setCompanyId(truck.company_id);
    } else {
      setUnitNumber('');
      setTrailerNumber('');
      setTrailerType('53ft Dry Van');
      setPlate('');
      setVinNumber('');
      setMaxWeight(45000);
      setCurrentLocation('');
      setEmptyDate('Ready Now');
      setAssignedDriverId('');
      setCompanyId(activeCompany?.id || companies[0]?.id || '');
    }
  }, [truck, isOpen, activeCompany, companies]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (truck) {
        await updateTruck(truck.id, {
          unit_number: unitNumber,
          trailer_number: trailerNumber,
          trailer_type: trailerType,
          plate,
          vin_number: vinNumber,
          max_weight: Number(maxWeight),
          current_location: currentLocation,
          empty_date: emptyDate,
          assigned_driver_id: assignedDriverId || null,
          company_id: companyId,
        });
      } else {
        await addTruck({
          unit_number: unitNumber,
          trailer_number: trailerNumber,
          trailer_type: trailerType,
          plate,
          vin_number: vinNumber,
          max_weight: Number(maxWeight),
          current_location: currentLocation,
          empty_date: emptyDate,
          assigned_driver_id: assignedDriverId || null,
          company_id: companyId,
        });
      }
      onClose();
    } catch (err) {
      console.error('Truck save error:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-xs overflow-y-auto animate-in fade-in">
      <div className="relative w-full max-w-md rounded-2xl border border-border bg-card p-5 sm:p-6 shadow-2xl space-y-4 my-8">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <TruckIcon className="h-4 w-4 text-brand-500" />
            <h2 className="text-base font-bold text-text-main">
              {truck ? 'Edit Equipment Unit' : 'Add New Equipment'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg border border-border bg-card-subtle text-text-muted hover:text-text-main"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3 text-xs">
          <div>
            <label className="block font-semibold text-text-main mb-1">Carrier Entity</label>
            <select
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value)}
              className="tms-input"
              required
            >
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-text-main mb-1">Truck Unit #</label>
              <input
                type="text"
                required
                value={unitNumber}
                onChange={(e) => setUnitNumber(e.target.value)}
                placeholder="Unit 104"
                className="tms-input"
              />
            </div>
            <div>
              <label className="block font-semibold text-text-main mb-1">Trailer #</label>
              <input
                type="text"
                value={trailerNumber}
                onChange={(e) => setTrailerNumber(e.target.value)}
                placeholder="TR-5301"
                className="tms-input"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-text-main mb-1">Trailer Type</label>
              <select
                value={trailerType}
                onChange={(e) => setTrailerType(e.target.value)}
                className="tms-input"
              >
                <option value="53ft Dry Van">53ft Dry Van</option>
                <option value="53ft Utility Reefer">53ft Utility Reefer</option>
                <option value="48ft Flatbed">48ft Flatbed</option>
                <option value="Step Deck">Step Deck</option>
                <option value="Lowboy / RGN">Lowboy / RGN</option>
                <option value="Power Only">Power Only</option>
              </select>
            </div>
            <div>
              <label className="block font-semibold text-text-main mb-1">Max Weight (lbs)</label>
              <input
                type="number"
                value={maxWeight}
                onChange={(e) => setMaxWeight(parseInt(e.target.value, 10) || 45000)}
                className="tms-input"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-text-main mb-1">Plate Number</label>
              <input
                type="text"
                value={plate}
                onChange={(e) => setPlate(e.target.value)}
                placeholder="P-88192"
                className="tms-input"
              />
            </div>
            <div>
              <label className="block font-semibold text-text-main mb-1">VIN (optional)</label>
              <input
                type="text"
                value={vinNumber}
                onChange={(e) => setVinNumber(e.target.value)}
                placeholder="1FUJA..."
                className="tms-input"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-text-main mb-1">Current Location</label>
              <input
                type="text"
                value={currentLocation}
                onChange={(e) => setCurrentLocation(e.target.value)}
                placeholder="Chicago, IL"
                className="tms-input"
              />
            </div>
            <div>
              <label className="block font-semibold text-text-main mb-1">Empty / Status</label>
              <input
                type="text"
                value={emptyDate}
                onChange={(e) => setEmptyDate(e.target.value)}
                placeholder="Ready Now / Under Load"
                className="tms-input"
              />
            </div>
          </div>

          <div>
            <label className="block font-semibold text-text-main mb-1">Assigned Driver</label>
            <select
              value={assignedDriverId}
              onChange={(e) => setAssignedDriverId(e.target.value)}
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
              {saving ? 'Saving...' : truck ? 'Save Equipment' : 'Add Equipment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
