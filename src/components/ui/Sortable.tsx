"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, GripVertical } from "lucide-react";
import { errMsg, sb } from "@/lib/db";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/format";

// Reordering for any list: drag the handle (desktop) or tap the arrows (phone, keyboard). Rows are
// only draggable while the handle is held, so inputs inside a row still select text normally.

/** Rows in their saved order. */
export const bySort = <T extends { sort?: number | null }>(a: T, b: T) => (a.sort ?? 0) - (b.sort ?? 0);

/** Write the new positions of a table's rows (only the ones that moved) and show them at once. */
export async function saveOrder<T extends { id: string; sort?: number | null }>(table: string, ordered: T[], put: (r: T) => void) {
  const moved = ordered.map((r, i) => ({ r, i })).filter(({ r, i }) => r.sort !== i);
  for (const { r, i } of moved) put({ ...r, sort: i });
  const res = await Promise.all(moved.map(({ r, i }) => sb().from(table).update({ sort: i }).eq("id", r.id)));
  const bad = res.find((x) => x.error);
  if (bad?.error) toast.error(errMsg(bad.error));
}

/** Move one item in an array (returns a new array). */
export function moveItem<T>(list: T[], from: number, to: number) {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list;
  const next = [...list];
  const [x] = next.splice(from, 1);
  next.splice(to, 0, x);
  return next;
}

/**
 * Drag and arrow reordering for a list of keys. `rowProps(key)` goes on each row, `<SortHandle>`
 * inside it. `onReorder` gets the keys in their new order.
 */
export function useSortable(keys: string[], onReorder: (keys: string[]) => void) {
  const [armed, setArmed] = useState<string | null>(null);
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const move = (key: string, dir: -1 | 1) => {
    const i = keys.indexOf(key);
    const next = moveItem(keys, i, i + dir);
    if (next !== keys) onReorder(next);
  };
  const end = () => {
    setArmed(null);
    setDrag(null);
    setOver(null);
  };
  const rowProps = (key: string) => ({
    draggable: armed === key,
    onDragStart: (e: React.DragEvent) => {
      e.dataTransfer.effectAllowed = "move";
      setDrag(key);
    },
    onDragOver: (e: React.DragEvent) => {
      if (!drag) return;
      e.preventDefault();
      if (over !== key) setOver(key);
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      if (drag && drag !== key) onReorder(moveItem(keys, keys.indexOf(drag), keys.indexOf(key)));
      end();
    },
    onDragEnd: end,
    "data-dragging": drag === key || undefined,
    "data-over": (over === key && drag !== key) || undefined,
  });
  const handle = (key: string) => ({
    index: keys.indexOf(key),
    count: keys.length,
    onArm: () => setArmed(key),
    onDisarm: () => !drag && setArmed(null),
    onMove: (dir: -1 | 1) => move(key, dir),
  });
  return { rowProps, handle };
}

/** Row styling while dragging: the dragged row fades, the drop target gets a line on top. */
export const sortRow = "transition-opacity data-[dragging]:opacity-40 data-[over]:shadow-[inset_0_2px_0_0_var(--brand)]";

export function SortHandle({ index, count, onArm, onDisarm, onMove, className }: ReturnType<ReturnType<typeof useSortable>["handle"]> & { className?: string }) {
  return (
    <div className={cn("flex shrink-0 items-center", className)}>
      <span onMouseDown={onArm} onMouseUp={onDisarm} className="hidden cursor-grab touch-none p-0.5 text-fg-4 hover:text-fg active:cursor-grabbing sm:block" aria-hidden>
        <GripVertical className="h-4 w-4" />
      </span>
      <div className="flex flex-col">
        <button type="button" onClick={() => onMove(-1)} disabled={index <= 0} className="rounded px-0.5 text-fg-4 hover:text-fg disabled:opacity-25" aria-label="Move up">
          <ArrowUp className="h-3 w-3" />
        </button>
        <button type="button" onClick={() => onMove(1)} disabled={index >= count - 1} className="rounded px-0.5 text-fg-4 hover:text-fg disabled:opacity-25" aria-label="Move down">
          <ArrowDown className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}
