// GHL → TOSS Cloud (docs/ghl-integration-plan.md, part 2): reads what a GoHighLevel workflow
// webhook sends when an agent sets a contact to Customer. Pure, so it can be tested.
//
// GHL sends the standard contact fields (first_name, phone, address1, …) and every custom field
// under its name ("DOT", "MC ", "Services Sold", …), plus the workflow's Custom Data. Keys are
// compared without case, spaces or punctuation, and Custom Data wins.

import type { ServiceKey, ServiceSource } from "./types";

type Json = Record<string, unknown>;

const norm = (k: string) => k.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Every key of the payload (and its customData) by normalized name. */
export function flatten(payload: Json): Map<string, unknown> {
  const out = new Map<string, unknown>();
  const put = (o: unknown) => {
    if (!o || typeof o !== "object" || Array.isArray(o)) return;
    for (const [k, v] of Object.entries(o as Json)) if (v !== null && v !== undefined && v !== "") out.set(norm(k), v);
  };
  put(payload);
  put(payload.contact);
  put(payload.customData);
  put(payload.custom_data);
  return out;
}

const pick = (m: Map<string, unknown>, ...keys: string[]) => {
  for (const k of keys) {
    const v = m.get(norm(k));
    if (v !== undefined) return v;
  }
  return undefined;
};
const str = (v: unknown) => {
  if (Array.isArray(v)) v = v.join(", ");
  if (typeof v === "number") return String(v);
  return typeof v === "string" && v.trim() ? v.trim() : null;
};
const list = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : typeof v === "string" ? v.split(/[,;\n]/) : []).map((x) => x.trim()).filter(Boolean);

const SERVICE_NAMES: Record<string, ServiceKey> = {
  dispatch: "dispatch",
  dotcompliance: "dot_compliance",
  compliance: "dot_compliance",
  mcpt: "mcpt",
  accounting: "accounting",
  factoring: "factoring",
  fuelcard: "fuel_card",
  fuelcards: "fuel_card",
  insurance: "insurance",
};

/** GHL "Contact Source" options (and the plan's spellings) → Cloud sources. */
const SOURCE_NAMES: Record<string, ServiceSource> = {
  calllist: "call_list",
  instagram: "instagram",
  instagrammarketing: "instagram",
  facebook: "facebook",
  facebookmarketing: "facebook",
  x: "x",
  xmarketing: "x",
  twitter: "x",
  email: "email",
  emailmarketing: "email",
  text: "text",
  textmarketing: "text",
  sms: "text",
  whatsapp: "whatsapp",
  whatsappmarketing: "whatsapp",
  linkedin: "linkedin",
  linkedinmarketing: "linkedin",
  fiverr: "fiverr",
  referredbyclient: "referral",
  referredbyaclient: "referral",
  referral: "referral",
  crosssale: "cross_sale",
};

export interface GhlCustomer {
  contactId: string | null;
  /** "customer", "lead", … (null when GHL didn't send it) */
  type: string | null;
  dot: string | null;
  mc: string | null;
  name: string | null;
  dba: string | null;
  ein: string | null;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  email: string | null;
  street: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  secondFirst: string | null;
  secondLast: string | null;
  services: ServiceKey[];
  source: ServiceSource | null;
  referredBy: string | null;
  soldBy: string | null;
}

export function readCustomer(payload: Json): GhlCustomer {
  const m = flatten(payload);
  const digits = (v: unknown) => (str(v) || "").replace(/\D/g, "") || null;
  const user = (payload.user && typeof payload.user === "object" ? (payload.user as Json) : null) ?? null;
  const owner = user ? [str(user.firstName) ?? str(user.first_name), str(user.lastName) ?? str(user.last_name)].filter(Boolean).join(" ") || str(user.name) : null;
  const name = str(pick(m, "company_name", "companyName", "Business name", "business_name"));
  let firstName = str(pick(m, "first_name", "firstName"));
  let lastName = str(pick(m, "last_name", "lastName"));
  // Sent from Lead Hunter without an owner on file: the company name stood in as the contact name.
  if (name && firstName && !lastName && norm(firstName) === norm(name)) firstName = null;
  if (firstName && !lastName && firstName.includes(" ") && !name) {
    [firstName, lastName] = [firstName.split(" ")[0], firstName.split(" ").slice(1).join(" ")];
  }
  const services = [...new Set(list(pick(m, "Services Sold", "services_sold", "services")).map((s) => SERVICE_NAMES[norm(s)]).filter(Boolean))];
  const sources = list(pick(m, "Lead Source", "lead_source", "Contact Source", "contact_source", "source"))
    .map((s) => SOURCE_NAMES[norm(s)])
    .filter(Boolean);
  return {
    contactId: str(pick(m, "contact_id", "contactId", "id")),
    type: str(pick(m, "contact_type", "contactType", "type"))?.toLowerCase() ?? null,
    dot: digits(pick(m, "DOT", "USDOT", "USDOT Number", "dot_number")),
    mc: digits(pick(m, "MC", "MC Number", "mc_number")),
    name: name ?? str(pick(m, "full_name", "fullName", "name")),
    dba: str(pick(m, "DBA Name", "dba", "dba_name")),
    ein: str(pick(m, "EIN")),
    firstName,
    lastName,
    phone: str(pick(m, "phone")),
    email: str(pick(m, "email"))?.toLowerCase() ?? null,
    street: str(pick(m, "address1", "Street address", "street", "address")),
    city: str(pick(m, "city")),
    state: str(pick(m, "state"))?.toUpperCase() ?? null,
    zip: str(pick(m, "postal_code", "postalCode", "Postal code", "zip")),
    secondFirst: str(pick(m, "2nd Contact first name", "2nd Contact fisrt name")),
    secondLast: str(pick(m, "2nd Contact last name")),
    services,
    source: sources[0] ?? null,
    referredBy: str(pick(m, "Referred By", "referred_by")),
    soldBy: str(pick(m, "sold_by", "Sold By")) ?? owner,
  };
}
