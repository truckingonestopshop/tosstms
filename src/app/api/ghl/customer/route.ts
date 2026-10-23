import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { adminClient, adminConfigured } from "@/lib/server/admin";
import { readCustomer } from "@/lib/ghl";
import { upsertCarrier } from "@/lib/server/carriers";

export const runtime = "nodejs";

/**
 * POST from a GoHighLevel workflow (trigger: Contact type changed to Customer; action: Webhook).
 * Address: /api/ghl/customer?key=<GHL_WEBHOOK_SECRET> (or header x-toss-key).
 * Creates the carrier, or fills in what's missing on the one it already is (same GHL contact or
 * same DOT). Never overwrites what the team typed, never deletes. Every call is logged in
 * tms_ghl_events.
 */
/**
 * The key as pasted into Vercel, forgiving how it was copied: spaces, line breaks, quotes, a
 * leading "Value:" or "GHL_WEBHOOK_SECRET=", or the whole webhook URL with ?key=….
 */
function cleanKey(raw: string | undefined) {
  let k = (raw || "").trim().replace(/^["']|["']$/g, "").trim();
  const fromUrl = k.match(/[?&]key=([^&\s]+)/);
  if (fromUrl) k = decodeURIComponent(fromUrl[1]);
  k = k.replace(/^(value|ghl_webhook_secret)\s*[:=]\s*/i, "");
  return k.replace(/\s+/g, "");
}

export async function POST(req: NextRequest) {
  const secret = cleanKey(process.env.GHL_WEBHOOK_SECRET);
  const given = cleanKey(req.nextUrl.searchParams.get("key") || req.headers.get("x-toss-key") || "");
  if (!secret || given.length !== secret.length || !timingSafeEqual(Buffer.from(given), Buffer.from(secret))) {
    // Says whether the server has a key at all (never the key), so a missing setting is easy to spot.
    return NextResponse.json({ error: "Not allowed", serverKey: secret ? "set" : "missing" }, { status: 401 });
  }
  if (!adminConfigured()) return NextResponse.json({ error: "Server not set up (SUPABASE_SECRET_KEY)" }, { status: 503 });

  let payload: Record<string, unknown>;
  try {
    payload = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Expected JSON" }, { status: 400 });
  }

  const a = adminClient();
  const c = readCustomer(payload);
  const log = async (action: "created" | "updated" | "unchanged" | "skipped" | "failed", message: string, companyId: string | null = null) => {
    await a.from("tms_ghl_events").insert({ ghl_contact_id: c.contactId, dot_number: c.dot, action, company_id: companyId, message, payload });
    return NextResponse.json({ ok: action !== "failed", action, message, companyId }, { status: action === "failed" ? 500 : 200 });
  };

  if (c.type && c.type !== "customer") return log("skipped", `Contact type is "${c.type}", not Customer`);
  if (!c.dot) return log("skipped", "No DOT number on the contact");
  if (!c.name) return log("skipped", "No business name on the contact");

  try {
    const r = await upsertCarrier(a, c, "GoHighLevel");
    return log(r.action, r.message, r.companyId);
  } catch (e) {
    return log("failed", (e as Error).message || "Unexpected error");
  }
}
