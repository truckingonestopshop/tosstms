"use client";

import { useState } from "react";
import { CheckCircle2, Plus, Repeat, SkipForward, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, Empty, Page, PageHeader, Pill, neutralPill } from "@/components/ui/Bits";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { confirmDialog } from "@/components/ui/Confirm";
import { Kpi } from "@/components/dashboard/Widgets";
import { useAcc } from "@/components/accounting/AccountingProvider";
import { errMsg, sb } from "@/lib/db";
import { useStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import { addDays, cn, daysUntil, fmtDay, money, today } from "@/lib/format";
import { FREQUENCIES, nextDate, perMonth, type AccRecurring, type AccTransaction } from "@/lib/accounting";

// Recurring: what TOSS pays (or receives) on a schedule. "Record" adds the transaction for the due
// date and moves to the next one (attach the receipt on the tracker); "Skip" just moves the date.

export default function RecurringPage() {
  const { me } = useStore();
  const { recurring, merchants, categories, methods, accounts, txs } = useAcc();
  const [e, setE] = useState<Partial<AccRecurring> | null>(null);
  const t = today();
  const active = recurring.rows.filter((r) => r.active);
  const monthlyOut = active.filter((r) => r.kind === "expense").reduce((s, r) => s + perMonth(r), 0);
  const monthlyIn = active.filter((r) => r.kind === "income").reduce((s, r) => s + perMonth(r), 0);
  const dueWeek = active.filter((r) => r.next_date <= addDays(t, 7));

  const record = async (r: AccRecurring) => {
    const method = methods.rows.find((m) => m.id === r.payment_method_id);
    const row = {
      kind: r.kind,
      date: r.next_date,
      amount: Number(r.amount),
      merchant_id: r.kind === "expense" ? r.merchant_id : null,
      counterparty: r.kind === "income" ? r.counterparty || r.name : r.merchant_id ? null : r.name,
      category_id: r.category_id,
      payment_method_id: r.kind === "expense" ? r.payment_method_id : null,
      account_id: r.kind === "expense" ? method?.account_id || r.account_id : r.account_id,
      processed_by: me.id,
      recurring_id: r.id,
      notes: r.notes,
    };
    const { data, error } = await sb().from("acc_transactions").insert(row).select().single();
    if (error) return toast.error(errMsg(error));
    txs.put(data as AccTransaction);
    await advance(r, false);
    toast.success(`${r.name} recorded for ${fmtDay(r.next_date)}. Add the receipt on Transactions.`);
  };
  const advance = async (r: AccRecurring, say = true) => {
    const next = nextDate(r.next_date, r.frequency);
    const { data, error } = await sb().from("acc_recurring").update({ next_date: next }).eq("id", r.id).select().single();
    if (error) return toast.error(errMsg(error));
    recurring.put(data as AccRecurring);
    if (say) toast.success(`Skipped · next ${fmtDay(next)}`);
  };

  const save = async () => {
    if (!e?.name?.trim() || !(Number(e.amount) > 0)) return toast.error("Give it a name and an amount");
    const row = {
      name: e.name.trim(),
      kind: e.kind || "expense",
      merchant_id: e.merchant_id || null,
      counterparty: e.counterparty || null,
      category_id: e.category_id || null,
      payment_method_id: e.payment_method_id || null,
      account_id: e.account_id || null,
      amount: Number(e.amount),
      frequency: e.frequency || "monthly",
      next_date: e.next_date || t,
      active: e.active ?? true,
      notes: e.notes || null,
    };
    const res = e.id ? await sb().from("acc_recurring").update(row).eq("id", e.id).select().single() : await sb().from("acc_recurring").insert(row).select().single();
    if (res.error) return toast.error(errMsg(res.error));
    recurring.put(res.data as AccRecurring);
    setE(null);
  };
  const remove = async () => {
    if (!e?.id || !(await confirmDialog({ title: `Delete ${e.name}?`, body: "Transactions already recorded stay.", confirmLabel: "Delete", danger: true }))) return;
    const { error } = await sb().from("acc_recurring").delete().eq("id", e.id);
    if (error) return toast.error(errMsg(error));
    recurring.drop(e.id);
    setE(null);
  };

  return (
    <Page className="max-w-[1200px]">
      <PageHeader
        eyebrow="TOSS Accounting"
        title="Recurring"
        actions={
          <Button variant="primary" onClick={() => setE({ kind: "expense", frequency: "monthly", next_date: t, active: true })}>
            <Plus className="h-4 w-4" /> Add recurring
          </Button>
        }
      />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Fixed costs / month" value={money(monthlyOut, { cents: false })} sub={`${active.filter((r) => r.kind === "expense").length} recurring expenses`} />
        <Kpi label="Recurring in / month" value={money(monthlyIn, { cents: false })} sub={`${active.filter((r) => r.kind === "income").length} recurring incoming`} />
        <Kpi label="Due this week" value={String(dueWeek.length)} sub={money(dueWeek.reduce((s, r) => s + Number(r.amount), 0), { cents: false })} />
        <Kpi label="Fixed costs / year" value={money(monthlyOut * 12, { cents: false })} sub="At today's amounts" />
      </div>

      {recurring.rows.length === 0 ? (
        <Card>
          <Empty icon={Repeat} title="No recurring items yet" body="Add rent, software, insurance, phone… so they show when they're due and take one click to record." />
        </Card>
      ) : (
        <Card>
          <ul className="divide-y divide-line">
            {[...recurring.rows]
              .sort((a, b) => Number(b.active) - Number(a.active) || a.next_date.localeCompare(b.next_date))
              .map((r) => {
                const n = daysUntil(r.next_date) ?? 0;
                const cat = categories.rows.find((c) => c.id === r.category_id);
                return (
                  <li key={r.id} className={cn("flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:px-5", !r.active && "opacity-50")}>
                    <button type="button" onClick={() => setE(r)} className="min-w-0 flex-1 text-left">
                      <div className="flex flex-wrap items-center gap-2 text-[13px] font-semibold text-fg">
                        {r.name}
                        <Pill className={neutralPill}>{FREQUENCIES.find((f) => f.v === r.frequency)?.label}</Pill>
                        {r.kind === "income" && <Pill className="bg-emerald-500/10 text-emerald-700 ring-emerald-600/25 dark:text-emerald-300">Incoming</Pill>}
                      </div>
                      <div className="text-xs text-fg-3">
                        {[merchants.rows.find((m) => m.id === r.merchant_id)?.name || r.counterparty, cat?.name, methods.rows.find((m) => m.id === r.payment_method_id)?.name || accounts.rows.find((a) => a.id === r.account_id)?.name].filter(Boolean).join(" · ")}
                      </div>
                    </button>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <div className="tnum text-[14px] font-semibold text-fg">{money(Number(r.amount))}</div>
                        <div className={cn("text-[11px]", n < 0 ? "text-red-600 dark:text-red-400" : n <= 7 ? "text-amber-600 dark:text-amber-400" : "text-fg-4")}>
                          {n < 0 ? `Overdue since ${fmtDay(r.next_date)}` : n === 0 ? "Due today" : `Next ${fmtDay(r.next_date)}`}
                        </div>
                      </div>
                      {r.active && (
                        <>
                          <Button size="sm" variant="outline" onClick={() => record(r)} title="Add the transaction and move to the next date">
                            <CheckCircle2 className="h-3.5 w-3.5" /> Record
                          </Button>
                          <Button size="icon-sm" variant="ghost" onClick={() => advance(r)} aria-label="Skip to the next date" title="Skip to the next date">
                            <SkipForward className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
          </ul>
        </Card>
      )}

      <Modal
        open={!!e}
        onClose={() => setE(null)}
        title={e?.id ? "Recurring" : "New recurring"}
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
            <Field label="Name" required className="col-span-2">
              <Input value={e.name || ""} onChange={(x) => setE({ ...e, name: x.target.value })} placeholder="e.g. Office rent, DAT subscription" autoFocus />
            </Field>
            <Field label="Type">
              <Select value={e.kind} onChange={(x) => setE({ ...e, kind: x.target.value as AccRecurring["kind"], category_id: null })}>
                <option value="expense">Expense</option>
                <option value="income">Incoming</option>
              </Select>
            </Field>
            <Field label="How often">
              <Select value={e.frequency} onChange={(x) => setE({ ...e, frequency: x.target.value as AccRecurring["frequency"] })}>
                {FREQUENCIES.map((f) => (
                  <option key={f.v} value={f.v}>
                    {f.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Amount" required>
              <Input type="number" min={0} step="0.01" prefix="$" value={e.amount ?? ""} onChange={(x) => setE({ ...e, amount: Number(x.target.value) })} />
            </Field>
            <Field label="Next date">
              <Input type="date" value={e.next_date || ""} onChange={(x) => setE({ ...e, next_date: x.target.value })} />
            </Field>
            {e.kind === "expense" ? (
              <Field label="Merchant">
                <Select value={e.merchant_id || ""} onChange={(x) => setE({ ...e, merchant_id: x.target.value || null })}>
                  <option value="">—</option>
                  {merchants.rows.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : (
              <Field label="From">
                <Input value={e.counterparty || ""} onChange={(x) => setE({ ...e, counterparty: x.target.value })} />
              </Field>
            )}
            <Field label="Category">
              <Select value={e.category_id || ""} onChange={(x) => setE({ ...e, category_id: x.target.value || null })}>
                <option value="">—</option>
                {categories.rows
                  .filter((c) => c.kind === (e.kind || "expense"))
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </Select>
            </Field>
            {e.kind === "expense" ? (
              <Field label="Payment method" className="col-span-2">
                <Select value={e.payment_method_id || ""} onChange={(x) => setE({ ...e, payment_method_id: x.target.value || null })}>
                  <option value="">—</option>
                  {methods.rows.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : (
              <Field label="Into account" className="col-span-2">
                <Select value={e.account_id || ""} onChange={(x) => setE({ ...e, account_id: x.target.value || null })}>
                  <option value="">—</option>
                  {accounts.rows.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            <Field label="Notes" className="col-span-2">
              <Textarea rows={2} value={e.notes || ""} onChange={(x) => setE({ ...e, notes: x.target.value })} />
            </Field>
            <Checkbox className="col-span-2" checked={e.active ?? true} onChange={(v) => setE({ ...e, active: v })} label="Active" />
          </div>
        )}
      </Modal>
    </Page>
  );
}
