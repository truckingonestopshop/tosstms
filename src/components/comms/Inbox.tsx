"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Building2,
  Check,
  CheckCheck,
  CircleDot,
  Clock,
  FileText,
  Inbox as InboxIcon,
  Mail,
  MessageSquare,
  PenSquare,
  Phone,
  PhoneCall,
  PhoneIncoming,
  PhoneMissed,
  PhoneOutgoing,
  Play,
  RotateCcw,
  Search,
  Send,
  Star,
  StickyNote,
  Trash2,
  UserPlus,
  Voicemail,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Avatar, Card, Empty, Pill, Tabs, neutralPill } from "@/components/ui/Bits";
import { Input, Segmented, Select, Textarea } from "@/components/ui/Field";
import { Popover, MenuItem, MenuSep } from "@/components/ui/Menu";
import { useLiveTable } from "@/lib/live";
import { useStore } from "@/lib/store";
import { errMsg, sb, signedUrl } from "@/lib/db";
import { toast } from "@/lib/toast";
import { callNow, clock, sendMessage, threadKey, type Comm } from "@/lib/comms";
import { prettyPhone } from "@/lib/phone";
import { balance } from "@/lib/invoice";
import { cn, fmtDateTime, money } from "@/lib/format";
import type { Company, Invoice } from "@/lib/types";
import { MessageDialog } from "./MessageDialog";
import { Dialer } from "./Dialer";
import { NewContact } from "./NewContact";
import { PhoneActions } from "./ContactActions";

// The Inbox, like GoHighLevel's Conversations: every call and text through Kixie and every email
// sent from TOSS, one conversation per customer (their phone or email). Conversations are
// assigned, closed and reopened (a customer's reply reopens them) and starred. Calls show live
// (ringing, on the call), then their length, recording and the outcome picked in Kixie. The team
// leaves internal notes in the thread. Quick replies fill the composer.

type Filter = "all" | "unread" | "call" | "sms" | "email" | "starred";
type StatusFilter = "open" | "closed" | "all";

interface Conv {
  id: string;
  contact: string;
  company_id: string | null;
  assignee_id: string | null;
  status: "open" | "closed";
  starred: boolean;
  created_at: string;
  updated_at: string;
}

interface Snippet {
  id: string;
  title: string;
  body: string;
  created_by: string | null;
  created_at: string;
}

interface Thread {
  key: string;
  items: Comm[];
  last: Comm;
  unread: number;
  name: string;
  companyId: string | null;
  isPhone: boolean;
  conv: Conv | null;
}

const isPhone = (contact: string) => contact.startsWith("+");
const missed = (c: Comm) => c.channel === "call" && !!c.status && /miss|no.?answer|busy|fail|cancel/i.test(c.status);
/** ringing or on the call right now (Kixie hasn't said it ended; a stale one stops counting after 2 hours) */
const isLive = (c: Comm, now: number) => c.channel === "call" && !c.ended_at && (c.status === "ringing" || c.status === "answered") && now - new Date(c.occurred_at).getTime() < 2 * 3600_000;

/** The time, ticking every second (live-call timers, "sending" texts). */
function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

function useAgent() {
  const [agent, setAgent] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/kixie/setup")
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { kixieEmail?: string } | null) => j?.kixieEmail && setAgent(j.kixieEmail))
      .catch(() => null);
  }, []);
  return agent;
}

export function Inbox({ companyId }: { companyId?: string | null }) {
  const { me, companies, members, memberName, inScope } = useStore();
  const { rows, loaded, put } = useLiveTable<Comm>("tms_comms", { order: "occurred_at", ascending: false, ...(companyId ? { filter: { company_id: companyId } } : {}) });
  const convs = useLiveTable<Conv>("tms_conversations", { order: "created_at" });
  const snippets = useLiveTable<Snippet>("tms_snippets", { order: "title", ascending: true });
  const agent = useAgent();
  const [filter, setFilter] = useState<Filter>("all");
  const [status, setStatus] = useState<StatusFilter>("open");
  const [owner, setOwner] = useState<"all" | "mine" | "none">("all");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [dialer, setDialer] = useState(false);
  const [composeNew, setComposeNew] = useState(false);
  const [adding, setAdding] = useState(false);
  const now = useNow();

  const companyName = (id: string | null) => (id ? companies.find((c) => c.id === id)?.name ?? null : null);
  const convOf = useMemo(() => new Map(convs.rows.map((c) => [c.contact, c])), [convs.rows]);

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
      const real = items.filter((x) => x.channel !== "note");
      const last = real[real.length - 1] || items[items.length - 1];
      const conv = convOf.get(key) ?? null;
      const cid = conv?.company_id || [...items].reverse().find((x) => x.company_id)?.company_id || null;
      const person = [...items].reverse().find((x) => x.contact_name)?.contact_name;
      out.push({
        key,
        items,
        last,
        unread: items.filter((x) => x.direction === "inbound" && !x.read_at).length,
        name: person || companyName(cid) || (isPhone(key) ? prettyPhone(key) : key),
        companyId: cid,
        isPhone: isPhone(key),
        conv,
      });
    }
    return out.sort((a, b) => b.last.occurred_at.localeCompare(a.last.occurred_at));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, companies, companyId, convOf]);

  const live = rows.filter((c) => isLive(c, now));

  const shown = threads.filter((t) => {
    const st = t.conv?.status ?? "open";
    if (status !== "all" && st !== status) return false;
    if (owner === "mine" && t.conv?.assignee_id !== me.id) return false;
    if (owner === "none" && t.conv?.assignee_id) return false;
    if (filter === "unread" && !t.unread) return false;
    if (filter === "starred" && !t.conv?.starred) return false;
    if ((filter === "call" || filter === "sms" || filter === "email") && !t.items.some((x) => x.channel === filter)) return false;
    if (!q.trim()) return true;
    const s = q.trim().toLowerCase();
    const digits = s.replace(/\D/g, "");
    return (
      t.name.toLowerCase().includes(s) ||
      (companyName(t.companyId) || "").toLowerCase().includes(s) ||
      (digits.length >= 3 && t.key.replace(/\D/g, "").includes(digits)) ||
      t.key.toLowerCase().includes(s) ||
      t.items.some((x) => (x.body || "").toLowerCase().includes(s) || (x.subject || "").toLowerCase().includes(s) || (x.disposition || "").toLowerCase().includes(s))
    );
  });

  const current = threads.find((t) => t.key === open) || null;
  const unreadTotal = threads.reduce((n, t) => n + (t.conv?.status === "closed" ? 0 : t.unread), 0);

  // opening a conversation marks it read
  useEffect(() => {
    if (!current?.unread) return;
    const ids = current.items.filter((x) => x.direction === "inbound" && !x.read_at).map((x) => x.id);
    const at = new Date().toISOString();
    for (const x of current.items) if (ids.includes(x.id)) put({ ...x, read_at: at });
    sb().from("tms_comms").update({ read_at: at }).in("id", ids).then(({ error }) => error && toast.error(errMsg(error)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.key, current?.unread]);

  /** Saves conversation settings (assignee, status, star), making the row when there's none yet. */
  const setConv = async (t: Thread, patch: Partial<Conv>) => {
    const row = { contact: t.key, company_id: t.companyId, ...patch };
    const { data, error } = await sb().from("tms_conversations").upsert(row, { onConflict: "contact" }).select().single();
    if (error) {
      toast.error(errMsg(error));
      return;
    }
    convs.put(data as Conv);
  };

  return (
    <div className="space-y-3">
      {live.length > 0 && (
        <div className="space-y-2">
          {live.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setOpen(c.contact)}
              className="flex w-full items-center gap-3 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-2.5 text-left"
            >
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
              </span>
              <PhoneCall className="h-4 w-4 text-emerald-600" />
              <span className="text-[13px] font-semibold text-fg">
                {c.status === "ringing" ? (c.direction === "inbound" ? "Incoming call" : "Calling") : "On a call"} · {c.contact_name || companyName(c.company_id) || prettyPhone(c.contact)}
              </span>
              <span className="text-[12px] text-fg-3">
                {prettyPhone(c.contact)}
                {c.member_id ? ` · ${memberName(c.member_id)}` : c.agent_email ? ` · ${c.agent_email}` : ""}
              </span>
              <span className="tnum ml-auto text-[13px] font-semibold text-emerald-700 dark:text-emerald-300">{clock((now - new Date(c.occurred_at).getTime()) / 1000)}</span>
            </button>
          ))}
        </div>
      )}

      <div className="grid min-h-[calc(100dvh-240px)] gap-4 lg:grid-cols-[340px_minmax(0,1fr)] 2xl:grid-cols-[340px_minmax(0,1fr)_300px]">
        {/* conversations */}
        <Card className={cn("flex min-h-0 flex-col overflow-hidden", current && "hidden lg:flex")}>
          <div className="space-y-2 border-b border-line p-3">
            <div className="flex gap-2">
              <Button variant="primary" size="sm" className="flex-1" onClick={() => setDialer(true)}>
                <Phone className="h-3.5 w-3.5" /> Dialer
              </Button>
              <Button variant="outline" size="sm" className="flex-1" onClick={() => setComposeNew(true)}>
                <PenSquare className="h-3.5 w-3.5" /> New message
              </Button>
              <Button variant="outline" size="icon-sm" onClick={() => setAdding(true)} aria-label="Add contact" title="Add contact">
                <UserPlus className="h-4 w-4" />
              </Button>
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-4" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, number, message, outcome" className="pl-9" />
            </div>
            <div className="flex items-center gap-2">
              <Segmented<StatusFilter>
                size="sm"
                value={status}
                onChange={setStatus}
                options={[
                  { value: "open", label: "Open" },
                  { value: "closed", label: "Closed" },
                  { value: "all", label: "All" },
                ]}
              />
              <Select className="h-8 flex-1 py-0 text-[12px]" value={owner} onChange={(e) => setOwner(e.target.value as typeof owner)}>
                <option value="all">Everyone</option>
                <option value="mine">Assigned to me</option>
                <option value="none">Unassigned</option>
              </Select>
            </div>
            <Tabs<Filter>
              value={filter}
              onChange={setFilter}
              tabs={[
                { value: "all", label: "All" },
                { value: "unread", label: "Unread", count: unreadTotal },
                { value: "starred", label: <Star className="h-3.5 w-3.5" /> },
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
              <Empty icon={InboxIcon} title={threads.length ? "Nothing here" : "No conversations yet"} body={threads.length ? "Try another filter." : "Calls and texts through Kixie and emails sent from TOSS show up here."} />
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
                      <span className={cn("flex min-w-0 items-center gap-1 truncate text-[13px] text-fg", t.unread ? "font-bold" : "font-semibold")}>
                        {t.conv?.starred && <Star className="h-3 w-3 shrink-0 fill-amber-400 text-amber-400" />}
                        <span className="truncate">{t.name}</span>
                      </span>
                      <span className="shrink-0 text-[11px] text-fg-4">{fmtDateTime(t.last.occurred_at)}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[11px] text-fg-3">
                      {companyName(t.companyId) && companyName(t.companyId) !== t.name && <span className="truncate">{companyName(t.companyId)}</span>}
                      {t.conv?.assignee_id && <span className="truncate">· {memberName(t.conv.assignee_id)}</span>}
                    </div>
                    <div className="mt-0.5 flex items-center gap-1.5">
                      {t.items.some((c) => isLive(c, now)) ? <PhoneCall className="h-3.5 w-3.5 shrink-0 text-emerald-600" /> : <ChannelIcon c={t.last} className="h-3.5 w-3.5 shrink-0 text-fg-4" />}
                      <span className={cn("truncate text-[12px]", t.unread ? "text-fg" : "text-fg-3")}>{preview(t.last, now)}</span>
                      {t.unread > 0 && <span className="ml-auto shrink-0 rounded-full bg-brand px-1.5 text-[11px] font-bold text-brand-fg">{t.unread}</span>}
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </Card>

        {current ? (
          <ThreadView
            key={current.key}
            t={current}
            companyName={companyName(current.companyId)}
            onBack={() => setOpen(null)}
            put={put}
            setConv={(p) => setConv(current, p)}
            members={members.map((m) => ({ id: m.user_id, name: m.full_name || m.email }))}
            snippets={snippets.rows}
            agent={agent}
            onAddContact={() => setAdding(true)}
          />
        ) : (
          <Card className="hidden items-center justify-center lg:flex">
            <Empty
              icon={MessageSquare}
              title="Pick a conversation"
              body="Or start one: open the dialer to call any number, or send a new text or email."
              action={
                <Button variant="primary" onClick={() => setDialer(true)}>
                  <Phone className="h-4 w-4" /> Open dialer
                </Button>
              }
            />
          </Card>
        )}

        {current && <ContactPanel t={current} />}
      </div>

      <Dialer open={dialer} onClose={() => setDialer(false)} recent={rows} agent={agent} />
      <MessageDialog
        open={composeNew}
        onClose={() => setComposeNew(false)}
        defaults={{ channel: "sms", title: "New message", recipients: [] }}
      />
      <NewContact
        open={adding}
        onClose={() => setAdding(false)}
        phone={current?.isPhone ? current.key : null}
        email={current && !current.isPhone ? current.key : null}
        name={current && !current.companyId ? current.name : null}
        onCreated={(c) => current && setConv(current, { company_id: c.id })}
      />
    </div>
  );
}

function preview(c: Comm, now: number) {
  if (c.channel === "call") {
    if (isLive(c, now)) return c.status === "ringing" ? "Ringing…" : "On the call now";
    const what = c.status === "voicemail" ? "Voicemail" : c.direction === "inbound" ? (missed(c) ? "Missed call" : "Incoming call") : missed(c) ? "No answer" : "Outgoing call";
    return [what, c.duration_sec ? clock(c.duration_sec) : null, c.disposition].filter(Boolean).join(" · ");
  }
  if (c.channel === "note") return `Note: ${c.body || ""}`;
  if (c.channel === "email") return `${c.direction === "outbound" ? "You: " : ""}${c.subject || c.body || "Email"}`;
  return `${c.direction === "outbound" ? "You: " : ""}${c.body || ""}`;
}

function ChannelIcon({ c, className }: { c: Comm; className?: string }) {
  if (c.channel === "note") return <StickyNote className={className} />;
  if (c.channel === "email") return <Mail className={className} />;
  if (c.channel === "sms") return <MessageSquare className={className} />;
  if (c.status === "voicemail") return <Voicemail className={className} />;
  if (missed(c)) return <PhoneMissed className={cn(className, "text-red-500")} />;
  return c.direction === "inbound" ? <PhoneIncoming className={className} /> : <PhoneOutgoing className={className} />;
}

type Mode = "sms" | "email" | "note";

function ThreadView({
  t,
  companyName,
  onBack,
  put,
  setConv,
  members,
  snippets,
  agent,
  onAddContact,
}: {
  t: Thread;
  companyName: string | null;
  onBack: () => void;
  put: (r: Comm) => void;
  setConv: (p: Partial<Conv>) => Promise<void> | void;
  members: { id: string; name: string }[];
  snippets: Snippet[];
  agent: string | null;
  onAddContact: () => void;
}) {
  const { me, companies, memberName } = useStore();
  const company = companies.find((c) => c.id === t.companyId) || null;
  const companyEmail = company?.contact_email || company?.secondary_email || null;
  const [mode, setMode] = useState<Mode>(t.isPhone ? "sms" : "email");
  const [text, setText] = useState("");
  const [subject, setSubject] = useState(() => (!t.isPhone ? `Re: ${[...t.items].reverse().find((x) => x.subject)?.subject?.replace(/^re:\s*/i, "") || ""}` : ""));
  const [emailTo, setEmailTo] = useState(!t.isPhone ? t.key : companyEmail || "");
  const [busy, setBusy] = useState(false);
  const [calling, setCalling] = useState(false);
  const [saveSnippet, setSaveSnippet] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const closed = t.conv?.status === "closed";

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [t.items.length]);

  const send = async () => {
    const body = text.trim();
    if (!body) return;
    setBusy(true);
    let ok = false;
    if (mode === "note") {
      const { data, error } = await sb()
        .from("tms_comms")
        .insert({ channel: "note", direction: "outbound", contact: t.key, company_id: t.companyId, member_id: me.id, body, read_at: new Date().toISOString() })
        .select()
        .single();
      if (error) toast.error(errMsg(error));
      else {
        put(data as Comm);
        ok = true;
      }
    } else if (mode === "sms") {
      ok = await sendMessage({ channel: "sms", to: t.key, name: t.name, body, companyId: t.companyId });
    } else {
      ok = await sendMessage({ channel: "email", to: emailTo, name: t.name, body, subject: subject.trim() || "Message from TOSS", companyId: t.companyId });
    }
    setBusy(false);
    if (ok) {
      setText("");
      // replying takes the conversation if nobody has it
      if (mode !== "note" && !t.conv?.assignee_id) setConv({ assignee_id: me.id });
    }
  };

  const addSnippet = async () => {
    const body = text.trim();
    if (!body) return toast.error("Write the reply first, then save it.");
    const title = body.split("\n")[0].slice(0, 40);
    const { error } = await sb().from("tms_snippets").insert({ title, body });
    if (error) toast.error(errMsg(error));
    else toast.success("Saved as a quick reply");
    setSaveSnippet(false);
  };

  const segments = Math.max(1, Math.ceil(text.length / 160));

  return (
    <Card className="flex min-h-0 flex-col overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
        <button type="button" onClick={onBack} className="text-[13px] text-fg-3 hover:text-fg lg:hidden">
          ← Back
        </button>
        <Avatar name={t.name} className="h-9 w-9" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm font-bold text-fg">{t.name}</span>
            <button type="button" onClick={() => setConv({ starred: !t.conv?.starred })} aria-label={t.conv?.starred ? "Unstar" : "Star"} className="text-fg-4 hover:text-amber-500">
              <Star className={cn("h-4 w-4", t.conv?.starred && "fill-amber-400 text-amber-400")} />
            </button>
            {closed && <Pill className={neutralPill}>Closed</Pill>}
          </div>
          <div className="flex flex-wrap items-center gap-x-2 text-[12px] text-fg-3">
            <span>{t.isPhone ? prettyPhone(t.key) : t.key}</span>
            {company ? (
              <Link href={`/fleet?company=${company.id}`} className="inline-flex items-center gap-1 hover:text-fg hover:underline">
                <Building2 className="h-3 w-3" /> {companyName}
              </Link>
            ) : (
              <button type="button" onClick={onAddContact} className="inline-flex items-center gap-1 text-brand hover:underline">
                <UserPlus className="h-3 w-3" /> Add as contact
              </button>
            )}
          </div>
        </div>
        <Select className="h-8 w-auto max-w-[170px] py-0 text-[12px]" value={t.conv?.assignee_id || ""} onChange={(e) => setConv({ assignee_id: e.target.value || null })} aria-label="Assigned to">
          <option value="">Unassigned</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.id === me.id ? `Me (${m.name})` : m.name}
            </option>
          ))}
        </Select>
        <Button size="sm" variant="outline" onClick={() => setConv({ status: closed ? "open" : "closed" })}>
          {closed ? <RotateCcw className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />} {closed ? "Reopen" : "Close"}
        </Button>
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
        {!t.companyId && (
          <Select className="h-8 w-auto max-w-[180px] py-0 text-[12px]" value="" onChange={(e) => e.target.value && linkTo(e.target.value)} aria-label="Link to a carrier">
            <option value="">Link to a carrier…</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        )}
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-surface-2/30 p-4">
        {t.items.map((c) => (
          <Item key={c.id} c={c} memberName={memberName} mine={c.member_id === me.id} put={put} />
        ))}
        <div ref={end} />
      </div>

      {/* composer */}
      <div className={cn("border-t border-line p-3", mode === "note" && "bg-amber-500/5")}>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <Segmented<Mode>
            size="sm"
            value={mode}
            onChange={setMode}
            options={[
              ...(t.isPhone ? [{ value: "sms" as Mode, label: <><MessageSquare className="h-3.5 w-3.5" /> Text</> }] : []),
              { value: "email" as Mode, label: <><Mail className="h-3.5 w-3.5" /> Email</> },
              { value: "note" as Mode, label: <><StickyNote className="h-3.5 w-3.5" /> Note</> },
            ]}
          />
          <Popover
            align="start"
            width={280}
            trigger={({ toggle, ref }) => (
              <Button ref={ref} size="sm" variant="ghost" onClick={toggle}>
                <Zap className="h-3.5 w-3.5" /> Quick replies
              </Button>
            )}
          >
            {(close) => (
              <>
                {snippets.length === 0 && <div className="px-3 py-2 text-[12px] text-fg-3">No quick replies yet. Write one and save it.</div>}
                {snippets.map((s) => (
                  <MenuItem key={s.id} icon={FileText} onClick={() => (close(), setText((x) => (x ? `${x}\n${s.body}` : s.body)))}>
                    {s.title}
                  </MenuItem>
                ))}
                <MenuSep />
                <MenuItem icon={Zap} onClick={() => (close(), addSnippet())}>
                  Save this message as a quick reply
                </MenuItem>
                {snippets.some((s) => s.created_by === me.id) && (
                  <MenuItem icon={Trash2} onClick={() => (close(), setSaveSnippet(true))}>
                    Delete a quick reply…
                  </MenuItem>
                )}
              </>
            )}
          </Popover>
          <span className="ml-auto text-[11px] text-fg-4">
            {mode === "sms"
              ? `${text.length} chars · ${segments} SMS${agent ? ` · from Kixie user ${agent}` : ""}`
              : mode === "note"
                ? "Only your team sees notes"
                : "From TOSS · replies go to your email"}
          </span>
        </div>
        {mode === "email" && !emailTo.trim() && (
          <p className="mb-2 rounded-lg bg-amber-500/10 px-2.5 py-1.5 text-[12px] text-amber-700 dark:text-amber-300">
            No email saved for {t.name}. Type the address to send to.
          </p>
        )}
        {mode === "email" && (
          <div className="mb-2 grid gap-2 sm:grid-cols-2">
            <Input value={emailTo} onChange={(e) => setEmailTo(e.target.value)} placeholder="To: name@company.com" type="email" />
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" />
          </div>
        )}
        <div className="flex items-end gap-2">
          <Textarea
            rows={mode === "email" ? 4 : 2}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && mode !== "email") {
                e.preventDefault();
                send();
              }
            }}
            placeholder={mode === "sms" ? "Text… (Enter sends, Shift+Enter new line)" : mode === "note" ? "Internal note for the team… (Enter saves)" : "Email message…"}
            className="min-h-[44px] flex-1"
          />
          <Button variant="primary" onClick={send} loading={busy} disabled={!text.trim() || (mode === "email" && !emailTo.trim())}>
            {!busy && (mode === "note" ? <StickyNote className="h-4 w-4" /> : <Send className="h-4 w-4" />)} {mode === "note" ? "Save" : "Send"}
          </Button>
        </div>
      </div>
      <SnippetDelete open={saveSnippet} onClose={() => setSaveSnippet(false)} snippets={snippets.filter((s) => s.created_by === me.id)} />
    </Card>
  );

  async function linkTo(companyId: string) {
    const ids = t.items.map((x) => x.id);
    const { error } = await sb().from("tms_comms").update({ company_id: companyId }).in("id", ids);
    if (error) return toast.error(errMsg(error));
    for (const x of t.items) put({ ...x, company_id: companyId });
    await setConv({ company_id: companyId });
    toast.success("Linked to the carrier");
  }
}

function SnippetDelete({ open, onClose, snippets }: { open: boolean; onClose: () => void; snippets: Snippet[] }) {
  if (!open) return null;
  return (
    <div className="border-t border-line bg-surface-2/50 p-3">
      <div className="mb-2 flex items-center justify-between text-[12px] font-semibold text-fg">
        Your quick replies
        <button type="button" onClick={onClose} className="text-fg-3 hover:text-fg">
          Done
        </button>
      </div>
      <ul className="space-y-1">
        {snippets.map((s) => (
          <li key={s.id} className="flex items-center gap-2 text-[12px]">
            <span className="min-w-0 flex-1 truncate text-fg-2">{s.title}</span>
            <Button
              size="xs"
              variant="danger-ghost"
              onClick={async () => {
                const { error } = await sb().from("tms_snippets").delete().eq("id", s.id);
                if (error) toast.error(errMsg(error));
              }}
            >
              <Trash2 className="h-3 w-3" /> Delete
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Item({ c, memberName, mine, put }: { c: Comm; memberName: (id: string | null) => string; mine: boolean; put: (r: Comm) => void }) {
  const out = c.direction === "outbound";
  const who = out ? (c.member_id ? memberName(c.member_id) : c.agent_email || "TOSS") : null;

  if (c.channel === "call") return <CallCard c={c} who={who} />;

  if (c.channel === "note") {
    return (
      <div className="flex justify-center">
        <div className="w-full max-w-[560px] rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-2.5">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300">
            <StickyNote className="h-3 w-3" /> Internal note · {who}
            {mine && (
              <button
                type="button"
                className="ml-auto text-fg-4 hover:text-red-600"
                aria-label="Delete note"
                onClick={async () => {
                  const { error } = await sb().from("tms_comms").delete().eq("id", c.id);
                  if (error) toast.error(errMsg(error));
                  else put({ ...c, channel: "note", body: "(deleted)" });
                }}
              >
                <Trash2 className="h-3 w-3" />
              </button>
            )}
          </div>
          <p className="mt-1 whitespace-pre-wrap break-words text-[13px] text-fg">{c.body}</p>
          <div className="mt-1 text-[11px] text-fg-4">{fmtDateTime(c.occurred_at)}</div>
        </div>
      </div>
    );
  }

  if (c.channel === "email") {
    return (
      <div className={cn("flex", out ? "justify-end" : "justify-start")}>
        <div className={cn("max-w-[85%] rounded-xl border px-3.5 py-2.5 shadow-sm", out ? "border-brand/30 bg-brand/5" : "border-line bg-surface")}>
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-fg-4">
            <Mail className="h-3 w-3" /> {out ? `Email sent to ${c.contact}` : "Email received"}
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
        <div className={cn("mb-0.5 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider", out ? "text-brand-fg/70" : "text-fg-4")}>
          <MessageSquare className="h-3 w-3" /> {out ? "Text sent" : "Text received"}
        </div>
        <p className="whitespace-pre-wrap break-words text-[13px]">{c.body}</p>
        <Meta c={c} who={who} light={out} />
      </div>
    </div>
  );
}

/** Kixie confirms every text it really sent (its SMS webhook). Without that after a few minutes, it didn't go out. */
function SmsState({ c }: { c: Comm }) {
  const now = useNow();
  if (c.channel !== "sms" || c.direction !== "outbound" || c.status === "failed") return null;
  if (c.external_id)
    return (
      <span className="inline-flex items-center gap-0.5" title="Kixie confirmed it sent this text">
        · <CheckCheck className="h-3 w-3" /> sent by Kixie
      </span>
    );
  const age = now - new Date(c.occurred_at).getTime();
  if (age < 3 * 60_000)
    return (
      <span className="inline-flex items-center gap-0.5">
        · <Clock className="h-3 w-3" /> sending
      </span>
    );
  return (
    <span className="inline-flex items-center gap-0.5 font-semibold" title="Kixie accepted the text but never confirmed sending it. The Kixie user's number may not be set up for texting (10DLC).">
      · <CircleDot className="h-3 w-3" /> not confirmed by Kixie
    </span>
  );
}

function Meta({ c, who, light }: { c: Comm; who: string | null; light?: boolean }) {
  return (
    <div className={cn("mt-1 flex flex-wrap items-center gap-x-1.5 text-[11px]", light ? "text-brand-fg/70" : "text-fg-4")}>
      <span>{fmtDateTime(c.occurred_at)}</span>
      {who && <span>· {who}</span>}
      <SmsState c={c} />
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
  const now = useNow();
  const liveNow = isLive(c, now);
  const title = liveNow
    ? c.status === "ringing"
      ? out
        ? "Calling…"
        : "Incoming call, ringing…"
      : "On the call now"
    : c.status === "voicemail"
      ? "Voicemail"
      : missed(c)
        ? out
          ? "No answer"
          : "Missed call"
        : out
          ? "Outgoing call"
          : "Incoming call";
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
      <div className={cn("w-full max-w-[420px] rounded-xl border bg-surface px-3.5 py-3 shadow-sm", liveNow ? "border-emerald-500/50" : "border-line")}>
        <div className="flex items-center gap-2">
          <span className={cn("flex h-8 w-8 items-center justify-center rounded-full", liveNow ? "bg-emerald-500/15 text-emerald-600" : missed(c) ? "bg-red-500/10 text-red-600" : "bg-brand/10 text-fg")}>
            {liveNow ? <PhoneCall className="h-4 w-4 animate-pulse" /> : <ChannelIcon c={c} className="h-4 w-4" />}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 text-[13px] font-semibold text-fg">
              {title}
              {out ? <ArrowUpRight className="h-3 w-3 text-fg-4" /> : <ArrowDownLeft className="h-3 w-3 text-fg-4" />}
            </div>
            <div className="text-[11px] text-fg-4">
              {fmtDateTime(c.occurred_at)}
              {liveNow ? ` · ${clock((now - new Date(c.occurred_at).getTime()) / 1000)}` : c.duration_sec ? ` · ${clock(c.duration_sec)}` : ""}
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
        {!liveNow && !c.disposition && c.status && /answer/i.test(c.status) && <p className="mt-2 text-[11px] text-fg-4">No call outcome picked in Kixie yet.</p>}
        {hasRecording &&
          !liveNow &&
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

/** Right side: who this is, their carrier, phones and emails, open invoices to send. */
function ContactPanel({ t }: { t: Thread }) {
  const { companies, invoices } = useStore();
  const company = companies.find((c) => c.id === t.companyId) || null;
  const open = useMemo(
    () => (company ? (invoices as Invoice[]).filter((i) => i.company_id === company.id && i.status !== "draft" && i.status !== "void" && balance(i) > 0).slice(0, 5) : []),
    [company, invoices],
  );
  const [sending, setSending] = useState<Invoice | null>(null);
  const calls = t.items.filter((x) => x.channel === "call");
  const talk = calls.reduce((n, x) => n + (x.duration_sec || 0), 0);

  return (
    <Card className="hidden min-h-0 flex-col overflow-y-auto 2xl:flex">
      <div className="flex flex-col items-center border-b border-line p-4 text-center">
        <Avatar name={t.name} className="h-14 w-14 text-lg" />
        <div className="mt-2 text-sm font-bold text-fg">{t.name}</div>
        <div className="text-[12px] text-fg-3">{t.isPhone ? prettyPhone(t.key) : t.key}</div>
        {company && (
          <Link href={`/fleet?company=${company.id}`} className="mt-1 inline-flex items-center gap-1 text-[12px] text-fg-2 hover:underline">
            <Building2 className="h-3 w-3" /> {company.name}
            {company.stage === "lead" && <Pill className={cn("ml-1", neutralPill)}>Lead</Pill>}
          </Link>
        )}
      </div>
      <div className="space-y-4 p-4 text-[12px]">
        <div className="grid grid-cols-3 gap-2 text-center">
          <Stat label="Calls" value={String(calls.length)} />
          <Stat label="Talk time" value={clock(talk)} />
          <Stat label="Texts" value={String(t.items.filter((x) => x.channel === "sms").length)} />
        </div>
        {company && <CompanyContacts company={company} />}
        {open.length > 0 && (
          <div>
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-fg-4">Open invoices</div>
            <ul className="space-y-1.5">
              {open.map((i) => (
                <li key={i.id} className="flex items-center gap-2">
                  <Link href={`/invoices/${i.id}`} className="min-w-0 flex-1 truncate text-fg hover:underline">
                    {i.invoice_number}
                  </Link>
                  <span className="text-fg-3">{money(balance(i), { currency: i.currency })}</span>
                  {i.public_token && (
                    <Button size="xs" variant="outline" onClick={() => setSending(i)}>
                      <Send className="h-3 w-3" /> Send
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      {sending && company && (
        <MessageDialog
          open
          onClose={() => setSending(null)}
          defaults={{
            title: `Send invoice ${sending.invoice_number}`,
            channel: t.isPhone ? "sms" : "email",
            recipients: [{ name: t.name, phone: t.isPhone ? t.key : company.contact_phone, email: t.isPhone ? company.contact_email : t.key }],
            companyId: company.id,
            invoiceId: sending.id,
            sms: `Hi, here is invoice ${sending.invoice_number} from ${sending.issuer_name || "TOSS"} (${money(balance(sending), { currency: sending.currency })} open). View and download: ${window.location.origin}/i/${sending.public_token}`,
            subject: `Invoice ${sending.invoice_number} from ${sending.issuer_name || "TOSS"}`,
            email: `Hello,\n\nHere is invoice ${sending.invoice_number} for ${money(balance(sending), { currency: sending.currency })}.\n\nOpen it below to view or download the PDF.\n\nThank you,\n${sending.issuer_name || "TOSS"}`,
            button: { label: "View invoice", href: `${window.location.origin}/i/${sending.public_token}` },
          }}
        />
      )}
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-surface-2/70 px-2 py-1.5">
      <div className="tnum text-sm font-bold text-fg">{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-fg-4">{label}</div>
    </div>
  );
}

function CompanyContacts({ company }: { company: Company }) {
  const people = [
    { name: company.contact_name, phone: company.contact_phone, email: company.contact_email, role: "Owner" },
    {
      name: [company.secondary_first_name, company.secondary_last_name].filter(Boolean).join(" ") || null,
      phone: company.secondary_phone,
      email: company.secondary_email,
      role: company.secondary_title || "Contact",
    },
  ].filter((p) => p.phone || p.email);
  if (!people.length) return null;
  return (
    <div>
      <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-fg-4">Contacts</div>
      <ul className="space-y-2">
        {people.map((p, i) => (
          <li key={i} className="rounded-lg border border-line px-2.5 py-2">
            <div className="font-semibold text-fg">
              {p.name || company.name} <span className="font-normal text-fg-4">· {p.role}</span>
            </div>
            {p.phone && <PhoneActions phone={p.phone} name={p.name || company.name} companyId={company.id} label={p.role} className="text-fg-2" />}
            {p.email && <div className="truncate text-fg-3">{p.email}</div>}
          </li>
        ))}
      </ul>
    </div>
  );
}
