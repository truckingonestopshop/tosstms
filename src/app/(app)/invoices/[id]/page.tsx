"use client";

import Link from "next/link";
import { use, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Download, MoreHorizontal, Pencil, Plus, Printer, Trash2, Truck as TruckIcon } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Field";
import { Card, CardHeader, Empty, Page, Pill } from "@/components/ui/Bits";
import { Modal } from "@/components/ui/Modal";
import { Popover, MenuItem, MenuSep } from "@/components/ui/Menu";
import { confirmDialog } from "@/components/ui/Confirm";
import { StatusPill } from "@/components/loads/StatusMenu";
import { InvoiceDoc } from "@/components/invoices/InvoiceDoc";
import { useBillable } from "@/components/invoices/InvoiceBuilder";
import { useStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import { saveElementPdf } from "@/lib/pdf";
import { PAY_META, draftOf, draftToRow, payState, type InvoiceDraft } from "@/lib/invoice";
import { cn, cut, fmtDateTime, fmtDay, lane, money } from "@/lib/format";
import type { InvoiceStatus } from "@/lib/types";

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

const STATUSES: { v: InvoiceStatus; label: string }[] = [
  { v: "draft", label: "Draft" },
  { v: "sent", label: "Sent" },
  { v: "paid", label: "Paid" },
  { v: "void", label: "Void" },
];

function InvoiceView({ id }: { id: string }) {
  const router = useRouter();
  const { invoices, loads, saveInvoice, setInvoiceStatus, deleteInvoice, driverById } = useStore();
  const inv = invoices.find((i) => i.id === id)!;
  const [editing, setEditing] = useState(false);
  const [d, setD] = useState<InvoiceDraft>(() => draftOf(inv));
  const [saving, setSaving] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const docRef = useRef<HTMLDivElement>(null);

  // Follow live changes (status, other dispatchers) while not editing.
  useEffect(() => {
    if (!editing) setD(draftOf(inv));
  }, [inv, editing]);

  const st = payState(inv);
  const linkedLoads = useMemo(() => inv.lines.map((l) => loads.find((x) => x.id === l.load_id)).filter(Boolean), [inv.lines, loads]);

  const save = async () => {
    setSaving(true);
    const ok = await saveInvoice(inv.id, {
      invoice: draftToRow(d),
      lines: d.lines.map((l, i) => ({ ...l, position: i })),
    });
    setSaving(false);
    if (ok) {
      setEditing(false);
      toast.success("Invoice saved");
    }
  };

  const pdf = async () => {
    if (!docRef.current) return;
    setPdfBusy(true);
    try {
      await saveElementPdf(docRef.current, `${inv.invoice_number}`);
    } catch (e) {
      toast.error(`Couldn't create the PDF: ${(e as Error).message}`);
    } finally {
      setPdfBusy(false);
    }
  };

  return (
    <Page>
      <div className="no-print mb-3">
        <Link href="/invoices" className="inline-flex items-center gap-1.5 text-[13px] text-fg-3 hover:text-fg">
          <ArrowLeft className="h-3.5 w-3.5" /> Invoices
        </Link>
      </div>

      <div className="no-print mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-[22px] font-bold text-fg sm:text-[26px]">{inv.invoice_number}</h1>
            <Pill className={PAY_META[st].pill} dot={PAY_META[st].dot}>
              {PAY_META[st].label}
            </Pill>
          </div>
          <div className="mt-0.5 text-[13px] text-fg-3">
            {inv.bill_to_name} · {money(inv.total_due, { currency: inv.currency })}
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
              <div className="inline-flex rounded-lg border border-line bg-surface-2 p-0.5">
                {STATUSES.map((s) => (
                  <button
                    key={s.v}
                    onClick={async () => {
                      if (s.v === inv.status) return;
                      if (s.v === "void" && !(await confirmDialog({ title: "Void this invoice?", body: "Its loads go back to Delivered so they can be billed again.", confirmLabel: "Void", danger: true })))
                        return;
                      if (await setInvoiceStatus(inv.id, s.v)) toast.success(`Marked ${s.label.toLowerCase()}`);
                    }}
                    className={cn(
                      "rounded-md px-2.5 py-1 text-[13px] font-medium",
                      inv.status === s.v ? "bg-surface text-fg shadow-sm ring-1 ring-line" : "text-fg-3 hover:text-fg",
                    )}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                <Pencil className="h-3.5 w-3.5" /> Edit
              </Button>
              <Button variant="secondary" size="sm" onClick={pdf} loading={pdfBusy}>
                {!pdfBusy && <Download className="h-3.5 w-3.5" />} PDF
              </Button>
              <Popover
                align="end"
                width={180}
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
                    <MenuSep />
                    <MenuItem
                      icon={Trash2}
                      danger
                      onClick={async () => {
                        close();
                        if (
                          await confirmDialog({
                            title: `Delete ${inv.invoice_number}?`,
                            body: "Its loads go back to Delivered. Prefer Void if the invoice was already sent.",
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

      {editing && <div className="no-print mb-3 rounded-lg bg-brand/10 px-3 py-2 text-[13px] text-fg-2">Click any text on the invoice to change it. Save when you&apos;re done.</div>}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 overflow-x-auto pb-2">
          <InvoiceDoc ref={docRef} d={d} editing={editing} onChange={setD} statusLabel={PAY_META[st].label} />
        </div>
        <div className="no-print space-y-4">
          {linkedLoads.length > 0 && (
            <Card>
              <CardHeader title="Loads on this invoice" />
              <ul className="divide-y divide-line">
                {linkedLoads.map((l) =>
                  l ? (
                    <li key={l.id}>
                      <Link href={`/loads/${l.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-2/60">
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
          <Card className="p-4 text-[13px]">
            <div className="space-y-1.5 text-fg-3">
              <div>Created {fmtDateTime(inv.created_at)}</div>
              {inv.sent_at && <div>Sent {fmtDateTime(inv.sent_at)}</div>}
              {inv.paid_at && <div className="text-emerald-700 dark:text-emerald-300">Paid {fmtDateTime(inv.paid_at)}</div>}
            </div>
          </Card>
        </div>
      </div>

      {addOpen && <AddLoadsModal companyId={inv.company_id} existing={d.lines.map((l) => l.load_id).filter(Boolean) as string[]} onClose={() => setAddOpen(false)} onAdd={(lines) => setD((x) => ({ ...x, lines: [...x.lines, ...lines] }))} />}
    </Page>
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
  const { driverById } = useStore();
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
                      position: 999 + i,
                      description: `${lane(l)}${l.load_number ? ` · Load #${l.load_number}` : ""}`,
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
          {options.map((l) => (
            <li key={l.id} className="flex items-center gap-3 px-3 py-2.5">
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
