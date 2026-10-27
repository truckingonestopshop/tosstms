"use client";

import { useEffect, useRef, useState } from "react";
import { FileImage, FileText, Layers, MessageSquare, Paperclip, Plus, RefreshCw, ScrollText, ShieldCheck, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Bits";
import { Textarea } from "@/components/ui/Field";
import { errMsg, openDocument, sb } from "@/lib/db";
import { useStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import { cn, fileSize, fmtDateTime, relTime } from "@/lib/format";
import type { CompanyEvent } from "@/lib/types";

// Carrier timeline (Profile): automatic history (created, files, services, statuses) plus team
// notes with attached files, newest first, live. A summary of it on request.

const ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp,.heic,.heif,.gif,.doc,.docx,.xls,.xlsx,.csv,.txt";
const isImage = (name: string, mime?: string | null) => (mime || "").startsWith("image/") || /\.(png|jpe?g|webp|gif|heic|heif)$/i.test(name);

const ICON: Record<CompanyEvent["kind"], typeof FileText> = {
  created: Plus,
  note: MessageSquare,
  document: FileText,
  service: Layers,
  status: ShieldCheck,
  update: RefreshCw,
};

export function CompanyTimeline({ companyId }: { companyId: string }) {
  const { me, uploadDocument } = useStore();
  const [events, setEvents] = useState<CompanyEvent[]>([]);
  const [note, setNote] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const [summary, setSummary] = useState<{ summary: string; points: string[] } | null>(null);
  const [summing, setSumming] = useState(false);

  useEffect(() => {
    let alive = true;
    sb()
      .from("tms_company_events")
      .select("*")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(300)
      .then(({ data }) => alive && setEvents((data || []) as CompanyEvent[]));
    const ch = sb()
      .channel(`company-events-${companyId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tms_company_events", filter: `company_id=eq.${companyId}` }, (p) => {
        if (p.eventType === "DELETE") setEvents((l) => l.filter((e) => e.id !== (p.old as CompanyEvent).id));
        else setEvents((l) => [p.new as CompanyEvent, ...l.filter((e) => e.id !== (p.new as CompanyEvent).id)]);
      })
      .subscribe();
    return () => {
      alive = false;
      sb().removeChannel(ch);
    };
  }, [companyId]);

  const addFiles = (list: FileList | File[] | null) => {
    const arr = Array.from(list || []).filter((f) => f.size <= 25 * 1024 * 1024);
    if (arr.length) setFiles((l) => [...l, ...arr]);
  };

  const add = async () => {
    if (!note.trim() && !files.length) return;
    setBusy(true);
    const attachments: CompanyEvent["attachments"] = [];
    for (const f of files) {
      const d = await uploadDocument(f, { company_id: companyId, doc_type: "other", notes: "Timeline note attachment" });
      if (d) attachments.push({ id: d.id, name: d.file_name, path: d.file_path, mime: d.mime_type });
    }
    if (files.length && !attachments.length && !note.trim()) {
      setBusy(false);
      return;
    }
    const { data, error } = await sb()
      .from("tms_company_events")
      .insert({ company_id: companyId, kind: "note", message: note.trim() || null, attachments })
      .select()
      .single();
    setBusy(false);
    if (error) return toast.error(errMsg(error));
    setEvents((l) => [data as CompanyEvent, ...l.filter((e) => e.id !== data.id)]);
    setNote("");
    setFiles([]);
  };

  const summarize = async () => {
    setSumming(true);
    try {
      const r = await fetch(`/api/companies/${companyId}/summary`, { method: "POST" });
      const j = (await r.json().catch(() => ({}))) as { summary?: string; points?: string[]; error?: string };
      if (!r.ok || !j.summary) throw new Error(j.error || "The summary couldn't be written.");
      setSummary({ summary: j.summary, points: j.points ?? [] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSumming(false);
    }
  };

  const open = (a: CompanyEvent["attachments"][number]) => openDocument(a.path, a.name).catch((e) => toast.error(`Couldn't open the file: ${errMsg(e)}`));

  return (
    <Card>
      <CardHeader
        title="Timeline"
        subtitle="Everything on this account, newest first"
        actions={
          <Button variant="secondary" size="sm" onClick={summarize} loading={summing} disabled={!events.length}>
            {!summing && <ScrollText className="h-3.5 w-3.5" />} Summary
          </Button>
        }
      />
      <div className="space-y-5 p-4 sm:p-5">
        {summary && (
          <div className="rounded-xl border border-line bg-surface-2/40 p-3 sm:p-4">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-fg-4">Summary</span>
              <button type="button" onClick={() => setSummary(null)} className="rounded p-0.5 text-fg-4 hover:text-fg" aria-label="Close summary">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <p className="text-[13px] leading-relaxed text-fg">{summary.summary}</p>
            {summary.points.length > 0 && (
              <ul className="mt-2 list-disc space-y-0.5 pl-5 text-[13px] text-fg-2">
                {summary.points.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            addFiles(e.dataTransfer.files);
          }}
          className={cn("space-y-2 rounded-xl border border-dashed p-2 transition-colors", drag ? "border-brand bg-brand/5" : "border-transparent")}
        >
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="Add a note: call with the owner, document sent, case update… Drop or paste files here."
            onPaste={(e) => {
              const pasted = Array.from(e.clipboardData.files);
              if (pasted.length) {
                e.preventDefault();
                addFiles(pasted);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) add();
            }}
          />
          {files.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {files.map((f, i) => (
                <span key={`${f.name}-${i}`} className="inline-flex max-w-full items-center gap-1 rounded-full border border-line px-2.5 py-1 text-xs text-fg-2">
                  {isImage(f.name, f.type) ? <FileImage className="h-3.5 w-3.5 text-fg-4" /> : <FileText className="h-3.5 w-3.5 text-fg-4" />}
                  <span className="truncate">{f.name}</span>
                  <span className="text-fg-4">{fileSize(f.size)}</span>
                  <button type="button" onClick={() => setFiles((l) => l.filter((_, j) => j !== i))} className="text-fg-4 hover:text-fg" aria-label={`Remove ${f.name}`}>
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="flex items-center justify-between gap-2">
            <Button size="sm" variant="ghost" onClick={() => input.current?.click()}>
              <Paperclip className="h-3.5 w-3.5" /> Attach files
            </Button>
            <Button size="sm" variant="secondary" onClick={add} loading={busy} disabled={!note.trim() && !files.length}>
              <Plus className="h-3.5 w-3.5" /> Add note
            </Button>
          </div>
          <input
            ref={input}
            type="file"
            multiple
            accept={ACCEPT}
            className="hidden"
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>

        <ol className="relative space-y-4 border-l border-line pl-5">
          {events.map((e) => {
            const Icon = ICON[e.kind] ?? MessageSquare;
            return (
              <li key={e.id} className="group relative">
                <span className="absolute -left-[27px] top-0.5 flex h-[14px] w-[14px] items-center justify-center rounded-full border border-line bg-surface">
                  <span className={cn("h-1.5 w-1.5 rounded-full", e.kind === "note" ? "bg-fg-2" : "bg-fg-4")} />
                </span>
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex gap-2">
                      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-fg-4" />
                      {e.message && <p className={cn("whitespace-pre-wrap text-[13px]", e.kind === "note" ? "text-fg" : "text-fg-2")}>{e.message}</p>}
                    </div>
                    {e.attachments?.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1.5 pl-5">
                        {e.attachments.map((a) => (
                          <button
                            key={a.id}
                            type="button"
                            onClick={() => open(a)}
                            className="inline-flex max-w-full items-center gap-1 rounded-full border border-line px-2.5 py-1 text-xs text-fg-2 hover:border-line-strong hover:text-fg"
                          >
                            {isImage(a.name, a.mime) ? <FileImage className="h-3.5 w-3.5 text-fg-4" /> : <FileText className="h-3.5 w-3.5 text-fg-4" />}
                            <span className="truncate">{a.name}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    <div className="mt-0.5 pl-5 text-[11px] text-fg-4" title={fmtDateTime(e.created_at)}>
                      {e.actor_name || "System"} · {relTime(e.created_at)}
                    </div>
                  </div>
                  {e.kind === "note" && e.actor_id === me.id && (
                    <button
                      onClick={async () => {
                        const { error } = await sb().from("tms_company_events").delete().eq("id", e.id);
                        if (error) return toast.error(errMsg(error));
                        setEvents((l) => l.filter((x) => x.id !== e.id));
                      }}
                      className="rounded p-1 text-fg-4 opacity-0 hover:text-red-500 group-hover:opacity-100"
                      aria-label="Delete note"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </li>
            );
          })}
          {events.length === 0 && <li className="text-[13px] text-fg-4">Nothing yet.</li>}
        </ol>
      </div>
    </Card>
  );
}
