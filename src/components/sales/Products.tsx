"use client";

import { useState } from "react";
import { Package, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, Empty, Pill, neutralPill } from "@/components/ui/Bits";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { confirmDialog } from "@/components/ui/Confirm";
import { errMsg, sb } from "@/lib/db";
import { toast } from "@/lib/toast";
import { money } from "@/lib/format";
import { SERVICES, serviceLabel } from "@/lib/services";
import { INTERVALS, intervalPer, type ChargeInterval, type ChargeService } from "@/lib/billing";
import type { Product } from "@/lib/sales";
import type { ServiceKey } from "@/lib/types";

const svcLabel = (s: ChargeService) => (s === "other" ? "Other" : serviceLabel(s as ServiceKey));

/** What TOSS sells and for how much (used to price opportunities). */
export function Products({ products, put, drop }: { products: Product[]; put: (p: Product) => void; drop: (id: string) => void }) {
  const [edit, setEdit] = useState<Product | "new" | null>(null);
  const [showOff, setShowOff] = useState(false);
  const list = products.filter((p) => showOff || p.active).sort((a, b) => a.service.localeCompare(b.service) || a.name.localeCompare(b.name));
  return (
    <>
      <div className="mb-3 flex items-center gap-3">
        <Checkbox checked={showOff} onChange={setShowOff} label="Show inactive" />
        <Button variant="primary" className="ml-auto" onClick={() => setEdit("new")}>
          <Plus className="h-4 w-4" /> New product
        </Button>
      </div>
      {list.length === 0 ? (
        <Card>
          <Empty icon={Package} title="No products yet" body="Add what TOSS sells (a service plan, a one-time filing…) with its price." />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {list.map((p) => (
            <button key={p.id} onClick={() => setEdit(p)} className="rounded-xl border border-line bg-surface p-4 text-left transition-colors hover:border-line-strong">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-[14px] font-semibold text-fg">{p.name}</div>
                  <div className="text-xs text-fg-3">{svcLabel(p.service)}</div>
                </div>
                {!p.active && <Pill className={neutralPill}>Inactive</Pill>}
              </div>
              <div className="tnum mt-3 text-lg font-bold text-fg">
                {money(Number(p.price))}
                <span className="text-xs font-normal text-fg-3"> {p.kind === "subscription" ? intervalPer(p.billing_interval) : "one time"}</span>
              </div>
              {p.description && <p className="mt-1 line-clamp-2 text-xs text-fg-3">{p.description}</p>}
            </button>
          ))}
        </div>
      )}
      <ProductModal value={edit} onClose={() => setEdit(null)} put={put} drop={drop} />
    </>
  );
}

type Draft = Omit<Product, "id" | "created_at" | "updated_at">;
const blank: Draft = { name: "", service: "dispatch", kind: "subscription", price: 0, billing_interval: "monthly", description: null, active: true };

function ProductModal({ value, onClose, put, drop }: { value: Product | "new" | null; onClose: () => void; put: (p: Product) => void; drop: (id: string) => void }) {
  const [d, setD] = useState<Draft>(blank);
  const [opened, setOpened] = useState("");
  const editing = value && value !== "new" ? value : null;
  const key = value === "new" ? "new" : value?.id ?? "";
  if (value !== null && opened !== key) {
    setOpened(key);
    setD(editing ? { ...editing, price: Number(editing.price) } : blank);
  }
  if (value === null && opened) setOpened("");
  const set = (p: Partial<Draft>) => setD((x) => ({ ...x, ...p }));
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!d.name.trim()) return toast.error("Give the product a name");
    setSaving(true);
    const row = { ...d, name: d.name.trim(), price: Number(d.price) || 0, billing_interval: d.kind === "subscription" ? d.billing_interval || "monthly" : null };
    const res = editing ? await sb().from("tms_products").update(row).eq("id", editing.id).select().single() : await sb().from("tms_products").insert(row).select().single();
    setSaving(false);
    if (res.error) return toast.error(errMsg(res.error));
    put(res.data as Product);
    toast.success("Product saved");
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

  return (
    <Modal
      open={value !== null}
      onClose={onClose}
      title={editing ? "Product" : "New product"}
      size="sm"
      footer={
        <>
          {editing && (
            <Button variant="danger-ghost" onClick={remove} className="mr-auto">
              <Trash2 className="h-4 w-4" /> Delete
            </Button>
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
      <div className="grid grid-cols-2 gap-3">
        <Field label="Name" required className="col-span-2">
          <Input value={d.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Dispatch, weekly plan" />
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
        <Field label="Type">
          <Select value={d.kind} onChange={(e) => set({ kind: e.target.value as Draft["kind"] })}>
            <option value="subscription">Subscription</option>
            <option value="one_time">One time</option>
          </Select>
        </Field>
        <Field label="Price">
          <Input type="number" min={0} step="0.01" prefix="$" value={d.price || ""} onChange={(e) => set({ price: Number(e.target.value) })} />
        </Field>
        {d.kind === "subscription" && (
          <Field label="Billed">
            <Select value={d.billing_interval || "monthly"} onChange={(e) => set({ billing_interval: e.target.value as ChargeInterval })}>
              {INTERVALS.map((i) => (
                <option key={i.v} value={i.v}>
                  {i.label}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Description" className="col-span-2">
          <Textarea rows={3} value={d.description || ""} onChange={(e) => set({ description: e.target.value || null })} />
        </Field>
        <Checkbox className="col-span-2" checked={d.active} onChange={(v) => set({ active: v })} label="Active (offered for new opportunities)" />
      </div>
    </Modal>
  );
}
