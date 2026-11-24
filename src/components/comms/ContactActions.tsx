"use client";

import { useState } from "react";
import { MessageSquare, Phone } from "lucide-react";
import { callNow } from "@/lib/comms";
import { e164, prettyPhone } from "@/lib/phone";
import { cn } from "@/lib/format";
import { MessageDialog, type MessageDefaults } from "./MessageDialog";

/**
 * A phone number with Call and Text through Kixie (replaces plain tel: links). The call and the
 * text land in the Inbox and on the carrier's timeline.
 */
export function PhoneActions({
  phone,
  name,
  companyId,
  label,
  showNumber = true,
  className,
}: {
  phone: string | null | undefined;
  name?: string | null;
  companyId?: string | null;
  label?: string | null;
  showNumber?: boolean;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [texting, setTexting] = useState(false);
  if (!phone) return null;
  const dialable = !!e164(phone);
  if (!dialable) return <span className={className}>{phone}</span>;

  const call = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setBusy(true);
    await callNow(phone, name);
    setBusy(false);
  };
  const defaults: MessageDefaults = { channel: "sms", recipients: [{ name, phone, label }], companyId, title: `Text ${name || prettyPhone(phone)}` };

  return (
    <span className={cn("inline-flex items-center gap-1", className)} onClick={(e) => e.stopPropagation()}>
      {showNumber && (
        <button type="button" onClick={call} disabled={busy} className="hover:underline disabled:opacity-60" title="Call with Kixie">
          {prettyPhone(phone)}
        </button>
      )}
      <IconBtn label={`Call ${name || prettyPhone(phone)} with Kixie`} onClick={call} busy={busy}>
        <Phone className="h-3.5 w-3.5" />
      </IconBtn>
      <IconBtn
        label={`Text ${name || prettyPhone(phone)} with Kixie`}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          setTexting(true);
        }}
      >
        <MessageSquare className="h-3.5 w-3.5" />
      </IconBtn>
      <MessageDialog open={texting} onClose={() => setTexting(false)} defaults={defaults} />
    </span>
  );
}

function IconBtn({ label, onClick, busy, children }: { label: string; onClick: (e: React.MouseEvent) => void; busy?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-label={label}
      title={label}
      className={cn("inline-flex h-6 w-6 items-center justify-center rounded-md text-fg-3 transition-colors hover:bg-surface-2 hover:text-brand disabled:animate-pulse")}
    >
      {children}
    </button>
  );
}
