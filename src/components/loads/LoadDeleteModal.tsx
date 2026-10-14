'use client';

import React, { useState } from 'react';
import { Load } from '@/types';
import { useApp } from '@/lib/data/AppContext';
import { AlertTriangle, Trash2, X } from 'lucide-react';

interface LoadDeleteModalProps {
  load: Load | null;
  onClose: () => void;
  onDeleted?: () => void;
}

export function LoadDeleteModal({ load, onClose, onDeleted }: LoadDeleteModalProps) {
  const { deleteLoad } = useApp();
  const [isDeleting, setIsDeleting] = useState(false);

  if (!load) return null;

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await deleteLoad(load.id);
      onDeleted?.();
      onClose();
    } catch (err) {
      console.error('Delete error:', err);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-xs animate-in fade-in">
      <div className="relative w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-2xl space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-red-500/10 text-red-500 flex items-center justify-center shrink-0">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-text-main">
              Delete Load {load.load_number}?
            </h3>
            <p className="text-xs text-text-muted mt-0.5">
              This will remove the load record from the board and calendar.
            </p>
          </div>
        </div>

        <div className="p-3 rounded-lg bg-card-subtle text-xs space-y-1">
          <div>
            <span className="text-text-muted">Lane: </span>
            <span className="font-semibold text-text-main">
              {load.origin_city}, {load.origin_state} → {load.destination_city}, {load.destination_state}
            </span>
          </div>
          <div>
            <span className="text-text-muted">Gross: </span>
            <span className="font-semibold text-emerald-500">${load.gross_amount.toLocaleString()}</span>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
          <button
            type="button"
            onClick={onClose}
            className="btn-secondary text-xs py-1.5 px-3"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={isDeleting}
            className="px-3 py-1.5 rounded-lg bg-red-600 text-white font-bold text-xs hover:bg-red-700 flex items-center gap-1.5"
          >
            <Trash2 className="h-3.5 w-3.5" />
            {isDeleting ? 'Deleting...' : 'Delete Permanently'}
          </button>
        </div>
      </div>
    </div>
  );
}
