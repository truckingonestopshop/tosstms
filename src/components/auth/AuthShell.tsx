import React from 'react';
import Image from 'next/image';
import { LogoMark } from '@/components/ui/Logo';

export const authInput =
  'w-full rounded-lg border border-border bg-card px-3.5 py-2.5 text-base text-text-main placeholder:text-text-muted focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 sm:text-sm';
export const authLabel = 'block space-y-1.5 text-sm';
export const authLabelText = 'font-semibold text-text-main text-xs uppercase tracking-wider';
export const authButton =
  'w-full rounded-lg bg-brand-500 py-2.5 text-sm font-bold text-zinc-950 hover:bg-brand-600 disabled:opacity-50 transition-colors shadow-xs';

export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 p-2 sm:p-4 lg:p-8">
      <div className="grid min-h-[580px] w-full max-w-5xl overflow-hidden rounded-2xl border border-white/10 bg-zinc-900 shadow-2xl lg:grid-cols-[1.1fr_1fr]">
        {/* Left Side: Photo Panel */}
        <section className="relative flex min-h-[240px] flex-col justify-between overflow-hidden p-6 sm:p-10 lg:min-h-0">
          <Image
            src="/brand/login-hero.png"
            alt="Trucking One Stop Shop"
            fill
            priority
            sizes="(min-width: 1024px) 55vw, 100vw"
            className="object-cover object-[65%_center]"
          />
          <div
            aria-hidden
            className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-black/30"
          />

          <div className="relative z-10 flex w-full flex-col justify-between h-full">
            <div className="flex items-center gap-2">
              <LogoMark tone="dark" className="h-8 w-auto" />
              <span className="text-xs font-black tracking-widest uppercase px-2 py-0.5 rounded bg-brand-500 text-zinc-950">
                TMS
              </span>
            </div>

            <div className="mt-8">
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-white leading-tight tracking-tight">
                <span className="text-brand-500">Dispatch</span>, Fleet, & Revenue Operations.
              </h1>
              <p className="mt-3 max-w-sm text-xs sm:text-sm text-zinc-300 leading-relaxed">
                Internal freight operations platform for Trucking One Stop Shop: book loads, track drivers, scan rate confirmations, and invoice carriers in one system.
              </p>
              <p className="mt-5 text-[11px] font-semibold text-zinc-400">
                TOSS · Trucking One Stop Shop
              </p>
            </div>
          </div>
        </section>

        {/* Right Side: Auth Form */}
        <section className="flex flex-col justify-center px-6 py-10 sm:px-12 bg-zinc-900 text-white">
          <div className="mx-auto w-full max-w-sm">{children}</div>
          <p className="mt-8 text-center text-[11px] text-zinc-400">
            Internal team access only · truckingonestopshop.net
          </p>
        </section>
      </div>
    </div>
  );
}
