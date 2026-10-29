"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, GripVertical, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, Pill, neutralPill } from "@/components/ui/Bits";
import { Checkbox, Field, Input, Select } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { confirmDialog } from "@/components/ui/Confirm";
import { errMsg, sb } from "@/lib/db";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/format";
import type { OppField, Pipeline, Stage } from "@/lib/sales";
import { stagesOf, useSales } from "./SalesProvider";

// Pipelines setup (like GHL): pipelines, their stages (add, rename, color, win %, "too long after
// X days", drag to reorder, delete and move the opportunities), lost reasons and opportunity custom
// fields.

const COLORS = ["#a1a1aa", "#0ea5e9", "#6366f1", "#8b5cf6", "#ec4899", "#ef4444", "#f97316", "#f59e0b", "#84cc16", "#16a34a", "#14b8a6", "#64748b"];

export function PipelinesSetup() {
  const { pipelines, stages, opps } = useSales();
  const [sel, setSel] = useState<string | null>(null);
  const current = pipelines.rows.find((p) => p.id === sel) || pipelines.rows[0] || null;
  const list = stagesOf(stages.rows, current?.id);
  const [drag, setDrag] = useState<string | null>(null);
  const [moving, setMoving] = useState<{ kind: "stage"; stage: Stage } | { kind: "pipeline"; pipeline: Pipeline } | null>(null);

  const addPipeline = async () => {
    const { data, error } = await sb().from("tms_pipelines").insert({ name: "New pipeline", sort: pipelines.rows.length }).select().single();
    if (error) return toast.error(errMsg(error));
    pipelines.put(data as Pipeline);
    // A pipeline starts with the usual stages.
    const rows = ["New", "Contacted", "Proposal", "Negotiation"].map((name, i) => ({ pipeline_id: (data as Pipeline).id, name, sort: i, color: COLORS[[0, 1, 3, 7][i]], probability: [10, 25, 50, 75][i], rot_days: 7 }));
    const res = await sb().from("tms_pipeline_stages").insert(rows).select();
    for (const s of (res.data || []) as Stage[]) stages.put(s);
    setSel((data as Pipeline).id);
  };
  const savePipeline = async (p: Pipeline, patch: Partial<Pipeline>) => {
    const { data, error } = await sb().from("tms_pipelines").update(patch).eq("id", p.id).select().single();
    if (error) return toast.error(errMsg(error));
    pipelines.put(data as Pipeline);
  };
  const saveStage = async (s: Stage, patch: Partial<Stage>) => {
    const { data, error } = await sb().from("tms_pipeline_stages").update(patch).eq("id", s.id).select().single();
    if (error) return toast.error(errMsg(error));
    stages.put(data as Stage);
  };
  const addStage = async () => {
    if (!current) return;
    const { data, error } = await sb()
      .from("tms_pipeline_stages")
      .insert({ pipeline_id: current.id, name: "New stage", sort: list.length, color: COLORS[list.length % COLORS.length], probability: 50 })
      .select()
      .single();
    if (error) return toast.error(errMsg(error));
    stages.put(data as Stage);
  };
  /** New order: write every stage's position. */
  const reorder = async (ids: string[]) => {
    const next = ids.map((id, i) => ({ ...list.find((s) => s.id === id)!, sort: i }));
    for (const s of next) stages.put(s);
    const results = await Promise.all(next.map((s) => sb().from("tms_pipeline_stages").update({ sort: s.sort }).eq("id", s.id)));
    const bad = results.find((r) => r.error);
    if (bad?.error) toast.error(errMsg(bad.error));
  };
  const move = (id: string, dir: -1 | 1) => {
    const ids = list.map((s) => s.id);
    const i = ids.indexOf(id);
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    reorder(ids);
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
      <Card className="self-start p-2">
        <div className="px-2 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wider text-fg-4">Pipelines</div>
        {pipelines.rows.map((p) => {
          const n = opps.rows.filter((o) => o.pipeline_id === p.id && o.status === "open").length;
          return (
            <button key={p.id} onClick={() => setSel(p.id)} className={cn("flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px]", current?.id === p.id ? "bg-surface-2 font-semibold text-fg" : "text-fg-2 hover:bg-surface-2/60", !p.active && "opacity-50")}>
              <span className="flex-1 truncate">{p.name}</span>
              <span className="text-[11px] text-fg-4">{n} open</span>
            </button>
          );
        })}
        <Button size="sm" variant="ghost" className="mt-1 w-full justify-start" onClick={addPipeline}>
          <Plus className="h-4 w-4" /> Add pipeline
        </Button>
      </Card>

      <div className="min-w-0 space-y-4">
        {current && (
          <Card>
            <div className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row sm:items-end sm:px-5">
              <Field label="Pipeline name" className="flex-1">
                <Input key={current.id} defaultValue={current.name} onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== current.name && savePipeline(current, { name: e.target.value.trim() })} />
              </Field>
              <Checkbox checked={current.active} onChange={(v) => savePipeline(current, { active: v })} label="Active" />
              <Button
                variant="danger-ghost"
                onClick={async () => {
                  const n = opps.rows.filter((o) => o.pipeline_id === current.id).length;
                  if (n) return setMoving({ kind: "pipeline", pipeline: current });
                  if (!(await confirmDialog({ title: `Delete ${current.name}?`, body: "Its stages are deleted too.", confirmLabel: "Delete", danger: true }))) return;
                  const { error } = await sb().from("tms_pipelines").delete().eq("id", current.id);
                  if (error) return toast.error(errMsg(error));
                  pipelines.drop(current.id);
                  setSel(null);
                }}
              >
                <Trash2 className="h-4 w-4" /> Delete pipeline
              </Button>
            </div>
            <div className="px-4 pt-3 text-xs text-fg-3 sm:px-5">Drag the handle (or use the arrows) to reorder. Win % makes the weighted forecast; &quot;too long after&quot; flags opportunities stuck in the stage.</div>
            <ul className="space-y-2 p-4 sm:px-5">
              {list.map((s, i) => {
                const n = opps.rows.filter((o) => o.stage_id === s.id && o.status === "open").length;
                return (
                  <li
                    key={s.id}
                    draggable
                    onDragStart={() => setDrag(s.id)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => {
                      if (!drag || drag === s.id) return;
                      const ids = list.map((x) => x.id).filter((x) => x !== drag);
                      ids.splice(ids.indexOf(s.id), 0, drag);
                      reorder(ids);
                      setDrag(null);
                    }}
                    className={cn("flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface p-2.5", drag === s.id && "opacity-50")}
                  >
                    <GripVertical className="h-4 w-4 cursor-grab text-fg-4" aria-label="Drag to reorder" />
                    <div className="flex flex-col">
                      <button type="button" onClick={() => move(s.id, -1)} disabled={i === 0} className="text-fg-4 hover:text-fg disabled:opacity-30" aria-label="Move up">
                        <ArrowUp className="h-3 w-3" />
                      </button>
                      <button type="button" onClick={() => move(s.id, 1)} disabled={i === list.length - 1} className="text-fg-4 hover:text-fg disabled:opacity-30" aria-label="Move down">
                        <ArrowDown className="h-3 w-3" />
                      </button>
                    </div>
                    <div className="relative">
                      <select
                        value={s.color || ""}
                        onChange={(e) => saveStage(s, { color: e.target.value })}
                        className="h-7 w-7 cursor-pointer appearance-none rounded-full border-2 border-surface text-transparent ring-1 ring-line"
                        style={{ background: s.color || "#a1a1aa" }}
                        aria-label="Stage color"
                      >
                        {COLORS.map((c) => (
                          <option key={c} value={c} style={{ background: c }}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </div>
                    <Input key={`${s.id}-n`} defaultValue={s.name} onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== s.name && saveStage(s, { name: e.target.value.trim() })} className="min-w-[140px] flex-1" aria-label="Stage name" />
                    <label className="flex items-center gap-1 text-xs text-fg-3">
                      Win
                      <Input key={`${s.id}-p`} type="number" min={0} max={100} defaultValue={s.probability} suffix="%" onBlur={(e) => Number(e.target.value) !== s.probability && saveStage(s, { probability: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })} className="w-20" />
                    </label>
                    <label className="flex items-center gap-1 text-xs text-fg-3">
                      Too long after
                      <Input key={`${s.id}-r`} type="number" min={1} defaultValue={s.rot_days ?? ""} suffix="days" onBlur={(e) => saveStage(s, { rot_days: e.target.value ? Math.max(1, Number(e.target.value)) : null })} className="w-24" />
                    </label>
                    <Pill className={neutralPill}>{n} open</Pill>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label="Delete stage"
                      onClick={async () => {
                        if (opps.rows.some((o) => o.stage_id === s.id)) return setMoving({ kind: "stage", stage: s });
                        if (!(await confirmDialog({ title: `Delete ${s.name}?`, confirmLabel: "Delete", danger: true }))) return;
                        const { error } = await sb().from("tms_pipeline_stages").delete().eq("id", s.id);
                        if (error) return toast.error(errMsg(error));
                        stages.drop(s.id);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </li>
                );
              })}
            </ul>
            <div className="px-4 pb-4 sm:px-5">
              <Button size="sm" variant="outline" onClick={addStage}>
                <Plus className="h-4 w-4" /> Add stage
              </Button>
            </div>
          </Card>
        )}
        <div className="grid gap-4 xl:grid-cols-2">
          <LostReasons />
          <OppFields />
        </div>
      </div>
      <MoveModal value={moving} onClose={() => setMoving(null)} onDone={() => setSel(null)} />
    </div>
  );
}

/** Deleting a stage / pipeline that has opportunities: pick where they go first. */
function MoveModal({ value, onClose, onDone }: { value: { kind: "stage"; stage: Stage } | { kind: "pipeline"; pipeline: Pipeline } | null; onClose: () => void; onDone: () => void }) {
  const { pipelines, stages, opps } = useSales();
  const [to, setTo] = useState("");
  if (!value) return null;
  const isStage = value.kind === "stage";
  const fromPipeline = isStage ? value.stage.pipeline_id : value.pipeline.id;
  const options = isStage
    ? stagesOf(stages.rows, fromPipeline).filter((s) => s.id !== value.stage.id)
    : stages.rows.filter((s) => s.pipeline_id !== fromPipeline).sort((a, b) => a.sort - b.sort);
  const affected = opps.rows.filter((o) => (isStage ? o.stage_id === value.stage.id : o.pipeline_id === fromPipeline));
  const go = async () => {
    const target = stages.rows.find((s) => s.id === to);
    if (!target) return toast.error("Pick where they go");
    const { error } = await sb()
      .from("tms_opportunities")
      .update({ stage_id: target.id, pipeline_id: target.pipeline_id })
      .in(
        "id",
        affected.map((o) => o.id),
      );
    if (error) return toast.error(errMsg(error));
    for (const o of affected) opps.put({ ...o, stage_id: target.id, pipeline_id: target.pipeline_id });
    const del = isStage ? await sb().from("tms_pipeline_stages").delete().eq("id", value.stage.id) : await sb().from("tms_pipelines").delete().eq("id", value.pipeline.id);
    if (del.error) return toast.error(errMsg(del.error));
    if (isStage) stages.drop(value.stage.id);
    else pipelines.drop(value.pipeline.id);
    toast.success(`${affected.length} moved, ${isStage ? "stage" : "pipeline"} deleted`);
    onDone();
    onClose();
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={`Delete ${isStage ? value.stage.name : value.pipeline.name}`}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" onClick={go} disabled={!to}>
            Move & delete
          </Button>
        </>
      }
    >
      <p className="mb-3 text-[13px] text-fg-2">
        {affected.length} opportunit{affected.length === 1 ? "y is" : "ies are"} here. Move them to:
      </p>
      <Select value={to} onChange={(e) => setTo(e.target.value)}>
        <option value="">Select a stage…</option>
        {options.map((s) => (
          <option key={s.id} value={s.id}>
            {isStage ? s.name : `${pipelines.rows.find((p) => p.id === s.pipeline_id)?.name} · ${s.name}`}
          </option>
        ))}
      </Select>
    </Modal>
  );
}

function LostReasons() {
  const { reasons, opps } = useSales();
  const [name, setName] = useState("");
  const add = async () => {
    if (!name.trim()) return;
    const { data, error } = await sb().from("tms_lost_reasons").insert({ name: name.trim(), sort: reasons.rows.length * 10 }).select().single();
    if (error) return toast.error(errMsg(error));
    reasons.put(data as never);
    setName("");
  };
  return (
    <Card>
      <CardHeader title="Lost reasons" subtitle="Picked when an opportunity is marked lost" />
      <ul className="divide-y divide-line">
        {reasons.rows.map((r) => (
          <li key={r.id} className={cn("flex items-center gap-2 px-4 py-2 sm:px-5", !r.active && "opacity-50")}>
            <Input
              key={r.id}
              defaultValue={r.name}
              onBlur={async (e) => {
                const v = e.target.value.trim();
                if (!v || v === r.name) return;
                const { data, error } = await sb().from("tms_lost_reasons").update({ name: v }).eq("id", r.id).select().single();
                if (error) return toast.error(errMsg(error));
                reasons.put(data as never);
              }}
              className="flex-1"
            />
            <span className="text-[11px] text-fg-4">{opps.rows.filter((o) => o.lost_reason_id === r.id).length} used</span>
            <Checkbox
              checked={r.active}
              onChange={async (v) => {
                const { data, error } = await sb().from("tms_lost_reasons").update({ active: v }).eq("id", r.id).select().single();
                if (error) return toast.error(errMsg(error));
                reasons.put(data as never);
              }}
              label="Active"
            />
          </li>
        ))}
      </ul>
      <div className="flex gap-2 p-4 sm:px-5">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New lost reason" onKeyDown={(e) => e.key === "Enter" && add()} />
        <Button variant="outline" onClick={add}>
          <Plus className="h-4 w-4" /> Add
        </Button>
      </div>
    </Card>
  );
}

function OppFields() {
  const { fields } = useSales();
  const [e, setE] = useState<(Partial<OppField> & { optionsText?: string }) | null>(null);
  const save = async () => {
    if (!e?.label?.trim()) return toast.error("Name the field");
    const options = (e.optionsText || "")
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
    if (e.type === "select" && !options.length) return toast.error("Add the dropdown choices");
    const row = { label: e.label.trim(), type: e.type || "text", options, required: !!e.required, active: e.active ?? true, sort: e.sort ?? fields.rows.length };
    const res = e.id ? await sb().from("tms_opportunity_fields").update(row).eq("id", e.id).select().single() : await sb().from("tms_opportunity_fields").insert(row).select().single();
    if (res.error) return toast.error(errMsg(res.error));
    fields.put(res.data as OppField);
    setE(null);
  };
  const remove = async () => {
    if (!e?.id || !(await confirmDialog({ title: `Delete ${e.label}?`, body: "Values saved on opportunities stay in their history but no longer show.", confirmLabel: "Delete", danger: true }))) return;
    const { error } = await sb().from("tms_opportunity_fields").delete().eq("id", e.id);
    if (error) return toast.error(errMsg(error));
    fields.drop(e.id);
    setE(null);
  };
  return (
    <Card>
      <CardHeader title="Opportunity custom fields" subtitle="Extra fields on every opportunity" actions={<Button size="sm" variant="outline" onClick={() => setE({ type: "text", active: true, optionsText: "" })}><Plus className="h-4 w-4" /> Add field</Button>} />
      {fields.rows.length === 0 ? (
        <div className="px-5 py-6 text-sm text-fg-4">None yet (e.g. Number of trucks, Decision maker, Current dispatcher).</div>
      ) : (
        <ul className="divide-y divide-line">
          {fields.rows.map((f) => (
            <li key={f.id}>
              <button type="button" onClick={() => setE({ ...f, optionsText: f.options.join(", ") })} className={cn("flex w-full items-center justify-between px-4 py-2.5 text-left hover:bg-surface-2/50 sm:px-5", !f.active && "opacity-50")}>
                <span className="text-[13px] text-fg">{f.label}</span>
                <span className="text-xs text-fg-3">
                  {f.type}
                  {f.required ? " · required" : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <Modal
        open={!!e}
        onClose={() => setE(null)}
        title={e?.id ? "Custom field" : "New custom field"}
        size="sm"
        footer={
          <>
            {e?.id && (
              <Button variant="danger-ghost" onClick={remove} className="mr-auto">
                <Trash2 className="h-4 w-4" /> Delete
              </Button>
            )}
            <Button variant="ghost" onClick={() => setE(null)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={save}>
              Save
            </Button>
          </>
        }
      >
        {e && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Field name" required className="col-span-2">
              <Input value={e.label || ""} onChange={(x) => setE({ ...e, label: x.target.value })} autoFocus />
            </Field>
            <Field label="Type" className="col-span-2">
              <Select value={e.type} onChange={(x) => setE({ ...e, type: x.target.value as OppField["type"] })}>
                <option value="text">Text</option>
                <option value="number">Number</option>
                <option value="date">Date</option>
                <option value="boolean">Yes / no</option>
                <option value="select">Dropdown</option>
              </Select>
            </Field>
            {e.type === "select" && (
              <Field label="Choices" hint="Comma separated" className="col-span-2">
                <Input value={e.optionsText || ""} onChange={(x) => setE({ ...e, optionsText: x.target.value })} />
              </Field>
            )}
            <Checkbox className="col-span-2" checked={!!e.required} onChange={(v) => setE({ ...e, required: v })} label="Required" />
            <Checkbox className="col-span-2" checked={e.active ?? true} onChange={(v) => setE({ ...e, active: v })} label="Active" />
          </div>
        )}
      </Modal>
    </Card>
  );
}
