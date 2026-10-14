'use client';

import React, { useState, useEffect } from 'react';
import { Driver } from '@/types';
import { useApp } from '@/lib/data/AppContext';
import { X, Save, User } from 'lucide-react';

interface DriverModalProps {
  driver: Driver | null;
  isOpen: boolean;
  onClose: () => void;
}

export function DriverModal({ driver, isOpen, onClose }: DriverModalProps) {
  const { addDriver, updateDriver, activeCompany, companies } = useApp();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [cdlNumber, setCdlNumber] = useState('');
  const [cdlExpiry, setCdlExpiry] = useState('');
  const [medicalCardExpiry, setMedicalCardExpiry] = useState('');
  const [notes, setNotes] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (driver) {
      setName(driver.name);
      setPhone(driver.phone);
      setEmail(driver.email || '');
      setCdlNumber(driver.cdl_number);
      setCdlExpiry(driver.cdl_expiry);
      setMedicalCardExpiry(driver.medical_card_expiry);
      setNotes(driver.notes || '');
      setCompanyId(driver.company_id);
    } else {
      setName('');
      setPhone('');
      setEmail('');
      setCdlNumber('');
      setCdlExpiry('');
      setMedicalCardExpiry('');
      setNotes('');
      setCompanyId(activeCompany?.id || companies[0]?.id || '');
    }
  }, [driver, isOpen, activeCompany, companies]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (driver) {
        await updateDriver(driver.id, {
          name,
          phone,
          email,
          cdl_number: cdlNumber,
          cdl_expiry: cdlExpiry,
          medical_card_expiry: medicalCardExpiry,
          notes,
          company_id: companyId,
        });
      } else {
        await addDriver({
          name,
          phone,
          email,
          cdl_number: cdlNumber,
          cdl_expiry: cdlExpiry,
          medical_card_expiry: medicalCardExpiry,
          notes,
          company_id: companyId,
        });
      }
      onClose();
    } catch (err) {
      console.error('Driver save error:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-xs overflow-y-auto animate-in fade-in">
      <div className="relative w-full max-w-md rounded-2xl border border-border bg-card p-5 sm:p-6 shadow-2xl space-y-4 my-8">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-brand-500" />
            <h2 className="text-base font-bold text-text-main">
              {driver ? 'Edit Driver' : 'Add New Driver'}
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
            <label className="block font-semibold text-text-main mb-1">Carrier Company</label>
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

          <div>
            <label className="block font-semibold text-text-main mb-1">Driver Full Name</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Marcus Vance"
              className="tms-input"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-text-main mb-1">Phone Number</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(555) 000-0000"
                className="tms-input"
              />
            </div>
            <div>
              <label className="block font-semibold text-text-main mb-1">Driver Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="driver@carrier.com"
                className="tms-input"
              />
            </div>
          </div>

          <div>
            <label className="block font-semibold text-text-main mb-1">CDL Number & State</label>
            <input
              type="text"
              value={cdlNumber}
              onChange={(e) => setCdlNumber(e.target.value)}
              placeholder="e.g. IL-19283741"
              className="tms-input"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-text-main mb-1">CDL Expiration</label>
              <input
                type="date"
                value={cdlExpiry}
                onChange={(e) => setCdlExpiry(e.target.value)}
                className="tms-input"
              />
            </div>
            <div>
              <label className="block font-semibold text-text-main mb-1">Medical Card Expiry</label>
              <input
                type="date"
                value={medicalCardExpiry}
                onChange={(e) => setMedicalCardExpiry(e.target.value)}
                className="tms-input"
              />
            </div>
          </div>

          <div>
            <label className="block font-semibold text-text-main mb-1">Internal Notes</label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Endorsements, preferred lanes, experience..."
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
              {saving ? 'Saving...' : driver ? 'Save Changes' : 'Create Driver'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
