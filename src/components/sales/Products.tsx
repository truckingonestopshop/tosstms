"use client";

import { useState } from "react";
import { Copy, Layers, Package, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, Empty, Pill, neutralPill } from "@/components/ui/Bits";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { confirmDialog } from "@/components/ui/Confirm";
import { SortHandle, bySort, saveOrder, sortRow, useSortable } from "@/components/ui/Sortable";
import { errMsg, sb } from "@/lib/db";
import { useLiveTable } from "@/lib/live";
import { toast } from "@/lib/toast";
import { cn, money } from "@/lib/format";
import { SERVICES, serviceLabel } from "@/lib/services";
import { INTERVALS, intervalPer, type ChargeInterval, type ChargeService } from "@/lib/billing";
import { PRODUCT_KINDS, type Product, type ProductKind, type ProductVariant } from "@/lib/sales";
import type { ServiceKey } from "@/lib/types";

const svcLabel = (s: ChargeService) => (s === "other" ? "Other" : serviceLabel(s as ServiceKey));
const per = (p: Pick<Product, "kind" | "billing_interval">) => (p.kind === "subscription" ? intervalPer(p.billing_interval) : p.kind === "exchange" ? "exchange" : "one time");

/** What TOSS sells and for how much (used to price opportunities). In the order they're offered. */
export function Products({ products, put, drop }: { products: Product[]; put: (p: Product) => void; drop: (id: string) => void }) {
  const [edit, setEdit] = useState<Product | "new" | null>(null);
  const [showOff, setShowOff] = useState(false);
  const variants = useLiveTable<ProductVariant>("tms_product_variants", { order: "sort", ascending: true });
  const all = [...products].sort(bySort);
  const list = all.filter((p) => showOff || p.active);
  const sort = useSortable(
    list.map((p) => p.id),
    // Hidden (inactive) products keep their place after the visible ones.
    (ids) => saveOrder("tms_products", [...ids.map((id) => all.find((p) => p.id === id)!), ...all.filter((p) => !ids.includes(p.id))], put),
  );
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Checkbox checked={showOff} onChange={setShowOff} label="Show inactive" />
        <span className="hidden text-xs text-fg-4 sm:inline">Drag the handle or use the arrows to set the order they&apos;re offered in.</span>
        <Button variant="primary" className="ml-auto" onClick={() => setEdit("new")}>
          <Plus className="h-4 w-4" /> New product
        </Button>
      </div>
      {list.length === 0 ? (
        <Card>
          <Empty icon={Package} title="No products yet" body="Add what TOSS sells (a service plan, a one-time filing…) with its price, or variants (e.g. one price per state)." />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {list.map((p) => {
            const vs = variants.rows.filter((v) => v.product_id === p.id && v.active);
            const prices = vs.map((v) => Number(v.price));
            return (
              <div key={p.id} {...sort.rowProps(p.id)} className={cn("flex gap-2 rounded-xl border border-line bg-surface p-3 transition-colors hover:border-line-strong", sortRow)}>
                <SortHandle {...sort.handle(p.id)} className="self-start pt-1" />
                <button onClick={() => setEdit(p)} className="min-w-0 flex-1 p-1 text-left">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-[14px] font-semibold text-fg">{p.name}</div>
                      <div className="text-xs text-fg-3">
                        {svcLabel(p.service)}
                        {p.timeframe_days != null && ` · ${p.timeframe_days} day${p.timeframe_days === 1 ? "" : "s"}`}
                      </div>
                    </div>
                    {!p.active && <Pill className={neutralPill}>Inactive</Pill>}
                  </div>
                  <div className="tnum mt-3 text-lg font-bold text-fg">
                    {vs.length ? `${money(Math.min(...prices))}${Math.max(...prices) !== Math.min(...prices) ? ` – ${money(Math.max(...prices))}` : ""}` : money(Number(p.price))}
                    <span className="text-xs font-normal text-fg-3"> {per(p)}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-fg-3">
                    {vs.length > 0 && (
                      <span className="inline-flex items-center gap-1">
                        <Layers className="h-3 w-3" /> {vs.length} variant{vs.length === 1 ? "" : "s"}
                      </span>
                    )}
                    {p.expense != null && <span>Expense {money(Number(p.expense))}</span>}
                    {Number(p.discount_rep) + Number(p.discount_manager) + Number(p.discount_cro) > 0 && <span>Discount up to {money(Number(p.discount_rep) + Number(p.discount_manager) + Number(p.discount_cro))}</span>}
                  </div>
                  {p.description && <p className="mt-1 line-clamp-2 text-xs text-fg-3">{p.description}</p>}
                </button>
              </div>
            );
          })}
        </div>
      )}
      <ProductModal value={edit} onClose={() => setEdit(null)} put={put} drop={drop} nextSort={all.length} />
    </>
  );
}

type Draft = Omit<Product, "id" | "created_at" | "updated_at" | "sort">;
const blank: Draft = {
  name: "",
  service: "dispatch",
  kind: "subscription",
  price: 0,
  billing_interval: "monthly",
  description: null,
  active: true,
  expense: null,
  timeframe_days: null,
  discount_rep: 0,
  discount_manager: 0,
  discount_cro: 0,
};
/** A variant row being edited (no id yet when new). */
type VDraft = { id?: string; name: string; price: string; expense: string; timeframe_days: string; active: boolean };
const num = (s: string) => (s.trim() === "" ? null : Number(s));

/**
 * Add or change a product: price (or variants, each with its price), expense, timeframe and the
 * discounts a Rep / Manager / CRO may give. `initial` prefills a new one (e.g. "Save to products"
 * from an opportunity line); `onSaved` gets the saved product.
 */
export function ProductModal({
  value,
  onClose,
  put,
  drop,
  nextSort,
  initial,
  onSaved,
}: {
  value: Product | "new" | null;
  onClose: () => void;
  put: (p: Product) => void;
  drop: (id: string) => void;
  nextSort: number;
  initial?: Partial<Draft>;
  onSaved?: (p: Product) => void;
}) {
  const [d, setD] = useState<Draft>(blank);
  const [vars, setVars] = useState<VDraft[]>([]);
  const [opened, setOpened] = useState("");
  const editing = value && value !== "new" ? value : null;
  const key = value === "new" ? "new" : value?.id ?? "";
  if (value !== null && opened !== key) {
    setOpened(key);
    setD(editing ? { ...blank, ...editing, price: Number(editing.price) } : { ...blank, ...initial });
    setVars([]);
    if (editing)
      sb()
        .from("tms_product_variants")
        .select("*")
        .eq("product_id", editing.id)
        .order("sort")
        .then(({ data }) =>
          setVars(
            ((data || []) as ProductVariant[]).map((v) => ({ id: v.id, name: v.name, price: String(v.price ?? ""), expense: v.expense == null ? "" : String(v.expense), timeframe_days: v.timeframe_days == null ? "" : String(v.timeframe_days), active: v.active })),
          ),
        );
  }
  if (value === null && opened) setOpened("");
  const set = (p: Partial<Draft>) => setD((x) => ({ ...x, ...p }));
  const setVar = (i: number, p: Partial<VDraft>) => setVars((l) => l.map((v, j) => (j === i ? { ...v, ...p } : v)));
  const [saving, setSaving] = useState(false);

  const row = () => ({
    name: d.name.trim(),
    service: d.service,
    kind: d.kind,
    price: Number(d.price) || 0,
    billing_interval: d.kind === "subscription" ? d.billing_interval || "monthly" : null,
    description: d.description,
    active: d.active,
    expense: d.expense == null || Number.isNaN(Number(d.expense)) ? null : Number(d.expense),
    timeframe_days: d.timeframe_days == null || Number.isNaN(Number(d.timeframe_days)) ? null : Math.round(Number(d.timeframe_days)),
    discount_rep: Number(d.discount_rep) || 0,
    discount_manager: Number(d.discount_manager) || 0,
    discount_cro: Number(d.discount_cro) || 0,
  });
  /** Variants: new ones added, changed ones saved, removed ones deleted. */
  const saveVariants = async (productId: string) => {
    const keep = vars.filter((v) => v.name.trim());
    const { data: before } = await sb().from("tms_product_variants").select("id").eq("product_id", productId);
    const gone = ((before || []) as { id: string }[]).map((x) => x.id).filter((id) => !keep.some((v) => v.id === id));
    if (gone.length) await sb().from("tms_product_variants").delete().in("id", gone);
    for (const [i, v] of keep.entries()) {
      const r = { product_id: productId, name: v.name.trim(), price: Number(v.price) || 0, expense: num(v.expense), timeframe_days: num(v.timeframe_days), active: v.active, sort: i };
      const res = v.id ? await sb().from("tms_product_variants").update(r).eq("id", v.id) : await sb().from("tms_product_variants").insert(r);
      if (res.error) return toast.error(errMsg(res.error)), false;
    }
    return true;
  };
  const save = async () => {
    if (!d.name.trim()) return toast.error("Give the product a name");
    if (vars.some((v) => !v.name.trim() && v.price)) return toast.error("Name every variant (e.g. the state)");
    setSaving(true);
    const res = editing ? await sb().from("tms_products").update(row()).eq("id", editing.id).select().single() : await sb().from("tms_products").insert({ ...row(), sort: nextSort }).select().single();
    if (res.error) {
      setSaving(false);
      return toast.error(errMsg(res.error));
    }
    const ok = await saveVariants((res.data as Product).id);
    setSaving(false);
    put(res.data as Product);
    onSaved?.(res.data as Product);
    if (ok) {
      toast.success("Product saved");
      onClose();
    }
  };
  const duplicate = async () => {
    if (!editing) return;
    const { data, error } = await sb()
      .from("tms_products")
      .insert({ ...row(), name: `${d.name.trim() || editing.name} (copy)`, sort: nextSort })
      .select()
      .single();
    if (error) return toast.error(errMsg(error));
    await saveVariants((data as Product).id).then(() => undefined);
    put(data as Product);
    toast.success("Product duplicated");
    onClose();
  };
  const remove = async () => {
    if (!editing) return;
    if (!(await confirmDialog({ title: `Delete ${editing.name}?`, body: "Opportunities keep their value; they just lose the product link. To stop selling it, untick Active instead.", confirmLabel: "Delete", danger: true }))) return;
    const { error } = await sb().from("tms_products").delete().eq("id", editing.id);
    if (error) return toast.error(errMsg(error));
    drop(editing.id);
    onClose();
  };
  const totalDiscount = (Number(d.discount_rep) || 0) + (Number(d.discount_manager) || 0) + (Number(d.discount_cro) || 0);

  return (
    <Modal
      open={value !== null}
      onClose={onClose}
      title={editing ? "Product" : "New product"}
      size="lg"
      footer={
        <>
          {editing && (
            <>
              <Button variant="danger-ghost" onClick={remove} className="mr-auto">
                <Trash2 className="h-4 w-4" /> Delete
              </Button>
              <Button variant="ghost" onClick={duplicate}>
                <Copy className="h-4 w-4" /> Duplicate
              </Button>
            </>
          )}
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} disabled={saving}>
            Save
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label="Name" required className="col-span-2 sm:col-span-4">
          <Input value={d.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Articles of Incorporation" autoFocus />
        </Field>
        <Field label="Service" className="col-span-2">
          <Select value={d.service} onChange={(e) => set({ service: e.target.value as ChargeService })}>
            {SERVICES.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
            <option value="other">Other</option>
          </Select>
        </Field>
        <Field label="Type">
          <Select value={d.kind} onChange={(e) => set({ kind: e.target.value as ProductKind })}>
            {PRODUCT_KINDS.map((k) => (
              <option key={k.v} value={k.v}>
                {k.label}
              </option>
            ))}
          </Select>
        </Field>
        {d.kind === "subscription" ? (
          <Field label="Billed">
            <Select value={d.billing_interval || "monthly"} onChange={(e) => set({ billing_interval: e.target.value as ChargeInterval })}>
              {INTERVALS.map((i) => (
                <option key={i.v} value={i.v}>
                  {i.label}
                </option>
              ))}
            </Select>
          </Field>
        ) : (
          <div className="hidden sm:block" />
        )}
        <Field label="Price" hint={vars.some((v) => v.name.trim()) ? "Used when no variant is picked" : undefined}>
          <Input type="number" min={0} step="0.01" prefix="$" value={d.price || ""} onChange={(e) => set({ price: Number(e.target.value) })} />
        </Field>
        <Field label="Expense" hint="What TOSS pays (fees). Optional">
          <Input type="number" min={0} step="0.01" prefix="$" value={d.expense ?? ""} onChange={(e) => set({ expense: e.target.value === "" ? null : Number(e.target.value) })} />
        </Field>
        <Field label="Timeframe" hint="Sets the case's due date">
          <Input type="number" min={0} step="1" suffix="days" value={d.timeframe_days ?? ""} onChange={(e) => set({ timeframe_days: e.target.value === "" ? null : Number(e.target.value) })} />
        </Field>
        <div className="hidden sm:block" />
      </div>

      <section className="mt-5">
        <div className="mb-1 flex items-center justify-between">
          <h3 className="text-[13px] font-semibold text-fg">Variants</h3>
          <Button size="xs" variant="ghost" onClick={() => setVars([...vars, { name: "", price: d.price ? String(d.price) : "", expense: "", timeframe_days: "", active: true }])}>
            <Plus className="h-3.5 w-3.5" /> Add variant
          </Button>
        </div>
        <p className="mb-2 text-xs text-fg-3">Versions with their own price, e.g. one per state. When a product has variants, the agent must pick one on the opportunity. Empty expense / timeframe use the product&apos;s.</p>
        {vars.length > 0 && (
          <div className="overflow-x-auto rounded-lg border border-line">
            <table className="w-full min-w-[560px] text-[13px]">
              <thead className="bg-surface-2/60 text-left text-xs text-fg-3">
                <tr>
                  <th className="px-2 py-1.5 font-medium">Variant</th>
                  <th className="w-28 px-2 py-1.5 font-medium">Price</th>
                  <th className="w-28 px-2 py-1.5 font-medium">Expense</th>
                  <th className="w-24 px-2 py-1.5 font-medium">Days</th>
                  <th className="w-16 px-2 py-1.5 font-medium">Active</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {vars.map((v, i) => (
                  <tr key={v.id || `n${i}`}>
                    <td className="px-2 py-1">
                      <Input value={v.name} onChange={(e) => setVar(i, { name: e.target.value })} placeholder="e.g. Florida" className="h-8" aria-label="Variant name" />
                    </td>
                    <td className="px-2 py-1">
                      <Input type="number" min={0} step="0.01" prefix="$" value={v.price} onChange={(e) => setVar(i, { price: e.target.value })} className="h-8" aria-label="Variant price" />
                    </td>
                    <td className="px-2 py-1">
                      <Input type="number" min={0} step="0.01" prefix="$" value={v.expense} onChange={(e) => setVar(i, { expense: e.target.value })} placeholder={d.expense != null ? String(d.expense) : ""} className="h-8" aria-label="Variant expense" />
                    </td>
                    <td className="px-2 py-1">
                      <Input type="number" min={0} step="1" value={v.timeframe_days} onChange={(e) => setVar(i, { timeframe_days: e.target.value })} placeholder={d.timeframe_days != null ? String(d.timeframe_days) : ""} className="h-8" aria-label="Variant days" />
                    </td>
                    <td className="px-2 py-1 text-center">
                      <Checkbox checked={v.active} onChange={(x) => setVar(i, { active: x })} />
                    </td>
                    <td className="px-1 py-1">
                      <button onClick={() => setVars(vars.filter((_, j) => j !== i))} className="text-fg-4 hover:text-red-600" aria-label={`Remove ${v.name || "variant"}`}>
                        <X className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mt-5">
        <h3 className="mb-1 text-[13px] font-semibold text-fg">Discounts allowed</h3>
        <p className="mb-2 text-xs text-fg-3">In dollars, per line. A rep can give up to the Rep amount, a manager Rep + Manager, the CRO all three{totalDiscount ? ` (up to ${money(totalDiscount)})` : ""}.</p>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Rep">
            <Input type="number" min={0} step="0.01" prefix="$" value={d.discount_rep || ""} onChange={(e) => set({ discount_rep: Number(e.target.value) || 0 })} />
          </Field>
          <Field label="Manager (extra)">
            <Input type="number" min={0} step="0.01" prefix="$" value={d.discount_manager || ""} onChange={(e) => set({ discount_manager: Number(e.target.value) || 0 })} />
          </Field>
          <Field label="CRO (extra)">
            <Input type="number" min={0} step="0.01" prefix="$" value={d.discount_cro || ""} onChange={(e) => set({ discount_cro: Number(e.target.value) || 0 })} />
          </Field>
        </div>
      </section>

      <Field label="Description" className="mt-5">
        <Textarea rows={2} value={d.description || ""} onChange={(e) => set({ description: e.target.value || null })} />
      </Field>
      <Checkbox className="mt-3" checked={d.active} onChange={(v) => set({ active: v })} label="Active (offered for new opportunities)" />
    </Modal>
  );
}
