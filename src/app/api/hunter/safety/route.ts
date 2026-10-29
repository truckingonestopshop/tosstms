import { NextResponse, type NextRequest } from "next/server";
import { requireMember, supabaseServer } from "@/lib/supabase/server";
import type { FmcsaSafety } from "@/lib/types";

export const runtime = "nodejs";

// A carrier's FMCSA safety picture from TOSS Lead Hunter (its API holds every FMCSA dataset):
// safety rating, SMS BASIC measures and alerts, 24-month inspections / out-of-service rates against
// the national averages, and crashes. GET ?dot=123. Called with the signed-in person's session,
// which the Lead Hunter API accepts (same TOSS sign-in).

const fail = (status: number, message: string) => NextResponse.json({ error: message }, { status });

type Row = Record<string, unknown>;
const n = (v: unknown) => (v === null || v === undefined || v === "" || Number.isNaN(Number(v)) ? null : Number(v));
const s = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

/** Lead Hunter's SMS category codes → the BASICs on the DOT Compliance tab. */
const BASIC: Record<string, string> = {
  unsafe_driv: "unsafe_driving",
  hos_driv: "hos",
  driv_fit: "driver_fitness",
  contr_subst: "drugs_alcohol",
  veh_maint: "vehicle_maintenance",
};

const RATING: Record<string, string> = { S: "Satisfactory", C: "Conditional", U: "Unsatisfactory", N: "Not rated" };

export async function GET(req: NextRequest) {
  if (!(await requireMember())) return fail(403, "No TOSS Cloud access");
  const dot = (req.nextUrl.searchParams.get("dot") || "").replace(/\D/g, "");
  if (!dot) return fail(400, "No USDOT number");
  const base = process.env.TOSS_API_URL;
  if (!base) return fail(503, "Lead Hunter isn't connected yet (TOSS_API_URL is not set)");
  const { data } = await (await supabaseServer()).auth.getSession();
  const token = data.session?.access_token;
  if (!token) return fail(401, "Sign in again");

  const res = await fetch(`${base.replace(/\/$/, "")}/v1/leads/${dot}/profile`, { headers: { authorization: `Bearer ${token}` }, cache: "no-store" }).catch(() => null);
  if (!res) return fail(502, "Couldn't reach Lead Hunter");
  if (res.status === 404) return fail(404, "Lead Hunter has no carrier with this USDOT number");
  if (!res.ok) return fail(502, `Lead Hunter answered ${res.status}`);
  const p = (await res.json()) as { lead: Row; safety24m: Row | null; nationalAverages: Row[]; crashSummary24m: Row | null; smsMeasures: Row[] };

  // The newest SMS file's measure for each BASIC.
  const basics: FmcsaSafety["basics"] = {};
  const latest = [...(p.smsMeasures || [])].sort((a, b) => String(a.file).localeCompare(String(b.file)));
  for (const m of latest) {
    const key = BASIC[String(m.code)];
    if (key) basics[key] = { measure: n(m.measure), alert: m.alert === true || m.alert === "Y" || m.alert === "y", inspections_with_violation: n(m.inspectionsWithViolation) };
  }
  const sf = p.safety24m || {};
  const rate = (oos: unknown, total: unknown) => (n(total) ? Math.round(((n(oos) || 0) / n(total)!) * 1000) / 10 : null);
  const nat = (kind: string) => n(p.nationalAverages?.find((x) => String(x.kind).toLowerCase().includes(kind))?.pct);
  const cr = p.crashSummary24m || {};
  const ratingRaw = s(p.lead?.safetyRating);
  const out: FmcsaSafety = {
    pulled_at: new Date().toISOString(),
    rating: ratingRaw ? (RATING[ratingRaw.toUpperCase()] ?? ratingRaw) : null,
    rating_date: s(p.lead?.safetyRatingDate),
    inspections_24m: n(sf.totalInspections),
    driver_inspections: n(sf.driverInspections),
    driver_oos_rate: rate(sf.driverOos, sf.driverInspections),
    driver_oos_national: nat("driver"),
    vehicle_inspections: n(sf.vehicleInspections),
    vehicle_oos_rate: rate(sf.vehicleOos, sf.vehicleInspections),
    vehicle_oos_national: nat("vehicle"),
    crashes_24m: n(cr.total),
    crashes_fatal: n(cr.fatal),
    crashes_injury: n(cr.injury),
    crashes_tow: n(cr.towAway),
    last_inspection: s(p.lead?.lastInspectionDate),
    basics,
  };
  return NextResponse.json(out, { headers: { "cache-control": "no-store" } });
}
