import "server-only";

// Email from TOSS Cloud through Resend (the same provider and domain as the sign-in emails).
// RESEND_API_KEY on the server turns it on; EMAIL_FROM can change the sender. Without the key
// nothing is sent and callers say so (links can still be copied by hand).

const FROM = process.env.EMAIL_FROM || "TOSS <team@mail.tosscloud.tech>";

export const emailConfigured = () => !!process.env.RESEND_API_KEY;

export interface Mail {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
  attachments?: { filename: string; content: Uint8Array }[];
}

/** Sends one email. Returns null when it went out, or why it didn't. */
export async function sendEmail(m: Mail): Promise<string | null> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return "Email isn't set up (RESEND_API_KEY)";
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM,
        to: [m.to],
        subject: m.subject,
        html: m.html,
        reply_to: m.replyTo,
        attachments: m.attachments?.map((a) => ({ filename: a.filename, content: Buffer.from(a.content).toString("base64") })),
      }),
    });
    if (res.ok) return null;
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    return body.message || `Email failed (${res.status})`;
  } catch (e) {
    return e instanceof Error ? e.message : "Email failed";
  }
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** A plain TOSS email: a heading, paragraphs and one button. */
export function mailHtml({ heading, lines, button }: { heading: string; lines: string[]; button?: { label: string; href: string } }) {
  return `<!doctype html><html><body style="margin:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;color:#18181b">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;padding:32px">
<tr><td style="font-size:13px;font-weight:bold;letter-spacing:.08em;color:#71717a">TOSS · TRUCKING ONE STOP SHOP</td></tr>
<tr><td style="padding-top:16px;font-size:20px;font-weight:bold">${esc(heading)}</td></tr>
${lines.map((l) => `<tr><td style="padding-top:12px;font-size:15px;line-height:1.5;white-space:pre-line">${esc(l)}</td></tr>`).join("")}
${button ? `<tr><td style="padding-top:24px"><a href="${esc(button.href)}" style="display:inline-block;background:#F28C38;color:#000000;font-weight:bold;text-decoration:none;padding:12px 22px;border-radius:8px;font-size:15px">${esc(button.label)}</a></td></tr>
<tr><td style="padding-top:16px;font-size:12px;color:#71717a">Or open this link: ${esc(button.href)}</td></tr>` : ""}
</table></td></tr></table></body></html>`;
}
