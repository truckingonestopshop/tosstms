"use client";

import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Checkbox, Field, Input, Select } from "@/components/ui/Field";
import { AUTO, TEXTLIKE, VALIDATIONS, inferAutoKey, type AutoKey, type SignField, type SignRole, type Validation } from "@/lib/signing";

/**
 * The settings of one field (both builders): label, who fills it, saved text/default value,
 * required, read-only, what it fills itself with, choices, format check, "only show when…", and a formula.
 */
export function FieldSettings({
  field: f,
  fields,
  who,
  onChange,
  written,
}: {
  field: SignField;
  fields: SignField[];
  who: SignRole[];
  onChange: (p: Partial<SignField>) => void;
  written?: boolean;
}) {
  const others = fields.filter((x) => x.id !== f.id && (x.type === "checkbox" || x.type === "dropdown" || x.type === "radio"));
  const src = fields.find((x) => x.id === f.showIf?.field);
  const typed = TEXTLIKE.includes(f.type) && f.type !== "dropdown" && f.type !== "radio";
  return (
    <div className="space-y-2">
      <Field label="Label">
        <Input
          value={f.label}
          onChange={(e) => {
            const label = e.target.value;
            const inferred = !f.auto && !f.value ? inferAutoKey(label, f.type) : null;
            onChange(inferred ? { label, auto: inferred } : { label });
          }}
        />
      </Field>
      <Field label="Filled by">
        <Select value={f.role} onChange={(e) => onChange({ role: e.target.value })}>
          {who.map((r) => (
            <option key={r.key} value={r.key}>
              {r.label}
            </option>
          ))}
        </Select>
      </Field>
      {written && f.role !== "toss" && f.type !== "checkbox" && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-fg-2">Box size (px)</span>
            <div className="flex gap-1">
              {[
                { label: "Auto", w: 0, h: 0 },
                { label: "Compact", w: 95, h: f.type === "radio" ? 32 : 20 },
                { label: "Medium", w: 150, h: f.type === "radio" ? 38 : 22 },
                { label: "Wide", w: 230, h: f.type === "radio" ? 44 : 24 },
              ].map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => onChange({ w: p.w, h: p.h })}
                  className="rounded border border-line bg-surface px-1.5 py-0.5 text-[10px] font-medium text-fg-2 hover:border-brand hover:text-fg"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Width (px)" hint="Default: auto / fits cell">
              <Input
                type="number"
                min={32}
                max={600}
                value={f.w && f.w >= 20 ? String(Math.round(f.w)) : ""}
                onChange={(e) => {
                  const n = parseInt(e.target.value, 10);
                  onChange({ w: Number.isFinite(n) && n > 0 ? n : 0 });
                }}
                placeholder="Auto"
              />
            </Field>
            <Field label="Height (px)" hint="Default: auto">
              <Input
                type="number"
                min={16}
                max={240}
                value={f.h && f.h >= 12 ? String(Math.round(f.h)) : ""}
                onChange={(e) => {
                  const n = parseInt(e.target.value, 10);
                  onChange({ h: Number.isFinite(n) && n > 0 ? n : 0 });
                }}
                placeholder="Auto"
              />
            </Field>
          </div>
        </div>
      )}

      {typed && (
        <Field label="Text / default value" hint="Saved on the template so you don't have to retype it next time.">
          <Input
            value={f.value || ""}
            onChange={(e) => onChange({ value: e.target.value || null })}
            placeholder={f.auto ? "Optional fallback if database is empty" : "Type text to keep on this template…"}
          />
        </Field>
      )}
      {f.type === "checkbox" && (
        <Checkbox checked={f.value === "true"} onChange={(v) => onChange({ value: v ? "true" : null })} label="Checked by default on template" />
      )}

      {(f.type === "dropdown" || f.type === "radio") && (
        <Field label="Choices">
          <div className="scrollbar-bold max-h-40 space-y-1 overflow-y-auto pr-1">
            {(f.options || []).map((o, i) => (
              <div key={i} className="flex items-center gap-1">
                <Input value={o} onChange={(e) => onChange({ options: (f.options || []).map((x, j) => (j === i ? e.target.value : x)) })} className="h-8" aria-label={`Choice ${i + 1}`} />
                <button onClick={() => onChange({ options: (f.options || []).filter((_, j) => j !== i) })} className="text-fg-4 hover:text-fg" aria-label="Remove choice">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            <Button size="xs" variant="ghost" onClick={() => onChange({ options: [...(f.options || []), `Option ${(f.options?.length || 0) + 1}`] })}>
              <Plus className="h-3.5 w-3.5" /> Add choice
            </Button>
          </div>
          {(f.options || []).length > 0 && (
            <div className="mt-1.5">
              <Select value={f.value || ""} onChange={(e) => onChange({ value: e.target.value || null })} aria-label="Default choice">
                <option value="">No default choice</option>
                {(f.options || []).map((o) => (
                  <option key={o} value={o}>
                    Default: {o}
                  </option>
                ))}
              </Select>
            </div>
          )}
        </Field>
      )}

      {typed && (
        <Field label="Fills itself with (database)" hint={f.role === "toss" ? "Filled in when sending; can still be changed." : f.type === "fillable_date" ? "Leave as Nothing so the signer enters the date manually." : "Auto-fills when you pick the person / company."}>
          <Select value={f.auto || ""} onChange={(e) => onChange({ auto: (e.target.value || null) as AutoKey | null })}>
            <option value="">{f.type === "fillable_date" ? "Nothing (manual date entered by signer)" : "Nothing (fixed / typed text)"}</option>
            {AUTO.filter((a) => (f.type === "date" || f.type === "fillable_date" ? a.v === "today" || a.v === "driver.dob" || a.v === "driver.license_expiry" || a.v === "driver.medical_expiry" || a.v === "driver.hire_date" : true)).map((a) => (
              <option key={a.v} value={a.v}>
                {a.label}
              </option>
            ))}
          </Select>
        </Field>
      )}

      {typed && f.type !== "date" && f.type !== "fillable_date" && (
        <Field label="Format check">
          <Select value={f.validation || ""} onChange={(e) => onChange({ validation: (e.target.value || null) as Validation | null })}>
            <option value="">None</option>
            {VALIDATIONS.map((v) => (
              <option key={v.v} value={v.v}>
                {v.label} ({v.hint})
              </option>
            ))}
          </Select>
        </Field>
      )}

      {f.type === "number" && (
        <Field label="Formula" hint="Other fields by label in braces, e.g. {Qty} * {Price}">
          <Input value={f.formula || ""} onChange={(e) => onChange({ formula: e.target.value || null })} placeholder="{Qty} * {Price}" />
        </Field>
      )}

      <Field label="Only show when" hint={f.showIf?.field ? "Hidden (and not required) until then" : undefined}>
        <Select value={f.showIf?.field || ""} onChange={(e) => onChange({ showIf: e.target.value ? { field: e.target.value, equals: "" } : null })}>
          <option value="">Always shown</option>
          {others.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label} is…
            </option>
          ))}
        </Select>
      </Field>
      {f.showIf?.field &&
        (src?.type === "checkbox" ? (
          <Select value={f.showIf.equals || "checked"} onChange={(e) => onChange({ showIf: { field: f.showIf!.field, equals: e.target.value } })} aria-label="Condition">
            <option value="checked">checked</option>
            <option value="unchecked">not checked</option>
          </Select>
        ) : (
          <Select value={f.showIf.equals} onChange={(e) => onChange({ showIf: { field: f.showIf!.field, equals: e.target.value } })} aria-label="Condition">
            <option value="">Pick a choice…</option>
            {(src?.options || []).map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </Select>
        ))}

      <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1">
        <Checkbox checked={f.required} onChange={(v) => onChange({ required: v })} label="Required" />
        {f.type !== "signature" && f.type !== "initials" && f.type !== "attachment" && <Checkbox checked={!!f.readOnly} onChange={(v) => onChange({ readOnly: v })} label="Read-only" />}
      </div>
    </div>
  );
}
