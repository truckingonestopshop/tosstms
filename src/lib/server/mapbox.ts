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

export interface Leg {
  miles: number;
  minutes: number;
}

export interface RouteResult {
  /** loaded miles through every stop */
  miles: number;
  minutes: number;
  /** legs[i] = stop i → stop i+1 (0 when either end couldn't be found) */
  legs: Leg[];
  /** [lng, lat] per stop that was found, in order */
  points: ([number, number] | null)[];
  /** route line, [lng, lat][] */
  line: [number, number][];
  /** index in `line` closest to each stop (null when not found) */
  breaks: (number | null)[];
  /** empty miles from where the truck is to the first stop */
  deadhead: (Leg & { point: [number, number] | null; line: [number, number][] }) | null;
}

type Drive = { distance: number; duration: number; legs: { distance: number; duration: number }[]; line: [number, number][]; waypoints: [number, number][] };

const geoCache = new Map<string, [number, number] | null>();
const driveCache = new Map<string, Drive>();

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

/** One Mapbox Directions call through the given points (cached). */
async function drive(pts: [number, number][]): Promise<Drive | null> {
  const key = pts.map((p) => p.map((n) => n.toFixed(4)).join(",")).join(";");
  const hit = driveCache.get(key);
  if (hit) return hit;
  const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${key}?geometries=geojson&overview=full&access_token=${TOKEN}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`Routing failed (${res.status})`);
  const data = await res.json();
  const r = data?.routes?.[0];
  if (!r) return null;
  const full: [number, number][] = r.geometry?.coordinates || [];
  // The full line follows the road exactly; thin it so the browser gets a light payload.
  const step = Math.max(1, Math.ceil(full.length / 1500));
  const line = full.filter((_, i) => i % step === 0 || i === full.length - 1);
  const out: Drive = {
    distance: r.distance,
    duration: r.duration,
    legs: (r.legs || []).map((l: { distance: number; duration: number }) => ({ distance: l.distance, duration: l.duration })),
    line,
    waypoints: (data.waypoints || []).map((w: { location: [number, number] }) => w.location),
  };
  if (driveCache.size > 500) driveCache.clear();
  driveCache.set(key, out);
  return out;
}

const toLeg = (meters: number, seconds: number): Leg => ({ miles: Math.round(meters / METERS_PER_MILE), minutes: Math.round(seconds / 60) });

/** Index of the line vertex nearest to p, searching forward from `from` so stops stay in order. */
function nearest(line: [number, number][], p: [number, number], from: number) {
  let best = from;
  let bestD = Infinity;
  const k = Math.cos((p[1] * Math.PI) / 180);
  for (let i = from; i < line.length; i++) {
    const dx = (line[i][0] - p[0]) * k;
    const dy = line[i][1] - p[1];
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/**
 * Driving route through every stop in order, plus the empty (deadhead) leg from
 * `from` to the first stop when given. Legs stay matched to their stops even when a
 * stop in the middle can't be found.
 */
export async function routeStops(stops: StopQuery[], from?: StopQuery | null): Promise<RouteResult> {
  if (!TOKEN) throw new Error("Mapbox token is not configured");
  const list = stops.slice(0, 25);
  const hasFrom = !!from && !!(from.city || from.zip || from.address);
  const [points, origin] = await Promise.all([Promise.all(list.map(geocode)), hasFrom ? geocode(from!) : Promise.resolve(null)]);
  const idx = points.map((p, i) => (p ? i : -1)).filter((i) => i >= 0);

  const [loaded, dh] = await Promise.all([
    idx.length >= 2 ? drive(idx.map((i) => points[i]!)) : Promise.resolve(null),
    origin && idx.length ? drive([origin, points[idx[0]]!]).catch(() => null) : Promise.resolve(null),
  ]);

  const out: RouteResult = {
    miles: 0,
    minutes: 0,
    legs: list.slice(1).map(() => ({ miles: 0, minutes: 0 })),
    points,
    line: [],
    breaks: points.map(() => null),
    deadhead: null,
  };
  if (loaded) {
    out.miles = Math.round(loaded.distance / METERS_PER_MILE);
    out.minutes = Math.round(loaded.duration / 60);
    out.line = loaded.line;
    // Leg j joins found stops idx[j] → idx[j+1]; it is listed on the stop it arrives at.
    loaded.legs.forEach((l, j) => {
      if (idx[j + 1] !== undefined) out.legs[idx[j + 1] - 1] = toLeg(l.distance, l.duration);
    });
    let at = 0;
    idx.forEach((stopI, j) => {
      at = nearest(loaded.line, loaded.waypoints[j] || points[stopI]!, at);
      out.breaks[stopI] = at;
    });
  }
  if (origin) {
    // Under half a mile apart = the truck is already there.
    const meters = dh && dh.distance >= 800 ? dh.distance : 0;
    out.deadhead = { ...toLeg(meters, meters ? dh!.duration : 0), point: origin, line: meters ? dh!.line : [] };
  }
  return out;
}

const suggestCache = new Map<string, string[]>();

/** Cities and ZIPs matching what's typed so far, as "City, ST" / "City, ST 12345" (US, Canada, Mexico). */
export async function suggestPlaces(q: string): Promise<string[]> {
  const text = q.trim();
  if (text.length < 2 || !TOKEN) return [];
  const key = text.toLowerCase();
  const hit = suggestCache.get(key);
  if (hit) return hit;
  const url = `https://api.mapbox.com/search/geocode/v6/forward?q=${encodeURIComponent(text)}&country=us,ca,mx&types=place,postcode&autocomplete=true&limit=10&access_token=${TOKEN}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return [];
    const data = await res.json();
    type Ctx = { place?: { name?: string }; region?: { region_code?: string; name?: string } };
    const feats: { properties?: { name?: string; feature_type?: string; context?: Ctx } }[] = data?.features || [];
    const out: string[] = [];
    for (const f of feats) {
      const p = f.properties;
      const st = p?.context?.region?.region_code || p?.context?.region?.name || "";
      const label =
        p?.feature_type === "postcode" ? [p.context?.place?.name, [st, p.name].filter(Boolean).join(" ")].filter(Boolean).join(", ") : [p?.name, st].filter(Boolean).join(", ");
      if (label && !out.includes(label)) out.push(label);
    }
    if (suggestCache.size > 1000) suggestCache.clear();
    if (out.length) suggestCache.set(key, out);
    return out;
  } catch {
    return [];
  }
}
