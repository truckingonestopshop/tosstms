// "City, ST ZIP" text ↔ its parts. Used where a place is kept as one line (truck empty at)
// but edited as City / State / ZIP, and to split a picked suggestion.

export interface PlaceParts {
  city: string;
  state: string;
  zip: string;
}

const ZIP = /(?:^|\s)(\d{5}(?:-\d{4})?|[A-Za-z]\d[A-Za-z] ?\d[A-Za-z]\d)\s*$/;

export function splitPlace(text: string | null | undefined): PlaceParts {
  let t = text || "";
  let zip = "";
  const z = t.match(ZIP);
  if (z) {
    zip = z[1];
    t = t.slice(0, z.index);
  }
  const s = t.match(/,\s*([A-Za-z]{0,3})\s*$/);
  if (s) return { city: t.slice(0, s.index), state: s[1].toUpperCase(), zip };
  return { city: t.replace(/,\s*$/, ""), state: "", zip };
}

export function joinPlace(p: PlaceParts) {
  const tail = [p.state, p.zip].filter(Boolean).join(" ");
  return tail ? `${p.city}, ${tail}` : p.city;
}
