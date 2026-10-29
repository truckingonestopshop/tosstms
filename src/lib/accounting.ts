"use client";

// TOSS Accounting: TOSS's own money (migration 0033). Expenses, incoming money and transfers between
// TOSS's accounts, with categories, merchants, payment methods, custom fields, recurring expenses
// and the receipt / proof of each transaction (private tms-accounting bucket).

import { sb } from "./db";
import { addDays } from "./format";

export type AccountKind = "bank" | "card" | "cash" | "online" | "other";
export interface AccAccount {
  id: string;
  name: string;
  kind: AccountKind;
  last4: string | null;
  opening_balance: number;
  opening_date: string | null;
  color: string | null;
  notes: string | null;
  active: boolean;
  sort: number;
  created_at: string;
}
export const ACCOUNT_KINDS: { v: AccountKind; label: string }[] = [
  { v: "bank", label: "Bank account" },
  { v: "card", label: "Credit card" },
  { v: "cash", label: "Cash" },
  { v: "online", label: "Online (PayPal, Stripe…)" },
  { v: "other", label: "Other" },
];

export type CatKind = "expense" | "income";
export interface AccCategory {
  id: string;
  name: string;
  kind: CatKind;
  parent_id: string | null;
  color: string | null;
  budget_monthly: number | null;
  active: boolean;
  sort: number;
}

export interface AccMerchant {
  id: string;
  name: string;
  default_category_id: string | null;
  website: string | null;
  notes: string | null;
  active: boolean;
}

export type MethodKind = "card" | "ach" | "zelle" | "wire" | "check" | "cash" | "paypal" | "other";
export interface AccMethod {
  id: string;
  name: string;
  kind: MethodKind;
  account_id: string | null;
  last4: string | null;
  active: boolean;
  sort: number;
}
export const METHOD_KINDS: { v: MethodKind; label: string }[] = [
  { v: "card", label: "Card" },
  { v: "ach", label: "ACH" },
  { v: "zelle", label: "Zelle" },
  { v: "wire", label: "Wire" },
  { v: "check", label: "Check" },
  { v: "cash", label: "Cash" },
  { v: "paypal", label: "PayPal" },
  { v: "other", label: "Other" },
];

export type FieldType = "text" | "number" | "date" | "boolean" | "select";
export interface AccField {
  id: string;
  label: string;
  type: FieldType;
  options: string[];
  applies_to: "expense" | "income" | "all";
  required: boolean;
  sort: number;
  active: boolean;
}
export const FIELD_TYPES: { v: FieldType; label: string }[] = [
  { v: "text", label: "Text" },
  { v: "number", label: "Number" },
  { v: "date", label: "Date" },
  { v: "boolean", label: "Yes / no" },
  { v: "select", label: "Dropdown" },
];

export type Frequency = "weekly" | "monthly" | "quarterly" | "yearly";
export interface AccRecurring {
  id: string;
  name: string;
  kind: CatKind;
  merchant_id: string | null;
  counterparty: string | null;
  category_id: string | null;
  payment_method_id: string | null;
  account_id: string | null;
  amount: number;
  frequency: Frequency;
  next_date: string;
  active: boolean;
  notes: string | null;
}
export const FREQUENCIES: { v: Frequency; label: string }[] = [
  { v: "weekly", label: "Weekly" },
  { v: "monthly", label: "Monthly" },
  { v: "quarterly", label: "Quarterly" },
  { v: "yearly", label: "Yearly" },
];
/** The date after `d` for this frequency. */
export function nextDate(d: string, f: Frequency) {
  if (f === "weekly") return addDays(d, 7);
  const x = new Date(`${d}T12:00:00`);
  const months = f === "monthly" ? 1 : f === "quarterly" ? 3 : 12;
  const day = x.getDate();
  x.setDate(1);
  x.setMonth(x.getMonth() + months);
  x.setDate(Math.min(day, new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate()));
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}
/** What a recurring item costs per month. */
export const perMonth = (r: Pick<AccRecurring, "amount" | "frequency">) => {
  const a = Number(r.amount) || 0;
  return r.frequency === "weekly" ? (a * 52) / 12 : r.frequency === "quarterly" ? a / 3 : r.frequency === "yearly" ? a / 12 : a;
};

export type TxKind = "expense" | "income" | "transfer";
export interface AccFile {
  path: string;
  name: string;
  mime: string | null;
  size: number | null;
}
export interface AccTransaction {
  id: string;
  kind: TxKind;
  date: string;
  amount: number;
  account_id: string | null;
  to_account_id: string | null;
  payment_method_id: string | null;
  merchant_id: string | null;
  counterparty: string | null;
  category_id: string | null;
  processed_by: string | null;
  company_id: string | null;
  status: "pending" | "cleared";
  tags: string[];
  notes: string | null;
  custom: Record<string, string | number | boolean | null>;
  files: AccFile[];
  recurring_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}
export const TX_KINDS: { v: TxKind; label: string }[] = [
  { v: "expense", label: "Expense" },
  { v: "income", label: "Incoming" },
  { v: "transfer", label: "Transfer" },
];

export interface AccSettings {
  id: number;
  require_receipt: boolean;
  require_proof: boolean;
}

/** Balance of each account: opening balance + incoming − expenses ± transfers. */
export function balances(accounts: AccAccount[], txs: AccTransaction[], methods: AccMethod[]) {
  const m = new Map<string, number>(accounts.map((a) => [a.id, Number(a.opening_balance) || 0]));
  for (const t of txs) {
    const amt = Number(t.amount) || 0;
    const from = t.account_id || (t.payment_method_id ? methods.find((x) => x.id === t.payment_method_id)?.account_id : null) || null;
    if (t.kind === "income" && from && m.has(from)) m.set(from, m.get(from)! + amt);
    if (t.kind === "expense" && from && m.has(from)) m.set(from, m.get(from)! - amt);
    if (t.kind === "transfer") {
      if (from && m.has(from)) m.set(from, m.get(from)! - amt);
      if (t.to_account_id && m.has(t.to_account_id)) m.set(t.to_account_id, m.get(t.to_account_id)! + amt);
    }
  }
  return m;
}

/** A transaction missing its receipt (expense) / proof (incoming), when the settings require it. */
export const missingFile = (t: AccTransaction, s: AccSettings | null) =>
  (t.kind === "expense" && (s?.require_receipt ?? true) && !t.files?.length) || (t.kind === "income" && (s?.require_proof ?? true) && !t.files?.length);

export const ACC_BUCKET = "tms-accounting";

/** Uploads a receipt / proof; returns what to store on the transaction. */
export async function uploadAccFile(file: File): Promise<AccFile> {
  const path = `${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}/${file.name.replace(/[^\w.\- ]+/g, "_")}`;
  const { error } = await sb().storage.from(ACC_BUCKET).upload(path, file, { contentType: file.type || undefined });
  if (error) throw error;
  return { path, name: file.name, mime: file.type || null, size: file.size };
}

/** Opens a receipt / proof in a new tab (signed link, 5 minutes). */
export async function openAccFile(f: AccFile) {
  const win = window.open("about:blank", "_blank");
  const { data, error } = await sb().storage.from(ACC_BUCKET).createSignedUrl(f.path, 300);
  if (error || !data) {
    win?.close();
    throw error || new Error("Couldn't open the file");
  }
  if (win) win.location.href = data.signedUrl;
}
