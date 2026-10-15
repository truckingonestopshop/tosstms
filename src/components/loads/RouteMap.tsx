"use client";

import { useEffect, useRef, useState } from "react";
import "mapbox-gl/dist/mapbox-gl.css";
import type { GeoJSONSource, Map as MapboxMap, Marker } from "mapbox-gl";
import { MapPin } from "lucide-react";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/format";
import type { RouteData } from "@/lib/route";

const STYLE = { light: "mapbox://styles/mapbox/light-v11", dark: "mapbox://styles/mapbox/dark-v11" };

/** Route preview: the driving line and a numbered pin per stop (pickups dark, deliveries orange). */
export function RouteMap({
  route,
  types,
  className,
  loading,
}: {
  route: RouteData | null;
  types: ("pickup" | "delivery")[];
  className?: string;
  loading?: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<MapboxMap | null>(null);
  const markers = useRef<Marker[]>([]);
  const { resolved } = useTheme();
  const [ready, setReady] = useState(false);
  const [styleKey, setStyleKey] = useState(0);
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

  // Create once.
  useEffect(() => {
    if (!box.current || !token) return;
    let cancelled = false;
    import("mapbox-gl").then(({ default: mapboxgl }) => {
      if (cancelled || !box.current) return;
      mapboxgl.accessToken = token;
      const m = new mapboxgl.Map({
        container: box.current,
        style: STYLE[document.documentElement.classList.contains("dark") ? "dark" : "light"],
        center: [-96, 38.5],
        zoom: 3,
        attributionControl: false,
        cooperativeGestures: true,
      });
      m.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
      m.addControl(new mapboxgl.AttributionControl({ compact: true }));
      m.on("load", () => {
        setReady(true);
        setStyleKey((k) => k + 1);
      });
      m.on("style.load", () => setStyleKey((k) => k + 1));
      map.current = m;
    });
    return () => {
      cancelled = true;
      markers.current.forEach((mk) => mk.remove());
      map.current?.remove();
      map.current = null;
    };
  }, [token]);

  // Follow the app theme.
  useEffect(() => {
    if (ready && map.current) map.current.setStyle(STYLE[resolved]);
  }, [resolved, ready]);

  // Draw route + pins.
  useEffect(() => {
    const m = map.current;
    if (!ready || !m || !m.isStyleLoaded()) return;
    import("mapbox-gl").then(({ default: mapboxgl }) => {
      const line = route?.line || [];
      const data = { type: "Feature" as const, properties: {}, geometry: { type: "LineString" as const, coordinates: line } };
      const src = m.getSource("route") as GeoJSONSource | undefined;
      if (src) src.setData(data);
      else {
        m.addSource("route", { type: "geojson", data });
        m.addLayer({ id: "route-casing", type: "line", source: "route", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": resolved === "dark" ? "#000" : "#fff", "line-width": 7 } });
        m.addLayer({ id: "route-line", type: "line", source: "route", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#f28c38", "line-width": 4 } });
      }
      markers.current.forEach((mk) => mk.remove());
      markers.current = [];
      const pts = (route?.points || []).map((p, i) => ({ p, i })).filter((x): x is { p: [number, number]; i: number } => !!x.p);
      pts.forEach(({ p, i }) => {
        const el = document.createElement("div");
        const pickup = types[i] !== "delivery";
        el.className = "tms-pin";
        el.style.cssText = `width:24px;height:24px;border-radius:999px;display:flex;align-items:center;justify-content:center;font:700 11px/1 "Eina 03",sans-serif;border:2px solid ${resolved === "dark" ? "#0d0d0f" : "#fff"};box-shadow:0 1px 4px rgba(0,0,0,.35);background:${pickup ? (resolved === "dark" ? "#f4f4f5" : "#0a0a0d") : "#f28c38"};color:${pickup ? (resolved === "dark" ? "#0a0a0d" : "#fff") : "#0a0a0d"}`;
        el.textContent = String(i + 1);
        markers.current.push(new mapboxgl.Marker({ element: el }).setLngLat(p).addTo(m));
      });
      const all = line.length ? line : pts.map((x) => x.p);
      if (all.length >= 2) {
        const b = new mapboxgl.LngLatBounds(all[0], all[0]);
        all.forEach((c) => b.extend(c));
        m.fitBounds(b, { padding: 48, maxZoom: 10, duration: 400 });
      } else if (all.length === 1) {
        m.flyTo({ center: all[0], zoom: 8, duration: 400 });
      }
    });
  }, [route, types, ready, styleKey, resolved]);

  if (!token) {
    return (
      <div className={cn("flex items-center justify-center rounded-xl border border-line bg-surface-2 text-xs text-fg-4", className)}>
        Map unavailable (no Mapbox token)
      </div>
    );
  }
  return (
    <div className={cn("relative overflow-hidden rounded-xl border border-line bg-surface-2", className)}>
      <div ref={box} className="absolute inset-0" />
      {!route?.line?.length && !loading && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-xs text-fg-3">
          <MapPin className="h-4 w-4" />
          Add a pickup and a delivery to see the route
        </div>
      )}
      {loading && <div className="absolute left-3 top-3 rounded-md bg-surface/90 px-2 py-1 text-[11px] font-medium text-fg-2 shadow-sm">Routing…</div>}
    </div>
  );
}
