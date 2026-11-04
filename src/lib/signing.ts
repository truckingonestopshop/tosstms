// Documents for signing (migration 0047): templates (a PDF with fields placed on it), requests
// (one send to recipients, each with a private /sign/<token> link) and what fills the fields.
// Shared by the app, the public signing page and the server routes.

export type FieldType =
  | "signature"
  | "initials"
  | "date"
  | "text"
  | "name"
  | "email"
  | "company"
  | "title"
  | "number"
  | "dropdown"
  | "radio"
  | "checkbox"
  | "attachment";
/** Format checks on typed fields. */
export type Validation = "email" | "phone" | "ein" | "ssn" | "zip" | "number";
export type TemplateCategory = "company" | "der" | "driver" | "other";
/** "toss": filled by TOSS before sending. Any other value is a signer role key. */
export const TOSS = "toss";

export interface SignField {
  id: string;
  type: FieldType;
  page: number;
  /** position and size as a share (0–1) of the page, from its top-left corner */
  x: number;
  y: number;
  w: number;
  h: number;
  role: string;
  label: string;
  required: boolean;
  /** fills itself from the carrier / person / today (see AUTO) */
  auto?: AutoKey | null;
  /** text or default value saved directly on the template */
  value?: string | null;
  /** dropdown / radio choices */
  options?: string[];
  validation?: Validation | null;
  /** shown filled in, can't be changed by the signer */
  readOnly?: boolean;
  /** only shown (and required) when another field has this value ("checked" for a checkbox) */
  showIf?: { field: string; equals: string } | null;
  /** number fields: worked out from others, e.g. "{Qty} * {Price}" (field labels in braces) */
  formula?: string | null;
}
export interface SignRole {
  key: string;
  label: string;
}
export interface PageSize {
  w: number;
  h: number;
}

export interface SignTemplate {
  id: string;
  name: string;
  description: string | null;
  category: TemplateCategory;
  doc_type: string | null;
  /** pdf: an uploaded PDF with fields placed on it; written: typed in TOSS Cloud (migration 0048) */
  kind: "pdf" | "written";
  /** written templates: the document (HTML with merge values and field tokens) */
  body: string | null;
  /** written templates: the TOSS letterhead on every page (migration 0054) */
  letterhead?: boolean;
  /** pdf templates only */
  file_path: string | null;
  file_name: string | null;
  pages: PageSize[];
  roles: SignRole[];
  /** written templates: the fields in the text (their place is worked out when it's made a PDF) */
  fields: SignField[];
  created_at: string;
  updated_at: string;
}

export type RequestStatus = "draft" | "sent" | "completed" | "declined" | "expired" | "void";
export interface SignRequest {
  id: string;
  number: number;
  title: string;
  template_id: string | null;
  company_id: string | null;
  driver_id: string | null;
  person_id: string | null;
  case_id: string | null;
  doc_type: string | null;
  file_path: string;
  file_name: string;
  pages: PageSize[];
  roles: SignRole[];
  fields: SignField[];
  values: Record<string, string>;
  status: RequestStatus;
  in_order: boolean;
  subject: string | null;
  message: string | null;
  expires_at: string | null;
  signed_path: string | null;
  document_id: string | null;
  sent_at: string | null;
  completed_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type RecipientStatus = "waiting" | "sent" | "viewed" | "signed" | "declined";
/** signer: fills and signs; viewer: must open it; approver: approves or declines; cc: gets the copy */
export type RecipientKind = "signer" | "viewer" | "approver" | "cc";
export const RECIPIENT_KINDS: { v: RecipientKind; label: string; hint: string }[] = [
  { v: "signer", label: "Signs", hint: "Fills in their fields and signs" },
  { v: "approver", label: "Approves", hint: "Reviews and approves (or declines)" },
  { v: "viewer", label: "Needs to view", hint: "Must open and review it" },
  { v: "cc", label: "Gets a copy", hint: "Receives the signed copy" },
];
export type Verify = "none" | "code" | "email";
export interface SignRecipient {
  id: string;
  request_id: string;
  role: string | null;
  kind: RecipientKind;
  verify?: Verify;
  access_code?: string | null;
  verified_at?: string | null;
  in_person?: boolean;
  files?: { fieldId: string; name: string; path: string; mime: string | null }[];
  name: string;
  email: string | null;
  phone: string | null;
  position: number;
  token: string;
  status: RecipientStatus;
  values: Record<string, string>;
  declined_reason: string | null;
  sent_at: string | null;
  viewed_at: string | null;
  signed_at: string | null;
  ip?: string | null;
  user_agent?: string | null;
  created_at: string;
}

export interface SignEvent {
  id: string;
  request_id: string;
  recipient_id: string | null;
  action: string;
  detail: string | null;
  ip: string | null;
  user_agent: string | null;
  actor_name: string | null;
  created_at: string;
}

export const FIELD_TYPES: { v: FieldType; label: string; w: number; h: number; auto?: AutoKey; validation?: Validation }[] = [
  { v: "signature", label: "Signature", w: 0.26, h: 0.055 },
  { v: "initials", label: "Initials", w: 0.09, h: 0.045 },
  { v: "date", label: "Date signed", w: 0.17, h: 0.03, auto: "today" },
  { v: "name", label: "Full name", w: 0.26, h: 0.03, auto: "recipient.name" },
  { v: "email", label: "Email", w: 0.26, h: 0.03, auto: "recipient.email", validation: "email" },
  { v: "company", label: "Company", w: 0.3, h: 0.03, auto: "company.name" },
  { v: "title", label: "Title", w: 0.2, h: 0.03 },
  { v: "text", label: "Text", w: 0.26, h: 0.03 },
  { v: "number", label: "Number", w: 0.14, h: 0.03, validation: "number" },
  { v: "dropdown", label: "Dropdown", w: 0.22, h: 0.032 },
  { v: "radio", label: "Choice", w: 0.22, h: 0.06 },
  { v: "checkbox", label: "Checkbox", w: 0.028, h: 0.022 },
  { v: "attachment", label: "Attachment", w: 0.22, h: 0.035 },
];
/** Typed fields (a value written on the PDF). */
export const TEXTLIKE: FieldType[] = ["text", "name", "email", "company", "title", "number", "date", "dropdown", "radio"];
export const VALIDATIONS: { v: Validation; label: string; hint: string; re: RegExp }[] = [
  { v: "email", label: "Email", hint: "name@company.com", re: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ },
  { v: "phone", label: "Phone", hint: "(305) 555-0100", re: /^\+?1?[\s.-]?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}$/ },
  { v: "ein", label: "EIN", hint: "12-3456789", re: /^\d{2}-?\d{7}$/ },
  { v: "ssn", label: "SSN", hint: "123-45-6789", re: /^\d{3}-?\d{2}-?\d{4}$/ },
  { v: "zip", label: "ZIP", hint: "33101", re: /^\d{5}(-\d{4})?$/ },
  { v: "number", label: "Number", hint: "1234.50", re: /^-?\d+(\.\d+)?$/ },
];

/** Shown (and required) only when its condition is met. */
export function isShown(f: SignField, fields: SignField[], values: Record<string, string>) {
  if (!f.showIf?.field) return true;
  const src = fields.find((x) => x.id === f.showIf!.field);
  const v = values[f.showIf.field] || "";
  if (src?.type === "checkbox") return (v === "true") === (f.showIf.equals !== "unchecked");
  return v.trim().toLowerCase() === (f.showIf.equals || "").trim().toLowerCase();
}

/** A formula's value, e.g. "{Qty} * {Price}" → "37.50" ("" when it can't be worked out). */
export function evalFormula(formula: string, fields: SignField[], values: Record<string, string>): string {
  const expr = formula.replace(/\{([^}]+)\}/g, (_, label: string) => {
    const f = fields.find((x) => x.label.trim().toLowerCase() === label.trim().toLowerCase());
    const n = Number(String((f && values[f.id]) || "0").replace(/[$,\s]/g, ""));
    return Number.isFinite(n) ? `(${n})` : "(0)";
  });
  if (!/^[\d+\-*/().\s]+$/.test(expr)) return "";
  try {
    const n = Function(`"use strict"; return (${expr});`)() as number;
    return Number.isFinite(n) ? String(Math.round(n * 100) / 100) : "";
  } catch {
    return "";
  }
}

/** What's wrong with a value ("" when fine). */
export function fieldProblem(f: SignField, v: string | undefined): string {
  const val = (v || "").trim();
  if (f.required && isEmpty(f, val)) return `Fill in "${f.label}"`;
  if (!val || f.type === "checkbox" || f.type === "signature" || f.type === "initials" || f.type === "attachment") return "";
  const rule = VALIDATIONS.find((x) => x.v === (f.validation || (f.type === "email" ? "email" : f.type === "number" ? "number" : null)));
  if (rule && !rule.re.test(rule.v === "number" ? val.replace(/[$,]/g, "") : val)) return `"${f.label}" should look like ${rule.hint}`;
  if ((f.type === "dropdown" || f.type === "radio") && f.options?.length && !f.options.includes(val)) return `Pick one of the choices for "${f.label}"`;
  return "";
}
export const fieldTypeLabel = (t: FieldType) => FIELD_TYPES.find((x) => x.v === t)?.label ?? t;

export const CATEGORIES: { v: TemplateCategory; label: string; hint: string }[] = [
  { v: "company", label: "Company", hint: "W-9, contracts, agreements, policies" },
  { v: "der", label: "DER", hint: "Sent to the Designated Employer Representative" },
  { v: "driver", label: "Driver", hint: "Employment application, Clearinghouse authorization, policies" },
  { v: "other", label: "Other", hint: "Anything else" },
];

export const REQUEST_STATUS: Record<RequestStatus, { label: string; pill: string }> = {
  draft: { label: "Draft", pill: "bg-surface-2 text-fg-3 ring-line" },
  sent: { label: "Waiting for signatures", pill: "bg-sky-500/10 text-sky-700 ring-sky-600/25 dark:text-sky-300" },
  completed: { label: "Completed", pill: "bg-emerald-500/10 text-emerald-700 ring-emerald-600/25 dark:text-emerald-300" },
  declined: { label: "Declined", pill: "bg-red-500/10 text-red-700 ring-red-600/25 dark:text-red-300" },
  expired: { label: "Expired", pill: "bg-amber-500/10 text-amber-700 ring-amber-600/25 dark:text-amber-300" },
  void: { label: "Cancelled", pill: "bg-surface-2 text-fg-3 ring-line" },
};
export const RECIPIENT_STATUS: Record<RecipientStatus, string> = {
  waiting: "Waiting for their turn",
  sent: "Sent",
  viewed: "Opened",
  signed: "Signed",
  declined: "Declined",
};

// ---------------------------------------------------------------------------------------------
// Auto-fill: values a field takes from the carrier, the person it goes to, or the day
// ---------------------------------------------------------------------------------------------
export type AutoKey =
  | "company.name"
  | "company.dba"
  | "company.dot"
  | "company.mc"
  | "company.ein"
  | "company.address"
  | "company.street"
  | "company.city"
  | "company.state"
  | "company.zip"
  | "company.phone"
  | "company.email"
  | "company.owner"
  | "recipient.name"
  | "recipient.email"
  | "recipient.phone"
  | "recipient.title"
  | "driver.name"
  | "driver.phone"
  | "driver.email"
  | "driver.license"
  | "driver.license_state"
  | "driver.license_type"
  | "driver.license_expiry"
  | "driver.medical_expiry"
  | "driver.dob"
  | "driver.hire_date"
  | "today"
  | "today.day"
  | "today.month"
  | "today.year";

export const AUTO: { v: AutoKey; label: string }[] = [
  { v: "company.name", label: "Company: legal name" },
  { v: "company.dba", label: "Company: DBA" },
  { v: "company.dot", label: "Company: USDOT" },
  { v: "company.mc", label: "Company: MC" },
  { v: "company.ein", label: "Company: EIN" },
  { v: "company.address", label: "Company: address" },
  { v: "company.street", label: "Company: street" },
  { v: "company.city", label: "Company: city" },
  { v: "company.state", label: "Company: state" },
  { v: "company.zip", label: "Company: ZIP" },
  { v: "company.phone", label: "Company: phone" },
  { v: "company.email", label: "Company: email" },
  { v: "company.owner", label: "Company: owner / main contact" },
  { v: "recipient.name", label: "Signer: name" },
  { v: "recipient.email", label: "Signer: email" },
  { v: "recipient.phone", label: "Signer: phone" },
  { v: "recipient.title", label: "Signer: title / role" },
  { v: "driver.name", label: "Driver: name" },
  { v: "driver.phone", label: "Driver: phone" },
  { v: "driver.email", label: "Driver: email" },
  { v: "driver.license", label: "Driver: license number" },
  { v: "driver.license_state", label: "Driver: license state" },
  { v: "driver.license_type", label: "Driver: license type (CDL / DL)" },
  { v: "driver.license_expiry", label: "Driver: license expires" },
  { v: "driver.medical_expiry", label: "Driver: medical card expires" },
  { v: "driver.dob", label: "Driver: date of birth" },
  { v: "driver.hire_date", label: "Driver: hire date" },
  { v: "today", label: "Today's date" },
  { v: "today.day", label: "Today: day (e.g. 2nd)" },
  { v: "today.month", label: "Today: month (e.g. November)" },
  { v: "today.year", label: "Today: year" },
];

export interface AutoSource {
  company?: {
    name?: string | null;
    dba_name?: string | null;
    dot_number?: string | null;
    mc_number?: string | null;
    ein?: string | null;
    address?: string | null;
    street?: string | null;
    city?: string | null;
    state?: string | null;
    zip?: string | null;
    contact_phone?: string | null;
    contact_email?: string | null;
    contact_first_name?: string | null;
    contact_last_name?: string | null;
  } | null;
  driver?: {
    name?: string | null;
    phone?: string | null;
    email?: string | null;
    cdl_number?: string | null;
    cdl_state?: string | null;
    license_type?: string | null;
    cdl_expiry?: string | null;
    medical_card_expiry?: string | null;
    dob?: string | null;
    hire_date?: string | null;
  } | null;
  person?: {
    first_name?: string | null;
    last_name?: string | null;
    phone?: string | null;
    email?: string | null;
    title?: string | null;
    is_owner?: boolean;
    is_der?: boolean;
    is_contact?: boolean;
    license_type?: string | null;
    license_number?: string | null;
    license_state?: string | null;
    license_expiry?: string | null;
    dob?: string | null;
  } | null;
  recipient?: { name?: string | null; email?: string | null; phone?: string | null; title?: string | null } | null;
  /** YYYY-MM-DD; defaults to today */
  date?: string;
}

const ordinal = (n: number) => `${n}${n % 10 === 1 && n % 100 !== 11 ? "st" : n % 10 === 2 && n % 100 !== 12 ? "nd" : n % 10 === 3 && n % 100 !== 13 ? "rd" : "th"}`;
export const usDate = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return y && m && d ? `${m}/${d}/${y}` : iso;
};
const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** The value an auto field takes ("" when the source doesn't have it). */
export function autoValue(key: AutoKey, s: AutoSource): string {
  const c = s.company || {};
  const p = s.person || {};
  const personName = [p.first_name, p.last_name].filter(Boolean).join(" ");
  const date = s.date || localToday();
  const [y, m, d] = date.split("-").map(Number);
  switch (key) {
    case "company.name":
      return c.name || "";
    case "company.dba":
      return c.dba_name || "";
    case "company.dot":
      return c.dot_number || "";
    case "company.mc":
      return c.mc_number || "";
    case "company.ein":
      return c.ein || "";
    case "company.address":
      return (c.address || [c.street, c.city, c.state, c.zip].filter(Boolean).join(", ")).replace(/\s*\n\s*/g, ", ");
    case "company.street":
      return c.street || "";
    case "company.city":
      return c.city || "";
    case "company.state":
      return c.state || "";
    case "company.zip":
      return c.zip || "";
    case "company.phone":
      return c.contact_phone || "";
    case "company.email":
      return c.contact_email || "";
    case "company.owner":
      return [c.contact_first_name, c.contact_last_name].filter(Boolean).join(" ") || (p.is_owner ? personName : "");
    case "recipient.name":
      return s.recipient?.name || personName || s.driver?.name || "";
    case "recipient.email":
      return s.recipient?.email || p.email || s.driver?.email || "";
    case "recipient.phone":
      return s.recipient?.phone || p.phone || s.driver?.phone || "";
    case "recipient.title":
      return s.recipient?.title || p.title || (p.is_owner ? "Owner" : p.is_der ? "DER" : s.driver ? "Driver" : "");
    case "driver.name":
      return s.driver?.name || personName || s.recipient?.name || "";
    case "driver.phone":
      return s.driver?.phone || p.phone || s.recipient?.phone || "";
    case "driver.email":
      return s.driver?.email || p.email || s.recipient?.email || "";
    case "driver.license":
      return s.driver?.cdl_number || p.license_number || "";
    case "driver.license_state":
      return s.driver?.cdl_state || p.license_state || "";
    case "driver.license_type":
      return s.driver?.license_type || p.license_type || "";
    case "driver.license_expiry": {
      const exp = s.driver?.cdl_expiry || p.license_expiry;
      return exp ? usDate(exp) : "";
    }
    case "driver.medical_expiry":
      return s.driver?.medical_card_expiry ? usDate(s.driver.medical_card_expiry) : "";
    case "driver.dob": {
      const dob = s.driver?.dob || p.dob;
      return dob ? usDate(dob) : "";
    }
    case "driver.hire_date":
      return s.driver?.hire_date ? usDate(s.driver.hire_date) : "";
    case "today":
      return usDate(date);
    case "today.day":
      return ordinal(d);
    case "today.month":
      return new Date(y, m - 1, 1).toLocaleString("en-US", { month: "long" });
    case "today.year":
      return String(y);
  }
}

/** Matches a field's label or type to a database auto-fill key when one wasn't explicitly picked. */
export function inferAutoKey(label: string, type?: FieldType): AutoKey | null {
  const l = (label || "").trim().toLowerCase();
  if (/\b(dob|date of birth|birth\s*date)\b/.test(l)) return "driver.dob";
  if (/\b(hire\s*date|date\s*hired)\b/.test(l)) return "driver.hire_date";
  if (/\b(med(ical)?\s*(card)?\s*exp(ir(y|es|ation))?)\b/.test(l)) return "driver.medical_expiry";
  if (/\b(cdl|licen[cs]e)\s*exp(ir(y|es|ation))?\b/.test(l) || l === "expires") return "driver.license_expiry";
  if (/\b(cdl|licen[cs]e)\s*(state|st)\b/.test(l)) return "driver.license_state";
  if (/\b(cdl|licen[cs]e)\s*(type|class)\b/.test(l)) return "driver.license_type";
  if (/\b(cdl|driver'?s?\s*licen[cs]e|licen[cs]e\s*(#|no|num|number)?)\b/.test(l)) return "driver.license";
  if (/\b(usdot|dot\s*(#|no|num|number)?)\b/.test(l)) return "company.dot";
  if (/\b(mc\s*(#|no|num|number)?)\b/.test(l)) return "company.mc";
  if (/\b(ein|tax\s*id|fein)\b/.test(l)) return "company.ein";
  if (/\b(dba)\b/.test(l)) return "company.dba";
  if (/\b(company|carrier|motor\s*carrier|legal\s*name|employer)\b/.test(l)) return "company.name";
  if (/\b(company\s*address|carrier\s*address|business\s*address|address)\b/.test(l)) return "company.address";
  if (/\b(street)\b/.test(l)) return "company.street";
  if (/\b(city)\b/.test(l)) return "company.city";
  if (/\b(zip|postal)\b/.test(l)) return "company.zip";
  if (/\b(owner)\b/.test(l)) return "company.owner";
  if (/\b(driver\s*name|applicant(\s*name)?)\b/.test(l)) return "driver.name";
  if (/\b(driver\s*phone)\b/.test(l)) return "driver.phone";
  if (/\b(driver\s*email)\b/.test(l)) return "driver.email";
  if (/\b(company\s*phone)\b/.test(l)) return "company.phone";
  if (/\b(company\s*email)\b/.test(l)) return "company.email";
  if (/\b(phone|mobile|cell|telephone)\b/.test(l)) return "recipient.phone";
  if (/\b(e-?mail)\b/.test(l)) return "recipient.email";
  if (/\b(full\s*name|signer\s*name|printed\s*name|name)\b/.test(l)) return "recipient.name";
  if (/\b(title|position|role)\b/.test(l)) return "recipient.title";
  if (/\b(date\s*signed|today'?s?\s*date|signing\s*date)\b/.test(l)) return "today";
  if (type === "name") return "recipient.name";
  if (type === "email") return "recipient.email";
  if (type === "company") return "company.name";
  if (type === "title") return "recipient.title";
  if (type === "date") return "today";
  return null;
}

/**
 * Resolves the starting value of a template field from the database source (company, driver,
 * owner/DER/contact, signer) and any text/value saved directly on the template (`f.value`).
 */
export function resolveFieldValue(f: SignField, s: AutoSource): string {
  const saved = (f.value ?? "").trim();
  if (f.auto) return autoValue(f.auto, s) || saved;
  if (saved) return f.value!;
  const inferred = inferAutoKey(f.label, f.type);
  return inferred ? autoValue(inferred, s) : "";
}

/** A field's value is empty (checkboxes: "" or "false"). */
export const isEmpty = (f: SignField, v: string | undefined) => (f.type === "checkbox" ? v !== "true" : !(v || "").trim());

/** Everyone who has to act (sign, approve or view; not copies), in order. */
export const signersOf = (list: SignRecipient[]) => list.filter((r) => r.kind !== "cc").sort((a, b) => a.position - b.position);

export const newFieldId = () => Math.random().toString(36).slice(2, 10);
