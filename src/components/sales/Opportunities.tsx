"use client";

import { useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { AlertTriangle, CheckSquare, Columns3, Download, List, Plus, Search, Target, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Avatar, Card, Empty, Pill, neutralPill } from "@/components/ui/Bits";
import { Checkbox, Field, Input, Segmented, Select } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { EditLink, EditListButton, useOptions } from "@/components/ui/OptionList";
import { confirmDialog } from "@/components/ui/Confirm";
import { errMsg, sb } from "@/lib/db";
import { useStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import { downloadCsv } from "@/lib/csv";
import { cn, fmtDay, money, today } from "@/lib/format";
import { SERVICES, serviceLabel } from "@/lib/services";
import type { ChargeService } from "@/lib/billing";
import type { ServiceKey } from "@/lib/types";
import { OPP_STATUSES, daysInStage, isRotting, oppNumber, statusMeta, weighted, type OppStatus, type Opportunity, type Stage } from "@/lib/sales";
import { stagesOf, useSales } from "./SalesProvider";
import { useCloseFlow, usePatchOpps } from "./OppClose";
import { OpportunityDetail } from "./OpportunityDetail";

export const svcLabel = (s: ChargeService) => (s === "other" ? "Other" : serviceLabel(s as ServiceKey));

type CloseFilter = "" | "overdue" | "month" | "30" | "none";

/** Opportunities like GHL: a board per pipeline (drag between stages) and a list with bulk actions. */
export function Opportunities() {
  const sources = useOptions("opp_source");
  const pathname = usePathname();
  const params = useSearchParams();
  const { pipelines, stages, opps, tasks } = useSales();
  const { companyById, memberName, members, inScope, companies } = useStore();
  const [now] = useState(() => Date.now());
  const t = today();

  const [view, setView] = useState<"board" | "list">("board");
  const [pid, setPid] = useState("");
  const [q, setQ] = useState("");
  const [owner, setOwner] = useState("");
  const [status, setStatus] = useState<OppStatus | "all">("open");
  const [service, setService] = useState("");
  const [source, setSource] = useState("");
  const [tag, setTag] = useState("");
  const [closeBy, setCloseBy] = useState<CloseFilter>("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [close, closeNode] = useCloseFlow();
  const patch = usePatchOpps();

  const active = pipelines.rows.filter((p) => p.active);
  const board = pipelines.rows.find((p) => p.id === pid) || active[0] || pipelines.rows[0];
  const pipelineId = view === "board" ? board?.id : pid;
  const cols = stagesOf(stages.rows, board?.id);
  const stageById = (id: string | null) => stages.rows.find((s) => s.id === id);

  // ?opp=ID opens an opportunity (links from the dashboard, the search, the company).
  const openId = params.get("opp");
  // The URL is updated in place (no page request; Next keeps useSearchParams in step).
  const setOpen = (id: string | null) => {
    const p = new URLSearchParams(params.toString());
    if (id) p.set("opp", id);
    else p.delete("opp");
    window.history.replaceState(null, "", `${pathname}?${p}`);
  };

  const scoped = opps.rows.filter((o) => inScope(o.company_id));
  const allTags = [...new Set(scoped.flatMap((o) => o.tags || []))].sort();
  const month = t.slice(0, 7);
  const in30 = new Date(now + 30 * 86400000).toISOString().slice(0, 10);
  const list = scoped
    .filter((o) => !pipelineId || o.pipeline_id === pipelineId)
    .filter((o) => status === "all" || o.status === status)
    .filter((o) => !owner || (owner === "none" ? !o.owner_id : o.owner_id === owner))
    .filter((o) => !service || o.service === service)
    .filter((o) => !source || o.source === source)
    .filter((o) => !tag || (o.tags || []).includes(tag))
    .filter((o) => {
      const d = o.expected_close;
      if (closeBy === "none") return !d;
      if (closeBy === "overdue") return !!d && d < t && o.status === "open";
      if (closeBy === "month") return !!d && d.startsWith(month);
      if (closeBy === "30") return !!d && d >= t && d <= in30;
      return true;
    })
    .filter((o) => {
      if (!q) return true;
      const c = companyById(o.company_id);
      const hay = `${oppNumber(o)} ${o.number} ${o.title} ${c?.name || ""} ${c?.dot_number || ""} ${c?.mc_number || ""} ${o.contact_name || ""} ${memberName(o.owner_id)} ${(o.tags || []).join(" ")}`;
      return hay.toLowerCase().includes(q.toLowerCase());
    })
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));

  const openTasks = (id: string) => tasks.rows.filter((x) => x.opportunity_id === id && !x.done);
  const selected = list.filter((o) => sel.has(o.id));
  const toggle = (id: string) => setSel((s) => (s.has(id) ? new Set([...s].filter((x) => x !== id)) : new Set([...s, id])));

  const moveTo = async (o: Opportunity, s: Stage) => {
    if (o.stage_id === s.id) return;
    opps.put({ ...o, stage_id: s.id, pipeline_id: s.pipeline_id, stage_entered_at: new Date().toISOString() });
    await patch([o.id], { stage_id: s.id, pipeline_id: s.pipeline_id });
  };

  const exportCsv = (rows: Opportunity[]) =>
    downloadCsv(`opportunities-${t}.csv`, [
      ["Opportunity #", "Title", "Company", "Pipeline", "Stage", "Status", "Value", "Owner", "Source", "Contact", "Service", "Tags", "Expected close", "Created", "Closed"],
      ...rows.map((o) => [
        oppNumber(o),
        o.title,
        companyById(o.company_id)?.name || "",
        pipelines.rows.find((p) => p.id === o.pipeline_id)?.name || "",
        stageById(o.stage_id)?.name || "",
        statusMeta(o.status).label,
        Number(o.value),
        o.owner_id ? memberName(o.owner_id) : "",
        o.source || "",
        o.contact_name || "",
        svcLabel(o.service),
        (o.tags || []).join(", "),
        o.expected_close || "",
        o.created_at.slice(0, 10),
        o.closed_at?.slice(0, 10) || "",
      ]),
    ]);

  const filters = (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <Select value={view === "board" ? board?.id || "" : pid} onChange={(e) => setPid(e.target.value)} className="w-auto min-w-[150px]" aria-label="Pipeline">
        {view === "list" && <option value="">All pipelines</option>}
        {pipelines.rows.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
            {p.active ? "" : " (inactive)"}
          </option>
        ))}
      </Select>
      <Segmented
        value={view}
        onChange={(v) => {
          setView(v);
          setSel(new Set());
        }}
        options={[
          { value: "board", label: <><Columns3 className="h-3.5 w-3.5" /> Board</> },
          { value: "list", label: <><List className="h-3.5 w-3.5" /> List</> },
        ]}
      />
      <div className="relative min-w-[200px] flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-4" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="OPP #, title, company, DOT, MC, contact, tag" className="pl-9" />
      </div>
      <Button variant="primary" onClick={() => setAdding(true)} disabled={!companies.length || !pipelines.rows.length}>
        <Plus className="h-4 w-4" /> New opportunity
      </Button>
      <div className="flex w-full flex-wrap gap-2">
        <Select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className="w-auto" aria-label="Status">
          <option value="all">All statuses</option>
          {OPP_STATUSES.map((s) => (
            <option key={s.v} value={s.v}>
              {s.label}
            </option>
          ))}
        </Select>
        <Select value={owner} onChange={(e) => setOwner(e.target.value)} className="w-auto" aria-label="Owner">
          <option value="">All owners</option>
          <option value="none">Unassigned</option>
          {members.map((m) => (
            <option key={m.user_id} value={m.user_id}>
              {m.full_name || m.email}
            </option>
          ))}
        </Select>
        <Select value={service} onChange={(e) => setService(e.target.value)} className="w-auto" aria-label="Service">
          <option value="">All services</option>
          {SERVICES.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
          <option value="other">Other</option>
        </Select>
        <Select value={source} onChange={(e) => setSource(e.target.value)} className="w-auto" aria-label="Source">
          <option value="">All sources</option>
          {sources.choices(source).map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
        </Select>
        {allTags.length > 0 && (
          <Select value={tag} onChange={(e) => setTag(e.target.value)} className="w-auto" aria-label="Tag">
            <option value="">All tags</option>
            {allTags.map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </Select>
        )}
        <Select value={closeBy} onChange={(e) => setCloseBy(e.target.value as CloseFilter)} className="w-auto" aria-label="Expected close">
          <option value="">Any close date</option>
          <option value="overdue">Close date passed</option>
          <option value="month">Closing this month</option>
          <option value="30">Next 30 days</option>
          <option value="none">No close date</option>
        </Select>
        {(owner || service || source || tag || closeBy || q || status !== "open") && (
          <Button
            variant="ghost"
            size="sm"
            className="h-9"
            onClick={() => {
              setOwner("");
              setService("");
              setSource("");
              setTag("");
              setCloseBy("");
              setQ("");
              setStatus("open");
            }}
          >
            Clear
          </Button>
        )}
      </div>
    </div>
  );

  if (!pipelines.rows.length)
    return (
      <Card>
        <Empty icon={Target} title="No pipelines yet" body="Add one in the Pipelines tab." />
      </Card>
    );

  return (
    <>
      {filters}

      {view === "board" ? (
        <>
          <div className="-mx-4 overflow-x-auto px-4 pb-3 sm:mx-0 sm:px-0">
            <div className="flex min-w-max gap-3">
              {cols.map((s) => {
                const items = list.filter((o) => o.stage_id === s.id);
                const value = items.reduce((a, o) => a + Number(o.value), 0);
                return (
                  <div
                    key={s.id}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setOver(s.id);
                    }}
                    onDragLeave={() => setOver((x) => (x === s.id ? null : x))}
                    onDrop={() => {
                      const o = opps.rows.find((x) => x.id === drag);
                      if (o) moveTo(o, s);
                      setDrag(null);
                      setOver(null);
                    }}
                    className={cn("flex w-[280px] shrink-0 flex-col rounded-xl border bg-surface-2/40", over === s.id ? "border-brand ring-1 ring-brand/40" : "border-line")}
                  >
                    <div className="border-b border-line px-3 py-2.5" style={{ boxShadow: `inset 0 3px 0 ${s.color || "#a1a1aa"}` }}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-[13px] font-semibold text-fg">{s.name}</span>
                        <span className="text-[11px] text-fg-4">{items.length}</span>
                      </div>
                      <div className="tnum mt-0.5 text-[11px] text-fg-3">
                        {money(value, { cents: false })} · <span title="Value × win %">{money(items.reduce((a, o) => a + weighted(o, s), 0), { cents: false })} weighted</span>
                      </div>
                    </div>
                    <div className="flex max-h-[62dvh] min-h-[120px] flex-col gap-2 overflow-y-auto p-2">
                      {items.map((o) => (
                        <OppCard key={o.id} o={o} stage={s} now={now} openTasks={openTasks(o.id)} onOpen={() => setOpen(o.id)} onDrag={setDrag} dragging={drag === o.id} />
                      ))}
                      {items.length === 0 && <div className="py-6 text-center text-xs text-fg-4">Drop here</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          {/* Drop on a status to close it (like GHL's bottom bar). */}
          {drag && (
            <div className="fixed inset-x-0 bottom-4 z-40 mx-auto flex w-fit gap-2 rounded-2xl border border-line bg-surface p-2 shadow-pop">
              {(["won", "lost", "abandoned"] as const).map((st) => (
                <div
                  key={st}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setOver(st);
                  }}
                  onDragLeave={() => setOver(null)}
                  onDrop={() => {
                    if (drag) close([drag], st);
                    setDrag(null);
                    setOver(null);
                  }}
                  className={cn("rounded-xl px-6 py-3 text-[13px] font-semibold ring-1", statusMeta(st).pill, over === st && "scale-105 ring-2")}
                >
                  {statusMeta(st).label}
                </div>
              ))}
            </div>
          )}
        </>
      ) : list.length === 0 ? (
        <Card>
          <Empty icon={Target} title={scoped.length ? "No opportunities match" : "No opportunities yet"} body={scoped.length ? undefined : "Add one for a lead or client: what you're selling them, its value and stage."} />
        </Card>
      ) : (
        <>
          {selected.length > 0 && <BulkBar selected={selected} onDone={() => setSel(new Set())} close={close} exportCsv={exportCsv} />}
          <Card className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-[13px]">
              <thead>
                <tr className="border-b border-line text-left text-[11px] uppercase tracking-wider text-fg-4">
                  <th className="w-10 px-4 py-2">
                    <Checkbox checked={selected.length === list.length} indeterminate={selected.length > 0} onChange={(v) => setSel(v ? new Set(list.map((o) => o.id)) : new Set())} />
                  </th>
                  <th className="px-2 py-2 font-semibold">Opportunity</th>
                  <th className="px-3 py-2 font-semibold">Stage</th>
                  <th className="px-3 py-2 font-semibold">Status</th>
                  <th className="px-3 py-2 text-right font-semibold">Value</th>
                  <th className="px-3 py-2 font-semibold">Owner</th>
                  <th className="px-3 py-2 font-semibold">Source</th>
                  <th className="px-3 py-2 font-semibold">Close</th>
                  <th className="px-4 py-2 text-right font-semibold">
                    <button type="button" onClick={() => exportCsv(list)} className="inline-flex items-center gap-1 normal-case tracking-normal text-fg-3 hover:text-fg">
                      <Download className="h-3.5 w-3.5" /> CSV
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {list.map((o) => {
                  const s = stageById(o.stage_id);
                  const st = statusMeta(o.status);
                  const rot = isRotting(o, s, now);
                  return (
                    <tr key={o.id} onClick={() => setOpen(o.id)} className={cn("cursor-pointer border-b border-line last:border-b-0 hover:bg-surface-2/50", sel.has(o.id) && "bg-brand/5")}>
                      <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                        <Checkbox checked={sel.has(o.id)} onChange={() => toggle(o.id)} />
                      </td>
                      <td className="px-2 py-2.5">
                        <div className="font-medium text-fg">
                          <span className="tnum mr-1.5 text-xs font-semibold text-fg-4">{oppNumber(o)}</span>
                          {o.title}
                        </div>
                        <div className="text-[11px] text-fg-4">
                          {companyById(o.company_id)?.name || "—"} · {svcLabel(o.service)}
                          {!pid && ` · ${pipelines.rows.find((p) => p.id === o.pipeline_id)?.name || ""}`}
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="inline-flex items-center gap-1.5 text-fg-2">
                          <span className="h-2 w-2 rounded-full" style={{ background: s?.color || "#a1a1aa" }} /> {s?.name || "—"}
                        </span>
                        <div className={cn("text-[11px]", rot ? "font-medium text-amber-600 dark:text-amber-400" : "text-fg-4")}>{daysInStage(o, now)}d in stage</div>
                      </td>
                      <td className="px-3 py-2.5">
                        <Pill className={st.pill}>{st.label}</Pill>
                      </td>
                      <td className="tnum px-3 py-2.5 text-right font-medium text-fg">{money(Number(o.value), { cents: false })}</td>
                      <td className="px-3 py-2.5 text-fg-2">{o.owner_id ? memberName(o.owner_id) : "—"}</td>
                      <td className="px-3 py-2.5 text-fg-2">{sources.label(o.source) || "—"}</td>
                      <td className={cn("px-3 py-2.5", o.status === "open" && o.expected_close && o.expected_close < t ? "text-red-600 dark:text-red-400" : "text-fg-2")}>{o.expected_close ? fmtDay(o.expected_close) : "—"}</td>
                      <td className="px-4 py-2.5 text-right text-[11px] text-fg-4">{fmtDay(o.updated_at.slice(0, 10))}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        </>
      )}

      {closeNode}
      <NewOpportunity
        open={adding}
        pipelineId={board?.id}
        onClose={() => setAdding(false)}
        onCreated={(o) => {
          setAdding(false);
          setOpen(o.id);
        }}
      />
      <OpportunityDetail id={openId} onClose={() => setOpen(null)} />
    </>
  );
}

function OppCard({ o, stage, now, openTasks, onOpen, onDrag, dragging }: { o: Opportunity; stage: Stage; now: number; openTasks: { due_date: string | null }[]; onOpen: () => void; onDrag: (id: string | null) => void; dragging: boolean }) {
  const { companyById, memberName } = useStore();
  const rot = isRotting(o, stage, now);
  const t = today();
  const lateTasks = openTasks.filter((x) => x.due_date && x.due_date < t).length;
  const st = statusMeta(o.status);
  return (
    <button
      type="button"
      draggable
      onDragStart={() => onDrag(o.id)}
      onDragEnd={() => onDrag(null)}
      onClick={onOpen}
      className={cn("w-full cursor-grab rounded-lg border bg-surface p-2.5 text-left shadow-sm transition-colors hover:border-line-strong", rot ? "border-amber-400/70" : "border-line", dragging && "opacity-40")}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-[13px] font-semibold text-fg">{o.title}</div>
          <div className="truncate text-[11px] text-fg-3">{companyById(o.company_id)?.name || "—"}</div>
        </div>
        {o.owner_id && <Avatar name={memberName(o.owner_id)} className="h-6 w-6 shrink-0 text-[10px]" />}
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-2">
        <span className="tnum text-[13px] font-semibold text-fg">{money(Number(o.value), { cents: false })}</span>
        <span className="tnum text-[10px] font-semibold text-fg-4">{oppNumber(o)}</span>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1">
        {o.status !== "open" && <Pill className={st.pill}>{st.label}</Pill>}
        <span className={cn("inline-flex items-center gap-0.5 text-[11px]", rot ? "font-medium text-amber-600 dark:text-amber-400" : "text-fg-4")}>
          {rot && <AlertTriangle className="h-3 w-3" />}
          {daysInStage(o, now)}d
        </span>
        {openTasks.length > 0 && (
          <span className={cn("inline-flex items-center gap-0.5 text-[11px]", lateTasks ? "font-medium text-red-600 dark:text-red-400" : "text-fg-4")}>
            <CheckSquare className="h-3 w-3" /> {openTasks.length}
          </span>
        )}
        {o.expected_close && <span className={cn("text-[11px]", o.expected_close < t ? "text-red-600 dark:text-red-400" : "text-fg-4")}>· {fmtDay(o.expected_close)}</span>}
        {(o.tags || []).slice(0, 2).map((x) => (
          <Pill key={x} className={neutralPill}>
            {x}
          </Pill>
        ))}
      </div>
    </button>
  );
}

function BulkBar({ selected, onDone, close, exportCsv }: { selected: Opportunity[]; onDone: () => void; close: (ids: string[], s: OppStatus) => void; exportCsv: (o: Opportunity[]) => void }) {
  const { pipelines, stages, opps } = useSales();
  const { members } = useStore();
  const patch = usePatchOpps();
  const ids = selected.map((o) => o.id);
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-brand/40 bg-brand/5 px-3 py-2">
      <span className="text-[13px] font-semibold text-fg">{selected.length} selected</span>
      <Select
        value=""
        onChange={async (e) => {
          const s = stages.rows.find((x) => x.id === e.target.value);
          if (s && (await patch(ids, { stage_id: s.id, pipeline_id: s.pipeline_id }))) toast.success(`Moved to ${s.name}`);
        }}
        className="h-8 w-auto text-[13px]"
        aria-label="Move to stage"
      >
        <option value="">Move to stage…</option>
        {pipelines.rows.map((p) => (
          <optgroup key={p.id} label={p.name}>
            {stagesOf(stages.rows, p.id).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </optgroup>
        ))}
      </Select>
      <Select
        value=""
        onChange={async (e) => {
          const v = e.target.value;
          if (v && (await patch(ids, { owner_id: v === "none" ? null : v }))) toast.success("Owner changed");
        }}
        className="h-8 w-auto text-[13px]"
        aria-label="Assign owner"
      >
        <option value="">Assign owner…</option>
        <option value="none">Nobody</option>
        {members.map((m) => (
          <option key={m.user_id} value={m.user_id}>
            {m.full_name || m.email}
          </option>
        ))}
      </Select>
      <Button size="sm" variant="outline" onClick={() => close(ids, "won")}>
        Won
      </Button>
      <Button size="sm" variant="outline" onClick={() => close(ids, "lost")}>
        Lost
      </Button>
      <Button size="sm" variant="outline" onClick={() => close(ids, "abandoned")}>
        Abandoned
      </Button>
      <Button size="sm" variant="outline" onClick={() => close(ids, "open")}>
        Reopen
      </Button>
      <Button size="sm" variant="outline" onClick={() => exportCsv(selected)}>
        <Download className="h-4 w-4" /> CSV
      </Button>
      <Button
        size="sm"
        variant="danger-ghost"
        onClick={async () => {
          if (!(await confirmDialog({ title: `Delete ${selected.length} opportunit${selected.length === 1 ? "y" : "ies"}?`, body: "Their products, tasks and history are deleted too. The company Timeline keeps its entries.", confirmLabel: "Delete", danger: true }))) return;
          const { error } = await sb().from("tms_opportunities").delete().in("id", ids);
          if (error) return toast.error(errMsg(error));
          for (const id of ids) opps.drop(id);
          onDone();
          toast.success("Deleted");
        }}
      >
        <Trash2 className="h-4 w-4" /> Delete
      </Button>
      <Button size="sm" variant="ghost" className="ml-auto" onClick={onDone}>
        Clear
      </Button>
    </div>
  );
}

/** New opportunity: the essentials, then the full card opens. */
export function NewOpportunity({ open, onClose, onCreated, pipelineId, companyId }: { open: boolean; onClose: () => void; onCreated: (o: Opportunity) => void; pipelineId?: string; companyId?: string }) {
  const sources = useOptions("opp_source");
  const { pipelines, stages, opps, products, items } = useSales();
  const { companies, members, me, scopedCompany, companyById } = useStore();
  type D = { company_id: string; title: string; pipeline_id: string; stage_id: string; value: string; owner_id: string; source: string; contact_name: string; expected_close: string; service: ChargeService; product_id: string };
  const [d, setD] = useState<D | null>(null);
  const [busy, setBusy] = useState(false);
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      const p = pipelineId || pipelines.rows.find((x) => x.active)?.id || pipelines.rows[0]?.id || "";
      const co = companyId || scopedCompany?.id || "";
      setD({ company_id: co, title: "", pipeline_id: p, stage_id: stagesOf(stages.rows, p)[0]?.id || "", value: "", owner_id: me.id, source: "", contact_name: companyById(co)?.contact_name || "", expected_close: "", service: "dispatch", product_id: "" });
    }
  }
  if (!open || !d) return null;
  const set = (p: Partial<D>) => setD({ ...d, ...p });
  const save = async () => {
    if (!d.company_id || !d.title.trim()) return toast.error("Pick a company and give it a title");
    if (!d.stage_id) return toast.error("Pick a stage");
    setBusy(true);
    const product = products.rows.find((p) => p.id === d.product_id);
    const { data, error } = await sb()
      .from("tms_opportunities")
      .insert({
        company_id: d.company_id,
        title: d.title.trim(),
        pipeline_id: d.pipeline_id,
        stage_id: d.stage_id,
        value: Number(d.value) || (product ? Number(product.price) : 0),
        owner_id: d.owner_id || null,
        source: d.source || null,
        contact_name: d.contact_name.trim() || null,
        expected_close: d.expected_close || null,
        service: product?.service || d.service,
        product_id: product?.id || null,
      })
      .select()
      .single();
    if (error) {
      setBusy(false);
      return toast.error(errMsg(error));
    }
    const o = data as Opportunity;
    opps.put(o);
    if (product) {
      const res = await sb()
        .from("tms_opportunity_items")
        .insert({ opportunity_id: o.id, product_id: product.id, name: product.name, service: product.service, kind: product.kind, billing_interval: product.billing_interval, quantity: 1, unit_price: Number(product.price) })
        .select()
        .single();
      if (res.data) items.put(res.data as never);
    }
    setBusy(false);
    toast.success(`${oppNumber(o)} added`);
    onCreated(o);
  };
  return (
    <Modal
      open
      onClose={onClose}
      title="New opportunity"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} loading={busy}>
            Add
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Company" required className="sm:col-span-2">
          <Select value={d.company_id} onChange={(e) => set({ company_id: e.target.value, contact_name: d.contact_name || companyById(e.target.value)?.contact_name || "" })} disabled={!!companyId}>
            <option value="">Select…</option>
            {[...companies]
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.stage === "lead" ? " (lead)" : ""}
                </option>
              ))}
          </Select>
        </Field>
        <Field label="Title" required className="sm:col-span-2">
          <Input value={d.title} onChange={(e) => set({ title: e.target.value })} placeholder="e.g. DOT Compliance yearly plan" autoFocus />
        </Field>
        <Field label="Pipeline">
          <Select value={d.pipeline_id} onChange={(e) => set({ pipeline_id: e.target.value, stage_id: stagesOf(stages.rows, e.target.value)[0]?.id || "" })}>
            {pipelines.rows.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Stage">
          <Select value={d.stage_id} onChange={(e) => set({ stage_id: e.target.value })}>
            {stagesOf(stages.rows, d.pipeline_id).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Product" hint="Added as the first line; more in the card" action={<EditLink href="/sales?tab=products" />}>
          <Select
            value={d.product_id}
            onChange={(e) => {
              const p = products.rows.find((x) => x.id === e.target.value);
              set({ product_id: e.target.value, ...(p ? { service: p.service, title: d.title || p.name, value: d.value || String(p.price) } : {}) });
            }}
          >
            <option value="">None</option>
            {[...products.rows]
              .sort((a, b) => a.sort - b.sort)
              .filter((p) => p.active)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {money(Number(p.price))}
                </option>
              ))}
          </Select>
        </Field>
        <Field label="Value">
          <Input type="number" min={0} step="0.01" prefix="$" value={d.value} onChange={(e) => set({ value: e.target.value })} />
        </Field>
        <Field label="Service">
          <Select value={d.service} onChange={(e) => set({ service: e.target.value as ChargeService })}>
            {SERVICES.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
            <option value="other">Other</option>
          </Select>
        </Field>
        <Field label="Owner">
          <Select value={d.owner_id} onChange={(e) => set({ owner_id: e.target.value })}>
            <option value="">Nobody</option>
            {members.map((m) => (
              <option key={m.user_id} value={m.user_id}>
                {m.full_name || m.email}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Source" action={<EditListButton list="opp_source" />}>
          <Select value={d.source} onChange={(e) => set({ source: e.target.value })}>
            <option value="">—</option>
            {sources.choices(d.source).map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Contact">
          <Input value={d.contact_name} onChange={(e) => set({ contact_name: e.target.value })} />
        </Field>
        <Field label="Expected close">
          <Input type="date" value={d.expected_close} onChange={(e) => set({ expected_close: e.target.value })} />
        </Field>
      </div>
    </Modal>
  );
}
