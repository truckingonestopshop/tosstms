import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Suspense } from 'react';
import { ThemeProvider } from '@/lib/context/ThemeContext';
import { AppProvider } from '@/lib/data/AppContext';
import { AppHeader } from '@/components/layout/AppHeader';
import { MobileNav } from '@/components/layout/MobileNav';

export const metadata: Metadata = {
  title: 'TOSS TMS — Trucking Management System',
  description: 'Internal freight dispatch, fleet tracking, and billing platform for Trucking One Stop Shop.',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#09090b',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className="dark">
      <body className="min-h-screen bg-page text-text-main flex flex-col font-sans antialiased pb-16 md:pb-0">
        <ThemeProvider>
          <AppProvider>
            <Suspense fallback={<div className="h-16 w-full border-b border-border bg-card/80" />}>
              <AppHeader />
            </Suspense>
            <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
              {children}
            </main>
            <Suspense fallback={null}>
              <MobileNav />
            </Suspense>
          </AppProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
