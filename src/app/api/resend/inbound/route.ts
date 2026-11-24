import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { adminConfigured } from "@/lib/server/admin";
import { matchEmail, saveComm, timeline } from "@/lib/server/comms";

export const runtime = "nodejs";

/**
 * Resend → TOSS: an email arrived at our receiving domain (a customer replying to an email sent
 * from the Inbox, whose Reply-To is INBOX_REPLY_TO). Resend's webhook (event email.received) is
 * signed (Svix); RESEND_WEBHOOK_SECRET is its signing secret. The email lands in the customer's
 * conversation and on their carrier's timeline.
 */

/** Svix signature check: HMAC-SHA256 of "id.timestamp.body" with the base64 secret after "whsec_". */
function verified(req: NextRequest, body: string) {
  const secret = (process.env.RESEND_WEBHOOK_SECRET || "").trim();
  const id = req.headers.get("svix-id") || req.headers.get("webhook-id");
  const ts = req.headers.get("svix-timestamp") || req.headers.get("webhook-timestamp");
  const sigs = req.headers.get("svix-signature") || req.headers.get("webhook-signature");
  if (!secret || !id || !ts || !sigs) return false;
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 10 * 60) return false;
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", key).update(`${id}.${ts}.${body}`).digest();
  return sigs.split(" ").some((s) => {
    const [, b64] = s.split(",");
    if (!b64) return false;
    const got = Buffer.from(b64, "base64");
    return got.length === expected.length && timingSafeEqual(got, expected);
  });
}

type Json = Record<string, unknown>;
const obj = (v: unknown): Json => (v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : {});
const str = (v: unknown) => (typeof v === "string" ? v : Array.isArray(v) ? v.map(String).join(", ") : v == null ? "" : String(v));

/** "Jane Doe <jane@x.com>" → { email, name } */
function parseAddress(raw: string) {
  const m = raw.match(/^\s*"?([^"<]*)"?\s*<([^>]+)>\s*$/);
  if (m) return { email: m[2].trim().toLowerCase(), name: m[1].trim() || null };
  return { email: raw.trim().toLowerCase(), name: null };
}

/** The reply itself, without the quoted earlier messages. */
function replyOnly(text: string) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const cut = lines.findIndex((l) => /^On .+wrote:\s*$/.test(l.trim()) || /^-{2,}\s*Original Message/i.test(l.trim()) || /^From: .+/.test(l.trim()) || /^>/.test(l));
  return (cut > 0 ? lines.slice(0, cut) : lines).join("\n").trim();
}

const htmlToText = (html: string) =>
  html
    .replace(/<(br|\/p|\/div|\/li)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();

/** The full received email (the webhook only carries its summary). */
async function fetchReceived(id: string): Promise<Json | null> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch(`https://api.resend.com/emails/receiving/${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${key}` }, cache: "no-store" });
    return res.ok ? ((await res.json()) as Json) : null;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (!verified(req, raw)) return NextResponse.json({ error: "Not allowed" }, { status: 401 });
  if (!adminConfigured()) return NextResponse.json({ error: "Server not set up (SUPABASE_SECRET_KEY)" }, { status: 503 });

  let payload: Json;
  try {
    payload = JSON.parse(raw) as Json;
  } catch {
    return NextResponse.json({ error: "Expected JSON" }, { status: 400 });
  }
  const type = str(payload.type);
  if (type !== "email.received" && type !== "inbox.email.received") return NextResponse.json({ ok: true, ignored: type });

  const d = obj(payload.data);
  const id = str(d.email_id || d.id);
  const full = id ? await fetchReceived(id) : null;
  const e = { ...d, ...(full || {}) };

  const from = parseAddress(str(e.from));
  if (!from.email.includes("@")) return NextResponse.json({ ok: false, error: "no sender" });
  const subject = str(e.subject) || "(no subject)";
  const text = str(e.text) || (str(e.html) ? htmlToText(str(e.html)) : "");
  const body = replyOnly(text) || text || "(empty email)";

  const match = await matchEmail(from.email);
  const saved = await saveComm({
    channel: "email",
    direction: "inbound",
    contact: from.email,
    contact_name: match?.name || from.name,
    company_id: match?.company_id ?? null,
    our_address: str(e.to) || null,
    subject,
    body: body.slice(0, 20000),
    status: "received",
    external_id: id || null,
    raw: { from: str(e.from), to: str(e.to), subject, created_at: str(e.created_at) },
    occurred_at: str(e.created_at) ? new Date(str(e.created_at)).toISOString() : undefined,
  });
  if (saved?.created) await timeline(saved.company_id, "email", `Email received from ${from.email}: ${subject}`, null);
  return NextResponse.json({ ok: true, id: saved?.id ?? null });
}
