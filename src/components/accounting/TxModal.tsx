"use client";

import { useRef, useState } from "react";
import { FileText, Paperclip, Trash2, UploadCloud, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { confirmDialog } from "@/components/ui/Confirm";
import { errMsg, sb } from "@/lib/db";
import { useStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import { cn, today } from "@/lib/format";
import { ACC_BUCKET, openAccFile, uploadAccFile, type AccField, type AccFile, type AccTransaction, type CatKind, type TxKind } from "@/lib/accounting";
import { useAcc } from "./AccountingProvider";

// Add / edit a transaction: an expense (paid to a merchant), incoming money (from a client, bank…)
// or a transfer between TOSS's accounts. Receipt / proof upload, custom fields, tags, and a new
// category / merchant / payment method can be added right here.

const NEW = "__new";
const TITLE: Record<TxKind, [string, string]> = {
  expense: ["Add expense", "Edit expense"],
  income: ["Add incoming to account", "Edit incoming"],
  transfer: ["Transfer between accounts", "Edit transfer"],
};

type Draft = {
  kind: TxKind;
  processed_by: string;
  merchant: string;
  counterparty: string;
  category_id: string;
  payment_method_id: string;
  account_id: string;
  to_account_id: string;
  amount: string;
  date: string;
  notes: string;
  company_id: string;
  status: "pending" | "cleared";
  tags: string;
  custom: Record<string, string | number | boolean | null>;
  files: AccFile[];
};

/** A select with "+ Add new…" that creates the item on the spot. */
function SelectAdd({ value, onChange, options, placeholder, onAdd, addLabel }: { value: string; onChange: (v: string) => void; options: { v: string; label: string }[]; placeholder: string; onAdd: (name: string) => Promise<string | null>; addLabel: string }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  if (adding)
    return (
      <div className="flex gap-1.5">
        <Input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={addLabel}
          onKeyDown={async (e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              const id = name.trim() ? await onAdd(name.trim()) : null;
              if (id) onChange(id);
              setAdding(false);
              setName("");
            }
            if (e.key === "Escape") setAdding(false);
          }}
        />
        <Button
          size="sm"
          variant="secondary"
          className="h-9"
          onClick={async () => {
            const id = name.trim() ? await onAdd(name.trim()) : null;
            if (id) onChange(id);
            setAdding(false);
            setName("");
          }}
        >
          Add
        </Button>
        <Button size="icon" variant="ghost" className="h-9 w-9" onClick={() => setAdding(false)} aria-label="Cancel">
          <X className="h-4 w-4" />
        </Button>
      </div>
    );
  return (
    <Select value={value} onChange={(e) => (e.target.value === NEW ? setAdding(true) : onChange(e.target.value))}>
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o.v} value={o.v}>
          {o.label}
        </option>
      ))}
      <option value={NEW}>+ {addLabel}…</option>
    </Select>
  );
}

/** Drag & drop / choose files; the already-attached ones open on click. */
function FileDrop({ files, pending, onPending, onRemove, label, required }: { files: AccFile[]; pending: File[]; onPending: (f: File[]) => void; onRemove: (path: string) => void; label: string; required: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const add = (list: FileList | null) => {
    const ok = Array.from(list || []).filter((f) => f.size <= 10 * 1024 * 1024);
    if (Array.from(list || []).length !== ok.length) toast.error("Files over 10 MB were skipped");
    onPending([...pending, ...ok]);
  };
  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          add(e.dataTransfer.files);
        }}
        className={cn("flex flex-col items-center rounded-xl border border-dashed px-4 py-6 text-center", over ? "border-brand bg-brand/5" : "border-line-strong")}
      >
        <FileText className="h-6 w-6 text-fg-3" />
        <div className="mt-2 text-[13px] font-semibold text-fg">{label}</div>
        <div className="text-xs text-fg-3">Drag and drop a file here, or click to browse</div>
        <div className="text-[11px] text-fg-4">PDF, JPG, PNG (max 10 MB){required ? " · required" : ""}</div>
        <input ref={input} type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.webp,.heic,.heif" className="hidden" onChange={(e) => add(e.target.files)} />
        <Button size="sm" variant="outline" className="mt-3" onClick={() => input.current?.click()}>
          <UploadCloud className="h-4 w-4" /> Choose file
        </Button>
      </div>
      {(files.length > 0 || pending.length > 0) && (
        <ul className="mt-2 space-y-1">
          {files.map((f) => (
            <li key={f.path} className="flex items-center gap-2 rounded-lg border border-line px-2.5 py-1.5 text-[13px]">
              <Paperclip className="h-3.5 w-3.5 text-fg-4" />
              <button type="button" onClick={() => openAccFile(f).catch((e) => toast.error(errMsg(e)))} className="min-w-0 flex-1 truncate text-left text-fg hover:underline">
                {f.name}
              </button>
              <button type="button" onClick={() => onRemove(f.path)} className="text-fg-4 hover:text-fg" aria-label="Remove file">
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
          {pending.map((f, i) => (
            <li key={`${f.name}${i}`} className="flex items-center gap-2 rounded-lg border border-line px-2.5 py-1.5 text-[13px]">
              <Paperclip className="h-3.5 w-3.5 text-fg-4" />
              <span className="min-w-0 flex-1 truncate text-fg">{f.name}</span>
              <span className="text-[11px] text-fg-4">to upload</span>
              <button type="button" onClick={() => onPending(pending.filter((_, k) => k !== i))} className="text-fg-4 hover:text-fg" aria-label="Remove file">
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** One custom field's input. */
function CustomInput({ f, value, onChange }: { f: AccField; value: string | number | boolean | null | undefined; onChange: (v: string | number | boolean | null) => void }) {
  if (f.type === "boolean") return <Checkbox checked={!!value} onChange={onChange} label={f.label} />;
  if (f.type === "select")
    return (
      <Select value={String(value ?? "")} onChange={(e) => onChange(e.target.value || null)}>
        <option value="">—</option>
        {f.options.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </Select>
    );
  return (
    <Input
      type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"}
      value={value == null ? "" : String(value)}
      onChange={(e) => onChange(e.target.value === "" ? null : f.type === "number" ? Number(e.target.value) : e.target.value)}
    />
  );
}

export function TxModal({ open, kind, tx, onClose }: { open: boolean; kind: TxKind; tx?: AccTransaction | null; onClose: () => void }) {
  const { members, me, companies } = useStore();
  const { accounts, categories, merchants, methods, fields, txs, settings } = useAcc();
  const [d, setD] = useState<Draft | null>(null);
  const [pending, setPending] = useState<File[]>([]);
  const [removed, setRemoved] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [opened, setOpened] = useState("");
  const key = open ? (tx?.id ?? `new-${kind}`) : "";
  if (key !== opened) {
    setOpened(key);
    setPending([]);
    setRemoved([]);
    if (open)
      setD(
        tx
          ? {
              kind: tx.kind,
              processed_by: tx.processed_by || "",
              merchant: merchants.rows.find((m) => m.id === tx.merchant_id)?.name || "",
              counterparty: tx.counterparty || "",
              category_id: tx.category_id || "",
              payment_method_id: tx.payment_method_id || "",
              account_id: tx.account_id || "",
              to_account_id: tx.to_account_id || "",
              amount: String(tx.amount),
              date: tx.date,
              notes: tx.notes || "",
              company_id: tx.company_id || "",
              status: tx.status,
              tags: (tx.tags || []).join(", "),
              custom: tx.custom || {},
              files: tx.files || [],
            }
          : {
              kind,
              processed_by: me.id,
              merchant: "",
              counterparty: "",
              category_id: "",
              payment_method_id: "",
              account_id: "",
              to_account_id: "",
              amount: "",
              date: today(),
              notes: "",
              company_id: "",
              status: "cleared",
              tags: "",
              custom: {},
              files: [],
            },
      );
  }
  if (!open || !d) return null;
  const k = d.kind;
  const set = (p: Partial<Draft>) => setD((x) => (x ? { ...x, ...p } : x));
  const catKind: CatKind = k === "income" ? "income" : "expense";
  const cats = categories.rows.filter((c) => c.kind === catKind && (c.active || c.id === d.category_id));
  const activeAccounts = accounts.rows.filter((a) => a.active || a.id === d.account_id || a.id === d.to_account_id);
  const myFields = fields.rows.filter((f) => f.active && (f.applies_to === "all" || f.applies_to === k));
  const fileRequired = k === "expense" ? (settings?.require_receipt ?? true) : k === "income" ? (settings?.require_proof ?? true) : false;
  const keptFiles = d.files.filter((f) => !removed.includes(f.path));
  const pastFrom = [...new Set(txs.rows.filter((t) => t.kind === "income" && t.counterparty).map((t) => t.counterparty!))].slice(0, 50);

  const addCategory = async (name: string) => {
    const { data, error } = await sb().from("acc_categories").insert({ name, kind: catKind, sort: 999 }).select().single();
    if (error) return toast.error(errMsg(error)), null;
    categories.put(data);
    return (data as { id: string }).id;
  };
  const addMethod = async (name: string) => {
    const { data, error } = await sb().from("acc_payment_methods").insert({ name, kind: "card" }).select().single();
    if (error) return toast.error(errMsg(error)), null;
    methods.put(data);
    return (data as { id: string }).id;
  };
  const addAccount = async (name: string) => {
    const { data, error } = await sb().from("acc_accounts").insert({ name, kind: "bank" }).select().single();
    if (error) return toast.error(errMsg(error)), null;
    accounts.put(data);
    return (data as { id: string }).id;
  };

  const pickMerchant = (name: string) => {
    const m = merchants.rows.find((x) => x.name.toLowerCase() === name.trim().toLowerCase());
    set({ merchant: name, ...(m?.default_category_id && !d.category_id ? { category_id: m.default_category_id } : {}) });
  };

  const save = async () => {
    const amount = Number(d.amount);
    const problems: string[] = [];
    if (!(amount > 0)) problems.push("amount");
    if (!d.date) problems.push("date");
    if (k !== "transfer" && !d.processed_by) problems.push("processed by");
    if (k === "expense") {
      if (!d.merchant.trim()) problems.push("merchant");
      if (!d.category_id) problems.push("category");
      if (!d.payment_method_id) problems.push("payment method");
    }
    if (k === "income") {
      if (!d.counterparty.trim()) problems.push("from");
      if (!d.category_id) problems.push("category");
      if (!d.account_id) problems.push("account");
    }
    if (k === "transfer") {
      if (!d.account_id || !d.to_account_id) problems.push("both accounts");
      if (d.account_id && d.account_id === d.to_account_id) return toast.error("Pick two different accounts");
    }
    for (const f of myFields) if (f.required && (d.custom[f.id] == null || d.custom[f.id] === "")) problems.push(f.label);
    if (fileRequired && keptFiles.length + pending.length === 0) problems.push(k === "expense" ? "invoice / receipt" : "proof of payment");
    if (problems.length) return toast.error(`Missing: ${problems.join(", ")}`);

    setSaving(true);
    try {
      // Merchant: pick the one with this name, or add it.
      let merchant_id: string | null = null;
      if (k === "expense") {
        const m = merchants.rows.find((x) => x.name.toLowerCase() === d.merchant.trim().toLowerCase());
        if (m) merchant_id = m.id;
        else {
          const { data, error } = await sb().from("acc_merchants").insert({ name: d.merchant.trim(), default_category_id: d.category_id || null }).select().single();
          if (error) throw error;
          merchants.put(data);
          merchant_id = (data as { id: string }).id;
        }
      }
      const uploaded: AccFile[] = [];
      for (const f of pending) uploaded.push(await uploadAccFile(f));
      const method = methods.rows.find((m) => m.id === d.payment_method_id);
      const row = {
        kind: k,
        date: d.date,
        amount,
        processed_by: d.processed_by || null,
        merchant_id,
        counterparty: k === "income" ? d.counterparty.trim() : null,
        category_id: k === "transfer" ? null : d.category_id || null,
        payment_method_id: k === "expense" ? d.payment_method_id || null : null,
        // An expense comes out of the payment method's account.
        account_id: k === "expense" ? method?.account_id || null : d.account_id || null,
        to_account_id: k === "transfer" ? d.to_account_id : null,
        company_id: d.company_id || null,
        status: d.status,
        tags: d.tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        notes: d.notes.trim() || null,
        custom: d.custom,
        files: [...keptFiles, ...uploaded],
      };
      const res = tx ? await sb().from("acc_transactions").update(row).eq("id", tx.id).select().single() : await sb().from("acc_transactions").insert(row).select().single();
      if (res.error) throw res.error;
      txs.put(res.data as AccTransaction);
      if (removed.length) await sb().storage.from(ACC_BUCKET).remove(removed);
      toast.success(tx ? "Saved" : k === "expense" ? "Expense added" : k === "income" ? "Incoming added" : "Transfer added");
      onClose();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!tx) return;
    if (!(await confirmDialog({ title: "Delete this transaction?", body: "Its receipt / proof is deleted too.", confirmLabel: "Delete", danger: true }))) return;
    const { error } = await sb().from("acc_transactions").delete().eq("id", tx.id);
    if (error) return toast.error(errMsg(error));
    if (tx.files?.length) await sb().storage.from(ACC_BUCKET).remove(tx.files.map((f) => f.path));
    txs.drop(tx.id);
    onClose();
  };

  const people = members.map((m) => ({ v: m.user_id, label: m.full_name || m.email }));

  return (
    <Modal
      open
      onClose={onClose}
      title={TITLE[k][tx ? 1 : 0]}
      size="lg"
      footer={
        <>
          {tx && (
            <Button variant="danger-ghost" onClick={remove} className="mr-auto">
              <Trash2 className="h-4 w-4" /> Delete
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} loading={saving}>
            {tx ? "Save" : k === "expense" ? "Add transaction" : k === "income" ? "Add incoming" : "Add transfer"}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {k !== "transfer" && (
          <Field label="Processed by" required>
            <Select value={d.processed_by} onChange={(e) => set({ processed_by: e.target.value })}>
              <option value="">Select person</option>
              {people.map((p) => (
                <option key={p.v} value={p.v}>
                  {p.label}
                </option>
              ))}
            </Select>
          </Field>
        )}
        {k === "expense" && (
          <Field label="Merchant" required hint="Type a new one to add it">
            <Input list="acc-merchants" value={d.merchant} onChange={(e) => pickMerchant(e.target.value)} placeholder="e.g. Amazon, DAT, Verizon" />
            <datalist id="acc-merchants">
              {merchants.rows
                .filter((m) => m.active)
                .map((m) => (
                  <option key={m.id} value={m.name} />
                ))}
            </datalist>
          </Field>
        )}
        {k === "income" && (
          <Field label="From" required>
            <Input list="acc-from" value={d.counterparty} onChange={(e) => set({ counterparty: e.target.value })} placeholder="e.g. Customer, client, transfer from bank" />
            <datalist id="acc-from">
              {pastFrom.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </Field>
        )}
        {k !== "transfer" && (
          <Field label="Category" required>
            <SelectAdd
              value={d.category_id}
              onChange={(v) => set({ category_id: v })}
              placeholder="Select a category"
              options={cats.map((c) => ({ v: c.id, label: c.parent_id ? `↳ ${c.name}` : c.name }))}
              onAdd={addCategory}
              addLabel="New category"
            />
          </Field>
        )}
        {k === "expense" && (
          <Field label="Payment method" required>
            <SelectAdd
              value={d.payment_method_id}
              onChange={(v) => set({ payment_method_id: v })}
              placeholder="Select a payment method"
              options={methods.rows.filter((m) => m.active || m.id === d.payment_method_id).map((m) => ({ v: m.id, label: `${m.name}${m.last4 ? ` ••${m.last4}` : ""}` }))}
              onAdd={addMethod}
              addLabel="New payment method"
            />
          </Field>
        )}
        {(k === "income" || k === "transfer") && (
          <Field label={k === "income" ? "Available in" : "From account"} required>
            <SelectAdd
              value={d.account_id}
              onChange={(v) => set({ account_id: v })}
              placeholder="Select an account"
              options={activeAccounts.map((a) => ({ v: a.id, label: `${a.name}${a.last4 ? ` ••${a.last4}` : ""}` }))}
              onAdd={addAccount}
              addLabel="New account"
            />
          </Field>
        )}
        {k === "transfer" && (
          <Field label="To account" required>
            <SelectAdd
              value={d.to_account_id}
              onChange={(v) => set({ to_account_id: v })}
              placeholder="Select an account"
              options={activeAccounts.map((a) => ({ v: a.id, label: `${a.name}${a.last4 ? ` ••${a.last4}` : ""}` }))}
              onAdd={addAccount}
              addLabel="New account"
            />
          </Field>
        )}
        <Field label="Amount" required>
          <Input type="number" min={0} step="0.01" prefix="$" value={d.amount} onChange={(e) => set({ amount: e.target.value })} placeholder="0.00" />
        </Field>
        <Field label="Date" required>
          <Input type="date" value={d.date} onChange={(e) => set({ date: e.target.value })} />
        </Field>

        {k !== "transfer" && (
          <Field label={k === "expense" ? "Invoice" : "Transfer confirmation"} required={fileRequired} className="sm:col-span-2">
            <FileDrop
              files={keptFiles}
              pending={pending}
              onPending={setPending}
              onRemove={(p) => setRemoved((r) => [...r, p])}
              label={k === "expense" ? "Upload invoice" : "Upload proof of payment"}
              required={fileRequired}
            />
          </Field>
        )}

        {myFields.map((f) => (
          <Field key={f.id} label={f.type === "boolean" ? "" : f.label} required={f.required && f.type !== "boolean"}>
            <CustomInput f={f} value={d.custom[f.id]} onChange={(v) => set({ custom: { ...d.custom, [f.id]: v } })} />
          </Field>
        ))}

        <Field label="Company (optional)" hint="If this is about a carrier, e.g. a refund">
          <Select value={d.company_id} onChange={(e) => set({ company_id: e.target.value })}>
            <option value="">None</option>
            {[...companies]
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </Select>
        </Field>
        <Field label="Tags" hint="Comma separated">
          <Input value={d.tags} onChange={(e) => set({ tags: e.target.value })} placeholder="e.g. Q4, reimbursable" />
        </Field>
        <Field label="Notes" className="sm:col-span-2">
          <Textarea rows={3} value={d.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="Add any additional notes here…" />
        </Field>
        <Checkbox className="sm:col-span-2" checked={d.status === "pending"} onChange={(v) => set({ status: v ? "pending" : "cleared" })} label="Pending (not cleared in the bank yet)" />
      </div>
    </Modal>
  );
}

