"use client";

import { useEffect, useState } from "react";
import { ArrowRight, FileText, MessageSquare, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Field";
import { errMsg, sb } from "@/lib/db";
import { useStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import { STATUS, fmtDateTime, relTime } from "@/lib/format";
import type { LoadEvent } from "@/lib/types";

/** Load history (created, status changes, uploads) plus team notes. */
export function Activity({ loadId }: { loadId: string }) {
  const { me } = useStore();
  const [events, setEvents] = useState<LoadEvent[]>([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    sb()
      .from("tms_load_events")
      .select("*")
      .eq("load_id", loadId)
      .order("created_at", { ascending: false })
      .then(({ data }) => alive && setEvents((data || []) as LoadEvent[]));
    const ch = sb()
      .channel(`load-events-${loadId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tms_load_events", filter: `load_id=eq.${loadId}` }, (p) => {
        if (p.eventType === "DELETE") setEvents((l) => l.filter((e) => e.id !== (p.old as LoadEvent).id));
        else setEvents((l) => [p.new as LoadEvent, ...l.filter((e) => e.id !== (p.new as LoadEvent).id)]);
      })
      .subscribe();
    return () => {
      alive = false;
      sb().removeChannel(ch);
    };
  }, [loadId]);

  const add = async () => {
    if (!note.trim()) return;
    setBusy(true);
    const { data, error } = await sb().from("tms_load_events").insert({ load_id: loadId, kind: "note", message: note.trim() }).select().single();
    setBusy(false);
    if (error) return toast.error(errMsg(error));
    setEvents((l) => [data as LoadEvent, ...l.filter((e) => e.id !== data.id)]);
    setNote("");
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          placeholder="Add a note: check call, delay, detention, broker update…"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) add();
          }}
        />
        <div className="flex justify-end">
          <Button size="sm" variant="secondary" onClick={add} loading={busy} disabled={!note.trim()}>
            <Plus className="h-3.5 w-3.5" /> Add note
          </Button>
        </div>
      </div>
      <ol className="relative space-y-4 border-l border-line pl-5">
        {events.map((e) => (
          <li key={e.id} className="group relative">
            <span className="absolute -left-[27px] top-0.5 flex h-[14px] w-[14px] items-center justify-center rounded-full border border-line bg-surface">
              <span className={`h-1.5 w-1.5 rounded-full ${e.to_status ? STATUS[e.to_status].dot : "bg-fg-4"}`} />
            </span>
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                {e.kind === "note" ? (
                  <div className="flex gap-2">
                    <MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0 text-fg-4" />
                    <p className="whitespace-pre-wrap text-[13px] text-fg">{e.message}</p>
                  </div>
                ) : e.kind === "status" && e.to_status ? (
                  <p className="flex flex-wrap items-center gap-1.5 text-[13px] text-fg-2">
                    {e.from_status && <span>{STATUS[e.from_status]?.label}</span>}
                    <ArrowRight className="h-3 w-3 text-fg-4" />
                    <span className="font-semibold text-fg">{STATUS[e.to_status]?.label}</span>
                  </p>
                ) : e.kind === "document" ? (
                  <p className="flex items-center gap-1.5 text-[13px] text-fg-2">
                    <FileText className="h-3.5 w-3.5 text-fg-4" /> {e.message}
                  </p>
                ) : (
                  <p className="text-[13px] text-fg-2">{e.message}</p>
                )}
                <div className="mt-0.5 text-[11px] text-fg-4" title={fmtDateTime(e.created_at)}>
                  {e.actor_name || "Someone"} · {relTime(e.created_at)}
                </div>
              </div>
              {e.kind === "note" && e.actor_id === me.id && (
                <button
                  onClick={async () => {
                    const { error } = await sb().from("tms_load_events").delete().eq("id", e.id);
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
        ))}
        {events.length === 0 && <li className="text-[13px] text-fg-4">No activity yet.</li>}
      </ol>
    </div>
  );
}
