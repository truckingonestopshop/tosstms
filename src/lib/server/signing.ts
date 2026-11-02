import "server-only";
import { createHash, randomInt } from "node:crypto";
import { adminClient } from "./admin";
import { mailHtml, sendEmail } from "./email";
import { sealPdf } from "./seal";
import { RECIPIENT_KINDS, evalFormula, isShown, signersOf, usDate, type SignEvent, type SignField, type SignRecipient, type SignRequest } from "@/lib/signing";

// TossSign on the server: sending, signing and finishing documents (see lib/signing.ts). Runs with
// the secret key: the signing page has no login and reaches a request only through its
// recipient's token (and their access code / emailed code when one is asked).

const BUCKET = "tms-docs";
const db = () => adminClient();
export const BRAND = "TossSign";

export const linkFor = (origin: string, token: string) => `${(process.env.NEXT_PUBLIC_APP_URL || origin).replace(/\/+$/, "")}/sign/${token}`;
export const sha = (s: string) => createHash("sha256").update(s).digest("hex");

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

/** Every value on the document: TOSS's, then each signer's (formulas worked out). */
export function allValues(req: Pick<SignRequest, "values" | "fields">, recipients: SignRecipient[]) {
  const v: Record<string, string> = { ...req.values };
  for (const r of recipients) if (r.kind === "signer") for (const f of req.fields) if (f.role === r.role && r.values[f.id] !== undefined) v[f.id] = r.values[f.id];
  for (const f of req.fields) if (f.type === "number" && f.formula) v[f.id] = evalFormula(f.formula, req.fields, v);
  return v;
}

const ACTION: Record<string, { verb: string; button: string }> = {
  signer: { verb: "sign", button: "Review and sign" },
  approver: { verb: "approve", button: "Review and approve" },
  viewer: { verb: "review", button: "Review the document" },
};

/** Emails someone their link. Returns null when it went out, or why not. */
async function invite(r: SignRecipient, req: SignRequest, origin: string, reminder = false) {
  if (r.in_person) return "Signs in person";
  if (!r.email) return "No email";
  const a = ACTION[r.kind] || ACTION.signer;
  return sendEmail({
    to: r.email,
    subject: req.subject || `${reminder ? "Reminder: " : ""}Please ${a.verb}: ${req.title}`,
    html: mailHtml({
      heading: reminder ? `Reminder: ${req.title} is waiting for you` : `${req.title} is ready for you to ${a.verb}`,
      lines: [
        `Hi ${r.name},`,
        req.message || `Trucking One Stop Shop sent you a document to ${a.verb} with ${BRAND}. It takes a minute, from your phone or computer.`,
        r.verify === "code" ? "You'll need the access code TOSS gave you to open it." : r.verify === "email" ? "We'll email you a one-time code when you open it." : "",
        req.expires_at ? `Please finish before ${usDate(req.expires_at)}.` : "",
      ].filter(Boolean),
      button: { label: a.button, href: linkFor(origin, r.token) },
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
  inPerson: boolean;
}

/** Sends the links to whoever acts now (everyone, or the next one in order). */
export async function sendNow(req: SignRequest, recipients: SignRecipient[], origin: string, opts: { reminder?: boolean; actor?: string } = {}): Promise<SendResult[]> {
  const open = signersOf(recipients).filter((r) => r.status !== "signed" && r.status !== "declined");
  const now = req.in_order ? open.filter((r) => r.position === open[0]?.position) : open;
  const out: SendResult[] = [];
  for (const r of now) {
    const error = await invite(r, req, origin, opts.reminder);
    if (r.status === "waiting") await db().from("tms_sign_recipients").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", r.id);
    await logEvent({
      request_id: req.id,
      recipient_id: r.id,
      action: opts.reminder ? "reminded" : "sent",
      detail: r.in_person ? "To sign in person" : error ? `Link ready (email not sent: ${error})` : `Emailed to ${r.email}`,
      actor_name: opts.actor || null,
    });
    out.push({ name: r.name, email: r.email, phone: r.phone, link: linkFor(origin, r.token), emailed: !error, error: r.in_person ? null : error, inPerson: !!r.in_person });
  }
  if (opts.reminder) await db().from("tms_sign_requests").update({ last_reminded_at: new Date().toISOString() }).eq("id", req.id);
  return out;
}

/** Emails a 6-digit code to a recipient who must confirm their email. */
export async function sendOtp(r: SignRecipient, req: SignRequest) {
  if (!r.email) return "No email to send the code to";
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await db().from("tms_sign_recipients").update({ otp_hash: sha(`${r.id}:${code}`), otp_expires_at: new Date(Date.now() + 15 * 60_000).toISOString() }).eq("id", r.id);
  await logEvent({ request_id: req.id, recipient_id: r.id, action: "code sent", detail: `One-time code emailed to ${r.email}` });
  return sendEmail({
    to: r.email,
    subject: `Your ${BRAND} code: ${code}`,
    html: mailHtml({ heading: `Your code is ${code}`, lines: [`Hi ${r.name},`, `Enter this code to open "${req.title}". It works for 15 minutes.`, "If you didn't ask for it, you can ignore this email."] }),
  });
}

/** The recipient proved who they are (access code or emailed code). */
export function codeOk(r: SignRecipient & { otp_hash?: string | null; otp_expires_at?: string | null }, code: string | null) {
  if (!r.verify || r.verify === "none") return true;
  if (!code) return false;
  if (r.verify === "code") return !!r.access_code && code.trim().toUpperCase() === r.access_code.trim().toUpperCase();
  return !!r.otp_hash && sha(`${r.id}:${code.trim()}`) === r.otp_hash && (!!r.verified_at || (!!r.otp_expires_at && new Date(r.otp_expires_at) > new Date()));
}

// ---------------------------------------------------------------------------------------------
// The signed PDF: every value drawn on its page, a certificate page, and the digital seal
// ---------------------------------------------------------------------------------------------
/** Helvetica only knows Latin-1: anything else becomes "?". */
const latin = (s: string) => s.replace(/[^\x20-\x7E\xA0-\xFF]/g, "?");

async function buildSignedPdf(req: SignRequest, recipients: SignRecipient[], original: Uint8Array) {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const pdf = await PDFDocument.load(original, { ignoreEncryption: true });
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const pages = pdf.getPages();
  const values = allValues(req, recipients);
  const ink = rgb(0.05, 0.05, 0.2);

  const write = (page: (typeof pages)[number], text: string, x: number, y: number, w: number, h: number) => {
    const t = latin(text);
    let size = Math.min(11, h * 0.72);
    while (size > 5 && font.widthOfTextAtSize(t, size) > w - 2) size -= 0.5;
    page.drawText(t, { x: x + 1, y: y + (h - size) / 2 + size * 0.22, size, font, color: ink });
  };
  for (const f of req.fields as SignField[]) {
    const page = pages[f.page];
    const v = values[f.id] || "";
    if (!page || !v || !isShown(f, req.fields, values)) continue;
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
    } else if (f.type === "attachment") {
      let name = "file";
      try {
        name = (JSON.parse(v) as { name: string }).name;
      } catch {}
      write(page, `Attached: ${name}`, x, y, w, h);
    } else {
      write(page, f.type === "date" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? usDate(v) : v, x, y, w, h);
    }
  }

  // Certificate of completion
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
  const when = (iso: string | null | undefined) => (iso ? `${new Date(iso).toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "medium", timeStyle: "medium" })} ET` : "-");
  page.drawRectangle({ x: 0, y: 784, width: 612, height: 8, color: rgb(0.95, 0.55, 0.22) });
  line(`${BRAND} · Certificate of completion`, { size: 18, b: true, gap: 26 });
  line(`Document: ${req.title}`, { b: true });
  line(`Reference: SIGN-${req.number} · ${req.id}`);
  line(`Original file: ${req.file_name}`);
  line(`Original file SHA-256: ${hash}`, { size: 8 });
  line(`Sent: ${when(req.sent_at)}    Completed: ${when(new Date().toISOString())}`, { gap: 24 });
  line("Recipients", { size: 12, b: true, gap: 18 });
  for (const r of signersOf(recipients)) {
    const role = req.roles.find((x) => x.key === r.role)?.label;
    const kind = RECIPIENT_KINDS.find((k) => k.v === r.kind)?.label;
    line(`${r.name} · ${kind}${role ? ` (${role})` : ""}${r.in_person ? " · in person" : ""}`, { b: true });
    line(`Email: ${r.email || "-"}    Phone: ${r.phone || "-"}    Verified by: ${r.verify === "code" ? "access code" : r.verify === "email" ? `emailed code (${when(r.verified_at)})` : "the link sent to them"}`);
    line(`Opened: ${when(r.viewed_at)}    ${r.kind === "signer" ? "Signed" : r.kind === "approver" ? "Approved" : "Reviewed"}: ${when(r.signed_at)}`);
    line(`IP address: ${r.ip || "-"}`);
    if (r.files?.length) line(`Attached: ${r.files.map((f) => f.name).join(", ")}`, { size: 8.5 });
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
  line(`Everyone agreed to sign electronically. Captured by ${BRAND} (TOSS Cloud, Trucking One Stop Shop).`, { size: 8, color: [0.4, 0.4, 0.4] });
  line("This PDF carries a digital seal: Adobe Reader shows it as signed and flags any change made after.", { size: 8, color: [0.4, 0.4, 0.4] });
  return pdf.save({ useObjectStreams: false });
}

/** Everyone done: signed PDF + certificate + seal, filed on the carrier / driver, emailed to all. */
export async function finish(req: SignRequest, recipients: SignRecipient[]) {
  const { data: file, error } = await db().storage.from(BUCKET).download(req.file_path);
  if (error || !file) throw new Error("The original PDF is missing");
  const built = await buildSignedPdf(req, recipients, new Uint8Array(await file.arrayBuffer()));
  const { bytes: signed, sealed } = await sealPdf(built, `${req.title} (SIGN-${req.number}) completed`);
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
      .insert({ company_id: req.company_id, driver_id: req.driver_id, doc_type: req.doc_type || "other", file_path: path, file_name: name, file_size: signed.length, mime_type: "application/pdf", issued_on: new Date().toISOString().slice(0, 10), notes: `Signed electronically with ${BRAND} (SIGN-${req.number})` })
      .select("id")
      .single();
    documentId = (doc as { id: string } | null)?.id || null;
  }
  await db().from("tms_sign_requests").update({ status: "completed", completed_at: new Date().toISOString(), signed_path: path, document_id: documentId, sealed }).eq("id", req.id);
  await logEvent({ request_id: req.id, action: "completed", detail: `Everyone done; signed copy filed${sealed ? " and digitally sealed" : ""}` });

  for (const r of recipients) {
    if (!r.email) continue;
    await sendEmail({
      to: r.email,
      subject: `Completed: ${req.title}`,
      html: mailHtml({ heading: `${req.title} is complete`, lines: [`Hi ${r.name},`, `Everyone has finished. The signed copy is attached for your records (sealed by ${BRAND}).`] }),
      attachments: [{ filename: name, content: signed }],
    });
  }
}

/** Reminders every N days to whoever hasn't acted; documents past their date expire. */
export async function sweep(origin: string) {
  const now = Date.now();
  const { data } = await db().from("tms_sign_requests").select("*").eq("status", "sent");
  let reminded = 0;
  let expired = 0;
  for (const req of (data || []) as (SignRequest & { remind_every_days: number | null; last_reminded_at: string | null })[]) {
    if (req.expires_at && new Date(req.expires_at).getTime() < now) {
      await db().from("tms_sign_requests").update({ status: "expired" }).eq("id", req.id);
      await logEvent({ request_id: req.id, action: "expired" });
      expired++;
      continue;
    }
    if (!req.remind_every_days) continue;
    const last = new Date(req.last_reminded_at || req.sent_at || req.created_at).getTime();
    if (now - last < req.remind_every_days * 86_400_000) continue;
    const { recipients } = await loadRequest(req.id);
    await sendNow(req, recipients, origin, { reminder: true, actor: `${BRAND} (automatic)` });
    reminded++;
  }
  return { reminded, expired };
}
