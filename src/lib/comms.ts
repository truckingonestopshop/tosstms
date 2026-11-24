"use client";

import { toast } from "@/lib/toast";

// The Inbox in the browser: calls and texts (Kixie) and emails (Resend) with customers.

export type CommChannel = "call" | "sms" | "email" | "note";

export interface Comm {
  id: string;
  channel: CommChannel;
  direction: "inbound" | "outbound";
  contact: string;
  contact_name: string | null;
  company_id: string | null;
  our_address: string | null;
  member_id: string | null;
  agent_email: string | null;
  subject: string | null;
  body: string | null;
  status: string | null;
  duration_sec: number | null;
  ended_at: string | null;
  recording_url: string | null;
  recording_path: string | null;
  disposition: string | null;
  outcome_note: string | null;
  invoice_id: string | null;
  sign_request_id: string | null;
  external_id: string | null;
  error: string | null;
  read_at: string | null;
  occurred_at: string;
  created_at: string;
}

async function post(url: string, body: unknown): Promise<string | null> {
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (res.ok) return null;
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    return j.error || `Failed (${res.status})`;
  } catch {
    return "Can't reach the server. Check your connection.";
  }
}

/**
 * Kixie rings you first; pick up and it dials the customer. When Kixie doesn't allow its
 * automation API for the account, the number goes to the Kixie app / extension instead (tel:),
 * so the call is still made through Kixie and comes back to the Inbox by webhook.
 */
export async function callNow(to: string, name?: string | null) {
  try {
    const res = await fetch("/api/kixie/call", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to, name: name || undefined }) });
    const j = (await res.json().catch(() => ({}))) as { error?: string; fallback?: string; target?: string };
    if (res.ok) {
      toast.success(`Kixie is ringing you. Pick up to call ${name || to}.`);
      return true;
    }
    if (j.fallback === "tel" && j.target) {
      dialInKixie(j.target);
      toast.info(`Opening Kixie to call ${name || to}. The call shows up here when it ends.`);
      return true;
    }
    toast.error(j.error || `Failed (${res.status})`);
    return false;
  } catch {
    toast.error("Can't reach the server. Check your connection.");
    return false;
  }
}

/** Hands a number to the phone app the computer uses for calls (the Kixie app / extension). */
export function dialInKixie(e164: string) {
  const a = document.createElement("a");
  a.href = `tel:${e164}`;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export interface Outgoing {
  channel: "sms" | "email";
  to: string;
  name?: string | null;
  body: string;
  subject?: string;
  button?: { label: string; href: string };
  companyId?: string | null;
  invoiceId?: string | null;
  signRequestId?: string | null;
}

/** Sends a text or an email and saves it in the Inbox. */
export async function sendMessage(m: Outgoing) {
  const error = await post("/api/comms/send", m);
  if (error) toast.error(error);
  else toast.success(m.channel === "sms" ? "Text sent" : "Email sent");
  return !error;
}

/** "2:05" */
export const clock = (sec: number | null | undefined) => {
  const s = Math.max(0, Math.round(Number(sec) || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/** One conversation per customer: their phone or email. */
export const threadKey = (c: Pick<Comm, "contact">) => c.contact;
