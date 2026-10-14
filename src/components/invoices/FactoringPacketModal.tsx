'use client';

import React, { useState } from 'react';
import { Load } from '@/types';
import {
  FileText,
  CheckCircle2,
  Download,
  X,
  FileCheck,
  Receipt,
  Truck,
  ShieldCheck,
  AlertCircle,
} from 'lucide-react';

interface FactoringPacketModalProps {
  load: Load | null;
  onClose: () => void;
}

export function FactoringPacketModal({ load, onClose }: FactoringPacketModalProps) {
  const [hasInvoice, setHasInvoice] = useState(true);
  const [hasRateCon, setHasRateCon] = useState(true);
  const [hasSignedPod, setHasSignedPod] = useState(true);
  const [hasLumper, setHasLumper] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [success, setSuccess] = useState(false);

  if (!load) return null;

  const handleGeneratePacket = () => {
    setIsGenerating(true);
    setTimeout(() => {
      setIsGenerating(false);
      setSuccess(true);
    }, 1200);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-xs animate-in fade-in">
      <div className="relative w-full max-w-lg rounded-2xl border border-border bg-card p-5 sm:p-6 shadow-2xl space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-brand-500/15 text-brand-500 flex items-center justify-center">
              <FileCheck className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-text-main">
                Export Factoring Packet
              </h2>
              <p className="text-xs text-text-muted">
                Pre-assembled submission bundle for Apex, RTS, Triumph, or WinFactor
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

        {/* Load Summary Pill */}
        <div className="p-3 rounded-xl bg-card-subtle border border-border text-xs flex items-center justify-between">
          <div>
            <div className="font-bold text-text-main">Load {load.load_number}</div>
            <div className="text-text-muted">
              {load.origin_city}, {load.origin_state} → {load.destination_city}, {load.destination_state}
            </div>
          </div>
          <div className="text-right">
            <div className="font-extrabold text-emerald-500 tabular-nums">
              ${load.gross_amount.toLocaleString()}
            </div>
            <div className="text-[10px] text-text-muted">Broker: {load.broker_name}</div>
          </div>
        </div>

        {/* Checklist */}
        <div className="space-y-2 text-xs">
          <span className="font-bold uppercase tracking-wider text-[10px] text-text-muted block">
            Included Factoring Documents
          </span>

          <label className="flex items-center justify-between p-2.5 rounded-lg border border-border bg-card hover:bg-card-subtle cursor-pointer transition-colors">
            <div className="flex items-center gap-2.5">
              <input
                type="checkbox"
                checked={hasInvoice}
                onChange={(e) => setHasInvoice(e.target.checked)}
                className="rounded border-border text-brand-500 focus:ring-brand-500"
              />
              <div>
                <span className="font-semibold text-text-main">Carrier Freight Invoice</span>
                <span className="block text-[10px] text-text-muted">Shows gross amount & billing details</span>
              </div>
            </div>
            <FileText className="h-4 w-4 text-emerald-500" />
          </label>

          <label className="flex items-center justify-between p-2.5 rounded-lg border border-border bg-card hover:bg-card-subtle cursor-pointer transition-colors">
            <div className="flex items-center gap-2.5">
              <input
                type="checkbox"
                checked={hasRateCon}
                onChange={(e) => setHasRateCon(e.target.checked)}
                className="rounded border-border text-brand-500 focus:ring-brand-500"
              />
              <div>
                <span className="font-semibold text-text-main">Broker Rate Confirmation</span>
                <span className="block text-[10px] text-text-muted">Ref: {load.rate_con_number || 'RC'}</span>
              </div>
            </div>
            <FileText className="h-4 w-4 text-emerald-500" />
          </label>

          <label className="flex items-center justify-between p-2.5 rounded-lg border border-border bg-card hover:bg-card-subtle cursor-pointer transition-colors">
            <div className="flex items-center gap-2.5">
              <input
                type="checkbox"
                checked={hasSignedPod}
                onChange={(e) => setHasSignedPod(e.target.checked)}
                className="rounded border-border text-brand-500 focus:ring-brand-500"
              />
              <div>
                <span className="font-semibold text-text-main">Signed Proof of Delivery (POD)</span>
                <span className="block text-[10px] text-text-muted">Receiver signature & timestamp</span>
              </div>
            </div>
            <FileCheck className="h-4 w-4 text-emerald-500" />
          </label>

          <label className="flex items-center justify-between p-2.5 rounded-lg border border-border bg-card hover:bg-card-subtle cursor-pointer transition-colors">
            <div className="flex items-center gap-2.5">
              <input
                type="checkbox"
                checked={hasLumper}
                onChange={(e) => setHasLumper(e.target.checked)}
                className="rounded border-border text-brand-500 focus:ring-brand-500"
              />
              <div>
                <span className="font-semibold text-text-main">Lumper & Accessorial Receipts</span>
                <span className="block text-[10px] text-text-muted">Optional reimbursement attachments</span>
              </div>
            </div>
            <Receipt className="h-4 w-4 text-text-muted" />
          </label>
        </div>

        {success ? (
          <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-500 text-xs font-semibold space-y-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" />
              <span>Factoring packet compiled successfully!</span>
            </div>
            <p className="text-[11px] text-text-muted">
              PDF ready for download: <span className="font-mono text-text-main">{load.load_number}_Factoring_Packet.pdf</span>
            </p>
          </div>
        ) : null}

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-border pt-3">
          <button
            type="button"
            onClick={onClose}
            className="btn-secondary text-xs py-1.5 px-3"
          >
            Close
          </button>
          <button
            type="button"
            onClick={handleGeneratePacket}
            disabled={isGenerating || (!hasInvoice && !hasRateCon && !hasSignedPod)}
            className="btn-primary text-xs py-1.5 px-4"
          >
            <Download className="h-3.5 w-3.5" />
            {isGenerating ? 'Compiling Packet...' : 'Download Factoring PDF'}
          </button>
        </div>
      </div>
    </div>
  );
}
