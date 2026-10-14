'use client';

import React, { useState, useRef } from 'react';
import { ExtractedRateCon } from '@/types';
import { FileText, Upload, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';

interface RateConScannerProps {
  onExtracted: (data: ExtractedRateCon) => void;
  className?: string;
}

export function RateConScanner({ onExtracted, className = '' }: RateConScannerProps) {
  const [isScanning, setIsScanning] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setError(null);
    setIsScanning(true);
    setStatusMessage('Reading document and extracting fields...');

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/ratecon/parse', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        throw new Error('Could not parse document. Please check legibility.');
      }

      const result = await res.json();
      if (result.success && result.data) {
        setStatusMessage('Load details extracted successfully');
        onExtracted(result.data);
      } else {
        throw new Error(result.error || 'Extraction failed');
      }
    } catch (err: any) {
      setError(err.message || 'Error processing document');
      setStatusMessage(null);
    } finally {
      setIsScanning(false);
    }
  };

  return (
    <div
      className={`relative rounded-xl border border-dashed border-border p-5 text-center transition-all bg-card-subtle/50 hover:bg-card-subtle ${className}`}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.png,.jpg,.jpeg"
        onChange={handleFileChange}
        className="hidden"
      />

      <div className="flex flex-col items-center justify-center space-y-2">
        <div className="w-12 h-12 rounded-full bg-brand-500/10 text-brand-500 flex items-center justify-center">
          {isScanning ? (
            <Loader2 className="h-6 w-6 animate-spin" />
          ) : (
            <FileText className="h-6 w-6" />
          )}
        </div>

        <div>
          <h3 className="text-sm font-semibold text-text-main">
            Import Rate Confirmation
          </h3>
          <p className="text-xs text-text-muted mt-0.5">
            Drop your broker PDF or document to automatically pre-fill load details
          </p>
        </div>

        <button
          type="button"
          disabled={isScanning}
          onClick={() => fileInputRef.current?.click()}
          className="btn-primary text-xs py-1.5 px-3 mt-2"
        >
          <Upload className="h-3.5 w-3.5" />
          {fileName ? 'Choose Another File' : 'Select Rate Confirmation'}
        </button>

        {fileName && (
          <p className="text-xs font-mono text-text-muted mt-2">
            File: {fileName}
          </p>
        )}

        {statusMessage && (
          <div className="flex items-center gap-1.5 text-xs text-emerald-500 font-medium mt-1">
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span>{statusMessage}</span>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-1.5 text-xs text-red-500 font-medium mt-1">
            <AlertCircle className="h-3.5 w-3.5" />
            <span>{error}</span>
          </div>
        )}
      </div>
    </div>
  );
}
