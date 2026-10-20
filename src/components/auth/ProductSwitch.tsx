"use client";

import { useLayoutEffect, useRef, useState } from "react";

// The two TOSS products on one sign-in page: a pill switch on the photo panel. Switching
// slides the pill and swaps the headline in place; the form then signs in to the chosen
// product. The same component lives in TOSS Lead Hunter.

export interface Product {
  key: string;
  name: string;
  /** first headline word, in brand orange */
  lead: string;
  rest: string;
  about: string;
}

const EASE = "cubic-bezier(.22,.8,.2,1)";

export function ProductSwitch({
  products,
  active,
  onChange,
  logo,
}: {
  products: Product[];
  active: string;
  /** without it the pill is hidden (e.g. set-password) */
  onChange?: (key: string) => void;
  logo: React.ReactNode;
}) {
  const btns = useRef<Record<string, HTMLButtonElement | null>>({});
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    const measure = () => {
      const b = btns.current[active];
      if (b) setPill({ left: b.offsetLeft, width: b.offsetWidth });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [active]);

  return (
    <div className="relative flex w-full flex-col justify-between p-5 sm:p-8 lg:p-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {logo}
        {onChange && (
          <div role="tablist" aria-label="TOSS products" className="relative flex rounded-full border border-white/15 bg-black/45 p-1 backdrop-blur-md">
            {pill && (
              <span
                aria-hidden
                className="absolute inset-y-1 rounded-full bg-white shadow-[0_6px_20px_-6px_rgba(0,0,0,.6)]"
                style={{ left: pill.left, width: pill.width, transition: `left 520ms ${EASE}, width 520ms ${EASE}` }}
              />
            )}
            {products.map((p) => {
              const on = p.key === active;
              return (
                <button
                  key={p.key}
                  ref={(el) => {
                    btns.current[p.key] = el;
                  }}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  onClick={() => onChange(p.key)}
                  className={`relative z-10 whitespace-nowrap rounded-full px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] transition-colors duration-500 sm:px-3.5 sm:text-[11px] ${
                    on ? "text-[#0a0a0d]" : "text-white/70 hover:text-white"
                  }`}
                >
                  {p.name}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="mt-10 grid">
        {products.map((p) => {
          const on = p.key === active;
          return (
            <div
              key={p.key}
              aria-hidden={!on}
              className="[grid-area:1/1] self-end"
              style={{
                opacity: on ? 1 : 0,
                transform: on ? "none" : "translateY(10px)",
                filter: on ? "none" : "blur(6px)",
                transition: `opacity 480ms ${EASE}, transform 560ms ${EASE}, filter 480ms ${EASE}`,
                pointerEvents: on ? "auto" : "none",
              }}
            >
              <p className="text-3xl font-bold leading-[1.05] tracking-[-0.03em] text-white sm:text-4xl lg:text-5xl">
                <span className="text-[#f28c38]">{p.lead}</span> {p.rest}
              </p>
              <p className="mt-3 max-w-md text-sm leading-relaxed text-zinc-300">{p.about}</p>
            </div>
          );
        })}
        <p className="mt-5 hidden text-xs text-zinc-400 sm:block">TOSS · Trucking One Stop Shop</p>
      </div>
    </div>
  );
}
