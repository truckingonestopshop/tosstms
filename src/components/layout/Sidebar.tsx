"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { LayoutGrid, Pin, PinOff, X } from "lucide-react";
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

const BUILT = process.env.NEXT_PUBLIC_BUILT_AT ? new Date(process.env.NEXT_PUBLIC_BUILT_AT) : null;

/** App version and when it was last updated. */
function VersionText() {
  const date = BUILT ? BUILT.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric", timeZone: "UTC" }) : null;
  return (
    <>
      v{process.env.NEXT_PUBLIC_APP_VERSION}
      {date && ` · Updated ${date}`}
    </>
  );
}

/** One line at the bottom of the phone menu. */
function VersionLine() {
  return (
    <div className="mt-auto truncate border-t border-line px-5 py-3 text-[11px] text-fg-4">
      <VersionText />
    </div>
  );
}

const PIN_KEY = "toss-menu-pinned";
const pinSubscribe = (cb: () => void) => {
  window.addEventListener("toss-menu-pin", cb);
  return () => window.removeEventListener("toss-menu-pin", cb);
};
const readPinned = () => {
  try {
    return localStorage.getItem(PIN_KEY) === "1";
  } catch {
    return false;
  }
};

/**
 * The left menu on computers: a slim icon rail. Hover it (or its "Menu" tab) and it opens over
 * the page; a soft light follows the cursor and the icons near it grow a little (like a dock).
 * Pin keeps it open beside the page.
 */
export function Sidebar() {
  const path = usePathname();
  const { me, memberById } = useStore();
  const self = memberById(me.id) ?? { role: me.role };
  const accounting = path.startsWith("/accounting");
  const groups = (accounting ? ACCOUNTING_SIDEBAR : SIDEBAR).map((g) => g.filter((n) => canOpen(self, n.key))).filter((g) => g.length);
  const pinned = useSyncExternalStore(pinSubscribe, readPinned, () => false);
  const [hover, setHover] = useState(false);
  const open = pinned || hover;
  const nav = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setPinned = (v: boolean) => {
    try {
      localStorage.setItem(PIN_KEY, v ? "1" : "0");
    } catch {}
    window.dispatchEvent(new Event("toss-menu-pin"));
  };
  // A short delay before closing, so moving the cursor to the page edge doesn't flicker it.
  const enter = () => {
    if (timer.current) clearTimeout(timer.current);
    setHover(true);
  };
  const leave = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setHover(false), 140);
    const el = nav.current;
    if (!el) return;
    el.style.setProperty("--spot-o", "0");
    el.querySelectorAll<HTMLElement>("[data-dock]").forEach((x) => (x.style.transform = ""));
  };
  // The light follows the cursor; icons within reach grow (closest the most).
  const move = (e: React.MouseEvent) => {
    const el = nav.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--spot-y", `${e.clientY - r.top + el.scrollTop}px`);
    el.style.setProperty("--spot-o", "1");
    el.querySelectorAll<HTMLElement>("[data-dock]").forEach((x) => {
      const b = x.getBoundingClientRect();
      const d = Math.abs(e.clientY - (b.top + b.height / 2));
      const s = 1 + Math.max(0, 1 - d / 84) * 0.16;
      x.style.transform = `scale(${s.toFixed(3)})`;
    });
  };

  let i = 0;
  return (
    <aside className={cn("no-print sticky top-14 z-30 hidden h-[calc(100dvh-3.5rem)] shrink-0 transition-[width] duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)] lg:block", pinned ? "w-[236px]" : "w-[72px]")}>
      <div
        onMouseEnter={enter}
        onMouseLeave={leave}
        onMouseMove={move}
        className={cn(
          "rail absolute inset-y-0 left-0 flex flex-col overflow-hidden border-r border-line transition-[width,box-shadow,background-color] duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)]",
          open ? "w-[236px]" : "w-[72px]",
          open && !pinned ? "bg-surface/95 shadow-[24px_0_60px_-20px_rgba(0,0,0,0.55)] backdrop-blur-xl" : "bg-surface/40",
        )}
        data-open={open}
      >
        <div ref={nav} className="rail-spot relative flex flex-1 flex-col gap-3 overflow-y-auto overflow-x-hidden px-3 py-3 [scrollbar-width:none]">
          {accounting && <div className={cn("whitespace-nowrap px-2 pt-1 text-[10px] font-bold uppercase tracking-[0.14em] text-fg-4 transition-opacity duration-200", open ? "opacity-100" : "opacity-0")}>TOSS Accounting</div>}
          {groups.map((group, gi) => (
            <div key={gi} className={cn("relative flex flex-col gap-1", gi > 0 && "border-t border-line pt-3")}>
              {group.map((n) => {
                const on = n.match(path);
                const k = i++;
                return (
                  <Link
                    key={n.href}
                    href={n.href}
                    aria-current={on ? "page" : undefined}
                    title={open ? undefined : n.label}
                    className={cn("group/item relative flex h-10 items-center gap-3 rounded-xl pr-2 transition-colors duration-200", on ? "text-fg" : "text-fg-3 hover:text-fg")}
                  >
                    {on && <span className="rail-active absolute inset-0 rounded-xl" aria-hidden />}
                    <span
                      data-dock
                      className={cn(
                        "relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-[transform,background-color,box-shadow] duration-150 ease-out",
                        on ? "bg-brand text-brand-fg shadow-[0_6px_18px_-6px_rgba(242,140,56,0.75)]" : "group-hover/item:bg-surface-2",
                      )}
                    >
                      <n.icon className="h-[18px] w-[18px]" strokeWidth={on ? 2.2 : 1.8} />
                    </span>
                    <span
                      className={cn("relative truncate whitespace-nowrap text-[13px] font-medium transition-[opacity,transform] duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)]", open ? "translate-x-0 opacity-100" : "-translate-x-2 opacity-0")}
                      style={{ transitionDelay: open ? `${60 + k * 18}ms` : "0ms" }}
                    >
                      {n.label}
                    </span>
                  </Link>
                );
              })}
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2 border-t border-line px-3 py-2.5">
          <button
            type="button"
            onClick={() => setPinned(!pinned)}
            aria-pressed={pinned}
            title={pinned ? "Unpin the menu" : "Keep the menu open"}
            className={cn("flex h-9 w-10 shrink-0 items-center justify-center rounded-xl transition-colors", pinned ? "bg-surface-2 text-brand" : "text-fg-4 hover:bg-surface-2 hover:text-fg")}
          >
            {pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
          </button>
          <div className={cn("min-w-0 truncate whitespace-nowrap text-[11px] text-fg-4 transition-opacity duration-300", open ? "opacity-100" : "opacity-0")}>
            <VersionText />
          </div>
        </div>
      </div>
      {/* "Menu" tab on the rail's edge (hidden once it's open). */}
      {!pinned && (
        <button
          type="button"
          onMouseEnter={enter}
          onMouseLeave={leave}
          onClick={() => setHover((v) => !v)}
          aria-label="Open the menu"
          className={cn("rail-tab absolute left-[71px] top-1/2 flex -translate-y-1/2 flex-col items-center gap-2 py-4 pl-1.5 pr-2 text-fg-3 transition-all duration-300 hover:text-fg", hover ? "pointer-events-none -translate-x-3 opacity-0" : "opacity-100")}
        >
          <LayoutGrid className="h-3.5 w-3.5" />
          <span className="text-[11px] font-semibold tracking-wide [writing-mode:vertical-rl]">Menu</span>
        </button>
      )}
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
        <VersionLine />
      </div>
    </div>,
    document.body,
  );
}
