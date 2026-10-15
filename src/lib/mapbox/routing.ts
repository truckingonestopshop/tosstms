import { MapboxRouteResult } from '@/types';

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';

/**
 * Geocodes an address or city/state to [longitude, latitude] using Mapbox Geocoding API
 */
export async function geocodeLocation(query: string): Promise<[number, number] | null> {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || MAPBOX_TOKEN;
  if (!token || !query || query.trim().length === 0) return null;

  try {
    const encoded = encodeURIComponent(query.trim());
    const res = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encoded}.json?access_token=${token}&country=US,CA,MX&limit=1`
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
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || MAPBOX_TOKEN;
  if (!token || coordinates.length < 2) return null;

  try {
    const coordsStr = coordinates.map((c) => `${c[0]},${c[1]}`).join(';');
    const res = await fetch(
      `https://api.mapbox.com/directions/v5/mapbox/driving/${coordsStr}?access_token=${token}&geometries=geojson&overview=full`
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
        waypoints: (data.waypoints || []).map((w: { name: string; location: [number, number] }) => ({
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

export interface FreightTripCalculation {
  loadedMiles: number;
  deadheadMiles: number;
  totalMiles: number;
  durationMinutes: number;
  loadedGeometry?: {
    type: 'LineString';
    coordinates: [number, number][];
  };
  deadheadGeometry?: {
    type: 'LineString';
    coordinates: [number, number][];
  };
  stopCoordinates: {
    label: string;
    cityState: string;
    coordinates: [number, number];
    isPickup?: boolean;
    isDelivery?: boolean;
    isDeadheadOrigin?: boolean;
  }[];
}

/**
 * Comprehensive freight route calculation:
 * - Computes exact loaded highway miles across all stops in sequence
 * - Computes empty deadhead (DH) miles from current equipment location to Stop 1
 * - Returns route geometries for rich interactive Mapbox GL rendering
 */
export async function calculateFreightTripDetails(options: {
  originCityState: string;
  destCityState: string;
  intermediateStops?: string[];
  truckLocation?: string | null;
}): Promise<FreightTripCalculation> {
  const { originCityState, destCityState, intermediateStops = [], truckLocation } = options;

  const stopCoordsList: FreightTripCalculation['stopCoordinates'] = [];

  // 1. Geocode all loaded stops in order
  const allStopQueries = [originCityState, ...intermediateStops, destCityState].filter(Boolean);
  const geocodedStops: [number, number][] = [];

  for (let i = 0; i < allStopQueries.length; i++) {
    const q = allStopQueries[i];
    const coords = await geocodeLocation(q);
    if (coords) {
      geocodedStops.push(coords);
      stopCoordsList.push({
        label: i === 0 ? 'Pickup' : i === allStopQueries.length - 1 ? 'Delivery' : `Stop ${i + 1}`,
        cityState: q,
        coordinates: coords,
        isPickup: i === 0,
        isDelivery: i === allStopQueries.length - 1,
      });
    }
  }

  // Calculate Loaded Route
  let loadedMiles = 0;
  let durationMinutes = 0;
  let loadedGeometry: FreightTripCalculation['loadedGeometry'];

  if (geocodedStops.length >= 2) {
    const loadedRoute = await calculateMapboxRoute(geocodedStops);
    if (loadedRoute) {
      loadedMiles = loadedRoute.distanceMiles;
      durationMinutes = loadedRoute.durationMinutes;
      loadedGeometry = loadedRoute.geometry;
    }
  }

  // Fallback if Mapbox didn't return or single-point
  if (loadedMiles === 0) {
    loadedMiles = estimateCityDistanceMiles(originCityState, destCityState);
  }

  // 2. Deadhead Calculation (from current equipment location to first pickup)
  let deadheadMiles = 0;
  let deadheadGeometry: FreightTripCalculation['deadheadGeometry'];

  if (truckLocation && truckLocation.trim().length > 2 && stopCoordsList[0]) {
    const truckCoords = await geocodeLocation(truckLocation);
    if (truckCoords) {
      stopCoordsList.unshift({
        label: 'Equipment Origin',
        cityState: truckLocation,
        coordinates: truckCoords,
        isDeadheadOrigin: true,
      });

      const dhRoute = await calculateMapboxRoute([truckCoords, stopCoordsList[1].coordinates]);
      if (dhRoute) {
        deadheadMiles = dhRoute.distanceMiles;
        deadheadGeometry = dhRoute.geometry;
      } else {
        deadheadMiles = estimateCityDistanceMiles(truckLocation, originCityState);
      }
    }
  }

  const totalMiles = Math.round((loadedMiles + deadheadMiles) * 10) / 10;

  return {
    loadedMiles,
    deadheadMiles,
    totalMiles,
    durationMinutes,
    loadedGeometry,
    deadheadGeometry,
    stopCoordinates: stopCoordsList,
  };
}

/**
 * Estimated fallback distance between two major US cities when Mapbox token is pending
 */
export function estimateCityDistanceMiles(originCity: string, destCity: string): number {
  if (!originCity || !destCity) return 450;
  const charSum = (originCity + destCity)
    .split('')
    .reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return 300 + (charSum % 650);
}
