// Specs that depend on the trailer type: a reefer has an air chute and a reefer unit,
// a flatbed has a deck and tarps, a tanker has compartments. The trailer form shows the
// fields for the chosen type; values are saved in tms_trailers.specs.

export type SpecValue = string | string[];
export type Specs = Record<string, SpecValue>;

export type SpecField =
  | { key: string; label: string; kind: "select"; options: string[]; hint?: string }
  | { key: string; label: string; kind: "text"; placeholder?: string; hint?: string }
  | { key: string; label: string; kind: "multi"; options: string[]; hint?: string };

export interface SpecGroup {
  id: string;
  title: string;
  /** trailer types (from TRAILER_GROUPS) this group applies to */
  match: (type: string) => boolean;
  fields: SpecField[];
}

const has = (type: string, ...words: string[]) => words.some((w) => type.toLowerCase().includes(w));

export const SPEC_GROUPS: SpecGroup[] = [
  {
    id: "reefer",
    title: "Reefer details",
    match: (t) => has(t, "reefer"),
    fields: [
      {
        key: "air_chute",
        label: "Air chute",
        kind: "select",
        options: ["Standard center chute", "Two-finger chute", "Tube chute", "No air chute"],
        hint: "Center: one chute down the middle · Two-finger: two chutes, best for pallets / forklifts · Tube: even airflow to the rear",
      },
      { key: "unit_make", label: "Reefer unit", kind: "select", options: ["Thermo King", "Carrier Transicold", "Hwasung Thermo"] },
      { key: "unit_model", label: "Unit model", kind: "text", placeholder: "Precedent S-600, X4 7500, Vector 8600…" },
      { key: "temp_range", label: "Temperature range", kind: "text", placeholder: "-20°F to 70°F" },
      { key: "zones", label: "Temperature zones", kind: "select", options: ["Single temp", "Multi-temp · 2 zones", "Multi-temp · 3 zones"] },
      { key: "floor", label: "Floor", kind: "select", options: ["Duct floor (grooved aluminum)", "Flat floor"] },
      {
        key: "reefer_extras",
        label: "Equipment",
        kind: "multi",
        options: ["Strip curtains", "Movable bulkhead", "Load locks / bars", "E-track", "Temp recorder / download", "Remote temp tracking", "Fuel level sensor", "Pharma / food grade"],
      },
    ],
  },
  {
    id: "van",
    title: "Van details",
    match: (t) => has(t, "van") && !has(t, "reefer", "cargo van", "sprinter"),
    fields: [
      { key: "floor", label: "Floor", kind: "select", options: ["Hardwood", "Composite", "Aluminum"] },
      { key: "roof", label: "Roof", kind: "select", options: ["Aluminum", "Translucent"] },
      { key: "van_extras", label: "Equipment", kind: "multi", options: ["E-track", "Logistic posts", "Load bars / straps", "Side door", "Swing doors", "Roll-up door", "Air ride", "Food grade"] },
    ],
  },
  {
    id: "flatbed",
    title: "Deck details",
    match: (t) => has(t, "flatbed", "step deck", "double drop", "conestoga", "hotshot", "maxi"),
    fields: [
      { key: "deck", label: "Deck material", kind: "select", options: ["Aluminum", "Steel", "Combo (steel / aluminum)", "Wood"] },
      { key: "width", label: "Deck width", kind: "select", options: ["8'6\" (102\")", "8' (96\")", "Extendable"] },
      { key: "deck_height", label: "Deck height", kind: "text", placeholder: "60\" (step deck lower: 38–40\")" },
      { key: "max_length", label: "Extends to", kind: "text", placeholder: "Only for stretch / extendable, e.g. 80 ft" },
      {
        key: "deck_extras",
        label: "Equipment",
        kind: "multi",
        options: ["Ramps", "Sliding tarp system", "Winches", "Stake pockets", "Side kit", "Headache rack", "Spread axle", "Coil racks"],
      },
    ],
  },
  {
    id: "heavy",
    title: "Heavy haul details",
    match: (t) => has(t, "rgn", "lowboy", "beam", "perimeter"),
    fields: [
      { key: "axles", label: "Axles", kind: "select", options: ["2 axles", "3 axles", "4 axles", "5+ axles", "Spread axle"] },
      { key: "deck_height", label: "Deck / well height", kind: "text", placeholder: "18–24\"" },
      { key: "well_length", label: "Well length", kind: "text", placeholder: "29 ft" },
      { key: "heavy_extras", label: "Equipment", kind: "multi", options: ["Detachable gooseneck", "Flip axle / booster", "Outriggers", "Ramps", "Pilot car ready", "Oversize banners & flags"] },
    ],
  },
  {
    id: "tank",
    title: "Tank & bulk details",
    match: (t) => has(t, "tank", "pneumatic", "hopper", "dump", "walking floor"),
    fields: [
      { key: "capacity", label: "Capacity", kind: "text", placeholder: "6,500 gal / 1,000 cu ft" },
      { key: "compartments", label: "Compartments", kind: "select", options: ["1", "2", "3", "4", "5+"] },
      { key: "material", label: "Material", kind: "select", options: ["Aluminum", "Stainless steel", "Steel", "Fiberglass"] },
      { key: "tank_extras", label: "Equipment", kind: "multi", options: ["Pump", "Blower", "Heated / insulated", "Hoses", "Food grade / kosher wash", "Hazmat placards", "Tarp"] },
    ],
  },
  {
    id: "car",
    title: "Car hauler details",
    match: (t) => has(t, "car hauler"),
    fields: [
      { key: "cars", label: "Capacity", kind: "select", options: ["1 car", "2 cars", "3 cars", "4–5 cars", "6–7 cars", "8–10 cars"] },
      { key: "enclosed", label: "Type", kind: "select", options: ["Open", "Enclosed"] },
      { key: "car_extras", label: "Equipment", kind: "multi", options: ["Winch", "Soft straps", "Liftgate", "Inoperable vehicles OK"] },
    ],
  },
  {
    id: "small",
    title: "Box truck / van details",
    match: (t) => has(t, "box truck", "cargo van", "sprinter"),
    fields: [
      { key: "box_size", label: "Box size", kind: "text", placeholder: "26' × 8' × 8'" },
      { key: "small_extras", label: "Equipment", kind: "multi", options: ["Liftgate", "Pallet jack", "Dock height", "Load straps", "Blankets", "E-track"] },
    ],
  },
];

/** The spec groups for a trailer type ([] for types without extra specs). */
export const specGroupsFor = (type: string | null | undefined) => (type ? SPEC_GROUPS.filter((g) => g.match(type)) : []);

/** Only the values that belong to the type (switching Reefer → Flatbed drops reefer specs). */
export function specsFor(type: string | null | undefined, specs: Specs | null | undefined): Specs {
  const keys = new Set(specGroupsFor(type).flatMap((g) => g.fields.map((f) => f.key)));
  const out: Specs = {};
  for (const [k, v] of Object.entries(specs || {})) if (keys.has(k) && (Array.isArray(v) ? v.length : String(v).trim())) out[k] = v;
  return out;
}

/** One line for pitches and cards: "Standard center chute · Thermo King Precedent S-600 · -20°F to 70°F". */
export function specsLine(type: string | null | undefined, specs: Specs | null | undefined) {
  const s = specsFor(type, specs);
  const parts: string[] = [];
  for (const g of specGroupsFor(type)) {
    for (const f of g.fields) {
      const v = s[f.key];
      if (!v) continue;
      if (f.key === "unit_make") parts.push([v, s.unit_model].filter(Boolean).join(" "));
      else if (f.key === "unit_model") continue;
      else parts.push(Array.isArray(v) ? v.join(", ") : String(v));
    }
  }
  return parts.filter(Boolean).join(" · ");
}
