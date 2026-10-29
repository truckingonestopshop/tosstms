"use client";

import { forwardRef } from "react";
import { ArrowDown, ArrowUp, Copy, Plus, X } from "lucide-react";
import { LogoMark } from "@/components/brand/Logo";
import { CHARGE_PRESETS, CREDIT_PRESETS, adjustmentLine, blankLine, mondayOf, totals, type InvoiceDraft } from "@/lib/invoice";
import { addDays, cn, fmtDay, money } from "@/lib/format";

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

/** Secondary text on the printed page (slate blue-grey, like the letterhead). */
/** Edit-mode buttons on a line: move up / down, copy, remove. */
function LineTools({ first, last, onMove, onCopy, onRemove, label = "line" }: { first: boolean; last: boolean; onMove: (dir: -1 | 1) => void; onCopy?: () => void; onRemove: () => void; label?: string }) {
  const btn = "rounded p-0.5 text-zinc-400 hover:text-zinc-700 disabled:opacity-25";
  return (
    <div className="flex items-center">
      <div className="flex flex-col">
        <button onClick={() => onMove(-1)} disabled={first} className={btn} aria-label={`Move ${label} up`}>
          <ArrowUp className="h-3 w-3" />
        </button>
        <button onClick={() => onMove(1)} disabled={last} className={btn} aria-label={`Move ${label} down`}>
          <ArrowDown className="h-3 w-3" />
        </button>
      </div>
      <div className="flex flex-col">
        {onCopy && (
          <button onClick={onCopy} className={btn} aria-label={`Copy ${label}`}>
            <Copy className="h-3 w-3" />
          </button>
        )}
        <button onClick={onRemove} className="rounded p-0.5 text-zinc-400 hover:text-red-600" aria-label={`Remove ${label}`}>
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

const SUB = "text-[#5b6b86]";
const LABEL = "text-[11px] font-semibold uppercase tracking-[0.08em] text-[#5b6b86]";

const DEFAULT_TAGLINE = "All your trucking needs in one place";

/** Letterhead mark: tagline | TOSS logo with "TRUCKING ONE STOP SHOP" under it. */
function Letterhead({ tagline, editing, onTagline }: { tagline: string; editing: boolean; onTagline: (v: string) => void }) {
  return (
    <div className="flex items-center gap-4">
      <div className="w-[108px] text-right font-serif text-[15px] italic leading-[1.15] text-[#111] [text-wrap:balance]">
        {editing ? (
          <T editing value={tagline} onChange={onTagline} multiline rows={3} className="text-right" />
        ) : (
          <span className="whitespace-pre-line">{tagline}</span>
        )}
      </div>
      <div className="h-[62px] w-px bg-[#111]" aria-hidden />
      <div className="flex flex-col items-center">
        <LogoMark className="h-[46px] w-auto text-[#111]" />
        <div className="mt-1 text-[7.5px] font-bold uppercase tracking-[0.12em] text-[#111]">Trucking One Stop Shop</div>
      </div>
    </div>
  );
}

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
        if ((next.kind || "item") === "item" && d.invoice_type === "custom" && ("quantity" in p || "unit_price" in p)) {
          next.amount = Math.round((Number(next.quantity) || 0) * (Number(next.unit_price) || 0) * 100) / 100;
          next.gross_amount = next.amount;
        }
        if (next.kind === "charge" || next.kind === "credit") {
          if ("amount" in p) next.unit_price = next.amount;
        }
        return next;
      }),
    });
  const removeLine = (i: number) => set({ lines: d.lines.filter((_, j) => j !== i) });
  /** Swap a line with the next / previous line of the same section (lines or adjustments). */
  const moveLine = (i: number, dir: -1 | 1) => {
    const same = (k?: string | null) => ((k || "item") === "item" ? "item" : "adj");
    const kind = same(d.lines[i].kind);
    let j = i + dir;
    while (j >= 0 && j < d.lines.length && same(d.lines[j].kind) !== kind) j += dir;
    if (j < 0 || j >= d.lines.length) return;
    const lines = [...d.lines];
    [lines[i], lines[j]] = [lines[j], lines[i]];
    set({ lines });
  };
  const copyLine = (i: number) => {
    const { id: _id, ...rest } = d.lines[i];
    void _id;
    set({ lines: [...d.lines.slice(0, i + 1), { ...rest, load_id: null }, ...d.lines.slice(i + 1)] });
  };
  const t = totals(d);
  const isLoad = d.invoice_type === "load";
  const cur = d.currency;
  // Keep each line's index in d.lines so edits land on the right row.
  const indexed = d.lines.map((l, i) => ({ l, i }));
  const items = indexed.filter(({ l }) => (l.kind || "item") === "item");
  const adjustments = indexed.filter(({ l }) => l.kind === "charge" || l.kind === "credit");
  const hasAdj = adjustments.length > 0;
  const paid = d.amount_paid > 0 && d.status !== "void" && d.status !== "draft";

  return (
    <div
      ref={ref}
      className="print-sheet relative mx-auto w-full max-w-[860px] overflow-hidden rounded-lg bg-white p-6 text-[13px] leading-relaxed text-[#111] shadow-[0_1px_3px_rgba(0,0,0,0.08),0_12px_40px_-12px_rgba(0,0,0,0.25)] ring-1 ring-black/5 sm:px-11 sm:py-10"
    >
      {/* Paid / void stamp (lands with a small thud when the status changes; prints too). */}
      {!editing && (d.status === "paid" || d.status === "void") && (
        <div
          key={d.status}
          aria-hidden
          className={cn(
            "animate-stamp pointer-events-none absolute right-8 top-[178px] z-10 select-none rounded-md border-[3px] px-4 py-1 text-[30px] font-black uppercase tracking-[0.18em] opacity-90 sm:right-14",
            d.status === "paid" ? "border-emerald-600 text-emerald-600" : "border-red-600 text-red-600",
          )}
        >
          {d.status === "paid" ? "Paid" : "Void"}
        </div>
      )}

      {/* Letterhead + company · INVOICE + number / dates / status */}
      <div className="flex flex-col gap-6 border-b border-zinc-200 pb-6 sm:flex-row sm:justify-between">
        <div className="min-w-0 sm:max-w-[58%]">
          <Letterhead tagline={o.tagline ?? DEFAULT_TAGLINE} editing={editing} onTagline={(v) => setO({ tagline: v })} />
          <div className="mt-5 text-[15px] font-bold">
            <T editing={editing} value={d.issuer_name || ""} onChange={(v) => set({ issuer_name: v })} placeholder="Your company name" />
          </div>
          <div className={cn("mt-0.5 space-y-0", SUB)}>
            <div>
              <T editing={editing} value={d.issuer_phone || ""} onChange={(v) => set({ issuer_phone: v })} placeholder="Phone" />
            </div>
            <div>
              <T editing={editing} multiline rows={3} value={d.issuer_address || ""} onChange={(v) => set({ issuer_address: v })} placeholder="Street, City, State ZIP, Country" />
            </div>
            {(editing || d.issuer_email) && (
              <div>
                <T editing={editing} value={d.issuer_email || ""} onChange={(v) => set({ issuer_email: v })} placeholder="billing@…" />
              </div>
            )}
            {(editing || d.issuer_website) && (
              <div>
                <T editing={editing} value={d.issuer_website || ""} onChange={(v) => set({ issuer_website: v })} placeholder="www.your-site.com" />
              </div>
            )}
          </div>
        </div>
        <div className="sm:pt-1 sm:text-right">
          <div className="text-[30px] font-bold leading-none tracking-tight">INVOICE</div>
          <div className="mt-5 grid grid-cols-[auto_1fr] gap-x-5 gap-y-1 sm:justify-end">
            <span className={SUB}>Number</span>
            <span className="font-medium">
              <T editing={editing} value={d.invoice_number} onChange={(v) => set({ invoice_number: v })} className="sm:text-right" />
            </span>
            <span className={SUB}>Issued</span>
            <span className="font-medium">
              <D editing={editing} value={d.issue_date} onChange={(v) => set({ issue_date: v })} />
            </span>
            {(editing || d.due_date) && (
              <>
                <span className={SUB}>Auto charge date</span>
                <span className="font-medium">
                  <D editing={editing} value={d.due_date} onChange={(v) => set({ due_date: v })} />
                </span>
              </>
            )}
            {statusLabel && (
              <>
                <span className={SUB}>Status</span>
                <span className="font-medium uppercase">{statusLabel}</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Bill to · agreement + service period */}
      <div className="grid grid-cols-1 gap-6 border-b border-zinc-200 py-6 sm:grid-cols-2">
        <div>
          <div className={cn("mb-1.5", LABEL)}>
            <T editing={editing} value={o.bill_to_title ?? "Bill to"} onChange={(v) => setO({ bill_to_title: v })} />
          </div>
          <div className="text-[14px] font-bold uppercase">
            <T editing={editing} value={d.bill_to_name || ""} onChange={(v) => set({ bill_to_name: v })} placeholder="Customer name" />
          </div>
          <div className={SUB}>
            <T editing={editing} multiline rows={3} value={d.bill_to_details || ""} onChange={(v) => set({ bill_to_details: v })} placeholder="MC / DOT, address, contact" />
          </div>
        </div>
        <div>
          {(editing || o.terms_text) && (
            <>
              <div className={cn("mb-1.5", LABEL)}>
                <T editing={editing} value={o.terms_title ?? "Terms"} onChange={(v) => setO({ terms_title: v })} />
              </div>
              <div className={SUB}>
                <T editing={editing} multiline value={o.terms_text || ""} onChange={(v) => setO({ terms_text: v })} placeholder="Agreement or payment terms" />
              </div>
            </>
          )}
          {(d.period_start || editing) && (
            <div className="mt-4">
              <div className={cn("mb-1.5", LABEL)}>Service period</div>
              <div className={cn("flex flex-wrap items-center gap-1", SUB)}>
                {/* Always Monday to Monday: a picked day snaps to its week's Monday. */}
                <D editing={editing} value={d.period_start} onChange={(v) => set(v ? { period_start: mondayOf(v), period_end: addDays(mondayOf(v), 7) } : { period_start: v })} />
                <span>–</span>
                <D editing={editing} value={d.period_end} onChange={(v) => set({ period_end: v ? mondayOf(v) : v })} />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Lines */}
      <div className="overflow-x-auto">
        <table className="mt-2 w-full min-w-[520px] text-left">
          <thead>
            <tr className={cn("border-b border-zinc-200", LABEL)}>
              <th className="w-[120px] py-3 pr-2 font-semibold">Date</th>
              <th className="py-3 pr-2 font-semibold">Description</th>
              {isLoad ? (
                <th className="w-[130px] py-3 pr-2 text-right font-semibold">Load gross</th>
              ) : (
                <>
                  <th className="w-[70px] py-3 pr-2 text-right font-semibold">Qty</th>
                  <th className="w-[110px] py-3 pr-2 text-right font-semibold">Price</th>
                </>
              )}
              <th className="w-[120px] py-3 text-right font-semibold">{isLoad ? "Fee" : "Amount"}</th>
              {editing && <th className="w-[52px]" />}
            </tr>
          </thead>
          <tbody>
            {items.map(({ l, i }) => {
              // Under the lane: the truck and driver (the load number is already in the line).
              const sub = [l.truck_number && `Truck #${l.truck_number}`, l.driver_name].filter(Boolean).join(" · ");
              const perMile = Number(l.loaded_miles) > 0 && Number(l.gross_amount) > 0 ? Number(l.gross_amount) / Number(l.loaded_miles) : 0;
              return (
                <tr key={l.id || i} className="border-b border-zinc-100 align-top">
                  <td className="py-3.5 pr-2">
                    <D editing={editing} value={l.line_date} onChange={(v) => setLine(i, { line_date: v })} />
                  </td>
                  <td className="py-3.5 pr-2">
                    <T editing={editing} multiline={editing} rows={1} value={l.description} onChange={(v) => setLine(i, { description: v })} placeholder="Description" />
                    {isLoad && sub && !editing && <div className={cn("text-[11.5px]", SUB)}>{sub}</div>}
                  </td>
                  {isLoad ? (
                    <td className={cn("tnum py-3.5 pr-2 text-right", SUB)}>
                      <N editing={editing && !l.load_id} value={l.gross_amount} onChange={(v) => setLine(i, { gross_amount: v })} />
                      {perMile > 0 && !editing && <div className="text-[11.5px]">${perMile.toFixed(2)} / mi</div>}
                    </td>
                  ) : (
                    <>
                      <td className="tnum py-3.5 pr-2 text-right">
                        {editing ? (
                          <input inputMode="decimal" value={String(l.quantity)} onChange={(e) => setLine(i, { quantity: parseFloat(e.target.value) || 0 })} className={cn(edit, "text-right")} />
                        ) : (
                          l.quantity
                        )}
                      </td>
                      <td className="tnum py-3.5 pr-2 text-right">
                        <N editing={editing} value={l.unit_price} onChange={(v) => setLine(i, { unit_price: v })} />
                      </td>
                    </>
                  )}
                  <td className="tnum py-3.5 text-right font-bold">
                    {isLoad ? <N editing={editing} value={l.amount} onChange={(v) => setLine(i, { amount: v, unit_price: v })} /> : money(l.amount, { currency: cur })}
                    {isLoad && !editing && Number(l.gross_amount) > 0 && Number(l.amount) > 0 && (
                      <div className="text-[11px] font-normal text-[#8a97ab]">{pctOf(l.amount, l.gross_amount)}</div>
                    )}
                  </td>
                  {editing && (
                    <td className="py-3.5 pl-1">
                      <LineTools first={items[0]?.i === i} last={items[items.length - 1]?.i === i} onMove={(dir) => moveLine(i, dir)} onCopy={() => copyLine(i)} onRemove={() => removeLine(i)} />
                    </td>
                  )}
                </tr>
              );
            })}
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

      {/* Billing adjustments: additional charges (+) and credits (−) */}
      {(hasAdj || editing) && (
        <div className="mt-6">
          <div className={cn("mb-1.5", LABEL)}>Billing adjustments</div>
          {hasAdj && (
            <table className="w-full text-left">
              <tbody>
                {adjustments.map(({ l, i }) => {
                  const credit = l.kind === "credit";
                  return (
                    <tr key={l.id || i} className="border-b border-zinc-100 align-top">
                      <td className={cn("w-[150px] py-2.5 pr-2 text-[11.5px] font-semibold uppercase tracking-wide", credit ? "text-emerald-700" : "text-[#b4540f]")}>
                        {editing ? (
                          <select value={l.kind} onChange={(e) => setLine(i, { kind: e.target.value as "charge" | "credit" })} className={cn(edit, "w-auto")}>
                            <option value="charge">Additional charge</option>
                            <option value="credit">Credit</option>
                          </select>
                        ) : credit ? (
                          "Credit"
                        ) : (
                          "Additional charge"
                        )}
                      </td>
                      <td className="py-2.5 pr-2">
                        <T editing={editing} value={l.description} onChange={(v) => setLine(i, { description: v })} placeholder={credit ? "e.g. Discount" : "e.g. Late payment fee"} />
                        {editing && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {(credit ? CREDIT_PRESETS : CHARGE_PRESETS).map((p) => (
                              <button key={p} type="button" onClick={() => setLine(i, { description: p })} className="rounded-full border border-zinc-200 px-2 py-0.5 text-[10.5px] text-zinc-500 hover:border-zinc-400 hover:text-zinc-800">
                                {p}
                              </button>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className={cn("tnum w-[130px] py-2.5 text-right font-semibold", credit ? "text-emerald-700" : "text-[#111]")}>
                        {editing ? (
                          <N editing value={l.amount} onChange={(v) => setLine(i, { amount: Math.abs(v), unit_price: Math.abs(v) })} />
                        ) : (
                          `${credit ? "−" : "+"}${money(l.amount, { currency: cur })}`
                        )}
                      </td>
                      {editing && (
                        <td className="w-[52px] py-2.5 pl-1">
                          <LineTools label="adjustment" first={adjustments[0]?.i === i} last={adjustments[adjustments.length - 1]?.i === i} onMove={(dir) => moveLine(i, dir)} onRemove={() => removeLine(i)} />
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          {editing && (
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                onClick={() => set({ lines: [...d.lines, adjustmentLine("charge", d.lines.length)] })}
                className="inline-flex items-center gap-1 rounded-md border border-zinc-200 px-2 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
              >
                <Plus className="h-3.5 w-3.5" /> Additional charge
              </button>
              <button
                onClick={() => set({ lines: [...d.lines, adjustmentLine("credit", d.lines.length)] })}
                className="inline-flex items-center gap-1 rounded-md border border-zinc-200 px-2 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
              >
                <Plus className="h-3.5 w-3.5" /> Credit / adjustment
              </button>
            </div>
          )}
        </div>
      )}

      {/* Totals */}
      <div className="mt-6 flex justify-end">
        <div className="w-full max-w-[320px] space-y-2">
          {isLoad && (
            <div className={cn("flex justify-between", SUB)}>
              <span>Total load gross</span>
              <span className="tnum">{money(t.gross, { currency: cur })}</span>
            </div>
          )}
          {hasAdj && (
            <>
              <div className={cn("flex justify-between", SUB)}>
                <span>{isLoad ? "Dispatch fees" : "Subtotal"}</span>
                <span className="tnum">{money(t.subtotal, { currency: cur })}</span>
              </div>
              {t.charges > 0 && (
                <div className={cn("flex justify-between", SUB)}>
                  <span>Additional charges</span>
                  <span className="tnum">+{money(t.charges, { currency: cur })}</span>
                </div>
              )}
              {t.credits > 0 && (
                <div className="flex justify-between text-emerald-700">
                  <span>Credits &amp; adjustments</span>
                  <span className="tnum">−{money(t.credits, { currency: cur })}</span>
                </div>
              )}
            </>
          )}
          <div className="flex items-baseline justify-between border-t border-zinc-300 pt-3 text-[18px] font-bold">
            <T editing={editing} value={o.total_label ?? (isLoad ? "Dispatch fee due" : "Total due")} onChange={(v) => setO({ total_label: v })} />
            <span className="tnum shrink-0 pl-3">{money(t.due, { currency: cur })}</span>
          </div>
          {paid && (
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

      {/* Payment notice · notes */}
      <div className="mt-8 grid grid-cols-1 gap-6 border-t border-zinc-200 pt-6 sm:grid-cols-2">
        <div>
          <div className={cn("mb-1.5", LABEL)}>
            <T editing={editing} value={o.remittance_title ?? "Payment notice"} onChange={(v) => setO({ remittance_title: v })} />
          </div>
          <div className={SUB}>
            <T editing={editing} multiline value={o.remittance_text ?? ""} onChange={(v) => setO({ remittance_text: v })} placeholder="How and when payment is collected" />
          </div>
        </div>
        {(editing || d.notes) && (
          <div>
            <div className={cn("mb-1.5", LABEL)}>Notes</div>
            <div className={SUB}>
              <T editing={editing} multiline value={d.notes || ""} onChange={(v) => set({ notes: v })} placeholder="Optional" />
            </div>
          </div>
        )}
      </div>
      <div className={cn("mt-10 text-center text-[12px]", SUB)}>
        <T editing={editing} value={o.footer_text ?? "Thank you for your business."} onChange={(v) => setO({ footer_text: v })} placeholder="Footer" className="text-center" />
      </div>
    </div>
  );
});
