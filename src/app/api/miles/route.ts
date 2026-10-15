import { NextResponse, type NextRequest } from "next/server";
import { requireMember } from "@/lib/supabase/server";
import { routeStops, type StopQuery } from "@/lib/server/mapbox";

export const runtime = "nodejs";

/** POST { stops: [{address, city, state, zip}] } → highway miles, legs and the route line. */
export async function POST(req: NextRequest) {
  if (!(await requireMember())) return NextResponse.json({ error: "Not allowed" }, { status: 401 });
  let body: { stops?: StopQuery[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const stops = (body.stops || []).filter((s) => s && (s.city || s.zip || s.address));
  if (stops.length < 2) return NextResponse.json({ error: "Need at least two stops with a city or ZIP" }, { status: 400 });
  try {
    const r = await routeStops(stops);
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || "Routing failed" }, { status: 502 });
  }
}
