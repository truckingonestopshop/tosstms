"use client";

import { useRef, useState } from "react";
import { Copy, Plus, RotateCcw, Trash2, X, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Field";
import { cn } from "@/lib/format";
import { AUTO, FIELD_TYPES, TOSS, newFieldId, type FieldType, type PageSize, type SignField, type SignRole } from "@/lib/signing";
import { PdfPages } from "./PdfPages";
import { FieldSettings } from "./FieldSettings";
import { FIELD_ICON as ICON } from "./icons";
const COLORS = ["#2563eb", "#9333ea", "#0d9488", "#db2777", "#ca8a04"];
/** The colour of whoever fills a field (TOSS: grey). */
export const roleColor = (roles: SignRole[], role: string) => (role === TOSS ? "#71717a" : COLORS[Math.max(0, roles.findIndex((r) => r.key === role)) % COLORS.length]);

/**
 * Places fields on a PDF's pages: pick a field type and who fills it, click the page. Fields can
 * be dragged, resized (bottom-right corner) and edited (label, required, fills itself from…).
 */
export function FieldBuilder({
  src,
  pages,
  roles,
  fields,
  onRoles,
  onFields,
}: {
  src: string | Uint8Array | null;
  pages: PageSize[];
  roles: SignRole[];
  fields: SignField[];
  onRoles: (r: SignRole[]) => void;
  onFields: (f: SignField[]) => void;
}) {
  const [tool, setTool] = useState<FieldType | null>(null);
  const [role, setRole] = useState<string>(roles[0]?.key || TOSS);
  const [sel, setSel] = useState<string | null>(null);
  const [zoom, setZoom] = useState(100);
  const drag = useRef<{ id: string; mode: "move" | "size"; sx: number; sy: number; f: SignField; pw: number; ph: number } | null>(null);
  const pageEl = useRef<HTMLDivElement | null>(null);
  const selected = fields.find((f) => f.id === sel) || null;
  const who = [{ key: TOSS, label: "TOSS (before sending)" }, ...roles];

  const update = (id: string, p: Partial<SignField>) => onFields(fields.map((f) => (f.id === id ? { ...f, ...p } : f)));
  const place = (page: number, x: number, y: number) => {
    if (!tool) return setSel(null);
    const t = FIELD_TYPES.find((x) => x.v === tool)!;
    const f: SignField = {
      id: newFieldId(),
      type: tool,
      page,
      x: Math.min(Math.max(0, x - t.w / 2), 1 - t.w),
      y: Math.min(Math.max(0, y - t.h / 2), 1 - t.h),
      w: t.w,
      h: t.h,
      role,
      label: t.label,
      required: tool !== "checkbox",
      auto: t.auto ?? null,
      validation: t.validation ?? null,
      options: tool === "dropdown" || tool === "radio" ? ["Option 1", "Option 2"] : undefined,
    };
    onFields([...fields, f]);
    setSel(f.id);
  };
  const onDown = (e: React.PointerEvent, f: SignField, mode: "move" | "size") => {
    e.stopPropagation();
    e.preventDefault();
    const box = (e.currentTarget as HTMLElement).closest("[data-page]")!.getBoundingClientRect();
    drag.current = { id: f.id, mode, sx: e.clientX, sy: e.clientY, f, pw: box.width, ph: box.height };
    setSel(f.id);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = (e.clientX - d.sx) / d.pw;
    const dy = (e.clientY - d.sy) / d.ph;
    if (d.mode === "move") update(d.id, { x: Math.min(Math.max(0, d.f.x + dx), 1 - d.f.w), y: Math.min(Math.max(0, d.f.y + dy), 1 - d.f.h) });
    else update(d.id, { w: Math.min(Math.max(0.02, d.f.w + dx), 1 - d.f.x), h: Math.min(Math.max(0.015, d.f.h + dy), 1 - d.f.y) });
  };
  const onUp = () => {
    drag.current = null;
  };
  const addRole = () => {
    const n = roles.length + 1;
    const r = { key: `role${Date.now().toString(36)}`, label: `Signer ${n}` };
    onRoles([...roles, r]);
    setRole(r.key);
  };
  const removeRole = (key: string) => {
    if (roles.length <= 1) return;
    onRoles(roles.filter((r) => r.key !== key));
    onFields(fields.filter((f) => f.role !== key));
    if (role === key) setRole(roles.find((r) => r.key !== key)!.key);
  };

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[290px_minmax(0,1fr)]">
      <aside className="scrollbar-bold space-y-4 rounded-xl border border-line bg-surface p-3 lg:sticky lg:top-4 lg:max-h-[calc(100dvh-7rem)] lg:self-start lg:overflow-y-auto lg:overflow-x-auto">
        <div>
          <div className="mb-1.5 text-xs font-semibold text-fg-2">Who signs</div>
          <ul className="space-y-1.5">
            {roles.map((r) => (
              <li key={r.key} className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: roleColor(roles, r.key) }} />
                <Input value={r.label} onChange={(e) => onRoles(roles.map((x) => (x.key === r.key ? { ...x, label: e.target.value } : x)))} className="h-8" aria-label="Role name" />
                {roles.length > 1 && (
                  <button onClick={() => removeRole(r.key)} className="text-fg-4 hover:text-fg" aria-label={`Remove ${r.label}`}>
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </li>
            ))}
          </ul>
          <Button size="xs" variant="ghost" onClick={addRole} className="mt-1">
            <Plus className="h-3.5 w-3.5" /> Add signer
          </Button>
        </div>

        <div>
          <div className="mb-1.5 text-xs font-semibold text-fg-2">Add a field</div>
          <Select value={role} onChange={(e) => setRole(e.target.value)} className="mb-2" aria-label="Filled by">
            {who.map((r) => (
              <option key={r.key} value={r.key}>
                Filled by: {r.label}
              </option>
            ))}
          </Select>
          <div className="scrollbar-bold grid max-h-[260px] grid-cols-2 gap-1.5 overflow-y-auto pr-1">
            {FIELD_TYPES.map((t) => {
              const I = ICON[t.v];
              return (
                <button
                  key={t.v}
                  onClick={() => setTool(tool === t.v ? null : t.v)}
                  className={cn("flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-[13px]", tool === t.v ? "border-brand bg-brand/10 text-fg" : "border-line text-fg-2 hover:bg-surface-2")}
                >
                  <I className="h-4 w-4 shrink-0" /> <span className="truncate">{t.label}</span>
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-fg-3">{tool ? "Click on the page where it goes." : "Pick a field, then click on the page."}</p>
        </div>

        {selected && (
          <div className="rounded-lg border border-brand/50 bg-surface-2/40 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold text-fg-2">Selected field</span>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => {
                    const copy: SignField = { ...selected, id: newFieldId(), x: Math.min(selected.x + 0.02, 1 - selected.w), y: Math.min(selected.y + 0.02, 1 - selected.h) };
                    onFields([...fields, copy]);
                    setSel(copy.id);
                  }}
                  className="text-fg-4 hover:text-fg"
                  title="Duplicate field"
                  aria-label="Duplicate field"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => {
                    onFields(fields.filter((f) => f.id !== selected.id));
                    setSel(null);
                  }}
                  className="text-fg-4 hover:text-red-600"
                  title="Delete field"
                  aria-label="Delete field"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
            <FieldSettings field={selected} fields={fields} who={who} onChange={(p) => update(selected.id, p)} />
          </div>
        )}

        {fields.length > 0 && (
          <div className="rounded-lg border border-line p-2.5">
            <div className="mb-1.5 text-xs font-semibold text-fg-2">
              Placed fields ({fields.length})
            </div>
            <ul className="scrollbar-bold max-h-44 space-y-1 overflow-y-auto pr-1 text-xs">
              {fields.map((f) => (
                <li key={f.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setSel(f.id);
                      const el = pageEl.current?.querySelector(`[data-field-id="${f.id}"]`);
                      el?.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
                    }}
                    className={cn(
                      "flex w-full items-center gap-1.5 rounded px-2 py-1 text-left",
                      sel === f.id ? "bg-brand/15 font-semibold text-fg" : "text-fg-2 hover:bg-surface-2",
                    )}
                  >
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: roleColor(roles, f.role) }} />
                    <span className="truncate flex-1">{f.label}{f.value ? `: ${f.value}` : ""}</span>
                    <span className="shrink-0 text-[10px] text-fg-4">p.{f.page + 1}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </aside>

      <div className=" flex min-w-0 flex-col rounded-xl border border-line bg-surface-2/60">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-surface px-3 py-2 text-xs">
          <div className="flex items-center gap-2 text-fg-3">
            <span>{pages.length} page{pages.length === 1 ? "" : "s"}</span>
            {pages.length > 1 && (
              <div className="scrollbar-bold flex max-w-[260px] items-center gap-1 overflow-x-auto py-0.5 sm:max-w-md">
                {pages.map((_, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      const target = pageEl.current?.querySelectorAll("[data-pdf-page]")?.[idx];
                      target?.scrollIntoView({ behavior: "smooth", block: "start" });
                    }}
                    className="shrink-0 rounded border border-line bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-fg-2 hover:border-brand hover:text-fg"
                  >
                    Page {idx + 1}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(60, z - 15))}
              className="rounded border border-line bg-surface-2 p-1 text-fg-2 hover:text-fg"
              title="Zoom out"
              aria-label="Zoom out"
            >
              <ZoomOut className="h-3.5 w-3.5" />
            </button>
            <span className="tnum min-w-[44px] text-center font-medium text-fg-2">{zoom}%</span>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(200, z + 15))}
              className="rounded border border-line bg-surface-2 p-1 text-fg-2 hover:text-fg"
              title="Zoom in (enables horizontal scroll)"
              aria-label="Zoom in"
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </button>
            {zoom !== 100 && (
              <button
                type="button"
                onClick={() => setZoom(100)}
                className="rounded border border-line bg-surface-2 p-1 text-fg-3 hover:text-fg"
                title="Reset zoom"
                aria-label="Reset zoom"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        <div
          ref={pageEl}
          onPointerMove={onMove}
          onPointerUp={onUp}
          className={cn("scrollbar-bold max-h-[calc(100dvh-11rem)] overflow-y-auto overflow-x-auto p-3 sm:p-4", tool && "cursor-crosshair")}
        >
          <div style={{ width: `${zoom}%`, minWidth: zoom > 100 ? `${zoom * 7.2}px` : "520px" }} className="mx-auto">
            <PdfPages
              src={src}
              pages={pages}
              onPageClick={place}
              overlay={(page) => (
                <div data-page className="pointer-events-none absolute inset-0">
                  {fields
                    .filter((f) => f.page === page)
                    .map((f) => {
                      const color = roleColor(roles, f.role);
                      const I = ICON[f.type];
                      const autoText = f.auto ? AUTO.find((a) => a.v === f.auto)?.label : null;
                      return (
                        <div
                          key={f.id}
                          data-field-id={f.id}
                          onPointerDown={(e) => onDown(e, f, "move")}
                          onDoubleClick={(e) => {
                            e.stopPropagation();
                            if (f.type === "checkbox") update(f.id, { value: f.value === "true" ? null : "true" });
                          }}
                          className={cn("pointer-events-auto absolute flex cursor-move items-center gap-1 overflow-hidden rounded-[3px] border px-1 text-[10px] font-medium", sel === f.id && "ring-2 ring-offset-1")}
                          style={{ left: `${f.x * 100}%`, top: `${f.y * 100}%`, width: `${f.w * 100}%`, height: `${f.h * 100}%`, borderColor: color, background: `${color}1f`, color, ["--tw-ring-color" as string]: color }}
                          title={`${f.label}${f.value ? ` = "${f.value}"` : ""}${autoText ? ` (${autoText})` : ""} · ${who.find((r) => r.key === f.role)?.label || ""}`}
                        >
                          {f.type === "checkbox" ? (
                            f.value === "true" && <span className="mx-auto text-[11px] font-bold leading-none">✕</span>
                          ) : (
                            <>
                              <I className="h-3 w-3 shrink-0" />
                              <span className="truncate">{f.value ? `${f.label}: ${f.value}` : f.label}</span>
                            </>
                          )}
                          <span onPointerDown={(e) => onDown(e, f, "size")} className="absolute bottom-0 right-0 h-2.5 w-2.5 cursor-nwse-resize" style={{ background: color }} />
                        </div>
                      );
                    })}
                </div>
              )}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
