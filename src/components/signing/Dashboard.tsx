"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Ban, Bell, BookOpen, CheckCircle2, ChevronDown, Clock, Copy, Download, Eye, FileSignature, FileUp, MoreHorizontal, PenSquare, Plus, Search, Send, ShieldCheck, Timer, XCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, Empty, Pill } from "@/components/ui/Bits";
import { Checkbox, Field, Input, Select } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { MenuItem, MenuSep, Popover } from "@/components/ui/Menu";
import { confirmDialog } from "@/components/ui/Confirm";
import { errMsg, openDocument, sb } from "@/lib/db";
import { useLiveTable } from "@/lib/live";
import { useStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import { cn, num, relTime } from "@/lib/format";
import { REQUEST_STATUS, signersOf, type RequestStatus, type SignRecipient, type SignRequest } from "@/lib/signing";
import { RequestModal } from "./Requests";
import { SendDialog } from "./SendDialog";

type Tab = "all" | RequestStatus;
const TABS: { v: Tab; label: string }[] = [
  { v: "all", label: "All" },
  { v: "sent", label: "Waiting" },
  { v: "completed", label: "Completed" },
  { v: "declined", label: "Declined" },
  { v: "expired", label: "Expired" },
  { v: "void", label: "Cancelled" },
];
type Period = "30" | "month" | "90" | "all";
const DOT: Record<string, string> = { signed: "bg-emerald-500", declined: "bg-red-500", viewed: "bg-sky-500", sent: "bg-amber-400", waiting: "bg-zinc-400" };
const initials = (n: string) =>
  n
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");

/**
 * TossSign home: numbers at a glance, every document by status, filters, progress per document,
 * row actions and bulk remind / cancel, and "+ New" (send, write, upload, from the library).
 */
export function SigningDashboard() {
  const router = useRouter();
  const { companies, companyById, inScope } = useStore();
  const requests = useLiveTable<SignRequest>("tms_sign_requests");
  const recipients = useLiveTable<SignRecipient>("tms_sign_recipients", { order: "position", ascending: true });
  const [tab, setTab] = useState<Tab>("all");
  const [company, setCompany] = useState("");
  const [period, setPeriod] = useState<Period>("all");
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const [sendFor, setSendFor] = useState<string | null>(null);
  const [choosing, setChoosing] = useState(false);

  const recsOf = useMemo(() => {
    const m = new Map<string, SignRecipient[]>();
    for (const r of recipients.rows) m.set(r.request_id, [...(m.get(r.request_id) || []), r]);
    return m;
  }, [recipients.rows]);
  const scoped = requests.rows.filter((r) => !r.company_id || inScope(r.company_id));
  const inPeriod = (r: SignRequest) => {
    if (period === "all") return true;
    const d = new Date(r.sent_at || r.created_at);
    const now = new Date();
    if (period === "month") return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    return now.getTime() - d.getTime() <= Number(period) * 86_400_000;
  };
  const base = scoped.filter((r) => (!company || r.company_id === company) && inPeriod(r) && (!q || `${r.title} SIGN-${r.number} ${companyById(r.company_id)?.name || ""} ${(recsOf.get(r.id) || []).map((x) => `${x.name} ${x.email || ""}`).join(" ")}`.toLowerCase().includes(q.toLowerCase())));
  const list = base.filter((r) => tab === "all" || r.status === tab).sort((a, b) => (b.sent_at || b.created_at).localeCompare(a.sent_at || a.created_at));
  const count = (t: Tab) => base.filter((r) => t === "all" || r.status === t).length;

  // Numbers at a glance (everything in view, whatever the tab).
  const month = new Date().toISOString().slice(0, 7);
  const done = scoped.filter((r) => r.status === "completed" && r.completed_at && r.sent_at);
  const avgHours = done.length ? done.reduce((s, r) => s + (new Date(r.completed_at!).getTime() - new Date(r.sent_at!).getTime()), 0) / done.length / 3_600_000 : null;
  const kpis = [
    { label: "Waiting for others", value: num(scoped.filter((r) => r.status === "sent").length), icon: Clock, tone: "text-amber-600 dark:text-amber-400", onClick: () => setTab("sent") },
    { label: "Completed this month", value: num(scoped.filter((r) => (r.completed_at || "").startsWith(month)).length), icon: CheckCircle2, tone: "text-emerald-600 dark:text-emerald-400", onClick: () => setTab("completed") },
    { label: "Average time to sign", value: avgHours == null ? "—" : avgHours < 1 ? `${Math.max(1, Math.round(avgHours * 60))} min` : avgHours < 48 ? `${avgHours.toFixed(1)} h` : `${(avgHours / 24).toFixed(1)} days`, icon: Timer, tone: "text-sky-600 dark:text-sky-400" },
    { label: "Declined or expired", value: num(scoped.filter((r) => r.status === "declined" || r.status === "expired").length), icon: XCircle, tone: "text-red-600 dark:text-red-400", onClick: () => setTab("declined") },
  ];

  const remind = async (ids: string[]) => {
    let ok = 0;
    for (const id of ids) {
      const res = await fetch("/api/sign/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestId: id, reminder: true }) });
      if (res.ok) ok++;
    }
    toast.success(`${ok} reminder${ok === 1 ? "" : "s"} sent`);
  };
  const cancel = async (ids: string[]) => {
    if (!(await confirmDialog({ title: `Cancel ${ids.length} document${ids.length === 1 ? "" : "s"}?`, body: "Their links stop working. You can send them again later.", confirmLabel: "Cancel signing", danger: true }))) return;
    const { data, error } = await sb().from("tms_sign_requests").update({ status: "void" }).in("id", ids).select();
    if (error) return toast.error(errMsg(error));
    for (const r of (data || []) as SignRequest[]) requests.put(r);
    await sb().from("tms_sign_events").insert(ids.map((id) => ({ request_id: id, action: "cancelled" })));
    setPicked(new Set());
  };
  const copyLink = async (r: SignRequest) => {
    const next = signersOf(recsOf.get(r.id) || []).find((x) => x.status !== "signed");
    if (!next) return toast.error("Nobody left to sign");
    await navigator.clipboard.writeText(`${window.location.origin}/sign/${next.token}`);
    toast.success(`${next.name}'s link copied`);
  };
  const download = (r: SignRequest) => openDocument(r.signed_path || r.file_path, r.signed_path ? `${r.title} (signed).pdf` : r.file_name).catch((e) => toast.error(errMsg(e)));
  const selected = list.filter((r) => picked.has(r.id));
  const opened = requests.rows.find((r) => r.id === openId) || null;

  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map((k) => (
          <button key={k.label} onClick={k.onClick} disabled={!k.onClick} className="group rounded-2xl border border-line bg-surface p-4 text-left transition-colors enabled:hover:border-line-strong">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-3">{k.label}</span>
              <k.icon className={cn("h-4 w-4", k.tone)} />
            </div>
            <div className="tnum mt-2 text-2xl font-bold tracking-[-0.03em] text-fg">{k.value}</div>
          </button>
        ))}
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-line px-4 py-3 sm:px-5 lg:flex-row lg:items-center">
          <div className="scrollbar-bold -mx-1 flex gap-1 overflow-x-auto pb-1">
            {TABS.map((t) => (
              <button key={t.v} onClick={() => (setTab(t.v), setPicked(new Set()))} className={cn("flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium", tab === t.v ? "bg-inverse text-inverse-fg" : "text-fg-3 hover:bg-surface-2 hover:text-fg")}>
                {t.label}
                <span className={cn("tnum rounded-full px-1.5 text-[11px]", tab === t.v ? "bg-white/20" : "bg-surface-2 text-fg-4")}>{count(t.v)}</span>
              </button>
            ))}
          </div>
          <div className="flex flex-1 flex-wrap items-center gap-2 lg:justify-end">
            <div className="relative min-w-[180px] flex-1 lg:max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-4" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Document, signer, company" className="h-9 pl-9" />
            </div>
            <Select value={company} onChange={(e) => setCompany(e.target.value)} className="h-9 w-auto" aria-label="Company">
              <option value="">All companies</option>
              {[...companies]
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </Select>
            <Select value={period} onChange={(e) => setPeriod(e.target.value as Period)} className="h-9 w-auto" aria-label="Sent">
              <option value="all">Any time</option>
              <option value="month">This month</option>
              <option value="30">Last 30 days</option>
              <option value="90">Last 90 days</option>
            </Select>
            <NewMenu onSend={() => setChoosing(true)} onTemplates={(p) => router.push(`/signing?tab=templates&${p}`)} />
          </div>
        </div>

        {selected.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-b border-line bg-brand/5 px-4 py-2 text-[13px] sm:px-5">
            <span className="font-medium text-fg">{selected.length} selected</span>
            <Button size="xs" variant="outline" onClick={() => remind(selected.filter((r) => r.status === "sent").map((r) => r.id))} disabled={!selected.some((r) => r.status === "sent")}>
              <Bell className="h-3.5 w-3.5" /> Remind
            </Button>
            <Button size="xs" variant="outline" onClick={() => selected.filter((r) => r.signed_path).forEach(download)} disabled={!selected.some((r) => r.signed_path)}>
              <Download className="h-3.5 w-3.5" /> Download signed
            </Button>
            <Button size="xs" variant="danger-ghost" onClick={() => cancel(selected.filter((r) => r.status === "sent").map((r) => r.id))} disabled={!selected.some((r) => r.status === "sent")}>
              <Ban className="h-3.5 w-3.5" /> Cancel
            </Button>
            <button onClick={() => setPicked(new Set())} className="ml-auto text-xs text-fg-3 hover:text-fg">
              Clear
            </button>
          </div>
        )}

        {!requests.loaded ? (
          <div className="px-4 py-10 text-center text-xs text-fg-4">Loading…</div>
        ) : list.length === 0 ? (
          <Empty icon={FileSignature} title={scoped.length ? "Nothing here" : "Nothing sent yet"} body={scoped.length ? undefined : "Send a document from + New, from a company's Documents tab, a DER or a driver, or share a public link."} />
        ) : (
          <div className="scrollbar-bold overflow-x-auto">
            <table className="w-full min-w-[820px] text-[13px]">
              <thead className="text-left text-[11px] uppercase tracking-wider text-fg-4">
                <tr className="border-b border-line">
                  <th className="w-10 px-4 py-2">
                    <Checkbox checked={list.length > 0 && list.every((r) => picked.has(r.id))} indeterminate={picked.size > 0} onChange={(v) => setPicked(v ? new Set(list.map((r) => r.id)) : new Set())} />
                  </th>
                  <th className="py-2 pr-3 font-semibold">Document</th>
                  <th className="py-2 pr-3 font-semibold">Recipients</th>
                  <th className="w-40 py-2 pr-3 font-semibold">Progress</th>
                  <th className="py-2 pr-3 font-semibold">Status</th>
                  <th className="py-2 pr-3 font-semibold">Sent</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {list.map((r) => {
                  const rs = recsOf.get(r.id) || [];
                  const acting = signersOf(rs);
                  const doneN = acting.filter((x) => x.status === "signed").length;
                  const pct = acting.length ? Math.round((doneN / acting.length) * 100) : 0;
                  const st = REQUEST_STATUS[r.status];
                  return (
                    <tr key={r.id} className="group cursor-pointer hover:bg-surface-2/50" onClick={() => setOpenId(r.id)}>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <Checkbox checked={picked.has(r.id)} onChange={(v) => setPicked((s) => (v ? new Set(s).add(r.id) : new Set([...s].filter((x) => x !== r.id))))} />
                      </td>
                      <td className="max-w-[280px] py-3 pr-3">
                        <div className="flex items-center gap-2">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-fg-3">
                            <FileSignature className="h-4 w-4" />
                          </span>
                          <div className="min-w-0">
                            <div className="truncate font-semibold text-fg">{r.title}</div>
                            <div className="truncate text-xs text-fg-3">
                              SIGN-{r.number}
                              {r.company_id ? ` · ${companyById(r.company_id)?.name || ""}` : ""}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 pr-3">
                        <div className="flex -space-x-1.5">
                          {rs.slice(0, 5).map((x) => (
                            <span key={x.id} title={`${x.name} · ${x.kind === "cc" ? "copy" : x.status}`} className="relative flex h-7 w-7 items-center justify-center rounded-full border-2 border-surface bg-surface-2 text-[10px] font-semibold text-fg-2">
                              {initials(x.name)}
                              {x.kind !== "cc" && <span className={cn("absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-surface", DOT[x.status] || "bg-zinc-400")} />}
                            </span>
                          ))}
                          {rs.length > 5 && <span className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-surface bg-surface-2 text-[10px] text-fg-3">+{rs.length - 5}</span>}
                        </div>
                      </td>
                      <td className="py-3 pr-3">
                        <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                          <div className={cn("h-full rounded-full", r.status === "completed" ? "bg-emerald-500" : r.status === "declined" ? "bg-red-500" : "bg-brand")} style={{ width: `${r.status === "completed" ? 100 : pct}%` }} />
                        </div>
                        <div className="mt-1 text-[11px] text-fg-4">
                          {doneN} of {acting.length} done
                        </div>
                      </td>
                      <td className="py-3 pr-3">
                        <div className="flex items-center gap-1.5">
                          <Pill className={st.pill}>{st.label}</Pill>
                          {(r as SignRequest & { sealed?: boolean }).sealed && <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" aria-label="Digitally sealed" />}
                        </div>
                      </td>
                      <td className="whitespace-nowrap py-3 pr-3 text-xs text-fg-3">{relTime(r.sent_at || r.created_at)}</td>
                      <td className="py-3 pr-3" onClick={(e) => e.stopPropagation()}>
                        <Popover
                          align="end"
                          width={210}
                          trigger={({ toggle, ref }) => (
                            <button ref={ref} onClick={toggle} className="rounded p-1 text-fg-4 hover:bg-surface-2 hover:text-fg" aria-label="Actions">
                              <MoreHorizontal className="h-4 w-4" />
                            </button>
                          )}
                        >
                          {(close) => (
                            <>
                              <MenuItem icon={Eye} onClick={() => (close(), setOpenId(r.id))}>
                                Details & history
                              </MenuItem>
                              <MenuItem icon={Download} onClick={() => (close(), download(r))}>
                                {r.signed_path ? "Download signed" : "Download original"}
                              </MenuItem>
                              {r.status === "sent" && (
                                <>
                                  <MenuItem icon={Copy} onClick={() => (close(), copyLink(r))}>
                                    Copy signing link
                                  </MenuItem>
                                  <MenuItem icon={Bell} onClick={() => (close(), remind([r.id]))}>
                                    Remind
                                  </MenuItem>
                                  <MenuSep />
                                  <MenuItem icon={Ban} danger onClick={() => (close(), cancel([r.id]))}>
                                    Cancel signing
                                  </MenuItem>
                                </>
                              )}
                            </>
                          )}
                        </Popover>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <RequestModal r={opened} recipients={recipients.rows.filter((x) => x.request_id === openId)} onClose={() => setOpenId(null)} onSaved={requests.put} />
      <CompanyPicker open={choosing} onClose={() => setChoosing(false)} onPick={(id) => (setChoosing(false), setSendFor(id))} />
      {sendFor && <SendDialog open onClose={() => setSendFor(null)} companyId={sendFor} onSent={requests.put} />}
    </>
  );
}

/** "+ New": send a document, write or upload a template, or start from the library. */
function NewMenu({ onSend, onTemplates }: { onSend: () => void; onTemplates: (params: string) => void }) {
  return (
    <Popover
      align="end"
      width={260}
      trigger={({ toggle, ref }) => (
        <Button ref={ref} variant="primary" onClick={toggle} className="h-9">
          <Plus className="h-4 w-4" /> New <ChevronDown className="h-3.5 w-3.5" />
        </Button>
      )}
    >
      {(close) => (
        <>
          <MenuItem icon={Send} onClick={() => (close(), onSend())} hint="Pick the company">
            Send a document
          </MenuItem>
          <MenuSep />
          <MenuItem icon={PenSquare} onClick={() => (close(), onTemplates("new=written"))}>
            Write a template
          </MenuItem>
          <MenuItem icon={FileUp} onClick={() => (close(), onTemplates("new=pdf"))}>
            Upload a PDF template
          </MenuItem>
          <MenuItem icon={BookOpen} onClick={() => (close(), onTemplates("library=1"))}>
            From the template library
          </MenuItem>
        </>
      )}
    </Popover>
  );
}

/** Which company a document is sent for (its signers are suggested from it; the copy is filed on it). */
function CompanyPicker({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (id: string) => void }) {
  const { companies } = useStore();
  const [q, setQ] = useState("");
  const list = [...companies].sort((a, b) => a.name.localeCompare(b.name)).filter((c) => !q || `${c.name} ${c.dot_number || ""} ${c.mc_number || ""}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <Modal open={open} onClose={onClose} title="Send a document" subtitle="For which company?" size="sm">
      <Field label="Company">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, DOT or MC" autoFocus />
      </Field>
      <ul className="scrollbar-bold mt-2 max-h-72 divide-y divide-line overflow-y-auto rounded-lg border border-line">
        {list.map((c) => (
          <li key={c.id}>
            <button onClick={() => onPick(c.id)} className="flex w-full items-center justify-between px-3 py-2 text-left text-[13px] hover:bg-surface-2">
              <span className="truncate font-medium text-fg">{c.name}</span>
              <span className="text-xs text-fg-4">{c.dot_number ? `DOT ${c.dot_number}` : ""}</span>
            </button>
          </li>
        ))}
        {list.length === 0 && <li className="px-3 py-4 text-center text-xs text-fg-4">No company matches.</li>}
      </ul>
    </Modal>
  );
}
