"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Copy, Loader2, Maximize2, Minimize2, Phone, Search, Truck as TruckIcon, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, Empty } from "@/components/ui/Bits";
import { Checkbox, Input, Select } from "@/components/ui/Field";
import { PlaceInput } from "@/components/ui/PlaceInput";
import { useStore } from "@/lib/store";
import { hasService } from "@/lib/services";
import { toast } from "@/lib/toast";
import { cn, today } from "@/lib/format";
import { equipmentLine, pitchFor } from "@/lib/pitch";
import { ROAD_FACTOR, airMiles, at, between, fmtMoment, fmtSpan, nowMin, truckSpots, verdict, type LngLat, type TruckSpot, type Verdict } from "@/lib/truckmap";
import { FleetMap, type MapDot } from "./FleetMap";
import { liftAncestors } from "./RouteMap";

// Map points for places, shared by every visit to the page.
const geoCache = new Map<string, LngLat | null>();
const roadCache = new Map<string, number | null>();

/** Map points for `places`, fetched once each; `pending` while some are still being looked up. */
function useGeo(places: string[]) {
  const [v, bump] = useState(0);
  const key = [...new Set(places.filter(Boolean))].sort().join("|");
  useEffect(() => {
    const missing = key.split("|").filter((p) => p && !geoCache.has(p));
    if (!missing.length) return;
    fetch("/api/geo", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ places: missing }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { points?: Record<string, LngLat | null> } | null) => {
        for (const p of missing) geoCache.set(p, d?.points?.[p] ?? null);
        bump((x) => x + 1);
      })
      .catch(() => {
        for (const p of missing) geoCache.set(p, null);
        bump((x) => x + 1);
      });
  }, [key]);
  return {
    v,
    get: (p: string | null | undefined) => (p ? (geoCache.get(p) ?? null) : null),
    pending: key.split("|").some((p) => p && !geoCache.has(p)),
  };
}

const COLOR: Record<Verdict | "empty" | "loaded" | "later", string> = {
  makes: "#16a34a",
  tight: "#d97706",
  late: "#71717a",
  empty: "#16a34a",
  loaded: "#2563eb",
  later: "#71717a",
};
const VERDICT_LABEL: Record<Verdict, string> = {
  makes: "Makes it",
  tight: "Tight",
  late: "Too late",
};
const PILL: Record<Verdict, string> = {
  makes: "bg-emerald-500/10 text-emerald-600 ring-emerald-500/25 dark:text-emerald-400",
  tight: "bg-amber-500/10 text-amber-600 ring-amber-500/25 dark:text-amber-400",
  late: "bg-surface-2 text-fg-3 ring-line",
};

interface Row {
  spot: TruckSpot;
  /** where the dot sits: the empty point (search) or where it is now */
  point: LngLat | null;
  /** loaded right now: estimated position on the way to the delivery */
  nowPoint: LngLat | null;
  miles: number | null;
  /** straight-line estimate while road miles load */
  est: boolean;
  v: ReturnType<typeof verdict> | null;
}

/**
 * Truck Map (Loads → Map): where every truck is or will be empty, from the loads and the Units
 * desk. Type the broker's pickup city and date to see deadhead miles and who can make it.
 */
export function TruckMap() {
  const { trucks, loads, companies, inScope, scope, driverById, companyById, trailerById, memberById, me } = useStore();
  const [city, setCity] = useState("");
  const [target, setTarget] = useState("");
  const [day, setDay] = useState(today());
  const [time, setTime] = useState("");
  const [equip, setEquip] = useState("all");
  const [maxDh, setMaxDh] = useState(0);
  const [hideLate, setHideLate] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [full, setFull] = useState(false);
  const [now, setNow] = useState(() => nowMin());
  const [roadV, bumpRoad] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setNow(nowMin()), 60000);
    return () => clearInterval(t);
  }, []);

  // Full screen: the whole view fills the window; Esc closes it.
  const [wrap, setWrap] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!full) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const restore = liftAncestors(wrap);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setFull(false);
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      restore();
      window.removeEventListener("keydown", onKey);
    };
  }, [full, wrap]);

  const dispatchCo = useMemo(() => new Set(companies.filter((c) => hasService(c, "dispatch")).map((c) => c.id)), [companies]);
  const fleet = useMemo(() => trucks.filter((t) => t.status === "active" && inScope(t.company_id) && dispatchCo.has(t.company_id)), [trucks, inScope, dispatchCo]);
  const equipment = useMemo(() => [...new Set(fleet.map((t) => t.trailer_type).filter((x): x is string => !!x))].sort(), [fleet]);

  const searching = !!target;
  const deadline = at(day, time || "17:00");
  const when = searching ? deadline : now;
  const spots = useMemo(() => truckSpots(fleet, loads, when, now), [fleet, loads, when, now]);

  const geo = useGeo([target, ...spots.flatMap((s) => [s.empty || "", s.now?.leg.from || "", s.now?.leg.to || ""])]);
  const targetPt = geo.get(target);

  const rows: Row[] = useMemo(() => {
    return spots.map((s) => {
      const point = geo.get(s.empty);
      const a = geo.get(s.now?.leg.from);
      const b = geo.get(s.now?.leg.to);
      const nowPoint = s.now && a && b ? between(a, b, s.now.progress) : null;
      if (!searching || !targetPt || !point || s.emptyAt == null)
        return {
          spot: s,
          point: searching ? point : nowPoint || point,
          nowPoint,
          miles: null,
          est: false,
          v: null,
        };
      const road = roadCache.get(`${s.empty}>${target}`);
      const miles = road ?? Math.round(airMiles(point, targetPt) * ROAD_FACTOR);
      return {
        spot: s,
        point,
        nowPoint,
        miles,
        est: road == null,
        v: verdict(s.emptyAt, miles, deadline),
      };
    });
    // geo / roadCache are read through refs that change with every lookup.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spots, searching, targetPt, target, deadline, geo.v, roadV]);

  // Real road miles for the 48 closest empty points (one call per 24).
  useEffect(() => {
    if (!searching || !targetPt) return;
    const todo = rows
      .filter((r) => r.point && r.spot.empty && !roadCache.has(`${r.spot.empty}>${target}`))
      .sort((a, b) => (a.miles ?? 1e9) - (b.miles ?? 1e9))
      .slice(0, 48);
    const uniq = [...new Map(todo.map((r) => [r.spot.empty!, r.point!])).entries()];
    if (!uniq.length) return;
    fetch("/api/geo", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ to: targetPt, from: uniq.map(([, p]) => p) }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { miles?: (number | null)[] } | null) => {
        uniq.forEach(([place], i) => roadCache.set(`${place}>${target}`, d?.miles?.[i] ?? null));
        bumpRoad((x) => x + 1);
      })
      .catch(() => {});
  }, [rows, searching, targetPt, target]);

  const shown = useMemo(() => {
    let list = rows.filter((r) => equip === "all" || r.spot.truck.trailer_type === equip);
    if (searching) {
      if (maxDh) list = list.filter((r) => r.miles == null || r.miles <= maxDh);
      if (hideLate) list = list.filter((r) => r.v?.verdict !== "late");
      return list.sort((a, b) => (a.miles ?? 1e9) - (b.miles ?? 1e9));
    }
    return list.sort(
      (a, b) =>
        (companyById(a.spot.truck.company_id)?.name || "").localeCompare(companyById(b.spot.truck.company_id)?.name || "") ||
        a.spot.truck.unit_number.localeCompare(b.spot.truck.unit_number, undefined, { numeric: true }),
    );
  }, [rows, equip, searching, maxDh, hideLate, companyById]);

  const located = shown.filter((r) => r.point);
  const unknown = shown.filter((r) => !r.point && !geo.pending);

  const colorOf = (r: Row) => {
    if (r.v) return COLOR[r.v.verdict];
    if (r.spot.now) return COLOR.loaded;
    return r.spot.emptyAt != null && r.spot.emptyAt > now ? COLOR.later : COLOR.empty;
  };
  const dots: MapDot[] = located.map((r) => ({
    id: r.spot.truck.id,
    point: r.point!,
    label: r.spot.truck.unit_number.replace(/^#/, ""),
    color: colorOf(r),
    title: `#${r.spot.truck.unit_number} · ${driverById(r.spot.driverId)?.name || "No driver"}${r.spot.empty ? ` · ${r.spot.empty}` : ""}`,
  }));
  // Loaded trucks: a dashed line from where they are now to where they'll be empty.
  const lines = shown
    .map((r) => {
      const to = searching ? r.point : geo.get(r.spot.now?.leg.to);
      return r.nowPoint && to && airMiles(r.nowPoint, to) > 5 ? { id: r.spot.truck.id, from: r.nowPoint, to } : null;
    })
    .filter((x): x is { id: string; from: LngLat; to: LngLat } => !!x);
  // A search shows the pickup city with at least its 150 mi ring, plus the closest trucks.
  const focus: LngLat[] =
    searching && targetPt
      ? [[targetPt[0] - 2.8, targetPt[1] - 2.2], [targetPt[0] + 2.8, targetPt[1] + 2.2], ...located.slice(0, 6).map((r) => r.point!)]
      : located.map((r) => r.point!);
  const fitKey = searching ? `t:${target}:${located.length > 0}` : `now:${scope}:${located.length}`;

  const find = (p = city) => {
    const v = p.trim();
    if (!v) return;
    setTarget(v);
    setSelected(null);
  };
  const clear = () => {
    setTarget("");
    setCity("");
    setSelected(null);
  };

  const copyPitch = (r: Row) => {
    const t = r.spot.truck;
    navigator.clipboard.writeText(pitchFor(t, companyById(t.company_id), driverById(r.spot.driverId), trailerById(t.trailer_id), memberById(me.id)));
    toast.success(`Truck #${t.unit_number} copied`);
  };

  if (!fleet.length) {
    return (
      <Card>
        <Empty icon={TruckIcon} title="No active trucks" body="Trucks of carriers with the Dispatch service show on the map. Add trucks under Fleet & Company." />
      </Card>
    );
  }

  return (
    <div ref={setWrap} className={cn(full && "fixed inset-0 z-[75] flex flex-col gap-3 bg-bg p-3 pt-[max(0.75rem,env(safe-area-inset-top))]")}>
      {/* Search: the broker's pickup city, day and time */}
      <Card className={cn("p-3", !full && "mb-3")}>
        <form
          className="flex flex-col gap-2 lg:flex-row lg:items-center"
          onSubmit={(e) => {
            e.preventDefault();
            find();
          }}
        >
          <PlaceInput
            value={city}
            onChange={setCity}
            onPick={(p) => {
              setCity(p);
              find(p);
            }}
            placeholder="Pickup city, ST or ZIP (e.g. Dallas, TX)"
            className="lg:flex-1"
          />
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <Input type="date" value={day} onChange={(e) => setDay(e.target.value || today())} aria-label="Pickup date" className="sm:w-40" />
            <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} aria-label="Pickup time" title="Pickup time (empty = by 5 PM)" className="sm:w-32" />
            <Select value={equip} onChange={(e) => setEquip(e.target.value)} aria-label="Equipment" className="sm:w-40">
              <option value="all">All equipment</option>
              {equipment.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </Select>
            <Select value={String(maxDh)} onChange={(e) => setMaxDh(Number(e.target.value))} aria-label="Max deadhead" className="sm:w-36" disabled={!searching}>
              <option value="0">Any deadhead</option>
              <option value="100">≤ 100 mi</option>
              <option value="200">≤ 200 mi</option>
              <option value="300">≤ 300 mi</option>
              <option value="500">≤ 500 mi</option>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Button type="submit" variant="primary" disabled={!city.trim()}>
              <Search className="h-4 w-4" /> Find trucks
            </Button>
            {searching && (
              <Button type="button" variant="ghost" onClick={clear}>
                <X className="h-4 w-4" /> Clear
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => setFull((f) => !f)}
              aria-label={full ? "Exit full screen" : "Full screen"}
              title={full ? "Exit full screen (Esc)" : "Full screen"}
            >
              {full ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </Button>
          </div>
        </form>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-fg-3">
          {searching ? (
            <>
              <span>
                Pickup <b className="text-fg">{target}</b> · {fmtMoment(deadline)}
                {!time && " (no time: by 5 PM)"}
              </span>
              {!targetPt && !geo.pending && <span className="text-amber-600 dark:text-amber-400">City not found. Try “City, ST”.</span>}
              <Checkbox checked={hideLate} onChange={setHideLate} label="Hide trucks that can't make it" />
            </>
          ) : (
            <span>Now: where every truck is, from its loads and the Units desk. Type the broker&apos;s city to find the closest empty trucks.</span>
          )}
          <span className="ml-auto flex flex-wrap items-center gap-3">
            {(searching
              ? [
                  ["Makes it", COLOR.makes],
                  ["Tight", COLOR.tight],
                  ["Too late", COLOR.late],
                ]
              : [
                  ["Empty", COLOR.empty],
                  ["On a load", COLOR.loaded],
                  ["Ready later", COLOR.later],
                ]
            ).map(([l, c]) => (
              <span key={l} className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: c }} />
                {l}
              </span>
            ))}
          </span>
        </div>
      </Card>

      <div className={cn("grid gap-3 lg:grid-cols-[minmax(0,1fr)_400px]", full && "min-h-0 flex-1")}>
        <FleetMap
          dots={dots}
          lines={lines}
          target={searching ? targetPt : null}
          focus={focus}
          fitKey={fitKey}
          selected={selected}
          onSelect={setSelected}
          className={full ? "h-[45dvh] lg:h-full" : "h-[380px] lg:h-[640px]"}
        />
        <Card className={cn("flex min-h-0 flex-col", full ? "lg:h-full" : "lg:h-[640px]")}>
          <div className="flex items-center justify-between border-b border-line px-4 py-2.5 text-xs text-fg-3">
            <span>
              <b className="text-fg">{shown.length}</b> truck
              {shown.length === 1 ? "" : "s"}
              {searching ? " · closest first" : ""}
            </span>
            {geo.pending && (
              <span className="inline-flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" /> Finding places…
              </span>
            )}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {shown.length === 0 && <div className="px-4 py-10 text-center text-sm text-fg-4">No trucks match these filters.</div>}
            {[...located, ...unknown].map((r) => (
              <TruckRow
                key={r.spot.truck.id}
                r={r}
                now={now}
                searching={searching}
                selected={selected === r.spot.truck.id}
                onSelect={() => setSelected(r.spot.truck.id)}
                onCopy={() => copyPitch(r)}
                company={scope === "all" ? companyById(r.spot.truck.company_id)?.name : undefined}
                driver={driverById(r.spot.driverId)}
                color={colorOf(r)}
              />
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

function TruckRow({
  r,
  now,
  searching,
  selected,
  onSelect,
  onCopy,
  company,
  driver,
  color,
}: {
  r: Row;
  now: number;
  searching: boolean;
  selected: boolean;
  onSelect: () => void;
  onCopy: () => void;
  company?: string;
  driver?: { name: string; phone: string | null };
  color: string;
}) {
  const { spot: s, v } = r;
  const t = s.truck;
  const emptyLine = s.empty == null ? "Location unknown: set “Truck at” on Units" : s.emptyAt == null || s.emptyAt <= now ? `Empty now · ${s.empty}` : `Empty ${fmtMoment(s.emptyAt)} · ${s.empty}`;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => e.key === "Enter" && onSelect()}
      className={cn("cursor-pointer border-b border-line px-4 py-3 last:border-b-0 hover:bg-surface-2/60", selected && "bg-surface-2")}
    >
      <div className="flex items-start gap-2.5">
        <span className="tnum mt-0.5 inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-[10.5px] font-bold text-white" style={{ background: color }}>
          {t.unit_number.replace(/^#/, "")}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate text-[13px] font-semibold text-fg">
                #{t.unit_number.replace(/^#/, "")} · {driver?.name || <span className="text-amber-600 dark:text-amber-400">No driver</span>}
              </div>
              <div className="truncate text-xs text-fg-3">{[company, equipmentLine(t)].filter(Boolean).join(" · ")}</div>
            </div>
            {searching && r.miles != null && (
              <div className="shrink-0 text-right">
                <div className="tnum text-[13px] font-semibold text-fg">
                  {r.est && "~"}
                  {r.miles.toLocaleString("en-US")} mi
                </div>
                <div className="text-[10px] text-fg-4">deadhead</div>
              </div>
            )}
          </div>

          {v && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset", PILL[v.verdict])}>{VERDICT_LABEL[v.verdict]}</span>
              <span className="text-[11px] text-fg-3">
                {v.verdict === "late" ? `${fmtSpan(v.spare)} late` : `${fmtSpan(v.spare)} to spare`} · there {fmtMoment(v.arrive)}
              </span>
            </div>
          )}

          <div className="mt-1.5 space-y-0.5 text-xs text-fg-2">
            <div className={cn(s.empty == null && "text-fg-4")}>
              {emptyLine}
              {s.source === "units" && <span className="text-fg-4"> (Units)</span>}
              {s.source === "load" && s.leg?.guessed && s.emptyAt != null && s.emptyAt > now && <span className="text-fg-4"> (no delivery time, est.)</span>}
            </div>
            {s.now && (
              <div className="text-fg-3">
                On load: {s.now.leg.from} → {s.now.leg.to}
                {s.now.leg.load.load_number ? ` · #${s.now.leg.load.load_number}` : ""}
              </div>
            )}
            {s.next && (
              <div className={cn(searching ? "text-amber-600 dark:text-amber-400" : "text-fg-3")}>
                Next pickup {fmtMoment(s.next.start)} · {s.next.from}
                {searching && " (check it doesn't clash)"}
              </div>
            )}
            {s.stale && (
              <div className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                <AlertTriangle className="h-3 w-3" /> Delivery date passed, check the load status
              </div>
            )}
          </div>

          {selected && (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              <Button
                size="xs"
                variant="outline"
                onClick={(e) => {
                  e.stopPropagation();
                  onCopy();
                }}
              >
                <Copy className="h-3.5 w-3.5" /> Copy pitch
              </Button>
              {driver?.phone && (
                <a
                  href={`tel:${driver.phone}`}
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-line px-2.5 text-xs font-medium text-fg hover:bg-surface-2"
                >
                  <Phone className="h-3.5 w-3.5" /> Call {driver.name.split(" ")[0]}
                </a>
              )}
              <Link
                href={`/fleet?company=${t.company_id}&tab=units`}
                onClick={(e) => e.stopPropagation()}
                className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-line px-2.5 text-xs font-medium text-fg hover:bg-surface-2"
              >
                <TruckIcon className="h-3.5 w-3.5" /> Open in Units
              </Link>
              {s.leg && (
                <Link
                  href={`/loads/${s.leg.load.id}`}
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-line px-2.5 text-xs font-medium text-fg hover:bg-surface-2"
                >
                  Load {s.leg.load.load_number ? `#${s.leg.load.load_number}` : ""}
                </Link>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
