// Cases: the work TOSS does for a client (kind "work"), and customer service cases (kind
// "customer_service": overcharge, unhappy with a service / dispatcher / safety account manager,
// suggestion). Each has a log of notes, work (time) and expenses. Tables from migration 0029.

export type CaseKind = "work" | "customer_service";
export type CaseStatus =
  | "received"
  | "pending_documents"
  | "pending_payment"
  | "submitted_not_approved"
  | "ready_to_process"
  | "in_review"
  | "approved"
  | "completed"
  | "cancelled";
export type CasePriority = "low" | "normal" | "high" | "urgent";

export interface Case {
  id: string;
  number: number;
  kind: CaseKind;
  company_id: string | null;
  title: string;
  category: string | null;
  status: CaseStatus;
  priority: CasePriority;
  owner_id: string | null;
  opportunity_id: string | null;
  invoice_id: string | null;
  description: string | null;
  resolution: string | null;
  due_date: string | null;
  /** from a sale (migration 0051): the product / variant / opportunity line it was opened for */
  product_id?: string | null;
  variant_id?: string | null;
  opportunity_item_id?: string | null;
  /** overdue alert turned off (the entity takes longer), with the reason */
  alert_off?: boolean;
  alert_off_reason?: string | null;
  closed_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type EntryKind = "note" | "work" | "expense";
export type PaymentMethod = "card" | "bank" | "client_bank" | "client_card";
export const PAYMENT_METHODS: { v: PaymentMethod; label: string; account?: "card" | "bank" }[] = [
  { v: "card", label: "TOSS card", account: "card" },
  { v: "bank", label: "TOSS bank account", account: "bank" },
  { v: "client_bank", label: "Client's bank account" },
  { v: "client_card", label: "Client's credit card" },
];
/** Late and the alert isn't turned off. */
export const isOverdue = (c: Pick<Case, "status" | "due_date" | "alert_off">, today: string) => !isClosed(c.status) && !c.alert_off && !!c.due_date && c.due_date < today;
export interface CaseEntry {
  id: string;
  case_id: string;
  kind: EntryKind;
  body: string | null;
  minutes: number | null;
  amount: number | null;
  spent_on: string | null;
  attachments: { id: string; name: string; path: string; mime: string | null }[];
  /** expenses: how it was paid (a TOSS card / bank account from Accounting, or the client's) */
  payment_method?: PaymentMethod | null;
  account_id?: string | null;
  /** who processed it */
  processed_by?: string | null;
  website?: string | null;
  actor_id: string | null;
  actor_name: string | null;
  created_at: string;
}

const SKY = "bg-sky-500/10 text-sky-700 ring-sky-600/25 dark:text-sky-300";
const AMBER = "bg-amber-500/10 text-amber-700 ring-amber-600/25 dark:text-amber-300";
const VIOLET = "bg-violet-500/10 text-violet-700 ring-violet-600/25 dark:text-violet-300";
const GREEN = "bg-emerald-500/10 text-emerald-700 ring-emerald-600/25 dark:text-emerald-300";
/** A new case starts Received; Completed and Cancelled close it (migration 0045). */
export const CASE_STATUSES: { v: CaseStatus; label: string; pill: string }[] = [
  { v: "received", label: "Received", pill: SKY },
  { v: "pending_documents", label: "Pending documents - client", pill: AMBER },
  { v: "pending_payment", label: "Pending exchange payment", pill: AMBER },
  { v: "submitted_not_approved", label: "Submitted - not approved", pill: "bg-red-500/10 text-red-700 ring-red-600/25 dark:text-red-300" },
  { v: "ready_to_process", label: "Ready to process", pill: VIOLET },
  { v: "in_review", label: "In review by the state", pill: VIOLET },
  { v: "approved", label: "Approved by state", pill: GREEN },
  { v: "completed", label: "Completed", pill: GREEN },
  { v: "cancelled", label: "Cancelled", pill: "bg-surface-2 text-fg-3 ring-line" },
];
/** Completed or Cancelled: the case is closed. */
export const isClosed = (s: CaseStatus) => s === "completed" || s === "cancelled";
export const PRIORITIES: { v: CasePriority; label: string; pill: string }[] = [
  { v: "low", label: "Low", pill: "bg-surface-2 text-fg-3 ring-line" },
  { v: "normal", label: "Normal", pill: "bg-surface-2 text-fg-2 ring-line" },
  { v: "high", label: "High", pill: "bg-amber-500/10 text-amber-700 ring-amber-600/25 dark:text-amber-300" },
  { v: "urgent", label: "Urgent", pill: "bg-red-500/10 text-red-700 ring-red-600/25 dark:text-red-300" },
];
export const statusOf = (s: CaseStatus) => CASE_STATUSES.find((x) => x.v === s) ?? CASE_STATUSES[0];
export const priorityOf = (p: CasePriority) => PRIORITIES.find((x) => x.v === p)!;

/** Where a case opens: inside its customer (Cases tab), so you stay in that account. */
export const caseHref = (c: Pick<Case, "id" | "kind" | "company_id">) =>
  c.company_id ? `/fleet?company=${c.company_id}&tab=cases&kind=${c.kind}&case=${c.id}` : `${c.kind === "work" ? "/cases" : "/customer-service"}?case=${c.id}`;

/** "1h 30m" */
export const hoursLabel = (min: number) => (min >= 60 ? `${Math.floor(min / 60)}h${min % 60 ? ` ${min % 60}m` : ""}` : `${min}m`);
