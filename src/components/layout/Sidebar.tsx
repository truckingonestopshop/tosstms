"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { LogoMark } from "@/components/brand/Logo";
import { cn } from "@/lib/format";
import { useStore } from "@/lib/store";
import { ACCOUNTING_SIDEBAR, SIDEBAR, canOpen } from "./nav";

function Items({ onPick }: { onPick?: () => void }) {
  const path = usePathname();
  const { me, memberById } = useStore();
  const self = memberById(me.id) ?? { role: me.role };
  // Sections this person can open (Users → access); empty groups drop out.
  const accounting = path.startsWith("/accounting");
  const groups = (accounting ? ACCOUNTING_SIDEBAR : SIDEBAR).map((g) => g.filter((n) => canOpen(self, n.key))).filter((g) => g.length);
  return (
    <nav className="flex flex-col gap-3 p-3">
      {accounting && <div className="px-2.5 pt-1 text-[10px] font-bold uppercase tracking-[0.14em] text-fg-4">TOSS Accounting</div>}
      {groups.map((group, i) => (
        <div key={i} className={cn("flex flex-col gap-0.5", i > 0 && "border-t border-line pt-3")}>
          {group.map((n) => {
            const on = n.match(path);
            return (
              <Link
                key={n.href}
                href={n.href}
                onClick={onPick}
                aria-current={on ? "page" : undefined}
                className={cn(
                  "relative flex items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-[13px] font-medium transition-colors",
                  on ? "bg-surface-2 text-fg" : "text-fg-3 hover:bg-surface-2/60 hover:text-fg",
                )}
              >
                {on && <span className="absolute inset-y-1.5 left-0 w-[3px] rounded-full bg-brand" />}
                <n.icon className="h-4 w-4 shrink-0" strokeWidth={on ? 2.25 : 1.75} />
                <span className="truncate">{n.label}</span>
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

/** The left menu on computers (under the top bar). */
export function Sidebar() {
  return (
    <aside className="no-print sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-56 shrink-0 overflow-y-auto border-r border-line bg-surface/40 lg:block">
      <Items />
    </aside>
  );
}

/** The same menu as a drawer on phones and tablets (opened from the top bar). */
export function SidebarDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  // Links close it themselves; Esc too.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  // Rendered on <body>: the top bar's blur would otherwise clip a fixed drawer to the bar.
  return createPortal(
    <div className="no-print fixed inset-0 z-[60] lg:hidden" role="dialog" aria-modal aria-label="Menu">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="animate-pop absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col overflow-y-auto border-r border-line bg-surface" style={{ paddingTop: "env(safe-area-inset-top)" }}>
        <div className="flex h-14 items-center justify-between border-b border-line px-4">
          <LogoMark className="h-[22px] w-auto text-fg" />
          <button onClick={onClose} className="rounded-lg p-2 text-fg-3 hover:bg-surface-2 hover:text-fg" aria-label="Close menu">
            <X className="h-4 w-4" />
          </button>
        </div>
        <Items onPick={onClose} />
      </div>
    </div>,
    document.body,
  );
}
