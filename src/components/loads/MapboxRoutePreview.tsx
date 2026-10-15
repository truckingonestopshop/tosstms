'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Load } from '@/types';
import { useTheme } from '@/lib/context/ThemeContext';
import { MapPin, Navigation, Clock, AlertCircle, Truck, ArrowRight } from 'lucide-react';
import { geocodeLocation, calculateMapboxRoute } from '@/lib/mapbox/routing';

interface MapboxRoutePreviewProps {
  load: Load & {
    route_geometry?: { type: 'LineString'; coordinates: [number, number][] };
    deadhead_geometry?: { type: 'LineString'; coordinates: [number, number][] };
  };
  className?: string;
  truckOriginCity?: string;
}

export function MapboxRoutePreview({ load, className = '', truckOriginCity }: MapboxRoutePreviewProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const { theme } = useTheme();
  const [tokenMissing, setTokenMissing] = useState(false);

  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

  const loadedMiles = load.loaded_miles || load.total_miles || 0;
  const deadheadMiles = load.deadhead_miles || 0;
  const totalTripMiles = load.total_miles || (loadedMiles + deadheadMiles);
  const estHours = Math.round((totalTripMiles / 55) * 10) / 10;
  const rpm = load.rate_per_mile || (load.gross_amount && loadedMiles > 0 ? load.gross_amount / loadedMiles : 0);

  useEffect(() => {
    if (!token) {
      setTokenMissing(true);
      return;
    }

    if (!mapContainer.current) return;

    let isMounted = true;

    async function loadMap() {
      try {
        const mapboxgl = (await import('mapbox-gl')).default;
        mapboxgl.accessToken = token!;

        const mapStyle = theme === 'dark' ? 'mapbox://styles/mapbox/dark-v11' : 'mapbox://styles/mapbox/light-v11';

        // 1. Geocode stops if route coordinates are not directly provided
        let originCoord: [number, number] | null = null;
        let destCoord: [number, number] | null = null;
        let truckCoord: [number, number] | null = null;

        const originQuery = `${load.origin_city}, ${load.origin_state}`;
        const destQuery = `${load.destination_city}, ${load.destination_state}`;

        const [oRes, dRes] = await Promise.all([
          geocodeLocation(originQuery),
          geocodeLocation(destQuery),
        ]);

        originCoord = oRes || [-87.6298, 41.8781];
        destCoord = dRes || [-84.388, 33.749];

        if (truckOriginCity) {
          truckCoord = await geocodeLocation(truckOriginCity);
        }

        if (!mapContainer.current) return;

        // Clean up previous map if exists
        if (mapInstance.current) {
          mapInstance.current.remove();
          mapInstance.current = null;
        }

        const map = new mapboxgl.Map({
          container: mapContainer.current,
          style: mapStyle,
          center: [(originCoord[0] + destCoord[0]) / 2, (originCoord[1] + destCoord[1]) / 2],
          zoom: 4.8,
        });

        map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');

        map.on('load', async () => {
          if (!isMounted) return;

          const bounds = new mapboxgl.LngLatBounds();
          bounds.extend(originCoord!);
          bounds.extend(destCoord!);
          if (truckCoord) bounds.extend(truckCoord);

          // A. Loaded Route Line
          let loadedCoords: [number, number][] = [originCoord!, destCoord!];
          if (load.route_geometry?.coordinates) {
            loadedCoords = load.route_geometry.coordinates;
          } else {
            // Fetch live driving route via Directions API
            const routeResult = await calculateMapboxRoute([originCoord!, destCoord!]);
            if (routeResult?.geometry?.coordinates) {
              loadedCoords = routeResult.geometry.coordinates;
            }
          }

          map.addSource('loaded-route', {
            type: 'geojson',
            data: {
              type: 'Feature',
              properties: {},
              geometry: {
                type: 'LineString',
                coordinates: loadedCoords,
              },
            },
          });

          map.addLayer({
            id: 'loaded-route-line',
            type: 'line',
            source: 'loaded-route',
            layout: {
              'line-join': 'round',
              'line-cap': 'round',
            },
            paint: {
              'line-color': '#F79B4D', // Brand TOSS Orange
              'line-width': 4.5,
              'line-opacity': 0.9,
            },
          });

          // B. Deadhead Route Line (if truck origin exists)
          if (truckCoord) {
            let dhCoords: [number, number][] = [truckCoord, originCoord!];
            if (load.deadhead_geometry?.coordinates) {
              dhCoords = load.deadhead_geometry.coordinates;
            } else {
              const dhResult = await calculateMapboxRoute([truckCoord, originCoord!]);
              if (dhResult?.geometry?.coordinates) {
                dhCoords = dhResult.geometry.coordinates;
              }
            }

            map.addSource('deadhead-route', {
              type: 'geojson',
              data: {
                type: 'Feature',
                properties: {},
                geometry: {
                  type: 'LineString',
                  coordinates: dhCoords,
                },
              },
            });

            map.addLayer({
              id: 'deadhead-route-line',
              type: 'line',
              source: 'deadhead-route',
              layout: {
                'line-join': 'round',
                'line-cap': 'round',
              },
              paint: {
                'line-color': '#8B5CF6', // Purple for Deadhead leg
                'line-width': 3.5,
                'line-dasharray': [2, 2],
                'line-opacity': 0.85,
              },
            });

            // Truck Origin Marker
            const elTruck = document.createElement('div');
            elTruck.className =
              'w-6 h-6 bg-purple-600 rounded-full border-2 border-white shadow-lg flex items-center justify-center text-white text-[10px] font-bold';
            elTruck.innerHTML = '🚚';
            new mapboxgl.Marker(elTruck)
              .setLngLat(truckCoord)
              .setPopup(new mapboxgl.Popup({ offset: 15 }).setHTML(`<strong>Equipment Location</strong><br/>${truckOriginCity}<br/><em>Deadhead: ${deadheadMiles} mi</em>`))
              .addTo(map);
          }

          // C. Pickup Marker (Green)
          const elOrigin = document.createElement('div');
          elOrigin.className =
            'w-6 h-6 bg-emerald-500 rounded-full border-2 border-white shadow-lg flex items-center justify-center text-white text-[10px] font-bold';
          elOrigin.innerText = '1';
          new mapboxgl.Marker(elOrigin)
            .setLngLat(originCoord!)
            .setPopup(new mapboxgl.Popup({ offset: 15 }).setHTML(`<strong>Pickup #1</strong><br/>${load.origin_city}, ${load.origin_state}<br/>${load.pickup_date}`))
            .addTo(map);

          // D. Delivery Marker (Orange)
          const elDest = document.createElement('div');
          elDest.className =
            'w-6 h-6 bg-brand-500 rounded-full border-2 border-white shadow-lg flex items-center justify-center text-white text-[10px] font-bold';
          elDest.innerText = load.stops && load.stops.length > 2 ? String(load.stops.length) : '2';
          new mapboxgl.Marker(elDest)
            .setLngLat(destCoord!)
            .setPopup(new mapboxgl.Popup({ offset: 15 }).setHTML(`<strong>Delivery</strong><br/>${load.destination_city}, ${load.destination_state}<br/>${load.delivery_date}`))
            .addTo(map);

          map.fitBounds(bounds, { padding: 45, maxZoom: 8 });
        });

        mapInstance.current = map;
      } catch (err) {
        console.warn('Mapbox GL rendering error:', err);
      }
    }

    loadMap();

    return () => {
      isMounted = false;
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
      }
    };
  }, [token, theme, load, truckOriginCity]);

  return (
    <div className={`relative rounded-xl overflow-hidden border border-border bg-card shadow-sm ${className}`}>
      {/* Route Header Info with Deadhead & RPM */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-card border-b border-border text-xs">
        <div className="flex items-center gap-2">
          {truckOriginCity && (
            <>
              <div className="flex items-center gap-1 font-semibold text-purple-400">
                <Truck className="h-3.5 w-3.5" />
                <span>{truckOriginCity}</span>
              </div>
              <span className="text-text-muted">⇢</span>
            </>
          )}
          <span className="font-semibold text-emerald-500">
            {load.origin_city}, {load.origin_state}
          </span>
          <ArrowRight className="h-3 w-3 text-text-muted" />
          <span className="font-semibold text-brand-500">
            {load.destination_city}, {load.destination_state}
          </span>
        </div>

        {/* Mileage KPI Badges */}
        <div className="flex flex-wrap items-center gap-2">
          {deadheadMiles > 0 && (
            <div className="px-2 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20 font-mono font-medium text-[11px]">
              DH: <span className="font-bold">{deadheadMiles}</span> mi
            </div>
          )}

          <div className="px-2 py-0.5 rounded bg-card-subtle border border-border text-text-main font-mono text-[11px]">
            Loaded: <span className="font-bold">{loadedMiles}</span> mi
          </div>

          <div className="px-2 py-0.5 rounded bg-brand-500/10 text-brand-500 border border-brand-500/20 font-mono text-[11px]">
            Trip: <span className="font-bold">{totalTripMiles}</span> mi
          </div>

          <div className="flex items-center gap-1 text-text-muted font-mono text-[11px]">
            <Clock className="h-3 w-3" />
            <span>~{estHours}h</span>
          </div>

          {rpm > 0 && (
            <div className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 font-bold font-mono text-[11px]">
              ${rpm.toFixed(2)}/mi
            </div>
          )}
        </div>
      </div>

      {/* Map Canvas / Token Warning */}
      <div className="relative w-full h-[280px] bg-card-subtle flex items-center justify-center">
        {tokenMissing ? (
          <div className="flex flex-col items-center justify-center p-6 text-center max-w-sm">
            <div className="w-10 h-10 rounded-full bg-brand-500/10 text-brand-500 flex items-center justify-center mb-2">
              <Navigation className="h-5 w-5" />
            </div>
            <h4 className="text-xs font-semibold text-text-main mb-1">Mapbox GL Route</h4>
            <p className="text-[11px] text-text-muted mb-2">
              {load.origin_city}, {load.origin_state} → {load.destination_city}, {load.destination_state} ({loadedMiles} mi)
            </p>
            <div className="text-[10px] px-2.5 py-1 rounded bg-card border border-border text-text-muted flex items-center gap-1.5">
              <AlertCircle className="h-3 w-3 text-brand-500" />
              <span>Token required in .env.local</span>
            </div>
          </div>
        ) : (
          <div ref={mapContainer} className="w-full h-full" />
        )}
      </div>
    </div>
  );
}
