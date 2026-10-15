'use client';

import React, { useEffect, useRef, useState, useMemo } from 'react';
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
  const markersRef = useRef<{ origin?: any; dest?: any; truck?: any; intermediate: any[] }>({
    intermediate: [],
  });

  const { theme } = useTheme();
  const [mapLoaded, setMapLoaded] = useState(false);
  const [tokenMissing, setTokenMissing] = useState(false);

  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

  // Memoized metrics so header updates cleanly
  const loadedMiles = load.loaded_miles || load.total_miles || 0;
  const deadheadMiles = load.deadhead_miles || 0;
  const totalTripMiles = load.total_miles || (loadedMiles + deadheadMiles);
  const estHours = Math.round((totalTripMiles / 55) * 10) / 10;
  const rpm = load.rate_per_mile || (load.gross_amount && loadedMiles > 0 ? load.gross_amount / loadedMiles : 0);

  // 1. Initialize Mapbox ONCE when mounted
  useEffect(() => {
    if (!token) {
      setTokenMissing(true);
      return;
    }

    if (!mapContainerRef.current || mapRef.current) return;

    let isCancelled = false;

    async function initMap() {
      try {
        const mapboxgl = (await import('mapbox-gl')).default;
        mapboxglRef.current = mapboxgl;
        mapboxgl.accessToken = token!;

        if (isCancelled || !mapContainerRef.current) return;

        const mapStyle = theme === 'dark' ? 'mapbox://styles/mapbox/dark-v11' : 'mapbox://styles/mapbox/light-v11';

        const map = new mapboxgl.Map({
          container: mapContainerRef.current,
          style: mapStyle,
          center: [-95.7129, 37.0902], // Geographic center of US
          zoom: 3.8,
          attributionControl: true,
        });

        map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');

        map.on('load', () => {
          if (isCancelled) return;

          // Add loaded route source & layer
          map.addSource('loaded-route', {
            type: 'geojson',
            data: {
              type: 'Feature',
              properties: {},
              geometry: {
                type: 'LineString',
                coordinates: [],
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
              'line-opacity': 0.95,
            },
          });

          // Add deadhead route source & layer
          map.addSource('deadhead-route', {
            type: 'geojson',
            data: {
              type: 'Feature',
              properties: {},
              geometry: {
                type: 'LineString',
                coordinates: [],
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
              'line-color': '#A855F7', // Purple for Deadhead
              'line-width': 3.5,
              'line-dasharray': [2, 2],
              'line-opacity': 0.85,
            },
          });

          mapRef.current = map;
          setMapLoaded(true);

          // Ensure proper layout dimensioning
          setTimeout(() => {
            map.resize();
          }, 100);
        });
      } catch (err) {
        console.warn('Mapbox initialization error:', err);
      }
    }

    initMap();

    return () => {
      isCancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [token]);

  // 2. Handle theme change smoothly without destroying map
  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;
    const map = mapRef.current;
    const mapStyle = theme === 'dark' ? 'mapbox://styles/mapbox/dark-v11' : 'mapbox://styles/mapbox/light-v11';
    map.setStyle(mapStyle);

    // Re-attach sources and layers after style reloads
    map.once('style.load', () => {
      if (!map.getSource('loaded-route')) {
        map.addSource('loaded-route', {
          type: 'geojson',
          data: {
            type: 'Feature',
            properties: {},
            geometry: {
              type: 'LineString',
              coordinates: [],
            },
          },
        });
        map.addLayer({
          id: 'loaded-route-line',
          type: 'line',
          source: 'loaded-route',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: { 'line-color': '#F79B4D', 'line-width': 4.5, 'line-opacity': 0.95 },
        });
      }

      if (!map.getSource('deadhead-route')) {
        map.addSource('deadhead-route', {
          type: 'geojson',
          data: {
            type: 'Feature',
            properties: {},
            geometry: {
              type: 'LineString',
              coordinates: [],
            },
          },
        });
        map.addLayer({
          id: 'deadhead-route-line',
          type: 'line',
          source: 'deadhead-route',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: {
            'line-color': '#A855F7',
            'line-width': 3.5,
            'line-dasharray': [2, 2],
            'line-opacity': 0.85,
          },
        });
      }
    });
  }, [theme, mapLoaded]);

  // 3. Update route lines and markers ONLY when lane coordinates or geometry change
  const originStr = `${load.origin_city || ''}, ${load.origin_state || ''}`.trim();
  const destStr = `${load.destination_city || ''}, ${load.destination_state || ''}`.trim();

  useEffect(() => {
    if (!mapRef.current || !mapLoaded || !mapboxglRef.current) return;
    if (!load.origin_city || !load.destination_city) return;

    let active = true;
    const map = mapRef.current;
    const mapboxgl = mapboxglRef.current;

    async function updateRoute() {
      try {
        // Geocode origin & destination
        const [oRes, dRes] = await Promise.all([
          geocodeLocation(originStr),
          geocodeLocation(destStr),
        ]);

        if (!active || !mapRef.current) return;

        const originCoord = oRes || [-87.6298, 41.8781];
        const destCoord = dRes || [-84.388, 33.749];

        let truckCoord: [number, number] | null = null;
        if (truckOriginCity && truckOriginCity.trim().length > 2) {
          truckCoord = await geocodeLocation(truckOriginCity);
        }

        if (!active || !mapRef.current) return;

        // 1. Get or compute loaded geometry
        let loadedCoords: [number, number][] = [originCoord, destCoord];
        if (load.route_geometry?.coordinates && load.route_geometry.coordinates.length > 1) {
          loadedCoords = load.route_geometry.coordinates;
        } else {
          const routeRes = await calculateMapboxRoute([originCoord, destCoord]);
          if (routeRes?.geometry?.coordinates) {
            loadedCoords = routeRes.geometry.coordinates;
          }
        }

        if (!active || !mapRef.current) return;

        // Update Loaded Route Layer
        const loadedSource = map.getSource('loaded-route');
        if (loadedSource) {
          loadedSource.setData({
            type: 'Feature',
            properties: {},
            geometry: {
              type: 'LineString',
              coordinates: loadedCoords,
            },
          });
        }

        // 2. Update Deadhead Route Layer (if truck origin provided)
        const dhSource = map.getSource('deadhead-route');
        if (dhSource) {
          if (truckCoord) {
            let dhCoords: [number, number][] = [truckCoord, originCoord];
            if (load.deadhead_geometry?.coordinates && load.deadhead_geometry.coordinates.length > 1) {
              dhCoords = load.deadhead_geometry.coordinates;
            } else {
              const dhRes = await calculateMapboxRoute([truckCoord, originCoord]);
              if (dhRes?.geometry?.coordinates) {
                dhCoords = dhRes.geometry.coordinates;
              }
            }

            dhSource.setData({
              type: 'Feature',
              properties: {},
              geometry: {
                type: 'LineString',
                coordinates: dhCoords,
              },
            });
          } else {
            dhSource.setData({
              type: 'Feature',
              properties: {},
              geometry: {
                type: 'LineString',
                coordinates: [],
              },
            });
          }
        }

        // 3. Update Markers smoothly
        // Origin Marker (Pickup #1)
        if (!markersRef.current.origin) {
          const elOrigin = document.createElement('div');
          elOrigin.className =
            'w-6 h-6 bg-emerald-500 rounded-full border-2 border-white shadow-lg flex items-center justify-center text-white text-[10px] font-bold cursor-pointer';
          elOrigin.innerText = '1';
          markersRef.current.origin = new mapboxgl.Marker(elOrigin).setLngLat(originCoord).addTo(map);
        } else {
          markersRef.current.origin.setLngLat(originCoord);
        }

        markersRef.current.origin.setPopup(
          new mapboxgl.Popup({ offset: 15 }).setHTML(
            `<strong>Pickup #1</strong><br/>${load.origin_city}, ${load.origin_state}<br/>${load.pickup_date || ''}`
          )
        );

        // Destination Marker (Delivery)
        if (!markersRef.current.dest) {
          const elDest = document.createElement('div');
          elDest.className =
            'w-6 h-6 bg-brand-500 rounded-full border-2 border-white shadow-lg flex items-center justify-center text-white text-[10px] font-bold cursor-pointer';
          elDest.innerText = load.stops && load.stops.length > 2 ? String(load.stops.length) : '2';
          markersRef.current.dest = new mapboxgl.Marker(elDest).setLngLat(destCoord).addTo(map);
        } else {
          markersRef.current.dest.setLngLat(destCoord);
          markersRef.current.dest.getElement().innerText =
            load.stops && load.stops.length > 2 ? String(load.stops.length) : '2';
        }

        markersRef.current.dest.setPopup(
          new mapboxgl.Popup({ offset: 15 }).setHTML(
            `<strong>Delivery</strong><br/>${load.destination_city}, ${load.destination_state}<br/>${load.delivery_date || ''}`
          )
        );

        // Truck Origin Marker (Deadhead leg)
        if (truckCoord) {
          if (!markersRef.current.truck) {
            const elTruck = document.createElement('div');
            elTruck.className =
              'w-6 h-6 bg-purple-600 rounded-full border-2 border-white shadow-lg flex items-center justify-center text-white text-[10px] font-bold cursor-pointer';
            elTruck.innerHTML = '🚚';
            markersRef.current.truck = new mapboxgl.Marker(elTruck).setLngLat(truckCoord).addTo(map);
          } else {
            markersRef.current.truck.setLngLat(truckCoord);
          }
          markersRef.current.truck.setPopup(
            new mapboxgl.Popup({ offset: 15 }).setHTML(
              `<strong>Tractor Location</strong><br/>${truckOriginCity}<br/><em>Empty / Ready</em>`
            )
          );
        } else if (markersRef.current.truck) {
          markersRef.current.truck.remove();
          markersRef.current.truck = null;
        }

        // 4. Fit map bounds smoothly
        const bounds = new mapboxgl.LngLatBounds();
        bounds.extend(originCoord);
        bounds.extend(destCoord);
        if (truckCoord) bounds.extend(truckCoord);

        map.fitBounds(bounds, {
          padding: { top: 50, bottom: 50, left: 50, right: 50 },
          maxZoom: 8,
          duration: 1000,
        });

        // Ensure canvas matches container dimensions
        map.resize();
      } catch (err) {
        console.warn('Error updating route preview:', err);
      }
    }

    updateRoute();

    return () => {
      active = false;
    };
  }, [mapLoaded, originStr, destStr, truckOriginCity, load.route_geometry]);

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
      <div className="relative w-full h-[300px] bg-card-subtle flex items-center justify-center">
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
          <div ref={mapContainerRef} className="w-full h-full" />
        )}
      </div>
    </div>
  );
}
