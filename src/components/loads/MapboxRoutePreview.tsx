'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Load } from '@/types';
import { useTheme } from '@/lib/context/ThemeContext';
import { MapPin, Navigation, Clock, AlertCircle } from 'lucide-react';

interface MapboxRoutePreviewProps {
  load: Load;
  className?: string;
}

export function MapboxRoutePreview({ load, className = '' }: MapboxRoutePreviewProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const { theme } = useTheme();
  const [tokenMissing, setTokenMissing] = useState(false);
  const [routeInfo, setRouteInfo] = useState<{ miles: number; hours: number } | null>(null);

  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

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

        // Approximate coordinates lookup for standard US hubs
        // (In live mode, geocodeLocation fetches exact lat/lng)
        const getApproxCoords = (city: string, state: string): [number, number] => {
          const c = city.toLowerCase();
          if (c.includes('chicago')) return [-87.6298, 41.8781];
          if (c.includes('atlanta')) return [-84.388, 33.749];
          if (c.includes('dallas')) return [-96.797, 32.7767];
          if (c.includes('houston')) return [-95.3698, 29.7604];
          if (c.includes('indianapolis')) return [-86.1581, 39.7684];
          if (c.includes('memphis')) return [-90.049, 35.1495];
          if (c.includes('milwaukee')) return [-87.9065, 43.0389];
          if (c.includes('savannah')) return [-81.0998, 32.0809];
          return [-95.7129, 37.0902]; // Center of US fallback
        };

        const originCoords = getApproxCoords(load.origin_city, load.origin_state);
        const destCoords = getApproxCoords(load.destination_city, load.destination_state);

        if (!mapInstance.current && mapContainer.current) {
          const map = new mapboxgl.Map({
            container: mapContainer.current,
            style: mapStyle,
            center: [
              (originCoords[0] + destCoords[0]) / 2,
              (originCoords[1] + destCoords[1]) / 2,
            ],
            zoom: 4.5,
          });

          map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');

          map.on('load', () => {
            if (!isMounted) return;

            // Draw line between origin and destination
            map.addSource('route', {
              type: 'geojson',
              data: {
                type: 'Feature',
                properties: {},
                geometry: {
                  type: 'LineString',
                  coordinates: [originCoords, destCoords],
                },
              },
            });

            map.addLayer({
              id: 'route',
              type: 'line',
              source: 'route',
              layout: {
                'line-join': 'round',
                'line-cap': 'round',
              },
              paint: {
                'line-color': '#F79B4D', // Signature TOSS Orange
                'line-width': 4,
                'line-dasharray': [2, 1],
              },
            });

            // Origin Marker (Green)
            const elOrigin = document.createElement('div');
            elOrigin.className = 'w-4 h-4 bg-emerald-500 rounded-full border-2 border-white shadow-md';
            new mapboxgl.Marker(elOrigin).setLngLat(originCoords).addTo(map);

            // Destination Marker (TOSS Orange)
            const elDest = document.createElement('div');
            elDest.className = 'w-4 h-4 bg-brand-500 rounded-full border-2 border-white shadow-md';
            new mapboxgl.Marker(elDest).setLngLat(destCoords).addTo(map);

            // Fit bounds
            const bounds = new mapboxgl.LngLatBounds(originCoords, destCoords);
            map.fitBounds(bounds, { padding: 50 });
          });

          mapInstance.current = map;
        } else if (mapInstance.current) {
          mapInstance.current.setStyle(mapStyle);
        }
      } catch (err) {
        console.warn('Mapbox GL initialization error:', err);
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
  }, [token, theme, load]);

  const miles = load.total_miles || load.loaded_miles || 680;
  const estHours = Math.round((miles / 55) * 10) / 10;

  return (
    <div className={`relative rounded-xl overflow-hidden border border-border bg-card ${className}`}>
      {/* Route Header Info */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-card border-b border-border text-sm">
        <div className="flex items-center gap-2">
          <Navigation className="h-4 w-4 text-brand-500 shrink-0" />
          <span className="font-semibold text-text-main">
            {load.origin_city}, {load.origin_state}
          </span>
          <span className="text-text-muted">→</span>
          <span className="font-semibold text-text-main">
            {load.destination_city}, {load.destination_state}
          </span>
        </div>
        <div className="flex items-center gap-4 text-xs font-medium text-text-muted">
          <div className="flex items-center gap-1">
            <span className="text-text-main font-bold tabular-nums">{miles}</span>
            <span>mi</span>
          </div>
          <div className="flex items-center gap-1">
            <Clock className="h-3.5 w-3.5 text-text-muted" />
            <span className="text-text-main font-bold tabular-nums">~{estHours}</span>
            <span>hrs</span>
          </div>
          {load.rate_per_mile && load.rate_per_mile > 0 && (
            <div className="text-emerald-500 font-bold tabular-nums">
              ${load.rate_per_mile.toFixed(2)}/mi
            </div>
          )}
        </div>
      </div>

      {/* Map Canvas / Fallback Container */}
      <div className="relative w-full h-[280px] bg-card-subtle flex items-center justify-center">
        {tokenMissing ? (
          <div className="flex flex-col items-center justify-center p-6 text-center max-w-sm">
            <div className="w-12 h-12 rounded-full bg-brand-500/10 text-brand-500 flex items-center justify-center mb-3">
              <Navigation className="h-6 w-6" />
            </div>
            <h4 className="text-sm font-semibold text-text-main mb-1">Interactive Route Preview</h4>
            <p className="text-xs text-text-muted mb-4">
              Direct highway route connecting {load.origin_city}, {load.origin_state} to{' '}
              {load.destination_city}, {load.destination_state}.
            </p>
            <div className="text-[11px] px-3 py-1.5 rounded bg-card border border-border text-text-muted flex items-center gap-2">
              <AlertCircle className="h-3.5 w-3.5 text-brand-500" />
              <span>Add NEXT_PUBLIC_MAPBOX_TOKEN in .env.local to activate satellite map</span>
            </div>
          </div>
        ) : (
          <div ref={mapContainer} className="w-full h-full" />
        )}
      </div>
    </div>
  );
}
