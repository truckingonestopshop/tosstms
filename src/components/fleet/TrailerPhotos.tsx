"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Camera, CheckCircle2, ChevronLeft, ChevronRight, ImageOff, Loader2, X } from "lucide-react";
import { Progress, stagger } from "@/components/ui/Motion";
import { confirmDialog } from "@/components/ui/Confirm";
import { useStore } from "@/lib/store";
import { signedUrls } from "@/lib/db";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/format";
import { compressImage, photoSlotsFor, type PhotoSlot } from "@/lib/trailerPhotos";

/** A photo picked before the trailer exists (new trailer form); uploaded on save. */
export interface PendingPhoto {
  id: string;
  slot: string;
  file: File;
  url: string;
}

type Shot = { id: string; slot: string; src: string | null; name: string; pending?: boolean; docId?: string };

/**
 * Photo slots for a trailer (side views, rear, interior, plate, and for reefers the unit
 * and air chute). With `trailerId` photos upload right away; without, they are kept in
 * `pending` until the trailer is saved.
 */
export function TrailerPhotos({
  trailerId,
  companyId,
  trailerType,
  pending = [],
  onPending,
  compact,
}: {
  trailerId?: string | null;
  companyId: string;
  trailerType: string | null | undefined;
  pending?: PendingPhoto[];
  onPending?: (p: PendingPhoto[]) => void;
  compact?: boolean;
}) {
  const { documents, uploadDocument, deleteDocument } = useStore();
  const slots = photoSlotsFor(trailerType);
  const saved = useMemo(() => (trailerId ? documents.filter((d) => d.trailer_id === trailerId && d.doc_type.startsWith("trailer_photo_")) : []), [documents, trailerId]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [view, setView] = useState<{ list: Shot[]; i: number } | null>(null);

  // Signed links for saved photos (refreshed when the set of files changes).
  const pathsKey = saved.map((d) => d.file_path).join("|");
  useEffect(() => {
    let alive = true;
    const paths = pathsKey ? pathsKey.split("|") : [];
    signedUrls(paths).then((u) => alive && setUrls(u));
    return () => {
      alive = false;
    };
  }, [pathsKey]);

  const shotsFor = (slot: string): Shot[] => [
    ...saved.filter((d) => d.doc_type === slot).map((d) => ({ id: d.id, docId: d.id, slot, src: urls[d.file_path] ?? null, name: d.file_name })),
    ...pending.filter((p) => p.slot === slot).map((p) => ({ id: p.id, slot, src: p.url, name: p.file.name, pending: true })),
  ];
  const filled = slots.filter((s) => shotsFor(s.key).length > 0).length;

  const add = async (slot: PhotoSlot, files: FileList) => {
    const list = Array.from(files).filter((f) => f.type.startsWith("image/") || /\.(heic|heif)$/i.test(f.name));
    if (!list.length) return toast.error("Choose a photo (JPG, PNG, HEIC).");
    const picked = slot.many ? list : list.slice(0, 1);
    setBusy(slot.key);
    const ready = await Promise.all(picked.map((f) => compressImage(f)));
    if (!trailerId) {
      // New trailer: keep them until it's saved.
      const next = ready.map((file) => ({ id: crypto.randomUUID(), slot: slot.key, file, url: URL.createObjectURL(file) }));
      onPending?.([...(slot.many ? pending : pending.filter((p) => p.slot !== slot.key)), ...next]);
      setBusy(null);
      return;
    }
    // Single-photo slots keep one picture: the old one is replaced.
    const old = slot.many ? [] : saved.filter((d) => d.doc_type === slot.key);
    let ok = 0;
    for (const file of ready) if (await uploadDocument(file, { company_id: companyId, trailer_id: trailerId, doc_type: slot.key })) ok++;
    for (const d of old) await deleteDocument(d.id);
    setBusy(null);
    if (ok) toast.success(ok === 1 ? `${slot.title} added` : `${ok} photos added`);
  };

  const remove = async (shot: Shot) => {
    if (shot.pending) {
      const p = pending.find((x) => x.id === shot.id);
      if (p) URL.revokeObjectURL(p.url);
      onPending?.(pending.filter((x) => x.id !== shot.id));
      return;
    }
    if (shot.docId && (await confirmDialog({ title: "Delete this photo?", body: shot.name, confirmLabel: "Delete", danger: true })))
      if (await deleteDocument(shot.docId)) toast.success("Photo deleted");
  };

  const all = slots.flatMap((s) => shotsFor(s.key));

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-fg-3">Trailer photos</span>
        <span className={cn("tnum text-xs font-semibold", filled === slots.length ? "text-emerald-700 dark:text-emerald-300" : "text-fg-4")}>
          {filled}/{slots.length}
        </span>
        <Progress value={(filled / slots.length) * 100} className="h-1 flex-1" tone={filled === slots.length ? "bg-emerald-500" : "bg-brand"} />
      </div>
      <div className={cn("grid grid-cols-1 gap-2.5", compact ? "sm:grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-3")}>
        {slots.map((slot, i) => (
          <Slot
            key={slot.key}
            i={i}
            n={PHOTO_INDEX[slot.key]}
            slot={slot}
            shots={shotsFor(slot.key)}
            busy={busy === slot.key}
            onAdd={(files) => add(slot, files)}
            onRemove={remove}
            onView={(shot) => setView({ list: all, i: Math.max(0, all.findIndex((s) => s.id === shot.id)) })}
          />
        ))}
      </div>
      {view && <Viewer list={view.list} start={view.i} onClose={() => setView(null)} />}
    </div>
  );
}

/** The numbering the team uses (1–6), kept when reefer slots are hidden. */
const PHOTO_INDEX: Record<string, number> = {
  trailer_photo_side: 1,
  trailer_photo_reefer_unit: 2,
  trailer_photo_interior: 3,
  trailer_photo_rear: 4,
  trailer_photo_air_chute: 5,
  trailer_photo_plate: 6,
};

function Slot({
  i,
  n,
  slot,
  shots,
  busy,
  onAdd,
  onRemove,
  onView,
}: {
  i: number;
  n: number;
  slot: PhotoSlot;
  shots: Shot[];
  busy: boolean;
  onAdd: (f: FileList) => void;
  onRemove: (s: Shot) => void;
  onView: (s: Shot) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const done = shots.length > 0;
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        if (e.dataTransfer.files?.length) onAdd(e.dataTransfer.files);
      }}
      className={cn(
        "animate-rise rounded-xl border bg-surface p-3 transition-colors",
        drag ? "border-brand bg-brand/5" : done ? "border-line" : "border-dashed border-line-strong",
      )}
      style={stagger(i, 35)}
    >
      <div className="flex items-start gap-2">
        <span className={cn("mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold", done ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "bg-surface-2 text-fg-3")}>
          {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : n}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold text-fg">{slot.title}</div>
          <div className="text-[11px] leading-snug text-fg-4">{slot.hint}</div>
        </div>
      </div>
      <div className="mt-2.5 flex flex-wrap gap-2">
        {shots.map((s) => (
          <div key={s.id} className="group relative h-16 w-20 overflow-hidden rounded-lg border border-line bg-surface-2">
            <button type="button" onClick={() => onView(s)} className="h-full w-full" aria-label={`View ${s.name}`}>
              {s.src ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={s.src} alt={slot.title} className="animate-fade h-full w-full object-cover" />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-fg-4">
                  <ImageOff className="h-4 w-4" />
                </span>
              )}
            </button>
            {s.pending && <span className="absolute bottom-0.5 left-0.5 rounded bg-black/60 px-1 text-[9px] font-semibold text-white">new</span>}
            <button
              type="button"
              onClick={() => onRemove(s)}
              className="absolute right-0.5 top-0.5 rounded-full bg-black/60 p-0.5 text-white opacity-0 transition-opacity focus:opacity-100 group-hover:opacity-100 max-md:opacity-100"
              aria-label="Remove photo"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
        {(slot.many || !done) && (
          <button
            type="button"
            onClick={() => input.current?.click()}
            disabled={busy}
            className="flex h-16 w-20 flex-col items-center justify-center gap-0.5 rounded-lg border border-dashed border-line-strong text-fg-3 transition-colors hover:border-brand hover:text-fg disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
            <span className="text-[10px] font-medium">{busy ? "Saving" : done ? "Add more" : "Add photo"}</span>
          </button>
        )}
        {!slot.many && done && (
          <button type="button" onClick={() => input.current?.click()} disabled={busy} className="self-end text-[11px] font-medium text-fg-3 underline-offset-2 hover:text-fg hover:underline">
            Replace
          </button>
        )}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/*,.heic,.heif"
        multiple={slot.many}
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) onAdd(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}

/** Full-screen photo viewer: arrows / swipe-free buttons, Esc to close. */
function Viewer({ list, start, onClose }: { list: Shot[]; start: number; onClose: () => void }) {
  const [i, setI] = useState(start);
  const shot = list[i];
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") setI((x) => Math.min(list.length - 1, x + 1));
      if (e.key === "ArrowLeft") setI((x) => Math.max(0, x - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [list.length, onClose]);
  if (!shot) return null;
  return createPortal(
    <div className="animate-fade fixed inset-0 z-[90] flex flex-col bg-black/90" role="dialog" aria-modal aria-label="Photo" onClick={onClose}>
      <div className="flex items-center justify-between px-4 py-3 text-sm text-white/80">
        <span className="truncate">
          {i + 1} / {list.length} · {shot.name}
        </span>
        <button onClick={onClose} className="rounded-md p-1.5 hover:bg-white/10" aria-label="Close">
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-12 pb-6" onClick={(e) => e.stopPropagation()}>
        {shot.src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={shot.id} src={shot.src} alt={shot.name} className="animate-pop max-h-full max-w-full rounded-lg object-contain" />
        ) : (
          <span className="text-white/60">Photo unavailable</span>
        )}
        {i > 0 && (
          <button onClick={() => setI(i - 1)} className="absolute left-2 rounded-full bg-white/10 p-2 text-white hover:bg-white/20" aria-label="Previous photo">
            <ChevronLeft className="h-5 w-5" />
          </button>
        )}
        {i < list.length - 1 && (
          <button onClick={() => setI(i + 1)} className="absolute right-2 rounded-full bg-white/10 p-2 text-white hover:bg-white/20" aria-label="Next photo">
            <ChevronRight className="h-5 w-5" />
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
}
