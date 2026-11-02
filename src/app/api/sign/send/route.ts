import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { adminClient, adminConfigured } from "@/lib/server/admin";
import { emailConfigured } from "@/lib/server/email";
import { loadRequest, logEvent, sendNow } from "@/lib/server/signing";
import { isEmpty, signersOf } from "@/lib/signing";

export const runtime = "nodejs";

/**
 * POST { requestId, reminder? }: sends a request's signing links (by email when it's set up) and
 * returns each link so it can also be copied or texted. A reminder re-sends to whoever hasn't
 * signed yet. Only TOSS Cloud members (the request must be readable with their own login).
 */
export async function POST(req: NextRequest) {
  const { requestId, reminder } = (await req.json().catch(() => ({}))) as { requestId?: string; reminder?: boolean };
  if (!requestId) return NextResponse.json({ error: "Missing request" }, { status: 400 });
  const sb = await supabaseServer();
  const { data: user } = await sb.auth.getUser();
  const { data: visible } = await sb.from("tms_sign_requests").select("id").eq("id", requestId).maybeSingle();
  if (!user.user || !visible) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  if (!adminConfigured()) return NextResponse.json({ error: "Server not set up (SUPABASE_SECRET_KEY)" }, { status: 503 });

  const { req: request, recipients } = await loadRequest(requestId);
  if (!request) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (request.status !== "draft" && request.status !== "sent") return NextResponse.json({ error: "This document isn't waiting for signatures" }, { status: 409 });
  const signers = signersOf(recipients);
  if (!signers.length) return NextResponse.json({ error: "Add at least one signer" }, { status: 400 });
  const missingRole = request.roles.find((r) => !signers.some((s) => s.role === r.key) && request.fields.some((f) => f.role === r.key));
  if (missingRole) return NextResponse.json({ error: `Who is "${missingRole.label}"? Add that signer.` }, { status: 400 });
  const tossMissing = request.fields.find((f) => f.role === "toss" && f.required && isEmpty(f, request.values[f.id]));
  if (tossMissing) return NextResponse.json({ error: `Fill in "${tossMissing.label}" before sending` }, { status: 400 });

  const { data: me } = await sb.from("tms_members").select("full_name").eq("user_id", user.user.id).maybeSingle();
  const actor = (me as { full_name?: string } | null)?.full_name || user.user.email || "TOSS";
  if (request.status === "draft") {
    await adminClient().from("tms_sign_requests").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", request.id);
    await logEvent({ request_id: request.id, action: "created", detail: `${request.title} sent by ${actor}`, actor_name: actor });
  }
  const sent = await sendNow(request, recipients, req.nextUrl.origin, { reminder: !!reminder, actor });
  return NextResponse.json({ ok: true, emailReady: emailConfigured(), sent });
}
