'use client';

import React, { useState, useRef } from 'react';
import { ExtractedRateCon } from '@/types';
import { FileText, Upload, CheckCircle2, AlertCircle, Loader2, ClipboardPaste, Sparkles, X } from 'lucide-react';

interface RateConScannerProps {
  onExtracted: (data: ExtractedRateCon) => void;
  truckLocation?: string;
  className?: string;
}

export function RateConScanner({ onExtracted, truckLocation, className = '' }: RateConScannerProps) {
  const [activeTab, setActiveTab] = useState<'upload' | 'paste'>('upload');
  const [isScanning, setIsScanning] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [pastedText, setPastedText] = useState('');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [extractedSummary, setExtractedSummary] = useState<ExtractedRateCon | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processResponse = (result: any) => {
    if (result.success && result.data) {
      const d = result.data;
      setExtractedSummary(d);
      setStatusMessage(
        `Parsed ${d.broker_name || 'Rate Con'} (Load #${d.load_number || 'N/A'}) • $${d.gross_amount || 0} • ${d.stops?.length || 2} Stops`
      );
      onExtracted(d);
    } else {
      throw new Error(result.error || 'Failed to parse rate confirmation');
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setError(null);
    setIsScanning(true);
    setStatusMessage('Reading document with DeepSeek AI & Mapbox Routing...');

    try {
      const formData = new FormData();
      formData.append('file', file);
      if (truckLocation) {
        formData.append('truckLocation', truckLocation);
      }

      const res = await fetch('/api/ratecon/parse', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        throw new Error('Could not parse document. Please ensure PDF text is legible.');
      }

      const result = await res.json();
      processResponse(result);
    } catch (err: any) {
      setError(err.message || 'Error processing document');
      setStatusMessage(null);
    } finally {
      setIsScanning(false);
    }
  };

  const handleTextSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pastedText.trim() || pastedText.trim().length < 15) {
      setError('Please paste the broker rate confirmation email or text (at least 15 characters).');
      return;
    }

    setError(null);
    setIsScanning(true);
    setStatusMessage('DeepSeek analyzing broker rate confirmation & calculating Mapbox route...');

    try {
      const res = await fetch('/api/ratecon/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: pastedText,
          truckLocation: truckLocation || '',
          fileName: 'pasted_rate_confirmation.txt',
        }),
      });

      if (!res.ok) {
        throw new Error('Server error while parsing rate confirmation text.');
      }

      const result = await res.json();
      processResponse(result);
    } catch (err: any) {
      setError(err.message || 'Error parsing text');
      setStatusMessage(null);
    } finally {
      setIsScanning(false);
    }
  };

  return (
    <div className={`relative rounded-xl border border-border bg-card overflow-hidden shadow-sm ${className}`}>
      {/* Tab Switcher */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-card-subtle border-b border-border text-xs">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-full bg-brand-500/10 text-brand-500 flex items-center justify-center font-bold">
            <Sparkles className="h-3 w-3" />
          </div>
          <span className="font-semibold text-text-main">
            Rate Confirmation Document Scanner (DeepSeek AI + Mapbox)
          </span>
        </div>

        <div className="flex items-center bg-card rounded-lg p-0.5 border border-border">
          <button
            type="button"
            onClick={() => setActiveTab('upload')}
            className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
              activeTab === 'upload' ? 'bg-brand-500 text-white font-semibold' : 'text-text-muted hover:text-text-main'
            }`}
          >
            PDF / Image Upload
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('paste')}
            className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
              activeTab === 'paste' ? 'bg-brand-500 text-white font-semibold' : 'text-text-muted hover:text-text-main'
            }`}
          >
            Paste Text / Email
          </button>
        </div>
      </div>

      <div className="p-4">
        {activeTab === 'upload' ? (
          <div className="border border-dashed border-border rounded-lg p-5 text-center bg-card-subtle/40 hover:bg-card-subtle/80 transition-all">
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.png,.jpg,.jpeg"
              onChange={handleFileChange}
              className="hidden"
            />

            <div className="flex flex-col items-center justify-center space-y-2">
              <div className="w-10 h-10 rounded-full bg-brand-500/10 text-brand-500 flex items-center justify-center">
                {isScanning ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Upload className="h-5 w-5" />
                )}
              </div>

              <div>
                <h4 className="text-xs font-semibold text-text-main">
                  Upload Broker Rate Confirmation PDF
                </h4>
                <p className="text-[11px] text-text-muted mt-0.5">
                  DeepSeek extracts broker, stops, rates, deadhead & equipment instantly
                </p>
              </div>

              <button
                type="button"
                disabled={isScanning}
                onClick={() => fileInputRef.current?.click()}
                className="btn-primary text-xs py-1 px-3 mt-1"
              >
                {fileName ? 'Replace Document' : 'Choose PDF or Scan'}
              </button>

              {fileName && (
                <p className="text-[11px] font-mono text-text-muted mt-1">
                  File: {fileName}
                </p>
              )}
            </div>
          </div>
        ) : (
          <form onSubmit={handleTextSubmit} className="space-y-3">
            <div>
              <label className="block text-[11px] font-semibold text-text-main mb-1">
                Paste Rate Confirmation Email or Portal Text:
              </label>
              <textarea
                rows={4}
                value={pastedText}
                onChange={(e) => setPastedText(e.target.value)}
                placeholder="Paste the rate confirmation text from TQL, C.H. Robinson, Echo, Coyote, Landstar, Arrive, etc..."
                className="tms-input font-mono text-[11px] leading-relaxed w-full"
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-text-muted">
                Extracts line items, scheduled appointment windows, reference numbers, and stops.
              </span>
              <button
                type="submit"
                disabled={isScanning || !pastedText.trim()}
                className="btn-primary text-xs py-1 px-3"
              >
                {isScanning ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin" />
                    <span>Extracting...</span>
                  </>
                ) : (
                  <>
                    <ClipboardPaste className="h-3 w-3" />
                    <span>Scan with DeepSeek AI</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}

        {/* Status / Success Message */}
        {statusMessage && (
          <div className="mt-3 p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span className="font-medium">{statusMessage}</span>
            </div>
            {extractedSummary?.loaded_miles && (
              <span className="text-[11px] font-mono bg-emerald-500/20 px-2 py-0.5 rounded text-emerald-400">
                Mapbox: {extractedSummary.loaded_miles} mi
              </span>
            )}
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="mt-3 p-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500 text-xs flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>
    </div>
  );
}
