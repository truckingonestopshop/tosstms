"use client";

import { StoreProvider, useStore, type Me } from "@/lib/store";
import { ConfirmHost } from "@/components/ui/Confirm";
import { Toaster } from "@/components/ui/Toaster";
import { Header } from "./Header";
import { MobileNav } from "./MobileNav";
import { Sidebar } from "./Sidebar";
import { LogoMark } from "@/components/brand/Logo";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Lock } from "lucide-react";
import { SECTIONS, canOpen, sectionFor } from "./nav";

export function AppShell({ me, preview, children }: { me: Me; preview?: boolean; children: React.ReactNode }) {
  return (
    <StoreProvider me={me} preview={preview}>
      <div className="flex min-h-dvh flex-col">
        <Header />
        <div className="flex flex-1">
          <Sidebar />
          <main className="min-w-0 flex-1">
            <Gate>{children}</Gate>
          </main>
        </div>
        <MobileNav />
      </div>
      <ConfirmHost />
      <Toaster />
    </StoreProvider>
  );
}

/** Pages render once the first data load is in, so nothing flashes "empty". */
function Gate({ children }: { children: React.ReactNode }) {
  const { ready, me, memberById } = useStore();
  const path = usePathname();
  if (!ready) {
    return (
      <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-4 text-fg-4">
        <LogoMark className="h-7 w-auto animate-pulse text-fg-3" />
        <span className="text-xs">Loading dispatch data…</span>
      </div>
    );
  }
  // Sections someone wasn't given (Users → access).
  const self = memberById(me.id) ?? { role: me.role };
  const section = sectionFor(path);
  if (section && !canOpen(self, section.key)) {
    const first = SECTIONS.find((n) => canOpen(self, n.key));
    return (
      <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-3 px-6 text-center">
        <Lock className="h-6 w-6 text-fg-4" />
        <div className="text-[15px] font-semibold text-fg">No access to {section.label}</div>
        <p className="max-w-sm text-sm text-fg-3">An owner can give you access on Users.</p>
        {first && (
          <Link href={first.href} className="text-sm font-medium text-fg underline-offset-2 hover:underline">
            Go to {first.label}
          </Link>
        )}
      </div>
    );
  }
  return <>{children}</>;
}
