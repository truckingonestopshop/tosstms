"use client";

import { Minus, Plus, X } from "lucide-react";
import { Input, Select } from "@/components/ui/Field";
import { stagger } from "@/components/ui/Motion";
import { CHARGE_PRESETS, CREDIT_PRESETS } from "@/lib/invoice";
import { cn, money, uid } from "@/lib/format";

export interface Adjustment {
  id: string;
  kind: "charge" | "credit";
  description: string;
  amount: string;
}

export const newAdjustment = (kind: Adjustment["kind"]): Adjustment => ({ id: uid(), kind, description: "", amount: "" });

/** Sum of adjustments: charges minus credits. */
export const adjustmentsTotal = (list: Adjustment[]) =>
  list.reduce((s, a) => s + (a.kind === "credit" ? -1 : 1) * (Number(a.amount) || 0), 0);

/**
 * Billing adjustments while creating an invoice: additional charges (added to the
 * total) and credits & adjustments (taken off it).
 */
export function AdjustmentsEditor({ value, onChange }: { value: Adjustment[]; onChange: (v: Adjustment[]) => void }) {
  const set = (id: string, p: Partial<Adjustment>) => onChange(value.map((a) => (a.id === id ? { ...a, ...p } : a)));
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold text-fg-2">Billing adjustments</span>
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => onChange([...value, newAdjustment("charge")])}
            className="inline-flex items-center gap-1 rounded-md border border-line px-2 py-1 text-xs font-medium text-fg-2 hover:border-line-strong hover:text-fg"
          >
            <Plus className="h-3 w-3" /> Additional charge
          </button>
          <button
            type="button"
            onClick={() => onChange([...value, newAdjustment("credit")])}
            className="inline-flex items-center gap-1 rounded-md border border-line px-2 py-1 text-xs font-medium text-fg-2 hover:border-line-strong hover:text-fg"
          >
            <Minus className="h-3 w-3" /> Credit / adjustment
          </button>
        </div>
      </div>
      {value.length === 0 ? (
        <p className="text-xs text-fg-4">Extra fees add to the total; discounts and deductions reduce it.</p>
      ) : (
        <ul className="space-y-2">
          {value.map((a, i) => {
            const presets = a.kind === "credit" ? CREDIT_PRESETS : CHARGE_PRESETS;
            return (
              <li key={a.id} className="animate-rise rounded-lg border border-line p-2.5" style={stagger(i, 30)}>
                <div className="flex flex-wrap items-center gap-2">
                  <Select value={a.kind} onChange={(e) => set(a.id, { kind: e.target.value as Adjustment["kind"] })} className={cn("h-8 w-[150px] text-[13px]", a.kind === "credit" ? "text-emerald-700 dark:text-emerald-300" : "")} aria-label="Type">
                    <option value="charge">Additional charge</option>
                    <option value="credit">Credit / adjustment</option>
                  </Select>
                  <Input
                    list={`adj-presets-${a.kind}`}
                    value={a.description}
                    onChange={(e) => set(a.id, { description: e.target.value })}
                    placeholder={a.kind === "credit" ? "e.g. Discount" : "e.g. Late payment fee"}
                    className="h-8 min-w-[160px] flex-1 text-[13px]"
                  />
                  <Input value={a.amount} onChange={(e) => set(a.id, { amount: e.target.value.replace(/[^0-9.]/g, "") })} inputMode="decimal" prefix={a.kind === "credit" ? "−$" : "+$"} className="h-8 w-28 text-right text-[13px]" aria-label="Amount" />
                  <button type="button" onClick={() => onChange(value.filter((x) => x.id !== a.id))} className="rounded-md p-1 text-fg-4 hover:bg-surface-2 hover:text-red-500" aria-label="Remove">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {presets.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => set(a.id, { description: p })}
                      className={cn("rounded-full border px-2 py-0.5 text-[11px] transition-colors", a.description === p ? "border-transparent bg-inverse text-inverse-fg" : "border-line text-fg-3 hover:text-fg")}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <datalist id="adj-presets-charge">
        {CHARGE_PRESETS.map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>
      <datalist id="adj-presets-credit">
        {CREDIT_PRESETS.map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>
      {value.length > 0 && (
        <div className="tnum mt-2 text-right text-xs text-fg-3">
          Adjustments {adjustmentsTotal(value) < 0 ? "−" : "+"}
          {money(Math.abs(adjustmentsTotal(value)))}
        </div>
      )}
    </div>
  );
}
