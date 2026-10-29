"use client";

import Link from "next/link";
import { useState } from "react";
import { Briefcase, Building2, Check, Copy, FileText, MoreHorizontal, Package, PackagePlus, PenLine, Plus, Settings2, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, Pill, neutralPill } from "@/components/ui/Bits";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/Field";
import { Drawer } from "@/components/ui/Modal";
import { MenuItem, MenuSep, Popover } from "@/components/ui/Menu";
import { SortHandle, bySort, saveOrder, sortRow, useSortable } from "@/components/ui/Sortable";
import { EditListButton, useOptions } from "@/components/ui/OptionList";
import { confirmDialog } from "@/components/ui/Confirm";
import { errMsg, sb } from "@/lib/db";
import { useLiveTable } from "@/lib/live";
import { useStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import { cn, fmtDay, money, relTime, today } from "@/lib/format";
import { SERVICES } from "@/lib/services";
import { intervalPer, INTERVALS, type ChargeService } from "@/lib/billing";
import { daysInStage, isRotting, itemTotal, oppNumber, statusMeta, weighted, type OppEvent, type OppItem, type OppTask, type Opportunity, type Product } from "@/lib/sales";
import { stagesOf, useSales } from "./SalesProvider";
import { useCloseFlow, usePatchOpps } from "./OppClose";
import { ProductModal } from "./Products";
import { OppAgreements } from "./Agreements";

type Draft = Pick<Opportunity, "title" | "company_id" | "pipeline_id" | "stage_id" | "value" | "owner_id" | "followers" | "source" | "contact_name" | "expected_close" | "service" | "notes" | "custom"> & { tagsText: string };
const draftOf = (o: Opportunity): Draft => ({
  title: o.title,
  company_id: o.company_id,
  pipeline_id: o.pipeline_id,
  stage_id: o.stage_id,
  value: Number(o.value),
  owner_id: o.owner_id,
  followers: o.followers || [],
  source: o.source,
  contact_name: o.contact_name,
  expected_close: o.expected_close,
  service: o.service,
  notes: o.notes,
  custom: o.custom || {},
  tagsText: (o.tags || []).join(", "),
});

/** The opportunity card: details, products, tasks, agreements, notes and history. */
export function OpportunityDetail({ id, onClose }: { id: string | null; onClose: () => void }) {
  const sources = useOptions("opp_source");
  const { opps, pipelines, stages, items, fields } = useSales();
  const { companies, companyById, members, memberName } = useStore();
  const o = opps.rows.find((x) => x.id === id) || null;
  const [d, setD] = useState<Draft | null>(null);
  const [loadedFor, setLoadedFor] = useState("");
  const [now] = useState(() => Date.now());
  const [close, closeNode] = useCloseFlow();
  const patch = usePatchOpps();
  const [saving, setSaving] = useState(false);
  if (o && loadedFor !== o.id) {
    setLoadedFor(o.id);
    setD(draftOf(o));
  }
  if (!o && loadedFor) setLoadedFor("");
  if (!o || !d) return closeNode;

  const lines = items.rows.filter((i) => i.opportunity_id === o.id);
  const stage = stages.rows.find((s) => s.id === o.stage_id);
  const company = companyById(o.company_id);
  const st = statusMeta(o.status);
  const set = (p: Partial<Draft>) => setD({ ...d, ...p });
  // With products the value follows them (saved right away), so it doesn't count as an edit.
  const comparable = (x: Draft) => JSON.stringify({ ...x, value: lines.length ? 0 : Number(x.value) });
  const dirty = comparable(d) !== comparable(draftOf(o));

  const save = async () => {
    if (!d.title.trim() || !d.company_id) return toast.error("Title and company are needed");
    const missing = fields.rows.filter((f) => f.active && f.required && (d.custom[f.id] === undefined || d.custom[f.id] === null || d.custom[f.id] === ""));
    if (missing.length) return toast.error(`Fill in ${missing.map((f) => f.label).join(", ")}`);
    setSaving(true);
    const { tagsText, ...rest } = d;
    const ok = await patch([o.id], {
      ...rest,
      title: d.title.trim(),
      value: lines.length ? lines.reduce((s, i) => s + itemTotal(i), 0) : Number(d.value) || 0,
      contact_name: d.contact_name?.trim() || null,
      tags: [
        ...new Set(
          tagsText
            .split(",")
            .map((x) => x.trim())
            .filter(Boolean),
        ),
      ],
    });
    setSaving(false);
    if (ok) {
      setLoadedFor("");
      toast.success("Saved");
    }
  };
  const remove = async () => {
    if (!(await confirmDialog({ title: `Delete ${oppNumber(o)}?`, body: "Its products, tasks and history are deleted too. The company Timeline keeps its entries.", confirmLabel: "Delete", danger: true }))) return;
    const { error } = await sb().from("tms_opportunities").delete().eq("id", o.id);
    if (error) return toast.error(errMsg(error));
    opps.drop(o.id);
    onClose();
  };

  return (
    <>
      <Drawer
        open
        onClose={onClose}
        width="max-w-5xl"
        title={
          <span className="flex flex-wrap items-center gap-2">
            <span className="tnum text-fg-4">{oppNumber(o)}</span> {o.title} <Pill className={st.pill}>{st.label}</Pill>
          </span>
        }
        subtitle={
          <span>
            {company?.name || "—"} · {pipelines.rows.find((p) => p.id === o.pipeline_id)?.name} · {stage?.name || "—"} ·{" "}
            <span className={cn(isRotting(o, stage, now) && "font-medium text-amber-600 dark:text-amber-400")}>{daysInStage(o, now)} days in stage</span>
          </span>
        }
        footer={
          <>
            <Button variant="danger-ghost" onClick={remove}>
              <Trash2 className="h-4 w-4" /> Delete
            </Button>
            <div className="ml-auto flex flex-wrap gap-2">
              {o.status === "open" ? (
                <>
                  <Button variant="outline" onClick={() => close([o.id], "abandoned")}>
                    Abandoned
                  </Button>
                  <Button variant="outline" className="text-red-600 dark:text-red-400" onClick={() => close([o.id], "lost")}>
                    Lost
                  </Button>
                  <Button variant="outline" className="text-emerald-700 dark:text-emerald-400" onClick={() => close([o.id], "won")}>
                    <Check className="h-4 w-4" /> Won
                  </Button>
                </>
              ) : (
                <Button variant="outline" onClick={() => close([o.id], "open")}>
                  Reopen
                </Button>
              )}
              <Button variant="primary" onClick={save} loading={saving} disabled={!dirty}>
                Save
              </Button>
            </div>
          </>
        }
      >
        <div className="grid gap-4 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="space-y-4">
            <Card>
              <CardHeader title="Details" />
              <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
                <Field label="Title" required className="sm:col-span-2">
                  <Input value={d.title} onChange={(e) => set({ title: e.target.value })} />
                </Field>
                <Field label="Company" required className="sm:col-span-2">
                  <Select value={d.company_id} onChange={(e) => set({ company_id: e.target.value })}>
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
                <Field label="Pipeline">
                  <Select value={d.pipeline_id || ""} onChange={(e) => set({ pipeline_id: e.target.value, stage_id: stagesOf(stages.rows, e.target.value)[0]?.id || null })}>
                    {pipelines.rows.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Stage">
                  <Select value={d.stage_id || ""} onChange={(e) => set({ stage_id: e.target.value })}>
                    {stagesOf(stages.rows, d.pipeline_id).map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.probability}%)
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Value" hint={lines.length ? "Sum of the products" : `${money(weighted(o, stage), { cents: false })} weighted`}>
                  <Input type="number" min={0} step="0.01" prefix="$" value={lines.length ? lines.reduce((s, i) => s + itemTotal(i), 0) : d.value || ""} onChange={(e) => set({ value: Number(e.target.value) })} disabled={lines.length > 0} />
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
                  <Select value={d.owner_id || ""} onChange={(e) => set({ owner_id: e.target.value || null })}>
                    <option value="">Nobody</option>
                    {members.map((m) => (
                      <option key={m.user_id} value={m.user_id}>
                        {m.full_name || m.email}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Followers">
                  <Select value="" onChange={(e) => e.target.value && set({ followers: [...d.followers, e.target.value] })}>
                    <option value="">Add a follower…</option>
                    {members
                      .filter((m) => !d.followers.includes(m.user_id))
                      .map((m) => (
                        <option key={m.user_id} value={m.user_id}>
                          {m.full_name || m.email}
                        </option>
                      ))}
                  </Select>
                  {d.followers.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {d.followers.map((f) => (
                        <button key={f} type="button" onClick={() => set({ followers: d.followers.filter((x) => x !== f) })} className="inline-flex items-center gap-1 rounded-md bg-surface-2 px-1.5 py-0.5 text-[11px] text-fg-2 hover:text-fg">
                          {memberName(f)} <X className="h-3 w-3" />
                        </button>
                      ))}
                    </div>
                  )}
                </Field>
                <Field label="Source" action={<EditListButton list="opp_source" usage={(v) => opps.rows.filter((x) => x.source === v).length} />}>
                  <Select value={d.source || ""} onChange={(e) => set({ source: e.target.value || null })}>
                    <option value="">—</option>
                    {sources.choices(d.source).map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Contact">
                  <Input value={d.contact_name || ""} onChange={(e) => set({ contact_name: e.target.value })} />
                </Field>
                <Field label="Expected close">
                  <Input type="date" value={d.expected_close || ""} onChange={(e) => set({ expected_close: e.target.value || null })} />
                </Field>
                <Field label="Tags" hint="Comma separated">
                  <Input value={d.tagsText} onChange={(e) => set({ tagsText: e.target.value })} placeholder="hot, 5+ trucks" />
                </Field>
                {fields.rows
                  .filter((f) => f.active)
                  .map((f) => {
                    const v = d.custom[f.id];
                    const put = (x: string | number | boolean | null) => set({ custom: { ...d.custom, [f.id]: x } });
                    return (
                      <Field key={f.id} label={f.label} required={f.required}>
                        {f.type === "boolean" ? (
                          <Checkbox checked={!!v} onChange={put} label="Yes" className="h-9" />
                        ) : f.type === "select" ? (
                          <Select value={String(v ?? "")} onChange={(e) => put(e.target.value || null)}>
                            <option value="">—</option>
                            {f.options.map((x) => (
                              <option key={x} value={x}>
                                {x}
                              </option>
                            ))}
                          </Select>
                        ) : (
                          <Input type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"} value={String(v ?? "")} onChange={(e) => put(e.target.value === "" ? null : f.type === "number" ? Number(e.target.value) : e.target.value)} />
                        )}
                      </Field>
                    );
                  })}
                <Field label="Notes" className="sm:col-span-2">
                  <Textarea rows={3} value={d.notes || ""} onChange={(e) => set({ notes: e.target.value || null })} />
                </Field>
              </div>
            </Card>
            <div className="flex flex-wrap gap-2">
              <Link href={`/fleet?company=${o.company_id}`} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-[13px] font-medium text-fg hover:bg-surface-2">
                <Building2 className="h-4 w-4" /> Company profile
              </Link>
              <Link href={`/invoices/new?opportunity=${o.id}`} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-[13px] font-medium text-fg hover:bg-surface-2">
                <FileText className="h-4 w-4" /> Create invoice
              </Link>
              <Link href={`/cases?new=1&company=${o.company_id}&opportunity=${o.id}`} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-[13px] font-medium text-fg hover:bg-surface-2">
                <Briefcase className="h-4 w-4" /> Open a case
              </Link>
            </div>
          </div>

          <div className="space-y-4">
            <Products o={o} lines={lines} />
            <Tasks o={o} />
            <OppAgreements opportunity={o} />
            <History o={o} />
          </div>
        </div>
      </Drawer>
      {closeNode}
    </>
  );
}

/** Products on the opportunity; the value follows their total. Lines can be reordered, copied and
 *  saved to the product list; the Add menu searches products, adds a custom line or a new product. */
function Products({ o, lines }: { o: Opportunity; lines: OppItem[] }) {
  const { products, items } = useSales();
  const patch = usePatchOpps();
  const [q, setQ] = useState("");
  const [productModal, setProductModal] = useState<{ initial?: Partial<Product>; line?: OppItem } | null>(null);
  const catalog = [...products.rows].sort(bySort);
  const sync = (next: OppItem[]) => patch([o.id], { value: next.reduce((s, i) => s + itemTotal(i), 0) });
  const insert = async (row: Partial<OppItem>) => {
    const { data, error } = await sb().from("tms_opportunity_items").insert(row).select().single();
    if (error) return toast.error(errMsg(error));
    items.put(data as OppItem);
    sync([...lines, data as OppItem]);
  };
  const addProduct = (p: Product) =>
    insert({ opportunity_id: o.id, product_id: p.id, name: p.name, service: p.service, kind: p.kind, billing_interval: p.billing_interval, quantity: 1, unit_price: Number(p.price), sort: lines.length });
  const addCustom = () => insert({ opportunity_id: o.id, product_id: null, name: "Custom item", service: o.service, kind: "one_time", billing_interval: null, quantity: 1, unit_price: 0, sort: lines.length });
  const strip = (i: OppItem) => {
    const { id: _id, ...rest } = i;
    void _id;
    return rest;
  };
  const duplicate = (i: OppItem) => insert({ ...strip(i), sort: lines.length });
  const update = async (i: OppItem, p: Partial<OppItem>) => {
    const { data, error } = await sb().from("tms_opportunity_items").update(p).eq("id", i.id).select().single();
    if (error) return toast.error(errMsg(error));
    items.put(data as OppItem);
    sync(lines.map((x) => (x.id === i.id ? (data as OppItem) : x)));
  };
  const remove = async (i: OppItem) => {
    const { error } = await sb().from("tms_opportunity_items").delete().eq("id", i.id);
    if (error) return toast.error(errMsg(error));
    items.drop(i.id);
    sync(lines.filter((x) => x.id !== i.id));
    toast.success(`${i.name} removed`, { label: "Undo", run: () => insert(strip(i)) });
  };
  const sort = useSortable(
    lines.map((i) => i.id),
    (ids) => saveOrder("tms_opportunity_items", ids.map((id) => lines.find((l) => l.id === id)!), items.put),
  );
  const total = lines.reduce((s, i) => s + itemTotal(i), 0);
  const monthly = lines.filter((i) => i.kind === "subscription").reduce((s, i) => s + itemTotal(i), 0);
  const found = catalog.filter((p) => p.active && (!q || `${p.name} ${p.description || ""}`.toLowerCase().includes(q.toLowerCase())));
  return (
    <Card>
      <CardHeader
        title="Products"
        subtitle={lines.length ? `${money(total)}${monthly ? ` · ${money(monthly)} recurring` : ""}` : "What you're selling them"}
        actions={
          <Popover
            align="end"
            width={300}
            onOpenChange={(v) => !v && setQ("")}
            trigger={({ toggle, ref }) => (
              <Button ref={ref} size="sm" variant="outline" onClick={toggle}>
                <Plus className="h-4 w-4" /> Add
              </Button>
            )}
          >
            {(close) => (
              <>
                {catalog.some((p) => p.active) && (
                  <div className="p-1">
                    <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a product" className="h-8 text-[13px]" autoFocus />
                  </div>
                )}
                {found.map((p) => (
                  <MenuItem key={p.id} icon={Package} onClick={() => (close(), addProduct(p))} hint={`${money(Number(p.price), { cents: false })}${p.kind === "subscription" ? intervalPer(p.billing_interval) : ""}`}>
                    {p.name}
                  </MenuItem>
                ))}
                {q && found.length === 0 && <div className="px-2.5 py-2 text-xs text-fg-4">No product matches.</div>}
                {catalog.some((p) => p.active) && <MenuSep />}
                <MenuItem icon={PenLine} onClick={() => (close(), addCustom())}>
                  Custom item
                </MenuItem>
                <MenuItem icon={PackagePlus} onClick={() => (close(), setProductModal({ initial: q ? { name: q } : undefined }))}>
                  {q ? `New product "${q}"` : "New product"}
                </MenuItem>
                <MenuSep />
                <Link href="/sales?tab=products" onClick={close} className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] text-fg-3 hover:bg-surface-2 hover:text-fg">
                  <Settings2 className="h-4 w-4 opacity-70" /> Manage products
                </Link>
              </>
            )}
          </Popover>
        }
      />
      {lines.length === 0 ? (
        <div className="px-4 py-5 text-center text-xs text-fg-4">No products yet. Add one, or type the value in Details.</div>
      ) : (
        <ul className="divide-y divide-line">
          {lines.map((i) => (
            <li key={i.id} {...sort.rowProps(i.id)} className={cn("flex items-start gap-1.5 py-2 pl-1.5 pr-3", sortRow)}>
              <SortHandle {...sort.handle(i.id)} className="mt-1.5" />
              <div className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_56px_88px] items-start gap-2 sm:grid-cols-[minmax(0,1fr)_64px_96px]">
                <div className="min-w-0">
                  <Input key={`${i.id}-${i.name}`} defaultValue={i.name} onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== i.name && update(i, { name: e.target.value.trim() })} className="h-8 text-[13px]" aria-label="Name" />
                  <div className="mt-1 flex flex-wrap items-center gap-1">
                    <select value={i.kind} onChange={(e) => update(i, { kind: e.target.value as OppItem["kind"], billing_interval: e.target.value === "subscription" ? i.billing_interval || "monthly" : null })} className="rounded bg-transparent text-[11px] text-fg-3" aria-label="Type">
                      <option value="one_time">One-time</option>
                      <option value="subscription">Recurring</option>
                    </select>
                    {i.kind === "subscription" && (
                      <select value={i.billing_interval || "monthly"} onChange={(e) => update(i, { billing_interval: e.target.value as OppItem["billing_interval"] })} className="rounded bg-transparent text-[11px] text-fg-3" aria-label="Billed">
                        {INTERVALS.map((x) => (
                          <option key={x.v} value={x.v}>
                            {x.label}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>
                <Input key={`${i.id}-q${i.quantity}`} type="number" min={0} step="1" defaultValue={Number(i.quantity)} onBlur={(e) => Number(e.target.value) !== Number(i.quantity) && update(i, { quantity: Number(e.target.value) || 0 })} className="h-8 text-[13px]" aria-label="Quantity" />
                <div>
                  <Input key={`${i.id}-p${i.unit_price}`} type="number" min={0} step="0.01" prefix="$" defaultValue={Number(i.unit_price)} onBlur={(e) => Number(e.target.value) !== Number(i.unit_price) && update(i, { unit_price: Number(e.target.value) || 0 })} className="h-8 text-[13px]" aria-label="Price" />
                  <div className="tnum mt-1 text-right text-[12px] font-medium text-fg">
                    {money(itemTotal(i), { cents: false })}
                    {i.kind === "subscription" && <span className="font-normal text-fg-4">{intervalPer(i.billing_interval)}</span>}
                  </div>
                </div>
              </div>
              <Popover
                align="end"
                width={200}
                trigger={({ toggle, ref }) => (
                  <button ref={ref} type="button" onClick={toggle} className="mt-1 rounded p-1 text-fg-4 hover:bg-surface-2 hover:text-fg" aria-label="Line actions">
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                )}
              >
                {(close) => (
                  <>
                    <MenuItem icon={Copy} onClick={() => (close(), duplicate(i))}>
                      Duplicate
                    </MenuItem>
                    {!i.product_id && (
                      <MenuItem
                        icon={PackagePlus}
                        onClick={() => (
                          close(),
                          setProductModal({
                            line: i,
                            initial: { name: i.name, service: i.service, kind: i.kind, price: Number(i.unit_price), billing_interval: i.billing_interval },
                          })
                        )}
                      >
                        Save to products
                      </MenuItem>
                    )}
                    <MenuSep />
                    <MenuItem icon={Trash2} danger onClick={() => (close(), remove(i))}>
                      Remove
                    </MenuItem>
                  </>
                )}
              </Popover>
            </li>
          ))}
        </ul>
      )}
      <ProductModal
        value={productModal ? "new" : null}
        initial={productModal?.initial}
        nextSort={catalog.length}
        onClose={() => setProductModal(null)}
        put={products.put}
        drop={products.drop}
        onSaved={(p) => (productModal?.line ? update(productModal.line, { product_id: p.id }) : addProduct(p))}
      />
    </Card>
  );
}

function Tasks({ o }: { o: Opportunity }) {
  const { tasks } = useSales();
  const { members, memberName, me } = useStore();
  const list = tasks.rows.filter((x) => x.opportunity_id === o.id).sort((a, b) => Number(a.done) - Number(b.done) || (a.due_date || "9").localeCompare(b.due_date || "9"));
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [who, setWho] = useState("");
  const t = today();
  const add = async () => {
    if (!title.trim()) return;
    const { data, error } = await sb()
      .from("tms_opportunity_tasks")
      .insert({ opportunity_id: o.id, title: title.trim(), due_date: due || null, assignee: who || o.owner_id || me.id })
      .select()
      .single();
    if (error) return toast.error(errMsg(error));
    tasks.put(data as OppTask);
    setTitle("");
    setDue("");
  };
  const toggle = async (x: OppTask) => {
    const { data, error } = await sb()
      .from("tms_opportunity_tasks")
      .update({ done: !x.done, done_at: x.done ? null : new Date().toISOString() })
      .eq("id", x.id)
      .select()
      .single();
    if (error) return toast.error(errMsg(error));
    tasks.put(data as OppTask);
  };
  const remove = async (x: OppTask) => {
    const { error } = await sb().from("tms_opportunity_tasks").delete().eq("id", x.id);
    if (error) return toast.error(errMsg(error));
    tasks.drop(x.id);
  };
  return (
    <Card>
      <CardHeader title="Tasks" subtitle={`${list.filter((x) => !x.done).length} open`} />
      <ul className="divide-y divide-line">
        {list.map((x) => (
          <li key={x.id} className="flex items-center gap-2 px-4 py-2">
            <Checkbox checked={x.done} onChange={() => toggle(x)} />
            <div className="min-w-0 flex-1">
              <div className={cn("truncate text-[13px]", x.done ? "text-fg-4 line-through" : "text-fg")}>{x.title}</div>
              <div className="text-[11px] text-fg-4">
                {x.assignee ? memberName(x.assignee) : "Nobody"}
                {x.due_date && <span className={cn(!x.done && x.due_date < t && "font-medium text-red-600 dark:text-red-400")}> · due {fmtDay(x.due_date)}</span>}
              </div>
            </div>
            <button type="button" onClick={() => remove(x)} className="rounded p-1 text-fg-4 hover:text-red-600" aria-label="Delete task">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2 border-t border-line p-3">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} placeholder="Call back, send proposal…" className="min-w-[160px] flex-1" />
        <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="w-[150px]" aria-label="Due" />
        <Select value={who} onChange={(e) => setWho(e.target.value)} className="w-[140px]" aria-label="Assign to">
          <option value="">{o.owner_id ? "Owner" : "Me"}</option>
          {members.map((m) => (
            <option key={m.user_id} value={m.user_id}>
              {m.full_name || m.email}
            </option>
          ))}
        </Select>
        <Button variant="outline" onClick={add} aria-label="Add task">
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </Card>
  );
}

/** Notes and the automatic history (created, stage moves, won / lost), newest first. */
function History({ o }: { o: Opportunity }) {
  const { memberName } = useStore();
  const events = useLiveTable<OppEvent>("tms_opportunity_events", { filter: { opportunity_id: o.id } });
  const [note, setNote] = useState("");
  const add = async () => {
    if (!note.trim()) return;
    const { data, error } = await sb().from("tms_opportunity_events").insert({ opportunity_id: o.id, kind: "note", message: note.trim() }).select().single();
    if (error) return toast.error(errMsg(error));
    events.put(data as OppEvent);
    setNote("");
  };
  return (
    <Card>
      <CardHeader title="Notes & history" />
      <div className="flex gap-2 border-b border-line p-3">
        <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note (call summary, what they asked…)" className="flex-1" />
        <Button variant="outline" onClick={add} className="self-end">
          Add
        </Button>
      </div>
      <ul className="max-h-[360px] divide-y divide-line overflow-y-auto">
        {events.rows.map((e) => (
          <li key={e.id} className="px-4 py-2">
            <div className="flex items-center gap-2 text-[11px] text-fg-4">
              <Pill className={e.kind === "note" ? "bg-amber-500/10 text-amber-700 ring-amber-600/25 dark:text-amber-300" : neutralPill}>{e.kind === "note" ? "Note" : e.kind === "stage" ? "Stage" : e.kind === "status" ? "Status" : e.kind === "created" ? "Created" : "Update"}</Pill>
              {e.actor_name || (e.actor_id ? memberName(e.actor_id) : "System")} · {relTime(e.created_at)}
            </div>
            <div className="mt-0.5 whitespace-pre-wrap text-[13px] text-fg">{e.message}</div>
          </li>
        ))}
        {events.loaded && events.rows.length === 0 && <li className="px-4 py-5 text-center text-xs text-fg-4">Nothing yet.</li>}
      </ul>
    </Card>
  );
}
