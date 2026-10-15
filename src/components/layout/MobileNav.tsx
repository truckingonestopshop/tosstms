"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, FileText, LayoutGrid, Plus, Truck } from "lucide-react";
import { cn } from "@/lib/format";

const TABS = [
  { href: "/", label: "Home", icon: LayoutGrid, match: (p: string) => p === "/" },
  { href: "/loads", label: "Loads", icon: Truck, match: (p: string) => p.startsWith("/loads") && p !== "/loads/new" },
  { href: "/loads/new", label: "New load", icon: Plus, match: (p: string) => p === "/loads/new", primary: true },
  { href: "/invoices", label: "Invoices", icon: FileText, match: (p: string) => p.startsWith("/invoices") },
  { href: "/fleet", label: "Fleet", icon: Building2, match: (p: string) => p.startsWith("/fleet") },
];

/** Phone bottom bar. The center button books a new load. */
export function MobileNav() {
  const path = usePathname();
  return (
    <nav className="no-print pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/90 backdrop-blur-xl md:hidden">
      <div className="mx-auto grid h-[60px] max-w-lg grid-cols-5">
        {TABS.map((t) => {
          const on = t.match(path);
          if (t.primary) {
            return (
              <Link key={t.href} href={t.href} className="flex items-center justify-center" aria-label={t.label}>
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand text-brand-fg shadow-sm active:scale-95">
                  <Plus className="h-5 w-5" strokeWidth={2.5} />
                </span>
              </Link>
            );
          }
          return (
            <Link
              key={t.href}
              href={t.href}
              className={cn("flex flex-col items-center justify-center gap-1 text-[10px] font-medium", on ? "text-fg" : "text-fg-4")}
            >
              <t.icon className="h-5 w-5" strokeWidth={on ? 2.25 : 1.75} />
              {t.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
