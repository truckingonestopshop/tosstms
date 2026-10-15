"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Check, CheckSquare, Copy, ListChecks, Pencil, Plus, RotateCcw, StickyNote, Table2, Trash2, X } from "lucide-react";
import { Drawer } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Field";
import { CopyButton, Eyebrow, Pill, neutralPill } from "@/components/ui/Bits";
import { DocumentsPanel } from "@/components/docs/DocumentsPanel";
import { StatusPill } from "@/components/loads/StatusMenu";
import { QtyStepper } from "./TruckForm";
import { useStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import { ACTIVE_STATUSES, cn, fmtDay, lane, num, uid } from "@/lib/format";
import { availability, defaultPitch, equipmentLine, pitchFor } from "@/lib/pitch";
import type { DeskBlock, Truck } from "@/lib/types";

/** Everything a dispatcher needs on a broker call, one tap to copy. */
export function TruckSheet({ truck, onClose, onEdit }: { truck: Truck | null; onClose: () => void; onEdit: (t: Truck) => void }) {
  const { companyById, driverById, updateTruck, loads } = useStore();
  const [pitchEdit, setPitchEdit] = useState(false);
  const [pitch, setPitch] = useState("");
  const [loc, setLoc] = useState("");
  const [avail, setAvail] = useState("");
  const [gearName, setGearName] = useState("");

  useEffect(() => {
    if (!truck) return;
    setLoc(truck.current_location || "");
    setAvail(truck.available_date || "");
    setPitchEdit(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [truck?.id]);

  if (!truck) return null;
  const company = companyById(truck.company_id);
  const driver = driverById(truck.assigned_driver_id);
  const text = pitchFor(truck, company, driver);
  const truckLoads = loads
    .filter((l) => l.truck_id === truck.id && ACTIVE_STATUSES.includes(l.status))
    .sort((a, b) => (a.pickup_date || "").localeCompare(b.pickup_date || ""));

  const copyRows: [string, string | null | undefined][] = [
    ["Driver", driver?.name],
    ["Driver phone", driver?.phone],
    ["MC", company?.mc_number],
    ["DOT", company?.dot_number],
    ["Truck #", truck.unit_number],
    ["Trailer #", truck.trailer_number],
    ["Equipment", equipmentLine(truck)],
    ["Max weight", truck.max_weight ? `${num(truck.max_weight)} lbs` : null],
    ["VIN", truck.vin_number],
    ["Plate", truck.plate],
    ["Doors", truck.door_type],
    ["Suspension", truck.suspension],
  ];

  const saveBlocks = (blocks: DeskBlock[]) => updateTruck(truck.id, { desk_blocks: blocks });

  return (
    <Drawer
      open
      onClose={onClose}
      width="max-w-3xl"
      title={
        <span className="flex items-center gap-2">
          Unit {truck.unit_number}
          <Pill className={truck.status === "active" ? "bg-emerald-500/10 text-emerald-700 ring-emerald-600/20 dark:text-emerald-300" : neutralPill}>
            {availability(truck)}
          </Pill>
        </span>
      }
      subtitle={`${company?.name || ""} · ${equipmentLine(truck)}`}
      actions={
        <Button size="sm" variant="ghost" onClick={() => onEdit(truck)}>
          <Pencil className="h-3.5 w-3.5" />
          Edit
        </Button>
      }
    >
      <div className="space-y-6 p-5">
        {/* Pitch */}
        <section>
          <div className="mb-2 flex items-center justify-between">
            <Eyebrow>Broker pitch</Eyebrow>
            <div className="flex gap-1">
              {truck.custom_pitch && !pitchEdit && (
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={async () => {
                    if (await updateTruck(truck.id, { custom_pitch: null })) toast.success("Back to the automatic pitch");
                  }}
                >
                  <RotateCcw className="h-3 w-3" />
                  Auto
                </Button>
              )}
              {!pitchEdit && (
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() => {
                    setPitch(text);
                    setPitchEdit(true);
                  }}
                >
                  <Pencil className="h-3 w-3" />
                  Edit
                </Button>
              )}
            </div>
          </div>
          {pitchEdit ? (
            <div className="space-y-2">
              <Textarea value={pitch} onChange={(e) => setPitch(e.target.value)} rows={8} className="font-mono text-[13px]" />
              <div className="flex flex-wrap justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={() => setPitch(defaultPitch(truck, company, driver))}>
                  Reset to auto
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setPitchEdit(false)}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={async () => {
                    if (await updateTruck(truck.id, { custom_pitch: pitch })) {
                      setPitchEdit(false);
                      toast.success("Pitch saved");
                    }
                  }}
                >
                  Save pitch
                </Button>
              </div>
            </div>
          ) : (
            <div className="relative rounded-xl border border-line bg-surface-2/50 p-4">
              <pre className="whitespace-pre-wrap break-words font-sans text-[13px] leading-relaxed text-fg-2">{text}</pre>
              <Button
                size="sm"
                variant="secondary"
                className="mt-3"
                onClick={() => {
                  navigator.clipboard.writeText(text);
                  toast.success("Pitch copied");
                }}
              >
                <Copy className="h-3.5 w-3.5" />
                Copy pitch
              </Button>
            </div>
          )}
        </section>

        {/* Location & availability */}
        <section>
          <Eyebrow className="mb-2">Where is it now</Eyebrow>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input value={loc} onChange={(e) => setLoc(e.target.value)} placeholder="City, ST" className="flex-1" />
            <Input type="date" value={avail} onChange={(e) => setAvail(e.target.value)} className="sm:w-44" />
            <Button
              variant="outline"
              disabled={loc === (truck.current_location || "") && avail === (truck.available_date || "")}
              onClick={async () => {
                if (await updateTruck(truck.id, { current_location: loc, available_date: avail || null })) toast.success("Location updated");
              }}
            >
              Update
            </Button>
          </div>
        </section>

        {/* Quick copy */}
        <section>
          <Eyebrow className="mb-2">Quick copy</Eyebrow>
          <div className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-2">
            {copyRows.map(([k, v]) => (
              <div key={k} className="flex items-center gap-3 bg-surface px-3.5 py-2.5">
                <span className="w-24 shrink-0 text-xs text-fg-3">{k}</span>
                <span className={cn("min-w-0 flex-1 truncate text-[13px] font-medium", v ? "text-fg" : "text-fg-4")}>{v || "—"}</span>
                <CopyButton text={v} />
              </div>
            ))}
          </div>
          {truck.important_info && (
            <div className="mt-2 flex items-start gap-3 rounded-xl border border-line bg-surface px-3.5 py-2.5">
              <span className="w-24 shrink-0 text-xs text-fg-3">Features</span>
              <span className="min-w-0 flex-1 text-[13px] text-fg">{truck.important_info}</span>
              <CopyButton text={truck.important_info} />
            </div>
          )}
        </section>

        {/* Gear */}
        <section>
          <Eyebrow className="mb-2">Onboard gear</Eyebrow>
          <div className="rounded-xl border border-line">
            {truck.accessories.length === 0 && <div className="px-3.5 py-3 text-[13px] text-fg-4">No gear listed.</div>}
            <ul className="divide-y divide-line">
              {truck.accessories.map((a) => (
                <li key={a.id} className="flex items-center gap-3 px-3.5 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-medium text-fg">{a.name}</div>
                    {a.details && <div className="truncate text-xs text-fg-3">{a.details}</div>}
                  </div>
                  <QtyStepper
                    value={a.quantity}
                    onChange={(q) => updateTruck(truck.id, { accessories: truck.accessories.map((x) => (x.id === a.id ? { ...x, quantity: q } : x)) })}
                  />
                  <button
                    onClick={() => updateTruck(truck.id, { accessories: truck.accessories.filter((x) => x.id !== a.id) })}
                    className="rounded-md p-1 text-fg-4 hover:bg-surface-2 hover:text-fg"
                    aria-label="Remove"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
            <form
              className="flex gap-2 border-t border-line p-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!gearName.trim()) return;
                updateTruck(truck.id, { accessories: [...truck.accessories, { id: uid(), name: gearName.trim(), quantity: 1 }] });
                setGearName("");
              }}
            >
              <Input value={gearName} onChange={(e) => setGearName(e.target.value)} placeholder="Add gear…" className="h-8 flex-1" />
              <Button size="sm" type="submit" variant="outline">
                Add
              </Button>
            </form>
          </div>
        </section>

        {/* Pinned notes */}
        <DeskBlocks blocks={truck.desk_blocks} onChange={saveBlocks} />

        {/* Loads */}
        <section>
          <Eyebrow className="mb-2">Upcoming loads</Eyebrow>
          {truckLoads.length === 0 ? (
            <div className="rounded-xl border border-line px-3.5 py-3 text-[13px] text-fg-4">No active loads on this truck.</div>
          ) : (
            <ul className="divide-y divide-line rounded-xl border border-line">
              {truckLoads.map((l) => (
                <li key={l.id}>
                  <Link href={`/loads/${l.id}`} className="flex items-center gap-3 px-3.5 py-2.5 hover:bg-surface-2/50">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-medium text-fg">{lane(l)}</div>
                      <div className="text-xs text-fg-3">
                        {fmtDay(l.pickup_date)} → {fmtDay(l.delivery_date)} · {l.broker_name}
                      </div>
                    </div>
                    <StatusPill status={l.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <Eyebrow className="mb-2">Truck documents</Eyebrow>
          <DocumentsPanel target={{ scope: "truck", id: truck.id, companyId: truck.company_id }} compact emptyText="No truck files yet." />
        </section>
      </div>
    </Drawer>
  );
}

function DeskBlocks({ blocks, onChange }: { blocks: DeskBlock[]; onChange: (b: DeskBlock[]) => void }) {
  const add = (kind: DeskBlock["kind"]) => {
    const b: DeskBlock =
      kind === "note"
        ? { id: uid(), kind, title: "Note", text: "" }
        : kind === "checklist"
          ? { id: uid(), kind, title: "Checklist", items: [] }
          : { id: uid(), kind, title: "Specs", specs: [{ label: "", value: "" }] };
    onChange([...blocks, b]);
  };
  const patch = (id: string, p: Partial<DeskBlock>) => onChange(blocks.map((b) => (b.id === id ? { ...b, ...p } : b)));

  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <Eyebrow>Pinned notes</Eyebrow>
        <div className="flex gap-1">
          <Button size="xs" variant="ghost" onClick={() => add("note")}>
            <StickyNote className="h-3 w-3" /> Note
          </Button>
          <Button size="xs" variant="ghost" onClick={() => add("checklist")}>
            <ListChecks className="h-3 w-3" /> Checklist
          </Button>
          <Button size="xs" variant="ghost" onClick={() => add("specs")}>
            <Table2 className="h-3 w-3" /> Specs
          </Button>
        </div>
      </div>
      {blocks.length === 0 && <div className="rounded-xl border border-dashed border-line px-3.5 py-3 text-[13px] text-fg-4">Pin reminders, broker requirements or extra specs for this unit.</div>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {blocks.map((b) => (
          <Block key={b.id} b={b} onPatch={(p) => patch(b.id, p)} onDelete={() => onChange(blocks.filter((x) => x.id !== b.id))} />
        ))}
      </div>
    </section>
  );
}

function Block({ b, onPatch, onDelete }: { b: DeskBlock; onPatch: (p: Partial<DeskBlock>) => void; onDelete: () => void }) {
  const [title, setTitle] = useState(b.title);
  const [text, setText] = useState(b.text || "");
  const [item, setItem] = useState("");
  return (
    <div className="rounded-xl border border-line bg-surface p-3">
      <div className="mb-2 flex items-center gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => title !== b.title && onPatch({ title })}
          className="min-w-0 flex-1 bg-transparent text-[13px] font-semibold text-fg focus:outline-none"
        />
        <button onClick={onDelete} className="rounded p-1 text-fg-4 hover:text-red-500" aria-label="Delete note">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      {b.kind === "note" && (
        <Textarea value={text} onChange={(e) => setText(e.target.value)} onBlur={() => text !== (b.text || "") && onPatch({ text })} rows={3} placeholder="Write…" />
      )}
      {b.kind === "checklist" && (
        <div className="space-y-1">
          {(b.items || []).map((it) => (
            <div key={it.id} className="group flex items-center gap-2">
              <button
                onClick={() => onPatch({ items: (b.items || []).map((x) => (x.id === it.id ? { ...x, done: !x.done } : x)) })}
                className={cn("flex h-4 w-4 shrink-0 items-center justify-center rounded border", it.done ? "border-fg bg-fg text-bg" : "border-line-strong")}
              >
                {it.done && <Check className="h-3 w-3" />}
              </button>
              <span className={cn("flex-1 text-[13px]", it.done ? "text-fg-4 line-through" : "text-fg-2")}>{it.text}</span>
              <button
                onClick={() => onPatch({ items: (b.items || []).filter((x) => x.id !== it.id) })}
                className="text-fg-4 opacity-0 hover:text-fg group-hover:opacity-100"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!item.trim()) return;
              onPatch({ items: [...(b.items || []), { id: uid(), text: item.trim(), done: false }] });
              setItem("");
            }}
            className="flex items-center gap-2 pt-1"
          >
            <CheckSquare className="h-4 w-4 text-fg-4" />
            <input value={item} onChange={(e) => setItem(e.target.value)} placeholder="Add item" className="flex-1 bg-transparent text-[13px] text-fg placeholder:text-fg-4 focus:outline-none" />
          </form>
        </div>
      )}
      {b.kind === "specs" && (
        <div className="space-y-1.5">
          {(b.specs || []).map((s, i) => (
            <div key={i} className="flex gap-1.5">
              <Input
                defaultValue={s.label}
                placeholder="Label"
                className="h-8 w-28"
                onBlur={(e) => onPatch({ specs: (b.specs || []).map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })}
              />
              <Input
                defaultValue={s.value}
                placeholder="Value"
                className="h-8 flex-1"
                onBlur={(e) => onPatch({ specs: (b.specs || []).map((x, j) => (j === i ? { ...x, value: e.target.value } : x)) })}
              />
              <CopyButton text={s.value} />
            </div>
          ))}
          <Button size="xs" variant="ghost" onClick={() => onPatch({ specs: [...(b.specs || []), { label: "", value: "" }] })}>
            <Plus className="h-3 w-3" /> Row
          </Button>
        </div>
      )}
    </div>
  );
}
