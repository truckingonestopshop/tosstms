'use client';

import React from 'react';
import { useTheme } from '@/lib/context/ThemeContext';
import { Sun, Moon } from 'lucide-react';

export function ThemeToggle({ className = '' }: { className?: string }) {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      type="button"
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
      className={`relative inline-flex items-center justify-center p-2 rounded-lg border border-border bg-card text-text-muted hover:text-text-main transition-all ${className}`}
      title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} theme`}
    >
      {theme === 'dark' ? (
        <Sun className="h-4 w-4 text-brand-500 transition-transform hover:rotate-45" />
      ) : (
        <Moon className="h-4 w-4 text-text-main transition-transform hover:-rotate-12" />
      )}
    </button>
  );
}
