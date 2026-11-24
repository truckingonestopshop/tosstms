"use client";

import { useEffect, useState } from "react";
import { Mail, MessageSquare, Send } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Field, Input, Segmented, Select, Textarea } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { sendMessage, type Outgoing } from "@/lib/comms";
import { e164, prettyPhone } from "@/lib/phone";

export interface Recipient {
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  /** e.g. "Owner", "Driver", "Factoring" */
  label?: string | null;
}

export interface MessageDefaults {
  channel?: "sms" | "email";
  recipients: Recipient[];
  /** the text message */
  sms?: string;
  /** the email */
  subject?: string;
  email?: string;
  button?: { label: string; href: string };
  companyId?: string | null;
  invoiceId?: string | null;
  signRequestId?: string | null;
  title?: string;
}

/**
 * Text (Kixie) or email (Resend) someone, from the Inbox, a carrier, an invoice or TossSign.
 * Everything sent is saved in the Inbox and on the carrier's timeline.
 */
export function MessageDialog({
  open,
  onClose,
  defaults,
  onSent,
  beforeSend,
}: {
  open: boolean;
  onClose: () => void;
  defaults: MessageDefaults;
  onSent?: () => void;
  /** runs first (e.g. a draft invoice becomes Sent so its link opens); false stops the send */
  beforeSend?: () => Promise<boolean>;
}) {
  const phones = defaults.recipients.filter((r) => e164(r.phone));
  const emails = defaults.recipients.filter((r) => r.email);
  const [channel, setChannel] = useState<"sms" | "email">("sms");
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [typed, setTyped] = useState(false);

  useEffect(() => {
    if (!open) return;
    const ch = defaults.channel ?? (phones.length || !emails.length ? "sms" : "email");
    setChannel(ch);
    setTo(ch === "sms" ? phones[0]?.phone || "" : emails[0]?.email || "");
    setSubject(defaults.subject || "");
    setBody(ch === "sms" ? defaults.sms || "" : defaults.email || defaults.sms || "");
    setTyped(false);
    // only when it opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const switchTo = (ch: "sms" | "email") => {
    setChannel(ch);
    setTyped(false);
    setTo(ch === "sms" ? phones[0]?.phone || "" : emails[0]?.email || "");
    setBody(ch === "sms" ? defaults.sms || "" : defaults.email || defaults.sms || "");
  };

  const options = channel === "sms" ? phones : emails;
  const known = options.some((r) => (channel === "sms" ? r.phone : r.email) === to);
  const name = options.find((r) => (channel === "sms" ? r.phone : r.email) === to)?.name || null;

  const send = async () => {
    setBusy(true);
    if (beforeSend && !(await beforeSend())) return setBusy(false);
    const m: Outgoing = {
      channel,
      to,
      name,
      body,
      subject: channel === "email" ? subject : undefined,
      button: channel === "email" ? defaults.button : undefined,
      companyId: defaults.companyId,
      invoiceId: defaults.invoiceId,
      signRequestId: defaults.signRequestId,
    };
    const ok = await sendMessage(m);
    setBusy(false);
    if (ok) {
      onSent?.();
      onClose();
    }
  };

  const ready = !!body.trim() && (channel === "sms" ? !!e164(to) : /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to.trim())) && (channel === "sms" || !!subject.trim());

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={defaults.title || "Send a message"}
      subtitle={channel === "sms" ? "Sent from your Kixie number. Replies come to the Inbox." : "Sent from TOSS. Replies come back to the Inbox."}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={send} loading={busy} disabled={!ready}>
            {!busy && <Send className="h-4 w-4" />} {channel === "sms" ? "Send text" : "Send email"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Segmented<"sms" | "email">
          value={channel}
          onChange={(v) => switchTo(v)}
          options={[
            { value: "sms", label: (<span className="inline-flex items-center gap-1.5"><MessageSquare className="h-3.5 w-3.5" /> Text</span>) },
            { value: "email", label: (<span className="inline-flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" /> Email</span>) },
          ]}
        />
        <Field label={channel === "sms" ? "To (phone)" : "To (email)"}>
          {options.length > 0 && !typed ? (
            <Select
              value={known ? to : "__other"}
              onChange={(e) => {
                if (e.target.value === "__other") {
                  setTyped(true);
                  setTo("");
                } else setTo(e.target.value);
              }}
            >
              {options.map((r, i) => {
                const v = (channel === "sms" ? r.phone : r.email) || "";
                return (
                  <option key={`${v}-${i}`} value={v}>
                    {[r.name, r.label ? `(${r.label})` : null, channel === "sms" ? prettyPhone(v) : v].filter(Boolean).join(" · ")}
                  </option>
                );
              })}
              <option value="__other">Someone else…</option>
            </Select>
          ) : (
            <Input autoFocus value={to} onChange={(e) => setTo(e.target.value)} placeholder={channel === "sms" ? "(310) 555-1234" : "name@company.com"} inputMode={channel === "sms" ? "tel" : "email"} />
          )}
        </Field>
        {channel === "email" && (
          <Field label="Subject">
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
          </Field>
        )}
        <Field label="Message" hint={channel === "sms" ? `${body.length} characters` : defaults.button ? `The email has a "${defaults.button.label}" button under the message.` : undefined}>
          <Textarea rows={channel === "sms" ? 5 : 8} value={body} onChange={(e) => setBody(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
