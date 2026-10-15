"use client";

import { useMemo, useRef, useState } from "react";
import { cn } from "@/lib/format";

// Small, dependency-free SVG charts. One series per chart (one axis, one color),
// recessive grid, hover tooltip on every mark.

export interface Datum {
  label: string;
  value: number;
  sub?: string;
}

function niceMax(v: number) {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return step * p;
}

function Frame({
  data,
  format,
  height,
  children,
}: {
  data: Datum[];
  format: (v: number) => string;
  height: number;
  children: (args: { w: number; h: number; x: (i: number) => number; y: (v: number) => number; bw: number; max: number }) => React.ReactNode;
}) {
  const max = useMemo(() => niceMax(Math.max(0, ...data.map((d) => d.value))), [data]);
  const W = 1000;
  const padL = 0;
  const h = height - 22;
  const n = Math.max(1, data.length);
  const slot = (W - padL) / n;
  const bw = Math.max(2, Math.min(36, slot * 0.62));
  const x = (i: number) => padL + slot * i + slot / 2;
  const y = (v: number) => h - (v / max) * (h - 8);
  const ticks = [0, 0.5, 1];
  return (
    <div className="relative pr-12">
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" className="block w-full overflow-visible" style={{ height }}>
          {ticks.map((t) => (
            <line key={t} x1={0} x2={W} y1={y(max * t)} y2={y(max * t)} stroke="var(--line)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          ))}
          {children({ w: W, h, x, y, bw, max })}
        </svg>
        <XLabels data={data} />
      </div>
      {/* Y axis in its own gutter so it never covers a mark. */}
      <div className="pointer-events-none absolute right-0 top-0 w-11 text-[10px] text-fg-4" style={{ height: h }}>
        <span className="tnum absolute left-1.5" style={{ top: `${(y(max) / h) * 100}%`, transform: "translateY(-50%)" }}>
          {format(max)}
        </span>
        <span className="tnum absolute left-1.5" style={{ top: `${(y(max / 2) / h) * 100}%`, transform: "translateY(-50%)" }}>
          {format(max / 2)}
        </span>
        <span className="tnum absolute bottom-0 left-1.5 translate-y-1/2">{format(0)}</span>
      </div>
    </div>
  );
}

function XLabels({ data }: { data: Datum[] }) {
  const every = Math.ceil(data.length / 8);
  return (
    <div className="absolute inset-x-0 bottom-0 flex h-[18px]">
      {data.map((d, i) => (
        <div key={i} className="min-w-0 flex-1 truncate text-center text-[10px] text-fg-4">
          {i % every === 0 || i === data.length - 1 ? d.label : ""}
        </div>
      ))}
    </div>
  );
}

function useHover() {
  const [i, setI] = useState<number | null>(null);
  return { i, setI };
}

function Tip({ d, format, i, n }: { d: Datum; format: (v: number) => string; i: number; n: number }) {
  const frac = (i + 0.5) / n;
  return (
    <div
      className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 whitespace-nowrap rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs shadow-pop"
      style={{ left: `clamp(60px, calc((100% - 48px) * ${frac}), calc(100% - 60px))` }}
    >
      <div className="text-fg-3">{d.label}</div>
      <div className="tnum font-semibold text-fg">{format(d.value)}</div>
      {d.sub && <div className="text-fg-3">{d.sub}</div>}
    </div>
  );
}

export function BarChart({ data, format, height = 200, className }: { data: Datum[]; format: (v: number) => string; height?: number; className?: string }) {
  const { i, setI } = useHover();
  const box = useRef<HTMLDivElement>(null);
  return (
    <div
      ref={box}
      className={cn("relative select-none", className)}
      onMouseLeave={() => setI(null)}
      onMouseMove={(e) => {
        const r = box.current!.getBoundingClientRect();
        const k = Math.floor(((e.clientX - r.left) / (r.width - 48)) * data.length);
        setI(Math.max(0, Math.min(data.length - 1, k)));
      }}
    >
      <Frame data={data} format={format} height={height}>
        {({ x, y, bw, h }) =>
          data.map((d, k) => {
            const top = y(d.value);
            const bh = Math.max(0, h - top);
            const r = Math.min(4, bw / 2, bh);
            const x0 = x(k) - bw / 2;
            return (
              <g key={k}>
                {bh > 0 && (
                  <path
                    d={`M${x0},${h} V${top + r} Q${x0},${top} ${x0 + r},${top} H${x0 + bw - r} Q${x0 + bw},${top} ${x0 + bw},${top + r} V${h} Z`}
                    fill="var(--chart-1)"
                    opacity={i === null || i === k ? 1 : 0.45}
                  />
                )}
              </g>
            );
          })
        }
      </Frame>
      {i !== null && data[i] && <Tip d={data[i]} format={format} i={i} n={data.length} />}
    </div>
  );
}

export function LineChart({ data, format, height = 200, className }: { data: Datum[]; format: (v: number) => string; height?: number; className?: string }) {
  const { i, setI } = useHover();
  const box = useRef<HTMLDivElement>(null);
  return (
    <div
      ref={box}
      className={cn("relative select-none", className)}
      onMouseLeave={() => setI(null)}
      onMouseMove={(e) => {
        const r = box.current!.getBoundingClientRect();
        const k = Math.floor(((e.clientX - r.left) / (r.width - 48)) * data.length);
        setI(Math.max(0, Math.min(data.length - 1, k)));
      }}
    >
      <Frame data={data} format={format} height={height}>
        {({ x, y, h }) => {
          const pts = data.map((d, k) => ({ k, d, px: x(k), py: y(d.value) })).filter((p) => p.d.value > 0);
          const path = pts.map((p, n) => `${n ? "L" : "M"}${p.px},${p.py}`).join(" ");
          return (
            <>
              <path d={path} fill="none" stroke="var(--chart-1)" strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
              {i !== null && <line x1={x(i)} x2={x(i)} y1={0} y2={h} stroke="var(--line-strong)" strokeWidth={1} vectorEffect="non-scaling-stroke" />}
            </>
          );
        }}
      </Frame>
      {/* Markers as HTML so they stay round in a stretched SVG. */}
      <div className="pointer-events-none absolute left-0 right-12 top-0" style={{ height: height - 22 }}>
        {data.map((d, k) =>
          d.value > 0 && (i === k || data.length <= 31) ? (
            <span
              key={k}
              className={cn("absolute rounded-full border-2 border-surface bg-chart-1", i === k ? "h-3 w-3" : "h-2 w-2")}
              style={{
                left: `${((k + 0.5) / data.length) * 100}%`,
                top: `${(1 - d.value / niceMax(Math.max(0, ...data.map((x) => x.value)))) * ((height - 22 - 8) / (height - 22)) * 100}%`,
                transform: "translate(-50%, -50%)",
              }}
            />
          ) : null,
        )}
      </div>
      {i !== null && data[i] && <Tip d={data[i]} format={format} i={i} n={data.length} />}
    </div>
  );
}

/** Ranked table with an inline magnitude bar (one color). */
export function RankTable({
  rows,
  columns,
  barOf,
  empty = "No data",
  limit = 10,
}: {
  rows: { key: string; name: React.ReactNode }[];
  columns: { label: string; value: (i: number) => React.ReactNode; className?: string }[];
  barOf: (i: number) => number;
  empty?: string;
  limit?: number;
}) {
  const [all, setAll] = useState(false);
  const max = Math.max(1, ...rows.map((_, i) => barOf(i)));
  const shown = all ? rows : rows.slice(0, limit);
  if (!rows.length) return <div className="px-4 py-8 text-center text-[13px] text-fg-4">{empty}</div>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-[13px]">
        <thead>
          <tr className="border-b border-line text-[11px] font-semibold uppercase tracking-wider text-fg-4">
            <th className="px-4 py-2">Name</th>
            {columns.map((c) => (
              <th key={c.label} className={cn("whitespace-nowrap px-3 py-2 text-right", c.className)}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {shown.map((r, i) => (
            <tr key={r.key} className="hover:bg-surface-2/50">
              <td className="max-w-[220px] px-4 py-2">
                <div className="truncate text-fg">{r.name}</div>
                <div className="mt-1 h-1 rounded-full bg-surface-2">
                  <div className="h-1 rounded-full bg-chart-1" style={{ width: `${(barOf(i) / max) * 100}%` }} />
                </div>
              </td>
              {columns.map((c) => (
                <td key={c.label} className={cn("tnum whitespace-nowrap px-3 py-2 text-right text-fg-2", c.className)}>
                  {c.value(rows.indexOf(r))}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > limit && (
        <button onClick={() => setAll((a) => !a)} className="w-full border-t border-line py-2 text-xs font-medium text-fg-3 hover:text-fg">
          {all ? "Show less" : `Show all ${rows.length}`}
        </button>
      )}
    </div>
  );
}
