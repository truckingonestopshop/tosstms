"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/format";

/**
 * Popover anchored to its trigger, rendered in a portal with fixed positioning so
 * it is never clipped by scrolling tables or cards. Flips up near the bottom edge.
 */
export function Popover({
  trigger,
  children,
  align = "start",
  width = 220,
  className,
  open: controlledOpen,
  onOpenChange,
}: {
  trigger: (props: { open: boolean; toggle: () => void; ref: React.Ref<HTMLButtonElement> }) => React.ReactNode;
  children: React.ReactNode | ((close: () => void) => React.ReactNode);
  align?: "start" | "end";
  width?: number;
  className?: string;
  open?: boolean;
  onOpenChange?: (o: boolean) => void;
}) {
  const [inner, setInner] = useState(false);
  const open = controlledOpen ?? inner;
  const setOpen = useCallback(
    (o: boolean) => {
      setInner(o);
      onOpenChange?.(o);
    },
    [onOpenChange],
  );
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number; maxH: number } | null>(null);

  const place = useCallback(() => {
    const r = btn.current?.getBoundingClientRect();
    if (!r) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const w = Math.min(width, vw - 16);
    let left = align === "end" ? r.right - w : r.left;
    left = Math.max(8, Math.min(left, vw - w - 8));
    const below = vh - r.bottom;
    if (below < 260 && r.top > below) setPos({ bottom: vh - r.top + 6, left, maxH: r.top - 16 });
    else setPos({ top: r.bottom + 6, left, maxH: below - 16 });
  }, [align, width]);

  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      const t = e.target as Node;
      if (pop.current?.contains(t) || btn.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onScroll = (e: Event) => {
      if (pop.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", place);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", place);
    };
  }, [open, place, setOpen]);

  const close = () => setOpen(false);

  return (
    <>
      {trigger({ open, toggle: () => setOpen(!open), ref: btn })}
      {open &&
        pos &&
        createPortal(
          <div
            ref={pop}
            style={{ top: pos.top, bottom: pos.bottom, left: pos.left, width: Math.min(width, window.innerWidth - 16), maxHeight: Math.max(160, pos.maxH) }}
            className={cn("animate-pop fixed z-[80] overflow-y-auto rounded-xl border border-line bg-surface p-1 shadow-pop", className)}
          >
            {typeof children === "function" ? children(close) : children}
          </div>,
          document.body,
        )}
    </>
  );
}

export function MenuItem({
  children,
  onClick,
  icon: Icon,
  active,
  danger,
  hint,
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  icon?: React.ComponentType<{ className?: string }>;
  active?: boolean;
  danger?: boolean;
  hint?: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors disabled:opacity-40",
        danger ? "text-red-600 hover:bg-red-500/10 dark:text-red-400" : "text-fg-2 hover:bg-surface-2 hover:text-fg",
        active && "bg-surface-2 font-semibold text-fg",
      )}
    >
      {Icon && <Icon className="h-4 w-4 shrink-0 opacity-70" />}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {hint && <span className="shrink-0 text-[11px] text-fg-4">{hint}</span>}
    </button>
  );
}

export const MenuLabel = ({ children }: { children: React.ReactNode }) => (
  <div className="px-2.5 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-fg-4">{children}</div>
);
export const MenuSep = () => <div className="my-1 h-px bg-line" />;
