import { NextResponse, type NextRequest } from "next/server";
import { requireMember } from "@/lib/supabase/server";
import { routeStops, type StopQuery } from "@/lib/server/mapbox";

export const runtime = "nodejs";

/**
 * POST { stops: [{address, city, state, zip}], from?: {city, state, zip} }
 * → loaded miles, legs per stop, the route line, and the deadhead leg from `from`.
 */
export async function POST(req: NextRequest) {
  if (!(await requireMember())) return NextResponse.json({ error: "Not allowed" }, { status: 401 });
  let body: { stops?: StopQuery[]; from?: StopQuery | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const stops = (body.stops || []).filter((s) => s && (s.city || s.zip || s.address));
  if (stops.length < 1 || (stops.length < 2 && !body.from)) return NextResponse.json({ error: "Need at least two stops with a city or ZIP" }, { status: 400 });
  try {
    return NextResponse.json(await routeStops(stops, body.from));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || "Routing failed" }, { status: 502 });
  }
}
