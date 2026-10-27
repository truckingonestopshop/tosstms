// Team member profile vocabulary and helpers (positions, time zones, languages,
// contact line and email signature).
import type { Member } from "./types";

export const POSITIONS = [
  "Owner",
  "Operations Manager",
  "Dispatch Manager",
  "Lead Dispatcher",
  "Senior Dispatcher",
  "Dispatcher",
  "Junior Dispatcher",
  "Track & Trace / Check Calls",
  "Carrier Onboarding",
  "Billing & Accounting",
  "Accounting Manager",
  "Safety & Compliance",
  "Safety Account Manager",
  "MCPT Agent",
  "Sales / Carrier Recruiting",
  "New Business Developer",
];

/** US zones first (where the trucks run), then where the team may sit. */
export const TIMEZONES: { v: string; label: string }[] = [
  { v: "America/New_York", label: "Eastern (ET)" },
  { v: "America/Chicago", label: "Central (CT)" },
  { v: "America/Denver", label: "Mountain (MT)" },
  { v: "America/Phoenix", label: "Arizona (MST, no DST)" },
  { v: "America/Los_Angeles", label: "Pacific (PT)" },
  { v: "America/Anchorage", label: "Alaska (AKT)" },
  { v: "Pacific/Honolulu", label: "Hawaii (HST)" },
  { v: "Europe/Chisinau", label: "Moldova (Chișinău)" },
  { v: "Europe/Bucharest", label: "Romania (Bucharest)" },
  { v: "Europe/Kyiv", label: "Ukraine (Kyiv)" },
  { v: "Europe/Warsaw", label: "Poland (Warsaw)" },
  { v: "Europe/London", label: "UK (London)" },
];

export const LANGUAGES = ["English", "Spanish", "Romanian", "Russian", "Ukrainian", "Polish", "Portuguese", "French", "Arabic", "Hindi / Punjabi", "Uzbek"];

export const HOURS_PRESETS = ["Mon–Fri 7am–5pm CT", "Mon–Fri 8am–6pm ET", "Mon–Sat 6am–4pm CT", "Night shift 6pm–6am CT", "Weekends on call"];

export const tzLabel = (tz: string | null | undefined) => TIMEZONES.find((t) => t.v === tz)?.label || tz || "";

/** "3:42 PM" in the member's zone (empty if no zone). */
export function localTime(tz: string | null | undefined, now = new Date()) {
  if (!tz) return "";
  try {
    return now.toLocaleTimeString("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" });
  } catch {
    return "";
  }
}

/** "(312) 555-0100 ext 204" */
export const phoneLine = (m: Pick<Member, "phone" | "phone_ext"> | undefined) =>
  m?.phone ? `${m.phone}${m.phone_ext ? ` ext ${m.phone_ext}` : ""}` : "";

/** One line for pitches and driver sheets: "Ana Popescu · Senior Dispatcher · (312) 555-0100 ext 204". */
export function contactLine(m: Member | undefined) {
  if (!m) return "";
  return [m.full_name || m.email, m.position, phoneLine(m) || m.mobile, m.email].filter(Boolean).join(" · ");
}

/** Default email signature from the profile (the member can edit it). */
export function buildSignature(m: Partial<Member>, companyName = "Trucking One Stop Shop") {
  const phones = [m.phone ? `Direct: ${m.phone}${m.phone_ext ? ` ext ${m.phone_ext}` : ""}` : null, m.mobile ? `Mobile: ${m.mobile}` : null].filter(Boolean).join(" · ");
  return [m.full_name || "", [m.position, companyName].filter(Boolean).join(" · "), phones, m.email || "", m.work_hours ? `Hours: ${m.work_hours}` : ""]
    .filter((x) => x && x.trim())
    .join("\n");
}

/** The signature to use: the saved one, else one built from the profile. */
export const signatureOf = (m: Member | undefined, companyName?: string) => (m ? m.email_signature?.trim() || buildSignature(m, companyName) : "");
