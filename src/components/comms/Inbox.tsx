"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Building2, Inbox as InboxIcon, Mail, MessageSquare, Phone, PhoneIncoming, PhoneMissed, PhoneOutgoing, Play, Search, Send, Voicemail } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Avatar, Card, Empty, Pill, Tabs, neutralPill } from "@/components/ui/Bits";
import { Input, Select, Textarea } from "@/components/ui/Field";
import { useLiveTable } from "@/lib/live";
import { useStore } from "@/lib/store";
import { errMsg, sb, signedUrl } from "@/lib/db";
import { toast } from "@/lib/toast";
import { callNow, clock, sendMessage, threadKey, type Comm } from "@/lib/comms";
import { prettyPhone } from "@/lib/phone";
import { cn, fmtDateTime } from "@/lib/format";
import { MessageDialog } from "./MessageDialog";

// The Inbox: every call and text through Kixie and every email through TOSS, one conversation
// per customer (their phone number or email). Calls show how long they were, the recording and
// the outcome the agent picked in Kixie. New incoming texts, missed calls and voicemails are unread.

type Filter = "all" | "unread" | "call" | "sms" | "email";

interface Thread {
  key: string;
  items: Comm[];
  last: Comm;
  unread: number;
  name: string;
  companyId: string | null;
  isPhone: boolean;
}

const isPhone = (contact: string) => contact.startsWith("+");

export function Inbox({ companyId }: { companyId?: string | null }) {
  const { companies, memberName, inScope } = useStore();
  const { rows, loaded, put } = useLiveTable<Comm>("tms_comms", { order: "occurred_at", ascending: false, ...(companyId ? { filter: { company_id: companyId } } : {}) });
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  const companyName = (id: string | null) => (id ? companies.find((c) => c.id === id)?.name ?? null : null);

  const threads = useMemo(() => {
    const by = new Map<string, Comm[]>();
    for (const r of rows) {
      if (!companyId && r.company_id && !inScope(r.company_id)) continue;
      const k = threadKey(r);
      (by.get(k) || by.set(k, []).get(k)!).push(r);
    }
    const out: Thread[] = [];
    for (const [key, items] of by) {
      items.sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
      const last = items[items.length - 1];
      const cid = [...items].reverse().find((x) => x.company_id)?.company_id ?? null;
      const person = [...items].reverse().find((x) => x.contact_name)?.contact_name;
      out.push({
        key,
        items,
        last,
        unread: items.filter((x) => x.direction === "inbound" && !x.read_at).length,
        name: person || companyName(cid) || (isPhone(key) ? prettyPhone(key) : key),
        companyId: cid,
        isPhone: isPhone(key),
      });
    }
    return out.sort((a, b) => b.last.occurred_at.localeCompare(a.last.occurred_at));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, companies, companyId]);

  const shown = threads.filter((t) => {
    if (filter === "unread" && !t.unread) return false;
    if ((filter === "call" || filter === "sms" || filter === "email") && !t.items.some((x) => x.channel === filter)) return false;
    if (!q.trim()) return true;
    const s = q.trim().toLowerCase();
    const digits = s.replace(/\D/g, "");
    return (
      t.name.toLowerCase().includes(s) ||
      (companyName(t.companyId) || "").toLowerCase().includes(s) ||
      (digits.length >= 3 && t.key.replace(/\D/g, "").includes(digits)) ||
      t.items.some((x) => (x.body || "").toLowerCase().includes(s) || (x.subject || "").toLowerCase().includes(s) || (x.disposition || "").toLowerCase().includes(s))
    );
  });

  const current = threads.find((t) => t.key === open) || null;
  const unreadTotal = threads.reduce((n, t) => n + t.unread, 0);

  // opening a conversation marks it read
  useEffect(() => {
    if (!current?.unread) return;
    const ids = current.items.filter((x) => x.direction === "inbound" && !x.read_at).map((x) => x.id);
    const at = new Date().toISOString();
    for (const x of current.items) if (ids.includes(x.id)) put({ ...x, read_at: at });
    sb().from("tms_comms").update({ read_at: at }).in("id", ids).then(({ error }) => error && toast.error(errMsg(error)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.key, current?.unread]);

  return (
    <div className="grid min-h-[calc(100dvh-220px)] gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
      <Card className={cn("flex min-h-0 flex-col overflow-hidden", current && "hidden lg:flex")}>
        <div className="space-y-2 border-b border-line p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-4" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, number, message, outcome" className="pl-9" />
          </div>
          <Tabs<Filter>
            value={filter}
            onChange={setFilter}
            tabs={[
              { value: "all", label: "All" },
              { value: "unread", label: "Unread", count: unreadTotal },
              { value: "call", label: "Calls" },
              { value: "sms", label: "Texts" },
              { value: "email", label: "Emails" },
            ]}
          />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {!loaded ? (
            <div className="p-6 text-center text-[13px] text-fg-3">Loading…</div>
          ) : !shown.length ? (
            <Empty icon={InboxIcon} title={threads.length ? "Nothing matches" : "No conversations yet"} body={threads.length ? undefined : "Calls and texts through Kixie and emails sent from TOSS show up here."} />
          ) : (
            shown.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setOpen(t.key)}
                className={cn("flex w-full items-start gap-3 border-b border-line/70 px-3 py-3 text-left transition-colors hover:bg-surface-2/70", open === t.key && "bg-surface-2")}
              >
                <Avatar name={t.name} className="h-9 w-9 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className={cn("truncate text-[13px]", t.unread ? "font-bold text-fg" : "font-semibold text-fg")}>{t.name}</span>
                    <span className="shrink-0 text-[11px] text-fg-4">{fmtDateTime(t.last.occurred_at)}</span>
                  </div>
                  {companyName(t.companyId) && companyName(t.companyId) !== t.name && <div className="truncate text-[11px] text-fg-3">{companyName(t.companyId)}</div>}
                  <div className="mt-0.5 flex items-center gap-1.5">
                    <ChannelIcon c={t.last} className="h-3.5 w-3.5 shrink-0 text-fg-4" />
                    <span className={cn("truncate text-[12px]", t.unread ? "text-fg" : "text-fg-3")}>{preview(t.last)}</span>
                    {t.unread > 0 && <span className="ml-auto shrink-0 rounded-full bg-brand px-1.5 text-[11px] font-bold text-brand-fg">{t.unread}</span>}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </Card>

      {current ? (
        <ThreadView key={current.key} t={current} companyName={companyName(current.companyId)} memberName={memberName} onBack={() => setOpen(null)} put={put} />
      ) : (
        <Card className="hidden items-center justify-center lg:flex">
          <Empty icon={MessageSquare} title="Pick a conversation" body="Call or text a carrier from their page, an invoice or TossSign, and it shows up here." />
        </Card>
      )}
    </div>
  );
}

function preview(c: Comm) {
  if (c.channel === "call") {
    const what = c.status === "voicemail" ? "Voicemail" : c.direction === "inbound" ? (missed(c) ? "Missed call" : "Incoming call") : "Outgoing call";
    return [what, c.duration_sec ? clock(c.duration_sec) : null, c.disposition].filter(Boolean).join(" · ");
  }
  if (c.channel === "email") return `${c.direction === "outbound" ? "You: " : ""}${c.subject || c.body || "Email"}`;
  return `${c.direction === "outbound" ? "You: " : ""}${c.body || ""}`;
}

const missed = (c: Comm) => c.channel === "call" && !!c.status && /miss|no.?answer|busy|fail|cancel/i.test(c.status);

function ChannelIcon({ c, className }: { c: Comm; className?: string }) {
  if (c.channel === "email") return <Mail className={className} />;
  if (c.channel === "sms") return <MessageSquare className={className} />;
  if (c.status === "voicemail") return <Voicemail className={className} />;
  if (missed(c)) return <PhoneMissed className={cn(className, "text-red-500")} />;
  return c.direction === "inbound" ? <PhoneIncoming className={className} /> : <PhoneOutgoing className={className} />;
}

function ThreadView({ t, companyName, memberName, onBack, put }: { t: Thread; companyName: string | null; memberName: (id: string | null) => string; onBack: () => void; put: (r: Comm) => void }) {
  const { companies } = useStore();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [calling, setCalling] = useState(false);
  const [emailing, setEmailing] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const company = companies.find((c) => c.id === t.companyId) || null;

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [t.items.length]);

  const reply = async () => {
    if (!text.trim()) return;
    setBusy(true);
    const ok = await sendMessage({ channel: "sms", to: t.key, name: t.name, body: text.trim(), companyId: t.companyId });
    setBusy(false);
    if (ok) setText("");
  };

  const link = async (companyId: string) => {
    const ids = t.items.map((x) => x.id);
    const { error } = await sb().from("tms_comms").update({ company_id: companyId || null }).in("id", ids);
    if (error) return toast.error(errMsg(error));
    for (const x of t.items) put({ ...x, company_id: companyId || null });
    toast.success(companyId ? "Linked to the carrier" : "Unlinked");
  };

  return (
    <Card className="flex min-h-0 flex-col overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 border-b border-line p-3">
        <button type="button" onClick={onBack} className="text-[13px] text-fg-3 hover:text-fg lg:hidden">
          ← Back
        </button>
        <Avatar name={t.name} className="h-9 w-9" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-bold text-fg">{t.name}</div>
          <div className="flex flex-wrap items-center gap-x-2 text-[12px] text-fg-3">
            <span>{t.isPhone ? prettyPhone(t.key) : t.key}</span>
            {company ? (
              <Link href={`/fleet?company=${company.id}`} className="inline-flex items-center gap-1 hover:text-fg hover:underline">
                <Building2 className="h-3 w-3" /> {companyName}
              </Link>
            ) : (
              <Select className="h-7 w-auto max-w-[220px] py-0 text-[12px]" value="" onChange={(e) => e.target.value && link(e.target.value)}>
                <option value="">Link to a carrier…</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {t.isPhone && (
            <Button
              size="sm"
              variant="primary"
              loading={calling}
              onClick={async () => {
                setCalling(true);
                await callNow(t.key, t.name);
                setCalling(false);
              }}
            >
              {!calling && <Phone className="h-3.5 w-3.5" />} Call
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => setEmailing(true)}>
            <Mail className="h-3.5 w-3.5" /> {t.isPhone ? "Email" : "Reply"}
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-surface-2/30 p-4">
        {t.items.map((c) => (
          <Item key={c.id} c={c} memberName={memberName} />
        ))}
        <div ref={end} />
      </div>

      {t.isPhone && (
        <div className="flex items-end gap-2 border-t border-line p-3">
          <Textarea
            rows={2}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                reply();
              }
            }}
            placeholder="Text from your Kixie number… (Enter sends, Shift+Enter new line)"
            className="min-h-[44px] flex-1"
          />
          <Button variant="primary" onClick={reply} loading={busy} disabled={!text.trim()}>
            {!busy && <Send className="h-4 w-4" />} Send
          </Button>
        </div>
      )}

      <MessageDialog
        open={emailing}
        onClose={() => setEmailing(false)}
        defaults={{
          channel: "email",
          title: t.isPhone ? `Email ${t.name}` : `Reply to ${t.name}`,
          recipients: [
            ...(t.isPhone ? [] : [{ name: t.name, email: t.key }]),
            ...(company?.contact_email ? [{ name: company.contact_name, email: company.contact_email, label: "Owner" }] : []),
            ...(company?.secondary_email ? [{ name: [company.secondary_first_name, company.secondary_last_name].filter(Boolean).join(" "), email: company.secondary_email }] : []),
          ],
          subject: !t.isPhone ? `Re: ${[...t.items].reverse().find((x) => x.subject)?.subject?.replace(/^re:\s*/i, "") || ""}` : "",
          companyId: t.companyId,
        }}
      />
    </Card>
  );
}

function Item({ c, memberName }: { c: Comm; memberName: (id: string | null) => string }) {
  const out = c.direction === "outbound";
  const who = out ? (c.member_id ? memberName(c.member_id) : c.agent_email || "TOSS") : null;

  if (c.channel === "call") return <CallCard c={c} who={who} />;

  if (c.channel === "email") {
    return (
      <div className={cn("flex", out ? "justify-end" : "justify-start")}>
        <div className={cn("max-w-[85%] rounded-xl border px-3.5 py-2.5 shadow-sm", out ? "border-brand/30 bg-brand/5" : "border-line bg-surface")}>
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-fg-4">
            <Mail className="h-3 w-3" /> {out ? "Email sent" : "Email received"}
          </div>
          {c.subject && <div className="mt-1 text-[13px] font-semibold text-fg">{c.subject}</div>}
          {c.body && <p className="mt-1 whitespace-pre-wrap break-words text-[13px] text-fg-2">{c.body}</p>}
          <Meta c={c} who={who} />
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex", out ? "justify-end" : "justify-start")}>
      <div className={cn("max-w-[80%] rounded-2xl px-3.5 py-2 shadow-sm", out ? "rounded-br-md bg-brand text-brand-fg" : "rounded-bl-md border border-line bg-surface text-fg")}>
        <p className="whitespace-pre-wrap break-words text-[13px]">{c.body}</p>
        <Meta c={c} who={who} light={out} />
      </div>
    </div>
  );
}

function Meta({ c, who, light }: { c: Comm; who: string | null; light?: boolean }) {
  return (
    <div className={cn("mt-1 flex flex-wrap items-center gap-x-1.5 text-[11px]", light ? "text-brand-fg/70" : "text-fg-4")}>
      <span>{fmtDateTime(c.occurred_at)}</span>
      {who && <span>· {who}</span>}
      {c.status === "failed" && <span className="font-semibold text-red-600">· not sent{c.error ? `: ${c.error}` : ""}</span>}
      {c.invoice_id && (
        <Link href={`/invoices/${c.invoice_id}`} className="underline">
          · invoice
        </Link>
      )}
      {c.sign_request_id && <span>· TossSign</span>}
    </div>
  );
}

function CallCard({ c, who }: { c: Comm; who: string | null }) {
  const [src, setSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const out = c.direction === "outbound";
  const title = c.status === "voicemail" ? "Voicemail" : missed(c) ? (out ? "No answer" : "Missed call") : out ? "Outgoing call" : "Incoming call";
  const hasRecording = !!(c.recording_path || c.recording_url);

  const play = async () => {
    setLoading(true);
    try {
      setSrc(c.recording_path ? await signedUrl(c.recording_path) : c.recording_url);
    } catch {
      setSrc(c.recording_url);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={cn("flex", out ? "justify-end" : "justify-start")}>
      <div className="w-full max-w-[420px] rounded-xl border border-line bg-surface px-3.5 py-3 shadow-sm">
        <div className="flex items-center gap-2">
          <span className={cn("flex h-8 w-8 items-center justify-center rounded-full", missed(c) ? "bg-red-500/10 text-red-600" : "bg-brand/10 text-fg")}>
            <ChannelIcon c={c} className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 text-[13px] font-semibold text-fg">
              {title}
              {out ? <ArrowUpRight className="h-3 w-3 text-fg-4" /> : <ArrowDownLeft className="h-3 w-3 text-fg-4" />}
            </div>
            <div className="text-[11px] text-fg-4">
              {fmtDateTime(c.occurred_at)}
              {c.duration_sec ? ` · ${clock(c.duration_sec)}` : ""}
              {who ? ` · ${who}` : ""}
            </div>
          </div>
        </div>
        {(c.disposition || c.outcome_note) && (
          <div className="mt-2.5 rounded-lg bg-surface-2/70 px-2.5 py-2">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-fg-4">Call outcome</div>
            {c.disposition && <Pill className={cn("mt-1", neutralPill)}>{c.disposition}</Pill>}
            {c.outcome_note && <p className="mt-1 whitespace-pre-wrap text-[12px] text-fg-2">{c.outcome_note}</p>}
          </div>
        )}
        {!c.disposition && c.status && /answer/i.test(c.status) && (
          <p className="mt-2 text-[11px] text-fg-4">Waiting for the call outcome from Kixie.</p>
        )}
        {hasRecording &&
          (src ? (
            // eslint-disable-next-line jsx-a11y/media-has-caption
            <audio controls autoPlay src={src} className="mt-2.5 h-9 w-full" />
          ) : (
            <Button size="xs" variant="outline" className="mt-2.5" onClick={play} loading={loading}>
              {!loading && <Play className="h-3 w-3" />} Play recording
            </Button>
          ))}
      </div>
    </div>
  );
}
