'use client';

import React, { useState, useEffect } from 'react';
import { useApp } from '@/lib/data/AppContext';
import { DriverModal } from '@/components/company/DriverModal';
import { TruckModal } from '@/components/company/TruckModal';
import { CompanyVaultManager } from '@/components/company/CompanyVaultManager';
import { LiveBrokerDeskModal } from '@/components/company/LiveBrokerDeskModal';
import { Driver, Truck } from '@/types';
import {
  Building,
  User,
  Truck as TruckIcon,
  ShieldCheck,
  Plus,
  Edit,
  Phone,
  Mail,
  AlertTriangle,
  CheckCircle2,
  Calendar,
} from 'lucide-react';

export default function FleetCompanyPage() {
  const {
    companies,
    activeCompany,
    scopedDrivers,
    scopedTrucks,
    updateCompany,
  } = useApp();

  const [activeTab, setActiveTab] = useState<'drivers' | 'equipment' | 'vault' | 'settings'>('drivers');

  // Modals
  const [driverModalOpen, setDriverModalOpen] = useState(false);
  const [editingDriver, setEditingDriver] = useState<Driver | null>(null);

  const [truckModalOpen, setTruckModalOpen] = useState(false);
  const [editingTruck, setEditingTruck] = useState<Truck | null>(null);

  const [isBrokerDeskOpen, setIsBrokerDeskOpen] = useState(false);
  const [currentTime, setCurrentTime] = useState<number | null>(null);

  useEffect(() => {
    setCurrentTime(Date.now());
  }, []);

  const targetComp = activeCompany || companies[0];

  // Expiration check helper
  const isExpiringSoon = (dateStr: string) => {
    if (!dateStr || !currentTime) return false;
    const diffDays = (new Date(dateStr).getTime() - currentTime) / (1000 * 3600 * 24);
    return diffDays > 0 && diffDays < 60;
  };

  const isExpired = (dateStr: string) => {
    if (!dateStr || !currentTime) return false;
    return new Date(dateStr).getTime() < currentTime;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Building className="h-5 w-5 text-brand-500" />
            <h1 className="text-2xl font-black tracking-tight text-text-main">
              Fleet & Carrier Management
            </h1>
          </div>
          <p className="text-xs text-text-muted mt-0.5">
            Manage company credentials, driver CDL compliance, and equipment rosters
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsBrokerDeskOpen(true)}
            className="btn-secondary text-xs py-2 px-3 shadow-xs"
          >
            <Building className="h-4 w-4 text-brand-500" />
            <span>Live Broker Desk</span>
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-1.5 border-b border-border pb-2 text-xs">
        {[
          { id: 'drivers', label: `Drivers (${scopedDrivers.length})`, icon: User },
          { id: 'equipment', label: `Equipment (${scopedTrucks.length})`, icon: TruckIcon },
          { id: 'vault', label: 'Compliance Vault', icon: ShieldCheck },
          { id: 'settings', label: 'Carrier Profile', icon: Building },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition-all ${
                isActive
                  ? 'bg-brand-500 text-zinc-950 font-bold'
                  : 'text-text-muted hover:text-text-main hover:bg-card-subtle'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* 1. Drivers Tab */}
      {activeTab === 'drivers' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-text-muted">
              Monitoring CDL and DOT Medical Card renewals
            </span>
            <button
              onClick={() => {
                setEditingDriver(null);
                setDriverModalOpen(true);
              }}
              className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1"
            >
              <Plus className="h-4 w-4" />
              <span>Add Driver</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            {scopedDrivers.map((driver) => {
              const cdlAlert = isExpiringSoon(driver.cdl_expiry) || isExpired(driver.cdl_expiry);
              const medAlert = isExpiringSoon(driver.medical_card_expiry) || isExpired(driver.medical_card_expiry);

              return (
                <div
                  key={driver.id}
                  className="tms-card p-4 flex flex-col justify-between space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-bold text-text-main text-sm">{driver.name}</h3>
                      <div className="text-text-muted flex items-center gap-3 mt-1">
                        <span className="flex items-center gap-1">
                          <Phone className="h-3 w-3" /> {driver.phone || 'No phone'}
                        </span>
                        {driver.email && (
                          <span className="flex items-center gap-1">
                            <Mail className="h-3 w-3" /> {driver.email}
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setEditingDriver(driver);
                        setDriverModalOpen(true);
                      }}
                      className="p-1.5 rounded hover:bg-card-subtle text-text-muted hover:text-text-main"
                    >
                      <Edit className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {/* Expiration Compliance */}
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border text-[11px]">
                    <div className="p-2 rounded-lg bg-card-subtle">
                      <span className="text-text-muted block text-[10px] uppercase font-bold">
                        CDL ({driver.cdl_number || 'N/A'})
                      </span>
                      <span
                        className={`font-semibold tabular-nums ${
                          cdlAlert ? 'text-amber-500 flex items-center gap-1' : 'text-text-main'
                        }`}
                      >
                        {cdlAlert && <AlertTriangle className="h-3 w-3 shrink-0" />}
                        Exp: {driver.cdl_expiry || 'Not set'}
                      </span>
                    </div>

                    <div className="p-2 rounded-lg bg-card-subtle">
                      <span className="text-text-muted block text-[10px] uppercase font-bold">
                        Medical Card
                      </span>
                      <span
                        className={`font-semibold tabular-nums ${
                          medAlert ? 'text-amber-500 flex items-center gap-1' : 'text-text-main'
                        }`}
                      >
                        {medAlert && <AlertTriangle className="h-3 w-3 shrink-0" />}
                        Exp: {driver.medical_card_expiry || 'Not set'}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 2. Equipment Tab */}
      {activeTab === 'equipment' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-text-muted">
              Live tractor and trailer availability roster
            </span>
            <button
              onClick={() => {
                setEditingTruck(null);
                setTruckModalOpen(true);
              }}
              className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1"
            >
              <Plus className="h-4 w-4" />
              <span>Add Equipment</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            {scopedTrucks.map((truck) => (
              <div
                key={truck.id}
                className="tms-card p-4 flex flex-col justify-between space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-black text-text-main text-sm">
                        {truck.unit_number}
                      </span>
                      <span className="px-2 py-0.5 rounded-full bg-brand-500/10 text-brand-500 font-bold text-[10px] border border-brand-500/20">
                        {truck.trailer_type}
                      </span>
                    </div>
                    <span className="text-text-muted text-[11px] mt-0.5 block">
                      Trailer: {truck.trailer_number || 'None'} • Plate: {truck.plate || 'N/A'}
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      setEditingTruck(truck);
                      setTruckModalOpen(true);
                    }}
                    className="p-1.5 rounded hover:bg-card-subtle text-text-muted hover:text-text-main"
                  >
                    <Edit className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border text-[11px]">
                  <div>
                    <span className="text-text-muted block text-[10px]">Current Location</span>
                    <span className="font-semibold text-text-main">
                      {truck.current_location || 'Not updated'}
                    </span>
                  </div>
                  <div>
                    <span className="text-text-muted block text-[10px]">Status / Availability</span>
                    <span className="font-semibold text-emerald-500">
                      {truck.empty_date || 'Ready Now'}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 3. Compliance Vault Tab */}
      {activeTab === 'vault' && <CompanyVaultManager />}

      {/* 4. Settings Tab */}
      {activeTab === 'settings' && targetComp && (
        <div className="tms-card p-5 max-w-2xl space-y-4 text-xs">
          <h3 className="text-sm font-bold uppercase tracking-wider text-text-main border-b border-border pb-2">
            Carrier Profile & Dispatch Agreement
          </h3>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-text-main mb-1">Company Name</label>
              <input
                type="text"
                value={targetComp.name}
                onChange={(e) => updateCompany(targetComp.id, { name: e.target.value })}
                className="tms-input font-bold"
              />
            </div>
            <div>
              <label className="block font-semibold text-text-main mb-1">Commission Cut (%)</label>
              <input
                type="number"
                step="0.1"
                value={targetComp.commission_percent}
                onChange={(e) =>
                  updateCompany(targetComp.id, { commission_percent: parseFloat(e.target.value) || 10 })
                }
                className="tms-input font-bold text-brand-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-text-main mb-1">MC Number</label>
              <input
                type="text"
                value={targetComp.mc_number}
                onChange={(e) => updateCompany(targetComp.id, { mc_number: e.target.value })}
                className="tms-input font-mono"
              />
            </div>
            <div>
              <label className="block font-semibold text-text-main mb-1">USDOT Number</label>
              <input
                type="text"
                value={targetComp.dot_number}
                onChange={(e) => updateCompany(targetComp.id, { dot_number: e.target.value })}
                className="tms-input font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-text-main mb-1">Contact Phone</label>
              <input
                type="text"
                value={targetComp.contact_phone}
                onChange={(e) => updateCompany(targetComp.id, { contact_phone: e.target.value })}
                className="tms-input"
              />
            </div>
            <div>
              <label className="block font-semibold text-text-main mb-1">Contact Email</label>
              <input
                type="email"
                value={targetComp.contact_email}
                onChange={(e) => updateCompany(targetComp.id, { contact_email: e.target.value })}
                className="tms-input"
              />
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      <DriverModal
        driver={editingDriver}
        isOpen={driverModalOpen}
        onClose={() => setDriverModalOpen(false)}
      />

      <TruckModal
        truck={editingTruck}
        isOpen={truckModalOpen}
        onClose={() => setTruckModalOpen(false)}
      />

      <LiveBrokerDeskModal
        isOpen={isBrokerDeskOpen}
        onClose={() => setIsBrokerDeskOpen(false)}
      />
    </div>
  );
}
