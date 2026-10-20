import type { Company, Driver, Member, Trailer, Truck } from "./types";
import { phoneLine } from "./profile";
import { specsLine } from "./trailerSpecs";
import { fmtDay, today } from "./format";

/** "8:00 AM" from "08:00" */
export function fmtTime(hhmm: string | null | undefined) {
  if (!hhmm) return "";
  const [h, m] = hhmm.split(":").map(Number);
  if (Number.isNaN(h)) return "";
  return `${((h + 11) % 12) + 1}:${String(m || 0).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

export function availability(t: Truck) {
  if (t.status === "out_of_service") return "Out of service";
  if (t.status === "inactive") return "Inactive";
  const time = fmtTime(t.available_time);
  if (!t.available_date || t.available_date < today()) return "Ready now";
  if (t.available_date === today()) {
    if (!time) return "Ready now";
    const now = new Date();
    const [h, m] = (t.available_time || "0:0").split(":").map(Number);
    return now.getHours() * 60 + now.getMinutes() >= h * 60 + (m || 0) ? "Ready now" : `Ready today ${time}`;
  }
  return `Ready ${fmtDay(t.available_date)}${time ? `, ${time}` : ""}`;
}

/** "2022 Peterbilt T680" */
export const truckModelLine = (t: Pick<Truck, "year" | "make" | "model">) => [t.year, t.make, t.model].filter(Boolean).join(" ");

export function equipmentLine(t: Truck) {
  return [t.trailer_length, t.trailer_type].filter(Boolean).join(" ") || "Equipment not set";
}

/** The text a dispatcher pastes to a broker (chat / email). */
export function defaultPitch(t: Truck, company?: Company, driver?: Driver, trailer?: Trailer, dispatcher?: Member) {
  const gear = t.accessories.length
    ? t.accessories.map((a) => `${a.quantity ? `${a.quantity}x ` : ""}${a.name}${a.details ? ` (${a.details})` : ""}`).join(", ")
    : null;
  const lines = [
    `${company?.name || "Carrier"}${company?.mc_number ? ` · MC ${company.mc_number}` : ""}${company?.dot_number ? ` · DOT ${company.dot_number}` : ""}`,
    `Truck #${t.unit_number}${truckModelLine(t) ? ` (${truckModelLine(t)})` : ""}${t.trailer_number ? ` · Trailer #${t.trailer_number}` : ""} · ${equipmentLine(t)}`,
    // Max weight stays on the truck (card, quick copy) but isn't sent to brokers.
    [t.door_type, t.suspension]
      .filter(Boolean)
      .join(" · "),
    trailer ? specsLine(trailer.trailer_type, trailer.specs) : null,
    `Location: ${t.current_location || "call for location"} · ${availability(t)}`,
    gear ? `Gear: ${gear}` : null,
    t.important_info ? `Notes: ${t.important_info}` : null,
    driver ? `Driver: ${driver.name}${driver.phone ? ` · ${driver.phone}` : ""}` : null,
    dispatcher ? `Dispatcher: ${[dispatcher.full_name || dispatcher.email, phoneLine(dispatcher) || dispatcher.mobile, dispatcher.email].filter(Boolean).join(" · ")}` : null,
    company?.contact_phone ? `Dispatch: ${company.contact_phone}` : null,
  ];
  return lines.filter((l) => l && l.trim()).join("\n");
}

export const pitchFor = (t: Truck, company?: Company, driver?: Driver, trailer?: Trailer, dispatcher?: Member) =>
  t.custom_pitch && t.custom_pitch.trim() ? t.custom_pitch : defaultPitch(t, company, driver, trailer, dispatcher);

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
