import { NextResponse, type NextRequest } from "next/server";
import { adminClient, adminConfigured } from "@/lib/server/admin";
import { carrierByDot, upsertCarrier, type CarrierInput } from "@/lib/server/carriers";
import { cloudOrigin } from "@/lib/server/handoff";

export const runtime = "nodejs";

// TOSS Lead Hunter → TOSS Cloud ("Send to TOSS" on a company page). Lead Hunter's server calls
// this with the signed-in person's access token (Authorization: Bearer …), like /api/handoff.
// Only TOSS Cloud team members can see or create carriers. Server to server only: no CORS.
//   GET  ?dot=123  → { company: { id, name } | null, url }
//   POST { dot, name, … } → creates the carrier, or fills in what's missing (same DOT)

const fail = (status: number, message: string) => NextResponse.json({ error: message }, { status });

/** The caller, if they're on the TOSS Cloud team. */
async function member(req: Request) {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token || !adminConfigured()) return null;
  const a = adminClient();
  const { data, error } = await a.auth.getUser(token);
  if (error || !data.user) return null;
  const { data: m } = await a.from("tms_members").select("user_id").eq("user_id", data.user.id).maybeSingle();
  return m ? data.user : null;
}

const openUrl = (req: Request, id: string) => `${cloudOrigin(req)}/fleet?company=${id}`;
const digits = (v: unknown) => String(v ?? "").replace(/\D/g, "") || null;
const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

export async function GET(req: NextRequest) {
  if (!(await member(req))) return fail(403, "No TOSS Cloud access");
  const dot = digits(req.nextUrl.searchParams.get("dot"));
  if (!dot) return fail(400, "No USDOT number");
  const c = await carrierByDot(adminClient(), dot);
  return NextResponse.json({ company: c ? { id: c.id, name: c.name } : null, url: c ? openUrl(req, c.id) : null }, { headers: { "cache-control": "no-store" } });
}

export async function POST(req: Request) {
  if (!(await member(req))) return fail(403, "No TOSS Cloud access");
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b) return fail(400, "Expected JSON");
  const input: CarrierInput = {
    contactId: null,
    type: null,
    dot: digits(b.dot),
    mc: digits(b.mc),
    name: text(b.name),
    dba: text(b.dba),
    ein: null,
    firstName: text(b.firstName),
    lastName: text(b.lastName),
    phone: text(b.phone),
    email: text(b.email)?.toLowerCase() ?? null,
    street: text(b.street),
    city: text(b.city),
    state: text(b.state)?.toUpperCase() ?? null,
    zip: text(b.zip),
    secondFirst: text(b.secondFirst),
    secondLast: text(b.secondLast),
    services: [],
    source: null,
    referredBy: null,
    soldBy: null,
  };
  if (!input.dot) return fail(400, "No USDOT number");
  if (!input.name) return fail(400, "No company name");
  const r = await upsertCarrier(adminClient(), input, "TOSS Lead Hunter");
  if (r.action === "failed") return fail(500, r.message);
  return NextResponse.json({ action: r.action, message: r.message, company: { id: r.companyId, name: input.name }, url: openUrl(req, r.companyId!) });
}
