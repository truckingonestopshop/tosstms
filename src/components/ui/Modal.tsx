"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/format";

let openCount = 0;

function useLockScroll(open: boolean) {
  useEffect(() => {
    if (!open) return;
    openCount++;
    document.body.style.overflow = "hidden";
    return () => {
      openCount--;
      if (openCount === 0) document.body.style.overflow = "";
    };
  }, [open]);
}

function useEscape(open: boolean, onClose: () => void) {
  const cb = useRef(onClose);
  cb.current = onClose;
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") cb.current();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open]);
}

const widths = { sm: "sm:max-w-md", md: "sm:max-w-xl", lg: "sm:max-w-3xl", xl: "sm:max-w-5xl", full: "sm:max-w-[min(1400px,96vw)]" };

/**
 * Centered dialog on desktop, bottom sheet on phones. Header and footer stay put,
 * the body scrolls.
 */
export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  size = "md",
  className,
  bodyClassName,
}: {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: keyof typeof widths;
  className?: string;
  bodyClassName?: string;
}) {
  useLockScroll(open);
  useEscape(open, onClose);
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true">
      <div className="animate-fade absolute inset-0 bg-overlay backdrop-blur-[2px]" onClick={onClose} />
      <div
        className={cn(
          "animate-sheet sm:animate-pop relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-line bg-surface shadow-pop sm:max-h-[88dvh] sm:rounded-2xl",
          widths[size],
          className,
        )}
      >
        {(title || subtitle) && (
          <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
            <div className="min-w-0">
              {title && <h2 className="truncate text-base font-semibold text-fg">{title}</h2>}
              {subtitle && <p className="mt-0.5 text-[13px] text-fg-3">{subtitle}</p>}
            </div>
            <button onClick={onClose} className="-mr-1.5 -mt-1 rounded-lg p-1.5 text-fg-3 hover:bg-surface-2 hover:text-fg" aria-label="Close">
              <X className="h-4.5 w-4.5" />
            </button>
          </div>
        )}
        <div className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4", bodyClassName)}>{children}</div>
        {footer && <div className="pb-safe flex items-center justify-end gap-2 border-t border-line bg-surface px-5 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

/** Right-side panel on desktop, full screen on phones. */
export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  actions,
  children,
  footer,
  width = "max-w-2xl",
}: {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: string;
}) {
  useLockScroll(open);
  useEscape(open, onClose);
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[55] flex justify-end" role="dialog" aria-modal="true">
      <div className="animate-fade absolute inset-0 bg-overlay" onClick={onClose} />
      <div className={cn("animate-drawer relative flex h-full w-full flex-col border-l border-line bg-surface shadow-pop", width)}>
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4" style={{ paddingTop: "max(1rem, env(safe-area-inset-top))" }}>
          <div className="min-w-0 flex-1">
            {title && <div className="text-base font-semibold text-fg">{title}</div>}
            {subtitle && <div className="mt-0.5 text-[13px] text-fg-3">{subtitle}</div>}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {actions}
            <button onClick={onClose} className="rounded-lg p-1.5 text-fg-3 hover:bg-surface-2 hover:text-fg" aria-label="Close">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
        {footer && <div className="pb-safe flex items-center gap-2 border-t border-line px-5 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
