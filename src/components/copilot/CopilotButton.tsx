"use client";

import { Suspense, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { MessageSquareText } from "lucide-react";
import { CopilotPanel } from "./CopilotPanel";

/** "Copilot" in the top bar on every page (Ctrl+J). The panel slides in on the right and stays
 *  open while you move between pages, so it can open pages for you. */
export function CopilotButton() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "j") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-pressed={open}
        title="TOSS Copilot (Ctrl J)"
        className={
          "flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[13px] font-medium transition-colors " +
          (open ? "border-fg bg-fg text-bg" : "border-line bg-surface-2/60 text-fg-2 hover:border-line-strong hover:text-fg")
        }
      >
        <MessageSquareText className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Copilot</span>
      </button>
      {open &&
        createPortal(
          <div className="no-print fixed inset-y-0 right-0 z-[70] flex w-full max-w-[440px] flex-col border-l border-line bg-surface shadow-pop" style={{ paddingTop: "env(safe-area-inset-top)" }} role="dialog" aria-label="TOSS Copilot">
            <Suspense>
              <CopilotPanel onClose={() => setOpen(false)} />
            </Suspense>
          </div>,
          document.body,
        )}
    </>
  );
}
