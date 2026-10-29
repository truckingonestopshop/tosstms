"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import "mapbox-gl/dist/mapbox-gl.css";
import type { GeoJSONSource, Map as MapboxMap, Marker } from "mapbox-gl";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/format";
import type { LngLat } from "@/lib/truckmap";
import { STYLE, webglAvailable } from "./RouteMap";

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

export interface MapDot {
  id: string;
  point: LngLat;
  /** unit number */
  label: string;
  color: string;
  title: string;
}

/** A circle of `miles` around `c`, as a closed ring of [lng, lat]. */
function ring(c: LngLat, miles: number): LngLat[] {
  const out: LngLat[] = [];
  const dLat = miles / 69;
  const dLng = miles / (69 * Math.cos((c[1] * Math.PI) / 180));
  for (let i = 0; i <= 72; i++) {
    const a = (i / 72) * 2 * Math.PI;
    out.push([c[0] + dLng * Math.cos(a), c[1] + dLat * Math.sin(a)]);
  }
  return out;
}

const RINGS = [100, 200, 300];

/**
 * The Truck Map's map: a dot per truck (its unit number), a dashed line from where a loaded truck
 * is now to where it will be empty, and the broker's city with 100 / 200 / 300 mi rings.
 */
export function FleetMap({
  dots,
  lines,
  target,
  focus,
  fitKey,
  selected,
  onSelect,
  className,
}: {
  dots: MapDot[];
  /** road still ahead of each loaded truck, now → where it will be empty */
  lines: { id: string; coords: LngLat[] }[];
  target: LngLat | null;
  /** points the view is fitted to when fitKey changes */
  focus: LngLat[];
  fitKey: string;
  selected: string | null;
  onSelect: (id: string) => void;
  className?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<MapboxMap | null>(null);
  const markers = useRef<Marker[]>([]);
  const styleReady = useRef(false);
  const fitted = useRef("");
  const { resolved } = useTheme();
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const latest = useRef({
    dots,
    lines,
    target,
    focus,
    fitKey,
    selected,
    onSelect,
    resolved,
  });
  useLayoutEffect(() => {
    latest.current = { dots, lines, target, focus, fitKey, selected, onSelect, resolved };
  });

  const draw = useCallback(() => {
    const m = map.current;
    if (!m || !styleReady.current) return;
    import("mapbox-gl").then(({ default: mapboxgl }) => {
      const { dots, lines, target, focus, fitKey, selected, onSelect, resolved } = latest.current;
      const dark = resolved === "dark";
      const set = (id: string, data: GeoJSON.FeatureCollection, add: () => void) => {
        const src = m.getSource(id) as GeoJSONSource | undefined;
        if (src) src.setData(data);
        else {
          m.addSource(id, { type: "geojson", data });
          add();
        }
      };
      set(
        "rings",
        {
          type: "FeatureCollection",
          features: target
            ? RINGS.map((r) => ({
                type: "Feature",
                properties: { r },
                geometry: { type: "LineString", coordinates: ring(target, r) },
              }))
            : [],
        },
        () =>
          m.addLayer({
            id: "rings",
            type: "line",
            source: "rings",
            paint: {
              "line-color": "#f28c38",
              "line-opacity": 0.45,
              "line-width": 1.2,
              "line-dasharray": [2, 2],
            },
          }),
      );
      set(
        "heading",
        {
          type: "FeatureCollection",
          features: lines.map((l) => ({
            type: "Feature",
            properties: { id: l.id },
            geometry: { type: "LineString", coordinates: l.coords },
          })),
        },
        () =>
          m.addLayer({
            id: "heading",
            type: "line",
            source: "heading",
            layout: { "line-cap": "round" },
            paint: {
              "line-color": dark ? "#93c5fd" : "#2563eb",
              "line-opacity": 0.7,
              "line-width": 2,
              "line-dasharray": [1.5, 1.5],
            },
          }),
      );
      set(
        "heading-end",
        {
          type: "FeatureCollection",
          // Both ends: where the truck is now (filled) and where it will be empty (hollow).
          features: lines.flatMap((l) => [
            { type: "Feature" as const, properties: { start: true }, geometry: { type: "Point" as const, coordinates: l.coords[0] } },
            { type: "Feature" as const, properties: { start: false }, geometry: { type: "Point" as const, coordinates: l.coords[l.coords.length - 1] } },
          ]),
        },
        () =>
          m.addLayer({
            id: "heading-end",
            type: "circle",
            source: "heading-end",
            paint: {
              "circle-radius": 4,
              "circle-color": ["case", ["get", "start"], dark ? "#93c5fd" : "#2563eb", dark ? "#0d0d0f" : "#fff"],
              "circle-stroke-color": dark ? "#93c5fd" : "#2563eb",
              "circle-stroke-width": 2,
            },
          }),
      );

      markers.current.forEach((mk) => mk.remove());
      markers.current = [];
      const font = `"Eina 03",ui-sans-serif,system-ui,sans-serif`;
      const ringColor = dark ? "#0d0d0f" : "#fff";
      if (target) {
        const el = document.createElement("div");
        el.title = "Pickup city";
        el.style.cssText = `width:18px;height:18px;border-radius:999px;background:#f28c38;border:3px solid ${ringColor};box-shadow:0 0 0 6px rgba(242,140,56,.25),0 1px 4px rgba(0,0,0,.4)`;
        markers.current.push(new mapboxgl.Marker({ element: el }).setLngLat(target).addTo(m));
      }
      // Trucks in the same spot are fanned out a little so each one can be clicked.
      const groups = new Map<string, string[]>();
      for (const d of dots) {
        const k = `${d.point[0].toFixed(2)},${d.point[1].toFixed(2)}`;
        groups.set(k, [...(groups.get(k) || []), d.id]);
      }
      const offsetOf = (d: MapDot): [number, number] => {
        const g = groups.get(`${d.point[0].toFixed(2)},${d.point[1].toFixed(2)}`) || [];
        if (g.length < 2) return [0, 0];
        const a = (g.indexOf(d.id) / g.length) * 2 * Math.PI - Math.PI / 2;
        const r = 12 + g.length * 2;
        return [Math.round(Math.cos(a) * r), Math.round(Math.sin(a) * r)];
      };
      // Selected last, so it sits on top.
      [...dots]
        .sort((a, b) => Number(a.id === selected) - Number(b.id === selected))
        .forEach((d) => {
          const el = document.createElement("button");
          el.type = "button";
          el.title = d.title;
          const on = d.id === selected;
          el.style.cssText = `cursor:pointer;min-width:24px;height:24px;padding:0 6px;border-radius:999px;display:flex;align-items:center;justify-content:center;font:700 10.5px/1 ${font};font-variant-numeric:tabular-nums;color:#fff;background:${d.color};border:2px solid ${on ? "#f28c38" : ringColor};box-shadow:${on ? "0 0 0 3px rgba(242,140,56,.45)," : ""}0 1px 4px rgba(0,0,0,.4)`;
          el.textContent = d.label;
          el.addEventListener("click", (e) => {
            e.stopPropagation();
            onSelect(d.id);
          });
          markers.current.push(new mapboxgl.Marker({ element: el, offset: offsetOf(d) }).setLngLat(d.point).addTo(m));
        });

      if (fitted.current !== fitKey && focus.length) {
        fitted.current = fitKey;
        if (focus.length === 1) m.jumpTo({ center: focus[0], zoom: 6 });
        else {
          const b = new mapboxgl.LngLatBounds(focus[0], focus[0]);
          focus.forEach((p) => b.extend(p));
          m.fitBounds(b, { padding: 60, maxZoom: 8, duration: 0 });
        }
      }
    });
  }, []);

  useEffect(() => {
    if (!box.current || !TOKEN) return;
    if (!webglAvailable()) {
      setFailed(true);
      return;
    }
    let cancelled = false;
    import("mapbox-gl")
      .then(({ default: mapboxgl }) => {
        if (cancelled || !box.current) return;
        mapboxgl.accessToken = TOKEN;
        const m = new mapboxgl.Map({
          container: box.current,
          style: STYLE[document.documentElement.classList.contains("dark") ? "dark" : "light"],
          center: [-96, 38.5],
          zoom: 3.2,
          attributionControl: false,
        });
        m.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
        m.addControl(new mapboxgl.AttributionControl({ compact: true }));
        const onStyle = () => {
          styleReady.current = true;
          setReady(true);
          draw();
        };
        m.on("style.load", onStyle);
        m.on("styledata", () => {
          if (!styleReady.current) onStyle();
        });
        m.on("error", (e) => {
          const msg = String((e as { error?: { message?: string } }).error?.message || "");
          if (/webgl|context|401|403/i.test(msg)) setFailed(true);
        });
        map.current = m;
      })
      .catch(() => setFailed(true));
    const ro = new ResizeObserver(() => {
      try {
        map.current?.resize();
      } catch {}
    });
    ro.observe(box.current);
    return () => {
      cancelled = true;
      ro.disconnect();
      markers.current.forEach((mk) => mk.remove());
      try {
        map.current?.remove();
      } catch {}
      map.current = null;
    };
  }, [draw]);

  // Follow the app theme (a new style drops the layers; style.load draws them again).
  useEffect(() => {
    if (ready && map.current) {
      styleReady.current = false;
      map.current.setStyle(STYLE[resolved]);
    }
  }, [resolved, ready]);

  useEffect(() => {
    if (ready) draw();
  }, [dots, lines, target, focus, fitKey, selected, ready, draw]);

  // Bring the picked truck into view.
  useEffect(() => {
    const d = dots.find((x) => x.id === selected);
    const m = map.current;
    if (!d || !m || !ready) return;
    if (!m.getBounds()?.contains(d.point)) m.easeTo({ center: d.point, duration: 500 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, ready]);

  if (!TOKEN || failed) {
    return (
      <div className={cn("flex items-center justify-center rounded-xl border border-line bg-surface-2 text-xs text-fg-4", className)}>
        The map can&apos;t run in this browser. The list still works.
      </div>
    );
  }
  return (
    <div className={cn("relative overflow-hidden rounded-xl border border-line bg-surface-2", className)}>
      <div ref={box} className="h-full w-full" />
    </div>
  );
}
