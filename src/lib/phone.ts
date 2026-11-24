// Phone numbers for calling and texting (Kixie): E.164 (+13105551234) for the API and for
// matching, and "(310) 555-1234" for people, the same way the database formats them.

/** A dialable number in E.164, or null. 10 digits → US (+1); 11 starting with 1 → +1…; else as typed with +. */
export function e164(p: string | null | undefined): string | null {
  if (!p) return null;
  const raw = String(p).trim();
  // an extension ("x12", "ext. 4") isn't part of the number
  const main = raw.split(/\s*(?:x|ext\.?|extension)\s*\d+$/i)[0];
  const d = main.replace(/\D/g, "");
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith("1")) return `+${d}`;
  if (main.startsWith("+") && d.length >= 8 && d.length <= 15) return `+${d}`;
  return null;
}

/** "(310) 555-1234" for US numbers, the E.164 form otherwise. */
export function prettyPhone(p: string | null | undefined): string {
  const e = e164(p);
  if (!e) return p ? String(p) : "";
  if (e.startsWith("+1") && e.length === 12) return `(${e.slice(2, 5)}) ${e.slice(5, 8)}-${e.slice(8)}`;
  return e;
}

/** Same number? (compares E.164) */
export const samePhone = (a: string | null | undefined, b: string | null | undefined) => {
  const x = e164(a);
  return !!x && x === e164(b);
};
