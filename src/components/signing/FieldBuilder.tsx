"use client";

import { useRef, useState } from "react";
import { Calendar, CheckSquare, PenLine, Plus, Signature, Trash2, Type, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Checkbox, Field, Input, Select } from "@/components/ui/Field";
import { cn } from "@/lib/format";
import { AUTO, FIELD_TYPES, TOSS, newFieldId, type AutoKey, type FieldType, type PageSize, type SignField, type SignRole } from "@/lib/signing";
import { PdfPages } from "./PdfPages";

const ICON: Record<FieldType, typeof Type> = { signature: Signature, initials: PenLine, date: Calendar, text: Type, checkbox: CheckSquare };
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
  const drag = useRef<{ id: string; mode: "move" | "size"; sx: number; sy: number; f: SignField; pw: number; ph: number } | null>(null);
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
      auto: tool === "date" ? "today" : null,
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
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
      <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
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
          <div className="grid grid-cols-2 gap-1.5">
            {FIELD_TYPES.map((t) => {
              const I = ICON[t.v];
              return (
                <button
                  key={t.v}
                  onClick={() => setTool(tool === t.v ? null : t.v)}
                  className={cn("flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-[13px]", tool === t.v ? "border-brand bg-brand/10 text-fg" : "border-line text-fg-2 hover:bg-surface-2")}
                >
                  <I className="h-4 w-4" /> {t.label}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-fg-3">{tool ? "Click on the page where it goes." : "Pick a field, then click on the page."}</p>
        </div>

        {selected && (
          <div className="rounded-lg border border-line p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold text-fg-2">Selected field</span>
              <button
                onClick={() => {
                  onFields(fields.filter((f) => f.id !== selected.id));
                  setSel(null);
                }}
                className="text-fg-4 hover:text-red-600"
                aria-label="Delete field"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-2">
              <Field label="Label">
                <Input value={selected.label} onChange={(e) => update(selected.id, { label: e.target.value })} />
              </Field>
              <Field label="Filled by">
                <Select value={selected.role} onChange={(e) => update(selected.id, { role: e.target.value })}>
                  {who.map((r) => (
                    <option key={r.key} value={r.key}>
                      {r.label}
                    </option>
                  ))}
                </Select>
              </Field>
              {(selected.type === "text" || selected.type === "date") && (
                <Field label="Fills itself with" hint={selected.role === TOSS ? "Filled in when sending; can still be changed." : "Shown filled in; the signer can change it."}>
                  <Select value={selected.auto || ""} onChange={(e) => update(selected.id, { auto: (e.target.value || null) as AutoKey | null })}>
                    <option value="">Nothing (typed)</option>
                    {AUTO.filter((a) => (selected.type === "date" ? a.v === "today" || a.v === "driver.dob" : true)).map((a) => (
                      <option key={a.v} value={a.v}>
                        {a.label}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}
              <Checkbox checked={selected.required} onChange={(v) => update(selected.id, { required: v })} label="Required" />
            </div>
          </div>
        )}
        <p className="text-xs text-fg-4">{fields.length} field{fields.length === 1 ? "" : "s"}</p>
      </aside>

      <div onPointerMove={onMove} onPointerUp={onUp} className={cn(tool && "cursor-crosshair")}>
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
                  return (
                    <div
                      key={f.id}
                      onPointerDown={(e) => onDown(e, f, "move")}
                      className={cn("pointer-events-auto absolute flex cursor-move items-center gap-1 overflow-hidden rounded-[3px] border px-1 text-[10px] font-medium", sel === f.id && "ring-2 ring-offset-1")}
                      style={{ left: `${f.x * 100}%`, top: `${f.y * 100}%`, width: `${f.w * 100}%`, height: `${f.h * 100}%`, borderColor: color, background: `${color}1f`, color, ["--tw-ring-color" as string]: color }}
                      title={`${f.label} · ${who.find((r) => r.key === f.role)?.label || ""}`}
                    >
                      {f.type !== "checkbox" && (
                        <>
                          <I className="h-3 w-3 shrink-0" />
                          <span className="truncate">{f.label}</span>
                        </>
                      )}
                      <span onPointerDown={(e) => onDown(e, f, "size")} className="absolute bottom-0 right-0 h-2 w-2 cursor-nwse-resize" style={{ background: color }} />
                    </div>
                  );
                })}
            </div>
          )}
        />
      </div>
    </div>
  );
}
