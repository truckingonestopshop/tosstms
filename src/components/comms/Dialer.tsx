"use client";

import { useEffect, useMemo, useState } from "react";
import { Delete, MessageSquare, Phone, PhoneIncoming, PhoneMissed, PhoneOutgoing, Search, User } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { useStore } from "@/lib/store";
import { callNow, clock, type Comm } from "@/lib/comms";
import { e164, prettyPhone } from "@/lib/phone";
import { cn, fmtDateTime } from "@/lib/format";
import { MessageDialog } from "./MessageDialog";

// The dialer: type or tap any number (or find a carrier, contact or driver) and call or text it
// through Kixie. Kixie rings your Kixie app first, then dials the number.

const KEYS: [string, string][] = [
  ["1", ""],
  ["2", "ABC"],
  ["3", "DEF"],
  ["4", "GHI"],
  ["5", "JKL"],
  ["6", "MNO"],
  ["7", "PQRS"],
  ["8", "TUV"],
  ["9", "WXYZ"],
  ["*", ""],
  ["0", "+"],
  ["#", ""],
];

interface Hit {
  name: string;
  phone: string;
  sub: string;
  companyId: string | null;
}

export function Dialer({ open, onClose, recent, agent }: { open: boolean; onClose: () => void; recent: Comm[]; agent?: string | null }) {
  const { companies, drivers } = useStore();
  const [num, setNum] = useState("");
  const [busy, setBusy] = useState(false);
  const [texting, setTexting] = useState(false);

  useEffect(() => {
    if (open) setNum("");
  }, [open]);

  // every phone TOSS knows: carrier contacts and drivers
  const book = useMemo(() => {
    const out: Hit[] = [];
    for (const c of companies) {
      if (c.contact_phone) out.push({ name: c.contact_name || c.name, phone: c.contact_phone, sub: c.name, companyId: c.id });
      if (c.secondary_phone)
        out.push({ name: [c.secondary_first_name, c.secondary_last_name].filter(Boolean).join(" ") || c.name, phone: c.secondary_phone, sub: c.name, companyId: c.id });
    }
    for (const d of drivers) if (d.phone) out.push({ name: d.name, phone: d.phone, sub: `Driver · ${companies.find((c) => c.id === d.company_id)?.name ?? ""}`, companyId: d.company_id });
    return out;
  }, [companies, drivers]);

  const q = num.trim().toLowerCase();
  const digits = q.replace(/\D/g, "");
  const hits = q
    ? book.filter((h) => h.name.toLowerCase().includes(q) || h.sub.toLowerCase().includes(q) || (digits.length >= 3 && h.phone.replace(/\D/g, "").includes(digits))).slice(0, 6)
    : [];
  const target = e164(num);
  const match = target ? book.find((h) => e164(h.phone) === target) : undefined;

  const recentCalls = useMemo(() => recent.filter((c) => c.channel === "call").slice(0, 6), [recent]);

  const call = async (phone: string, name?: string | null) => {
    setBusy(true);
    const ok = await callNow(phone, name);
    setBusy(false);
    if (ok) onClose();
  };

  const press = (k: string) => setNum((n) => (n + k).slice(0, 24));

  return (
    <Modal open={open} onClose={onClose} title="Dialer" subtitle={agent ? `Calls ring your Kixie app first (${agent}), then dial the number.` : "Calls ring your Kixie app first, then dial the number."} size="sm">
      <div className="space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-4" />
          <Input
            autoFocus
            value={num}
            onChange={(e) => setNum(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && target && call(target, match?.name)}
            placeholder="Number or name"
            className="h-11 pl-9 text-base tracking-wide"
            inputMode="tel"
          />
        </div>

        {match ? (
          <div className="flex items-center gap-2 rounded-lg bg-surface-2/70 px-3 py-2 text-[13px]">
            <User className="h-4 w-4 text-fg-4" />
            <span className="font-semibold text-fg">{match.name}</span>
            <span className="truncate text-fg-3">· {match.sub}</span>
          </div>
        ) : (
          hits.length > 0 && (
            <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line">
              {hits.map((h, i) => (
                <li key={`${h.phone}-${i}`}>
                  <button type="button" onClick={() => setNum(prettyPhone(h.phone))} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-surface-2">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-semibold text-fg">{h.name}</div>
                      <div className="truncate text-[11px] text-fg-3">{h.sub}</div>
                    </div>
                    <span className="text-[12px] text-fg-2">{prettyPhone(h.phone)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )
        )}

        <div className="grid grid-cols-3 gap-2">
          {KEYS.map(([k, letters]) => (
            <button
              key={k}
              type="button"
              onClick={() => press(k)}
              className="flex h-14 flex-col items-center justify-center rounded-xl border border-line bg-surface-2/50 transition-colors hover:bg-surface-2 active:scale-[0.97]"
            >
              <span className="text-xl font-semibold text-fg">{k}</span>
              <span className="h-3 text-[9px] font-semibold tracking-[0.15em] text-fg-4">{letters}</span>
            </button>
          ))}
        </div>

        <div className="grid grid-cols-[1fr_auto_auto] gap-2">
          <Button variant="primary" size="lg" disabled={!target} loading={busy} onClick={() => target && call(target, match?.name)}>
            {!busy && <Phone className="h-4 w-4" />} Call {target ? prettyPhone(target) : ""}
          </Button>
          <Button variant="outline" size="lg" disabled={!target} onClick={() => setTexting(true)} aria-label="Text this number">
            <MessageSquare className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="lg" onClick={() => setNum((n) => n.slice(0, -1))} aria-label="Delete a digit">
            <Delete className="h-4 w-4" />
          </Button>
        </div>

        {recentCalls.length > 0 && (
          <div>
            <div className="mb-1 mt-2 text-[11px] font-semibold uppercase tracking-wider text-fg-4">Recent calls</div>
            <ul className="divide-y divide-line">
              {recentCalls.map((c) => {
                const missed = !!c.status && /miss|no.?answer|busy|fail|cancel/i.test(c.status);
                const Icon = missed ? PhoneMissed : c.direction === "inbound" ? PhoneIncoming : PhoneOutgoing;
                return (
                  <li key={c.id} className="flex items-center gap-2 py-1.5">
                    <Icon className={cn("h-3.5 w-3.5 shrink-0", missed ? "text-red-500" : "text-fg-4")} />
                    <button type="button" onClick={() => setNum(prettyPhone(c.contact))} className="min-w-0 flex-1 text-left">
                      <div className="truncate text-[13px] text-fg">{c.contact_name || prettyPhone(c.contact)}</div>
                      <div className="text-[11px] text-fg-4">
                        {fmtDateTime(c.occurred_at)}
                        {c.duration_sec ? ` · ${clock(c.duration_sec)}` : ""}
                      </div>
                    </button>
                    <Button size="icon-sm" variant="ghost" onClick={() => call(c.contact, c.contact_name)} aria-label="Call back">
                      <Phone className="h-3.5 w-3.5" />
                    </Button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
      <MessageDialog
        open={texting}
        onClose={() => setTexting(false)}
        defaults={{ channel: "sms", title: `Text ${match?.name || (target ? prettyPhone(target) : "")}`, recipients: target ? [{ name: match?.name, phone: target }] : [], companyId: match?.companyId }}
        onSent={onClose}
      />
    </Modal>
  );
}
