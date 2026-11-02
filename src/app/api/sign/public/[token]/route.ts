import { NextResponse, type NextRequest } from "next/server";
import { adminClient, adminConfigured } from "@/lib/server/admin";
import { finish, loadRequest, logEvent, sendNow } from "@/lib/server/signing";
import { isEmpty, signersOf, type SignRecipient } from "@/lib/signing";

export const runtime = "nodejs";

// The signing page's server (no login: the token in the link is the key). GET shows the document
// and this signer's fields; POST signs or declines. Nothing else of TOSS Cloud is reachable here.

const ipOf = (req: NextRequest) => (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || req.headers.get("x-real-ip") || null;

async function byToken(token: string) {
  if (!/^[a-f0-9]{48}$/.test(token)) return null;
  const { data } = await adminClient().from("tms_sign_recipients").select("*").eq("token", token).maybeSingle();
  if (!data) return null;
  const me = data as SignRecipient;
  const { req, recipients } = await loadRequest(me.request_id);
  if (!req) return null;
  // Past its expiry date: no more signing.
  if (req.status === "sent" && req.expires_at && new Date(req.expires_at) < new Date()) {
    await adminClient().from("tms_sign_requests").update({ status: "expired" }).eq("id", req.id);
    req.status = "expired";
  }
  return { me, req, recipients };
}

/** It's this signer's turn: everyone before them (when signing in order) has signed. */
const myTurn = (me: SignRecipient, req: { in_order: boolean }, all: SignRecipient[]) => !req.in_order || signersOf(all).filter((r) => r.position < me.position).every((r) => r.status === "signed");

export async function GET(_req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  if (!adminConfigured()) return NextResponse.json({ error: "Not available" }, { status: 503 });
  const { token } = await ctx.params;
  const found = await byToken(token);
  if (!found) return NextResponse.json({ error: "This link isn't valid." }, { status: 404 });
  const { me, req, recipients } = found;

  if (!me.viewed_at && me.kind === "signer") {
    await adminClient().from("tms_sign_recipients").update({ viewed_at: new Date().toISOString(), status: me.status === "sent" || me.status === "waiting" ? "viewed" : me.status }).eq("id", me.id);
    await logEvent({ request_id: req.id, recipient_id: me.id, action: "opened", ip: ipOf(_req), user_agent: _req.headers.get("user-agent") });
  }
  const path = req.status === "completed" && req.signed_path ? req.signed_path : req.file_path;
  const { data: url } = await adminClient().storage.from("tms-docs").createSignedUrl(path, 60 * 30);
  const { data: company } = req.company_id ? await adminClient().from("tms_companies").select("name").eq("id", req.company_id).maybeSingle() : { data: null };

  // What's already on the page: TOSS's values and other signers' (no one's contact details).
  const values: Record<string, string> = { ...req.values };
  for (const r of recipients) if (r.id !== me.id && r.status === "signed") Object.assign(values, r.values);
  return NextResponse.json({
    title: req.title,
    number: req.number,
    company: (company as { name?: string } | null)?.name || null,
    status: req.status,
    signedCopy: req.status === "completed",
    fileUrl: url?.signedUrl || null,
    pages: req.pages,
    roles: req.roles,
    fields: req.fields,
    values,
    message: req.message,
    expiresAt: req.expires_at,
    me: { name: me.name, email: me.email, phone: me.phone, role: me.role, kind: me.kind, status: me.status, values: me.values, myTurn: myTurn(me, req, recipients) },
  });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  if (!adminConfigured()) return NextResponse.json({ error: "Not available" }, { status: 503 });
  const { token } = await ctx.params;
  const found = await byToken(token);
  if (!found) return NextResponse.json({ error: "This link isn't valid." }, { status: 404 });
  const { me, req: request, recipients } = found;
  const body = (await req.json().catch(() => ({}))) as { action?: string; values?: Record<string, unknown>; agree?: boolean; reason?: string };
  const ip = ipOf(req);
  const ua = req.headers.get("user-agent");

  if (me.kind !== "signer") return NextResponse.json({ error: "You were sent a copy; there's nothing to sign." }, { status: 400 });
  if (request.status !== "sent") return NextResponse.json({ error: request.status === "expired" ? "This document has expired." : "This document isn't open for signing anymore." }, { status: 409 });
  if (me.status === "signed" || me.status === "declined") return NextResponse.json({ error: "You already answered this document." }, { status: 409 });
  if (!myTurn(me, request, recipients)) return NextResponse.json({ error: "Someone has to sign before you. You'll get an email when it's your turn." }, { status: 409 });

  if (body.action === "decline") {
    const reason = String(body.reason || "").slice(0, 500) || null;
    await adminClient().from("tms_sign_recipients").update({ status: "declined", declined_reason: reason, ip, user_agent: ua }).eq("id", me.id);
    await adminClient().from("tms_sign_requests").update({ status: "declined" }).eq("id", request.id);
    await logEvent({ request_id: request.id, recipient_id: me.id, action: "declined", detail: reason, ip, user_agent: ua });
    return NextResponse.json({ ok: true, status: "declined" });
  }

  if (body.action !== "sign") return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  if (!body.agree) return NextResponse.json({ error: "Please agree to sign electronically." }, { status: 400 });
  const mine = request.fields.filter((f) => f.role === me.role);
  const values: Record<string, string> = {};
  for (const f of mine) {
    const raw = body.values?.[f.id];
    const v = typeof raw === "string" ? raw.slice(0, f.type === "signature" || f.type === "initials" ? 600_000 : 2000) : "";
    if ((f.type === "signature" || f.type === "initials") && v && !v.startsWith("data:image/png;base64,")) return NextResponse.json({ error: `"${f.label}" isn't a valid signature` }, { status: 400 });
    if (f.required && isEmpty(f, v)) return NextResponse.json({ error: `Please fill in "${f.label}"` }, { status: 400 });
    if (v) values[f.id] = v;
  }
  const signedAt = new Date().toISOString();
  await adminClient().from("tms_sign_recipients").update({ values, status: "signed", signed_at: signedAt, ip, user_agent: ua, viewed_at: me.viewed_at || signedAt }).eq("id", me.id);
  await logEvent({ request_id: request.id, recipient_id: me.id, action: "signed", ip, user_agent: ua });

  const fresh = await loadRequest(request.id);
  if (!fresh.req) return NextResponse.json({ ok: true, status: "signed" });
  const left = signersOf(fresh.recipients).filter((r) => r.status !== "signed");
  if (!left.length) {
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
