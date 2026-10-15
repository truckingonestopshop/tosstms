"use client";

import { StoreProvider, useStore, type Me } from "@/lib/store";
import { ConfirmHost } from "@/components/ui/Confirm";
import { Toaster } from "@/components/ui/Toaster";
import { Header } from "./Header";
import { MobileNav } from "./MobileNav";
import { LogoMark } from "@/components/brand/Logo";

export function AppShell({ me, preview, children }: { me: Me; preview?: boolean; children: React.ReactNode }) {
  return (
    <StoreProvider me={me} preview={preview}>
      <div className="flex min-h-dvh flex-col">
        <Header />
        <main className="flex-1">
          <Gate>{children}</Gate>
        </main>
        <MobileNav />
      </div>
      <ConfirmHost />
      <Toaster />
    </StoreProvider>
  );
}

/** Pages render once the first data load is in, so nothing flashes "empty". */
function Gate({ children }: { children: React.ReactNode }) {
  const { ready } = useStore();
  if (!ready) {
    return (
      <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-4 text-fg-4">
        <LogoMark className="h-7 w-auto animate-pulse text-fg-3" />
        <span className="text-xs">Loading dispatch data…</span>
      </div>
    );
  }
  return <>{children}</>;
}
