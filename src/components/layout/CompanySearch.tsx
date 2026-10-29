"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Check, Search, X } from "lucide-react";
import { useStore } from "@/lib/store";
import { useLiveTable } from "@/lib/live";
import { cn } from "@/lib/format";
import type { Company } from "@/lib/types";

// Company lookup next to the company switcher: by name, EIN, DOT, MC, representative (owner or second
// contact), opportunity # (OPP-1003 or 1003), email or phone.
// Numbers match however they're typed ("MC 1721527", "1721527", "(708) 555-0144").
// Enter / click selects the carrier (like the switcher); the arrow opens its page.

type Field = "name" | "opp" | "ein" | "dot" | "mc" | "phone" | "email" | "owner";
const FIELD_LABEL: Record<Field, string> = { name: "Name", opp: "Opportunity", ein: "EIN", dot: "DOT", mc: "MC", phone: "Phone", email: "Email", owner: "Rep" };
type Opp = { id: string; number: number; company_id: string; title: string };

const digits = (s: string | null | undefined) => (s || "").replace(/\D/g, "");

/** Owner and second contact. */
const reps = (c: Company) =>
  [[c.contact_first_name, c.contact_last_name].filter(Boolean).join(" ") || c.contact_name, [c.secondary_first_name, c.secondary_last_name].filter(Boolean).join(" ")].filter(Boolean) as string[];

/** Which field matched (best first) and, for an opportunity, which one; or null. */
function matchOf(c: Company, q: string, opps: Opp[]): { f: Field; opp?: Opp } | null {
  const t = q.trim().toLowerCase();
  if (!t) return null;
  const n = digits(t);
  // "mc 123" / "dot 123" / "ein 12…" / "opp 1003" point at one field.
  if (/^mc\b/.test(t) && n) return digits(c.mc_number).includes(n) ? { f: "mc" } : null;
  if (/^(us)?dot\b/.test(t) && n) return digits(c.dot_number).includes(n) ? { f: "dot" } : null;
  if (/^ein\b/.test(t) && n) return digits(c.ein).includes(n) ? { f: "ein" } : null;
  const own = opps.filter((o) => o.company_id === c.id);
  if (/^opp/.test(t) && n) {
    const o = own.find((x) => String(x.number).startsWith(n));
    return o ? { f: "opp", opp: o } : null;
  }
  if (c.name.toLowerCase().includes(t) || (c.dba_name || "").toLowerCase().includes(t)) return { f: "name" };
  if (n.length >= 3) {
    const o = n.length <= 6 ? own.find((x) => String(x.number) === n) : undefined;
    if (o) return { f: "opp", opp: o };
    if (digits(c.ein).includes(n)) return { f: "ein" };
    if (digits(c.dot_number).includes(n)) return { f: "dot" };
    if (digits(c.mc_number).includes(n)) return { f: "mc" };
    if ([c.contact_phone, c.secondary_phone].some((p) => digits(p).includes(n))) return { f: "phone" };
  }
  if ([c.contact_email, c.secondary_email].some((e) => (e || "").toLowerCase().includes(t))) return { f: "email" };
  if (reps(c).some((r) => r.toLowerCase().includes(t))) return { f: "owner" };
  const o = t.length >= 3 ? own.find((x) => x.title.toLowerCase().includes(t)) : undefined;
  if (o) return { f: "opp", opp: o };
  return null;
}

function valueOf(c: Company, f: Field, q: string, opp?: Opp) {
  const t = q.trim().toLowerCase();
  const n = digits(t);
  switch (f) {
    case "opp":
      return opp ? `OPP-${opp.number} · ${opp.title}` : "";
    case "ein":
      return c.ein || "";
    case "dot":
      return c.dot_number || "";
    case "mc":
      return c.mc_number || "";
    case "phone":
      return [c.contact_phone, c.secondary_phone].find((p) => n && digits(p).includes(n)) || c.contact_phone || "";
    case "email":
      return [c.contact_email, c.secondary_email].find((e) => (e || "").toLowerCase().includes(t)) || c.contact_email || "";
    case "owner":
      return reps(c).find((r) => r.toLowerCase().includes(t)) || reps(c)[0] || "";
    default:
      return [c.mc_number && `MC ${c.mc_number}`, c.dot_number && `DOT ${c.dot_number}`].filter(Boolean).join(" · ");
  }
}

export function CompanySearch() {
  const { companies, scope, setScope } = useStore();
  // Opportunity numbers and titles, for "OPP-1003" / "1003".
  const opps = useLiveTable<Opp>("tms_opportunities", { order: "number", ascending: true }).rows;
  const router = useRouter();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [i, setI] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  const results = useMemo(() => {
    if (!q.trim()) return [];
    const order: Field[] = ["opp", "name", "ein", "dot", "mc", "phone", "email", "owner"];
    return companies
      .map((c) => ({ c, m: matchOf(c, q, opps) }))
      .filter((x): x is { c: Company; m: { f: Field; opp?: Opp } } => !!x.m)
      .map(({ c, m }) => ({ c, f: m.f, opp: m.opp }))
      .sort((a, b) => order.indexOf(a.f) - order.indexOf(b.f) || a.c.name.localeCompare(b.c.name))
      .slice(0, 8);
  }, [companies, q, opps]);

  // "/" jumps into the search from anywhere (not while typing in another field).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey) return;
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName))) return;
      e.preventDefault();
      input.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Close when clicking elsewhere.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  /** Picks the carrier; an OPP # match opens that opportunity in Sales. */
  const pick = (c: Company, opp?: Opp) => {
    setScope(c.id);
    setQ("");
    setOpen(false);
    input.current?.blur();
    if (opp) router.push(`/sales?tab=opportunities&opp=${opp.id}`);
  };
  const openPage = (c: Company) => {
    setScope(c.id);
    setQ("");
    setOpen(false);
    router.push(`/fleet?company=${c.id}`);
  };

  const showList = open && q.trim().length > 0;

  return (
    <div ref={box} className="relative hidden md:block">
      <label
        className={cn(
          "group flex h-8 items-center gap-2 rounded-lg border border-line bg-surface-2/60 px-2.5 text-[13px] transition-[width,border-color] duration-300 focus-within:w-64 focus-within:border-line-strong",
          q ? "w-64" : "w-9 2xl:w-60",
        )}
        title="Find a company by EIN, DOT, MC, name, representative, opportunity #, email or phone (press /)"
      >
        <Search className="h-3.5 w-3.5 shrink-0 text-fg-3" />
        <input
          ref={input}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setI(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setI((x) => Math.min(results.length - 1, x + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setI((x) => Math.max(0, x - 1));
            } else if (e.key === "Enter" && results[i]) {
              e.preventDefault();
              if (e.ctrlKey || e.metaKey) openPage(results[i].c);
              else pick(results[i].c, results[i].opp);
            } else if (e.key === "Escape") {
              setQ("");
              setOpen(false);
              input.current?.blur();
            }
          }}
          placeholder="EIN, DOT, MC, name, rep, OPP #, email, phone…"
          aria-label="Find a carrier"
          className="min-w-0 flex-1 bg-transparent text-fg placeholder:text-fg-4 focus:outline-none"
        />
        {q && (
          <button type="button" onClick={() => setQ("")} className="rounded p-0.5 text-fg-4 hover:text-fg" aria-label="Clear">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </label>

      {showList && (
        <div className="animate-pop absolute left-0 top-10 z-50 w-[360px] overflow-hidden rounded-xl border border-line bg-surface p-1 shadow-pop">
          {results.length === 0 ? (
            <div className="px-3 py-3 text-[13px] text-fg-4">No company matches “{q.trim()}”.</div>
          ) : (
            results.map(({ c, f, opp }, k) => (
              <div
                key={c.id}
                onMouseEnter={() => setI(k)}
                className={cn("group/row flex items-center gap-2 rounded-lg px-2.5 py-2", k === i && "bg-surface-2")}
              >
                <button type="button" onClick={() => pick(c, opp)} className="min-w-0 flex-1 text-left">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-[13px] font-medium text-fg">{c.name}</span>
                    {c.status === "inactive" && <span className="text-[10px] uppercase text-fg-4">Inactive</span>}
                  </div>
                  <div className="truncate text-[11px] text-fg-4">
                    {f !== "name" && <span className="mr-1 font-semibold text-fg-3">{FIELD_LABEL[f]}</span>}
                    {valueOf(c, f, q, opp) || (reps(c)[0] ? `Rep ${reps(c)[0]}` : "")}
                  </div>
                </button>
                {scope === c.id && <Check className="h-3.5 w-3.5 shrink-0 text-fg" />}
                <button
                  type="button"
                  onClick={() => openPage(c)}
                  className="rounded-md p-1 text-fg-4 opacity-0 transition-opacity hover:bg-surface-3 hover:text-fg group-hover/row:opacity-100"
                  title="Open the carrier page"
                  aria-label={`Open ${c.name}`}
                >
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </button>
              </div>
            ))
          )}
          <div className="mt-1 border-t border-line px-2.5 pb-1 pt-2 text-[10.5px] text-fg-4">Enter selects · Ctrl+Enter opens the page · Esc closes</div>
        </div>
      )}
    </div>
  );
}
