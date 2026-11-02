// Documents for signing (migration 0047): templates (a PDF with fields placed on it), requests
// (one send to recipients, each with a private /sign/<token> link) and what fills the fields.
// Shared by the app, the public signing page and the server routes.

export type FieldType = "signature" | "initials" | "date" | "text" | "checkbox";
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
export interface SignRecipient {
  id: string;
  request_id: string;
  role: string | null;
  kind: "signer" | "cc";
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

export const FIELD_TYPES: { v: FieldType; label: string; w: number; h: number }[] = [
  { v: "signature", label: "Signature", w: 0.26, h: 0.055 },
  { v: "initials", label: "Initials", w: 0.09, h: 0.045 },
  { v: "date", label: "Date", w: 0.17, h: 0.03 },
  { v: "text", label: "Text", w: 0.26, h: 0.03 },
  { v: "checkbox", label: "Checkbox", w: 0.028, h: 0.022 },
];
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
  | "company.phone"
  | "company.email"
  | "company.owner"
  | "recipient.name"
  | "recipient.email"
  | "recipient.phone"
  | "driver.name"
  | "driver.license"
  | "driver.license_state"
  | "driver.dob"
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
  { v: "company.phone", label: "Company: phone" },
  { v: "company.email", label: "Company: email" },
  { v: "company.owner", label: "Company: owner / main contact" },
  { v: "recipient.name", label: "Signer: name" },
  { v: "recipient.email", label: "Signer: email" },
  { v: "recipient.phone", label: "Signer: phone" },
  { v: "driver.name", label: "Driver: name" },
  { v: "driver.license", label: "Driver: license number" },
  { v: "driver.license_state", label: "Driver: license state" },
  { v: "driver.dob", label: "Driver: date of birth" },
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
    contact_phone?: string | null;
    contact_email?: string | null;
    contact_first_name?: string | null;
    contact_last_name?: string | null;
  } | null;
  driver?: { name?: string | null; cdl_number?: string | null; cdl_state?: string | null; dob?: string | null } | null;
  recipient?: { name?: string | null; email?: string | null; phone?: string | null } | null;
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
      return (c.address || "").replace(/\s*\n\s*/g, ", ");
    case "company.phone":
      return c.contact_phone || "";
    case "company.email":
      return c.contact_email || "";
    case "company.owner":
      return [c.contact_first_name, c.contact_last_name].filter(Boolean).join(" ");
    case "recipient.name":
      return s.recipient?.name || "";
    case "recipient.email":
      return s.recipient?.email || "";
    case "recipient.phone":
      return s.recipient?.phone || "";
    case "driver.name":
      return s.driver?.name || "";
    case "driver.license":
      return s.driver?.cdl_number || "";
    case "driver.license_state":
      return s.driver?.cdl_state || "";
    case "driver.dob":
      return s.driver?.dob ? usDate(s.driver.dob) : "";
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

/** A field's value is empty (checkboxes: "" or "false"). */
export const isEmpty = (f: SignField, v: string | undefined) => (f.type === "checkbox" ? v !== "true" : !(v || "").trim());

/** Signers of a request (no CC), in signing order. */
export const signersOf = (list: SignRecipient[]) => list.filter((r) => r.kind === "signer").sort((a, b) => a.position - b.position);

export const newFieldId = () => Math.random().toString(36).slice(2, 10);
