"use client";

import Link from "next/link";
import { use, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Ban,
  CircleDollarSign,
  Download,
  FilePen,
  Mail,
  MoreHorizontal,
  Pencil,
  Plus,
  Printer,
  RotateCcw,
  Send,
  Trash2,
  Truck as TruckIcon,
  X,
} from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/Field";
import { Card, CardHeader, Empty, Page, Pill } from "@/components/ui/Bits";
import { Modal } from "@/components/ui/Modal";
import { Popover, MenuItem, MenuSep } from "@/components/ui/Menu";
import { confirmDialog } from "@/components/ui/Confirm";
import { CountUp, DrawnCheck, Progress, stagger } from "@/components/ui/Motion";
import { StatusPill } from "@/components/loads/StatusMenu";
import { InvoiceDoc } from "@/components/invoices/InvoiceDoc";
import { useBillable } from "@/components/invoices/InvoiceBuilder";
import { useStore } from "@/lib/store";
import { signatureOf } from "@/lib/profile";
import { toast } from "@/lib/toast";
import { saveElementPdf } from "@/lib/pdf";
import { METHODS, PAY_META, balance, draftOf, draftToRow, methodLabel, payState, type InvoiceDraft } from "@/lib/invoice";
import { cn, cut, fmtDateTime, fmtDay, lane, money, today } from "@/lib/format";
import type { Invoice, PaymentMethod } from "@/lib/types";

export default function InvoicePage({ params }: PageProps<"/invoices/[id]">) {
  const { id } = use(params);
  const { invoices } = useStore();
  const inv = invoices.find((i) => i.id === id);
  if (!inv) {
    return (
      <Page>
        <Card>
          <Empty title="Invoice not found" body="It may have been deleted." action={<ButtonLink href="/invoices">Back to invoices</ButtonLink>} />
        </Card>
      </Page>
    );
  }
  return <InvoiceView id={id} />;
}

function InvoiceView({ id }: { id: string }) {
  const router = useRouter();
  const { me, memberById, invoices, loads, payments, saveInvoice, setInvoiceStatus, deleteInvoice, deletePayment, driverById, companyById } = useStore();
  const inv = invoices.find((i) => i.id === id)!;
  const [editing, setEditing] = useState(false);
  const [d, setD] = useState<InvoiceDraft>(() => draftOf(inv));
  const [saving, setSaving] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const docRef = useRef<HTMLDivElement>(null);

  // Follow live changes (status, payments, other dispatchers) while not editing.
  useEffect(() => {
    if (!editing) setD(draftOf(inv));
  }, [inv, editing]);

  const st = payState(inv);
  const left = balance(inv);
  const paidPct = inv.total_due > 0 ? (inv.amount_paid / inv.total_due) * 100 : 0;
  const mine = useMemo(() => payments.filter((p) => p.invoice_id === inv.id), [payments, inv.id]);
  const linkedLoads = useMemo(() => inv.lines.map((l) => loads.find((x) => x.id === l.load_id)).filter(Boolean), [inv.lines, loads]);
  const company = companyById(inv.company_id || "");
  const live = inv.status === "sent" || inv.status === "paid";

  const save = async () => {
    setSaving(true);
    const ok = await saveInvoice(inv.id, { invoice: draftToRow(d), lines: d.lines.map((l, i) => ({ ...l, position: i })) });
    setSaving(false);
    if (ok) {
      setEditing(false);
      toast.success("Invoice saved");
    }
  };

  const startEdit = async () => {
    // Changing an invoice the carrier already has makes the two copies differ.
    if (live && !(await confirmDialog({ title: "Edit a sent invoice?", body: "The carrier already has this invoice. Send them the updated PDF after saving.", confirmLabel: "Edit" }))) return;
    setEditing(true);
  };

  const pdf = async () => {
    if (!docRef.current) return false;
    setPdfBusy(true);
    try {
      await saveElementPdf(docRef.current, `${inv.invoice_number}`);
      return true;
    } catch (e) {
      toast.error(`Couldn't create the PDF: ${(e as Error).message}`);
      return false;
    } finally {
      setPdfBusy(false);
    }
  };

  const status = async (to: Invoice["status"], msg: string) => {
    if (await setInvoiceStatus(inv.id, to)) toast.success(msg);
  };

  /** Downloads the PDF and opens an email to the carrier; a draft becomes Sent. */
  const email = async () => {
    const to = company?.contact_email || "";
    const reminder = inv.status !== "draft";
    const subject = reminder ? `Reminder: invoice ${inv.invoice_number} · ${money(left, { currency: inv.currency })} due ${fmtDay(inv.due_date)}` : `Invoice ${inv.invoice_number} from ${inv.issuer_name || "TOSS"}`;
    const body = [
      `Hello${company?.contact_name ? ` ${company.contact_name.split(" ")[0]}` : ""},`,
      "",
      reminder
        ? `This is a reminder that invoice ${inv.invoice_number} has ${money(left, { currency: inv.currency })} open${inv.due_date ? `, due ${fmtDay(inv.due_date, true)}` : ""}.`
        : `Please find attached invoice ${inv.invoice_number} for ${money(inv.total_due, { currency: inv.currency })}${inv.due_date ? `, due ${fmtDay(inv.due_date, true)}` : ""}.`,
      inv.period_start ? `Service period: ${fmtDay(inv.period_start, true)} – ${fmtDay(inv.period_end, true)} · ${inv.lines.length} line${inv.lines.length === 1 ? "" : "s"}.` : "",
      "",
      "Thank you,",
      signatureOf(memberById(me.id), inv.issuer_name || undefined) || inv.issuer_name || "",
    ]
      .filter((x, i, a) => x !== "" || a[i - 1] !== "")
      .join("\n");
    if (!(await pdf())) return;
    window.location.assign(`mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`);
    toast.info("PDF downloaded. Attach it to the email.");
    if (inv.status === "draft") status("sent", "Marked sent");
  };

  return (
    <Page>
      <div className="no-print mb-3">
        <Link href="/invoices" className="group inline-flex items-center gap-1.5 text-[13px] text-fg-3 hover:text-fg">
          <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" /> Invoices
        </Link>
      </div>

      <div className="no-print mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="animate-rise min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-[22px] font-bold text-fg sm:text-[26px]">{inv.invoice_number}</h1>
            {/* key: the pill pops when the status changes */}
            <Pill key={st} className={cn("animate-pop", PAY_META[st].pill)} dot={PAY_META[st].dot}>
              {PAY_META[st].label}
            </Pill>
          </div>
          <div className="mt-0.5 text-[13px] text-fg-3">
            {inv.bill_to_name} · {money(inv.total_due, { currency: inv.currency })}
            {left > 0 && inv.amount_paid > 0 && ` · ${money(left, { currency: inv.currency })} left`}
            {inv.paid_at && ` · paid ${fmtDay(inv.paid_at.slice(0, 10))}`}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {editing ? (
            <>
              {inv.invoice_type === "load" && (
                <Button variant="outline" size="sm" onClick={() => setAddOpen(true)}>
                  <Plus className="h-3.5 w-3.5" /> Add loads
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setD(draftOf(inv));
                  setEditing(false);
                }}
              >
                Cancel
              </Button>
              <Button variant="primary" size="sm" onClick={save} loading={saving}>
                Save invoice
              </Button>
            </>
          ) : (
            <>
              {inv.status === "draft" && (
                <>
                  <Button variant="outline" size="sm" onClick={startEdit}>
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </Button>
                  <Button variant="outline" size="sm" onClick={email} loading={pdfBusy}>
                    {!pdfBusy && <Mail className="h-3.5 w-3.5" />} Email
                  </Button>
                  <Button variant="primary" size="sm" onClick={() => status("sent", "Marked sent")}>
                    <Send className="h-3.5 w-3.5" /> Mark sent
                  </Button>
                </>
              )}
              {left > 0 && inv.status === "sent" && (
                <>
                  <Button variant="outline" size="sm" onClick={email} loading={pdfBusy}>
                    {!pdfBusy && <Mail className="h-3.5 w-3.5" />} Reminder
                  </Button>
                  <Button variant="primary" size="sm" onClick={() => setPayOpen(true)} className={st === "overdue" ? "animate-pulse-ring" : undefined}>
                    <CircleDollarSign className="h-3.5 w-3.5" /> Record payment
                  </Button>
                </>
              )}
              <Button variant="secondary" size="sm" onClick={pdf} loading={pdfBusy && !editing}>
                {!pdfBusy && <Download className="h-3.5 w-3.5" />} PDF
              </Button>
              <Popover
                align="end"
                width={210}
                trigger={({ toggle, ref }) => (
                  <Button ref={ref} variant="outline" size="icon-sm" onClick={toggle} aria-label="More">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                )}
              >
                {(close) => (
                  <>
                    <MenuItem icon={Printer} onClick={() => (close(), setTimeout(() => window.print(), 50))}>
                      Print
                    </MenuItem>
                    {inv.status !== "draft" && inv.status !== "void" && (
                      <MenuItem icon={Pencil} onClick={() => (close(), startEdit())}>
                        Edit invoice
                      </MenuItem>
                    )}
                    {inv.status === "sent" && !inv.amount_paid && (
                      <MenuItem icon={FilePen} onClick={() => (close(), status("draft", "Back to draft"))}>
                        Back to draft
                      </MenuItem>
                    )}
                    {inv.status === "void" && (
                      <MenuItem icon={RotateCcw} onClick={() => (close(), status("draft", "Restored as draft"))}>
                        Restore as draft
                      </MenuItem>
                    )}
                    <MenuSep />
                    {inv.status !== "void" && (
                      <MenuItem
                        icon={Ban}
                        danger
                        onClick={async () => {
                          close();
                          if (
                            await confirmDialog({
                              title: `Void ${inv.invoice_number}?`,
                              body: `It stays on record as void and its loads go back to Delivered so they can be billed again.${inv.amount_paid ? " Recorded payments are kept." : ""}`,
                              confirmLabel: "Void invoice",
                              danger: true,
                            })
                          )
                            status("void", "Invoice voided");
                        }}
                      >
                        Void
                      </MenuItem>
                    )}
                    <MenuItem
                      icon={Trash2}
                      danger
                      onClick={async () => {
                        close();
                        if (
                          await confirmDialog({
                            title: `Delete ${inv.invoice_number}?`,
                            body: "It's removed for good and its loads go back to Delivered. Prefer Void if it was already sent.",
                            confirmLabel: "Delete",
                            danger: true,
                          })
                        )
                          if (await deleteInvoice(inv.id)) {
                            toast.success("Invoice deleted");
                            router.push("/invoices");
                          }
                      }}
                    >
                      Delete
                    </MenuItem>
                  </>
                )}
              </Popover>
            </>
          )}
        </div>
      </div>

      {editing && <div className="no-print animate-rise mb-3 rounded-lg bg-brand/10 px-3 py-2 text-[13px] text-fg-2">Click any text on the invoice to change it. Save when you&apos;re done.</div>}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="animate-rise min-w-0 overflow-x-auto pb-2" style={stagger(1, 60)}>
          <InvoiceDoc ref={docRef} d={d} editing={editing} onChange={setD} statusLabel={PAY_META[st].label} />
        </div>
        <div className="no-print space-y-4">
          {/* Payments */}
          {inv.status !== "draft" && (
            <Card className="animate-rise" style={stagger(2, 60)}>
              <div className="p-4">
                <div className="flex items-baseline justify-between gap-3">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-fg-4">{left > 0 ? "Balance due" : inv.status === "void" ? "Void" : "Paid in full"}</div>
                    <div className={cn("mt-0.5 text-2xl font-bold tracking-tight", left > 0 ? (st === "overdue" ? "text-red-600 dark:text-red-400" : "text-fg") : "text-emerald-700 dark:text-emerald-300")}>
                      <CountUp value={left > 0 ? left : inv.amount_paid} format={(n) => money(n, { currency: inv.currency })} />
                    </div>
                  </div>
                  <div className="text-right text-xs text-fg-3">
                    <div className="tnum">
                      {money(inv.amount_paid, { currency: inv.currency })} of {money(inv.total_due, { currency: inv.currency })}
                    </div>
                    {inv.due_date && left > 0 && <div className={cn(st === "overdue" && "font-medium text-red-600 dark:text-red-400")}>due {fmtDay(inv.due_date)}</div>}
                  </div>
                </div>
                <Progress value={paidPct} className="mt-3" tone={left > 0 ? "bg-teal-500" : "bg-emerald-500"} />
                {left > 0 && inv.status === "sent" && (
                  <Button variant="outline" size="sm" className="mt-3 w-full" onClick={() => setPayOpen(true)}>
                    <Plus className="h-3.5 w-3.5" /> Record payment
                  </Button>
                )}
              </div>
              {mine.length > 0 && (
                <ul className="divide-y divide-line border-t border-line">
                  {mine.map((p, i) => (
                    <li key={p.id} className="animate-rise group flex items-center gap-3 px-4 py-2.5" style={stagger(i, 40)}>
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
                        <CircleDollarSign className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="tnum text-[13px] font-semibold text-fg">{money(p.amount, { currency: inv.currency })}</div>
                        <div className="truncate text-xs text-fg-3">
                          {fmtDay(p.paid_on)} · {methodLabel(p.method)}
                          {p.reference ? ` · ${p.reference}` : ""}
                          {p.notes ? ` · ${p.notes}` : ""}
                        </div>
                      </div>
                      <button
                        className="rounded-md p-1 text-fg-4 opacity-0 transition-opacity hover:bg-red-500/10 hover:text-red-500 focus:opacity-100 group-hover:opacity-100"
                        aria-label="Remove payment"
                        onClick={async () => {
                          if (await confirmDialog({ title: "Remove this payment?", body: `${money(p.amount)} on ${fmtDay(p.paid_on)} comes off the invoice.`, confirmLabel: "Remove", danger: true }))
                            if (await deletePayment(p.id)) toast.success("Payment removed");
                        }}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}

          {linkedLoads.length > 0 && (
            <Card className="animate-rise" style={stagger(3, 60)}>
              <CardHeader title="Loads on this invoice" />
              <ul className="divide-y divide-line">
                {linkedLoads.map((l) =>
                  l ? (
                    <li key={l.id}>
                      <Link href={`/loads/${l.id}`} className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-surface-2/60">
                        <TruckIcon className="h-4 w-4 shrink-0 text-fg-4" />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[13px] font-medium text-fg">{lane(l)}</div>
                          <div className="truncate text-xs text-fg-3">
                            {l.load_number ? `#${l.load_number} · ` : ""}
                            {driverById(l.driver_id)?.name || ""}
                          </div>
                        </div>
                        <StatusPill status={l.status} />
                      </Link>
                    </li>
                  ) : null,
                )}
              </ul>
            </Card>
          )}

          <Timeline inv={inv} />
        </div>
      </div>

      {addOpen && <AddLoadsModal companyId={inv.company_id} existing={d.lines.map((l) => l.load_id).filter(Boolean) as string[]} onClose={() => setAddOpen(false)} onAdd={(lines) => setD((x) => ({ ...x, lines: [...x.lines, ...lines] }))} />}
      {payOpen && <PaymentModal inv={inv} onClose={() => setPayOpen(false)} />}
    </Page>
  );
}

/** Created → sent → payments → paid / void, newest last. */
function Timeline({ inv }: { inv: Invoice }) {
  const { payments } = useStore();
  const events = [
    { at: inv.created_at, text: "Created", tone: "bg-fg-4" },
    ...(inv.sent_at ? [{ at: inv.sent_at, text: "Sent", tone: "bg-blue-500" }] : []),
    ...payments
      .filter((p) => p.invoice_id === inv.id)
      .map((p) => ({ at: `${p.paid_on}T12:00:00`, text: `${money(p.amount, { currency: inv.currency })} received · ${methodLabel(p.method)}`, tone: "bg-teal-500" })),
    ...(inv.paid_at ? [{ at: inv.paid_at, text: "Paid in full", tone: "bg-emerald-500" }] : []),
    ...(inv.status === "void" ? [{ at: inv.updated_at, text: "Voided", tone: "bg-red-500" }] : []),
  ].sort((a, b) => a.at.localeCompare(b.at));
  return (
    <Card className="animate-rise p-4" style={stagger(4, 60)}>
      <div className="mb-2.5 text-[11px] font-semibold uppercase tracking-wider text-fg-4">History</div>
      <ol className="relative space-y-3 before:absolute before:bottom-1 before:left-[3.5px] before:top-1 before:w-px before:bg-line">
        {events.map((e, i) => (
          <li key={i} className="animate-rise relative flex gap-3 pl-0" style={stagger(i, 60)}>
            <span className={cn("relative z-10 mt-1.5 h-2 w-2 shrink-0 rounded-full ring-2 ring-surface", e.tone)} />
            <div className="min-w-0 text-[13px]">
              <div className="text-fg">{e.text}</div>
              <div className="text-xs text-fg-4">{e.at.length > 10 && !e.at.endsWith("T12:00:00") ? fmtDateTime(e.at) : fmtDay(e.at.slice(0, 10))}</div>
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}

/** Record money received: full balance by default, part payments allowed. */
function PaymentModal({ inv, onClose }: { inv: Invoice; onClose: () => void }) {
  const { recordPayment } = useStore();
  const left = balance(inv);
  const [amount, setAmount] = useState(left.toFixed(2));
  const [date, setDate] = useState(today());
  const [method, setMethod] = useState<PaymentMethod>("ach");
  const [ref, setRef] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const n = Math.round((Number(amount) || 0) * 100) / 100;
  const after = Math.max(0, Math.round((left - n) * 100) / 100);
  const over = n > left + 0.004;

  const submit = async () => {
    if (n <= 0) return toast.error("Enter the amount received.");
    setSaving(true);
    const ok = await recordPayment(inv.id, { amount: n, paid_on: date, method, reference: ref.trim() || null, notes: notes.trim() || null });
    setSaving(false);
    if (!ok) return;
    if (after === 0) {
      setDone(true);
      setTimeout(onClose, 1400);
    } else {
      toast.success(`${money(n)} recorded · ${money(after)} still open`);
      onClose();
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={done ? "Paid in full" : "Record payment"}
      subtitle={done ? undefined : `${inv.invoice_number} · ${money(left, { currency: inv.currency })} open`}
      footer={
        done ? undefined : (
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" onClick={submit} loading={saving} disabled={n <= 0}>
              Record {n > 0 ? money(n, { currency: inv.currency }) : ""}
            </Button>
          </>
        )
      }
    >
      {done ? (
        <div className="flex flex-col items-center gap-2 py-6 text-emerald-600 dark:text-emerald-400">
          <DrawnCheck className="h-16 w-16" />
          <div className="animate-rise text-sm font-medium text-fg-2" style={stagger(10)}>
            {inv.invoice_number} is paid. Its loads are marked Paid.
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <Field
            label="Amount received"
            hint={
              over ? (
                <span className="text-amber-700 dark:text-amber-300">More than the {money(left)} open</span>
              ) : after === 0 ? (
                <span className="text-emerald-700 dark:text-emerald-300">Pays the invoice in full</span>
              ) : (
                `${money(after)} will still be open`
              )
            }
          >
            <div className="flex gap-2">
              <Input value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal" prefix="$" className="flex-1 text-base font-semibold" autoFocus />
              {n !== left && (
                <Button variant="outline" className="h-10" onClick={() => setAmount(left.toFixed(2))}>
                  Full
                </Button>
              )}
            </div>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date received">
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} max={today()} />
            </Field>
            <Field label="Method">
              <Select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
                {METHODS.map((m) => (
                  <option key={m.v} value={m.v}>
                    {m.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Reference" hint="Check #, ACH / wire trace, Zelle confirmation">
            <Input value={ref} onChange={(e) => setRef(e.target.value)} />
          </Field>
          <Field label="Note">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </Field>
        </div>
      )}
    </Modal>
  );
}

function AddLoadsModal({
  companyId,
  existing,
  onClose,
  onAdd,
}: {
  companyId: string | null;
  existing: string[];
  onClose: () => void;
  onAdd: (lines: InvoiceDraft["lines"]) => void;
}) {
  const billable = useBillable();
  const { driverById, truckById } = useStore();
  const options = billable.filter((l) => l.company_id === companyId && !existing.includes(l.id));
  const [picked, setPicked] = useState<Set<string>>(new Set());
  return (
    <Modal
      open
      onClose={onClose}
      title="Add loads"
      subtitle="Delivered loads of this carrier that aren't billed yet"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!picked.size}
            onClick={() => {
              onAdd(
                options
                  .filter((l) => picked.has(l.id))
                  .map((l, i) => {
                    const fee = cut(l.gross_amount, l.commission_percent);
                    return {
                      id: crypto.randomUUID(),
                      load_id: l.id,
                      kind: "item" as const,
                      truck_number: truckById(l.truck_id)?.unit_number || null,
                      loaded_miles: l.loaded_miles || null,
                      position: 999 + i,
                      description: `${l.origin_city}, ${l.origin_state} — ${l.destination_city}, ${l.destination_state}${l.load_number ? ` · Load #${l.load_number}` : ""}`,
                      line_date: l.delivery_date || l.pickup_date,
                      quantity: 1,
                      unit_price: fee,
                      gross_amount: l.gross_amount,
                      amount: fee,
                      load_number: l.load_number,
                      rate_con_number: l.rate_con_number,
                      broker_name: l.broker_name,
                      driver_name: driverById(l.driver_id)?.name || null,
                      origin: `${l.origin_city}, ${l.origin_state}`,
                      destination: `${l.destination_city}, ${l.destination_state}`,
                      pickup_date: l.pickup_date,
                      delivery_date: l.delivery_date,
                    };
                  }),
              );
              onClose();
            }}
          >
            Add {picked.size || ""}
          </Button>
        </>
      }
    >
      {options.length === 0 ? (
        <Empty title="No delivered loads to add" className="py-8" />
      ) : (
        <ul className="divide-y divide-line rounded-xl border border-line">
          {options.map((l, i) => (
            <li key={l.id} className="animate-rise flex items-center gap-3 px-3 py-2.5" style={stagger(i)}>
              <Checkbox
                checked={picked.has(l.id)}
                onChange={(v) =>
                  setPicked((s) => {
                    const n = new Set(s);
                    if (v) n.add(l.id);
                    else n.delete(l.id);
                    return n;
                  })
                }
              />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-medium text-fg">{lane(l)}</div>
                <div className="text-xs text-fg-3">
                  {fmtDay(l.delivery_date)} · {money(l.gross_amount, { cents: false })}
                </div>
              </div>
              <span className="tnum text-[13px] font-semibold text-fg">{money(cut(l.gross_amount, l.commission_percent))}</span>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
