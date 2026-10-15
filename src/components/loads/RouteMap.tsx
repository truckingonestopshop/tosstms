"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import "mapbox-gl/dist/mapbox-gl.css";
import type { GeoJSONSource, Map as MapboxMap, Marker } from "mapbox-gl";
import { MapPin, Maximize2, Minimize2 } from "lucide-react";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/format";
import type { RouteData } from "@/lib/route";

const STYLE = { light: "mapbox://styles/mapbox/light-v11", dark: "mapbox://styles/mapbox/dark-v11" };
const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

function webglAvailable() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

/** Google polyline encoding (precision 5), used by the static map image. */
function encodePolyline(points: [number, number][]) {
  let out = "";
  let pLat = 0;
  let pLng = 0;
  const enc = (v: number) => {
    let n = v < 0 ? ~(v << 1) : v << 1;
    let s = "";
    while (n >= 0x20) {
      s += String.fromCharCode((0x20 | (n & 0x1f)) + 63);
      n >>= 5;
    }
    return s + String.fromCharCode(n + 63);
  };
  for (const [lng, lat] of points) {
    const la = Math.round(lat * 1e5);
    const ln = Math.round(lng * 1e5);
    out += enc(la - pLat) + enc(ln - pLng);
    pLat = la;
    pLng = ln;
  }
  return out;
}

/** Map image with the route and numbered pins, for browsers where the live map can't run. */
function staticUrl(route: RouteData, types: ("pickup" | "delivery")[], theme: "light" | "dark", w: number, h: number) {
  const line = route.line;
  const step = Math.max(1, Math.ceil(line.length / 120));
  const thin = line.filter((_, i) => i % step === 0 || i === line.length - 1);
  const overlays: string[] = [];
  if (thin.length >= 2) overlays.push(`path-4+f28c38-0.95(${encodeURIComponent(encodePolyline(thin))})`);
  route.points.forEach((p, i) => {
    if (!p) return;
    const color = types[i] === "delivery" ? "f28c38" : theme === "dark" ? "f4f4f5" : "0a0a0d";
    overlays.push(`pin-s-${Math.min(i + 1, 99)}+${color}(${p[0].toFixed(5)},${p[1].toFixed(5)})`);
  });
  const style = theme === "dark" ? "dark-v11" : "light-v11";
  return `https://api.mapbox.com/styles/v1/mapbox/${style}/static/${overlays.join(",")}/auto/${w}x${h}@2x?padding=40&access_token=${TOKEN}`;
}

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
  const wrap = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<MapboxMap | null>(null);
  const markers = useRef<Marker[]>([]);
  const { resolved } = useTheme();
  const [mode, setMode] = useState<"gl" | "static">("gl");
  const [ready, setReady] = useState(false);
  const [size, setSize] = useState({ w: 600, h: 300 });
  const styleReady = useRef(false);
  const latest = useRef({ route, types, resolved });
  latest.current = { route, types, resolved };

  // Draw the current route on the live map; waits for the style if it is still loading.
  const draw = useCallback(function drawRoute() {
    const m = map.current;
    if (!m) return;
    // Layers can be added as soon as the style is parsed ("style.load"). isStyleLoaded()
    // stays false until every tile has arrived, so waiting on it could hide the route.
    if (!styleReady.current) return;
    import("mapbox-gl").then(({ default: mapboxgl }) => {
      const { route, types, resolved } = latest.current;
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
        el.style.cssText = `width:24px;height:24px;border-radius:999px;display:flex;align-items:center;justify-content:center;font:700 11px/1 "Eina 03",sans-serif;border:2px solid ${resolved === "dark" ? "#0d0d0f" : "#fff"};box-shadow:0 1px 4px rgba(0,0,0,.35);background:${pickup ? (resolved === "dark" ? "#f4f4f5" : "#0a0a0d") : "#f28c38"};color:${pickup ? (resolved === "dark" ? "#0a0a0d" : "#fff") : "#0a0a0d"}`;
        el.textContent = String(i + 1);
        markers.current.push(new mapboxgl.Marker({ element: el }).setLngLat(p).addTo(m));
      });
      const all = line.length ? line : pts.map((x) => x.p);
      if (all.length >= 2) {
        const b = new mapboxgl.LngLatBounds(all[0], all[0]);
        all.forEach((c) => b.extend(c));
        m.fitBounds(b, { padding: 48, maxZoom: 10, duration: 0 });
      } else if (all.length === 1) {
        m.jumpTo({ center: all[0], zoom: 8 });
      }
    });
  }, []);

  // Track the box size (used for the static image).
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const w = Math.round(Math.min(1280, Math.max(200, e.contentRect.width)));
      const h = Math.round(Math.min(1280, Math.max(150, e.contentRect.height)));
      setSize((s) => (Math.abs(s.w - w) > 20 || Math.abs(s.h - h) > 20 ? { w, h } : s));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Start the live map once; fall back to the image if it can't run or never loads.
  useEffect(() => {
    if (!box.current || !TOKEN) return;
    if (!webglAvailable()) {
      setMode("static");
      return;
    }
    let cancelled = false;
    let loaded = false;
    const giveUp = setTimeout(() => {
      if (!loaded && !cancelled) setMode("static");
    }, 12000);
    import("mapbox-gl")
      .then(({ default: mapboxgl }) => {
        if (cancelled || !box.current) return;
        mapboxgl.accessToken = TOKEN;
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
        const onStyle = () => {
          styleReady.current = true;
          loaded = true;
          clearTimeout(giveUp);
          setReady(true);
          draw();
        };
        m.on("style.load", onStyle);
        m.on("load", onStyle);
        // "style.load" can be missed; the first styledata after a (re)load is enough.
        m.on("styledata", () => {
          if (!styleReady.current) onStyle();
        });
        m.on("error", (e) => {
          const msg = String((e as { error?: { message?: string } }).error?.message || "");
          if (!loaded && /webgl|context|401|403|style/i.test(msg)) setMode("static");
        });
        map.current = m;
      })
      .catch(() => setMode("static"));
    return () => {
      cancelled = true;
      clearTimeout(giveUp);
      markers.current.forEach((mk) => mk.remove());
      try {
        map.current?.remove();
      } catch {}
      map.current = null;
    };
  }, [draw]);

  // Follow the app theme.
  useEffect(() => {
    if (ready && map.current) {
      styleReady.current = false; // until the new style's "style.load"
      map.current.setStyle(STYLE[resolved]);
    }
  }, [resolved, ready]);

  // Redraw when the route or stop types change.
  useEffect(() => {
    if (ready) draw();
  }, [route, types, ready, draw]);

  // Full screen: the same map fills the window. Esc or the button returns it.
  const [full, setFull] = useState(false);
  useEffect(() => {
    // The map keeps its own canvas size; tell it the box changed, then re-fit the route.
    const t = setTimeout(() => {
      try {
        map.current?.resize();
      } catch {}
      if (ready) draw();
    }, 60);
    if (!full) return () => clearTimeout(t);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setFull(false);
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [full, ready, draw]);

  if (!TOKEN) {
    return (
      <div className={cn("flex items-center justify-center rounded-xl border border-line bg-surface-2 text-xs text-fg-4", className)}>
        Map unavailable (no Mapbox token)
      </div>
    );
  }
  const hasRoute = !!route && (route.line.length >= 2 || route.points.filter(Boolean).length >= 1);
  return (
    <div
      ref={wrap}
      className={cn(
        "overflow-hidden bg-surface-2",
        // In full screen the page's size classes are dropped so nothing (e.g. lg:h-64) caps the height.
        full ? "fixed inset-0 z-[75] h-dvh w-screen" : cn("relative rounded-xl border border-line", className),
      )}
      role={full ? "dialog" : undefined}
      aria-modal={full || undefined}
      aria-label={full ? "Route map, full screen" : undefined}
    >
      {mode === "gl" ? (
        // Sized with h-full/w-full, not absolute+inset: mapbox-gl.css sets `position: relative`
        // on the map element, which cancels `absolute` and collapsed the map to 0px tall.
        <div ref={box} className="h-full w-full" />
      ) : (
        hasRoute && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={staticUrl(route!, types, resolved, size.w, size.h)} alt="Route map" className="absolute inset-0 h-full w-full object-cover" />
        )
      )}
      {!route?.line?.length && !loading && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-xs text-fg-3">
          <MapPin className="h-4 w-4" />
          Add a pickup and a delivery to see the route
        </div>
      )}
      {loading && <div className="absolute left-12 top-3 rounded-md bg-surface/90 px-2 py-1 text-[11px] font-medium text-fg-2 shadow-sm">Routing…</div>}
      <button
        type="button"
        onClick={() => setFull((f) => !f)}
        className={cn(
          "absolute left-2.5 z-10 inline-flex h-[29px] items-center gap-1.5 rounded-[4px] bg-white px-[7px] text-[12px] font-semibold text-[#0a0a0d] shadow-[0_0_0_2px_rgba(0,0,0,0.1)] transition-colors hover:bg-zinc-100",
          full ? "top-[max(0.625rem,env(safe-area-inset-top))]" : "top-2.5",
        )}
        aria-label={full ? "Exit full screen" : "Open map full screen"}
        title={full ? "Exit full screen (Esc)" : "Full screen"}
      >
        {full ? <Minimize2 className="h-[15px] w-[15px]" /> : <Maximize2 className="h-[15px] w-[15px]" />}
        {full && <span className="pr-0.5">Exit</span>}
      </button>
    </div>
  );
}
