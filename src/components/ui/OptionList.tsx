"use client";

import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Checkbox, Input } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { confirmDialog } from "@/components/ui/Confirm";
import { SortHandle, bySort, saveOrder, sortRow, useSortable } from "@/components/ui/Sortable";
import { useLiveTable } from "@/lib/live";
import { errMsg, sb } from "@/lib/db";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/format";

// Lists people pick from that used to be fixed in code (tms_option_lists, migration 0036). Records
// store `value`, which never changes; `label` is shown and can be renamed. Until the list loads the
// built-in defaults show.

export type OptionListKey = "case_work" | "case_cs" | "opp_source";

export interface OptionRow {
  id: string;
  list: OptionListKey;
  value: string;
  label: string;
  sort: number;
  active: boolean;
  created_at: string;
}

const DEFAULTS: Record<OptionListKey, [string, string][]> = {
  case_work: [["dispatch", "Dispatch"], ["dot_compliance", "DOT Compliance"], ["mcpt", "MCPT"], ["accounting", "Accounting"], ["factoring", "Factoring"], ["fuel_card", "Fuel Card"], ["insurance", "Insurance"], ["other", "Other"]],
  case_cs: [["overcharge", "Overcharge"], ["service", "Unhappy with the service"], ["dispatcher", "Unhappy with the dispatcher"], ["safety_manager", "Unhappy with the safety account manager"], ["suggestion", "Suggestion"], ["other", "Other"]],
  opp_source: ["Call list", "Lead Hunter", "GoHighLevel", "Referral", "Website", "Facebook", "Instagram", "LinkedIn", "Email", "Text", "WhatsApp", "Fiverr", "Cross sale", "Other"].map((s) => [s, s]),
};

const TITLES: Record<OptionListKey, string> = { case_work: "Case services", case_cs: "Customer service categories", opp_source: "Opportunity sources" };

export function useOptions(list: OptionListKey) {
  const t = useLiveTable<OptionRow>("tms_option_lists", { order: "sort", ascending: true, filter: { list } });
  const rows: OptionRow[] = t.loaded
      ? [...t.rows].sort(bySort)
      : DEFAULTS[list].map(([value, label], sort) => ({ id: `default-${value}`, list, value, label, sort, active: true, created_at: "" }));
  const label = (v: string | null | undefined) => (v ? (rows.find((r) => r.value === v)?.label ?? v) : "");
  /** Active choices, plus the current value if it was turned off or deleted (so a form never loses it). */
  const choices = (current?: string | null) => {
    const on = rows.filter((r) => r.active || r.value === current);
    return current && !on.some((r) => r.value === current) ? [...on, { id: `cur-${current}`, list, value: current, label: current, sort: on.length, active: false, created_at: "" }] : on;
  };
  return { rows, loaded: t.loaded, put: t.put, drop: t.drop, label, choices };
}

/** "Edit list" link to the page where a list is managed, in a new tab (lists update here live). */
export function EditLink({ href, className }: { href: string; className?: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className={cn("inline-flex items-center gap-1 text-[11px] font-medium text-fg-3 hover:text-fg", className)}>
      <Pencil className="h-3 w-3" /> Edit list
    </a>
  );
}

/** Small "Edit list" link next to a dropdown; opens the list editor. */
export function EditListButton({ list, usage, className }: { list: OptionListKey; usage?: (value: string) => number; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={cn("inline-flex items-center gap-1 text-[11px] font-medium text-fg-3 hover:text-fg", className)}>
        <Pencil className="h-3 w-3" /> Edit list
      </button>
      {open && <ManageOptions list={list} open onClose={() => setOpen(false)} usage={usage} />}
    </>
  );
}

/** Add, rename, turn off, delete and reorder the items of one list. Changes save as you go. */
export function ManageOptions({ list, open, onClose, usage }: { list: OptionListKey; open: boolean; onClose: () => void; usage?: (value: string) => number }) {
  const opts = useOptions(list);
  const [name, setName] = useState("");
  const real = opts.rows.filter((r) => !r.id.startsWith("default-"));
  const sort = useSortable(
    real.map((r) => r.id),
    (ids) => saveOrder("tms_option_lists", ids.map((id) => real.find((r) => r.id === id)!), opts.put),
  );
  const save = async (r: OptionRow, patch: Partial<OptionRow>) => {
    const { data, error } = await sb().from("tms_option_lists").update(patch).eq("id", r.id).select().single();
    if (error) return toast.error(errMsg(error));
    opts.put(data as OptionRow);
  };
  const add = async () => {
    const label = name.trim();
    if (!label) return;
    if (real.some((r) => r.label.toLowerCase() === label.toLowerCase())) return toast.error(`${label} is already in the list`);
    // The stored value is the first name it was given; renaming later only changes the label.
    let value = label;
    for (let n = 2; real.some((r) => r.value === value); n++) value = `${label} ${n}`;
    const { data, error } = await sb().from("tms_option_lists").insert({ list, value, label, sort: real.length }).select().single();
    if (error) return toast.error(errMsg(error));
    opts.put(data as OptionRow);
    setName("");
  };
  const remove = async (r: OptionRow) => {
    const n = usage?.(r.value) ?? 0;
    const body = n ? `${n} record${n === 1 ? " uses" : "s use"} it and will keep showing "${r.label}". To stop offering it but keep it tidy, untick Active instead.` : undefined;
    if (!(await confirmDialog({ title: `Delete ${r.label}?`, body, confirmLabel: "Delete", danger: true }))) return;
    const { error } = await sb().from("tms_option_lists").delete().eq("id", r.id);
    if (error) return toast.error(errMsg(error));
    opts.drop(r.id);
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={TITLES[list]}
      size="sm"
      footer={
        <Button variant="primary" onClick={onClose}>
          Done
        </Button>
      }
    >
      <p className="mb-3 text-xs text-fg-3">Changes save as you go. Drag the handle or use the arrows to change the order.</p>
      {!opts.loaded ? (
        <div className="py-6 text-center text-xs text-fg-4">Loading…</div>
      ) : (
        <ul className="divide-y divide-line rounded-lg border border-line">
          {real.map((r) => (
            <li key={r.id} {...sort.rowProps(r.id)} className={cn("flex items-center gap-2 px-2 py-1.5", sortRow, !r.active && "opacity-60")}>
              <SortHandle {...sort.handle(r.id)} />
              <input
                key={`${r.id}-${r.label}`}
                defaultValue={r.label}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (!v) e.target.value = r.label;
                  else if (v !== r.label) save(r, { label: v });
                }}
                onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                className="min-w-0 flex-1 rounded bg-transparent px-1.5 py-1 text-[13px] text-fg hover:bg-surface-2 focus:bg-surface-2 focus:outline-none"
                aria-label="Name"
              />
              {usage && <span className="hidden text-[11px] text-fg-4 sm:inline">{usage(r.value)} used</span>}
              <Checkbox checked={r.active} onChange={(v) => save(r, { active: v })} label={<span className="text-[11px] text-fg-3">Active</span>} />
              <button type="button" onClick={() => remove(r)} className="rounded p-1 text-fg-4 hover:text-red-600" aria-label={`Delete ${r.label}`}>
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
          {real.length === 0 && <li className="px-3 py-4 text-center text-xs text-fg-4">The list is empty.</li>}
        </ul>
      )}
      <div className="mt-3 flex gap-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} placeholder="Add an item" />
        <Button variant="outline" onClick={add} disabled={!name.trim()}>
          <Plus className="h-4 w-4" /> Add
        </Button>
      </div>
    </Modal>
  );
}
