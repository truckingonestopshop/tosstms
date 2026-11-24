import { NextResponse, type NextRequest } from "next/server";
import { adminConfigured } from "@/lib/server/admin";
import { kixieConfigured, sendSms } from "@/lib/server/kixie";
import { emailConfigured, mailHtml, sendEmail } from "@/lib/server/email";
import { matchEmail, matchPhone, saveComm, timeline } from "@/lib/server/comms";
import { agent } from "@/lib/server/agent";
import { e164 } from "@/lib/phone";

export const runtime = "nodejs";

interface Body {
  channel?: "sms" | "email";
  to?: string;
  name?: string;
  body?: string;
  subject?: string;
  /** email only: a button under the text */
  button?: { label: string; href: string };
  companyId?: string | null;
  invoiceId?: string | null;
  signRequestId?: string | null;
}

/**
 * POST: sends a text (Kixie, from the member's Kixie number) or an email (Resend) and saves it in
 * the Inbox and on the carrier's timeline. Used by the Inbox, invoices and TossSign.
 */
export async function POST(req: NextRequest) {
  const me = await agent();
  if (!me) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  if (!adminConfigured()) return NextResponse.json({ error: "Server not set up (SUPABASE_SECRET_KEY)" }, { status: 503 });
  const b = (await req.json().catch(() => ({}))) as Body;
  const text = (b.body || "").trim();
  if (!text) return NextResponse.json({ error: "Write a message first" }, { status: 400 });
  if (text.length > 1500) return NextResponse.json({ error: "That message is too long (1,500 characters at most)" }, { status: 400 });

  if (b.channel === "sms") {
    if (!kixieConfigured()) return NextResponse.json({ error: "Kixie isn't set up (KIXIE_API_KEY, KIXIE_BUSINESS_ID)" }, { status: 503 });
    const to = e164(b.to);
    if (!to) return NextResponse.json({ error: "That isn't a phone number Kixie can text" }, { status: 400 });
    const match = b.companyId ? null : await matchPhone(to);
    const error = await sendSms({ agentEmail: me.kixieEmail, target: to, message: text });
    const companyId = b.companyId || match?.company_id || null;
    await saveComm({
      channel: "sms",
      direction: "outbound",
      contact: to,
      contact_name: b.name?.trim() || match?.name || null,
      company_id: companyId,
      member_id: me.id,
      agent_email: me.kixieEmail,
      body: text,
      status: error ? "failed" : "sent",
      error,
      invoice_id: b.invoiceId || null,
      sign_request_id: b.signRequestId || null,
      read_at: new Date().toISOString(),
    });
    if (error) return NextResponse.json({ error: `Kixie: ${error}` }, { status: 502 });
    await timeline(companyId, "sms", `Text sent to ${b.name?.trim() || to}: "${text.slice(0, 280)}"`, me.fullName);
    return NextResponse.json({ ok: true });
  }

  if (b.channel === "email") {
    if (!emailConfigured()) return NextResponse.json({ error: "Email isn't set up (RESEND_API_KEY)" }, { status: 503 });
    const to = (b.to || "").trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return NextResponse.json({ error: "That isn't an email address" }, { status: 400 });
    const subject = (b.subject || "").trim() || "Message from TOSS";
    const button = b.button && /^https:\/\//.test(b.button.href) ? b.button : undefined;
    const match = b.companyId ? null : await matchEmail(to);
    const error = await sendEmail({
      to,
      subject,
      html: mailHtml({ heading: subject, lines: text.split(/\n{2,}/), button }),
      replyTo: me.email || undefined,
    });
    const companyId = b.companyId || match?.company_id || null;
    await saveComm({
      channel: "email",
      direction: "outbound",
      contact: to,
      contact_name: b.name?.trim() || match?.name || null,
      company_id: companyId,
      member_id: me.id,
      agent_email: me.email,
      subject,
      body: button ? `${text}\n\n${button.label}: ${button.href}` : text,
      status: error ? "failed" : "sent",
      error,
      invoice_id: b.invoiceId || null,
      sign_request_id: b.signRequestId || null,
      read_at: new Date().toISOString(),
    });
    if (error) return NextResponse.json({ error }, { status: 502 });
    await timeline(companyId, "email", `Email sent to ${to}: ${subject}`, me.fullName);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Choose text or email" }, { status: 400 });
}
