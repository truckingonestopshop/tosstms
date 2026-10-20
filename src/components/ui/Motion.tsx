"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/format";

const reduced = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** A number that counts to its value (and from the old value when it changes). */
export function CountUp({ value, format = (n) => String(Math.round(n)), duration = 700 }: { value: number; format?: (n: number) => string; duration?: number }) {
  const [shown, setShown] = useState(value);
  const from = useRef(0);
  useEffect(() => {
    if (reduced()) {
      from.current = value;
      setShown(value);
      return;
    }
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - k, 3);
      setShown(a + (value - a) * eased);
      if (k < 1) raf = requestAnimationFrame(tick);
      else from.current = value;
    };
    raf = requestAnimationFrame(tick);
    // Background tabs pause animation frames: land on the real number regardless.
    const done = setTimeout(() => {
      cancelAnimationFrame(raf);
      from.current = value;
      setShown(value);
    }, duration + 150);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(done);
      from.current = value;
    };
  }, [value, duration]);
  return <span className="tnum">{format(shown)}</span>;
}

/** Tabs with a highlight that slides to the selected one. */
export function MotionTabs<T extends string>({
  value,
  onChange,
  options,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: React.ReactNode; count?: number }[];
  className?: string;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ x: number; w: number } | null>(null);
  useLayoutEffect(() => {
    const measure = () => {
      const el = wrap.current?.querySelector<HTMLElement>(`[data-v="${CSS.escape(value)}"]`);
      if (el) setBox({ x: el.offsetLeft, w: el.offsetWidth });
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (wrap.current) ro.observe(wrap.current);
    return () => ro.disconnect();
  }, [value, options.length]);
  return (
    <div ref={wrap} role="tablist" className={cn("relative flex gap-1", className)}>
      {box && (
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 rounded-lg bg-inverse transition-[transform,width] duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)]"
          style={{ transform: `translateX(${box.x}px)`, width: box.w }}
        />
      )}
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            data-v={o.value}
            role="tab"
            aria-selected={on}
            onClick={() => onChange(o.value)}
            className={cn(
              "relative z-10 flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors duration-200",
              on ? "text-inverse-fg" : "text-fg-3 hover:text-fg",
            )}
          >
            {o.label}
            {o.count !== undefined && <span className={cn("tnum text-[11px] transition-opacity", on ? "opacity-70" : "text-fg-4")}>{o.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** Thin progress bar that eases to its value. */
export function Progress({ value, className, tone = "bg-emerald-500" }: { value: number; className?: string; tone?: string }) {
  const [w, setW] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setW(Math.max(0, Math.min(100, value))));
    return () => cancelAnimationFrame(id);
  }, [value]);
  return (
    <div className={cn("h-1.5 overflow-hidden rounded-full bg-surface-3", className)} role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}>
      <div className={cn("h-full rounded-full transition-[width] duration-700 ease-[cubic-bezier(0.2,0.8,0.2,1)]", tone)} style={{ width: `${w}%` }} />
    </div>
  );
}

/** A check mark that draws itself (success moments). */
export function DrawnCheck({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 52 52" className={cn("h-12 w-12", className)} aria-hidden>
      <circle cx="26" cy="26" r="23" fill="none" stroke="currentColor" strokeWidth="3" className="animate-draw opacity-30" style={{ ["--len" as string]: 150, ["--d" as string]: "0ms" }} />
      <path d="M15 27 l7 7 l15 -16" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" className="animate-draw" style={{ ["--len" as string]: 40, ["--d" as string]: "260ms" }} />
    </svg>
  );
}

/** Stagger delay for list items: style={stagger(i)}. Capped so long lists don't drag. */
export const stagger = (i: number, step = 28) => ({ ["--d" as string]: `${Math.min(i, 12) * step}ms` }) as React.CSSProperties;
