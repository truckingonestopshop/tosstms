'use client';

import React, { useState } from 'react';
import { useApp } from '@/lib/data/AppContext';
import { Building, Copy, Check, X, Phone, Mail, ShieldCheck, Truck } from 'lucide-react';

interface LiveBrokerDeskModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function LiveBrokerDeskModal({ isOpen, onClose }: LiveBrokerDeskModalProps) {
  const { activeCompany, companies, scopedTrucks } = useApp();
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const targetComp = activeCompany || companies[0];
  if (!isOpen || !targetComp) return null;

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const fullPitch = `${targetComp.name} (MC# ${targetComp.mc_number} / DOT# ${targetComp.dot_number}). 
We have ${scopedTrucks.length} unit(s) available. Equipment: 53ft Dry Van / Reefer. Clean inspections, $1M Auto Liability / $100K Cargo.
Contact dispatch directly: ${targetComp.contact_phone} / ${targetComp.contact_email}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-xs overflow-y-auto animate-in fade-in">
      <div className="relative w-full max-w-lg rounded-2xl border border-border bg-card p-5 sm:p-6 shadow-2xl space-y-4 my-8">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-brand-500/15 text-brand-500 flex items-center justify-center">
              <Building className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-text-main">
                Live Broker Desk
              </h2>
              <p className="text-xs text-text-muted">
                Fast carrier credentials & dispatch copy-paste for load board calls
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg border border-border bg-card-subtle text-text-muted hover:text-text-main"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Credentials Grid */}
        <div className="space-y-2 text-xs">
          <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-card-subtle">
            <div>
              <span className="text-[10px] uppercase font-bold text-text-muted block">Legal Entity</span>
              <span className="font-bold text-text-main">{targetComp.name}</span>
            </div>
            <button
              onClick={() => copyToClipboard(targetComp.name, 'name')}
              className="p-1.5 rounded hover:bg-card text-text-muted hover:text-text-main"
            >
              {copiedKey === 'name' ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-card-subtle">
              <div>
                <span className="text-[10px] uppercase font-bold text-text-muted block">MC Number</span>
                <span className="font-mono font-bold text-text-main">{targetComp.mc_number}</span>
              </div>
              <button
                onClick={() => copyToClipboard(targetComp.mc_number, 'mc')}
                className="p-1.5 rounded hover:bg-card text-text-muted hover:text-text-main"
              >
                {copiedKey === 'mc' ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-card-subtle">
              <div>
                <span className="text-[10px] uppercase font-bold text-text-muted block">USDOT Number</span>
                <span className="font-mono font-bold text-text-main">{targetComp.dot_number}</span>
              </div>
              <button
                onClick={() => copyToClipboard(targetComp.dot_number, 'dot')}
                className="p-1.5 rounded hover:bg-card text-text-muted hover:text-text-main"
              >
                {copiedKey === 'dot' ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-card-subtle">
            <div>
              <span className="text-[10px] uppercase font-bold text-text-muted block">Dispatch Contacts</span>
              <span className="font-medium text-text-main">
                {targetComp.contact_phone} • {targetComp.contact_email}
              </span>
            </div>
            <button
              onClick={() => copyToClipboard(`${targetComp.contact_phone} • ${targetComp.contact_email}`, 'contact')}
              className="p-1.5 rounded hover:bg-card text-text-muted hover:text-text-main"
            >
              {copiedKey === 'contact' ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* Complete Pitch Box */}
        <div className="space-y-1.5 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted">
              Fast Broker Email / Chat Pitch
            </span>
            <button
              onClick={() => copyToClipboard(fullPitch, 'pitch')}
              className="text-xs text-brand-500 hover:underline flex items-center gap-1 font-semibold"
            >
              {copiedKey === 'pitch' ? (
                <>
                  <Check className="h-3.5 w-3.5" /> Copied!
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" /> Copy Pitch
                </>
              )}
            </button>
          </div>
          <div className="p-3 rounded-lg border border-border bg-card text-text-muted font-mono text-[11px] leading-relaxed select-all">
            {fullPitch}
          </div>
        </div>

        <div className="flex justify-end pt-2 border-t border-border">
          <button
            type="button"
            onClick={onClose}
            className="btn-primary text-xs py-1.5 px-4"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
