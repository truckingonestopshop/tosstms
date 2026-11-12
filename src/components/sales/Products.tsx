"use client";

import { useState } from "react";
import { Boxes, Copy, Layers, Package, Plus, Search, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, Empty, Pill, neutralPill } from "@/components/ui/Bits";
import { Checkbox, Field, Input, Segmented, Select, Textarea } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { confirmDialog } from "@/components/ui/Confirm";
import { SortHandle, bySort, saveOrder, sortRow, useSortable } from "@/components/ui/Sortable";
import type { OptionRow } from "@/components/ui/OptionList";
import { errMsg, sb } from "@/lib/db";
import { useLiveTable } from "@/lib/live";
import { toast } from "@/lib/toast";
import { cn, money } from "@/lib/format";
import { SERVICES, serviceLabel } from "@/lib/services";
import { INTERVALS, intervalPer, type ChargeInterval, type ChargeService } from "@/lib/billing";
import {
  PRODUCT_KINDS,
  parseBundleRow,
  parseVariantDiscount,
  resolveDiscountTiers,
  type Product,
  type ProductBundle,
  type ProductBundleItem,
  type ProductKind,
  type ProductVariant,
} from "@/lib/sales";
import type { ServiceKey } from "@/lib/types";

const svcLabel = (s: ChargeService) => (s === "other" ? "Other" : serviceLabel(s as ServiceKey));
const per = (p: Pick<Product, "kind" | "billing_interval">) => (p.kind === "subscription" ? intervalPer(p.billing_interval) : p.kind === "exchange" ? "exchange" : "one time");

/** Hook to load live variant discount overrides stored in tms_option_lists (list = 'variant_discount'). */
export function useVariantDiscounts() {
  const rows = useLiveTable<OptionRow>("tms_option_lists", { filter: { list: "variant_discount" } });
  const byVariantId = (variantId: string | null | undefined) => {
    if (!variantId) return null;
    const r = rows.rows.find((x) => x.value === variantId);
    return r ? parseVariantDiscount(r.label) : null;
  };
  return { rows: rows.rows, put: rows.put, drop: rows.drop, byVariantId };
}

/** Hook to load live product bundles stored in tms_option_lists (list = 'product_bundle'). */
export function useProductBundles() {
  const table = useLiveTable<OptionRow>("tms_option_lists", { order: "sort", ascending: true, filter: { list: "product_bundle" } });
  const bundles: ProductBundle[] = [...table.rows]
    .sort(bySort)
    .map((r) => parseBundleRow(r))
    .filter((b): b is ProductBundle => b !== null);
  return { bundles, rawRows: table.rows, loaded: table.loaded, put: table.put, drop: table.drop };
}

/** What TOSS sells and for how much (used to price opportunities), plus Product Bundles. */
export function Products({ products, put, drop }: { products: Product[]; put: (p: Product) => void; drop: (id: string) => void }) {
  const [subTab, setSubTab] = useState<"products" | "bundles">("products");
  const [edit, setEdit] = useState<Product | "new" | null>(null);
  const [editBundle, setEditBundle] = useState<ProductBundle | "new" | null>(null);
  const [showOff, setShowOff] = useState(false);
  const variants = useLiveTable<ProductVariant>("tms_product_variants", { order: "sort", ascending: true });
  const vDiscounts = useVariantDiscounts();
  const { bundles, rawRows, put: putBundleRow, drop: dropBundleRow } = useProductBundles();

  const all = [...products].sort(bySort);
  const list = all.filter((p) => showOff || p.active);
  const sort = useSortable(
    list.map((p) => p.id),
    // Hidden (inactive) products keep their place after the visible ones.
    (ids) => saveOrder("tms_products", [...ids.map((id) => all.find((p) => p.id === id)!), ...all.filter((p) => !ids.includes(p.id))], put),
  );

  const visibleBundles = bundles.filter((b) => showOff || b.active);
  const bundleSort = useSortable(
    visibleBundles.map((b) => b.id),
    (ids) =>
      saveOrder(
        "tms_option_lists",
        [...ids.map((id) => rawRows.find((r) => r.id === id)!).filter(Boolean), ...rawRows.filter((r) => !ids.includes(r.id))],
        putBundleRow,
      ),
  );

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Segmented<"products" | "bundles">
          value={subTab}
          onChange={setSubTab}
          options={[
            { value: "products", label: <><Package className="h-3.5 w-3.5" /> Products ({all.filter((p) => p.active).length})</> },
            { value: "bundles", label: <><Boxes className="h-3.5 w-3.5" /> Bundles ({bundles.filter((b) => b.active).length})</> },
          ]}
        />
        <Checkbox checked={showOff} onChange={setShowOff} label="Show inactive" />
        <span className="hidden text-xs text-fg-4 sm:inline">Drag the handle or use the arrows to set the order they&apos;re offered in.</span>
        {subTab === "products" ? (
          <Button variant="primary" className="ml-auto" onClick={() => setEdit("new")}>
            <Plus className="h-4 w-4" /> New product
          </Button>
        ) : (
          <Button variant="primary" className="ml-auto" onClick={() => setEditBundle("new")}>
            <Plus className="h-4 w-4" /> New bundle
          </Button>
        )}
      </div>

      {subTab === "products" ? (
        list.length === 0 ? (
          <Card>
            <Empty icon={Package} title="No products yet" body="Add what TOSS sells (a service plan, a one-time filing…) with its price, or variants (e.g. one price per state)." />
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {list.map((p) => {
              const vs = variants.rows.filter((v) => v.product_id === p.id && v.active);
              const prices = vs.map((v) => Number(v.price));
              const maxDisc = vs.length
                ? Math.max(
                    ...vs.map((v) => resolveDiscountTiers(p, v, vDiscounts.byVariantId(v.id)).overall),
                    resolveDiscountTiers(p).overall,
                  )
                : resolveDiscountTiers(p).overall;
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
                      {maxDisc > 0 && <span>Discount up to {money(maxDisc)}</span>}
                    </div>
                    {p.description && <p className="mt-1 line-clamp-2 text-xs text-fg-3">{p.description}</p>}
                  </button>
                </div>
              );
            })}
          </div>
        )
      ) : visibleBundles.length === 0 ? (
        <Card>
          <Empty
            icon={Boxes}
            title="No bundles yet"
            body="Create a bundle (e.g. Authority Creation Bundle with Articles, BOC-3, USDOT, MC…) so agents can prepopulate multiple products onto an opportunity quote in one click and still modify or remove any item."
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {visibleBundles.map((b) => {
            const resolved = b.items
              .map((bi) => {
                const prod = products.find((p) => p.id === bi.product_id);
                if (!prod) return null;
                const v = bi.variant_id ? variants.rows.find((x) => x.id === bi.variant_id) : undefined;
                const unitPrice = v ? Number(v.price) : Number(prod.price);
                return { prod, v, quantity: bi.quantity || 1, total: unitPrice * (bi.quantity || 1) };
              })
              .filter((x): x is NonNullable<typeof x> => x !== null);
            const bundleTotal = resolved.reduce((s, x) => s + x.total, 0);
            return (
              <div key={b.id} {...bundleSort.rowProps(b.id)} className={cn("flex gap-2 rounded-xl border border-line bg-surface p-3 transition-colors hover:border-line-strong", sortRow)}>
                <SortHandle {...bundleSort.handle(b.id)} className="self-start pt-1" />
                <button onClick={() => setEditBundle(b)} className="min-w-0 flex-1 p-1 text-left">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-[14px] font-semibold text-fg">{b.name}</div>
                      <div className="text-xs text-fg-3">
                        {svcLabel(b.service)} · {resolved.length} product{resolved.length === 1 ? "" : "s"}
                      </div>
                    </div>
                    {!b.active && <Pill className={neutralPill}>Inactive</Pill>}
                  </div>
                  <div className="tnum mt-3 text-lg font-bold text-fg">
                    {money(bundleTotal)}
                    <span className="text-xs font-normal text-fg-3"> starting total</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {resolved.map((x, idx) => (
                      <Pill key={`${x.prod.id}-${idx}`} className={neutralPill}>
                        {x.prod.name}
                        {x.v ? ` · ${x.v.name}` : ""}
                        {x.quantity > 1 ? ` ×${x.quantity}` : ""}
                      </Pill>
                    ))}
                  </div>
                  {b.description && <p className="mt-1.5 line-clamp-2 text-xs text-fg-3">{b.description}</p>}
                </button>
              </div>
            );
          })}
        </div>
      )}

      <ProductModal value={edit} onClose={() => setEdit(null)} put={put} drop={drop} nextSort={all.length} />
      <BundleModal
        value={editBundle}
        onClose={() => setEditBundle(null)}
        products={all}
        variants={variants.rows}
        nextSort={bundles.length}
        onSaved={(row) => putBundleRow(row)}
        onDeleted={(id) => dropBundleRow(id)}
      />
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
/** A variant row being edited (no id yet when new), including per-variant discounts. */
type VDraft = {
  id?: string;
  name: string;
  price: string;
  expense: string;
  timeframe_days: string;
  discount_rep: string;
  discount_manager: string;
  discount_cro: string;
  active: boolean;
};
const num = (s: string) => (s.trim() === "" ? null : Number(s));

/**
 * Add or change a product: price (or variants, each with its price and Rep / Manager / CRO discounts),
 * expense, timeframe and the discounts a Rep / Manager / CRO may give.
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
  const vDiscounts = useVariantDiscounts();
  const editing = value && value !== "new" ? value : null;
  const key = value === "new" ? "new" : value?.id ?? "";
  if (value !== null && opened !== key) {
    setOpened(key);
    setD(editing ? { ...blank, ...editing, price: Number(editing.price) } : { ...blank, ...initial });
    setVars([]);
    if (editing)
      Promise.all([
        sb().from("tms_product_variants").select("*").eq("product_id", editing.id).order("sort"),
        sb().from("tms_option_lists").select("*").eq("list", "variant_discount"),
      ]).then(([vRes, dRes]) => {
        const discRows = (dRes.data || []) as OptionRow[];
        setVars(
          ((vRes.data || []) as ProductVariant[]).map((v) => {
            const ovRow = discRows.find((r) => r.value === v.id);
            const ov = ovRow ? parseVariantDiscount(ovRow.label) : null;
            const rep = ov?.discount_rep ?? v.discount_rep;
            const mgr = ov?.discount_manager ?? v.discount_manager;
            const cro = ov?.discount_cro ?? v.discount_cro;
            return {
              id: v.id,
              name: v.name,
              price: String(v.price ?? ""),
              expense: v.expense == null ? "" : String(v.expense),
              timeframe_days: v.timeframe_days == null ? "" : String(v.timeframe_days),
              discount_rep: rep == null ? "" : String(rep),
              discount_manager: mgr == null ? "" : String(mgr),
              discount_cro: cro == null ? "" : String(cro),
              active: v.active,
            };
          }),
        );
      });
  }
  if (value === null && opened) setOpened("");
  const set = (p: Partial<Draft>) => setD((x) => ({ ...x, ...p }));
  const setVar = (i: number, p: Partial<VDraft>) => setVars((l) => l.map((v, j) => (j === i ? { ...v, ...p } : v)));
  const [saving, setSaving] = useState(false);

  const row = () => {
    const keep = vars.filter((v) => v.name.trim());
    // Ensure product-level discount columns are at least as large as the max variant discount so DB triggers allow variant discounts.
    const maxVarRep = keep.reduce((m, v) => Math.max(m, Number(v.discount_rep) || 0), 0);
    const maxVarMgr = keep.reduce((m, v) => Math.max(m, Number(v.discount_manager) || 0), 0);
    const maxVarCro = keep.reduce((m, v) => Math.max(m, Number(v.discount_cro) || 0), 0);
    return {
      name: d.name.trim(),
      service: d.service,
      kind: d.kind,
      price: Number(d.price) || 0,
      billing_interval: d.kind === "subscription" ? d.billing_interval || "monthly" : null,
      description: d.description,
      active: d.active,
      expense: d.expense == null || Number.isNaN(Number(d.expense)) ? null : Number(d.expense),
      timeframe_days: d.timeframe_days == null || Number.isNaN(Number(d.timeframe_days)) ? null : Math.round(Number(d.timeframe_days)),
      discount_rep: Math.max(Number(d.discount_rep) || 0, maxVarRep),
      discount_manager: Math.max(Number(d.discount_manager) || 0, maxVarMgr),
      discount_cro: Math.max(Number(d.discount_cro) || 0, maxVarCro),
    };
  };

  /** Saves per-variant discounts in tms_option_lists (and tms_product_variants when columns exist). */
  const saveVariantDiscountMeta = async (variantId: string, v: VDraft, sortIdx: number) => {
    const payload = {
      discount_rep: num(v.discount_rep),
      discount_manager: num(v.discount_manager),
      discount_cro: num(v.discount_cro),
    };
    const existing = vDiscounts.rows.find((r) => r.value === variantId);
    const label = JSON.stringify(payload);
    if (existing) {
      const { data } = await sb().from("tms_option_lists").update({ label, sort: sortIdx, active: true }).eq("id", existing.id).select().single();
      if (data) vDiscounts.put(data as OptionRow);
    } else {
      const { data } = await sb()
        .from("tms_option_lists")
        .upsert({ list: "variant_discount", value: variantId, label, sort: sortIdx, active: true }, { onConflict: "list,value" })
        .select()
        .single();
      if (data) vDiscounts.put(data as OptionRow);
    }
  };

  /** Variants: new ones added, changed ones saved, removed ones deleted. */
  const saveVariants = async (productId: string) => {
    const keep = vars.filter((v) => v.name.trim());
    const { data: before } = await sb().from("tms_product_variants").select("id").eq("product_id", productId);
    const gone = ((before || []) as { id: string }[]).map((x) => x.id).filter((id) => !keep.some((v) => v.id === id));
    if (gone.length) {
      await sb().from("tms_product_variants").delete().in("id", gone);
      await sb().from("tms_option_lists").delete().eq("list", "variant_discount").in("value", gone);
    }
    for (const [i, v] of keep.entries()) {
      const baseRow = {
        product_id: productId,
        name: v.name.trim(),
        price: Number(v.price) || 0,
        expense: num(v.expense),
        timeframe_days: num(v.timeframe_days),
        active: v.active,
        sort: i,
      };
      const res = v.id
        ? await sb().from("tms_product_variants").update(baseRow).eq("id", v.id).select().single()
        : await sb().from("tms_product_variants").insert(baseRow).select().single();
      if (res.error) return toast.error(errMsg(res.error)), false;
      const savedVar = res.data as ProductVariant;
      await saveVariantDiscountMeta(savedVar.id, v, i);
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
          <Button
            size="xs"
            variant="ghost"
            onClick={() =>
              setVars([
                ...vars,
                {
                  name: "",
                  price: d.price ? String(d.price) : "",
                  expense: "",
                  timeframe_days: "",
                  discount_rep: d.discount_rep ? String(d.discount_rep) : "",
                  discount_manager: d.discount_manager ? String(d.discount_manager) : "",
                  discount_cro: d.discount_cro ? String(d.discount_cro) : "",
                  active: true,
                },
              ])
            }
          >
            <Plus className="h-3.5 w-3.5" /> Add variant
          </Button>
        </div>
        <p className="mb-2 text-xs text-fg-3">
          Versions with their own price and discounts (Rep, Manager extra, CRO extra), e.g. one per state. When a product has variants, the agent must pick one on the opportunity. Empty expense / timeframe / discounts use the product&apos;s.
        </p>
        {vars.length > 0 && (
          <div className="scrollbar-bold overflow-x-auto rounded-lg border border-line">
            <table className="w-full min-w-[760px] text-[13px]">
              <thead className="bg-surface-2/60 text-left text-xs text-fg-3">
                <tr>
                  <th className="min-w-[160px] px-2 py-1.5 font-medium">Variant</th>
                  <th className="w-24 px-2 py-1.5 font-medium">Price</th>
                  <th className="w-24 px-2 py-1.5 font-medium">Expense</th>
                  <th className="w-20 px-2 py-1.5 font-medium">Days</th>
                  <th className="w-24 px-2 py-1.5 font-medium">Rep disc.</th>
                  <th className="w-24 px-2 py-1.5 font-medium">Mgr (extra)</th>
                  <th className="w-24 px-2 py-1.5 font-medium">CRO (extra)</th>
                  <th className="w-14 px-2 py-1.5 text-center font-medium">Active</th>
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
                    <td className="px-2 py-1">
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        prefix="$"
                        value={v.discount_rep}
                        onChange={(e) => setVar(i, { discount_rep: e.target.value })}
                        placeholder={d.discount_rep ? String(d.discount_rep) : "0"}
                        className="h-8"
                        aria-label="Variant Rep discount"
                      />
                    </td>
                    <td className="px-2 py-1">
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        prefix="$"
                        value={v.discount_manager}
                        onChange={(e) => setVar(i, { discount_manager: e.target.value })}
                        placeholder={d.discount_manager ? String(d.discount_manager) : "0"}
                        className="h-8"
                        aria-label="Variant Manager extra discount"
                      />
                    </td>
                    <td className="px-2 py-1">
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        prefix="$"
                        value={v.discount_cro}
                        onChange={(e) => setVar(i, { discount_cro: e.target.value })}
                        placeholder={d.discount_cro ? String(d.discount_cro) : "0"}
                        className="h-8"
                        aria-label="Variant CRO extra discount"
                      />
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
        <h3 className="mb-1 text-[13px] font-semibold text-fg">Discounts allowed {vars.length > 0 ? "(default when empty on variant)" : ""}</h3>
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

type BundleDraft = {
  name: string;
  service: ChargeService;
  description: string | null;
  items: ProductBundleItem[];
  active: boolean;
};

const blankBundle: BundleDraft = {
  name: "",
  service: "mcpt",
  description: null,
  items: [],
  active: true,
};

export function BundleModal({
  value,
  onClose,
  products,
  variants,
  nextSort,
  onSaved,
  onDeleted,
}: {
  value: ProductBundle | "new" | null;
  onClose: () => void;
  products: Product[];
  variants: ProductVariant[];
  nextSort: number;
  onSaved: (row: OptionRow) => void;
  onDeleted: (id: string) => void;
}) {
  const [d, setD] = useState<BundleDraft>(blankBundle);
  const [q, setQ] = useState("");
  const [opened, setOpened] = useState("");
  const [saving, setSaving] = useState(false);

  const editing = value && value !== "new" ? value : null;
  const key = value === "new" ? "new" : value?.id ?? "";
  if (value !== null && opened !== key) {
    setOpened(key);
    setQ("");
    setD(
      editing
        ? {
            name: editing.name,
            service: editing.service,
            description: editing.description,
            items: editing.items.map((x) => ({ ...x })),
            active: editing.active,
          }
        : { ...blankBundle },
    );
  }
  if (value === null && opened) setOpened("");

  const set = (p: Partial<BundleDraft>) => setD((x) => ({ ...x, ...p }));
  const activeProducts = products.filter((p) => p.active);
  const filteredCatalog = activeProducts.filter((p) => !q || `${p.name} ${svcLabel(p.service)}`.toLowerCase().includes(q.toLowerCase()));

  const addItem = (productId: string) => {
    set({ items: [...d.items, { product_id: productId, variant_id: null, quantity: 1 }] });
  };
  const updateItem = (idx: number, patch: Partial<ProductBundleItem>) => {
    set({ items: d.items.map((item, i) => (i === idx ? { ...item, ...patch } : item)) });
  };
  const removeItem = (idx: number) => {
    set({ items: d.items.filter((_, i) => i !== idx) });
  };

  const serialize = (nameOverride?: string) =>
    JSON.stringify({
      name: (nameOverride || d.name).trim(),
      service: d.service,
      description: d.description?.trim() || null,
      items: d.items,
    });

  const save = async () => {
    if (!d.name.trim()) return toast.error("Give the bundle a name (e.g. Authority Creation Bundle)");
    if (d.items.length === 0) return toast.error("Select at least one product for this bundle");
    setSaving(true);
    const label = serialize();
    const res = editing
      ? await sb().from("tms_option_lists").update({ label, active: d.active }).eq("id", editing.id).select().single()
      : await sb()
          .from("tms_option_lists")
          .insert({ list: "product_bundle", value: crypto.randomUUID(), label, sort: nextSort, active: d.active })
          .select()
          .single();
    setSaving(false);
    if (res.error) return toast.error(errMsg(res.error));
    onSaved(res.data as OptionRow);
    toast.success("Bundle saved");
    onClose();
  };

  const duplicate = async () => {
    if (!editing) return;
    const label = serialize(`${d.name.trim() || editing.name} (copy)`);
    const { data, error } = await sb()
      .from("tms_option_lists")
      .insert({ list: "product_bundle", value: crypto.randomUUID(), label, sort: nextSort, active: d.active })
      .select()
      .single();
    if (error) return toast.error(errMsg(error));
    onSaved(data as OptionRow);
    toast.success("Bundle duplicated");
    onClose();
  };

  const remove = async () => {
    if (!editing) return;
    if (!(await confirmDialog({ title: `Delete ${editing.name}?`, body: "Existing opportunities keep their product lines.", confirmLabel: "Delete", danger: true }))) return;
    const { error } = await sb().from("tms_option_lists").delete().eq("id", editing.id);
    if (error) return toast.error(errMsg(error));
    onDeleted(editing.id);
    toast.success("Bundle deleted");
    onClose();
  };

  return (
    <Modal
      open={value !== null}
      onClose={onClose}
      title={editing ? "Bundle" : "New bundle"}
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
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="Bundle name" required className="sm:col-span-2">
          <Input value={d.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Authority Creation Bundle" autoFocus />
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
      </div>

      <section className="mt-5">
        <div className="mb-1 flex items-center justify-between">
          <h3 className="text-[13px] font-semibold text-fg">Included products ({d.items.length})</h3>
        </div>
        <p className="mb-2 text-xs text-fg-3">
          Select the products that belong in this bundle (e.g. Articles, BOC-3, USDOT, MC…). When picked on an opportunity quote, all of them prepopulate and the agent can still modify or remove any product not needed for that case.
        </p>

        {d.items.length > 0 && (
          <div className="mb-3 overflow-x-auto rounded-lg border border-line">
            <table className="w-full min-w-[480px] text-[13px]">
              <thead className="bg-surface-2/60 text-left text-xs text-fg-3">
                <tr>
                  <th className="px-3 py-1.5 font-medium">Product</th>
                  <th className="w-52 px-2 py-1.5 font-medium">Default variant (optional)</th>
                  <th className="w-20 px-2 py-1.5 font-medium">Qty</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {d.items.map((bi, idx) => {
                  const prod = products.find((p) => p.id === bi.product_id);
                  const vs = variants.filter((v) => v.product_id === bi.product_id && v.active);
                  return (
                    <tr key={`${bi.product_id}-${idx}`}>
                      <td className="px-3 py-1.5 font-medium text-fg">{prod?.name || "Unknown product"}</td>
                      <td className="px-2 py-1">
                        {vs.length > 0 ? (
                          <Select value={bi.variant_id || ""} onChange={(e) => updateItem(idx, { variant_id: e.target.value || null })} className="h-8 text-[12px]">
                            <option value="">Agent picks on quote…</option>
                            {vs.map((v) => (
                              <option key={v.id} value={v.id}>
                                {v.name} · {money(Number(v.price))}
                              </option>
                            ))}
                          </Select>
                        ) : (
                          <span className="text-xs text-fg-4">{prod ? money(Number(prod.price)) : "—"}</span>
                        )}
                      </td>
                      <td className="px-2 py-1">
                        <Input
                          type="number"
                          min={1}
                          step="1"
                          value={bi.quantity}
                          onChange={(e) => updateItem(idx, { quantity: Math.max(1, Number(e.target.value) || 1) })}
                          className="h-8"
                          aria-label="Quantity"
                        />
                      </td>
                      <td className="px-2 py-1 text-right">
                        <button type="button" onClick={() => removeItem(idx)} className="text-fg-4 hover:text-red-600" aria-label="Remove product from bundle">
                          <X className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="rounded-lg border border-line bg-surface-2/30 p-2.5">
          <div className="relative mb-2">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-4" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search catalog products to add…" className="h-8 pl-8 text-[13px]" />
          </div>
          <div className="scrollbar-bold flex max-h-44 flex-wrap gap-1.5 overflow-y-auto">
            {filteredCatalog.map((p) => {
              const count = d.items.filter((x) => x.product_id === p.id).length;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => addItem(p.id)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors",
                    count > 0 ? "border-brand/50 bg-brand/10 text-fg" : "border-line bg-surface text-fg-2 hover:border-line-strong hover:text-fg",
                  )}
                >
                  <Plus className="h-3 w-3" />
                  <span>{p.name}</span>
                  <span className="text-[11px] text-fg-4">{money(Number(p.price), { cents: false })}</span>
                  {count > 0 && <span className="rounded-full bg-brand px-1.5 text-[10px] font-semibold text-white">{count}</span>}
                </button>
              );
            })}
            {filteredCatalog.length === 0 && <div className=" py-2 text-xs text-fg-4">No matching active products.</div>}
          </div>
        </div>
      </section>

      <Field label="Description" className="mt-4">
        <Textarea rows={2} value={d.description || ""} onChange={(e) => set({ description: e.target.value || null })} placeholder="Optional notes about when to use this bundle" />
      </Field>
      <Checkbox className="mt-3" checked={d.active} onChange={(v) => set({ active: v })} label="Active (offered on opportunities)" />
    </Modal>
  );
}
