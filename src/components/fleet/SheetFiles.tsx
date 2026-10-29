"use client";

import { FileText, Image as ImageIcon } from "lucide-react";
import { Eyebrow } from "@/components/ui/Bits";
import { errMsg, openDocument } from "@/lib/db";
import { useStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import { cn, fmtDay, today } from "@/lib/format";
import type { DeskBlock, DocumentItem } from "@/lib/types";

// The read-only side of a driver / truck / trailer panel: its files to open, and pinned notes to
// read. Uploading, replacing and editing happen after Edit.

const isPhoto = (d: DocumentItem) => d.doc_type.includes("photo") || (d.mime_type || "").startsWith("image/");

/** Files on a driver, truck or trailer: open one with a click. */
export function SheetFiles({ title, docs, empty }: { title: string; docs: DocumentItem[]; empty: string }) {
  const { docTypeName } = useStore();
  const t = today();
  const photos = docs.filter(isPhoto);
  const files = docs.filter((d) => !isPhoto(d)).sort((a, b) => docTypeName(a.doc_type).localeCompare(docTypeName(b.doc_type)));
  const open = (d: DocumentItem) => openDocument(d.file_path, d.file_name).catch((e) => toast.error(`Couldn't open the file: ${errMsg(e)}`));
  return (
    <section>
      <Eyebrow className="mb-2">
        {title} · {docs.length}
      </Eyebrow>
      {docs.length === 0 ? (
        <div className="rounded-xl border border-line px-3.5 py-3 text-[13px] text-fg-4">{empty}</div>
      ) : (
        <ul className="divide-y divide-line rounded-xl border border-line">
          {files.map((d) => {
            const expired = d.expires_on && d.expires_on < t;
            return (
              <li key={d.id}>
                <button type="button" onClick={() => open(d)} className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left hover:bg-surface-2/50">
                  <FileText className="h-4 w-4 shrink-0 text-fg-4" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-medium text-fg">{docTypeName(d.doc_type)}</div>
                    <div className="truncate text-xs text-fg-3">{d.file_name}</div>
                  </div>
                  {d.expires_on && <span className={cn("shrink-0 text-xs", expired ? "font-semibold text-red-600 dark:text-red-400" : "text-fg-3")}>{expired ? "Expired" : "Expires"} {fmtDay(d.expires_on)}</span>}
                </button>
              </li>
            );
          })}
          {photos.length > 0 && (
            <li className="flex flex-wrap items-center gap-1.5 px-3.5 py-2.5">
              <ImageIcon className="h-4 w-4 shrink-0 text-fg-4" />
              <span className="mr-1 text-[13px] text-fg-2">
                {photos.length} photo{photos.length === 1 ? "" : "s"}
              </span>
              {photos.map((d) => (
                <button key={d.id} type="button" onClick={() => open(d)} className="rounded-md bg-surface-2 px-2 py-0.5 text-xs text-fg-2 hover:bg-surface-3 hover:text-fg">
                  {docTypeName(d.doc_type).replace(/^(Truck|Trailer|Driver) photo[\s·:-]*/i, "") || "Photo"}
                </button>
              ))}
            </li>
          )}
        </ul>
      )}
    </section>
  );
}

/** Pinned notes, read only. */
export function SheetNotes({ blocks }: { blocks: DeskBlock[] }) {
  if (!blocks.length) return null;
  return (
    <section>
      <Eyebrow className="mb-2">Pinned notes</Eyebrow>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {blocks.map((b) => (
          <div key={b.id} className="rounded-xl border border-line bg-surface p-3">
            <div className="mb-1 text-[13px] font-semibold text-fg">{b.title}</div>
            {b.kind === "note" && <p className="whitespace-pre-wrap text-[13px] text-fg-2">{b.text || "—"}</p>}
            {b.kind === "checklist" && (
              <ul className="space-y-0.5 text-[13px]">
                {(b.items || []).map((i) => (
                  <li key={i.id} className={i.done ? "text-fg-4 line-through" : "text-fg-2"}>
                    {i.done ? "✓" : "○"} {i.text}
                  </li>
                ))}
              </ul>
            )}
            {b.kind === "specs" && (
              <dl className="space-y-0.5 text-[13px]">
                {(b.specs || [])
                  .filter((s) => s.label || s.value)
                  .map((s, i) => (
                    <div key={i} className="flex gap-2">
                      <dt className="text-fg-3">{s.label}</dt>
                      <dd className="font-medium text-fg">{s.value}</dd>
                    </div>
                  ))}
              </dl>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
