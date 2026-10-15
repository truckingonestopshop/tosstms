"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Building2, CornerDownLeft, FileText, Search, Truck, User, Package } from "lucide-react";
import { useStore } from "@/lib/store";
import { cn, fmtDay, lane, money, STATUS } from "@/lib/format";

interface Hit {
  id: string;
  kind: "load" | "company" | "truck" | "driver" | "invoice";
  title: string;
  sub: string;
  href: string;
  run?: () => void;
}

const ICONS = { load: Package, company: Building2, truck: Truck, driver: User, invoice: FileText };

/** Ctrl/Cmd+K: jump to any load, carrier, truck, driver or invoice. */
export function SearchPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { loads, companies, trucks, drivers, invoices, companyById, setScope } = useStore();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [i, setI] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onOpenChange]);

  useEffect(() => {
    if (open) {
      setQ("");
      setI(0);
      setTimeout(() => input.current?.focus(), 10);
    }
  }, [open]);

  const hits = useMemo<Hit[]>(() => {
    const s = q.trim().toLowerCase();
    const out: Hit[] = [];
    const has = (...v: (string | null | undefined)[]) => v.some((x) => x && x.toLowerCase().includes(s));
    if (!s) {
      return loads.slice(0, 6).map((l) => ({
        id: l.id,
        kind: "load" as const,
        title: `${l.load_number ? `#${l.load_number} · ` : ""}${lane(l)}`,
        sub: `${l.broker_name || "No broker"} · ${STATUS[l.status].label} · ${fmtDay(l.pickup_date)}`,
        href: `/loads/${l.id}`,
      }));
    }
    for (const l of loads) {
      if (has(l.load_number, l.rate_con_number, l.broker_name, l.origin_city, l.destination_city, l.broker_email, l.broker_phone))
        out.push({
          id: l.id,
          kind: "load",
          title: `${l.load_number ? `#${l.load_number} · ` : ""}${lane(l)}`,
          sub: `${l.broker_name || "No broker"} · ${money(l.gross_amount, { cents: false })} · ${STATUS[l.status].label}`,
          href: `/loads/${l.id}`,
        });
      if (out.length > 30) break;
    }
    for (const c of companies)
      if (has(c.name, c.mc_number, c.dot_number, c.contact_name))
        out.push({
          id: c.id,
          kind: "company",
          title: c.name,
          sub: [c.mc_number && `MC ${c.mc_number}`, c.dot_number && `DOT ${c.dot_number}`, `${c.commission_percent}%`].filter(Boolean).join(" · "),
          href: `/fleet?tab=profile`,
          run: () => setScope(c.id),
        });
    for (const t of trucks)
      if (has(t.unit_number, t.trailer_number, t.vin_number, t.plate))
        out.push({
          id: t.id,
          kind: "truck",
          title: `Unit ${t.unit_number}${t.trailer_number ? ` · Trailer ${t.trailer_number}` : ""}`,
          sub: `${companyById(t.company_id)?.name || ""}${t.trailer_type ? ` · ${t.trailer_type}` : ""}`,
          href: `/fleet?tab=trucks&truck=${t.id}`,
          run: () => setScope(t.company_id),
        });
    for (const d of drivers)
      if (has(d.name, d.phone, d.email, d.cdl_number))
        out.push({
          id: d.id,
          kind: "driver",
          title: d.name,
          sub: `${companyById(d.company_id)?.name || ""}${d.phone ? ` · ${d.phone}` : ""}`,
          href: `/fleet?tab=drivers&driver=${d.id}`,
          run: () => setScope(d.company_id),
        });
    for (const inv of invoices)
      if (has(inv.invoice_number, inv.bill_to_name))
        out.push({
          id: inv.id,
          kind: "invoice",
          title: inv.invoice_number,
          sub: `${inv.bill_to_name || ""} · ${money(inv.total_due, { currency: inv.currency })} · ${inv.status}`,
          href: `/invoices/${inv.id}`,
        });
    return out.slice(0, 40);
  }, [q, loads, companies, trucks, drivers, invoices, companyById, setScope]);

  const go = (h: Hit) => {
    h.run?.();
    onOpenChange(false);
    router.push(h.href);
  };

  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-start justify-center p-3 pt-[10vh]" onKeyDown={(e) => e.stopPropagation()}>
      <div className="animate-fade absolute inset-0 bg-overlay" onClick={() => onOpenChange(false)} />
      <div className="animate-pop relative w-full max-w-xl overflow-hidden rounded-2xl border border-line bg-surface shadow-pop">
        <div className="flex items-center gap-2.5 border-b border-line px-4">
          <Search className="h-4 w-4 text-fg-3" />
          <input
            ref={input}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setI(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setI((x) => Math.min(x + 1, hits.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setI((x) => Math.max(x - 1, 0));
              } else if (e.key === "Enter" && hits[i]) {
                go(hits[i]);
              } else if (e.key === "Escape") onOpenChange(false);
            }}
            placeholder="Load #, rate con, broker, city, carrier, unit, driver, invoice…"
            className="h-12 flex-1 bg-transparent text-[15px] text-fg placeholder:text-fg-4 focus:outline-none"
          />
          <kbd className="hidden rounded border border-line px-1.5 text-[10px] text-fg-4 sm:block">Esc</kbd>
        </div>
        <div className="max-h-[55vh] overflow-y-auto p-1.5">
          {!q && hits.length > 0 && <div className="px-2.5 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wider text-fg-4">Recent loads</div>}
          {hits.length === 0 && <div className="px-3 py-8 text-center text-sm text-fg-3">{q ? "Nothing found." : "No loads yet."}</div>}
          {hits.map((h, idx) => {
            const Icon = ICONS[h.kind];
            return (
              <button
                key={h.kind + h.id}
                onMouseEnter={() => setI(idx)}
                onClick={() => go(h)}
                className={cn("flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left", idx === i && "bg-surface-2")}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-line bg-surface text-fg-3">
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium text-fg">{h.title}</span>
                  <span className="block truncate text-xs text-fg-3">{h.sub}</span>
                </span>
                {idx === i && <CornerDownLeft className="h-3.5 w-3.5 text-fg-4" />}
              </button>
            );
          })}
        </div>
      </div>
    </div>,
    document.body,
  );
}
