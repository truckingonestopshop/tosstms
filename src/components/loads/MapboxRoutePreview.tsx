'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Load, LoadStop, RouteLeg } from '@/types';
import { useTheme } from '@/lib/context/ThemeContext';
import { Clock, AlertCircle, Truck, ArrowRight, Route as RouteIcon, MapPin } from 'lucide-react';
import { geocodeLocation, calculateMapboxRoute } from '@/lib/mapbox/routing';
import 'mapbox-gl/dist/mapbox-gl.css';

interface MapboxRoutePreviewProps {
  load: Load & {
    route_geometry?: { type: 'LineString'; coordinates: [number, number][] };
    deadhead_geometry?: { type: 'LineString'; coordinates: [number, number][] };
    legs?: RouteLeg[];
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

  const stopMarkersRef = useRef<any[]>([]);
  const truckMarkerRef = useRef<any>(null);

  const { theme } = useTheme();
  const [tokenMissing, setTokenMissing] = useState(false);
  const [activeLegs, setActiveLegs] = useState<RouteLeg[]>(load.legs || []);

  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

  // Sync legs if load prop updates
  useEffect(() => {
    if (load.legs && load.legs.length > 0) {
      setActiveLegs(load.legs);
    }
  }, [load.legs]);

  // Memoized metrics
  const loadedMiles = load.loaded_miles || load.total_miles || 0;
  const deadheadMiles = load.deadhead_miles || 0;
  const totalTripMiles = load.total_miles || loadedMiles + deadheadMiles;
  const estHours = Math.round((totalTripMiles / 55) * 10) / 10;
  const rpm =
    load.rate_per_mile ||
    (load.gross_amount && loadedMiles > 0 ? load.gross_amount / loadedMiles : 0);

  // Helper to ensure sources & layers exist
  const ensureSourcesAndLayers = (map: any) => {
    if (!map || !map.isStyleLoaded()) return false;

    // 1. Loaded Route Source & Layers (Casing for contrast + signature vibrant Orange line)
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
          'line-opacity': 0.5,
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
        const mapStyle =
          theme === 'dark'
            ? 'mapbox://styles/mapbox/dark-v11'
            : 'mapbox://styles/mapbox/light-v11';

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
          map.resize();
          applyRouteData(map, mapboxgl);
        });
      } catch (err) {
        console.warn('Mapbox mount error:', err);
      }
    }

    mountMap();

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
    if (currentThemeRef.current === theme) return;

    currentThemeRef.current = theme;
    const map = mapRef.current;
    const mapboxgl = mapboxglRef.current;
    const mapStyle =
      theme === 'dark'
        ? 'mapbox://styles/mapbox/dark-v11'
        : 'mapbox://styles/mapbox/light-v11';

    map.setStyle(mapStyle);
    map.once('style.load', () => {
      ensureSourcesAndLayers(map);
      if (mapboxgl) {
        applyRouteData(map, mapboxgl);
      }
    });
  }, [theme]);

  // 3. Centralized multi-stop route and marker renderer
  const applyRouteData = async (map: any, mapboxgl: any) => {
    if (!map || !map.isStyleLoaded()) {
      map.once('style.load', () => applyRouteData(map, mapboxgl));
      return;
    }

    ensureSourcesAndLayers(map);

    // Determine normalized stops list
    let canonicalStops: LoadStop[] = [];
    if (load.stops && load.stops.length > 0) {
      canonicalStops = [...load.stops];
    } else {
      if (load.origin_city) {
        canonicalStops.push({
          id: 'stop-pickup-1',
          stop_number: 1,
          type: 'pickup',
          city: load.origin_city,
          state: load.origin_state || '',
          date: load.pickup_date || '',
          status: 'ready',
        });
      }
      if (load.destination_city) {
        canonicalStops.push({
          id: 'stop-delivery-2',
          stop_number: 2,
          type: 'delivery',
          city: load.destination_city,
          state: load.destination_state || '',
          date: load.delivery_date || '',
          status: 'pending',
        });
      }
    }

    if (canonicalStops.length === 0) return;

    try {
      // 1. Geocode each stop coordinate
      const stopCoords: [number, number][] = [];
      for (let i = 0; i < canonicalStops.length; i++) {
        const s = canonicalStops[i];
        let coords: [number, number] | null = s.coordinates || null;
        if (!coords) {
          const query = s.address && s.city && s.state
            ? `${s.address}, ${s.city}, ${s.state}`
            : `${s.city}, ${s.state}`;
          coords = await geocodeLocation(query);
          if (!coords && s.address) {
            coords = await geocodeLocation(`${s.city}, ${s.state}`);
          }
        }
        if (!coords) {
          coords = [-95.7129 + i * 1.5, 37.0902 + i * 0.5];
        }
        stopCoords.push(coords);
      }

      // 2. Remove all previous markers
      stopMarkersRef.current.forEach((m) => m.remove());
      stopMarkersRef.current = [];

      // 3. Create fresh markers for ALL stops
      canonicalStops.forEach((stop, idx) => {
        const coord = stopCoords[idx];
        const isPickup = stop.type === 'pickup' || idx === 0;
        const isFinal = idx === canonicalStops.length - 1 && !isPickup;
        const isIntermediate = !isPickup && !isFinal;

        const el = document.createElement('div');
        let bgClass = 'bg-brand-500';
        let badgeLabel = String(stop.stop_number || idx + 1);

        if (isPickup) {
          bgClass = 'bg-emerald-500';
        } else if (isIntermediate) {
          bgClass = 'bg-amber-500';
        } else {
          bgClass = 'bg-[#F79B4D]';
        }

        el.className = `w-6 h-6 ${bgClass} rounded-full border-2 border-white shadow-xl flex items-center justify-center text-white text-[11px] font-bold cursor-pointer hover:scale-110 transition-transform`;
        el.innerText = badgeLabel;

        const stopTitle = isPickup
          ? `Stop ${badgeLabel} • Pickup`
          : isFinal
          ? `Stop ${badgeLabel} • Final Delivery`
          : `Stop ${badgeLabel} • Delivery (Drop ${idx})`;

        const legInfoHtml = stop.miles_from_previous
          ? `<div class="text-[11px] font-mono font-semibold text-emerald-400 mt-1.5 pt-1.5 border-t border-border">Leg: +${stop.miles_from_previous} mi from Stop ${idx}</div>`
          : '';

        const popup = new mapboxgl.Popup({ offset: 15 }).setHTML(`
          <div class="p-2 text-xs leading-snug">
            <div class="font-bold uppercase tracking-wider text-[10px] text-text-muted mb-0.5">${stopTitle}</div>
            <div class="font-semibold text-text-main text-[12px]">${stop.facility_name || `${stop.city}, ${stop.state}`}</div>
            <div class="text-[11px] text-text-muted">${stop.address ? `${stop.address}, ` : ''}${stop.city}, ${stop.state} ${stop.zip || ''}</div>
            <div class="text-[11px] text-text-muted mt-1 flex items-center gap-1">
              <span>📅 ${stop.date}</span>
              ${stop.appointment_time ? `<span>• ⏰ ${stop.appointment_time}</span>` : ''}
            </div>
            ${legInfoHtml}
          </div>
        `);

        const marker = new mapboxgl.Marker(el).setLngLat(coord).setPopup(popup).addTo(map);
        stopMarkersRef.current.push(marker);
      });

      // 4. Handle Tractor Deadhead Marker & Geometry
      let truckCoord: [number, number] | null = null;
      if (truckOriginCity && truckOriginCity.trim().length > 2) {
        truckCoord = await geocodeLocation(truckOriginCity);
      }

      const dhSource = map.getSource('deadhead-route');
      if (truckCoord && stopCoords[0]) {
        let dhCoords: [number, number][] = [truckCoord, stopCoords[0]];
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

        if (!truckMarkerRef.current) {
          const elTruck = document.createElement('div');
          elTruck.className =
            'w-7 h-7 bg-purple-600 rounded-full border-2 border-white shadow-xl flex items-center justify-center text-white text-[12px] cursor-pointer hover:scale-110 transition-transform';
          elTruck.innerHTML = '🚚';
          truckMarkerRef.current = new mapboxgl.Marker(elTruck).setLngLat(truckCoord).addTo(map);
        } else {
          truckMarkerRef.current.setLngLat(truckCoord);
        }

        truckMarkerRef.current.setPopup(
          new mapboxgl.Popup({ offset: 15 }).setHTML(`
            <div class="p-2 text-xs">
              <div class="font-bold text-purple-400 uppercase text-[10px] mb-0.5">Assigned Tractor Location</div>
              <div class="font-semibold text-text-main text-[12px]">${truckOriginCity}</div>
              <div class="text-[11px] font-mono text-purple-300 mt-1">
                Deadhead: <strong>${deadheadMiles} mi</strong> to Stop 1 (${canonicalStops[0]?.city}, ${canonicalStops[0]?.state})
              </div>
            </div>
          `)
        );

        // Fetch high-fidelity highway deadhead route if needed
        if (!load.deadhead_geometry?.coordinates) {
          calculateMapboxRoute([truckCoord, stopCoords[0]]).then((dhRes) => {
            if (dhRes?.geometry && map.getSource('deadhead-route')) {
              map.getSource('deadhead-route').setData({
                type: 'Feature',
                properties: {},
                geometry: dhRes.geometry,
              });
            }
          });
        }
      } else {
        if (dhSource) {
          dhSource.setData({
            type: 'Feature',
            properties: {},
            geometry: { type: 'LineString', coordinates: [] },
          });
        }
        if (truckMarkerRef.current) {
          truckMarkerRef.current.remove();
          truckMarkerRef.current = null;
        }
      }

      // 5. Update Loaded Route Line (connects all stops)
      let initialCoords: [number, number][] = stopCoords;
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

      // If high-resolution highway geometry not yet provided, calculate via Mapbox
      if (!load.route_geometry?.coordinates && stopCoords.length >= 2) {
        calculateMapboxRoute(stopCoords).then((highwayRoute) => {
          if (highwayRoute?.geometry && map.getSource('loaded-route')) {
            map.getSource('loaded-route').setData({
              type: 'Feature',
              properties: {},
              geometry: highwayRoute.geometry,
            });
          }
          if (highwayRoute?.legs && (!load.legs || load.legs.length === 0)) {
            const calculatedLegs: RouteLeg[] = highwayRoute.legs.map((leg, idx) => ({
              leg_index: idx + 1,
              from_stop_number: canonicalStops[idx]?.stop_number || idx + 1,
              to_stop_number: canonicalStops[idx + 1]?.stop_number || idx + 2,
              from_name: canonicalStops[idx]?.facility_name || `${canonicalStops[idx]?.city}, ${canonicalStops[idx]?.state}`,
              to_name: canonicalStops[idx + 1]?.facility_name || `${canonicalStops[idx + 1]?.city}, ${canonicalStops[idx + 1]?.state}`,
              distance_miles: leg.distanceMiles,
              duration_minutes: leg.durationMinutes,
              summary: leg.summary,
            }));
            setActiveLegs(calculatedLegs);
          }
        });
      }

      // 6. Smoothly Fit Map Bounds around ALL stops and tractor
      const bounds = new mapboxgl.LngLatBounds();
      stopCoords.forEach((coord) => bounds.extend(coord));
      if (truckCoord) bounds.extend(truckCoord);

      map.fitBounds(bounds, {
        padding: { top: 45, bottom: 45, left: 45, right: 45 },
        maxZoom: 7.5,
        duration: 800,
      });
    } catch (err) {
      console.warn('Mapbox route preview update error:', err);
    }
  };

  // 4. Update route whenever stops, origin/dest, or tractor changes
  const stopsKey = (load.stops || [])
    .map((s) => `${s.stop_number}-${s.city}-${s.state}`)
    .join('|');
  const locationKey = `${load.origin_city}|${load.origin_state}|${load.destination_city}|${load.destination_state}|${truckOriginCity || ''}|${stopsKey}|${load.route_geometry ? 'geom' : 'auto'}`;

  useEffect(() => {
    if (!mapRef.current || !mapboxglRef.current) return;
    if (lastCoordinatesRef.current === locationKey) return;
    lastCoordinatesRef.current = locationKey;

    applyRouteData(mapRef.current, mapboxglRef.current);
  }, [locationKey]);

  // Build itinerary text list
  const displayStops = load.stops && load.stops.length > 0 ? load.stops : [
    { city: load.origin_city, state: load.origin_state, type: 'pickup' },
    { city: load.destination_city, state: load.destination_state, type: 'delivery' },
  ];

  return (
    <div className={`relative rounded-xl overflow-hidden border border-border bg-card shadow-sm ${className}`}>
      {/* Route Header Info with Multi-Stop Chain, Deadhead & RPM */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-card border-b border-border text-xs">
        <div className="flex flex-wrap items-center gap-1.5">
          {truckOriginCity && (
            <div className="flex items-center gap-1 font-semibold text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/20 text-[11px]">
              <Truck className="h-3 w-3" />
              <span>{truckOriginCity}</span>
              <span className="text-purple-300 font-mono text-[10px]">({deadheadMiles} mi DH)</span>
              <span className="text-text-muted ml-0.5">⇢</span>
            </div>
          )}

          {displayStops.map((st, i) => (
            <React.Fragment key={i}>
              <span
                className={`font-semibold flex items-center gap-1 ${
                  i === 0
                    ? 'text-emerald-500'
                    : i === displayStops.length - 1
                    ? 'text-[#F79B4D]'
                    : 'text-amber-400'
                }`}
              >
                <span className="text-[10px] opacity-70">[{i + 1}]</span>
                {st.city}, {st.state}
              </span>
              {i < displayStops.length - 1 && (
                <ArrowRight className="h-3 w-3 text-text-muted flex-shrink-0" />
              )}
            </React.Fragment>
          ))}
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

      {/* Leg Mileage Breakdown Strip (Shown when multi-stop exists) */}
      {activeLegs && activeLegs.length > 0 && (
        <div className="bg-card-subtle px-4 py-2 border-b border-border flex flex-wrap items-center gap-2 text-[11px]">
          <div className="flex items-center gap-1 text-text-muted font-semibold uppercase text-[10px] mr-1">
            <RouteIcon className="h-3 w-3 text-brand-500" />
            <span>Leg Miles:</span>
          </div>
          {activeLegs.map((leg) => (
            <div
              key={leg.leg_index}
              className="px-2 py-0.5 rounded bg-card border border-border text-text-main font-mono flex items-center gap-1.5"
            >
              <span className="text-text-muted font-normal">
                Stop {leg.from_stop_number}→{leg.to_stop_number}:
              </span>
              <span className="font-bold text-brand-500">{leg.distance_miles} mi</span>
              {leg.duration_minutes ? (
                <span className="text-text-muted text-[10px]">
                  (~{Math.round((leg.duration_minutes / 60) * 10) / 10}h)
                </span>
              ) : null}
            </div>
          ))}
        </div>
      )}

      {/* Map Canvas */}
      <div className="relative w-full h-[320px] bg-card-subtle flex items-center justify-center">
        {tokenMissing ? (
          <div className="flex flex-col items-center justify-center p-6 text-center max-w-sm">
            <div className="w-10 h-10 rounded-full bg-brand-500/10 text-brand-500 flex items-center justify-center mb-2">
              <MapPin className="h-5 w-5" />
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
