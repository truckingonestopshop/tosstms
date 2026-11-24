"use client";

import { useState } from "react";
import { MessageSquare } from "lucide-react";
import { MessageDialog } from "./MessageDialog";

/** "Text it": texts someone their link through Kixie (saved in the Inbox), e.g. a TossSign link. */
export function TextLinkButton({
  phone,
  name,
  message,
  companyId,
  signRequestId,
  title,
}: {
  phone: string;
  name: string;
  message: string;
  companyId?: string | null;
  signRequestId?: string | null;
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-line px-2.5 text-xs font-medium text-fg hover:bg-surface-2"
      >
        <MessageSquare className="h-3.5 w-3.5" /> Text it
      </button>
      <MessageDialog
        open={open}
        onClose={() => setOpen(false)}
        defaults={{ channel: "sms", title: title || `Text ${name}`, recipients: [{ name, phone }], sms: message, companyId, signRequestId }}
      />
    </>
  );
}
