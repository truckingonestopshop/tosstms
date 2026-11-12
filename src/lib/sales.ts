// Sales: products TOSS sells, templates & agreements, and opportunities (lead → won / lost).
// Tables from migration 0029. Invoices are TOSS Cloud's own (tms_invoices).

import type { ChargeInterval, ChargeService } from "./billing";
import type { Company } from "./types";

export type ProductKind = "subscription" | "one_time" | "exchange";
export const PRODUCT_KINDS: { v: ProductKind; label: string }[] = [
  { v: "subscription", label: "Subscription" },
  { v: "one_time", label: "One-time" },
  { v: "exchange", label: "Exchange" },
];
export const kindLabel = (k: ProductKind) => PRODUCT_KINDS.find((x) => x.v === k)?.label ?? k;

export interface Product {
  id: string;
  name: string;
  service: ChargeService;
  kind: ProductKind;
  price: number;
  billing_interval: ChargeInterval | null;
  description: string | null;
  active: boolean;
  sort: number;
  /** what TOSS pays for it (state fee…), prefilled on the case's expense (migration 0051) */
  expense: number | null;
  /** days the work takes: the case's due date */
  timeframe_days: number | null;
  /** most each level may discount, in dollars (a manager: rep + manager; the CRO: all three) */
  discount_rep: number;
  discount_manager: number;
  discount_cro: number;
  created_at: string;
  updated_at: string;
}

/** One version of a product with its own price (e.g. Articles of Incorporation · Florida). */
export interface ProductVariant {
  id: string;
  product_id: string;
  name: string;
  price: number;
  /** empty: the product's */
  expense: number | null;
  timeframe_days: number | null;
  /** per-variant discount caps in dollars (null/undefined falls back to the product's) */
  discount_rep?: number | null;
  discount_manager?: number | null;
  discount_cro?: number | null;
  active: boolean;
  sort: number;
  created_at: string;
}

export type SalesLevel = "rep" | "manager" | "cro";
export const SALES_LEVELS: { v: SalesLevel; label: string }[] = [
  { v: "rep", label: "Rep" },
  { v: "manager", label: "Manager" },
  { v: "cro", label: "CRO" },
];

export interface VariantDiscountOverride {
  discount_rep: number | null;
  discount_manager: number | null;
  discount_cro: number | null;
}

export interface DiscountTiers {
  rep: number;
  manager: number;
  cro: number;
  /** cumulative max for a Rep (= rep) */
  repCap: number;
  /** cumulative max for a Manager (= rep + manager) */
  managerCap: number;
  /** cumulative max for a CRO (= rep + manager + cro) */
  croCap: number;
  /** overall max discount (= rep + manager + cro) */
  overall: number;
}

/** Resolves the Rep / Manager (extra) / CRO (extra) and cumulative discount caps for a product and optional variant. */
export function resolveDiscountTiers(
  p?: Pick<Product, "discount_rep" | "discount_manager" | "discount_cro"> | null,
  v?: Pick<ProductVariant, "discount_rep" | "discount_manager" | "discount_cro"> | null,
  override?: VariantDiscountOverride | null,
): DiscountTiers {
  const pick = (ov: number | null | undefined, vv: number | null | undefined, pv: number | null | undefined) => {
    if (ov != null && !Number.isNaN(Number(ov))) return Number(ov);
    if (vv != null && !Number.isNaN(Number(vv))) return Number(vv);
    return Number(pv || 0) || 0;
  };
  const rep = pick(override?.discount_rep, v?.discount_rep, p?.discount_rep);
  const manager = pick(override?.discount_manager, v?.discount_manager, p?.discount_manager);
  const cro = pick(override?.discount_cro, v?.discount_cro, p?.discount_cro);
  const repCap = rep;
  const managerCap = rep + manager;
  const croCap = rep + manager + cro;
  return { rep, manager, cro, repCap, managerCap, croCap, overall: croCap };
}

/** The most this level may discount the product or variant (in dollars). */
export const discountCap = (
  p: Pick<Product, "discount_rep" | "discount_manager" | "discount_cro">,
  level: SalesLevel,
  v?: Pick<ProductVariant, "discount_rep" | "discount_manager" | "discount_cro"> | null,
  override?: VariantDiscountOverride | null,
) => {
  const t = resolveDiscountTiers(p, v, override);
  return level === "cro" ? t.croCap : level === "manager" ? t.managerCap : t.repCap;
};

/** Parses a stored variant discount JSON payload from tms_option_lists (list = 'variant_discount'). */
export function parseVariantDiscount(label: string | null | undefined): VariantDiscountOverride | null {
  if (!label) return null;
  try {
    const j = JSON.parse(label) as Partial<VariantDiscountOverride>;
    return {
      discount_rep: j.discount_rep == null ? null : Number(j.discount_rep),
      discount_manager: j.discount_manager == null ? null : Number(j.discount_manager),
      discount_cro: j.discount_cro == null ? null : Number(j.discount_cro),
    };
  } catch {
    return null;
  }
}

// ---- Product Bundles --------------------------------------------------------------------------------
export interface ProductBundleItem {
  product_id: string;
  variant_id?: string | null;
  quantity: number;
}

export interface ProductBundle {
  id: string;
  value: string;
  name: string;
  service: ChargeService;
  description: string | null;
  items: ProductBundleItem[];
  active: boolean;
  sort: number;
}

export function parseBundleRow(row: { id: string; value: string; label: string; sort: number; active: boolean }): ProductBundle | null {
  try {
    const j = JSON.parse(row.label) as {
      name?: string;
      service?: ChargeService;
      description?: string | null;
      items?: ProductBundleItem[];
    };
    if (!j || typeof j.name !== "string") return null;
    return {
      id: row.id,
      value: row.value,
      name: j.name,
      service: j.service || "mcpt",
      description: j.description ?? null,
      items: Array.isArray(j.items)
        ? j.items.map((x) => ({
            product_id: String(x.product_id || ""),
            variant_id: x.variant_id || null,
            quantity: Math.max(1, Number(x.quantity) || 1),
          })).filter((x) => x.product_id)
        : [],
      active: row.active,
      sort: row.sort,
    };
  } catch {
    return null;
  }
}

/** Default expected-close timeframe (in days) depending on the service selected. */
export const SERVICE_CLOSE_DAYS: Record<ChargeService, number> = {
  dispatch: 7,
  dot_compliance: 14,
  mcpt: 14,
  accounting: 14,
  factoring: 7,
  fuel_card: 5,
  insurance: 14,
  other: 14,
};

/** Automatically computes the expected close date (YYYY-MM-DD) for a selected service. */
export function expectedCloseForService(service: ChargeService, products?: Product[], baseDate?: string): string {
  const svcProducts = (products || []).filter((p) => p.active && p.service === service && p.timeframe_days != null && Number(p.timeframe_days) > 0);
  const days = svcProducts.length
    ? Math.max(...svcProducts.map((p) => Number(p.timeframe_days) || 0))
    : (SERVICE_CLOSE_DAYS[service] ?? 14);
  const d = baseDate ? new Date(`${baseDate}T12:00:00`) : new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
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

/**
 * Stage = where it is on the board; status = where the sale is: New, Invoice sent (an invoice was
 * made from it), Won (the invoice was paid: a case per product is opened), Lost or Abandoned.
 */
export type OppStatus = "new" | "invoice_sent" | "won" | "lost" | "abandoned";
export const OPP_STATUSES: { v: OppStatus; label: string; pill: string }[] = [
  { v: "new", label: "New", pill: "bg-sky-500/10 text-sky-700 ring-sky-600/25 dark:text-sky-300" },
  { v: "invoice_sent", label: "Invoice sent", pill: "bg-violet-500/10 text-violet-700 ring-violet-600/25 dark:text-violet-300" },
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
/** Still being worked (New or Invoice sent). */
export const isOpen = (o: Pick<Opportunity, "status">) => o.status === "new" || o.status === "invoice_sent";
export const OPEN_STATUSES: OppStatus[] = ["new", "invoice_sent"];

/** Days since the opportunity entered its stage. */
export const daysInStage = (o: Pick<Opportunity, "stage_entered_at">, now: number) => Math.floor((now - new Date(o.stage_entered_at).getTime()) / 86400000);
/** Sat in its stage longer than the stage allows. */
export const isRotting = (o: Opportunity, s: Stage | undefined, now: number) => isOpen(o) && !!s?.rot_days && daysInStage(o, now) > s.rot_days;
/** Value × the stage's win %. */
export const weighted = (o: Pick<Opportunity, "value">, s: Stage | undefined) => (Number(o.value) || 0) * ((s?.probability ?? 0) / 100);

export interface OppItem {
  id: string;
  opportunity_id: string;
  product_id: string | null;
  name: string;
  service: ChargeService;
  kind: ProductKind;
  billing_interval: "weekly" | "monthly" | "quarterly" | "yearly" | null;
  quantity: number;
  unit_price: number;
  sort: number;
  variant_id: string | null;
  variant_name: string | null;
  /** off the line, in dollars (limited by who gives it) */
  discount: number;
  discount_by: string | null;
  expense: number | null;
  timeframe_days: number | null;
}
/** Quantity × price, less the discount. */
export const itemTotal = (i: Pick<OppItem, "quantity" | "unit_price"> & { discount?: number | null }) =>
  Math.max(0, (Number(i.quantity) || 0) * (Number(i.unit_price) || 0) - (Number(i.discount) || 0));
/** "Articles of Incorporation · Florida" */
export const itemName = (i: Pick<OppItem, "name" | "variant_name">) => (i.variant_name ? `${i.name} · ${i.variant_name}` : i.name);

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
  { key: "date", label: "Today's date", get: () => new Date().toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" }) },
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
