import { NextResponse, type NextRequest } from "next/server";
import { adminClient, adminConfigured } from "@/lib/server/admin";
import { allValues, codeOk, finish, loadRequest, logEvent, sendNow, sendOtp } from "@/lib/server/signing";
import { evalFormula, fieldProblem, isShown, signersOf, type SignRecipient } from "@/lib/signing";

export const runtime = "nodejs";

// TossSign's signing page server (no login: the token in the link is the key, plus the access
// code / emailed code when one is asked, sent as the x-sign-code header). GET shows the document
// and this person's fields; POST signs, approves, marks reviewed, declines, or handles the code.

type Rec = SignRecipient & { otp_hash?: string | null; otp_expires_at?: string | null };
const ipOf = (req: NextRequest) => (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || req.headers.get("x-real-ip") || null;
const mask = (email: string | null) => (email ? email.replace(/^(.)(.*)(@.*)$/, (_, a: string, b: string, c: string) => `${a}${"•".repeat(Math.min(6, b.length))}${c}`) : null);

async function byToken(token: string) {
  if (!/^[a-f0-9]{48}$/.test(token)) return null;
  const { data } = await adminClient().from("tms_sign_recipients").select("*").eq("token", token).maybeSingle();
  if (!data) return null;
  const me = data as Rec;
  const { req, recipients } = await loadRequest(me.request_id);
  if (!req) return null;
  if (req.status === "sent" && req.expires_at && new Date(req.expires_at) < new Date()) {
    await adminClient().from("tms_sign_requests").update({ status: "expired" }).eq("id", req.id);
    req.status = "expired";
  }
  return { me, req, recipients };
}

/** It's this person's turn: everyone before them (when in order) is done. */
const myTurn = (me: SignRecipient, req: { in_order: boolean }, all: SignRecipient[]) => !req.in_order || signersOf(all).filter((r) => r.position < me.position).every((r) => r.status === "signed");

export async function GET(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  if (!adminConfigured()) return NextResponse.json({ error: "Not available" }, { status: 503 });
  const { token } = await ctx.params;
  const found = await byToken(token);
  if (!found) return NextResponse.json({ error: "This link isn't valid." }, { status: 404 });
  const { me, req: request, recipients } = found;
  const { data: company } = request.company_id ? await adminClient().from("tms_companies").select("name").eq("id", request.company_id).maybeSingle() : { data: null };
  const head = { title: request.title, company: (company as { name?: string } | null)?.name || null, name: me.name };

  // Verification first: nothing of the document until the code is right.
  if (!codeOk(me, req.headers.get("x-sign-code"))) return NextResponse.json({ locked: { method: me.verify, email: mask(me.email) }, ...head });

  if (!me.viewed_at && me.kind !== "cc") {
    await adminClient().from("tms_sign_recipients").update({ viewed_at: new Date().toISOString(), status: me.status === "sent" || me.status === "waiting" ? "viewed" : me.status }).eq("id", me.id);
    await logEvent({ request_id: request.id, recipient_id: me.id, action: "opened", ip: ipOf(req), user_agent: req.headers.get("user-agent") });
  }
  const path = request.status === "completed" && request.signed_path ? request.signed_path : request.file_path;
  const { data: url } = await adminClient().storage.from("tms-docs").createSignedUrl(path, 60 * 30);
  // What's already on the page: TOSS's values and other signers' (no one's contact details).
  const others = recipients.filter((r) => r.id !== me.id && r.status === "signed");
  const values = allValues(request, others);
  return NextResponse.json({
    ...head,
    number: request.number,
    status: request.status,
    signedCopy: request.status === "completed",
    sealed: !!(request as { sealed?: boolean }).sealed,
    fileUrl: url?.signedUrl || null,
    pages: request.pages,
    roles: request.roles,
    fields: request.fields,
    values,
    message: request.message,
    expiresAt: request.expires_at,
    me: { name: me.name, email: me.email, phone: me.phone, role: me.role, kind: me.kind, status: me.status, values: me.values, myTurn: myTurn(me, request, recipients), inPerson: !!me.in_person },
  });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  if (!adminConfigured()) return NextResponse.json({ error: "Not available" }, { status: 503 });
  const { token } = await ctx.params;
  const found = await byToken(token);
  if (!found) return NextResponse.json({ error: "This link isn't valid." }, { status: 404 });
  const { me, req: request, recipients } = found;
  const body = (await req.json().catch(() => ({}))) as { action?: string; values?: Record<string, unknown>; agree?: boolean; reason?: string; code?: string };
  const ip = ipOf(req);
  const ua = req.headers.get("user-agent");

  // ---- the code gate -------------------------------------------------------------------------
  if (body.action === "send_code") {
    if (me.verify !== "email") return NextResponse.json({ error: "No code is needed" }, { status: 400 });
    const err = await sendOtp(me, request);
    return err ? NextResponse.json({ error: `The code couldn't be emailed (${err})` }, { status: 502 }) : NextResponse.json({ ok: true });
  }
  if (body.action === "verify") {
    const fresh = (await adminClient().from("tms_sign_recipients").select("*").eq("id", me.id).single()).data as Rec;
    if (!codeOk(fresh, body.code || null)) {
      await logEvent({ request_id: request.id, recipient_id: me.id, action: "wrong code", ip, user_agent: ua });
      return NextResponse.json({ error: "That code isn't right." }, { status: 403 });
    }
    if (!fresh.verified_at) {
      await adminClient().from("tms_sign_recipients").update({ verified_at: new Date().toISOString() }).eq("id", me.id);
      await logEvent({ request_id: request.id, recipient_id: me.id, action: "verified", detail: me.verify === "code" ? "Access code" : "Emailed code", ip, user_agent: ua });
    }
    return NextResponse.json({ ok: true });
  }
  if (!codeOk(me, req.headers.get("x-sign-code"))) return NextResponse.json({ error: "Enter your code first." }, { status: 403 });

  // ---- acting on the document ----------------------------------------------------------------
  if (me.kind === "cc") return NextResponse.json({ error: "You were sent a copy; there's nothing to do." }, { status: 400 });
  if (request.status !== "sent") return NextResponse.json({ error: request.status === "expired" ? "This document has expired." : "This document isn't open anymore." }, { status: 409 });
  if (me.status === "signed" || me.status === "declined") return NextResponse.json({ error: "You already answered this document." }, { status: 409 });
  if (!myTurn(me, request, recipients)) return NextResponse.json({ error: "Someone has to finish before you. You'll get an email when it's your turn." }, { status: 409 });

  if (body.action === "decline") {
    const reason = String(body.reason || "").slice(0, 500) || null;
    await adminClient().from("tms_sign_recipients").update({ status: "declined", declined_reason: reason, ip, user_agent: ua }).eq("id", me.id);
    await adminClient().from("tms_sign_requests").update({ status: "declined" }).eq("id", request.id);
    await logEvent({ request_id: request.id, recipient_id: me.id, action: me.kind === "approver" ? "rejected" : "declined", detail: reason, ip, user_agent: ua });
    return NextResponse.json({ ok: true, status: "declined" });
  }

  const now = new Date().toISOString();
  if (me.kind === "viewer" || me.kind === "approver") {
    if (body.action !== (me.kind === "viewer" ? "reviewed" : "approve")) return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    await adminClient().from("tms_sign_recipients").update({ status: "signed", signed_at: now, ip, user_agent: ua, viewed_at: me.viewed_at || now }).eq("id", me.id);
    await logEvent({ request_id: request.id, recipient_id: me.id, action: me.kind === "viewer" ? "reviewed" : "approved", ip, user_agent: ua });
  } else {
    if (body.action !== "sign") return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    if (!body.agree) return NextResponse.json({ error: "Please agree to sign electronically." }, { status: 400 });
    // Check every one of this signer's fields the way the page does (shown ones only).
    const before = allValues(request, recipients.filter((r) => r.id !== me.id && r.status === "signed"));
    const mine = request.fields.filter((f) => f.role === me.role);
    const values: Record<string, string> = {};
    for (const f of mine) {
      const raw = body.values?.[f.id];
      values[f.id] = typeof raw === "string" ? raw.slice(0, f.type === "signature" || f.type === "initials" ? 600_000 : 4000) : "";
      if (f.readOnly && before[f.id] !== undefined) values[f.id] = before[f.id];
    }
    const merged = { ...before, ...values };
    for (const f of mine) if (f.type === "number" && f.formula) merged[f.id] = values[f.id] = evalFormula(f.formula, request.fields, merged);
    const files: NonNullable<SignRecipient["files"]> = [];
    for (const f of mine) {
      const v = values[f.id];
      if (!isShown(f, request.fields, merged)) {
        delete values[f.id];
        continue;
      }
      if ((f.type === "signature" || f.type === "initials") && v && !v.startsWith("data:image/png;base64,")) return NextResponse.json({ error: `"${f.label}" isn't a valid signature` }, { status: 400 });
      if (f.type === "attachment" && v) {
        try {
          const a = JSON.parse(v) as { path: string; name: string; mime: string | null };
          if (!a.path.startsWith(`signing/uploads/${request.id}/${me.id}/`)) throw new Error();
          files.push({ fieldId: f.id, ...a });
        } catch {
          return NextResponse.json({ error: `Attach the file for "${f.label}" again` }, { status: 400 });
        }
      }
      const problem = fieldProblem(f, v);
      if (problem) return NextResponse.json({ error: problem }, { status: 400 });
      if (!v) delete values[f.id];
    }
    await adminClient().from("tms_sign_recipients").update({ values, files, status: "signed", signed_at: now, ip, user_agent: ua, viewed_at: me.viewed_at || now }).eq("id", me.id);
    await logEvent({ request_id: request.id, recipient_id: me.id, action: "signed", detail: me.in_person ? "In person" : files.length ? `${files.length} file(s) attached` : null, ip, user_agent: ua });
  }

  const fresh = await loadRequest(request.id);
  if (!fresh.req) return NextResponse.json({ ok: true, status: "signed" });
  if (!signersOf(fresh.recipients).some((r) => r.status !== "signed")) {
    try {
      await finish(fresh.req, fresh.recipients);
    } catch (e) {
      await logEvent({ request_id: request.id, action: "error", detail: `Signed copy failed: ${e instanceof Error ? e.message : "unknown"}` });
    }
    return NextResponse.json({ ok: true, status: "completed" });
  }
  if (fresh.req.in_order) await sendNow(fresh.req, fresh.recipients, req.nextUrl.origin);
  return NextResponse.json({ ok: true, status: "signed" });
}
