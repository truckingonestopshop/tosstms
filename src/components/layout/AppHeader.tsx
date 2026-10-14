'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Logo } from '@/components/ui/Logo';
import { CarrierSwitcher } from '@/components/layout/CarrierSwitcher';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import {
  LayoutDashboard,
  Truck,
  FileSpreadsheet,
  BarChart3,
  Building,
  Plus,
} from 'lucide-react';

const NAV_ITEMS = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/loads', label: 'Loads', icon: Truck },
  { href: '/invoices', label: 'Invoices', icon: FileSpreadsheet },
  { href: '/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/company', label: 'Fleet & Company', icon: Building },
];

export function AppHeader() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-30 w-full border-b border-border bg-card/80 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-4">
          {/* Left: Logo & Carrier Switcher */}
          <div className="flex items-center gap-4 lg:gap-6">
            <Logo href="/" subtitle="TMS" />
            <CarrierSwitcher />
          </div>

          {/* Center: Desktop Nav Navigation */}
          <nav className="hidden md:flex items-center gap-1">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive =
                item.href === '/'
                  ? pathname === '/'
                  : pathname.startsWith(item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${
                    isActive
                      ? 'bg-brand-500/15 text-brand-600 dark:text-brand-500'
                      : 'text-text-muted hover:text-text-main hover:bg-card-subtle'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          {/* Right: Quick Action & Theme Toggle */}
          <div className="flex items-center gap-2">
            <Link
              href="/loads/new"
              className="btn-primary text-xs py-1.5 px-3 rounded-lg shadow-xs"
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Book Load</span>
            </Link>

            <ThemeToggle />
          </div>
        </div>
      </div>
    </header>
  );
}
