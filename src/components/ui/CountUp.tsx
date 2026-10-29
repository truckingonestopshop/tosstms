"use client";

import { useEffect, useRef, useState } from "react";

// A number that counts up to its value ("$13,450", "76%", "1,204"): the text around the number
// stays, commas and decimals follow the original. Runs once per change, ~0.9 s, eased; shows the
// final text right away when the person prefers less motion.

const NUM = /^([^\d-]*)(-?[\d,]*\.?\d+)([\s\S]*)$/;

function parse(text: string) {
  const m = NUM.exec(text);
  if (!m) return null;
  const raw = m[2];
  const value = Number(raw.replace(/,/g, ""));
  if (!Number.isFinite(value)) return null;
  const decimals = raw.includes(".") ? raw.split(".")[1].length : 0;
  return { prefix: m[1], value, decimals, commas: raw.includes(",") || Math.abs(value) >= 1000, suffix: m[3] };
}

function render(p: NonNullable<ReturnType<typeof parse>>, v: number) {
  const n = p.commas ? v.toLocaleString("en-US", { minimumFractionDigits: p.decimals, maximumFractionDigits: p.decimals }) : v.toFixed(p.decimals);
  return `${p.prefix}${n}${p.suffix}`;
}

export function CountUp({ value, className }: { value: React.ReactNode; className?: string }) {
  const text = typeof value === "number" ? String(value) : typeof value === "string" ? value : null;
  const target = text ? parse(text) : null;
  // Starts at zero (no flash of the final number), then counts up.
  const [shown, setShown] = useState<string | null>(() => (target && target.value !== 0 ? render(target, 0) : null));
  const from = useRef(0);
  const key = target ? `${target.prefix}|${target.value}|${target.suffix}` : null;

  useEffect(() => {
    if (!target || target.value === 0) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      from.current = target.value;
      return setShown(null);
    }
    const start = performance.now();
    const a = from.current;
    const b = target.value;
    const dur = 900;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / dur);
      const e = 1 - Math.pow(1 - t, 4);
      setShown(render(target, a + (b - a) * e));
      if (t < 1) raf = requestAnimationFrame(tick);
      else {
        from.current = b;
        setShown(null);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // Re-run only when the number itself changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (!target) return <span className={className}>{value}</span>;
  return <span className={className}>{shown ?? text}</span>;
}
