"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { BellOff, BellRing, CalendarClock, CheckCircle2, FileWarning, Search } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, Empty, Page, PageHeader, Pill, Stat, Tabs, neutralPill } from "@/components/ui/Bits";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { errMsg, sb } from "@/lib/db";
import { useStore } from "@/lib/store";
import { useLiveTable } from "@/lib/live";
import { toast } from "@/lib/toast";
import { cn, fmtDay, num } from "@/lib/format";
import { muteActive, ownDocItems, pendingItems, useMutes, type Mute, type PendingItem, type PendingKind } from "@/lib/pending";

// Pending: documents that expired or expire within 30 days, and required paperwork still missing,
// for every carrier (or the one picked at the top). A reminder can be turned off with a reason.

type View = "expired" | "soon" | "missing" | "off";

const KINDS: { v: PendingKind | "all"; label: string }[] = [
  { v: "all", label: "Everything" },
  { v: "carrier", label: "Carrier documents" },
  { v: "driver", label: "Drivers" },
  { v: "truck", label: "Trucks" },
  { v: "trailer", label: "Trailers" },
  { v: "load", label: "Loads" },
  { v: "toss", label: "TOSS documents" },
];
const KIND_LABEL: Record<PendingKind, string> = { carrier: "Carrier", driver: "Driver", truck: "Truck", trailer: "Trailer", load: "Load", toss: "TOSS" };

function stateLine(i: PendingItem) {
  if (i.state === "missing") return "Missing";
  if (i.state === "no_date") return "No expiry date on file";
  if (i.days == null) return "";
  if (i.days < 0) return `Expired ${-i.days}d ago${i.date ? ` · ${fmtDay(i.date)}` : ""}`;
  if (i.days === 0) return "Expires today";
  return `Expires in ${i.days}d${i.date ? ` · ${fmtDay(i.date)}` : ""}`;
}

export default function PendingPage() {
  const { companies, drivers, trucks, trailers, documents, docTypes, loads, inScope, scopedCompany, companyById, setScope } = useStore();
  const { mutes, setMutes } = useMutes();
  const [view, setView] = useState<View>("expired");
  const [kind, setKind] = useState<PendingKind | "all">("all");
  const [q, setQ] = useState("");
  const [muting, setMuting] = useState<PendingItem | null>(null);

  // TOSS's own documents (Documents section) belong to no carrier: shown with "All companies".
  const own = useLiveTable<{ id: string; name: string; folder: string; expires_on: string | null }>("tms_own_documents").rows;
  const all = useMemo(
    () => [...pendingItems({ companies, drivers, trucks, trailers, documents, docTypes, loads }, inScope), ...(scopedCompany ? [] : ownDocItems(own))],
    [companies, drivers, trucks, trailers, documents, docTypes, loads, inScope, scopedCompany, own],
  );
  const muted = useMemo(() => new Map(mutes.filter(muteActive).map((m) => [m.key, m])), [mutes]);
  const live = all.filter((i) => !muted.has(i.key));
  const bucket = (v: Exclude<View, "off">) => live.filter((i) => (v === "soon" ? i.state === "soon" || i.state === "no_date" : i.state === v));
  const counts = { expired: bucket("expired").length, soon: bucket("soon").length, missing: bucket("missing").length };
  const offList = mutes.filter((m) => muteActive(m) && (!m.company_id || inScope(m.company_id)));

  const match = (text: string) => !q || text.toLowerCase().includes(q.toLowerCase());
  const rows =
    view === "off"
      ? []
      : bucket(view)
          .filter((i) => (kind === "all" || i.kind === kind) && match(`${i.holder} ${i.what} ${companyById(i.companyId)?.name || ""}`))
          .sort((a, b) => (a.days ?? 9999) - (b.days ?? 9999) || a.holder.localeCompare(b.holder));

  const turnOn = async (m: Mute) => {
    const { error } = await sb().from("tms_reminder_mutes").delete().eq("id", m.id);
    if (error) return toast.error(errMsg(error));
    setMutes((l) => l.filter((x) => x.id !== m.id));
    toast.success("Reminder turned back on");
  };

  return (
    <Page>
      <PageHeader eyebrow={scopedCompany ? scopedCompany.name : "All companies"} title="Pending" />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Expired" value={<span className={counts.expired ? "text-red-600 dark:text-red-400" : ""}>{num(counts.expired)}</span>} sub="Documents past their date" />
        <Stat label="Expiring ≤ 30 days" value={<span className={counts.soon ? "text-amber-600 dark:text-amber-400" : ""}>{num(counts.soon)}</span>} sub="Or expiring type without a date" />
        <Stat label="Missing" value={num(counts.missing)} sub="Required paperwork not on file" />
        <Stat label="Turned off" value={num(offList.length)} sub="Reminders turned off with a reason" />
      </div>

      <Tabs<View>
        value={view}
        onChange={setView}
        className="mb-4"
        tabs={[
          { value: "expired", label: <><FileWarning className="h-4 w-4" /> Expired</>, count: counts.expired },
          { value: "soon", label: <><CalendarClock className="h-4 w-4" /> Expiring soon</>, count: counts.soon },
          { value: "missing", label: <><FileWarning className="h-4 w-4" /> Missing</>, count: counts.missing },
          { value: "off", label: <><BellOff className="h-4 w-4" /> Turned off</>, count: offList.length },
        ]}
      />

      <div className="mb-3 flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-4" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Carrier, driver, unit, document" className="pl-9" />
        </div>
        {view !== "off" && (
          <Select value={kind} onChange={(e) => setKind(e.target.value as PendingKind | "all")} className="sm:w-52">
            {KINDS.map((k) => (
              <option key={k.v} value={k.v}>
                {k.label}
              </option>
            ))}
          </Select>
        )}
      </div>

      {view === "off" ? (
        <Card>
          {offList.filter((m) => match(`${m.label} ${m.reason}`)).length === 0 ? (
            <Empty icon={BellOff} title="No reminders turned off" body="Turn off a reminder from the other tabs when it doesn't need attention; you'll be asked why." />
          ) : (
            <ul className="divide-y divide-line">
              {offList
                .filter((m) => match(`${m.label} ${m.reason}`))
                .map((m) => (
                  <li key={m.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:px-5">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-medium text-fg">{m.label}</div>
                      <div className="text-xs text-fg-2">Reason: {m.reason}</div>
                      <div className="text-[11px] text-fg-4">
                        {m.created_by_name || "Someone"} · {fmtDay(m.created_at.slice(0, 10))}
                        {m.until ? ` · off until ${fmtDay(m.until)}` : " · off for good"}
                      </div>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => turnOn(m)}>
                      <BellRing className="h-3.5 w-3.5" /> Turn back on
                    </Button>
                  </li>
                ))}
            </ul>
          )}
        </Card>
      ) : rows.length === 0 ? (
        <Card>
          <Empty icon={CheckCircle2} title="Nothing here" body={q || kind !== "all" ? "No reminders match these filters." : view === "missing" ? "All required paperwork is on file." : "No documents in this list right now."} />
        </Card>
      ) : (
        <Card>
          <ul className="divide-y divide-line">
            {rows.map((i) => (
              <li key={i.key} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:px-5">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-[13px] font-semibold text-fg">{i.what}</span>
                    <Pill className={neutralPill}>{KIND_LABEL[i.kind]}</Pill>
                  </div>
                  <div className="truncate text-xs text-fg-2">
                    {i.holder}
                    {i.kind !== "carrier" && i.kind !== "toss" && <span className="text-fg-4"> · {companyById(i.companyId)?.name}</span>}
                  </div>
                  <div className={cn("text-xs", i.state === "expired" || (i.days != null && i.days < 0) ? "text-red-600 dark:text-red-400" : i.state === "soon" ? "text-amber-600 dark:text-amber-400" : "text-fg-3")}>
                    {stateLine(i)}
                  </div>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <Link
                    href={i.href}
                    onClick={() => i.companyId && setScope(i.companyId)}
                    className="inline-flex h-8 items-center rounded-lg border border-line px-3 text-xs font-medium text-fg hover:bg-surface-2"
                  >
                    Open
                  </Link>
                  <Button size="sm" variant="ghost" onClick={() => setMuting(i)} title="Turn off this reminder">
                    <BellOff className="h-3.5 w-3.5" /> Turn off
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <MuteModal item={muting} company={muting ? companyById(muting.companyId)?.name : undefined} onClose={() => setMuting(null)} onSaved={(m) => setMutes((l) => [m, ...l.filter((x) => x.key !== m.key)])} />
    </Page>
  );
}

const REASONS = ["Not needed for this carrier", "Already renewed, document coming", "Handled outside TOSS Cloud", "Carrier is leaving / inactive"];

/** Turn off one reminder: a reason is required; optionally only until a date. */
function MuteModal({ item, company, onClose, onSaved }: { item: PendingItem | null; company?: string; onClose: () => void; onSaved: (m: Mute) => void }) {
  const { me, memberById } = useStore();
  const [reason, setReason] = useState("");
  const [until, setUntil] = useState("");
  const [saving, setSaving] = useState(false);
  const close = () => {
    setReason("");
    setUntil("");
    onClose();
  };
  const save = async () => {
    if (!item || !reason.trim()) return;
    setSaving(true);
    const label = `${item.what} · ${item.holder}${item.kind !== "carrier" && item.kind !== "toss" && company ? ` · ${company}` : ""}`;
    const row = { key: item.key, company_id: item.companyId || null, label, reason: reason.trim(), until: until || null, created_by_name: memberById(me.id)?.full_name || me.fullName || me.email };
    const { data, error } = await sb().from("tms_reminder_mutes").upsert(row, { onConflict: "key" }).select().single();
    setSaving(false);
    if (error) return toast.error(errMsg(error));
    onSaved(data as Mute);
    toast.success("Reminder turned off");
    close();
  };
  return (
    <Modal
      open={!!item}
      onClose={close}
      title="Turn off reminder"
      subtitle={item ? `${item.what} · ${item.holder}` : undefined}
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} disabled={!reason.trim() || saving}>
            Turn off
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Reason" required>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="Why this doesn't need a reminder" autoFocus />
        </Field>
        <div className="flex flex-wrap gap-1.5">
          {REASONS.map((r) => (
            <button key={r} type="button" onClick={() => setReason(r)} className="rounded-full border border-line px-2.5 py-1 text-xs text-fg-2 hover:bg-surface-2">
              {r}
            </button>
          ))}
        </div>
        <Field label="Turn back on after (optional)" hint="Leave empty to turn it off for good. It comes back by itself when a new document is uploaded.">
          <Input type="date" value={until} onChange={(e) => setUntil(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
