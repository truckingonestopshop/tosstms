"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { LogoMark } from "@/components/brand/Logo";
import { ARRIVE_COOKIE } from "@/lib/appSwitch";

// Moving between TOSS Cloud and TOSS Lead Hunter. Leaving: a dark brand card fades in over
// the page and stays while the browser loads the other site. Arriving: that site starts
// with the same card and fades it out, so the two pages read as one motion.
// The same file lives in TOSS Lead Hunter (only the imports and header colors differ).

export type AppKey = "cloud" | "leads";
export const APP_NAME: Record<AppKey, string> = { cloud: "TOSS Cloud", leads: "TOSS Lead Hunter" };
const BADGE: Record<AppKey, string> = { cloud: "Cloud", leads: "Lead Hunter" };
const EASE = "cubic-bezier(.22,.8,.2,1)";
const still = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

function Card({ app, shown, loading }: { app: AppKey; shown: boolean; loading?: boolean }) {
  return (
    <div
      aria-live="polite"
      className="fixed inset-0 z-[300] flex items-center justify-center bg-[#0a0a0d]"
      style={{ opacity: shown ? 1 : 0, transition: `opacity 420ms ${EASE}`, pointerEvents: shown ? "auto" : "none" }}
    >
      <div
        className="flex flex-col items-center"
        style={{ transform: shown ? "none" : "translateY(8px) scale(.98)", transition: `transform 600ms ${EASE}` }}
      >
        <div className="flex items-center gap-3 text-white">
          <LogoMark className="h-10 w-auto" />
          <span className="rounded-md border border-white/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/80">
            {BADGE[app]}
          </span>
        </div>
        <div className="mt-6 h-px w-28 overflow-hidden bg-white/10">
          {loading && (
            <span className="block h-full w-full origin-left bg-[#f28c38]" style={{ animation: `toss-switch-bar 1.6s ${EASE} forwards` }} />
          )}
        </div>
        <span className="sr-only">Opening {APP_NAME[app]}</span>
        <style>{"@keyframes toss-switch-bar{from{transform:scaleX(0)}to{transform:scaleX(.92)}}"}</style>
      </div>
    </div>
  );
}

/** `go(app, href)` covers the page with the brand card, then opens `href`. Render `curtain`. */
export function useAppLeave() {
  const [to, setTo] = useState<AppKey | null>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    // Back button from the other site: this page comes back as it was left.
    const reset = (e: PageTransitionEvent) => {
      if (!e.persisted) return;
      setShown(false);
      setTo(null);
    };
    window.addEventListener("pageshow", reset);
    return () => window.removeEventListener("pageshow", reset);
  }, []);
  const go = (app: AppKey, href: string) => {
    if (to) return;
    setTo(app);
    window.setTimeout(() => setShown(true), 20);
    window.setTimeout(() => window.location.assign(href), still() ? 0 : 460);
  };
  const curtain = to ? createPortal(<Card app={to} shown={shown} loading />, document.body) : null;
  return { go, curtain, leaving: to };
}

/** First paint after arriving from the other app: the brand card, fading out. */
export function ArrivalCurtain({ app }: { app: AppKey }) {
  const [shown, setShown] = useState(true);
  const [gone, setGone] = useState(false);
  useEffect(() => {
    document.cookie = `${ARRIVE_COOKIE}=; Max-Age=0; path=/`;
    const t1 = window.setTimeout(() => setShown(false), still() ? 0 : 280);
    const t2 = window.setTimeout(() => setGone(true), 1000);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, []);
  return gone ? null : <Card app={app} shown={shown} />;
}

/** Cloud | Lead Hunter pill for the app header. The other app opens through `href`. */
export function HeaderAppSwitch({ current, href }: { current: AppKey; href: string }) {
  const [active, setActive] = useState<AppKey>(current);
  const { go, curtain } = useAppLeave();
  const btns = useRef<Partial<Record<AppKey, HTMLButtonElement | null>>>({});
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null);
  useLayoutEffect(() => {
    const b = btns.current[active];
    if (b) setPill({ left: b.offsetLeft, width: b.offsetWidth });
  }, [active]);
  const other: AppKey = current === "cloud" ? "leads" : "cloud";
  return (
    <div role="tablist" aria-label="TOSS apps" className="relative flex rounded-full border border-line bg-surface-2/70 p-0.5">
      {pill && (
        <span
          aria-hidden
          className="absolute inset-y-0.5 rounded-full bg-surface shadow-sm ring-1 ring-line"
          style={{ left: pill.left, width: pill.width, transition: `left 420ms ${EASE}, width 420ms ${EASE}` }}
        />
      )}
      {(["cloud", "leads"] as AppKey[]).map((k) => (
        <button
          key={k}
          ref={(el) => {
            btns.current[k] = el;
          }}
          type="button"
          role="tab"
          aria-selected={k === active}
          title={k === current ? APP_NAME[k] : `Open ${APP_NAME[k]}`}
          onClick={() => {
            if (k !== other) return;
            setActive(k);
            go(k, href);
          }}
          className={`relative z-10 whitespace-nowrap rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] transition-colors duration-300 ${
            k === active ? "text-fg" : "text-fg-4 hover:text-fg-2"
          }`}
        >
          {BADGE[k]}
        </button>
      ))}
      {curtain}
    </div>
  );
}
