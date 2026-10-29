"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CreditCard, FolderTree, Landmark, ListPlus, Plus, Settings2, Store, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, Empty, Page, PageHeader, Pill, Tabs, neutralPill } from "@/components/ui/Bits";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { confirmDialog } from "@/components/ui/Confirm";
import { ChoicesEditor } from "@/components/ui/ChoicesEditor";
import { SortHandle, bySort, saveOrder, sortRow, useSortable } from "@/components/ui/Sortable";
import { useAcc } from "@/components/accounting/AccountingProvider";
import { errMsg, sb } from "@/lib/db";
import { toast } from "@/lib/toast";
import { cn, money } from "@/lib/format";
import { ACCOUNT_KINDS, FIELD_TYPES, METHOD_KINDS, balances, type AccAccount, type AccCategory, type AccField, type AccMerchant, type AccMethod } from "@/lib/accounting";

// Setup: everything the forms use, all editable. Accounts (with balances), categories (sub-categories,
// colors, monthly budgets), merchants (default category), payment methods (tied to an account),
// custom fields, and whether a receipt / proof is required. Lists are in the order the forms offer
// them; drag the handle or use the arrows to change it.

type Tab = "accounts" | "categories" | "merchants" | "methods" | "fields" | "settings";
const TABS: Tab[] = ["accounts", "categories", "merchants", "methods", "fields", "settings"];
const COLORS = ["#ef4444", "#f97316", "#f59e0b", "#84cc16", "#16a34a", "#14b8a6", "#0ea5e9", "#6366f1", "#8b5cf6", "#ec4899", "#64748b", "#9ca3af"];

export default function SetupPage() {
  return (
    <Suspense>
      <Setup />
    </Suspense>
  );
}

function Setup() {
  const params = useSearchParams();
  const router = useRouter();
  const tab: Tab = TABS.find((t) => t === params.get("tab")) || "accounts";
  const acc = useAcc();
  return (
    <Page className="max-w-[1200px]">
      <PageHeader eyebrow="TOSS Accounting" title="Setup" />
      <Tabs<Tab>
        value={tab}
        onChange={(v) => router.replace(`/accounting/setup?tab=${v}`, { scroll: false })}
        className="mb-5"
        tabs={[
          { value: "accounts", label: <><Landmark className="h-4 w-4" /> Accounts</>, count: acc.accounts.rows.length },
          { value: "categories", label: <><FolderTree className="h-4 w-4" /> Categories</>, count: acc.categories.rows.length },
          { value: "merchants", label: <><Store className="h-4 w-4" /> Merchants</>, count: acc.merchants.rows.length },
          { value: "methods", label: <><CreditCard className="h-4 w-4" /> Payment methods</>, count: acc.methods.rows.length },
          { value: "fields", label: <><ListPlus className="h-4 w-4" /> Custom fields</>, count: acc.fields.rows.length },
          { value: "settings", label: <><Settings2 className="h-4 w-4" /> Settings</> },
        ]}
      />
      {tab === "accounts" && <Accounts />}
      {tab === "categories" && <Categories />}
      {tab === "merchants" && <Merchants />}
      {tab === "methods" && <Methods />}
      {tab === "fields" && <Fields />}
      {tab === "settings" && <SettingsTab />}
    </Page>
  );
}

/** Save / delete one row of a setup table and keep the live list in step. */
function useSave<T extends { id: string }>(table: string, put: (r: T) => void, drop: (id: string) => void) {
  const save = async (id: string | null, row: Partial<T>) => {
    const body = row as Record<string, unknown>;
    const res = id ? await sb().from(table).update(body).eq("id", id).select().single() : await sb().from(table).insert(body).select().single();
    if (res.error) return toast.error(errMsg(res.error)), false;
    put(res.data as T);
    toast.success("Saved");
    return true;
  };
  const remove = async (id: string, what: string, body: string) => {
    if (!(await confirmDialog({ title: `Delete ${what}?`, body, confirmLabel: "Delete", danger: true }))) return false;
    const { error } = await sb().from(table).delete().eq("id", id);
    if (error) return toast.error(errMsg(error)), false;
    drop(id);
    return true;
  };
  return { save, remove };
}

function Shell({ onAdd, addLabel, children, empty, count }: { onAdd: () => void; addLabel: string; children: React.ReactNode; empty: string; count: number }) {
  return (
    <>
      <div className="mb-3 flex justify-end">
        <Button variant="primary" onClick={onAdd}>
          <Plus className="h-4 w-4" /> {addLabel}
        </Button>
      </div>
      {count === 0 ? (
        <Card>
          <Empty icon={ListPlus} title="Nothing here yet" body={empty} />
        </Card>
      ) : (
        <Card>
          <ul className="divide-y divide-line">{children}</ul>
        </Card>
      )}
    </>
  );
}

type Sorter = ReturnType<typeof useSortable>;

function Row({ onClick, left, right, muted, sort, id }: { onClick: () => void; left: React.ReactNode; right?: React.ReactNode; muted?: boolean; sort?: Sorter; id?: string }) {
  return (
    <li {...(sort && id ? sort.rowProps(id) : {})} className={cn(sort && "flex items-center pl-2", sort && sortRow)}>
      {sort && id && <SortHandle {...sort.handle(id)} />}
      <button type="button" onClick={onClick} className={cn("flex w-full min-w-0 items-center gap-3 py-3 text-left hover:bg-surface-2/50", sort ? "pl-2 pr-4 sm:pr-5" : "px-4 sm:px-5", muted && "opacity-50")}>
        <div className="min-w-0 flex-1">{left}</div>
        {right && <div className="shrink-0 text-right">{right}</div>}
      </button>
    </li>
  );
}

function EditModal({ open, title, onClose, onSave, onDelete, children }: { open: boolean; title: string; onClose: () => void; onSave: () => void; onDelete?: () => void; children: React.ReactNode }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          {onDelete && (
            <Button variant="danger-ghost" onClick={onDelete} className="mr-auto">
              <Trash2 className="h-4 w-4" /> Delete
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={onSave}>
            Save
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">{children}</div>
    </Modal>
  );
}

function ColorPick({ value, onChange }: { value: string | null; onChange: (c: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {COLORS.map((c) => (
        <button key={c} type="button" onClick={() => onChange(c)} className={cn("h-6 w-6 rounded-full ring-offset-2 ring-offset-surface", value === c && "ring-2 ring-fg")} style={{ background: c }} aria-label={c} />
      ))}
    </div>
  );
}

// ---- Accounts -----------------------------------------------------------------------------------------
function Accounts() {
  const { accounts, txs, methods } = useAcc();
  const { save, remove } = useSave<AccAccount>("acc_accounts", accounts.put, accounts.drop);
  const [e, setE] = useState<Partial<AccAccount> | null>(null);
  const bal = balances(accounts.rows, txs.rows, methods.rows);
  const list = [...accounts.rows].sort(bySort);
  const sort = useSortable(
    list.map((a) => a.id),
    (ids) => saveOrder("acc_accounts", ids.map((id) => list.find((a) => a.id === id)!), accounts.put),
  );
  return (
    <>
      <Shell onAdd={() => setE({ kind: "bank", opening_balance: 0, active: true, sort: list.length })} addLabel="Add account" empty="Add TOSS's bank accounts, cards, cash and online accounts (PayPal, Stripe…)." count={accounts.rows.length}>
        {list.map((a) => (
          <Row
            key={a.id}
            id={a.id}
            sort={sort}
            muted={!a.active}
            onClick={() => setE(a)}
            left={
              <>
                <div className="flex items-center gap-2 text-[13px] font-semibold text-fg">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: a.color || "#9ca3af" }} />
                  {a.name}
                  {a.last4 && <span className="font-normal text-fg-4">••{a.last4}</span>}
                </div>
                <div className="text-xs text-fg-3">{ACCOUNT_KINDS.find((k) => k.v === a.kind)?.label}</div>
              </>
            }
            right={
              <>
                <div className={cn("tnum text-[14px] font-semibold", (bal.get(a.id) ?? 0) < 0 ? "text-red-600 dark:text-red-400" : "text-fg")}>{money(bal.get(a.id) ?? 0)}</div>
                <div className="text-[11px] text-fg-4">balance</div>
              </>
            }
          />
        ))}
      </Shell>
      <EditModal
        open={!!e}
        title={e?.id ? "Account" : "New account"}
        onClose={() => setE(null)}
        onSave={async () => {
          if (!e?.name?.trim()) return toast.error("Name the account");
          const { id, created_at: _c, ...row } = e as AccAccount;
          void _c;
          if (await save(id || null, { ...row, name: row.name.trim(), opening_balance: Number(row.opening_balance) || 0 })) setE(null);
        }}
        onDelete={e?.id ? async () => (await remove(e.id!, e.name || "account", "Transactions keep their amounts but lose the account link.")) && setE(null) : undefined}
      >
        {e && (
          <>
            <Field label="Name" required className="col-span-2">
              <Input value={e.name || ""} onChange={(x) => setE({ ...e, name: x.target.value })} placeholder="e.g. Chase Business Checking" autoFocus />
            </Field>
            <Field label="Type">
              <Select value={e.kind} onChange={(x) => setE({ ...e, kind: x.target.value as AccAccount["kind"] })}>
                {ACCOUNT_KINDS.map((k) => (
                  <option key={k.v} value={k.v}>
                    {k.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Last 4 digits">
              <Input value={e.last4 || ""} maxLength={4} onChange={(x) => setE({ ...e, last4: x.target.value.replace(/\D/g, "") || null })} />
            </Field>
            <Field label="Opening balance" hint="What it had when you started tracking">
              <Input type="number" step="0.01" prefix="$" value={e.opening_balance ?? 0} onChange={(x) => setE({ ...e, opening_balance: Number(x.target.value) })} />
            </Field>
            <Field label="As of">
              <Input type="date" value={e.opening_date || ""} onChange={(x) => setE({ ...e, opening_date: x.target.value || null })} />
            </Field>
            <Field label="Color" className="col-span-2">
              <ColorPick value={e.color || null} onChange={(c) => setE({ ...e, color: c })} />
            </Field>
            <Field label="Notes" className="col-span-2">
              <Textarea rows={2} value={e.notes || ""} onChange={(x) => setE({ ...e, notes: x.target.value || null })} />
            </Field>
            <Checkbox className="col-span-2" checked={e.active ?? true} onChange={(v) => setE({ ...e, active: v })} label="Active" />
          </>
        )}
      </EditModal>
    </>
  );
}

// ---- Categories ---------------------------------------------------------------------------------------
function Categories() {
  const { categories, txs } = useAcc();
  const { save, remove } = useSave<AccCategory>("acc_categories", categories.put, categories.drop);
  const [e, setE] = useState<Partial<AccCategory> | null>(null);
  const used = (id: string) => txs.rows.filter((t) => t.category_id === id).length;
  const all = [...categories.rows].sort(bySort);
  const group = (kind: "expense" | "income") => {
    const top = all.filter((c) => c.kind === kind && !c.parent_id);
    return top.flatMap((c) => [c, ...all.filter((x) => x.parent_id === c.id)]);
  };
  // Moving a category moves it among its siblings; sub-categories follow their parent.
  const flat = [...group("expense"), ...group("income")];
  const sort = useSortable(
    flat.map((c) => c.id),
    (ids) => {
      const moved = ids.find((id, i) => id !== flat[i]?.id);
      const c = moved && flat.find((x) => x.id === moved);
      if (!c) return;
      const siblings = (l: string[]) => l.map((id) => flat.find((x) => x.id === id)!).filter((x) => x.kind === c.kind && x.parent_id === c.parent_id);
      saveOrder("acc_categories", siblings(ids), categories.put);
    },
  );
  return (
    <>
      <Shell onAdd={() => setE({ kind: "expense", active: true, color: COLORS[6], sort: all.length })} addLabel="Add category" empty="Add categories for expenses and incoming money." count={categories.rows.length}>
        {(["expense", "income"] as const).map((k) => [
          <li key={k} className="bg-surface-2/50 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-fg-4 sm:px-5">
            {k === "expense" ? "Expenses" : "Incoming"}
          </li>,
          ...group(k).map((c) => (
            <Row
              key={c.id}
              id={c.id}
              sort={sort}
              muted={!c.active}
              onClick={() => setE(c)}
              left={
                <div className={cn("flex items-center gap-2 text-[13px] text-fg", c.parent_id ? "pl-5" : "font-semibold")}>
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: c.color || "#9ca3af" }} />
                  {c.name}
                </div>
              }
              right={
                <span className="text-xs text-fg-3">
                  {c.budget_monthly ? `${money(Number(c.budget_monthly), { cents: false })}/mo budget · ` : ""}
                  {used(c.id)} used
                </span>
              }
            />
          )),
        ])}
      </Shell>
      <EditModal
        open={!!e}
        title={e?.id ? "Category" : "New category"}
        onClose={() => setE(null)}
        onSave={async () => {
          if (!e?.name?.trim()) return toast.error("Name the category");
          const row = { name: e.name.trim(), kind: e.kind, parent_id: e.parent_id || null, color: e.color || null, budget_monthly: e.budget_monthly ? Number(e.budget_monthly) : null, active: e.active ?? true, sort: e.sort ?? all.length };
          if (await save(e.id || null, row as Partial<AccCategory>)) setE(null);
        }}
        onDelete={e?.id ? async () => (await remove(e.id!, e.name || "category", "Transactions in it become uncategorized. To keep history tidy, untick Active instead.")) && setE(null) : undefined}
      >
        {e && (
          <>
            <Field label="Name" required className="col-span-2">
              <Input value={e.name || ""} onChange={(x) => setE({ ...e, name: x.target.value })} autoFocus />
            </Field>
            <Field label="For">
              <Select value={e.kind} onChange={(x) => setE({ ...e, kind: x.target.value as "expense" | "income", parent_id: null })}>
                <option value="expense">Expenses</option>
                <option value="income">Incoming</option>
              </Select>
            </Field>
            <Field label="Inside (optional)">
              <Select value={e.parent_id || ""} onChange={(x) => setE({ ...e, parent_id: x.target.value || null })}>
                <option value="">— Top level —</option>
                {categories.rows
                  .filter((c) => c.kind === e.kind && !c.parent_id && c.id !== e.id)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </Select>
            </Field>
            <Field label="Monthly budget (optional)" className="col-span-2">
              <Input type="number" min={0} step="1" prefix="$" value={e.budget_monthly ?? ""} onChange={(x) => setE({ ...e, budget_monthly: x.target.value ? Number(x.target.value) : null })} />
            </Field>
            <Field label="Color" className="col-span-2">
              <ColorPick value={e.color || null} onChange={(c) => setE({ ...e, color: c })} />
            </Field>
            <Checkbox className="col-span-2" checked={e.active ?? true} onChange={(v) => setE({ ...e, active: v })} label="Active (offered on the forms)" />
          </>
        )}
      </EditModal>
    </>
  );
}

// ---- Merchants ----------------------------------------------------------------------------------------
function Merchants() {
  const { merchants, categories, txs } = useAcc();
  const { save, remove } = useSave<AccMerchant>("acc_merchants", merchants.put, merchants.drop);
  const [e, setE] = useState<Partial<AccMerchant> | null>(null);
  const [q, setQ] = useState("");
  const spent = (id: string) => txs.rows.filter((t) => t.merchant_id === id && t.kind === "expense").reduce((s, t) => s + Number(t.amount), 0);
  const list = merchants.rows.filter((m) => !q || m.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <div className="mb-3 max-w-sm">
        <Input value={q} onChange={(x) => setQ(x.target.value)} placeholder="Find a merchant" />
      </div>
      <Shell onAdd={() => setE({ active: true })} addLabel="Add merchant" empty="Merchants are added as you record expenses, or here with a default category." count={list.length}>
        {list.map((m) => (
          <Row
            key={m.id}
            muted={!m.active}
            onClick={() => setE(m)}
            left={
              <>
                <div className="text-[13px] font-semibold text-fg">{m.name}</div>
                <div className="text-xs text-fg-3">{categories.rows.find((c) => c.id === m.default_category_id)?.name || "No default category"}</div>
              </>
            }
            right={<span className="tnum text-[13px] text-fg-2">{money(spent(m.id), { cents: false })} spent</span>}
          />
        ))}
      </Shell>
      <EditModal
        open={!!e}
        title={e?.id ? "Merchant" : "New merchant"}
        onClose={() => setE(null)}
        onSave={async () => {
          if (!e?.name?.trim()) return toast.error("Name the merchant");
          const row = { name: e.name.trim(), default_category_id: e.default_category_id || null, website: e.website || null, notes: e.notes || null, active: e.active ?? true };
          if (await save(e.id || null, row)) setE(null);
        }}
        onDelete={e?.id ? async () => (await remove(e.id!, e.name || "merchant", "Expenses keep their amounts but lose the merchant name.")) && setE(null) : undefined}
      >
        {e && (
          <>
            <Field label="Name" required className="col-span-2">
              <Input value={e.name || ""} onChange={(x) => setE({ ...e, name: x.target.value })} autoFocus />
            </Field>
            <Field label="Default category" className="col-span-2" hint="Filled in when you pick this merchant">
              <Select value={e.default_category_id || ""} onChange={(x) => setE({ ...e, default_category_id: x.target.value || null })}>
                <option value="">None</option>
                {categories.rows
                  .filter((c) => c.kind === "expense")
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </Select>
            </Field>
            <Field label="Website" className="col-span-2">
              <Input value={e.website || ""} onChange={(x) => setE({ ...e, website: x.target.value })} />
            </Field>
            <Field label="Notes" className="col-span-2">
              <Textarea rows={2} value={e.notes || ""} onChange={(x) => setE({ ...e, notes: x.target.value })} />
            </Field>
            <Checkbox className="col-span-2" checked={e.active ?? true} onChange={(v) => setE({ ...e, active: v })} label="Active" />
          </>
        )}
      </EditModal>
    </>
  );
}

// ---- Payment methods ----------------------------------------------------------------------------------
function Methods() {
  const { methods, accounts } = useAcc();
  const { save, remove } = useSave<AccMethod>("acc_payment_methods", methods.put, methods.drop);
  const [e, setE] = useState<Partial<AccMethod> | null>(null);
  const list = [...methods.rows].sort(bySort);
  const sort = useSortable(
    list.map((m) => m.id),
    (ids) => saveOrder("acc_payment_methods", ids.map((id) => list.find((m) => m.id === id)!), methods.put),
  );
  return (
    <>
      <Shell onAdd={() => setE({ kind: "card", active: true, sort: list.length })} addLabel="Add payment method" empty="Add the cards, ACH, Zelle, checks… TOSS pays with, and the account each one comes out of." count={methods.rows.length}>
        {list.map((m) => (
          <Row
            key={m.id}
            id={m.id}
            sort={sort}
            muted={!m.active}
            onClick={() => setE(m)}
            left={
              <>
                <div className="text-[13px] font-semibold text-fg">
                  {m.name}
                  {m.last4 && <span className="font-normal text-fg-4"> ••{m.last4}</span>}
                </div>
                <div className="text-xs text-fg-3">
                  {METHOD_KINDS.find((k) => k.v === m.kind)?.label} · {accounts.rows.find((a) => a.id === m.account_id)?.name || <span className="text-amber-600 dark:text-amber-400">no account</span>}
                </div>
              </>
            }
          />
        ))}
      </Shell>
      <EditModal
        open={!!e}
        title={e?.id ? "Payment method" : "New payment method"}
        onClose={() => setE(null)}
        onSave={async () => {
          if (!e?.name?.trim()) return toast.error("Name the payment method");
          const row = { name: e.name.trim(), kind: e.kind, account_id: e.account_id || null, last4: e.last4 || null, active: e.active ?? true, sort: e.sort ?? list.length };
          if (await save(e.id || null, row as Partial<AccMethod>)) setE(null);
        }}
        onDelete={e?.id ? async () => (await remove(e.id!, e.name || "payment method", "Expenses keep their amounts but lose the method.")) && setE(null) : undefined}
      >
        {e && (
          <>
            <Field label="Name" required className="col-span-2">
              <Input value={e.name || ""} onChange={(x) => setE({ ...e, name: x.target.value })} placeholder="e.g. Amex Business, Zelle" autoFocus />
            </Field>
            <Field label="Type">
              <Select value={e.kind} onChange={(x) => setE({ ...e, kind: x.target.value as AccMethod["kind"] })}>
                {METHOD_KINDS.map((k) => (
                  <option key={k.v} value={k.v}>
                    {k.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Last 4 digits">
              <Input value={e.last4 || ""} maxLength={4} onChange={(x) => setE({ ...e, last4: x.target.value.replace(/\D/g, "") || null })} />
            </Field>
            <Field label="Paid from account" className="col-span-2" hint="Expenses with this method come out of this account's balance">
              <Select value={e.account_id || ""} onChange={(x) => setE({ ...e, account_id: x.target.value || null })}>
                <option value="">None</option>
                {accounts.rows.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Checkbox className="col-span-2" checked={e.active ?? true} onChange={(v) => setE({ ...e, active: v })} label="Active" />
          </>
        )}
      </EditModal>
    </>
  );
}

// ---- Custom fields ------------------------------------------------------------------------------------
function Fields() {
  const { fields } = useAcc();
  const { save, remove } = useSave<AccField>("acc_custom_fields", fields.put, fields.drop);
  const [e, setE] = useState<Partial<AccField> | null>(null);
  const list = [...fields.rows].sort(bySort);
  const sort = useSortable(
    list.map((f) => f.id),
    (ids) => saveOrder("acc_custom_fields", ids.map((id) => list.find((f) => f.id === id)!), fields.put),
  );
  return (
    <>
      <Shell onAdd={() => setE({ type: "text", applies_to: "all", required: false, active: true, options: [], sort: list.length })} addLabel="Add field" empty="Add your own fields to the expense and incoming forms (e.g. Project, Reimbursable, Invoice #)." count={fields.rows.length}>
        {list.map((f) => (
          <Row
            key={f.id}
            id={f.id}
            sort={sort}
            muted={!f.active}
            onClick={() => setE(f)}
            left={
              <>
                <div className="text-[13px] font-semibold text-fg">{f.label}</div>
                <div className="text-xs text-fg-3">
                  {FIELD_TYPES.find((t) => t.v === f.type)?.label}
                  {f.type === "select" && f.options.length ? `: ${f.options.join(", ")}` : ""} · {f.applies_to === "all" ? "Expenses and incoming" : f.applies_to === "expense" ? "Expenses" : "Incoming"}
                </div>
              </>
            }
            right={f.required ? <Pill className={neutralPill}>Required</Pill> : undefined}
          />
        ))}
      </Shell>
      <EditModal
        open={!!e}
        title={e?.id ? "Custom field" : "New custom field"}
        onClose={() => setE(null)}
        onSave={async () => {
          if (!e?.label?.trim()) return toast.error("Name the field");
          const options = e.options || [];
          if (e.type === "select" && !options.length) return toast.error("Add the dropdown choices");
          const row = { label: e.label.trim(), type: e.type, options, applies_to: e.applies_to, required: !!e.required, active: e.active ?? true, sort: e.sort ?? 0 };
          if (await save(e.id || null, row as Partial<AccField>)) setE(null);
        }}
        onDelete={e?.id ? async () => (await remove(e.id!, e.label || "field", "Values already saved on transactions stay in their history but no longer show.")) && setE(null) : undefined}
      >
        {e && (
          <>
            <Field label="Field name" required className="col-span-2">
              <Input value={e.label || ""} onChange={(x) => setE({ ...e, label: x.target.value })} placeholder="e.g. Project, Reimbursable" autoFocus />
            </Field>
            <Field label="Type">
              <Select value={e.type} onChange={(x) => setE({ ...e, type: x.target.value as AccField["type"] })}>
                {FIELD_TYPES.map((t) => (
                  <option key={t.v} value={t.v}>
                    {t.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="On">
              <Select value={e.applies_to} onChange={(x) => setE({ ...e, applies_to: x.target.value as AccField["applies_to"] })}>
                <option value="all">Expenses and incoming</option>
                <option value="expense">Expenses</option>
                <option value="income">Incoming</option>
              </Select>
            </Field>
            {e.type === "select" && (
              <div className="col-span-2">
                <div className="mb-1.5 text-xs font-semibold text-fg-2">Choices</div>
                <ChoicesEditor value={e.options || []} onChange={(options) => setE({ ...e, options })} />
              </div>
            )}
            <Checkbox className="col-span-2" checked={!!e.required} onChange={(v) => setE({ ...e, required: v })} label="Required" />
            <Checkbox className="col-span-2" checked={e.active ?? true} onChange={(v) => setE({ ...e, active: v })} label="Active (shown on the forms)" />
          </>
        )}
      </EditModal>
    </>
  );
}

// ---- Settings -----------------------------------------------------------------------------------------
function SettingsTab() {
  const { settings, setSettings } = useAcc();
  if (!settings) return null;
  const update = async (p: Partial<typeof settings>) => {
    const next = { ...settings, ...p };
    setSettings(next);
    const { error } = await sb().from("acc_settings").update(p).eq("id", 1);
    if (error) toast.error(errMsg(error));
    else toast.success("Saved");
  };
  return (
    <Card className="max-w-xl space-y-4 p-5">
      <Checkbox checked={settings.require_receipt} onChange={(v) => update({ require_receipt: v })} label={<span className="text-[13px]"><b>Require the invoice / receipt</b> on every expense</span>} />
      <Checkbox checked={settings.require_proof} onChange={(v) => update({ require_proof: v })} label={<span className="text-[13px]"><b>Require proof of payment</b> on incoming money</span>} />
      <p className="text-xs text-fg-3">Transactions without one show as &quot;Missing&quot; on the tracker and the dashboard either way.</p>
    </Card>
  );
}
