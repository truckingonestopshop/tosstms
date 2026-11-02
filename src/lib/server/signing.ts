import "server-only";
import { createHash } from "node:crypto";
import { adminClient } from "./admin";
import { mailHtml, sendEmail } from "./email";
import { signersOf, usDate, type SignEvent, type SignField, type SignRecipient, type SignRequest } from "@/lib/signing";

// Sending, signing and finishing documents (see lib/signing.ts). Runs with the secret key: the
// public signing page has no login and reaches a request only through its recipient's token.

const BUCKET = "tms-docs";
const db = () => adminClient();

export const linkFor = (origin: string, token: string) => `${(process.env.NEXT_PUBLIC_APP_URL || origin).replace(/\/+$/, "")}/sign/${token}`;

export async function logEvent(e: Partial<SignEvent> & { request_id: string; action: string }) {
  await db().from("tms_sign_events").insert(e);
}

export async function loadRequest(id: string) {
  const [{ data: req }, { data: recs }] = await Promise.all([
    db().from("tms_sign_requests").select("*").eq("id", id).single(),
    db().from("tms_sign_recipients").select("*").eq("request_id", id).order("position"),
  ]);
  return { req: req as SignRequest | null, recipients: (recs || []) as SignRecipient[] };
}

/** Emails a signer their link. Returns null when it went out, or why not. */
async function invite(r: SignRecipient, req: SignRequest, origin: string, reminder = false) {
  if (!r.email) return "No email";
  return sendEmail({
    to: r.email,
    subject: req.subject || `${reminder ? "Reminder: " : ""}Please sign: ${req.title}`,
    html: mailHtml({
      heading: reminder ? `Reminder: ${req.title} is waiting for your signature` : `${req.title} is ready for your signature`,
      lines: [`Hi ${r.name},`, req.message || "TOSS sent you a document to review and sign. It takes a minute, from your phone or computer.", req.expires_at ? `Please sign before ${usDate(req.expires_at)}.` : ""].filter(Boolean),
      button: { label: "Review and sign", href: linkFor(origin, r.token) },
    }),
  });
}

export interface SendResult {
  name: string;
  email: string | null;
  phone: string | null;
  link: string;
  emailed: boolean;
  error: string | null;
}

/** Sends the links to whoever signs now (everyone, or the next one in order). */
export async function sendNow(req: SignRequest, recipients: SignRecipient[], origin: string, opts: { reminder?: boolean; actor?: string } = {}): Promise<SendResult[]> {
  const signers = signersOf(recipients);
  const open = signers.filter((r) => r.status !== "signed" && r.status !== "declined");
  const now = req.in_order ? open.slice(0, 1) : open;
  const out: SendResult[] = [];
  for (const r of now) {
    const error = await invite(r, req, origin, opts.reminder);
    if (r.status === "waiting") await db().from("tms_sign_recipients").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", r.id);
    await logEvent({ request_id: req.id, recipient_id: r.id, action: opts.reminder ? "reminded" : "sent", detail: error ? `Link ready (email not sent: ${error})` : `Emailed to ${r.email}`, actor_name: opts.actor || null });
    out.push({ name: r.name, email: r.email, phone: r.phone, link: linkFor(origin, r.token), emailed: !error, error });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// The signed PDF: every value drawn on its page, plus a certificate page
// ---------------------------------------------------------------------------------------------
/** Helvetica only knows Latin-1: anything else becomes "?". */
const latin = (s: string) => s.replace(/[^\x20-\x7E\xA0-\xFF]/g, "?");

async function buildSignedPdf(req: SignRequest, recipients: SignRecipient[], original: Uint8Array) {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const pdf = await PDFDocument.load(original, { ignoreEncryption: true });
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const pages = pdf.getPages();
  const valueOf = (f: SignField) => (f.role === "toss" ? req.values[f.id] : recipients.find((r) => r.role === f.role && r.kind === "signer")?.values[f.id]) || "";

  for (const f of req.fields) {
    const page = pages[f.page];
    const v = valueOf(f);
    if (!page || !v) continue;
    const { width: W, height: H } = page.getSize();
    const x = f.x * W;
    const w = f.w * W;
    const h = f.h * H;
    const y = H - f.y * H - h;
    if (f.type === "signature" || f.type === "initials") {
      if (!v.startsWith("data:image/png;base64,")) continue;
      const img = await pdf.embedPng(Buffer.from(v.split(",")[1], "base64"));
      const scale = Math.min(w / img.width, h / img.height);
      page.drawImage(img, { x: x + (w - img.width * scale) / 2, y: y + (h - img.height * scale) / 2, width: img.width * scale, height: img.height * scale });
    } else if (f.type === "checkbox") {
      if (v !== "true") continue;
      const c = rgb(0.1, 0.1, 0.1);
      page.drawLine({ start: { x: x + w * 0.2, y: y + h * 0.2 }, end: { x: x + w * 0.8, y: y + h * 0.8 }, thickness: 1.2, color: c });
      page.drawLine({ start: { x: x + w * 0.2, y: y + h * 0.8 }, end: { x: x + w * 0.8, y: y + h * 0.2 }, thickness: 1.2, color: c });
    } else {
      const text = latin(f.type === "date" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? usDate(v) : v);
      let size = Math.min(11, h * 0.72);
      while (size > 5 && font.widthOfTextAtSize(text, size) > w - 2) size -= 0.5;
      page.drawText(text, { x: x + 1, y: y + (h - size) / 2 + size * 0.22, size, font, color: rgb(0.05, 0.05, 0.2) });
    }
  }

  // Certificate
  const { data: events } = await db().from("tms_sign_events").select("*").eq("request_id", req.id).order("created_at");
  const hash = createHash("sha256").update(original).digest("hex");
  let page = pdf.addPage([612, 792]);
  let y = 740;
  const line = (t: string, o: { size?: number; b?: boolean; gap?: number; color?: [number, number, number] } = {}) => {
    const size = o.size || 9.5;
    if (y < 60) {
      page = pdf.addPage([612, 792]);
      y = 740;
    }
    page.drawText(latin(t).slice(0, 120), { x: 50, y, size, font: o.b ? bold : font, color: o.color ? rgb(...o.color) : rgb(0.1, 0.1, 0.1) });
    y -= o.gap ?? size + 6;
  };
  const when = (iso: string | null) => (iso ? `${new Date(iso).toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "medium", timeStyle: "medium" })} ET` : "-");
  line("Signature certificate", { size: 18, b: true, gap: 26 });
  line(`Document: ${req.title}`, { b: true });
  line(`Reference: SIGN-${req.number} · ${req.id}`);
  line(`Original file: ${req.file_name}`);
  line(`Original file SHA-256: ${hash}`, { size: 8 });
  line(`Sent: ${when(req.sent_at)}    Completed: ${when(new Date().toISOString())}`, { gap: 24 });
  line("Signers", { size: 12, b: true, gap: 18 });
  for (const r of signersOf(recipients)) {
    line(`${r.name}${req.roles.find((x) => x.key === r.role) ? ` (${req.roles.find((x) => x.key === r.role)!.label})` : ""}`, { b: true });
    line(`Email: ${r.email || "-"}    Phone: ${r.phone || "-"}`);
    line(`Opened: ${when(r.viewed_at)}    Signed: ${when(r.signed_at)}`);
    line(`IP address: ${r.ip || "-"}`);
    line(`Device: ${(r.user_agent || "-").slice(0, 110)}`, { size: 7.5, gap: 18 });
  }
  const cc = recipients.filter((r) => r.kind === "cc");
  if (cc.length) {
    line("Copies to", { size: 12, b: true, gap: 18 });
    for (const r of cc) line(`${r.name} · ${r.email || r.phone || "-"}`);
    y -= 8;
  }
  line("History", { size: 12, b: true, gap: 18 });
  for (const e of (events || []) as SignEvent[]) {
    const who = e.recipient_id ? recipients.find((r) => r.id === e.recipient_id)?.name : e.actor_name;
    line(`${when(e.created_at)} · ${e.action}${who ? ` · ${who}` : ""}${e.detail ? ` · ${e.detail}` : ""}${e.ip ? ` · IP ${e.ip}` : ""}`, { size: 8 });
  }
  y -= 10;
  line("Each signer agreed to sign electronically. Signatures were captured by TOSS Cloud (Trucking One Stop Shop).", { size: 8, color: [0.4, 0.4, 0.4] });
  return pdf.save();
}

/** All signed: build the signed PDF, file it on the carrier / driver, email everyone a copy. */
export async function finish(req: SignRequest, recipients: SignRecipient[]) {
  const { data: file, error } = await db().storage.from(BUCKET).download(req.file_path);
  if (error || !file) throw new Error("The original PDF is missing");
  const signed = await buildSignedPdf(req, recipients, new Uint8Array(await file.arrayBuffer()));
  const safe = req.title.replace(/[^\w.\- ]+/g, "_").trim() || "document";
  const name = `${safe} (signed).pdf`;
  const folder = req.driver_id ? `drivers/${req.driver_id}` : "signed";
  const path = `${req.company_id || "no-company"}/${folder}/${Date.now()}-${safe.replace(/\s+/g, "_")}-signed.pdf`;
  const up = await db().storage.from(BUCKET).upload(path, signed, { contentType: "application/pdf" });
  if (up.error) throw up.error;

  let documentId: string | null = null;
  if (req.company_id) {
    const { data: doc } = await db()
      .from("tms_documents")
      .insert({ company_id: req.company_id, driver_id: req.driver_id, doc_type: req.doc_type || "other", file_path: path, file_name: name, file_size: signed.length, mime_type: "application/pdf", issued_on: new Date().toISOString().slice(0, 10), notes: `Signed electronically (SIGN-${req.number})` })
      .select("id")
      .single();
    documentId = (doc as { id: string } | null)?.id || null;
  }
  const now = new Date().toISOString();
  await db().from("tms_sign_requests").update({ status: "completed", completed_at: now, signed_path: path, document_id: documentId }).eq("id", req.id);
  await logEvent({ request_id: req.id, action: "completed", detail: "Everyone signed; signed copy filed" });

  for (const r of recipients) {
    if (!r.email) continue;
    await sendEmail({
      to: r.email,
      subject: `Signed: ${req.title}`,
      html: mailHtml({ heading: `${req.title} is signed`, lines: [`Hi ${r.name},`, "Everyone has signed. The signed copy is attached for your records."] }),
      attachments: [{ filename: name, content: signed }],
    });
  }
}
