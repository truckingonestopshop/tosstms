import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { adminClient, adminConfigured } from "@/lib/server/admin";
import { readCustomer, type GhlCustomer } from "@/lib/ghl";
import type { Company, ServiceInfo, Services } from "@/lib/types";

export const runtime = "nodejs";

/**
 * POST from a GoHighLevel workflow (trigger: Contact type changed to Customer; action: Webhook).
 * Address: /api/ghl/customer?key=<GHL_WEBHOOK_SECRET> (or header x-toss-key).
 * Creates the carrier, or fills in what's missing on the one it already is (same GHL contact or
 * same DOT). Never overwrites what the team typed, never deletes. Every call is logged in
 * tms_ghl_events.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.GHL_WEBHOOK_SECRET || "";
  const given = req.nextUrl.searchParams.get("key") || req.headers.get("x-toss-key") || "";
  if (!secret || given.length !== secret.length || !timingSafeEqual(Buffer.from(given), Buffer.from(secret))) {
    return NextResponse.json({ error: "Not allowed" }, { status: 401 });
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

  // Same GHL contact first, then the same DOT.
  let existing: Company | null = null;
  if (c.contactId) existing = ((await a.from("tms_companies").select("*").eq("ghl_contact_id", c.contactId).maybeSingle()).data as Company | null) ?? null;
  if (!existing) {
    const { data } = await a.from("tms_companies").select("*").eq("dot_number", c.dot).order("created_at").limit(1);
    existing = ((data || [])[0] as Company | undefined) ?? null;
  }

  try {
    if (!existing) {
      const { data, error } = await a.from("tms_companies").insert(newCompany(c)).select("id").single();
      if (error) return log("failed", error.message);
      return log("created", `Carrier created: ${c.name}`, data.id as string);
    }
    const patch = fillIn(existing, c);
    if (!Object.keys(patch).length) return log("unchanged", `Already in TOSS Cloud with these details: ${existing.name}`, existing.id);
    const { error } = await a.from("tms_companies").update(patch).eq("id", existing.id);
    if (error) return log("failed", error.message, existing.id);
    return log("updated", `Filled in: ${Object.keys(patch).join(", ")}`, existing.id);
  } catch (e) {
    return log("failed", (e as Error).message || "Unexpected error");
  }
}

/** Each sold service, checked, with where the sale came from. */
function services(c: GhlCustomer, current: Services = {}): Services {
  const out: Services = { ...current };
  for (const k of c.services) {
    if (out[k]?.on) continue;
    const s: ServiceInfo = { ...out[k], on: true };
    if (c.source && !s.source) s.source = c.source;
    if (c.referredBy && !s.referred_by) s.referred_by = c.referredBy;
    if (c.soldBy && !s.sold_by) s.sold_by = c.soldBy;
    out[k] = s;
  }
  return out;
}

function newCompany(c: GhlCustomer) {
  return {
    name: c.name!,
    dba_name: c.dba,
    ein: c.ein,
    dot_number: c.dot,
    mc_number: c.mc,
    street: c.street,
    city: c.city,
    state: c.state,
    zip: c.zip,
    contact_first_name: c.firstName,
    contact_last_name: c.lastName,
    contact_phone: c.phone,
    contact_email: c.email,
    secondary_first_name: c.secondFirst,
    secondary_last_name: c.secondLast,
    services: services(c),
    ghl_contact_id: c.contactId,
    status: "active",
    // Dispatch terms start blank: the team fills them in (same as a new carrier from the form).
    commission_percent: 0,
    notes: `Added from GoHighLevel on ${new Date().toISOString().slice(0, 10)}.`,
    created_by: null,
  };
}

/** Only what's empty on the carrier, plus services it doesn't have yet. */
function fillIn(row: Company, c: GhlCustomer) {
  const patch: Record<string, unknown> = {};
  const fill = (key: keyof Company, v: string | null) => {
    if (v && !(row[key] as string | null | undefined)) patch[key] = v;
  };
  fill("dba_name", c.dba);
  fill("ein", c.ein);
  fill("mc_number", c.mc);
  fill("contact_phone", c.phone);
  fill("contact_email", c.email);
  fill("secondary_first_name", c.secondFirst);
  fill("secondary_last_name", c.secondLast);
  if (!row.contact_first_name && !row.contact_last_name && !row.contact_name) {
    fill("contact_first_name", c.firstName);
    fill("contact_last_name", c.lastName);
  }
  // The address only when the carrier has none at all (parts belong together).
  if (!row.street && !row.city && !row.state && !row.zip && !row.address) {
    fill("street", c.street);
    fill("city", c.city);
    fill("state", c.state);
    fill("zip", c.zip);
  }
  if (!row.ghl_contact_id && c.contactId) patch.ghl_contact_id = c.contactId;
  const next = services(c, row.services ?? {});
  if (JSON.stringify(next) !== JSON.stringify(row.services ?? {})) patch.services = next;
  return patch;
}
