import type { Company, Driver, Trailer, Truck } from "./types";
import { specsLine } from "./trailerSpecs";
import { fmtDay, num, today } from "./format";

export function availability(t: Truck) {
  if (t.status === "out_of_service") return "Out of service";
  if (t.status === "inactive") return "Inactive";
  if (!t.available_date || t.available_date <= today()) return "Ready now";
  return `Ready ${fmtDay(t.available_date)}`;
}

export function equipmentLine(t: Truck) {
  return [t.trailer_length, t.trailer_type].filter(Boolean).join(" ") || "Equipment not set";
}

/** The text a dispatcher pastes to a broker (chat / email). */
export function defaultPitch(t: Truck, company?: Company, driver?: Driver, trailer?: Trailer) {
  const gear = t.accessories.length
    ? t.accessories.map((a) => `${a.quantity ? `${a.quantity}x ` : ""}${a.name}${a.details ? ` (${a.details})` : ""}`).join(", ")
    : null;
  const lines = [
    `${company?.name || "Carrier"}${company?.mc_number ? ` · MC ${company.mc_number}` : ""}${company?.dot_number ? ` · DOT ${company.dot_number}` : ""}`,
    `Truck #${t.unit_number}${t.trailer_number ? ` · Trailer #${t.trailer_number}` : ""} · ${equipmentLine(t)}`,
    [
      t.max_weight ? `Max ${num(t.max_weight)} lbs` : null,
      t.door_type,
      t.suspension,
    ]
      .filter(Boolean)
      .join(" · "),
    trailer ? specsLine(trailer.trailer_type, trailer.specs) : null,
    `Location: ${t.current_location || "call for location"} · ${availability(t)}`,
    gear ? `Gear: ${gear}` : null,
    t.important_info ? `Notes: ${t.important_info}` : null,
    driver ? `Driver: ${driver.name}${driver.phone ? ` · ${driver.phone}` : ""}` : null,
    company?.contact_phone ? `Dispatch: ${company.contact_phone}` : null,
  ];
  return lines.filter((l) => l && l.trim()).join("\n");
}

export const pitchFor = (t: Truck, company?: Company, driver?: Driver, trailer?: Trailer) =>
  t.custom_pitch && t.custom_pitch.trim() ? t.custom_pitch : defaultPitch(t, company, driver, trailer);

export const GEAR_PRESETS = [
  { name: "Chains", quantity: 10, details: "Grade 70, 3/8\" × 20 ft" },
  { name: "Binders", quantity: 10, details: "Ratchet, 3/8\"" },
  { name: "Straps", quantity: 16, details: "4\" × 30 ft winch straps" },
  { name: "Edge protectors", quantity: 30, details: "" },
  { name: "Lumber tarps", quantity: 2, details: "8 ft drop" },
  { name: "Steel tarps", quantity: 2, details: "4 ft drop" },
  { name: "Coil racks", quantity: 6, details: "" },
  { name: "Dunnage", quantity: 8, details: "4×4" },
  { name: "Load bars", quantity: 2, details: "" },
  { name: "E-track straps", quantity: 12, details: "" },
  { name: "Pallet jack", quantity: 1, details: "" },
  { name: "PPE kit", quantity: 1, details: "Hard hat, vest, boots, glasses" },
];
