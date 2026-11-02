"use client";

import { useEffect, useState } from "react";
import { Ban, Bell, Check, Copy, Download, FileSignature, MessageSquare, Send } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, Empty, Pill } from "@/components/ui/Bits";
import { Input, Segmented } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { confirmDialog } from "@/components/ui/Confirm";
import { errMsg, openDocument, sb } from "@/lib/db";
import { useLiveTable } from "@/lib/live";
import { useStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import { cn, relTime } from "@/lib/format";
import { RECIPIENT_STATUS, REQUEST_STATUS, signersOf, type SignEvent, type SignRecipient, type SignRequest, type TemplateCategory } from "@/lib/signing";
import { SendDialog } from "./SendDialog";

type Show = "open" | "completed" | "all";

/**
 * Documents sent for signing, newest first: all of them (Signing page) or one company's, driver's
 * or person's. With `companyId` it also has the Send button.
 */
export function SigningRequests({ companyId, driverId, personId, category, title = "Sent for signing" }: { companyId?: string; driverId?: string; personId?: string; category?: TemplateCategory; title?: string }) {
  const { companyById, inScope } = useStore();
  const filter: Record<string, string> = companyId ? { company_id: companyId } : {};
  if (driverId) filter.driver_id = driverId;
  if (personId) filter.person_id = personId;
  const requests = useLiveTable<SignRequest>("tms_sign_requests", { filter });
  const recipients = useLiveTable<SignRecipient>("tms_sign_recipients", { order: "position", ascending: true });
  const [show, setShow] = useState<Show>("open");
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const list = requests.rows
    .filter((r) => !r.company_id || inScope(r.company_id))
    .filter((r) => (show === "open" ? r.status === "sent" || r.status === "draft" : show === "completed" ? r.status === "completed" : true))
    .filter((r) => !q || `${r.title} SIGN-${r.number} ${companyById(r.company_id)?.name || ""} ${recipients.rows.filter((x) => x.request_id === r.id).map((x) => x.name).join(" ")}`.toLowerCase().includes(q.toLowerCase()));
  const opened = requests.rows.find((r) => r.id === openId) || null;

  return (
    <Card>
      <CardHeader
        title={title}
        subtitle={`${requests.rows.filter((r) => r.status === "sent").length} waiting · ${requests.rows.filter((r) => r.status === "completed").length} completed`}
        actions={
          companyId && (
            <Button size="sm" variant="outline" onClick={() => setSending(true)}>
              <Send className="h-4 w-4" /> Send for signing
            </Button>
          )
        }
      />
      <div className="flex flex-col gap-2 border-b border-line px-4 py-2.5 sm:flex-row sm:items-center sm:px-5">
        <Segmented<Show>
          size="sm"
          value={show}
          onChange={setShow}
          options={[
            { value: "open", label: "Waiting" },
            { value: "completed", label: "Completed" },
            { value: "all", label: "All" },
          ]}
        />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Document, signer, company" className="h-8 sm:max-w-xs" />
      </div>
      {!requests.loaded ? (
        <div className="px-4 py-6 text-center text-xs text-fg-4">Loading…</div>
      ) : list.length === 0 ? (
        <Empty icon={FileSignature} title={requests.rows.length ? "Nothing here" : "Nothing sent for signing yet"} />
      ) : (
        <ul className="divide-y divide-line">
          {list.map((r) => {
            const st = REQUEST_STATUS[r.status];
            const signers = signersOf(recipients.rows.filter((x) => x.request_id === r.id));
            const done = signers.filter((s) => s.status === "signed").length;
            return (
              <li key={r.id}>
                <button onClick={() => setOpenId(r.id)} className="flex w-full flex-col gap-1 px-4 py-3 text-left hover:bg-surface-2/50 sm:flex-row sm:items-center sm:gap-4 sm:px-5">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-semibold text-fg">{r.title}</div>
                    <div className="truncate text-xs text-fg-3">{[companyId ? "" : companyById(r.company_id)?.name, signers.map((s) => s.name).join(", ")].filter(Boolean).join(" · ")}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    {r.status === "sent" && signers.length > 0 && (
                      <span className="text-xs text-fg-3">
                        {done}/{signers.length} signed
                      </span>
                    )}
                    <Pill className={st.pill}>{st.label}</Pill>
                    <span className="text-xs text-fg-4">{relTime(r.completed_at || r.sent_at || r.created_at)}</span>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <RequestModal r={opened} recipients={recipients.rows.filter((x) => x.request_id === openId)} onClose={() => setOpenId(null)} onSaved={requests.put} />
      {companyId && <SendDialog open={sending} onClose={() => setSending(false)} companyId={companyId} driverId={driverId} personId={personId} category={category} onSent={requests.put} />}
    </Card>
  );
}

function RequestModal({ r, recipients, onClose, onSaved }: { r: SignRequest | null; recipients: SignRecipient[]; onClose: () => void; onSaved: (r: SignRequest) => void }) {
  const { companyById } = useStore();
  const [events, setEvents] = useState<SignEvent[]>([]);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState("");
  useEffect(() => {
    if (!r) return;
    let alive = true;
    sb()
      .from("tms_sign_events")
      .select("*")
      .eq("request_id", r.id)
      .order("created_at", { ascending: false })
      .then(({ data }) => alive && setEvents((data || []) as SignEvent[]));
    return () => {
      alive = false;
    };
  }, [r]);
  if (!r) return null;
  const link = (token: string) => `${window.location.origin}/sign/${token}`;
  const st = REQUEST_STATUS[r.status];

  const remind = async () => {
    setBusy(true);
    const res = await fetch("/api/sign/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestId: r.id, reminder: true }) });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return toast.error(body.error || "Couldn't send the reminder");
    toast.success(body.emailReady ? "Reminder emailed" : "Email isn't connected yet: copy the link or text it");
  };
  const cancel = async () => {
    if (!(await confirmDialog({ title: `Cancel "${r.title}"?`, body: "The links stop working. You can send it again later.", confirmLabel: "Cancel signing", danger: true }))) return;
    const { data, error } = await sb().from("tms_sign_requests").update({ status: "void" }).eq("id", r.id).select().single();
    if (error) return toast.error(errMsg(error));
    await sb().from("tms_sign_events").insert({ request_id: r.id, action: "cancelled" });
    onSaved(data as SignRequest);
  };
  const open = (path: string, name: string) => openDocument(path, name).catch((e) => toast.error(errMsg(e)));

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={r.title}
      subtitle={`SIGN-${r.number}${r.company_id ? ` · ${companyById(r.company_id)?.name || ""}` : ""}`}
      footer={
        <>
          {r.status === "sent" && (
            <Button variant="danger-ghost" onClick={cancel} className="mr-auto">
              <Ban className="h-4 w-4" /> Cancel signing
            </Button>
          )}
          {r.signed_path ? (
            <Button variant="primary" onClick={() => open(r.signed_path!, `${r.title} (signed).pdf`)}>
              <Download className="h-4 w-4" /> Signed copy
            </Button>
          ) : (
            <Button variant="outline" onClick={() => open(r.file_path, r.file_name)}>
              <Download className="h-4 w-4" /> Original
            </Button>
          )}
          {r.status === "sent" && (
            <Button variant="primary" onClick={remind} disabled={busy}>
              <Bell className="h-4 w-4" /> Remind
            </Button>
          )}
        </>
      }
    >
      <div className="mb-4 flex items-center gap-2">
        <Pill className={st.pill}>{st.label}</Pill>
        {r.in_order && <span className="text-xs text-fg-3">Signed in order</span>}
        {r.expires_at && <span className="text-xs text-fg-3">Expires {new Date(r.expires_at).toLocaleDateString("en-US")}</span>}
      </div>
      <ul className="space-y-2">
        {recipients.map((x) => (
          <li key={x.id} className="rounded-lg border border-line p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[13px] font-semibold text-fg">{x.name}</span>
              <span className="text-xs text-fg-3">{x.kind === "cc" ? "Copy" : r.roles.find((y) => y.key === x.role)?.label}</span>
              <span className={cn("ml-auto text-xs font-medium", x.status === "signed" ? "text-emerald-600" : x.status === "declined" ? "text-red-600" : "text-fg-3")}>
                {x.kind === "cc" ? "Gets the signed copy" : RECIPIENT_STATUS[x.status]}
                {x.signed_at ? ` · ${relTime(x.signed_at)}` : x.viewed_at ? ` · opened ${relTime(x.viewed_at)}` : ""}
              </span>
            </div>
            <div className="text-xs text-fg-3">{[x.email, x.phone].filter(Boolean).join(" · ")}</div>
            {x.declined_reason && <div className="mt-1 text-xs text-red-600">“{x.declined_reason}”</div>}
            {r.status === "sent" && x.kind === "signer" && x.status !== "signed" && (
              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  size="xs"
                  variant="outline"
                  onClick={async () => {
                    await navigator.clipboard.writeText(link(x.token));
                    setCopied(x.id);
                  }}
                >
                  {copied === x.id ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {copied === x.id ? "Copied" : "Copy link"}
                </Button>
                {x.phone && (
                  <a href={`sms:${x.phone.replace(/[^\d+]/g, "")}?&body=${encodeURIComponent(`Hi ${x.name.split(" ")[0]}, please review and sign: ${link(x.token)}`)}`} className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-line px-2.5 text-xs font-medium text-fg hover:bg-surface-2">
                    <MessageSquare className="h-3.5 w-3.5" /> Text it
                  </a>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
      <h3 className="mb-2 mt-5 text-[13px] font-semibold text-fg">History</h3>
      <ul className="space-y-1">
        {events.map((e) => (
          <li key={e.id} className="text-xs text-fg-3">
            <span className="text-fg-2">{new Date(e.created_at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}</span> · {e.action}
            {e.recipient_id ? ` · ${recipients.find((x) => x.id === e.recipient_id)?.name || ""}` : e.actor_name ? ` · ${e.actor_name}` : ""}
            {e.detail ? ` · ${e.detail}` : ""}
          </li>
        ))}
        {events.length === 0 && <li className="text-xs text-fg-4">Nothing yet.</li>}
      </ul>
    </Modal>
  );
}
