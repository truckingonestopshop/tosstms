// Document rules shared by every screen: which paperwork a load, driver, truck or
// carrier needs, which file is the current one, expiry state, and a type guess from
// the file name. Rules live on tms_doc_types (see migration 0004) so the team can
// change them in Settings.

import { daysUntil } from "./format";
import type { DocRequired, DocScope, DocType, DocumentItem, LoadStatus } from "./types";

type Rule = [key: string, name: string, scope: DocScope, required: DocRequired | null, expires: boolean, packet: boolean, sort: number];

/** Built-in types (same as the database seed); also used for sample data. */
const BUILT_IN: Rule[] = [
  ["rate_confirmation", "Rate Confirmation", "load", "booked", false, true, 10],
  ["bol", "Bill of Lading (BOL)", "load", "in_transit", false, true, 20],
  ["pod", "Proof of Delivery (POD)", "load", "delivered", false, true, 30],
  ["lumper_receipt", "Lumper Receipt", "load", null, false, true, 40],
  ["scale_ticket", "Scale Ticket", "load", null, false, true, 50],
  ["accessorial_receipt", "Accessorial Receipt", "load", null, false, true, 60],
  ["detention_proof", "Detention / Layover Proof", "load", null, false, true, 70],
  ["freight_photos", "Freight & Damage Photos", "load", null, false, false, 80],
  ["insurance", "Certificate of Insurance (COI)", "company", "always", true, false, 10],
  ["authority", "MC Authority", "company", "always", false, false, 20],
  ["w9", "W-9", "company", "always", false, false, 30],
  ["dispatch_agreement", "Dispatch Agreement", "company", "always", false, false, 40],
  ["noa", "Notice of Assignment (NOA)", "company", null, false, false, 50],
  ["voided_check", "Voided Check", "company", null, false, false, 60],
  ["boc3", "BOC-3", "company", null, false, false, 70],
  ["ucr", "UCR Registration", "company", null, true, false, 80],
  ["carrier_packet", "Carrier Packet", "company", null, false, false, 90],
  ["dot_compliance_agreement", "DOT compliance agreement", "company", null, false, false, 46],
  ["inspection_report", "Inspection report", "company", null, false, false, 47],
  ["factoring_agreement", "Factoring contract", "company", null, false, false, 95],
  ["cdl", "Driving license", "driver", "always", true, false, 10],
  ["medical_card", "Medical Card", "driver", "always", true, false, 20],
  ["mvr", "MVR", "driver", "always", true, false, 30],
  ["clearinghouse_full_query", "Clearinghouse query", "driver", null, true, false, 32],
  ["driver_application", "Employment application", "driver", "always", false, false, 50],
  ["pre_employment_drug_test", "Pre-employment drug test", "driver", "always", false, false, 52],
  ["past_employment_verification", "Past employment verification", "driver", "always", false, false, 54],
  ["psp", "PSP (Pre-employment Screening Program)", "driver", null, false, false, 58],
  ["driver_agreement", "Driver / Lease Agreement", "driver", null, false, false, 60],
  ["drug_test", "Drug and alcohol testing", "driver", null, false, false, 70],
  ["driver_policies", "Policies", "driver", null, false, false, 72],
  ["driver_trainings", "Trainings", "driver", null, false, false, 74],
  ["passport", "Passport", "driver", null, true, false, 90],
  ["government_id", "ID card", "driver", null, true, false, 92],
  ["driver_headshot", "Driver photo", "driver", null, false, false, 94],
  ["termination_letter", "Termination letter", "driver", null, false, false, 96],
  ["registration", "Truck Registration (Cab Card)", "truck", "always", true, false, 10],
  ["inspection", "Annual Truck Inspection", "truck", "always", true, false, 20],
  ["ifta", "IFTA License", "truck", null, true, false, 40],
  ["form_2290", "Form 2290 (Schedule 1)", "truck", null, true, false, 50],
  ["physical_damage", "Physical Damage Insurance", "truck", null, true, false, 60],
  ["ny_hut_permit", "NY HUT permit", "truck", null, true, false, 61],
  ["nm_state_permit", "NM state permit", "truck", null, true, false, 62],
  ["ky_state_permit", "KYU state permit", "truck", null, true, false, 63],
  ["or_state_permit", "OR state permit", "truck", null, true, false, 64],
  ["ct_state_permit", "CT state permit", "truck", null, true, false, 65],
  ["trailer_registration", "Trailer Registration", "trailer", "always", true, false, 10],
  ["trailer_inspection", "Trailer Annual Inspection", "trailer", "always", true, false, 20],
  ["trailer_lease", "Trailer Lease / Interchange", "trailer", null, false, false, 30],
  ["reefer_service", "Reefer Unit Service Record", "trailer", null, false, false, 40],
  ["truck_title", "Title registration", "truck", null, false, false, 80],
  ["truck_lease", "Equipment Lease", "truck", null, false, false, 90],
  ["other", "Other", "any", null, false, false, 999],
];

export const BUILT_IN_TYPES: DocType[] = BUILT_IN.map(([key, name, scope, required_from, has_expiry, in_packet, sort]) => ({
  key,
  name,
  scope,
  is_default: true,
  required_from,
  has_expiry,
  in_packet,
  sort,
}));

/** Fills in rule fields for rows from before the rules existed. */
export function withRules(t: Partial<DocType> & Pick<DocType, "key" | "name" | "scope">): DocType {
  const b = BUILT_IN_TYPES.find((x) => x.key === t.key);
  return {
    is_default: false,
    ...t,
    required_from: t.required_from !== undefined ? t.required_from : (b?.required_from ?? null),
    has_expiry: t.has_expiry ?? b?.has_expiry ?? false,
    in_packet: t.in_packet ?? b?.in_packet ?? false,
    sort: t.sort ?? b?.sort ?? 100,
  } as DocType;
}

export const byTypeOrder = (a: DocType, b: DocType) => a.sort - b.sort || a.name.localeCompare(b.name);

/** What a document belongs to. Company = the carrier's own files (not its loads, drivers or trucks). */
export type DocTarget =
  | { scope: "company"; companyId: string }
  | { scope: "load"; id: string; companyId: string; status?: LoadStatus }
  | { scope: "driver"; id: string; companyId: string; /** typed on the driver (License expires) */ licenseExpiry?: string | null }
  | { scope: "truck"; id: string; companyId: string }
  | { scope: "trailer"; id: string; companyId: string };

export function docsOf(documents: DocumentItem[], t: DocTarget) {
  return documents.filter((d) => {
    if (t.scope === "load") return d.load_id === t.id;
    if (t.scope === "driver") return d.driver_id === t.id;
    if (t.scope === "truck") return d.truck_id === t.id;
    if (t.scope === "trailer") return d.trailer_id === t.id;
    return d.company_id === t.companyId && !d.load_id && !d.driver_id && !d.truck_id && !d.trailer_id;
  });
}

/** The entity a document is attached to. */
export const scopeOf = (d: DocumentItem): Exclude<DocScope, "any"> =>
  d.load_id ? "load" : d.driver_id ? "driver" : d.truck_id ? "truck" : d.trailer_id ? "trailer" : "company";

/** Photo slots (trailer, truck, driver license / medical card) are shown in the photo galleries, not with documents. */
export const isPhotoDoc = (key: string) => key.startsWith("trailer_photo_") || key.startsWith("truck_photo_") || key.startsWith("driver_photo_");

/** Types offered for a scope, its own first, "any" types last. */
export function typesFor(docTypes: DocType[], scope: DocScope) {
  docTypes = docTypes.filter((t) => !isPhotoDoc(t.key));
  return [...docTypes.filter((t) => t.scope === scope).sort(byTypeOrder), ...docTypes.filter((t) => t.scope === "any").sort(byTypeOrder)];
}

const STAGE: Record<LoadStatus, number> = { new: 0, booked: 1, in_transit: 2, delivered: 3, invoiced: 4, paid: 5, canceled_by_broker: -1, canceled_by_carrier: -1 };
const NEED: Record<DocRequired, number> = { always: 0, booked: 1, in_transit: 2, delivered: 3 };

/** Is this type required for the target right now? (A canceled load needs nothing.) */
export function isRequired(t: DocType, target: DocTarget) {
  if (!t.required_from || (t.scope !== target.scope && t.scope !== "any")) return false;
  if (target.scope !== "load") return true;
  const stage = STAGE[target.status ?? "booked"] ?? 1;
  return stage >= 0 && stage >= NEED[t.required_from];
}

/** Newest file per type: an older COI or CDL doesn't count (or alert) once a newer one is on file. */
export function latestByType(docs: DocumentItem[]) {
  const m = new Map<string, DocumentItem>();
  for (const d of docs) {
    const cur = m.get(d.doc_type);
    if (!cur || d.uploaded_at > cur.uploaded_at) m.set(d.doc_type, d);
  }
  return m;
}

/** Older files of a type that has a newer upload for the same load / driver / truck / carrier. */
/** Types where every file counts (each training, policy or test), not just the newest. */
const MANY = new Set(["other", "freight_photos", "driver_trainings", "driver_policies", "drug_test", "inspection_report"]);

export function supersededIds(docs: DocumentItem[]) {
  const groups = new Map<string, DocumentItem[]>();
  for (const d of docs) {
    const k = `${scopeOf(d)}:${d.load_id || d.driver_id || d.truck_id || d.trailer_id || d.company_id}`;
    groups.set(k, [...(groups.get(k) || []), d]);
  }
  const out = new Set<string>();
  for (const g of groups.values()) {
    const latest = latestByType(g);
    for (const d of g) if (latest.get(d.doc_type)?.id !== d.id && !MANY.has(d.doc_type) && !isPhotoDoc(d.doc_type)) out.add(d.id);
  }
  return out;
}

export type DocState = "ok" | "missing" | "expired" | "soon" | "no_date";

/** Expiry state of a file; 30 days counts as "soon". */
export function expiryState(doc: DocumentItem | undefined, t?: DocType): DocState {
  if (!doc) return "missing";
  const n = daysUntil(doc.expires_on);
  if (n === null) return t?.has_expiry ? "no_date" : "ok";
  if (n < 0) return "expired";
  if (n <= 30) return "soon";
  return "ok";
}

export interface CheckItem {
  type: DocType;
  doc: DocumentItem | undefined;
  state: DocState;
  required: boolean;
}

/**
 * The paperwork list for one load / driver / truck / carrier: every required type, plus
 * any other type that already has a file (so expiring optional files show too).
 */
export function checklist(docTypes: DocType[], documents: DocumentItem[], target: DocTarget): CheckItem[] {
  const own = docsOf(documents, target);
  const latest = latestByType(own);
  if (target.scope === "driver") {
    // The license photographed in the driver form's slots counts as the driving license,
    // dated from the license expiry typed on the driver.
    const photo = own.filter((d) => d.doc_type.startsWith("driver_photo_license")).sort((a, b) => b.uploaded_at.localeCompare(a.uploaded_at))[0];
    const cdl = latest.get("cdl") ?? photo;
    if (cdl) latest.set("cdl", cdl.expires_on || !target.licenseExpiry ? cdl : { ...cdl, expires_on: target.licenseExpiry });
  }
  return typesFor(docTypes, target.scope)
    .filter((t) => t.key !== "other" && (isRequired(t, target) || latest.has(t.key)))
    .map((t) => ({ type: t, doc: latest.get(t.key), state: expiryState(latest.get(t.key), t), required: isRequired(t, target) }));
}

/** Required items that are missing or expired (what blocks billing / compliance). */
export const problems = (items: CheckItem[]) => items.filter((i) => i.required && (i.state === "missing" || i.state === "expired"));
/** Items that need attention soon (expiring, or an expiring type without a date). */
export const warnings = (items: CheckItem[]) => items.filter((i) => i.state === "soon" || i.state === "no_date");

// --------------------------------------------------------------------------
// Type from the file name ("TQL_RC_38710583.pdf" → Rate Confirmation)
// --------------------------------------------------------------------------
const GUESS: [RegExp, string][] = [
  [/\bpod\b|proof of deliv|delivery receipt|signed bol|\bdr\b/, "pod"],
  [/rate ?con|\brc\b|confirmation|load tender|tender/, "rate_confirmation"],
  [/\bbol\b|\bb ?o ?l\b|bill of lading|lading/, "bol"],
  [/lumper/, "lumper_receipt"],
  [/scale|weigh|cat ticket/, "scale_ticket"],
  [/detention|layover/, "detention_proof"],
  [/receipt/, "accessorial_receipt"],
  [/\bcoi\b|certificate of ins|insurance|\bacord\b/, "insurance"],
  [/physical damage/, "physical_damage"],
  [/authority|operating auth|\bmc (cert|letter)|fmcsa/, "authority"],
  [/\bw ?9\b/, "w9"],
  [/\bnoa\b|notice of assign|letter of release/, "noa"],
  [/dispatch (agreement|contract|service)/, "dispatch_agreement"],
  [/void(ed)? ?check|\bvoid\b/, "voided_check"],
  [/boc ?3/, "boc3"],
  [/\bucr\b/, "ucr"],
  [/carrier (packet|setup)|setup packet/, "carrier_packet"],
  [/factoring/, "factoring_agreement"],
  [/\bmvr\b|motor vehicle record|driving record/, "mvr"],
  [/clearinghouse/, "clearinghouse_full_query"],
  [/\bpsp\b|pre.?employment screening/, "psp"],
  [/termination/, "termination_letter"],
  [/inspection report|roadside/, "inspection_report"],
  [/pre.?employment/, "pre_employment_drug_test"],
  [/employment verification|past employ|previous employ/, "past_employment_verification"],
  [/passport/, "passport"],
  [/\bid card\b|state id|\bgovernment id\b/, "government_id"],
  [/policy|policies/, "driver_policies"],
  [/training|certificate of completion/, "driver_trainings"],
  [/\bhut\b|ny ?hut|highway use/, "ny_hut_permit"],
  [/\bnm\b.*permit|new mexico/, "nm_state_permit"],
  [/\bkyu\b|kentucky/, "ky_state_permit"],
  [/\bor\b.*permit|oregon/, "or_state_permit"],
  [/\bct\b.*permit|connecticut/, "ct_state_permit"],
  [/medical|\bmed ?card|dot physical|\bmec\b|examiner/, "medical_card"],
  [/\bcdl\b|driver'?s? licen[cs]e|\bdl\b|licen[cs]e/, "cdl"],
  [/drug|alcohol|clearinghouse/, "drug_test"],
  [/application/, "driver_application"],
  [/(driver|owner operator|lease) (agreement|contract)/, "driver_agreement"],
  [/cab ?card|\birp\b|apportion/, "registration"],
  [/ifta/, "ifta"],
  [/2290|hvut|schedule ?1/, "form_2290"],
  [/trailer reg/, "trailer_registration"],
  [/registration|\breg\b/, "registration"],
  [/inspection|annual insp|\bdot insp|\b396\b/, "inspection"],
  [/registration|\breg\b/, "trailer_registration"],
  [/inspection|annual|\b396\b/, "trailer_inspection"],
  [/reefer|thermo ?king|transicold|\btk\b/, "reefer_service"],
  [/interchange|lease/, "trailer_lease"],
  [/title/, "truck_title"],
  [/lease/, "truck_lease"],
  [/photo|damage|\bimg\b|\bdsc\b|\bpxl\b/, "freight_photos"],
];

/** Best type for a file uploaded to `scope`, or null when the name gives no hint. */
export function guessType(fileName: string, scope: DocScope, docTypes: DocType[]): string | null {
  const name = fileName
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_\-.+()[\]]+/g, " ")
    .toLowerCase();
  for (const [re, key] of GUESS) {
    if (!re.test(name)) continue;
    const t = docTypes.find((x) => x.key === key);
    if (t && (t.scope === scope || t.scope === "any")) return key;
  }
  return null;
}

// --------------------------------------------------------------------------
// Whole-fleet view (carrier Documents tab, dashboard alerts)
// --------------------------------------------------------------------------
export interface Holder {
  scope: "company" | "driver" | "truck" | "trailer";
  id: string;
  companyId: string;
  name: string;
  href: string;
  items: CheckItem[];
  /** required and missing or expired */
  bad: CheckItem[];
  /** expiring within 30 days, or expiring type without a date */
  soon: CheckItem[];
}

/** Paperwork state of each carrier, active driver, truck and trailer. */
export function fleetPaperwork(
  data: {
    companies: { id: string; name: string; status: string }[];
    drivers: { id: string; company_id: string; name: string; status: string }[];
    trucks: { id: string; company_id: string; unit_number: string; status: string }[];
    trailers?: { id: string; company_id: string; unit_number: string; status: string }[];
    documents: DocumentItem[];
    docTypes: DocType[];
  },
  companyIds?: (id: string) => boolean,
): Holder[] {
  const inScope = companyIds || (() => true);
  const out: Holder[] = [];
  const add = (scope: Holder["scope"], target: DocTarget, id: string, companyId: string, name: string, href: string) => {
    const items = checklist(data.docTypes, data.documents, target);
    out.push({ scope, id, companyId, name, href, items, bad: problems(items), soon: warnings(items) });
  };
  for (const c of data.companies.filter((c) => c.status !== "inactive" && inScope(c.id)))
    add("company", { scope: "company", companyId: c.id }, c.id, c.id, c.name, `/fleet?company=${c.id}&tab=docs`);
  for (const d of data.drivers.filter((d) => d.status === "active" && inScope(d.company_id)))
    add("driver", { scope: "driver", id: d.id, companyId: d.company_id }, d.id, d.company_id, d.name, `/fleet?company=${d.company_id}&tab=drivers&driver=${d.id}`);
  for (const t of data.trucks.filter((t) => t.status !== "inactive" && inScope(t.company_id)))
    add("truck", { scope: "truck", id: t.id, companyId: t.company_id }, t.id, t.company_id, `Unit ${t.unit_number}`, `/fleet?company=${t.company_id}&tab=trucks&truck=${t.id}`);
  for (const t of (data.trailers || []).filter((t) => t.status !== "inactive" && inScope(t.company_id)))
    add("trailer", { scope: "trailer", id: t.id, companyId: t.company_id }, t.id, t.company_id, `Trailer ${t.unit_number}`, `/fleet?company=${t.company_id}&tab=trailers&trailer=${t.id}`);
  return out;
}

/** "Bill of Lading (BOL)" → "BOL"; names without an abbreviation stay as they are. */
export const shortName = (t: Pick<DocType, "name">) => /\(([^)]+)\)\s*$/.exec(t.name)?.[1] || t.name;
