"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAppLeave } from "@/components/auth/AppSwitch";
import { useStore } from "@/lib/store";
import { canOpen } from "./nav";

// The app switcher in the top bar: CLOUD · LEAD HUNTER · ACCOUNTING. Accounting is part of TOSS Cloud
// (/accounting), so Cloud ↔ Accounting switches in place; Lead Hunter is its own site (signed-in
// hand-off with the brand curtain). Each shows only to people who can open it.

type App = "cloud" | "leads" | "accounting";
const EASE = "cubic-bezier(.22,.8,.2,1)";
const LABEL: Record<App, string> = { cloud: "Cloud", leads: "Lead Hunter", accounting: "Accounting" };
const TITLE: Record<App, string> = { cloud: "TOSS Cloud", leads: "TOSS Lead Hunter", accounting: "TOSS Accounting" };

export function AppSwitcher() {
  const path = usePathname();
  const router = useRouter();
  const { hasLeads, me, memberById } = useStore();
  const { go, curtain } = useAppLeave();
  const self = memberById(me.id) ?? { role: me.role };
  const current: App = path.startsWith("/accounting") ? "accounting" : "cloud";
  const apps: App[] = ["cloud", ...(hasLeads ? (["leads"] as App[]) : []), ...(canOpen(self, "accounting") ? (["accounting"] as App[]) : [])];
  const btns = useRef<Partial<Record<App, HTMLButtonElement | null>>>({});
  const [active, setActive] = useState<App>(current);
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null);
  // Follow the page (e.g. coming back with the browser's back button).
  const [seen, setSeen] = useState(current);
  if (seen !== current) {
    setSeen(current);
    setActive(current);
  }
  useLayoutEffect(() => {
    const b = btns.current[active];
    if (b) setPill({ left: b.offsetLeft, width: b.offsetWidth });
  }, [active, apps.length]);

  if (apps.length < 2) return null;
  return (
    <div role="tablist" aria-label="TOSS apps" className="relative flex rounded-full border border-line bg-surface-2/70 p-0.5">
      {pill && (
        <span
          aria-hidden
          className="absolute inset-y-0.5 rounded-full bg-surface shadow-sm ring-1 ring-line"
          style={{ left: pill.left, width: pill.width, transition: `left 420ms ${EASE}, width 420ms ${EASE}` }}
        />
      )}
      {apps.map((k) => (
        <button
          key={k}
          ref={(el) => {
            btns.current[k] = el;
          }}
          type="button"
          role="tab"
          aria-selected={k === active}
          title={k === current ? TITLE[k] : `Open ${TITLE[k]}`}
          onClick={() => {
            if (k === current) return;
            setActive(k);
            if (k === "leads") go("leads", "/go/leads");
            else router.push(k === "accounting" ? "/accounting" : "/dashboard");
          }}
          className={`relative z-10 whitespace-nowrap rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] transition-colors duration-300 ${k === active ? "text-fg" : "text-fg-4 hover:text-fg-2"}`}
        >
          {LABEL[k]}
        </button>
      ))}
      {curtain}
    </div>
  );
}
