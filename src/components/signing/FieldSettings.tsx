"use client";

import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Checkbox, Field, Input, Select } from "@/components/ui/Field";
import { AUTO, TEXTLIKE, VALIDATIONS, type AutoKey, type SignField, type SignRole, type Validation } from "@/lib/signing";

/**
 * The settings of one field (both builders): label, who fills it, required, read-only, what it
 * fills itself with, choices, format check, "only show when…", and a formula for numbers.
 */
export function FieldSettings({ field: f, fields, who, onChange }: { field: SignField; fields: SignField[]; who: SignRole[]; onChange: (p: Partial<SignField>) => void }) {
  const others = fields.filter((x) => x.id !== f.id && (x.type === "checkbox" || x.type === "dropdown" || x.type === "radio"));
  const src = fields.find((x) => x.id === f.showIf?.field);
  const typed = TEXTLIKE.includes(f.type) && f.type !== "dropdown" && f.type !== "radio";
  return (
    <div className="space-y-2">
      <Field label="Label">
        <Input value={f.label} onChange={(e) => onChange({ label: e.target.value })} />
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

      {(f.type === "dropdown" || f.type === "radio") && (
        <Field label="Choices">
          <div className="space-y-1">
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
        </Field>
      )}

      {typed && (
        <Field label="Fills itself with" hint={f.role === "toss" ? "Filled in when sending; can still be changed." : "Shown filled in."}>
          <Select value={f.auto || ""} onChange={(e) => onChange({ auto: (e.target.value || null) as AutoKey | null })}>
            <option value="">Nothing (typed)</option>
            {AUTO.filter((a) => (f.type === "date" ? a.v === "today" || a.v === "driver.dob" : true)).map((a) => (
              <option key={a.v} value={a.v}>
                {a.label}
              </option>
            ))}
          </Select>
        </Field>
      )}

      {typed && f.type !== "date" && (
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
