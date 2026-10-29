"use client";

import { Suspense, useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { CopilotPanel } from "./CopilotPanel";
import { Orb } from "./Orb";

/**
 * TOSS Copilot's orb, floating on every page (Ctrl+J). Drag it anywhere: it stays there (per
 * browser). Click it and the window opens beside it (full screen on phones); Expand makes it a
 * large centered window. The orb spins faster while Copilot works.
 */

const SIZE = 56;
const POS_KEY = "toss-copilot-pos";
const MARGIN = 12;

/** Distance from the right / bottom edges, so the orb keeps its corner when the window resizes. */
type Pos = { right: number; bottom: number };

function readPos(): Pos | null {
  try {
    const p = JSON.parse(localStorage.getItem(POS_KEY) || "null") as Pos | null;
    return p && Number.isFinite(p.right) && Number.isFinite(p.bottom) ? p : null;
  } catch {
    return null;
  }
}
const clamp = (p: Pos): Pos => ({
  right: Math.min(Math.max(p.right, MARGIN), window.innerWidth - SIZE - MARGIN),
  bottom: Math.min(Math.max(p.bottom, MARGIN), window.innerHeight - SIZE - MARGIN),
});
/** Default: bottom right, above the phone's bottom bar. */
const defaultPos = (): Pos => ({ right: window.innerWidth < 768 ? 16 : 24, bottom: window.innerWidth < 768 ? 84 : 24 });

const subscribe = (cb: () => void) => {
  window.addEventListener("resize", cb);
  return () => window.removeEventListener("resize", cb);
};
const viewKey = () => `${window.innerWidth}x${window.innerHeight}`;

export function CopilotButton() {
  const path = usePathname();
  // Re-renders on resize (and "" on the server: the orb lives in a portal on <body>).
  const view = useSyncExternalStore(subscribe, viewKey, () => "");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [large, setLarge] = useState(false);
  const [moved, setMoved] = useState<Pos | null>(null);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ x: number; y: number; start: Pos; moved: boolean } | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "j") {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape") setLarge(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    setLarge(false);
    setBusy(false);
  }, []);

  if (!view || path.startsWith("/accounting")) return null;
  const pos = clamp(moved ?? readPos() ?? defaultPos());

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    drag.current = { x: e.clientX, y: e.clientY, start: pos, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < 5) return;
    if (!d.moved) {
      d.moved = true;
      setDragging(true);
    }
    setMoved(clamp({ right: d.start.right - dx, bottom: d.start.bottom - dy }));
  };
  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (!d.moved) return setOpen((v) => !v);
    setDragging(false);
    try {
      localStorage.setItem(POS_KEY, JSON.stringify(pos));
    } catch {}
  };

  // The window opens on the side with room: above or below the orb, lined up with it.
  const onRight = pos.right + SIZE / 2 < window.innerWidth / 2;
  const onBottom = pos.bottom + SIZE / 2 < window.innerHeight / 2;
  const gap = 14;
  const room = onBottom ? window.innerHeight - (pos.bottom + SIZE + gap) - 16 : window.innerHeight - (window.innerHeight - pos.bottom) - gap - 16;
  const anchored: React.CSSProperties = large
    ? {}
    : {
        ...(onRight ? { right: pos.right } : { left: window.innerWidth - pos.right - SIZE }),
        ...(onBottom ? { bottom: pos.bottom + SIZE + gap } : { top: window.innerHeight - pos.bottom + gap }),
        height: Math.min(720, Math.max(360, room)),
        transformOrigin: `${onBottom ? "bottom" : "top"} ${onRight ? "right" : "left"}`,
      };

  return createPortal(
    <>
      {open && large && <div className="no-print fixed inset-0 z-[69] hidden bg-black/55 backdrop-blur-sm md:block" onClick={() => setLarge(false)} />}
      {open && (
        <div
          className={
            "copilot-window no-print animate-copilot fixed z-[70] flex flex-col overflow-hidden max-md:!inset-0 max-md:!h-auto max-md:!w-auto max-md:!rounded-none rounded-[28px] " +
            (large ? "inset-x-[max(24px,calc(50vw-440px))] inset-y-[6vh]" : "w-[440px]")
          }
          style={{ ...anchored, paddingTop: "env(safe-area-inset-top)" }}
          role="dialog"
          aria-label="TOSS Copilot"
        >
          <Suspense>
            <CopilotPanel onClose={close} onBusy={setBusy} large={large} onLarge={() => setLarge((v) => !v)} />
          </Suspense>
        </div>
      )}
      <button
        type="button"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), setOpen((v) => !v))}
        aria-pressed={open}
        aria-label={open ? "Close TOSS Copilot" : "Open TOSS Copilot (Ctrl J). Drag to move."}
        data-dragging={dragging}
        className={`orb-button no-print group fixed z-[71] touch-none select-none rounded-full outline-none ${dragging ? "cursor-grabbing" : "cursor-pointer"} ${open ? "max-md:hidden" : ""}`}
        style={{ right: pos.right, bottom: pos.bottom }}
      >
        <Orb size={SIZE} busy={open && busy} />
        {!dragging && (
          <span
            className={`pointer-events-none absolute top-1/2 hidden -translate-y-1/2 whitespace-nowrap rounded-full border border-white/10 bg-[#0d0d10]/90 px-3 py-1.5 text-xs font-semibold text-white opacity-0 shadow-pop backdrop-blur-xl transition-all duration-200 group-hover:opacity-100 md:block ${onRight ? "right-[calc(100%+12px)]" : "left-[calc(100%+12px)]"}`}
          >
            {open ? "Close" : "Ask Copilot"}
            <span className="ml-2 text-[10px] font-medium text-white/40">Ctrl J · drag to move</span>
          </span>
        )}
      </button>
    </>,
    document.body,
  );
}
