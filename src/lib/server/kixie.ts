import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

// Kixie (calls and texts). https://www.kixie.com/developer-api/
//
// KIXIE_API_KEY and KIXIE_BUSINESS_ID (Kixie → Manage → Account Settings → Edit All →
// Integrations) turn it on. The key belongs to the whole Kixie account, so it stays on the server.
// Kixie calls and texts as a Kixie user: each TOSS member's Kixie login email (tms_members.kixie_email,
// or their TOSS email).
//
// Webhooks (call ended, call outcome, texts) come back to /api/kixie/webhook with the header
// x-toss-key. Its value is KIXIE_WEBHOOK_SECRET, or by default a value derived from the API key,
// so no extra setting is needed.

const EVENT_URL = "https://apig.kixie.com/app/event";
const HOOKS_URL = "https://apig.kixie.com/app/v1/api";

export const kixieConfigured = () => !!(process.env.KIXIE_API_KEY?.trim() && process.env.KIXIE_BUSINESS_ID?.trim());

function creds() {
  const key = process.env.KIXIE_API_KEY?.trim() || "";
  const raw = process.env.KIXIE_BUSINESS_ID?.trim() || "";
  // Kixie's examples send the business id as a number
  const businessid = /^\d+$/.test(raw) ? Number(raw) : raw;
  return { key, businessid };
}

/** The value Kixie must send in x-toss-key (never shown to anyone). */
export function webhookSecret() {
  const own = process.env.KIXIE_WEBHOOK_SECRET?.trim();
  if (own) return own;
  const { key } = creds();
  return key ? createHmac("sha256", key).update("toss-kixie-webhook-v1").digest("hex") : "";
}

/** Whether a webhook call carries the right key (header x-toss-key, or ?key=). */
export function webhookAllowed(given: string | null | undefined) {
  const secret = webhookSecret();
  const g = (given || "").trim();
  return !!secret && g.length === secret.length && timingSafeEqual(Buffer.from(g), Buffer.from(secret));
}

/** Kixie's answer: null when it worked, or why it didn't. */
async function readResult(res: Response): Promise<string | null> {
  const text = await res.text().catch(() => "");
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    /* plain text */
  }
  const o = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const msg = String(o.msg || o.message || o.error || o.errorMessage || (typeof body === "string" ? body : "") || "").slice(0, 300);
  if (!res.ok) return msg || `Kixie said no (${res.status})`;
  if (o.success === false || o.status === "error" || o.error) return msg || "Kixie said no";
  return null;
}

async function automation(eventname: string, fields: Record<string, unknown>): Promise<string | null> {
  if (!kixieConfigured()) return "Kixie isn't set up (KIXIE_API_KEY, KIXIE_BUSINESS_ID)";
  const { key, businessid } = creds();
  try {
    const res = await fetch(`${EVENT_URL}?apikey=${encodeURIComponent(key)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ businessid, apikey: key, eventname, ...fields }),
      cache: "no-store",
    });
    return await readResult(res);
  } catch (e) {
    return e instanceof Error ? e.message : "Couldn't reach Kixie";
  }
}

/** Kixie rings the agent's phone / app first; when they pick up it dials the customer. */
export function makeCall(o: { agentEmail: string; target: string; displayName?: string }) {
  return automation("call", { email: o.agentEmail, target: o.target, displayname: o.displayName || o.target });
}

/** Sends a text from the agent's Kixie number. */
export function sendSms(o: { agentEmail: string; target: string; message: string }) {
  return automation("sms", { email: o.agentEmail, target: o.target, message: o.message });
}

// ---------------------------------------------------------------------------------------------
// Webhook registration (Kixie → TOSS)
// ---------------------------------------------------------------------------------------------

export interface KixieHook {
  webhookid?: string | number;
  /** Kixie's list answers with `event` and `webhookLocation` */
  event?: string;
  webhookLocation?: string;
  id?: string | number;
  name?: string;
  eventname?: string;
  location?: string;
  [k: string]: unknown;
}

async function hooksCall(path: string, call: string, fields: Record<string, unknown> = {}) {
  const { key, businessid } = creds();
  const res = await fetch(`${HOOKS_URL}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apikey: key, businessid, call, ...fields }),
    cache: "no-store",
  });
  const text = await res.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    /* plain text */
  }
  if (!res.ok) throw new Error(typeof body === "string" && body ? body.slice(0, 300) : `Kixie said no (${res.status})`);
  // Kixie answers 200 with { success: false, error } when it refuses
  const o = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  if (o.success === false) throw new Error(String(o.msg || o.error || o.message || "Kixie said no"));
  return body;
}

export async function listWebhooks(): Promise<KixieHook[]> {
  const body = await hooksCall("getWebhooks", "getWebhooks");
  if (Array.isArray(body)) return body as KixieHook[];
  const o = (body || {}) as Record<string, unknown>;
  for (const k of ["data", "webhooks", "result"]) if (Array.isArray(o[k])) return o[k] as KixieHook[];
  return [];
}

/** The events TOSS listens to, each its own Kixie webhook. */
export const TOSS_EVENTS = ["endcall", "disposition", "SMS", "answeredcall", "voicemail"] as const;
export const hookName = (event: string) => `TOSS Cloud ${event}`;

export async function createWebhook(event: string, location: string) {
  // the path is case-sensitive: "postwebhook" answers "function does not exist"
  return hooksCall("postWebhook", "postWebhook", {
    callresult: "all",
    direction: "all",
    disposition: "all",
    eventname: event,
    headers: JSON.stringify([{ name: "x-toss-key", value: webhookSecret() }]),
    location,
    name: hookName(event),
    runtime: "realtime",
  });
}

export async function removeWebhook(id: string | number) {
  return hooksCall("deleteWebhooks", "removeWebhook", { webhookid: id });
}
