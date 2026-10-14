'use client';

import React, { useState } from 'react';
import { useApp } from '@/lib/data/AppContext';
import { ShieldCheck, Upload, FileText, Download, CheckCircle2 } from 'lucide-react';

interface VaultItem {
  id: string;
  type: string;
  title: string;
  status: 'active' | 'missing' | 'expiring';
  fileName?: string;
  updatedAt?: string;
}

export function CompanyVaultManager() {
  const { activeCompany } = useApp();

  const [vaultItems, setVaultItems] = useState<VaultItem[]>([
    {
      id: 'v1',
      type: 'Authority',
      title: 'FMCSA Operating Authority Certificate',
      status: 'active',
      fileName: 'MC_Authority_Certificate.pdf',
      updatedAt: '2026-09-15',
    },
    {
      id: 'v2',
      type: 'COI',
      title: 'Certificate of Insurance ($1M Auto / $100K Cargo)',
      status: 'active',
      fileName: 'COI_Acord_2026.pdf',
      updatedAt: '2026-09-20',
    },
    {
      id: 'v3',
      type: 'W9',
      title: 'Form W-9 (Taxpayer ID & Certification)',
      status: 'active',
      fileName: 'Signed_W9_2026.pdf',
      updatedAt: '2026-09-01',
    },
    {
      id: 'v4',
      type: 'NOA',
      title: 'Notice of Assignment (Factoring Agreement)',
      status: 'active',
      fileName: 'NOA_Triumph_Factoring.pdf',
      updatedAt: '2026-09-10',
    },
  ]);

  return (
    <div className="tms-card p-5 space-y-4">
      <div className="flex items-center justify-between border-b border-border pb-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-brand-500" />
          <h3 className="text-sm font-bold uppercase tracking-wider text-text-main">
            Carrier Compliance & Document Vault
          </h3>
        </div>
        <button
          type="button"
          onClick={() => alert('Document upload modal')}
          className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5"
        >
          <Upload className="h-3.5 w-3.5" />
          <span>Upload Credential</span>
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
        {vaultItems.map((item) => (
          <div
            key={item.id}
            className="p-3.5 rounded-xl border border-border bg-card flex flex-col justify-between space-y-3"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0">
                  <FileText className="h-4 w-4" />
                </div>
                <div>
                  <h4 className="font-bold text-text-main">{item.title}</h4>
                  <span className="text-[10px] text-text-muted font-mono">
                    {item.fileName} • {item.updatedAt}
                  </span>
                </div>
              </div>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 uppercase tracking-wider">
                {item.status}
              </span>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
              <button
                type="button"
                onClick={() => alert(`Downloading ${item.fileName}`)}
                className="text-[11px] text-text-muted hover:text-text-main font-semibold flex items-center gap-1"
              >
                <Download className="h-3 w-3" /> Download
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
