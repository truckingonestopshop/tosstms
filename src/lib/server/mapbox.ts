import "server-only";

// Mapbox geocoding + driving directions for highway miles. Server-side so the
// results can be cached across users and requests.

const TOKEN = process.env.MAPBOX_TOKEN || process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";
const METERS_PER_MILE = 1609.344;

export interface StopQuery {
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
}

export interface RouteResult {
  miles: number;
  minutes: number;
  legs: { miles: number; minutes: number }[];
  /** [lng, lat] per stop that was found, in order */
  points: ([number, number] | null)[];
  /** route line, [lng, lat][] */
  line: [number, number][];
}

const geoCache = new Map<string, [number, number] | null>();
const routeCache = new Map<string, RouteResult>();

// Two-letter codes are ambiguous to the geocoder ("Glasgow, MO" came back as
// Glasgow, Montana), so queries use the full state/province name.
const REGIONS: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado", CT: "Connecticut",
  DE: "Delaware", DC: "District of Columbia", FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois",
  IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana",
  NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York",
  NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania",
  RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah",
  VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
  AB: "Alberta", BC: "British Columbia", MB: "Manitoba", NB: "New Brunswick", NL: "Newfoundland and Labrador",
  NS: "Nova Scotia", ON: "Ontario", PE: "Prince Edward Island", QC: "Quebec", SK: "Saskatchewan",
};

const code = (state?: string) => (state || "").trim().toUpperCase();

function queryText(s: StopQuery, precise: boolean) {
  const region = REGIONS[code(s.state)] || s.state;
  const cityState = [s.city, region].filter(Boolean).join(", ");
  if (precise && s.address) return [s.address, cityState, s.zip].filter(Boolean).join(", ");
  if (cityState) return [cityState, s.zip].filter(Boolean).join(" ");
  return s.zip || s.address || "";
}

interface Feature {
  geometry?: { coordinates?: [number, number] };
  properties?: { context?: { region?: { region_code?: string } } };
}

/** Best match, preferring one inside the requested state when a state was given. */
async function geocodeOne(q: string, state: string, types?: string): Promise<[number, number] | null> {
  const key = `${q.trim().toLowerCase()}|${state}|${types || ""}`;
  if (!q.trim()) return null;
  if (geoCache.has(key)) return geoCache.get(key)!;
  const url = `https://api.mapbox.com/search/geocode/v6/forward?q=${encodeURIComponent(q)}&country=us,ca,mx&limit=5${types ? `&types=${types}` : ""}&access_token=${TOKEN}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    const data = await res.json();
    const feats: Feature[] = data?.features || [];
    const inState = state && REGIONS[state] ? feats.find((f) => (f.properties?.context?.region?.region_code || "").toUpperCase() === state) : feats[0];
    const c = inState?.geometry?.coordinates;
    const out = c && c.length === 2 ? c : null;
    geoCache.set(key, out);
    return out;
  } catch {
    return null;
  }
}

/** Street address first (more exact), then city/state/zip. */
export async function geocode(s: StopQuery) {
  const st = code(s.state);
  if (s.address) {
    const p = await geocodeOne(queryText(s, true), st);
    if (p) return p;
  }
  // City stops: a real town first ("Yorkville, NY" is a village, not the Manhattan
  // neighborhood), then anything (ZIP-only or unusual places).
  if (s.city) {
    const town = await geocodeOne(queryText(s, false), st, "place,postcode");
    if (town) return town;
  }
  return geocodeOne(queryText(s, false), st);
}

/** Driving route through every stop in order. Returns null when fewer than 2 stops are found. */
export async function routeStops(stops: StopQuery[]): Promise<RouteResult | null> {
  if (!TOKEN) throw new Error("Mapbox token is not configured");
  const points = await Promise.all(stops.slice(0, 25).map(geocode));
  const found = points.filter((p): p is [number, number] => !!p);
  if (found.length < 2) return { miles: 0, minutes: 0, legs: [], points, line: [] };

  const key = found.map((p) => p.map((n) => n.toFixed(4)).join(",")).join(";");
  const cached = routeCache.get(key);
  if (cached) return { ...cached, points };

  const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${key}?geometries=geojson&overview=simplified&access_token=${TOKEN}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`Routing failed (${res.status})`);
  const data = await res.json();
  const r = data?.routes?.[0];
  if (!r) return { miles: 0, minutes: 0, legs: [], points, line: [] };
  const out: RouteResult = {
    miles: Math.round(r.distance / METERS_PER_MILE),
    minutes: Math.round(r.duration / 60),
    legs: (r.legs || []).map((l: { distance: number; duration: number }) => ({
      miles: Math.round(l.distance / METERS_PER_MILE),
      minutes: Math.round(l.duration / 60),
    })),
    points,
    line: r.geometry?.coordinates || [],
  };
  if (routeCache.size > 500) routeCache.clear();
  routeCache.set(key, out);
  return out;
}
