"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { SortHandle, sortRow, useSortable } from "@/components/ui/Sortable";

/**
 * The choices of a dropdown field: add (Enter or paste several, comma separated), rename in place,
 * remove and reorder.
 */
export function ChoicesEditor({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [text, setText] = useState("");
  // Keys are the positions, so a renamed choice keeps its row.
  const keys = value.map((_, i) => String(i));
  const sort = useSortable(keys, (next) => onChange(next.map((k) => value[Number(k)])));
  const add = () => {
    const extra = text
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s && !value.some((v) => v.toLowerCase() === s.toLowerCase()));
    if (extra.length) onChange([...value, ...extra]);
    setText("");
  };
  return (
    <div className="space-y-1.5">
      {value.length > 0 && (
        <ul className="divide-y divide-line rounded-lg border border-line">
          {value.map((c, i) => (
            <li key={`${i}-${c}`} {...sort.rowProps(String(i))} className={`flex items-center gap-1.5 px-1.5 py-1 ${sortRow}`}>
              <SortHandle {...sort.handle(String(i))} />
              <input
                defaultValue={c}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (!v) e.target.value = c;
                  else if (v !== c) onChange(value.map((x, j) => (j === i ? v : x)));
                }}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), (e.target as HTMLInputElement).blur())}
                className="min-w-0 flex-1 rounded bg-transparent px-1.5 py-1 text-[13px] text-fg hover:bg-surface-2 focus:bg-surface-2 focus:outline-none"
                aria-label={`Choice ${i + 1}`}
              />
              <button type="button" onClick={() => onChange(value.filter((_, j) => j !== i))} className="rounded p-1 text-fg-4 hover:text-red-600" aria-label={`Remove ${c}`}>
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <Input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add())} placeholder={value.length ? "Add a choice" : "e.g. Office, Field, Remote"} />
        <Button variant="outline" onClick={add} disabled={!text.trim()}>
          <Plus className="h-4 w-4" /> Add
        </Button>
      </div>
    </div>
  );
}
