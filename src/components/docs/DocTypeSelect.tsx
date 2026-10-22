"use client";

import { useMemo } from "react";
import { Field, Input, Select } from "@/components/ui/Field";
import { useStore } from "@/lib/store";
import { typesFor } from "@/lib/docs";
import type { DocScope, DocType } from "@/lib/types";

/** "Detect from file name" in the upload box. */
export const AUTO = "__auto";
/** "Other" with a typed name: the type is created when the file is added. */
export const CUSTOM = "__custom";

/**
 * Document type picker: one flat list for the scope, plus "Other" with a typed name for
 * anything that isn't listed.
 */
export function DocTypeSelect({
  scope,
  value,
  onChange,
  custom,
  onCustom,
  auto,
  className,
}: {
  scope: DocScope;
  value: string;
  onChange: (v: string) => void;
  custom: string;
  onCustom: (v: string) => void;
  /** offer "Detect from file name" */
  auto?: boolean;
  className?: string;
}) {
  const { docTypes } = useStore();
  const types = useMemo(() => typesFor(docTypes, scope).filter((t) => t.key !== "other"), [docTypes, scope]);
  return (
    <>
      <Field label="Type" className={className}>
        <Select value={value} onChange={(e) => onChange(e.target.value)}>
          {auto && <option value={AUTO}>Detect from file name</option>}
          {types.map((t) => (
            <option key={t.key} value={t.key}>
              {t.name}
            </option>
          ))}
          <option value={CUSTOM}>Other (type the name)…</option>
        </Select>
      </Field>
      {value === CUSTOM && (
        <Field label="Document name" className={className}>
          <Input value={custom} onChange={(e) => onCustom(e.target.value)} placeholder="e.g. Hazmat certificate" autoFocus />
        </Field>
      )}
    </>
  );
}

/** The key for a typed name: an existing type with that name, or a new one. */
export function useResolveType(scope: DocScope) {
  const { docTypes, addDocType } = useStore();
  return async (name: string): Promise<DocType | null> => {
    const n = name.trim();
    if (!n) return null;
    const hit = docTypes.find((t) => t.name.trim().toLowerCase() === n.toLowerCase() && (t.scope === scope || t.scope === "any"));
    return hit ?? (await addDocType(n, scope));
  };
}
