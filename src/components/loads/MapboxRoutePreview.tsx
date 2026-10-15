'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Load } from '@/types';
import { useTheme } from '@/lib/context/ThemeContext';
import { MapPin, Navigation, Clock, AlertCircle, Truck, ArrowRight } from 'lucide-react';
import { geocodeLocation, calculateMapboxRoute } from '@/lib/mapbox/routing';
import 'mapbox-gl/dist/mapbox-gl.css';

interface MapboxRoutePreviewProps {
  load: Load & {
    route_geometry?: { type: 'LineString'; coordinates: [number, number][] };
    deadhead_geometry?: { type: 'LineString'; coordinates: [number, number][] };
  };
  className?: string;
  truckOriginCity?: string;
}

export function MapboxRoutePreview({ load, className = '', truckOriginCity }: MapboxRoutePreviewProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const mapboxglRef = useRef<any>(null);
  const currentThemeRef = useRef<string | null>(null);
  const lastCoordinatesRef = useRef<string>('');

  const markersRef = useRef<{ origin?: any; dest?: any; truck?: any }>({});

  const { theme } = useTheme();
  const [tokenMissing, setTokenMissing] = useState(false);

  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

  // Memoized metrics
  const loadedMiles = load.loaded_miles || load.total_miles || 0;
  const deadheadMiles = load.deadhead_miles || 0;
  const totalTripMiles = load.total_miles || (loadedMiles + deadheadMiles);
  const estHours = Math.round((totalTripMiles / 55) * 10) / 10;
  const rpm = load.rate_per_mile || (load.gross_amount && loadedMiles > 0 ? load.gross_amount / loadedMiles : 0);

  // Helper to ensure sources & layers exist
  const ensureSourcesAndLayers = (map: any) => {
    if (!map || !map.isStyleLoaded()) return false;

    // 1. Loaded Route Source & Layers (Casing for contrast + vibrant Orange line)
    if (!map.getSource('loaded-route')) {
      map.addSource('loaded-route', {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {},
          geometry: { type: 'LineString', coordinates: [] },
        },
      });
    }

    if (!map.getLayer('loaded-route-casing')) {
      map.addLayer({
        id: 'loaded-route-casing',
        type: 'line',
        source: 'loaded-route',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': '#000000',
          'line-width': 7,
          'line-opacity': 0.45,
        },
      });
    }

    if (!map.getLayer('loaded-route-line')) {
      map.addLayer({
        id: 'loaded-route-line',
        type: 'line',
        source: 'loaded-route',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': '#F79B4D', // Signature TOSS Orange
          'line-width': 4.5,
          'line-opacity': 1,
        },
      });
    }

    // 2. Deadhead Route Source & Layer (Dashed Purple line)
    if (!map.getSource('deadhead-route')) {
      map.addSource('deadhead-route', {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {},
          geometry: { type: 'LineString', coordinates: [] },
        },
      });
    }

    if (!map.getLayer('deadhead-route-line')) {
      map.addLayer({
        id: 'deadhead-route-line',
        type: 'line',
        source: 'deadhead-route',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': '#A855F7',
          'line-width': 3.5,
          'line-dasharray': [2, 2],
          'line-opacity': 0.9,
        },
      });
    }

    return true;
  };

  // 1. Mount Mapbox ONCE
  useEffect(() => {
    if (!token) {
      setTokenMissing(true);
      return;
    }

    if (!mapContainerRef.current || mapRef.current) return;

    let isCancelled = false;

    async function mountMap() {
      try {
        const mapboxgl = (await import('mapbox-gl')).default;
        mapboxglRef.current = mapboxgl;
        mapboxgl.accessToken = token!;

        if (isCancelled || !mapContainerRef.current) return;

        currentThemeRef.current = theme;
        const mapStyle = theme === 'dark' ? 'mapbox://styles/mapbox/dark-v11' : 'mapbox://styles/mapbox/light-v11';

        const map = new mapboxgl.Map({
          container: mapContainerRef.current,
          style: mapStyle,
          center: [-95.7129, 37.0902],
          zoom: 4,
          attributionControl: true,
        });

        map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');

        map.on('load', () => {
          if (isCancelled) return;
          mapRef.current = map;
          ensureSourcesAndLayers(map);

          // Force resize to container
          map.resize();

          // Trigger route draw immediately
          applyRouteData(map, mapboxgl);
        });
      } catch (err) {
        console.warn('Mapbox mount error:', err);
      }
    }

    mountMap();

    // Auto-resize on window / container size adjustments (crucial for modals)
    const resizeObserver = new ResizeObserver(() => {
      if (mapRef.current) {
        mapRef.current.resize();
      }
    });

    if (mapContainerRef.current) {
      resizeObserver.observe(mapContainerRef.current);
    }

    return () => {
      isCancelled = true;
      resizeObserver.disconnect();
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [token]);

  // 2. Handle theme updates ONLY when theme actually changes
  useEffect(() => {
    if (!mapRef.current || !currentThemeRef.current) return;
    if (currentThemeRef.current === theme) return; // Ignore if unchanged

    currentThemeRef.current = theme;
    const map = mapRef.current;
    const mapboxgl = mapboxglRef.current;
    const mapStyle = theme === 'dark' ? 'mapbox://styles/mapbox/dark-v11' : 'mapbox://styles/mapbox/light-v11';

    map.setStyle(mapStyle);
    map.once('style.load', () => {
      ensureSourcesAndLayers(map);
      if (mapboxgl) {
        applyRouteData(map, mapboxgl);
      }
    });
  }, [theme]);

  // 3. Centralized route data applier
  const applyRouteData = async (map: any, mapboxgl: any) => {
    if (!map || !map.isStyleLoaded()) {
      map.once('style.load', () => applyRouteData(map, mapboxgl));
      return;
    }

    ensureSourcesAndLayers(map);

    const originQuery = `${load.origin_city || ''}, ${load.origin_state || ''}`.trim();
    const destQuery = `${load.destination_city || ''}, ${load.destination_state || ''}`.trim();

    if (!originQuery || !destQuery) return;

    try {
      // Approximate fallback coordinates for major freight regions
      const getQuickCoords = (city: string, state: string): [number, number] => {
        const c = city.toLowerCase();
        if (c.includes('houston')) return [-95.3698, 29.7604];
        if (c.includes('memphis')) return [-90.049, 35.1495];
        if (c.includes('chicago')) return [-87.6298, 41.8781];
        if (c.includes('atlanta')) return [-84.388, 33.749];
        if (c.includes('dallas')) return [-96.797, 32.7767];
        if (c.includes('indianapolis')) return [-86.1581, 39.7684];
        if (c.includes('savannah')) return [-81.0998, 32.0809];
        if (c.includes('charlotte')) return [-80.8431, 35.2271];
        if (c.includes('ardmore')) return [-97.1436, 34.1743];
        if (c.includes('shreveport')) return [-93.7502, 32.5252];
        return [-95.7129, 37.0902];
      };

      // Geocode or use quick coords
      const [oRes, dRes] = await Promise.all([
        geocodeLocation(originQuery),
        geocodeLocation(destQuery),
      ]);

      const originCoord = oRes || getQuickCoords(load.origin_city, load.origin_state);
      const destCoord = dRes || getQuickCoords(load.destination_city, load.destination_state);

      let truckCoord: [number, number] | null = null;
      if (truckOriginCity && truckOriginCity.trim().length > 2) {
        truckCoord = (await geocodeLocation(truckOriginCity)) || getQuickCoords(truckOriginCity, '');
      }

      // Instant baseline route (guarantees the orange line displays immediately)
      let initialCoords: [number, number][] = [originCoord, destCoord];
      if (load.route_geometry?.coordinates && load.route_geometry.coordinates.length > 1) {
        initialCoords = load.route_geometry.coordinates;
      }

      const loadedSource = map.getSource('loaded-route');
      if (loadedSource) {
        loadedSource.setData({
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: initialCoords,
          },
        });
      }

      // Update Markers
      // Origin Marker (Pickup #1)
      if (!markersRef.current.origin) {
        const elOrigin = document.createElement('div');
        elOrigin.className =
          'w-6 h-6 bg-emerald-500 rounded-full border-2 border-white shadow-xl flex items-center justify-center text-white text-[11px] font-bold cursor-pointer';
        elOrigin.innerText = '1';
        markersRef.current.origin = new mapboxgl.Marker(elOrigin).setLngLat(originCoord).addTo(map);
      } else {
        markersRef.current.origin.setLngLat(originCoord);
      }

      markersRef.current.origin.setPopup(
        new mapboxgl.Popup({ offset: 15 }).setHTML(
          `<div class="p-1 text-xs"><strong>Pickup #1</strong><br/>${originQuery}<br/>${load.pickup_date || ''}</div>`
        )
      );

      // Destination Marker (Delivery)
      const stopNum = load.stops && load.stops.length > 2 ? String(load.stops.length) : '2';
      if (!markersRef.current.dest) {
        const elDest = document.createElement('div');
        elDest.className =
          'w-6 h-6 bg-brand-500 rounded-full border-2 border-white shadow-xl flex items-center justify-center text-white text-[11px] font-bold cursor-pointer';
        elDest.innerText = stopNum;
        markersRef.current.dest = new mapboxgl.Marker(elDest).setLngLat(destCoord).addTo(map);
      } else {
        markersRef.current.dest.setLngLat(destCoord);
        markersRef.current.dest.getElement().innerText = stopNum;
      }

      markersRef.current.dest.setPopup(
        new mapboxgl.Popup({ offset: 15 }).setHTML(
          `<div class="p-1 text-xs"><strong>Delivery</strong><br/>${destQuery}<br/>${load.delivery_date || ''}</div>`
        )
      );

      // Deadhead Marker (Tractor origin)
      const dhSource = map.getSource('deadhead-route');
      if (truckCoord) {
        let dhCoords: [number, number][] = [truckCoord, originCoord];
        if (load.deadhead_geometry?.coordinates && load.deadhead_geometry.coordinates.length > 1) {
          dhCoords = load.deadhead_geometry.coordinates;
        }

        if (dhSource) {
          dhSource.setData({
            type: 'Feature',
            properties: {},
            geometry: { type: 'LineString', coordinates: dhCoords },
          });
        }

        if (!markersRef.current.truck) {
          const elTruck = document.createElement('div');
          elTruck.className =
            'w-6 h-6 bg-purple-600 rounded-full border-2 border-white shadow-xl flex items-center justify-center text-white text-[11px] font-bold cursor-pointer';
          elTruck.innerHTML = '🚚';
          markersRef.current.truck = new mapboxgl.Marker(elTruck).setLngLat(truckCoord).addTo(map);
        } else {
          markersRef.current.truck.setLngLat(truckCoord);
        }

        markersRef.current.truck.setPopup(
          new mapboxgl.Popup({ offset: 15 }).setHTML(
            `<div class="p-1 text-xs"><strong>Assigned Tractor</strong><br/>${truckOriginCity}<br/><em>Deadhead: ${deadheadMiles} mi</em></div>`
          )
        );
      } else {
        if (dhSource) {
          dhSource.setData({
            type: 'Feature',
            properties: {},
            geometry: { type: 'LineString', coordinates: [] },
          });
        }
        if (markersRef.current.truck) {
          markersRef.current.truck.remove();
          markersRef.current.truck = null;
        }
      }

      // Smoothly fit bounds around origin and destination
      const bounds = new mapboxgl.LngLatBounds();
      bounds.extend(originCoord);
      bounds.extend(destCoord);
      if (truckCoord) bounds.extend(truckCoord);

      map.fitBounds(bounds, {
        padding: { top: 45, bottom: 45, left: 45, right: 45 },
        maxZoom: 7.5,
        duration: 800,
      });

      // Fetch high-fidelity highway driving route asynchronously and snap to highway
      if (!load.route_geometry?.coordinates) {
        calculateMapboxRoute([originCoord, destCoord]).then((highwayRoute) => {
          if (highwayRoute?.geometry?.coordinates && map.getSource('loaded-route')) {
            map.getSource('loaded-route').setData({
              type: 'Feature',
              properties: {},
              geometry: highwayRoute.geometry,
            });
          }
        });
      }

      if (truckCoord && !load.deadhead_geometry?.coordinates) {
        calculateMapboxRoute([truckCoord, originCoord]).then((highwayDh) => {
          if (highwayDh?.geometry?.coordinates && map.getSource('deadhead-route')) {
            map.getSource('deadhead-route').setData({
              type: 'Feature',
              properties: {},
              geometry: highwayDh.geometry,
            });
          }
        });
      }
    } catch (err) {
      console.warn('Mapbox route update error:', err);
    }
  };

  // 4. Update route whenever origin, destination, or assigned truck changes
  const locationKey = `${load.origin_city}|${load.origin_state}|${load.destination_city}|${load.destination_state}|${truckOriginCity || ''}|${load.route_geometry ? 'geom' : 'auto'}`;

  useEffect(() => {
    if (!mapRef.current || !mapboxglRef.current) return;
    if (lastCoordinatesRef.current === locationKey) return;
    lastCoordinatesRef.current = locationKey;

    applyRouteData(mapRef.current, mapboxglRef.current);
  }, [locationKey]);

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

      {/* Map Canvas */}
      <div className="relative w-full h-[280px] bg-card-subtle flex items-center justify-center">
        {tokenMissing ? (
          <div className="flex flex-col items-center justify-center p-6 text-center max-w-sm">
            <div className="w-10 h-10 rounded-full bg-brand-500/10 text-brand-500 flex items-center justify-center mb-2">
              <Navigation className="h-5 w-5" />
            </div>
            <h4 className="text-xs font-semibold text-text-main mb-1">Interactive Route Preview</h4>
            <p className="text-[11px] text-text-muted mb-2">
              {load.origin_city}, {load.origin_state} → {load.destination_city}, {load.destination_state} ({loadedMiles} mi)
            </p>
            <div className="text-[10px] px-2.5 py-1 rounded bg-card border border-border text-text-muted flex items-center gap-1.5">
              <AlertCircle className="h-3 w-3 text-brand-500" />
              <span>Token required in .env.local</span>
            </div>
          </div>
        ) : (
          <div ref={mapContainerRef} className="w-full h-full" />
        )}
      </div>
    </div>
  );
}
