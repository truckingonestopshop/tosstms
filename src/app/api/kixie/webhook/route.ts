import { after, NextResponse, type NextRequest } from "next/server";
import { adminClient, adminConfigured } from "@/lib/server/admin";
import { webhookAllowed } from "@/lib/server/kixie";
import { keepRecording, matchPhone, memberByEmail, saveComm, talkTime, timeline } from "@/lib/server/comms";
import { e164 } from "@/lib/phone";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Kixie → TOSS (registered by Settings → Phone & Inbox → Connect Kixie, header x-toss-key).
 *   endcall       a call ended: who, how long, answered or missed, the recording
 *   answeredcall  a call was answered
 *   disposition   the agent picked the call outcome (and maybe a note)
 *   SMS           a text was sent or received
 *   voicemail     a voicemail was left
 * Every call is one row in tms_comms (keyed by Kixie's call id), every text one row (message id).
 * Recordings are copied into TOSS after answering Kixie.
 */

type Json = Record<string, unknown>;
const obj = (v: unknown): Json => (v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : {});
const s = (v: unknown) => (v === null || v === undefined ? null : String(v).trim() || null);
const when = (v: unknown) => {
  const t = s(v);
  if (!t) return undefined;
  // "2024-07-17 15:09:30" (no zone) is UTC in Kixie's examples
  const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(t) ? t : `${t.replace(" ", "T")}Z`);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
};
const dirOf = (v: unknown): "inbound" | "outbound" => (/^in/i.test(String(v || "")) ? "inbound" : "outbound");
/** Kixie's own placeholder when no outcome was picked yet. */
const realOutcome = (v: unknown) => {
  const t = s(v);
  return t && !/^not disposed$/i.test(t) ? t : null;
};

/** What's worth keeping of a payload (Kixie also sends CRM tokens and power-list internals). */
function slim(d: Json) {
  const { activeCRM: _a, powerlistContactDetails: _p, webhookHeaders: _h, ...rest } = d;
  return rest;
}

export async function POST(req: NextRequest) {
  if (!webhookAllowed(req.headers.get("x-toss-key") || req.nextUrl.searchParams.get("key"))) {
    return NextResponse.json({ error: "Not allowed" }, { status: 401 });
  }
  if (!adminConfigured()) return NextResponse.json({ error: "Server not set up (SUPABASE_SECRET_KEY)" }, { status: 503 });

  let payload: Json;
  try {
    payload = obj(await req.json());
  } catch {
    return NextResponse.json({ error: "Expected JSON" }, { status: 400 });
  }
  const d = Object.keys(obj(payload.data)).length ? obj(payload.data) : payload;
  const event = String(d.hookevent || payload.hookevent || "").toLowerCase();

  try {
    if (event === "sms") return NextResponse.json(await onSms(d));
    if (event === "disposition") return NextResponse.json(await onDisposition(d));
    if (["endcall", "answeredcall", "startcall", "voicemail"].includes(event)) return NextResponse.json(await onCall(d, event));
    return NextResponse.json({ ok: true, ignored: event || "unknown" });
  } catch (e) {
    console.error("kixie webhook", event, e);
    // 200 so Kixie doesn't keep retrying a payload TOSS can't read; the error is logged
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "failed" });
  }
}

async function onCall(d: Json, event: string) {
  const cd = { ...d, ...obj(d.callDetails) };
  const callId = s(cd.callid) || s(cd.externalid);
  if (!callId) return { ok: false, error: "no call id" };
  const direction = dirOf(cd.calltype);
  const contact = e164(s(d.customernumber) || (direction === "inbound" ? s(cd.fromnumber164) || s(cd.fromnumber) : s(cd.tonumber164) || s(cd.tonumber)) || s(d.number));
  if (!contact) return { ok: false, error: "no customer number" };

  const [match, member] = await Promise.all([matchPhone(contact), memberByEmail(s(cd.email))]);
  const name = [s(cd.fname), s(cd.lname)].filter(Boolean).join(" ") || null;
  const status = event === "voicemail" ? "voicemail" : event === "answeredcall" ? "answered" : event === "startcall" ? "ringing" : s(cd.callstatus);
  const duration = Number(cd.duration);
  const saved = await saveComm({
    channel: "call",
    direction,
    contact,
    contact_name: match?.name || name || s(cd.calleridName) || undefined,
    company_id: match?.company_id ?? undefined,
    our_address: s(d.businessnumber) || (direction === "inbound" ? s(cd.tonumber164) : s(cd.fromnumber164)) || undefined,
    member_id: member?.user_id,
    agent_email: s(cd.email) ? decodeURIComponent(s(cd.email)!) : undefined,
    status: status || undefined,
    duration_sec: Number.isFinite(duration) && cd.duration !== null && cd.duration !== "" ? duration : undefined,
    recording_url: s(cd.recordingurl) || undefined,
    disposition: realOutcome(cd.disposition) || undefined,
    external_id: callId,
    raw: slim(d),
    occurred_at: when(cd.calldate) || when(cd.answerDate),
    // missed incoming calls and voicemails are new for the team; calls we made aren't
    read_at: direction === "outbound" ? new Date().toISOString() : undefined,
  });
  if (!saved) return { ok: false, error: "not saved" };

  if (event === "endcall") {
    const agent = member?.full_name || null;
    const what = direction === "inbound" ? "Incoming call" : "Outgoing call";
    const result = status && /answer/i.test(status) ? `answered · ${talkTime(duration)}` : status || "ended";
    await timeline(saved.company_id, "call", `${what} ${contact.replace(/^\+1/, "")} · ${result}${agent ? ` · ${agent}` : ""}`, agent);
  }

  const url = s(cd.recordingurl);
  if (url && (event === "endcall" || event === "voicemail")) {
    after(async () => {
      const { data: row } = await adminClient().from("tms_comms").select("recording_path").eq("id", saved.id).maybeSingle();
      if (row?.recording_path) return;
      // Kixie may need a moment to finish the file
      for (const wait of [0, 8000, 20000]) {
        if (wait) await new Promise((r) => setTimeout(r, wait));
        const path = await keepRecording(url, callId);
        if (path) {
          await adminClient().from("tms_comms").update({ recording_path: path }).eq("id", saved.id);
          return;
        }
      }
    });
  }
  return { ok: true, id: saved.id };
}

async function onDisposition(d: Json) {
  const cd = obj(d.callDetails);
  const callId = s(cd.callid) || s(d.externalid) || s(cd.externalid) || s(d.callid);
  if (!callId) return { ok: false, error: "no call id" };
  const direction = dirOf(d.callType || cd.calltype);
  const contact = e164(s(d.phone) || (direction === "inbound" ? s(cd.fromnumber164) : s(cd.tonumber164)));
  if (!contact) return { ok: false, error: "no customer number" };
  const outcome = realOutcome(d.disposition) || realOutcome(cd.disposition);
  const note = [s(d.subject), s(d.purpose), s(d.note)].filter(Boolean).join(" · ") || null;

  const [match, member] = await Promise.all([matchPhone(contact), memberByEmail(s(cd.email))]);
  const saved = await saveComm({
    channel: "call",
    direction,
    contact,
    contact_name: match?.name || [s(cd.fname), s(cd.lname)].filter(Boolean).join(" ") || undefined,
    company_id: match?.company_id ?? undefined,
    member_id: member?.user_id,
    agent_email: s(cd.email) ? decodeURIComponent(s(cd.email)!) : undefined,
    disposition: outcome || undefined,
    outcome_note: note || undefined,
    recording_url: s(cd.recordingurl) || undefined,
    external_id: callId,
    occurred_at: when(cd.calldate),
  });
  if (!saved) return { ok: false, error: "not saved" };
  if (outcome || note) await timeline(saved.company_id, "call", `Call outcome: ${outcome || "Note"}${note ? ` · ${note}` : ""}`, member?.full_name);
  return { ok: true, id: saved.id };
}

async function onSms(d: Json) {
  const direction = dirOf(d.direction);
  const contact = e164(s(d.customernumber) || (direction === "inbound" ? s(d.from) : s(d.to)) || s(d.number));
  if (!contact) return { ok: false, error: "no customer number" };
  const messageId = s(d.messageid);
  const body = s(d.message) || "";
  const a = adminClient();

  // A text TOSS sent itself (Inbox, invoice, TossSign) is already saved: attach Kixie's id to it.
  if (direction === "outbound" && messageId) {
    const since = new Date(Date.now() - 15 * 60_000).toISOString();
    const { data: mine } = await a
      .from("tms_comms")
      .select("id")
      .eq("channel", "sms")
      .eq("direction", "outbound")
      .eq("contact", contact)
      .eq("body", body)
      .is("external_id", null)
      .gte("occurred_at", since)
      .order("occurred_at", { ascending: false })
      .limit(1);
    if (mine?.[0]) {
      await a.from("tms_comms").update({ external_id: messageId, status: "sent" }).eq("id", mine[0].id);
      return { ok: true, id: mine[0].id };
    }
  }

  const person = obj(obj(d.contact).contact);
  const [match, member] = await Promise.all([matchPhone(contact), memberByEmail(s(d.email))]);
  const saved = await saveComm({
    channel: "sms",
    direction,
    contact,
    contact_name: match?.name || s(person.name) || undefined,
    company_id: match?.company_id ?? undefined,
    our_address: s(d.businessnumber) || undefined,
    member_id: member?.user_id,
    agent_email: s(d.email) ? decodeURIComponent(s(d.email)!) : undefined,
    body,
    status: direction === "inbound" ? "received" : "sent",
    external_id: messageId,
    raw: slim(d),
    occurred_at: when(d.messageDate),
    read_at: direction === "outbound" ? new Date().toISOString() : undefined,
  });
  if (!saved) return { ok: false, error: "not saved" };
  if (saved.created) await timeline(saved.company_id, "sms", `${direction === "inbound" ? "Text received" : "Text sent"}: "${body.slice(0, 280)}"`, member?.full_name);
  return { ok: true, id: saved.id };
}
