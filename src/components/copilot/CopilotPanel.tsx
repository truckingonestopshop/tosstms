"use client";

// TOSS Copilot window (opened from the floating orb, Ctrl+J). It knows the page you're on and the
// company in focus, reads the team's data and Lead Hunter with its tools, opens pages, and proposes
// actions as confirm cards that run only when you click Confirm. Chats are private to each person
// (tms_copilot_threads). Always dark glass with TOSS orange light, in light mode too.

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowUp, Check, ExternalLink, FileWarning, History, Loader2, Maximize2, Mic, Minimize2, Receipt, Search, Sparkle, Square, SquarePen, Trash2, X, type LucideIcon } from "lucide-react";
import { sb } from "@/lib/db";
import { Orb } from "./Orb";
import { useStore } from "@/lib/store";
import { cn, fmtDay, money } from "@/lib/format";
import type { CopilotUITools } from "@/lib/copilot/tools";

type Msg = UIMessage<unknown, never, CopilotUITools>;
type Part = Msg["parts"][number];

const SEND_LAST = 40;
const STORE_LAST = 100;

const STARTERS: { text: string; icon: LucideIcon }[] = [
  { text: "What needs my attention today?", icon: Sparkle },
  { text: "Which invoices are overdue?", icon: Receipt },
  { text: "Paperwork expired or expiring this month", icon: FileWarning },
  { text: "Look up MC 1291694 in Lead Hunter", icon: Search },
];

const RUNNING: Record<string, [string, string]> = {
  "tool-find_companies": ["Looking up companies…", "Looked up companies"],
  "tool-company_details": ["Reading the company…", "Read the company"],
  "tool-loads": ["Reading loads…", "Read loads"],
  "tool-load_details": ["Opening the load…", "Opened the load"],
  "tool-fleet": ["Reading trucks, trailers and drivers…", "Read the fleet"],
  "tool-invoices": ["Reading invoices…", "Read invoices"],
  "tool-paperwork": ["Checking paperwork…", "Checked paperwork"],
  "tool-sales": ["Reading the pipeline…", "Read the pipeline"],
  "tool-cases": ["Reading cases…", "Read cases"],
  "tool-business_summary": ["Adding up the numbers…", "Added up the numbers"],
  "tool-team": ["Reading the team…", "Read the team"],
  "tool-accounting_summary": ["Reading TOSS Accounting…", "Read TOSS Accounting"],
  "tool-hunter_count": ["Counting in Lead Hunter…", "Counted in Lead Hunter"],
  "tool-hunter_search": ["Searching Lead Hunter…", "Searched Lead Hunter"],
  "tool-hunter_company": ["Opening the Lead Hunter record…", "Opened the Lead Hunter record"],
};

const ACTION: Record<string, string> = {
  "tool-propose_create_company": "Add company",
  "tool-propose_add_lead_from_hunter": "Add lead from Lead Hunter",
  "tool-propose_update_company": "Edit company details",
  "tool-propose_update_from_hunter": "Update company from Lead Hunter",
  "tool-propose_add_company_note": "Add a note to the company timeline",
  "tool-propose_create_case": "Open a case",
  "tool-propose_create_opportunity": "Create an opportunity",
  "tool-propose_set_load_status": "Change load status",
  "tool-propose_set_truck_availability": "Update truck location / availability",
};

const FIELD: Record<string, string> = {
  name: "Name", dot_number: "USDOT", mc_number: "MC", stage: "Stage", contact_first_name: "Contact first name", contact_last_name: "Contact last name",
  contact_phone: "Phone", contact_email: "Email", notes: "Notes", company_id: "Company", note: "Note", kind: "Kind", title: "Title", description: "Description",
  priority: "Priority", due_date: "Due", service: "Service", value: "Value", expected_close: "Expected close", load_id: "Load", status: "Status",
  truck_id: "Truck", current_location: "Location", available_date: "Available from", dba_name: "DBA", street: "Street", city: "City", state: "State",
  zip: "ZIP",
};

type Thread = { id: string; title: string; updated_at: string };

/** The whole window: picks the chat (latest on open, new, or one from history) and stores it. */
export function CopilotPanel({ onClose, onBusy, large, onLarge }: { onClose: () => void; onBusy?: (busy: boolean) => void; large?: boolean; onLarge?: () => void }) {
  const [busy, setBusy] = useState(false);
  const reportBusy = useCallback(
    (b: boolean) => {
      setBusy(b);
      onBusy?.(b);
    },
    [onBusy],
  );
  const [chat, setChat] = useState<{ id: string; messages: Msg[] } | null>(null);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [showChats, setShowChats] = useState(false);

  useEffect(() => {
    let stale = false;
    (async () => {
      const { data } = await sb().from("tms_copilot_threads").select("id,title,updated_at").order("updated_at", { ascending: false }).limit(30);
      if (stale) return;
      const list = (data || []) as Thread[];
      setThreads(list);
      const latest = list[0];
      if (latest) {
        const { data: t } = await sb().from("tms_copilot_threads").select("messages").eq("id", latest.id).maybeSingle();
        if (stale) return;
        setChat({ id: latest.id, messages: (t?.messages as Msg[]) || [] });
      } else setChat({ id: crypto.randomUUID(), messages: [] });
    })();
    return () => {
      stale = true;
    };
  }, []);

  const newChat = () => {
    setShowChats(false);
    setChat({ id: crypto.randomUUID(), messages: [] });
  };
  const openThread = async (t: Thread) => {
    const { data } = await sb().from("tms_copilot_threads").select("messages").eq("id", t.id).maybeSingle();
    setShowChats(false);
    setChat({ id: t.id, messages: (data?.messages as Msg[]) || [] });
  };
  const removeThread = async (t: Thread) => {
    await sb().from("tms_copilot_threads").delete().eq("id", t.id);
    setThreads((l) => l.filter((x) => x.id !== t.id));
    if (chat?.id === t.id) newChat();
  };
  const persist = useCallback(async (id: string, messages: Msg[]) => {
    if (!messages.length) return;
    const title = firstUserText(messages).slice(0, 80) || "Untitled chat";
    const { error } = await sb().from("tms_copilot_threads").upsert({ id, title, messages: messages.slice(-STORE_LAST), updated_at: new Date().toISOString() });
    if (!error) setThreads((ts) => [{ id, title, updated_at: new Date().toISOString() }, ...ts.filter((x) => x.id !== id)]);
  }, []);

  return (
    <div className="dark relative flex h-full flex-col text-fg">
      <div className="copilot-aurora" data-state={busy ? "busy" : "idle"} aria-hidden />
      <div className="relative z-10 flex items-center gap-3 px-4 pb-2 pt-3.5">
        <Orb size={30} busy={busy} />
        <div className="min-w-0 flex-1 leading-tight">
          <div className="text-[14px] font-bold tracking-[-0.02em] text-white">TOSS Copilot</div>
          <div className="truncate text-[11px] text-white/45">{busy ? <span className="animate-shimmer-text">Working on it…</span> : "Knows TOSS Cloud and Lead Hunter"}</div>
        </div>
        <IconButton label={showChats ? "Back to the chat" : "Earlier chats"} onClick={() => setShowChats((v) => !v)} active={showChats}>
          <History className="h-4 w-4" />
        </IconButton>
        <IconButton label="New chat" onClick={newChat}>
          <SquarePen className="h-4 w-4" />
        </IconButton>
        {onLarge && (
          <IconButton label={large ? "Smaller window" : "Bigger window"} onClick={onLarge} className="max-md:hidden">
            {large ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </IconButton>
        )}
        <IconButton label="Close" onClick={onClose}>
          <X className="h-4 w-4" />
        </IconButton>
      </div>
      <div className="relative z-10 mx-4 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      {showChats ? (
        <div className="relative z-10 flex-1 overflow-y-auto p-3">
          <div className="px-1 pb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/35">Earlier chats</div>
          {threads.length === 0 && <p className="px-1 py-3 text-sm text-white/45">No earlier chats.</p>}
          <div className="space-y-1">
            {threads.map((t) => (
              <div key={t.id} className={cn("group flex items-center gap-2 rounded-2xl px-3 py-2.5 transition-colors hover:bg-white/[0.06]", chat?.id === t.id && "bg-white/[0.06]")}>
                <button type="button" onClick={() => void openThread(t)} className="min-w-0 flex-1 text-left">
                  <div className="truncate text-[13px] font-medium text-white">{t.title}</div>
                  <div className="text-[11px] text-white/40">{fmtDay(t.updated_at.slice(0, 10))}</div>
                </button>
                <button type="button" onClick={() => void removeThread(t)} aria-label={`Delete chat ${t.title}`} className="rounded-full p-1.5 text-white/40 opacity-0 transition hover:bg-white/10 hover:text-red-400 group-hover:opacity-100">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : chat ? (
        <Chat key={chat.id} id={chat.id} initial={chat.messages} onPersist={persist} onBusy={reportBusy} large={!!large} />
      ) : (
        <div className="relative z-10 flex flex-1 items-center justify-center">
          <Orb size={40} busy />
        </div>
      )}
    </div>
  );
}

function IconButton({ label, onClick, active, className, children }: { label: string; onClick: () => void; active?: boolean; className?: string; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label} className={cn("cp-glass flex h-8 w-8 items-center justify-center rounded-full text-white/70 hover:text-white", active && "border-[#F28C38]/50 text-[#F28C38]", className)}>
      {children}
    </button>
  );
}

function firstUserText(messages: Msg[]): string {
  for (const m of messages) if (m.role === "user") for (const p of m.parts) if (p.type === "text" && p.text.trim()) return p.text.trim().replace(/\s+/g, " ");
  return "";
}

type SpeechRec = { lang: string; interimResults: boolean; continuous: boolean; start: () => void; stop: () => void; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onend: (() => void) | null; onerror: (() => void) | null };

/** One conversation (remounted when another chat opens). */
function Chat({ id, initial, onPersist, onBusy, large }: { id: string; initial: Msg[]; onPersist: (id: string, m: Msg[]) => void; onBusy: (b: boolean) => void; large: boolean }) {
  const { me } = useStore();
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const page = `${path}${params.size ? `?${params}` : ""}`;
  const companyId = params.get("company");
  // Every request says which page is on screen and the company in focus.
  const body = { page, companyId };

  const [transport] = useState(
    () =>
      new DefaultChatTransport<Msg>({
        api: "/api/copilot",
        prepareSendMessagesRequest: ({ id, messages, body }) => ({ body: { ...body, id, messages: messages.slice(-SEND_LAST) } }),
      }),
  );
  const { messages, sendMessage, status, stop, error, regenerate, clearError, addToolOutput } = useChat<Msg>({ id, messages: initial, transport });
  const busy = status === "submitted" || status === "streaming";
  useEffect(() => onBusy(busy), [busy, onBusy]);

  // Navigation asked by Copilot happens once, as soon as the call arrives (never for an old chat).
  const [done] = useState(() => new Set(initial.flatMap((m) => m.parts.filter((p) => p.type === "tool-navigate" && "toolCallId" in p).map((p) => (p as { toolCallId: string }).toolCallId))));
  useEffect(() => {
    for (const m of messages)
      for (const p of m.parts) {
        if (p.type !== "tool-navigate" || p.state !== "input-available" || done.has(p.toolCallId)) continue;
        done.add(p.toolCallId);
        router.push(p.input.path);
        void addToolOutput({ tool: "navigate", toolCallId: p.toolCallId, output: { opened: true } });
      }
  }, [messages, router, addToolOutput, done]);

  // Store after each finished answer and after a card is completed.
  const sig = (l: Msg[]) => `${l.length}:${l[l.length - 1]?.id}:${l[l.length - 1]?.parts.map((p) => ("state" in p ? p.state : p.type)).join(",")}`;
  const lastSaved = useRef(sig(initial));
  useEffect(() => {
    if (busy || !messages.length) return;
    const s = sig(messages);
    if (s === lastSaved.current) return;
    lastSaved.current = s;
    onPersist(id, messages);
  }, [messages, busy, id, onPersist]);

  const [input, setInput] = useState("");
  const send = (text: string) => {
    const t = text.trim();
    if (!t || busy) return;
    clearError();
    void sendMessage({ text: t }, { body });
    setInput("");
  };

  // Talk instead of typing (the browser's speech recognition, where it exists).
  const [listening, setListening] = useState(false);
  const rec = useRef<SpeechRec | null>(null);
  const canTalk = typeof window !== "undefined" && !!((window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition || (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition);
  const toggleMic = () => {
    if (listening) return rec.current?.stop();
    const W = window as unknown as { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec };
    const Ctor = W.SpeechRecognition || W.webkitSpeechRecognition;
    if (!Ctor) return;
    const r = new Ctor();
    r.lang = "en-US";
    r.interimResults = true;
    r.continuous = false;
    const before = input ? `${input.trim()} ` : "";
    r.onresult = (e) => setInput(before + Array.from(e.results).map((x) => x[0].transcript).join(""));
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    rec.current = r;
    setListening(true);
    r.start();
  };

  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scroller.current;
    if (el && messages.length) el.scrollTop = el.scrollHeight;
  }, [messages, status]);

  const last = messages[messages.length - 1];
  const replies = !busy && last?.role === "assistant" ? suggested(last) : [];
  const [oldCards] = useState(() => new Set(initial.flatMap((m) => m.parts.filter((p) => p.type.startsWith("tool-propose_") && "toolCallId" in p).map((p) => (p as { toolCallId: string }).toolCallId))));
  const first = (me.fullName || "").split(" ")[0];

  return (
    <>
      <div ref={scroller} className={cn("relative z-10 flex-1 overflow-y-auto px-4 py-4", messages.length ? "space-y-5" : "flex flex-col")}>
        {messages.length === 0 && (
          <div className="flex flex-1 flex-col items-center justify-center pb-4 text-center">
            <div className="relative">
              <div className="absolute -inset-10 rounded-full bg-[radial-gradient(circle,rgba(242,140,56,0.38),rgba(255,86,48,0.12)_45%,transparent_70%)] blur-2xl" aria-hidden />
              <Orb size={large ? 112 : 92} />
            </div>
            <h2 className={cn("cp-greeting mt-7 font-semibold tracking-[-0.03em]", large ? "text-[30px]" : "text-[23px]")}>
              Hey {first || "there"}, how can I help you today?
            </h2>
            <p className="mt-2 max-w-[320px] text-[13px] leading-relaxed text-white/45">Ask about anything in TOSS Cloud or Lead Hunter, or give me a task.</p>
          </div>
        )}

        {messages.map((m) => (
          <div
            key={m.id}
            className={
              m.role === "user"
                ? "cp-glass ml-auto max-w-[85%] rounded-[20px] rounded-br-md px-3.5 py-2.5 text-[13.5px] text-white"
                : "space-y-2.5 text-[13.5px] leading-relaxed text-white/80"
            }
          >
            {m.parts.map((p, i) =>
              p.type.startsWith("tool-propose_") ? (
                <ActionCard
                  key={i}
                  part={p as ProposePart}
                  actionable={m === last && !busy && !oldCards.has((p as ProposePart).toolCallId)}
                  threadId={id}
                  onDone={(toolCallId, output) => void addToolOutput({ tool: p.type.slice(5) as never, toolCallId, output: output as never })}
                />
              ) : p.type === "tool-suggest_replies" ? (
                <Question key={i} part={p} said={m.parts.map((x) => (x.type === "text" ? x.text : "")).join(" ")} />
              ) : (
                <PartView key={i} part={p} user={m.role === "user"} live={busy && m === last} />
              ),
            )}
          </div>
        ))}

        {status === "submitted" && (
          <p className="inline-flex items-center gap-2.5 text-xs">
            <Orb size={18} busy />
            <span className="animate-shimmer-text font-medium">Thinking…</span>
          </p>
        )}
        {error && (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-[13px] text-red-300">
            {errorText(error)}
            <button type="button" onClick={() => void regenerate({ body })} className="ml-2 font-semibold underline underline-offset-2">
              Try again
            </button>
          </div>
        )}
        {replies.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {replies.map((r) => (
              <button key={r} type="button" onClick={() => send(r)} className="rounded-full border border-[#F28C38]/50 bg-[#F28C38]/10 px-3.5 py-1.5 text-xs font-semibold text-[#ffc896] transition hover:bg-[#F28C38] hover:text-black">
                {r}
              </button>
            ))}
          </div>
        )}
      </div>

      <form
        className="relative z-10 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        {messages.length === 0 && (
          <div className="mb-2.5 flex flex-col items-start gap-1.5">
            {STARTERS.map((s) => (
              <button key={s.text} type="button" onClick={() => send(s.text)} className="cp-glass inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-left text-[12.5px] font-medium text-white/80 hover:text-white">
                <s.icon className="h-3.5 w-3.5 text-[#F28C38]" />
                {s.text}
              </button>
            ))}
          </div>
        )}
        <div className="cp-composer rounded-[22px] px-3 pb-2 pt-2.5">
          {listening && <div className="px-1 pb-1 text-[11px] font-medium text-[#F28C38]">Listening…</div>}
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send(input);
              }
            }}
            rows={large ? 3 : 2}
            maxLength={4000}
            autoFocus
            placeholder={companyId ? "Ask about this company, or give me a task…" : "Ask anything, or give me a task…"}
            className="block max-h-40 min-h-[2.75rem] w-full resize-none bg-transparent px-1 text-base text-white outline-none placeholder:text-white/35 md:text-[13.5px]"
          />
          <div className="mt-1 flex items-center gap-1.5">
            <button type="button" onClick={() => setInput((v) => (v.toLowerCase().includes("lead hunter") ? v : `${v ? `${v.trim()} ` : ""}in Lead Hunter `))} className="cp-glass inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-medium text-white/70 hover:text-white">
              <Search className="h-3 w-3" /> Lead Hunter
            </button>
            <span className="flex-1" />
            {canTalk && !busy && (
              <button type="button" onClick={toggleMic} aria-label={listening ? "Stop listening" : "Speak"} className={cn("flex h-8 w-8 items-center justify-center rounded-full transition", listening ? "cp-listening bg-[#F28C38] text-black" : "cp-glass text-white/70 hover:text-white")}>
                <Mic className="h-3.5 w-3.5" />
              </button>
            )}
            {busy ? (
              <button type="button" onClick={() => stop()} aria-label="Stop" className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-black transition hover:bg-white/85">
                <Square className="h-3 w-3 fill-current" />
              </button>
            ) : (
              <button type="submit" disabled={!input.trim()} aria-label="Send" className="flex h-8 w-8 items-center justify-center rounded-full bg-[#F28C38] text-black shadow-[0_0_20px_-4px_rgba(242,140,56,0.8)] transition hover:bg-[#ff9d4d] disabled:bg-white/10 disabled:text-white/30 disabled:shadow-none">
                <ArrowUp className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
        <p className="mt-2 text-center text-[10px] text-white/30">Changes run only after you confirm them.</p>
      </form>
    </>
  );
}

type ProposePart = Extract<Part, { type: `tool-propose_${string}` }>;

/** A proposed change: the details, then Confirm / Cancel. Runs on the server with your access. */
function ActionCard({ part, actionable, threadId, onDone }: { part: ProposePart; actionable: boolean; threadId: string; onDone: (id: string, out: { ok: boolean; message: string; href?: string; declined?: boolean }) => void }) {
  const { companyById, loads, trucks, refresh } = useStore();
  const [running, setRunning] = useState(false);
  const title = ACTION[part.type] || "Change";
  if (part.state === "input-streaming") return <p className="text-xs text-fg-4">Preparing: {title.toLowerCase()}…</p>;
  if (part.state === "output-error") return <p className="text-xs text-red-500">Couldn&apos;t prepare it: {part.errorText}</p>;
  if (part.state === "output-available") {
    const o = part.output as { ok: boolean; message: string; href?: string; declined?: boolean };
    return (
      <div className={cn("rounded-xl border px-3 py-2 text-xs", o.ok ? "border-emerald-500/30 bg-emerald-500/5" : "border-line")}>
        <span className={cn("font-semibold", o.ok ? "text-emerald-700 dark:text-emerald-300" : o.declined ? "text-fg-3" : "text-red-600 dark:text-red-400")}>
          {o.ok ? <Check className="mr-1 inline h-3.5 w-3.5" /> : null}
          {o.message}
        </span>
        {o.href && (
          <Link href={o.href} className="ml-2 inline-flex items-center gap-0.5 font-semibold text-fg underline underline-offset-2">
            Open <ExternalLink className="h-3 w-3" />
          </Link>
        )}
      </div>
    );
  }
  if (part.state !== "input-available") return null;
  const input = part.input as Record<string, unknown>;
  const show = (k: string, v: unknown): string => {
    if (k === "company_id") return companyById(String(v))?.name || String(v);
    if (k === "load_id") {
      const l = loads.find((x) => x.id === v);
      return l ? `${l.load_number || "Load"} · ${l.origin_city} → ${l.destination_city}` : String(v);
    }
    if (k === "truck_id") return `Unit ${trucks.find((x) => x.id === v)?.unit_number ?? v}`;
    if (k === "value") return money(Number(v));
    if (v === null) return k === "available_date" ? "Ready now" : "(clear)";
    const text = String(v).replace(/_/g, " ");
    // An edit shows what it replaces.
    const before = part.type === "tool-propose_update_company" ? (companyById(String(input.company_id)) as unknown as Record<string, unknown> | undefined)?.[k] : undefined;
    return before != null && before !== "" && String(before) !== String(v) ? `${String(before).replace(/_/g, " ")} → ${text}` : text;
  };
  const confirm = async () => {
    setRunning(true);
    const res = await fetch("/api/copilot/act", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: part.type.slice("tool-propose_".length), input, threadId }) })
      .then((r) => r.json())
      .catch(() => ({ ok: false, message: "Couldn't reach TOSS Cloud." }));
    // The page's lists pick up what changed right away (companies, loads, trucks…).
    if (res.ok) await refresh().catch(() => {});
    setRunning(false);
    onDone(part.toolCallId, res);
  };
  return (
    <div className="space-y-2 rounded-xl border border-fg/80 px-3 py-3">
      <div className="text-[13px] font-semibold text-fg">{title}</div>
      <dl className="space-y-0.5 text-xs">
        {Object.entries(input)
          .filter(([, v]) => v !== undefined && v !== "")
          .map(([k, v]) => (
            <div key={k} className="flex gap-2">
              <dt className="w-28 shrink-0 text-fg-4">{FIELD[k] || k}</dt>
              <dd className="min-w-0 flex-1 whitespace-pre-wrap break-words text-fg">{show(k, v)}</dd>
            </div>
          ))}
      </dl>
      {actionable ? (
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={() => void confirm()} disabled={running} className="inline-flex items-center gap-1 rounded-full bg-brand px-3.5 py-1.5 text-xs font-semibold text-brand-fg hover:bg-brand-hover disabled:opacity-50">
            {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Confirm
          </button>
          <button type="button" onClick={() => onDone(part.toolCallId, { ok: false, declined: true, message: "Canceled." })} disabled={running} className="rounded-full border border-line px-3.5 py-1.5 text-xs font-semibold text-fg-2 hover:text-fg">
            Cancel
          </button>
        </div>
      ) : (
        <p className="text-[11px] text-fg-4">Not done.</p>
      )}
    </div>
  );
}

function Question({ part, said }: { part: Extract<Part, { type: "tool-suggest_replies" }>; said: string }) {
  if (part.state !== "input-available" && part.state !== "output-available") return null;
  const q = part.input.question?.trim();
  if (!q || said.includes(q)) return null;
  return <p className="font-medium text-fg">{q}</p>;
}

function suggested(m: Msg): string[] {
  for (let i = m.parts.length - 1; i >= 0; i--) {
    const p = m.parts[i];
    if (p.type === "tool-suggest_replies" && (p.state === "input-available" || p.state === "output-available")) return p.input.options;
  }
  return [];
}

function errorText(e: Error): string {
  try {
    const j = JSON.parse(e.message) as { error?: { message?: string } };
    if (j.error?.message) return j.error.message;
  } catch {}
  return e.message || "Something went wrong.";
}

function PartView({ part, user, live }: { part: Part; user: boolean; live: boolean }) {
  if (part.type === "text") return user ? <p className="whitespace-pre-wrap">{part.text}</p> : <Text text={part.text} />;
  if (part.type === "tool-navigate") {
    if (part.state === "input-available" || part.state === "output-available")
      return (
        <p className="text-xs text-fg-4">
          Opened{" "}
          <Link href={part.input.path} className="font-medium text-fg-2 underline underline-offset-2">
            {part.input.path.split("?")[0]}
          </Link>
        </p>
      );
    return null;
  }
  const label = RUNNING[part.type];
  if (label && "state" in part) {
    if (part.state === "output-error") return <p className="text-xs text-red-500">Couldn&apos;t finish {label[0].replace("…", "").toLowerCase()}</p>;
    if (part.state === "output-available") return <p className="text-xs text-fg-4">{label[1]}</p>;
    return live ? (
      <p className="inline-flex items-center gap-1.5 text-xs text-fg-4">
        <Loader2 className="h-3 w-3 animate-spin" /> {label[0]}
      </p>
    ) : null;
  }
  return null;
}

/** Copilot's answers: paragraphs, "- " lists, **bold**, [links](/path) and simple | tables |. */
function Text({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let bullets: string[] = [];
  let table: string[][] = [];
  const flush = () => {
    if (bullets.length) {
      blocks.push(
        <ul key={blocks.length} className="list-disc space-y-0.5 pl-5">
          {bullets.map((b, i) => (
            <li key={i}>{inline(b)}</li>
          ))}
        </ul>,
      );
      bullets = [];
    }
    if (table.length) {
      const [head, ...body] = table;
      blocks.push(
        <div key={blocks.length} className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full text-left text-xs">
            <thead className="bg-surface-2/60 text-fg-3">
              <tr>{head.map((h, i) => <th key={i} className="whitespace-nowrap px-2 py-1.5 font-semibold">{inline(h)}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-line">
              {body.map((r, i) => (
                <tr key={i}>{r.map((c, j) => <td key={j} className="whitespace-nowrap px-2 py-1.5 text-fg-2">{inline(c)}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      table = [];
    }
  };
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (/^\|.*\|$/.test(t)) {
      if (bullets.length) flush();
      if (/^\|[\s:|-]+\|$/.test(t)) continue;
      table.push(t.slice(1, -1).split("|").map((c) => c.trim()));
      continue;
    }
    if (table.length) flush();
    const b = /^[-*•]\s+(.*)$/.exec(t) || /^\d+[.)]\s+(.*)$/.exec(t);
    if (b) {
      bullets.push(b[1]);
      continue;
    }
    flush();
    if (t) blocks.push(<p key={blocks.length}>{inline(t.replace(/^#+\s*/, ""))}</p>);
  }
  flush();
  return <div className="space-y-2 leading-relaxed">{blocks}</div>;
}

function inline(s: string): ReactNode {
  return s.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g).map((seg, i) => {
    if (seg.startsWith("**") && seg.endsWith("**") && seg.length > 4)
      return (
        <strong key={i} className="font-semibold text-fg">
          {seg.slice(2, -2)}
        </strong>
      );
    const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(seg);
    if (link && link[2].startsWith("/"))
      return (
        <Link key={i} href={link[2]} className="font-medium text-fg underline underline-offset-2">
          {link[1]}
        </Link>
      );
    return <Fragment key={i}>{seg}</Fragment>;
  });
}
