"use client";

import { useEffect, useRef, useState } from "react";
import { MapPin } from "lucide-react";
import { Input } from "@/components/ui/Field";
import { cn } from "@/lib/format";

/**
 * City / ZIP field with suggestions as you type ("chic" → Chicago, IL). Anything typed
 * still works without picking a suggestion.
 */
export function PlaceInput({
  value,
  onChange,
  onPick,
  placeholder,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  /** a suggestion was chosen (default: it becomes the value) */
  onPick?: (place: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const [list, setList] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [i, setI] = useState(0);
  const typed = useRef(false);
  const box = useRef<HTMLDivElement>(null);

  // Ask only for what the person typed (not when a value is set from outside), after a short pause.
  useEffect(() => {
    if (!typed.current) return;
    const q = value.trim();
    if (q.length < 2) return;
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/places?q=${encodeURIComponent(q)}`, { signal: ctl.signal });
        if (!res.ok) return;
        const data = (await res.json()) as { places?: string[] };
        const places = (data.places || []).filter((p) => p.toLowerCase() !== q.toLowerCase());
        setList(places);
        setI(0);
        setOpen(places.length > 0);
      } catch {
        /* typing on; the next request will try again */
      }
    }, 250);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [value]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const pick = (p: string) => {
    typed.current = false;
    if (onPick) onPick(p);
    else onChange(p);
    setOpen(false);
    setList([]);
  };

  return (
    <div ref={box} className={cn("relative", className)}>
      <Input
        value={value}
        onChange={(e) => {
          typed.current = true;
          onChange(e.target.value);
        }}
        onFocus={() => list.length > 0 && setOpen(true)}
        onKeyDown={(e) => {
          if (!open || !list.length) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setI((x) => Math.min(list.length - 1, x + 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setI((x) => Math.max(0, x - 1));
          } else if (e.key === "Enter") {
            e.preventDefault();
            pick(list[i]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
      />
      {open && list.length > 0 && value.trim().length >= 2 && (
        <ul role="listbox" className="animate-pop absolute left-0 top-full z-50 mt-1 w-max min-w-full max-w-[320px] overflow-hidden rounded-lg border border-line bg-surface p-1 shadow-pop">
          {list.map((p, k) => (
            <li key={p} role="option" aria-selected={k === i}>
              <button
                type="button"
                onMouseEnter={() => setI(k)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(p)}
                className={cn("flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] text-fg", k === i && "bg-surface-2")}
              >
                <MapPin className="h-3.5 w-3.5 shrink-0 text-fg-4" />
                <span className="truncate">{p}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
