"use client";

// TOSS Copilot panel: opened from the top bar on every page (or Ctrl+J). It knows the page you're
// on and the company in focus, reads the team's data with its tools, opens pages, and proposes
// actions as confirm cards that run only when you click Confirm. Chats are private to each person
// (tms_copilot_threads). Plain text, hairlines and pill buttons, like the rest of TOSS Cloud.

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowUp, Check, ExternalLink, History, Loader2, Plus, Square, Trash2, X } from "lucide-react";
import { sb } from "@/lib/db";
import { useStore } from "@/lib/store";
import { cn, fmtDay, money } from "@/lib/format";
import type { CopilotUITools } from "@/lib/copilot/tools";

type Msg = UIMessage<unknown, never, CopilotUITools>;
type Part = Msg["parts"][number];

const SEND_LAST = 40;
const STORE_LAST = 100;

const STARTERS = [
  "What needs my attention today?",
  "Which invoices are overdue?",
  "Show the loads in transit",
  "Paperwork expired or expiring this month",
  "Find new carriers in Texas with 2–10 trucks in Lead Hunter",
  "How did dispatch do this month?",
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
  truck_id: "Truck", current_location: "Location", available_date: "Available from",
};

type Thread = { id: string; title: string; updated_at: string };

/** The whole panel: picks the chat (latest on open, new, or one from history) and stores it. */
export function CopilotPanel({ onClose }: { onClose: () => void }) {
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
        setChat({ id: latest.id, messages: ((t?.messages as Msg[]) || []) });
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
    <div className="flex h-full flex-col bg-surface">
      <div className="flex items-center gap-2 border-b border-line px-4 py-3">
        <span className="flex-1 text-[15px] font-bold tracking-[-0.02em] text-fg">TOSS Copilot</span>
        <button type="button" onClick={() => setShowChats((v) => !v)} aria-pressed={showChats} className={pill} title="Earlier chats">
          <History className="h-3.5 w-3.5" /> {showChats ? "Back" : "Chats"}
        </button>
        <button type="button" onClick={newChat} className={pill}>
          <Plus className="h-3.5 w-3.5" /> New
        </button>
        <button type="button" onClick={onClose} aria-label="Close TOSS Copilot" className="rounded-lg p-1.5 text-fg-3 hover:bg-surface-2 hover:text-fg">
          <X className="h-4 w-4" />
        </button>
      </div>
      {showChats ? (
        <div className="flex-1 overflow-y-auto p-2">
          {threads.length === 0 && <p className="px-2 py-3 text-sm text-fg-4">No earlier chats.</p>}
          {threads.map((t) => (
            <div key={t.id} className={cn("group flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-surface-2", chat?.id === t.id && "bg-surface-2")}>
              <button type="button" onClick={() => void openThread(t)} className="min-w-0 flex-1 text-left">
                <div className="truncate text-[13px] font-medium text-fg">{t.title}</div>
                <div className="text-[11px] text-fg-4">{fmtDay(t.updated_at.slice(0, 10))}</div>
              </button>
              <button type="button" onClick={() => void removeThread(t)} aria-label={`Delete chat ${t.title}`} className="rounded p-1 text-fg-4 opacity-0 hover:text-red-500 group-hover:opacity-100">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      ) : chat ? (
        <Chat key={chat.id} id={chat.id} initial={chat.messages} onPersist={persist} />
      ) : (
        <div className="flex flex-1 items-center justify-center text-fg-4">
          <Loader2 className="h-4 w-4 animate-spin" />
        </div>
      )}
    </div>
  );
}

const pill = "inline-flex items-center gap-1 rounded-full border border-line px-2.5 py-1 text-xs font-semibold text-fg-2 hover:border-line-strong hover:text-fg";

function firstUserText(messages: Msg[]): string {
  for (const m of messages) if (m.role === "user") for (const p of m.parts) if (p.type === "text" && p.text.trim()) return p.text.trim().replace(/\s+/g, " ");
  return "";
}

/** One conversation (remounted when another chat opens). */
function Chat({ id, initial, onPersist }: { id: string; initial: Msg[]; onPersist: (id: string, m: Msg[]) => void }) {
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

  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, status]);

  const last = messages[messages.length - 1];
  const replies = !busy && last?.role === "assistant" ? suggested(last) : [];
  const [oldCards] = useState(() => new Set(initial.flatMap((m) => m.parts.filter((p) => p.type.startsWith("tool-propose_") && "toolCallId" in p).map((p) => (p as { toolCallId: string }).toolCallId))));

  return (
    <>
      <div ref={scroller} className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {messages.length === 0 && (
          <div className="space-y-3">
            <p className="text-[13px] leading-relaxed text-fg-2">Ask about any company, load, driver, truck, invoice, case or deal, search Lead Hunter, or tell me what to do.</p>
            <div className="flex flex-col items-start gap-1.5">
              {STARTERS.map((s) => (
                <button key={s} type="button" onClick={() => send(s)} className="rounded-full border border-line px-3 py-1 text-left text-xs font-medium text-fg-2 hover:border-line-strong hover:text-fg">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m) => (
          <div key={m.id} className={m.role === "user" ? "ml-8 rounded-xl bg-surface-2 px-3 py-2 text-[13px] text-fg" : "space-y-2 text-[13px] text-fg-2"}>
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
          <p className="inline-flex items-center gap-1.5 text-xs text-fg-4">
            <Loader2 className="h-3 w-3 animate-spin" /> Working…
          </p>
        )}
        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-[13px] text-red-700 dark:text-red-300">
            {errorText(error)}
            <button type="button" onClick={() => void regenerate({ body })} className="ml-2 font-semibold underline underline-offset-2">
              Try again
            </button>
          </div>
        )}
        {replies.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {replies.map((r) => (
              <button key={r} type="button" onClick={() => send(r)} className="rounded-full border border-fg px-3 py-1 text-xs font-semibold text-fg hover:bg-fg hover:text-bg">
                {r}
              </button>
            ))}
          </div>
        )}
      </div>

      <form
        className="border-t border-line p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <div className="flex items-end gap-2 rounded-xl border border-line-strong bg-surface px-2 py-1.5 focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/25">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send(input);
              }
            }}
            rows={2}
            maxLength={4000}
            autoFocus
            placeholder={companyId ? "Ask about this company, or anything…" : "Ask anything, or tell me what to do…"}
            className="min-h-[2.5rem] flex-1 resize-none bg-transparent px-1 py-1 text-base text-fg outline-none placeholder:text-fg-4 md:text-[13px]"
          />
          {busy ? (
            <button type="button" onClick={() => stop()} aria-label="Stop" className="mb-0.5 rounded-lg border border-line p-2 text-fg hover:bg-surface-2">
              <Square className="h-3.5 w-3.5" />
            </button>
          ) : (
            <button type="submit" disabled={!input.trim()} aria-label="Send" className="mb-0.5 rounded-lg bg-brand p-2 text-brand-fg hover:bg-brand-hover disabled:opacity-40">
              <ArrowUp className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <p className="mt-1.5 px-1 text-[10px] text-fg-4">Changes run only after you click Confirm.</p>
      </form>
    </>
  );
}

type ProposePart = Extract<Part, { type: `tool-propose_${string}` }>;

/** A proposed change: the details, then Confirm / Cancel. Runs on the server with your access. */
function ActionCard({ part, actionable, threadId, onDone }: { part: ProposePart; actionable: boolean; threadId: string; onDone: (id: string, out: { ok: boolean; message: string; href?: string; declined?: boolean }) => void }) {
  const { companyById, loads, trucks } = useStore();
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
    if (v === null) return "Ready now";
    return String(v).replace(/_/g, " ");
  };
  const confirm = async () => {
    setRunning(true);
    const res = await fetch("/api/copilot/act", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: part.type.slice("tool-propose_".length), input, threadId }) })
      .then((r) => r.json())
      .catch(() => ({ ok: false, message: "Couldn't reach TOSS Cloud." }));
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
