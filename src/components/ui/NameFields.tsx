"use client";

import { useEffect, useState } from "react";
import { Field, Input } from "@/components/ui/Field";

/** "Juan Carlos Palomares" → Juan / Carlos Palomares (a guess for names saved as one line). */
export const splitFullName = (full: string | null | undefined) => {
  const t = (full || "").trim().replace(/\s+/g, " ");
  const i = t.indexOf(" ");
  return i < 0 ? { first: t, last: "" } : { first: t.slice(0, i), last: t.slice(i + 1) };
};
export const joinName = (first: string, last: string) => [first.trim(), last.trim()].filter(Boolean).join(" ");

/**
 * First name + Last name for a person saved as one full name (team members, credential contacts).
 * The two boxes keep what was typed; the full name follows them.
 */
export function NameFields({
  value,
  onChange,
  required,
  autoFocus,
}: {
  value: string;
  onChange: (full: string) => void;
  required?: boolean;
  autoFocus?: boolean;
}) {
  const [first, setFirst] = useState(() => splitFullName(value).first);
  const [last, setLast] = useState(() => splitFullName(value).last);
  // A different name from outside (another person, Discard): split it again.
  useEffect(() => {
    if (joinName(first, last) !== (value || "").trim().replace(/\s+/g, " ")) {
      const s = splitFullName(value);
      setFirst(s.first);
      setLast(s.last);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only an outside change re-splits
  }, [value]);
  return (
    <>
      <Field label="First name" required={required}>
        <Input
          value={first}
          onChange={(e) => {
            setFirst(e.target.value);
            onChange(joinName(e.target.value, last));
          }}
          autoComplete="given-name"
          maxLength={60}
          autoFocus={autoFocus}
        />
      </Field>
      <Field label="Last name" required={required}>
        <Input
          value={last}
          onChange={(e) => {
            setLast(e.target.value);
            onChange(joinName(first, e.target.value));
          }}
          autoComplete="family-name"
          maxLength={60}
        />
      </Field>
    </>
  );
}
