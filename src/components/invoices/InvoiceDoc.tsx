"use client";

import { forwardRef } from "react";
import { Plus, X } from "lucide-react";
import { LogoMark } from "@/components/brand/Logo";
import { blankLine, totals, type InvoiceDraft } from "@/lib/invoice";
import { cn, fmtDay, money } from "@/lib/format";

// The invoice as a printed page: always black on white, whatever the app theme.
// In edit mode every text is editable in place.

const edit =
  "w-full rounded-sm border border-transparent bg-transparent px-1 -mx-1 text-inherit outline-none transition-colors hover:border-dashed hover:border-zinc-300 focus:border-solid focus:border-[#f28c38] focus:bg-orange-50/40";

function T({
  value,
  onChange,
  editing,
  className,
  placeholder,
  multiline,
  rows = 2,
}: {
  value: string;
  onChange: (v: string) => void;
  editing: boolean;
  className?: string;
  placeholder?: string;
  multiline?: boolean;
  rows?: number;
}) {
  if (!editing) return <span className={cn("whitespace-pre-wrap", className)}>{value || ""}</span>;
  return multiline ? (
    <textarea value={value} rows={rows} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className={cn(edit, "resize-y leading-snug", className)} />
  ) : (
    <input value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className={cn(edit, className)} />
  );
}

function N({ value, onChange, editing, className }: { value: number; onChange: (v: number) => void; editing: boolean; className?: string }) {
  if (!editing) return <span className={className}>{money(value)}</span>;
  return (
    <input
      inputMode="decimal"
      defaultValue={value ? value.toFixed(2) : ""}
      key={value}
      onBlur={(e) => onChange(Math.round((parseFloat(e.target.value.replace(/[^0-9.-]/g, "")) || 0) * 100) / 100)}
      className={cn(edit, "tnum text-right", className)}
    />
  );
}

function D({ value, onChange, editing, className }: { value: string | null; onChange: (v: string) => void; editing: boolean; className?: string }) {
  if (!editing) return <span className={className}>{value ? fmtDay(value, true) : "—"}</span>;
  return <input type="date" value={value || ""} onChange={(e) => onChange(e.target.value)} className={cn(edit, "w-[132px]", className)} />;
}

/** "10%" / "8.5%" */
const pctOf = (amount: number, gross: number) => `${+((Number(amount) / Number(gross)) * 100).toFixed(2)}%`;

export const InvoiceDoc = forwardRef<
  HTMLDivElement,
  { d: InvoiceDraft; editing: boolean; onChange: (d: InvoiceDraft) => void; statusLabel?: string }
>(function InvoiceDoc({ d, editing, onChange, statusLabel }, ref) {
  const set = (p: Partial<InvoiceDraft>) => onChange({ ...d, ...p });
  const o = d.doc_overrides || {};
  const setO = (p: Partial<NonNullable<InvoiceDraft["doc_overrides"]>>) => set({ doc_overrides: { ...o, ...p } });
  const setLine = (i: number, p: Partial<InvoiceDraft["lines"][number]>) =>
    set({
      lines: d.lines.map((l, j) => {
        if (j !== i) return l;
        const next = { ...l, ...p };
        if (d.invoice_type === "custom" && ("quantity" in p || "unit_price" in p)) {
          next.amount = Math.round((Number(next.quantity) || 0) * (Number(next.unit_price) || 0) * 100) / 100;
          next.gross_amount = next.amount;
        }
        return next;
      }),
    });
  const t = totals(d);
  const isLoad = d.invoice_type === "load";
  const cur = d.currency;

  return (
    <div
      ref={ref}
      className="print-sheet relative mx-auto w-full max-w-[860px] overflow-hidden rounded-lg bg-white p-6 text-[13px] leading-relaxed text-[#111] shadow-[0_1px_3px_rgba(0,0,0,0.08),0_12px_40px_-12px_rgba(0,0,0,0.25)] ring-1 ring-black/5 sm:p-10"
    >
      {/* Paid / void stamp (lands with a small thud when the status changes; prints too). */}
      {!editing && (d.status === "paid" || d.status === "void") && (
        <div
          key={d.status}
          aria-hidden
          className={cn(
            "animate-stamp pointer-events-none absolute right-6 top-[132px] z-10 select-none rounded-md border-[3px] px-4 py-1 text-[30px] font-black uppercase tracking-[0.18em] opacity-90 sm:right-12 sm:top-[150px]",
            d.status === "paid" ? "border-emerald-600 text-emerald-600" : "border-red-600 text-red-600",
          )}
        >
          {d.status === "paid" ? "Paid" : "Void"}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col gap-6 border-b border-zinc-200 pb-6 sm:flex-row sm:justify-between">
        <div className="min-w-0 sm:max-w-[55%]">
          <LogoMark className="h-9 w-auto text-[#1F2825]" />
          <div className="mt-4 font-semibold">
            <T editing={editing} value={d.issuer_name || ""} onChange={(v) => set({ issuer_name: v })} placeholder="Your legal company name" />
          </div>
          <div className="text-zinc-600">
            <T editing={editing} multiline value={d.issuer_address || ""} onChange={(v) => set({ issuer_address: v })} placeholder="Street, City, ST ZIP" />
          </div>
          <div className="text-zinc-600">
            <T editing={editing} value={d.issuer_email || ""} onChange={(v) => set({ issuer_email: v })} placeholder="billing@…" />
          </div>
          <div className="text-zinc-600">
            <T editing={editing} value={d.issuer_phone || ""} onChange={(v) => set({ issuer_phone: v })} placeholder="Phone" />
          </div>
        </div>
        <div className="sm:text-right">
          <div className="text-[28px] font-bold tracking-tight">INVOICE</div>
          <div className="mt-1 grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 sm:justify-end">
            <span className="text-zinc-500">Number</span>
            <span className="font-semibold">
              <T editing={editing} value={d.invoice_number} onChange={(v) => set({ invoice_number: v })} className="sm:text-right" />
            </span>
            <span className="text-zinc-500">Issued</span>
            <span>
              <D editing={editing} value={d.issue_date} onChange={(v) => set({ issue_date: v })} />
            </span>
            <span className="text-zinc-500">Due</span>
            <span className="font-semibold">
              <D editing={editing} value={d.due_date} onChange={(v) => set({ due_date: v })} />
            </span>
            {statusLabel && (
              <>
                <span className="text-zinc-500">Status</span>
                <span className="font-semibold uppercase tracking-wide">{statusLabel}</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Bill to / terms */}
      <div className="grid grid-cols-1 gap-6 border-b border-zinc-200 py-6 sm:grid-cols-2">
        <div>
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
            <T editing={editing} value={o.bill_to_title ?? "Bill to"} onChange={(v) => setO({ bill_to_title: v })} />
          </div>
          <div className="text-[15px] font-semibold">
            <T editing={editing} value={d.bill_to_name || ""} onChange={(v) => set({ bill_to_name: v })} placeholder="Customer name" />
          </div>
          <div className="text-zinc-600">
            <T editing={editing} multiline rows={3} value={d.bill_to_details || ""} onChange={(v) => set({ bill_to_details: v })} placeholder="MC / DOT, address, contact" />
          </div>
        </div>
        <div>
          {(editing || o.terms_text) && (
            <>
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                <T editing={editing} value={o.terms_title ?? "Terms"} onChange={(v) => setO({ terms_title: v })} />
              </div>
              <div className="text-zinc-700">
                <T editing={editing} multiline value={o.terms_text || ""} onChange={(v) => setO({ terms_text: v })} placeholder="Agreement or payment terms" />
              </div>
            </>
          )}
          {(d.period_start || editing) && (
            <div className="mt-3 text-zinc-600">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Service period </span>
              <div className="flex flex-wrap items-center gap-1">
                <D editing={editing} value={d.period_start} onChange={(v) => set({ period_start: v })} />
                <span>–</span>
                <D editing={editing} value={d.period_end} onChange={(v) => set({ period_end: v })} />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Lines */}
      <div className="overflow-x-auto">
        <table className="mt-4 w-full min-w-[520px] text-left">
          <thead>
            <tr className="border-b border-zinc-300 text-[11px] uppercase tracking-wider text-zinc-500">
              <th className="w-[120px] py-2 pr-2 font-semibold">Date</th>
              <th className="py-2 pr-2 font-semibold">Description</th>
              {isLoad ? (
                <th className="w-[110px] py-2 pr-2 text-right font-semibold">Load gross</th>
              ) : (
                <>
                  <th className="w-[70px] py-2 pr-2 text-right font-semibold">Qty</th>
                  <th className="w-[110px] py-2 pr-2 text-right font-semibold">Price</th>
                </>
              )}
              <th className="w-[120px] py-2 text-right font-semibold">{isLoad ? "Fee" : "Amount"}</th>
              {editing && <th className="w-6" />}
            </tr>
          </thead>
          <tbody>
            {d.lines.map((l, i) => (
              <tr key={l.id || i} className="border-b border-zinc-100 align-top">
                <td className="py-2 pr-2">
                  <D editing={editing} value={l.line_date} onChange={(v) => setLine(i, { line_date: v })} />
                </td>
                <td className="py-2 pr-2">
                  <T editing={editing} multiline={editing} rows={1} value={l.description} onChange={(v) => setLine(i, { description: v })} placeholder="Description" />
                  {isLoad && (l.rate_con_number || l.broker_name) && !editing && (
                    <div className="text-[11px] text-zinc-500">{[l.broker_name, l.rate_con_number && `RC ${l.rate_con_number}`].filter(Boolean).join(" · ")}</div>
                  )}
                </td>
                {isLoad ? (
                  <td className="tnum py-2 pr-2 text-right text-zinc-600">
                    <N editing={editing && !l.load_id} value={l.gross_amount} onChange={(v) => setLine(i, { gross_amount: v })} />
                  </td>
                ) : (
                  <>
                    <td className="tnum py-2 pr-2 text-right">
                      {editing ? (
                        <input
                          inputMode="decimal"
                          value={String(l.quantity)}
                          onChange={(e) => setLine(i, { quantity: parseFloat(e.target.value) || 0 })}
                          className={cn(edit, "text-right")}
                        />
                      ) : (
                        l.quantity
                      )}
                    </td>
                    <td className="tnum py-2 pr-2 text-right">
                      <N editing={editing} value={l.unit_price} onChange={(v) => setLine(i, { unit_price: v })} />
                    </td>
                  </>
                )}
                <td className="tnum py-2 text-right font-semibold">
                  {isLoad ? <N editing={editing} value={l.amount} onChange={(v) => setLine(i, { amount: v, unit_price: v })} /> : money(l.amount, { currency: cur })}
                  {/* Show the math: the fee as a share of the load's gross. */}
                  {isLoad && !editing && Number(l.gross_amount) > 0 && Number(l.amount) > 0 && (
                    <div className="text-[11px] font-normal text-zinc-500">{pctOf(l.amount, l.gross_amount)} of gross</div>
                  )}
                </td>
                {editing && (
                  <td className="py-2 pl-1">
                    <button onClick={() => set({ lines: d.lines.filter((_, j) => j !== i) })} className="rounded p-0.5 text-zinc-400 hover:text-red-600" aria-label="Remove line">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing && (
        <button
          onClick={() => set({ lines: [...d.lines, blankLine(d.lines.length)] })}
          className="mt-2 inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-zinc-600 hover:bg-zinc-100"
        >
          <Plus className="h-3.5 w-3.5" /> Add line
        </button>
      )}

      {/* Totals */}
      <div className="mt-6 flex justify-end">
        <div className="w-full max-w-[300px] space-y-1.5">
          {isLoad && (
            <div className="flex justify-between text-zinc-600">
              <span>Total load gross</span>
              <span className="tnum">{money(t.gross, { currency: cur })}</span>
            </div>
          )}
          <div className="flex justify-between border-t border-zinc-300 pt-2 text-[16px] font-bold">
            <T editing={editing} value={o.total_label ?? (isLoad ? "Dispatch fee due" : "Total due")} onChange={(v) => setO({ total_label: v })} />
            <span className="tnum shrink-0 pl-3">{money(t.due, { currency: cur })}</span>
          </div>
          {d.amount_paid > 0 && d.status !== "void" && d.status !== "draft" && (
            <>
              <div className="flex justify-between text-emerald-700">
                <span>Paid</span>
                <span className="tnum">−{money(Math.min(d.amount_paid, t.due), { currency: cur })}</span>
              </div>
              <div className="flex justify-between border-t border-zinc-200 pt-1.5 font-semibold">
                <span>Balance due</span>
                <span className="tnum">{money(Math.max(0, t.due - d.amount_paid), { currency: cur })}</span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Notes */}
      <div className="mt-8 grid grid-cols-1 gap-6 border-t border-zinc-200 pt-6 sm:grid-cols-2">
        <div>
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
            <T editing={editing} value={o.remittance_title ?? "How to pay"} onChange={(v) => setO({ remittance_title: v })} />
          </div>
          <div className="text-zinc-700">
            <T editing={editing} multiline value={o.remittance_text ?? ""} onChange={(v) => setO({ remittance_text: v })} placeholder="Bank / ACH / Zelle details" />
          </div>
        </div>
        {(editing || d.notes) && (
          <div>
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Notes</div>
            <div className="text-zinc-700">
              <T editing={editing} multiline value={d.notes || ""} onChange={(v) => set({ notes: v })} placeholder="Optional" />
            </div>
          </div>
        )}
      </div>
      <div className="mt-8 text-center text-[11px] text-zinc-500">
        <T editing={editing} value={o.footer_text ?? ""} onChange={(v) => setO({ footer_text: v })} placeholder="Footer" className="text-center" />
      </div>
    </div>
  );
});
