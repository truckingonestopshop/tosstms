'use client';

import React, { useState } from 'react';
import { useApp } from '@/lib/data/AppContext';
import { ChevronDown, Building2, Check, Plus } from 'lucide-react';

export function CarrierSwitcher() {
  const { companies, selectedCompanyId, setSelectedCompanyId, activeCompany } = useApp();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border bg-card hover:bg-card-subtle text-xs transition-colors"
      >
        <Building2 className="h-3.5 w-3.5 text-brand-500 shrink-0" />
        <div className="flex flex-col text-left">
          <span className="font-bold text-text-main truncate max-w-[140px] sm:max-w-[200px]">
            {activeCompany ? activeCompany.name : 'All Carriers (Master)'}
          </span>
          <span className="text-[10px] text-text-muted">
            {activeCompany ? `${activeCompany.mc_number || 'No MC'} • ${activeCompany.commission_percent}% Cut` : `${companies.length} Carriers Active`}
          </span>
        </div>
        <ChevronDown className="h-3.5 w-3.5 text-text-muted shrink-0 ml-1" />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute left-0 mt-1.5 w-64 rounded-xl border border-border bg-card p-1 shadow-xl z-50 animate-in fade-in zoom-in-95">
            <div className="px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-text-muted border-b border-border mb-1">
              Select Carrier Entity
            </div>

            <button
              onClick={() => {
                setSelectedCompanyId('all');
                setIsOpen(false);
              }}
              className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs transition-colors ${
                selectedCompanyId === 'all'
                  ? 'bg-brand-500/15 text-brand-500 font-bold'
                  : 'text-text-main hover:bg-card-subtle'
              }`}
            >
              <div className="flex items-center gap-2">
                <Building2 className="h-3.5 w-3.5" />
                <span>All Carriers (Owner View)</span>
              </div>
              {selectedCompanyId === 'all' && <Check className="h-3.5 w-3.5" />}
            </button>

            <div className="my-1 border-t border-border" />

            <div className="max-h-60 overflow-y-auto space-y-0.5">
              {companies.map((comp) => {
                const isSelected = selectedCompanyId === comp.id;
                return (
                  <button
                    key={comp.id}
                    onClick={() => {
                      setSelectedCompanyId(comp.id);
                      setIsOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs text-left transition-colors ${
                      isSelected
                        ? 'bg-brand-500/15 text-brand-500 font-bold'
                        : 'text-text-main hover:bg-card-subtle'
                    }`}
                  >
                    <div>
                      <div className="font-semibold truncate max-w-[170px]">{comp.name}</div>
                      <div className="text-[10px] text-text-muted">
                        {comp.mc_number} • {comp.commission_percent}% Cut
                      </div>
                    </div>
                    {isSelected && <Check className="h-3.5 w-3.5 shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
