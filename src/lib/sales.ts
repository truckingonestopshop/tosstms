// Sales: products TOSS sells, templates & agreements, and opportunities (lead → won / lost).
// Tables from migration 0029. Invoices are TOSS Cloud's own (tms_invoices).

import type { ChargeInterval, ChargeService } from "./billing";
import type { Company } from "./types";

export interface Product {
  id: string;
  name: string;
  service: ChargeService;
  kind: "subscription" | "one_time";
  price: number;
  billing_interval: ChargeInterval | null;
  description: string | null;
  active: boolean;
  sort: number;
  created_at: string;
  updated_at: string;
}

export type TemplateKind = "agreement" | "template" | "email";
export interface Template {
  id: string;
  name: string;
  kind: TemplateKind;
  service: ChargeService;
  body: string;
  file_path: string | null;
  file_name: string | null;
  created_at: string;
  updated_at: string;
}
export const TEMPLATE_KINDS: { v: TemplateKind; label: string }[] = [
  { v: "agreement", label: "Agreement" },
  { v: "template", label: "Document template" },
  { v: "email", label: "Email / message" },
];

// ---- Pipelines (GHL-style) --------------------------------------------------------------------------
export interface Pipeline {
  id: string;
  name: string;
  sort: number;
  active: boolean;
  created_at: string;
}
export interface Stage {
  id: string;
  pipeline_id: string;
  name: string;
  color: string | null;
  sort: number;
  /** chance to win, 0–100 (weighted pipeline) */
  probability: number;
  /** flagged when an opportunity sits here longer than this */
  rot_days: number | null;
}
export interface LostReason {
  id: string;
  name: string;
  sort: number;
  active: boolean;
}

/** Stage = where it is on the board; status = whether it's still live (like GHL). */
export type OppStatus = "open" | "won" | "lost" | "abandoned";
export const OPP_STATUSES: { v: OppStatus; label: string; pill: string }[] = [
  { v: "open", label: "Open", pill: "bg-sky-500/10 text-sky-700 ring-sky-600/25 dark:text-sky-300" },
  { v: "won", label: "Won", pill: "bg-emerald-500/10 text-emerald-700 ring-emerald-600/25 dark:text-emerald-300" },
  { v: "lost", label: "Lost", pill: "bg-red-500/10 text-red-700 ring-red-600/25 dark:text-red-300" },
  { v: "abandoned", label: "Abandoned", pill: "bg-surface-2 text-fg-3 ring-line" },
];
export const statusMeta = (s: OppStatus) => OPP_STATUSES.find((x) => x.v === s) ?? OPP_STATUSES[0];

export interface Opportunity {
  id: string;
  /** OPP-1001… */
  number: number;
  company_id: string;
  title: string;
  service: ChargeService;
  product_id: string | null;
  value: number;
  pipeline_id: string | null;
  stage_id: string | null;
  status: OppStatus;
  lost_reason_id: string | null;
  owner_id: string | null;
  followers: string[];
  source: string | null;
  contact_name: string | null;
  tags: string[];
  custom: Record<string, string | number | boolean | null>;
  expected_close: string | null;
  notes: string | null;
  stage_entered_at: string;
  closed_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}
export const oppNumber = (o: Pick<Opportunity, "number">) => (o.number ? `OPP-${o.number}` : "");
export const isOpen = (o: Pick<Opportunity, "status">) => o.status === "open";

/** Days since the opportunity entered its stage. */
export const daysInStage = (o: Pick<Opportunity, "stage_entered_at">, now: number) => Math.floor((now - new Date(o.stage_entered_at).getTime()) / 86400000);
/** Sat in its stage longer than the stage allows. */
export const isRotting = (o: Opportunity, s: Stage | undefined, now: number) => o.status === "open" && !!s?.rot_days && daysInStage(o, now) > s.rot_days;
/** Value × the stage's win %. */
export const weighted = (o: Pick<Opportunity, "value">, s: Stage | undefined) => (Number(o.value) || 0) * ((s?.probability ?? 0) / 100);

export interface OppItem {
  id: string;
  opportunity_id: string;
  product_id: string | null;
  name: string;
  service: ChargeService;
  kind: "subscription" | "one_time";
  billing_interval: "weekly" | "monthly" | "quarterly" | "yearly" | null;
  quantity: number;
  unit_price: number;
  sort: number;
}
export const itemTotal = (i: Pick<OppItem, "quantity" | "unit_price">) => (Number(i.quantity) || 0) * (Number(i.unit_price) || 0);

export interface OppTask {
  id: string;
  opportunity_id: string;
  title: string;
  due_date: string | null;
  assignee: string | null;
  done: boolean;
  done_at: string | null;
  created_at: string;
}
export interface OppEvent {
  id: string;
  opportunity_id: string;
  kind: "created" | "stage" | "status" | "note" | "update";
  message: string | null;
  attachments: { path: string; name: string; mime: string | null }[];
  actor_id: string | null;
  actor_name: string | null;
  created_at: string;
}
export interface OppField {
  id: string;
  label: string;
  type: "text" | "number" | "date" | "boolean" | "select";
  options: string[];
  required: boolean;
  sort: number;
  active: boolean;
}

export type AgreementStatus = "draft" | "sent" | "signed" | "void";
export interface Agreement {
  id: string;
  template_id: string | null;
  company_id: string | null;
  opportunity_id: string | null;
  title: string;
  body: string;
  status: AgreementStatus;
  sent_at: string | null;
  signed_at: string | null;
  signed_file: { path: string; name: string; mime: string | null } | null;
  invoice_id: string | null;
  created_at: string;
  updated_at: string;
}
export const AGREEMENT_STATUSES: { v: AgreementStatus; label: string; pill: string }[] = [
  { v: "draft", label: "Draft", pill: "bg-surface-2 text-fg-2 ring-line" },
  { v: "sent", label: "Sent", pill: "bg-sky-500/10 text-sky-700 ring-sky-600/25 dark:text-sky-300" },
  { v: "signed", label: "Signed", pill: "bg-emerald-500/10 text-emerald-700 ring-emerald-600/25 dark:text-emerald-300" },
  { v: "void", label: "Void", pill: "bg-surface-2 text-fg-4 ring-line" },
];

/** Template placeholders and what they're filled with for a company. */
export const PLACEHOLDERS: { key: string; label: string; get: (c: Company) => string }[] = [
  { key: "company_name", label: "Company legal name", get: (c) => c.name },
  { key: "dba", label: "DBA", get: (c) => c.dba_name || "" },
  { key: "dot_number", label: "USDOT", get: (c) => c.dot_number || "" },
  { key: "mc_number", label: "MC", get: (c) => c.mc_number || "" },
  { key: "ein", label: "EIN", get: (c) => c.ein || "" },
  { key: "representative", label: "Representative", get: (c) => [c.contact_first_name, c.contact_last_name].filter(Boolean).join(" ") || c.contact_name || "" },
  { key: "email", label: "Email", get: (c) => c.contact_email || "" },
  { key: "phone", label: "Phone", get: (c) => c.contact_phone || "" },
  { key: "address", label: "Address", get: (c) => [c.street, [c.city, [c.state, c.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ")].filter(Boolean).join(", ") || c.address || "" },
  { key: "dispatch_fee", label: "Dispatch fee %", get: (c) => (c.commission_percent ? `${c.commission_percent}%` : "") },
  { key: "date", label: "Today's date", get: () => new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) },
];

/** Opportunity placeholders (agreements made from an opportunity). */
export const OPP_PLACEHOLDERS: { key: string; label: string }[] = [
  { key: "opportunity", label: "Opportunity title" },
  { key: "opportunity_number", label: "Opportunity #" },
  { key: "opportunity_value", label: "Opportunity value" },
  { key: "products", label: "Products list" },
];

/**
 * The template text with {{placeholders}} filled for the company (and the opportunity with its
 * products, when given). Unknown ones stay as typed; missing values become ____.
 */
export function fillTemplate(body: string, c: Company | undefined, o?: { opp: Opportunity; items: OppItem[] }) {
  if (!c) return body;
  const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });
  const oppVals: Record<string, string> = o
    ? {
        opportunity: o.opp.title,
        opportunity_number: oppNumber(o.opp),
        opportunity_value: usd(Number(o.opp.value) || 0),
        products: o.items
          .map((i) => `- ${i.name}${Number(i.quantity) !== 1 ? ` × ${i.quantity}` : ""}: ${usd(itemTotal(i))}${i.kind === "subscription" && i.billing_interval ? ` (${i.billing_interval})` : ""}`)
          .join("\n"),
      }
    : {};
  return body.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (m, k: string) => {
    if (k in oppVals) return oppVals[k] || "____";
    const p = PLACEHOLDERS.find((x) => x.key === k);
    return p ? p.get(c) || "____" : m;
  });
}
