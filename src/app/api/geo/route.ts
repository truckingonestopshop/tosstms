import { NextResponse, type NextRequest } from "next/server";
import { requireMember, supabaseServer } from "@/lib/supabase/server";
import { geocode, roadMiles } from "@/lib/server/mapbox";
import { splitPlace } from "@/lib/place";

export const runtime = "nodejs";

type Pt = [number, number];

/** "Chicago, IL 60607" → "chicago, il 60607" (cache key). */
const keyOf = (p: string) => p.trim().toLowerCase().replace(/\s+/g, " ");

/**
 * Truck Map.
 * POST { places: ["Chicago, IL", …] } → { points: { "Chicago, IL": [lng, lat] | null } }
 * POST { to: [lng, lat], from: [[lng, lat], …] } → { miles: (number | null)[] } (road miles)
 */
export async function POST(req: NextRequest) {
  if (!(await requireMember())) return NextResponse.json({ error: "Not allowed" }, { status: 401 });
  let body: { places?: string[]; to?: Pt; from?: Pt[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  if (body.to && Array.isArray(body.from)) {
    try {
      return NextResponse.json({
        miles: await roadMiles(body.to, body.from.slice(0, 96)),
      });
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message || "Road miles failed" }, { status: 502 });
    }
  }

  const places = [...new Set((body.places || []).map((p) => String(p || "").trim()).filter(Boolean))].slice(0, 300);
  const keys = places.map(keyOf);
  const sb = await supabaseServer();
  const points: Record<string, Pt | null> = {};
  // Saved points first; Mapbox only for places never looked up.
  const { data: saved } = keys.length ? await sb.from("tms_geo_cache").select("key,lng,lat").in("key", keys) : { data: [] };
  const byKey = new Map((saved || []).map((r) => [r.key as string, r.lng == null || r.lat == null ? null : ([r.lng, r.lat] as Pt)]));
  const fresh: { key: string; lng: number | null; lat: number | null }[] = [];
  await Promise.all(
    places.map(async (p, i) => {
      if (byKey.has(keys[i])) {
        points[p] = byKey.get(keys[i])!;
        return;
      }
      const x = splitPlace(p);
      const c = await geocode(x.city || x.state ? { city: x.city, state: x.state, zip: x.zip } : { zip: p });
      points[p] = c;
      // Only found places are saved: a miss may be a Mapbox hiccup, so it's tried again next time.
      if (c) fresh.push({ key: keys[i], lng: c[0], lat: c[1] });
    }),
  );
  if (fresh.length) await sb.from("tms_geo_cache").upsert(fresh);
  return NextResponse.json({ points });
}
