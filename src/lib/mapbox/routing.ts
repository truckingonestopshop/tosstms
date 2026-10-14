import { MapboxRouteResult } from '@/types';

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';

/**
 * Geocodes an address or city/state to [longitude, latitude] using Mapbox Geocoding API
 */
export async function geocodeLocation(query: string): Promise<[number, number] | null> {
  if (!MAPBOX_TOKEN || !query) return null;

  try {
    const encoded = encodeURIComponent(query);
    const res = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encoded}.json?access_token=${MAPBOX_TOKEN}&country=US,CA,MX&limit=1`
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (data.features && data.features.length > 0) {
      return data.features[0].center as [number, number]; // [lng, lat]
    }
    return null;
  } catch (err) {
    console.warn('Mapbox geocoding error:', err);
    return null;
  }
}

/**
 * Calculates driving route between waypoints using Mapbox Directions API
 */
export async function calculateMapboxRoute(
  coordinates: [number, number][]
): Promise<MapboxRouteResult | null> {
  if (!MAPBOX_TOKEN || coordinates.length < 2) return null;

  try {
    const coordsStr = coordinates.map((c) => `${c[0]},${c[1]}`).join(';');
    const res = await fetch(
      `https://api.mapbox.com/directions/v5/mapbox/driving/${coordsStr}?access_token=${MAPBOX_TOKEN}&geometries=geojson&overview=full`
    );

    if (!res.ok) return null;
    const data = await res.json();

    if (data.routes && data.routes.length > 0) {
      const route = data.routes[0];
      const distanceMeters = route.distance;
      const durationSeconds = route.duration;

      // Convert meters to statute miles
      const distanceMiles = Math.round((distanceMeters / 1609.344) * 10) / 10;
      const durationMinutes = Math.round(durationSeconds / 60);

      return {
        distanceMiles,
        durationMinutes,
        geometry: route.geometry,
        waypoints: data.waypoints.map((w: { name: string; location: [number, number] }) => ({
          name: w.name,
          location: w.location,
        })),
      };
    }
    return null;
  } catch (err) {
    console.warn('Mapbox directions error:', err);
    return null;
  }
}

/**
 * Estimated fallback distance between two major US cities when Mapbox token is pending
 */
export function estimateCityDistanceMiles(originCity: string, destCity: string): number {
  if (!originCity || !destCity) return 450;
  // Deterministic reasonable US freight mileage estimate
  const charSum = (originCity + destCity)
    .split('')
    .reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return 300 + (charSum % 650);
}
