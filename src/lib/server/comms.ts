import "server-only";
import { adminClient } from "@/lib/server/admin";
import { e164, prettyPhone } from "@/lib/phone";

/** The private documents bucket (same as the app's). */
const BUCKET = "tms-docs";

// The Inbox's server side: finds who a phone number or email belongs to, saves calls / texts /
// emails in tms_comms (one row per call or message, updated as Kixie sends more about it), puts
// them on the carrier's timeline, and keeps a copy of call recordings.

export type Channel = "call" | "sms" | "email";

export interface CommRow {
  id?: string;
  channel: Channel;
  direction: "inbound" | "outbound";
  contact: string;
  contact_name?: string | null;
  company_id?: string | null;
  our_address?: string | null;
  member_id?: string | null;
  agent_email?: string | null;
  subject?: string | null;
  body?: string | null;
  status?: string | null;
  duration_sec?: number | null;
  recording_url?: string | null;
  recording_path?: string | null;
  disposition?: string | null;
  outcome_note?: string | null;
  invoice_id?: string | null;
  sign_request_id?: string | null;
  external_id?: string | null;
  error?: string | null;
  raw?: unknown;
  read_at?: string | null;
  occurred_at?: string;
}

export interface Match {
  company_id: string | null;
  name: string | null;
  company_name: string | null;
  /** where the match came from (carrier contact, person, driver, earlier conversation) */
  via: string;
}

const db = () => adminClient();

/** Who a phone number belongs to: carrier contacts, then company people, then drivers, then the last conversation. */
export async function matchPhone(phone: string | null | undefined): Promise<Match | null> {
  const e = e164(phone);
  if (!e) return null;
  // the database keeps US numbers as "(310) 555-1234", but older or imported rows may be typed
  // "310-555-1234", "310.555.1234", "3105551234" or "+1 310 555 1234"
  const us = e.startsWith("+1") && e.length === 12 ? e.slice(2) : null;
  const forms = Array.from(
    new Set([
      prettyPhone(e),
      e,
      ...(us
        ? [us, `${us.slice(0, 3)}-${us.slice(3, 6)}-${us.slice(6)}`, `${us.slice(0, 3)}.${us.slice(3, 6)}.${us.slice(6)}`, `1${us}`, `+1 ${us.slice(0, 3)} ${us.slice(3, 6)} ${us.slice(6)}`, `(${us.slice(0, 3)})${us.slice(3, 6)}-${us.slice(6)}`]
        : []),
    ]),
  );
  const a = db();

  const { data: c1 } = await a.from("tms_companies").select("id, name, contact_name, contact_phone, secondary_phone, secondary_first_name, secondary_last_name").or(forms.flatMap((f) => [`contact_phone.eq.${q(f)}`, `secondary_phone.eq.${q(f)}`]).join(",")).limit(1);
  const c = c1?.[0] as { id: string; name: string; contact_name: string | null; contact_phone: string | null; secondary_first_name: string | null; secondary_last_name: string | null } | undefined;
  if (c) {
    const primary = forms.includes(c.contact_phone || "");
    const name = primary ? c.contact_name : [c.secondary_first_name, c.secondary_last_name].filter(Boolean).join(" ") || null;
    return { company_id: c.id, name: name || c.name, company_name: c.name, via: "carrier" };
  }

  const { data: p1 } = await a.from("tms_company_people").select("company_id, first_name, last_name, tms_companies(name)").in("phone", forms).limit(1);
  const p = p1?.[0] as unknown as { company_id: string; first_name: string; last_name: string; tms_companies: { name: string } | null } | undefined;
  if (p) return { company_id: p.company_id, name: `${p.first_name} ${p.last_name}`.trim() || null, company_name: p.tms_companies?.name ?? null, via: "person" };

  const { data: d1 } = await a.from("tms_drivers").select("company_id, name, tms_companies(name)").in("phone", forms).limit(1);
  const d = d1?.[0] as unknown as { company_id: string | null; name: string | null; tms_companies: { name: string } | null } | undefined;
  if (d) return { company_id: d.company_id, name: d.name, company_name: d.tms_companies?.name ?? null, via: "driver" };

  // someone already linked this number to a carrier by hand in the Inbox
  const { data: prev } = await a.from("tms_comms").select("company_id, contact_name, tms_companies(name)").eq("contact", e).not("company_id", "is", null).order("occurred_at", { ascending: false }).limit(1);
  const pr = prev?.[0] as unknown as { company_id: string; contact_name: string | null; tms_companies: { name: string } | null } | undefined;
  if (pr) return { company_id: pr.company_id, name: pr.contact_name, company_name: pr.tms_companies?.name ?? null, via: "inbox" };
  return null;
}

/** Who an email address belongs to. */
export async function matchEmail(email: string | null | undefined): Promise<Match | null> {
  const em = (email || "").trim().toLowerCase();
  if (!em) return null;
  const a = db();
  const { data: c1 } = await a.from("tms_companies").select("id, name, contact_name").or(`contact_email.ilike.${q(em)},secondary_email.ilike.${q(em)},factoring_email.ilike.${q(em)}`).limit(1);
  const c = c1?.[0] as { id: string; name: string; contact_name: string | null } | undefined;
  if (c) return { company_id: c.id, name: c.contact_name || c.name, company_name: c.name, via: "carrier" };
  const { data: p1 } = await a.from("tms_company_people").select("company_id, first_name, last_name, tms_companies(name)").ilike("email", em).limit(1);
  const p = p1?.[0] as unknown as { company_id: string; first_name: string; last_name: string; tms_companies: { name: string } | null } | undefined;
  if (p) return { company_id: p.company_id, name: `${p.first_name} ${p.last_name}`.trim() || null, company_name: p.tms_companies?.name ?? null, via: "person" };
  const { data: prev } = await a.from("tms_comms").select("company_id, contact_name").eq("contact", em).not("company_id", "is", null).order("occurred_at", { ascending: false }).limit(1);
  const pr = prev?.[0] as { company_id: string; contact_name: string | null } | undefined;
  if (pr) return { company_id: pr.company_id, name: pr.contact_name, company_name: null, via: "inbox" };
  return null;
}

/** A value inside a PostgREST or() filter: quoted, so commas and parentheses don't break it. */
const q = (v: string) => `"${v.replace(/"/g, '\\"')}"`;

/** The TOSS member who uses this Kixie login / email. */
export async function memberByEmail(email: string | null | undefined) {
  const em = decodeURIComponent(email || "").trim().toLowerCase();
  if (!em) return null;
  const { data } = await db().from("tms_members").select("user_id, full_name, email, kixie_email").or(`kixie_email.ilike.${q(em)},email.ilike.${q(em)}`).limit(1);
  return (data?.[0] as { user_id: string; full_name: string; email: string; kixie_email: string | null } | undefined) ?? null;
}

/**
 * Saves a call / text / email. With an external id (Kixie call id, message id, Resend id) the
 * row is updated when it already exists, so the call-ended and call-outcome webhooks fill in the
 * same row. Fields left undefined keep what's there. Returns the row and whether it's new.
 */
export async function saveComm(row: CommRow): Promise<{ id: string; created: boolean; company_id: string | null } | null> {
  const a = db();
  const clean = Object.fromEntries(Object.entries(row).filter(([, v]) => v !== undefined)) as CommRow;
  if (clean.external_id) {
    const { data: found } = await a.from("tms_comms").select("id, company_id").eq("channel", clean.channel).eq("external_id", clean.external_id).maybeSingle();
    if (found) {
      // a match found later (or by hand) is kept; a new one fills an empty company
      const patch = { ...clean } as Record<string, unknown>;
      if (found.company_id) delete patch.company_id;
      delete patch.channel;
      const { error } = await a.from("tms_comms").update(patch).eq("id", found.id);
      if (error) console.error("tms_comms update", error.message);
      return { id: found.id as string, created: false, company_id: (found.company_id as string | null) ?? clean.company_id ?? null };
    }
  }
  const { data, error } = await a.from("tms_comms").insert(clean).select("id, company_id").single();
  if (error) {
    // the other webhook for the same call won the race: update instead
    if (error.code === "23505" && clean.external_id) return saveComm(row);
    console.error("tms_comms insert", error.message);
    return null;
  }
  return { id: data.id as string, created: true, company_id: (data.company_id as string | null) ?? null };
}

/** A line on the carrier's timeline. */
export async function timeline(companyId: string | null | undefined, kind: Channel, message: string, actor?: string | null) {
  if (!companyId) return;
  const { error } = await db().from("tms_company_events").insert({ company_id: companyId, kind, message, actor_name: actor || null, actor_id: null });
  if (error) console.error("company event", error.message);
}

/** Copies a Kixie recording into TOSS (tms-docs bucket). Returns its path, or null. */
export async function keepRecording(url: string | null | undefined, callId: string): Promise<string | null> {
  if (!url || !/^https:\/\//i.test(url)) return null;
  const path = `calls/${callId.replace(/[^\w.-]/g, "_")}.mp3`;
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.byteLength < 512) return null; // not a recording (an error page)
    const { error } = await db().storage.from(BUCKET).upload(path, bytes, { contentType: res.headers.get("content-type") || "audio/mpeg", upsert: true });
    if (error) {
      console.error("recording upload", error.message);
      return null;
    }
    return path;
  } catch (e) {
    console.error("recording copy", e instanceof Error ? e.message : e);
    return null;
  }
}

/** "2m 05s" */
export function talkTime(sec: number | null | undefined) {
  const s = Math.max(0, Math.round(Number(sec) || 0));
  return s >= 60 ? `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s` : `${s}s`;
}
