"use client";

import { supabaseBrowser } from "@/lib/supabase/client";
import type { Company, Driver, Invoice, InvoiceLine, Load, Trailer, Truck } from "./types";

export const sb = () => supabaseBrowser();
export const BUCKET = "tms-docs";
/** Profile photos (public links; each member writes only their own folder). */
export const AVATARS = "tms-avatars";

/** Public link of a profile photo (null when none). */
export const avatarUrl = (path: string | null | undefined) => (path ? sb().storage.from(AVATARS).getPublicUrl(path).data.publicUrl : null);

/** Columns where an empty form value must be stored as NULL (dates, ids, numbers). */
const NULLABLE = /(_date|_expiry|_id|^expires_on|_on|^year|^max_weight|^weight_lbs)$/;

/** Form values → row values: trims strings, "" → null for nullable typed columns. */
export function clean<T extends Record<string, unknown>>(row: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (v === undefined) continue;
    if (typeof v === "string") {
      const t = v.trim();
      out[k] = t === "" && NULLABLE.test(k) ? null : t;
    } else {
      out[k] = v;
    }
  }
  return out as T;
}

const n = (v: unknown) => (v === null || v === undefined || v === "" ? 0 : Number(v));
const nn = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));

// PostgREST returns numeric as number, but normalise defensively (and arrays/jsonb).
export const normCompany = (r: Company): Company => ({
  ...r,
  commission_percent: n(r.commission_percent),
  payment_terms_days: n(r.payment_terms_days),
  services: r.services && typeof r.services === "object" ? r.services : {},
  compliance: r.compliance && typeof r.compliance === "object" ? r.compliance : {},
  stage: r.stage === "lead" ? "lead" : "client",
});
export const normDriver = (r: Driver): Driver => r;
export const normTruck = (r: Truck): Truck => ({
  ...r,
  // Postgres time comes back as "HH:MM:SS"; the form and labels use "HH:MM".
  available_time: r.available_time ? String(r.available_time).slice(0, 5) : null,
  max_weight: nn(r.max_weight),
  year: nn(r.year),
  accessories: Array.isArray(r.accessories) ? r.accessories : [],
  desk_blocks: Array.isArray(r.desk_blocks) ? r.desk_blocks : [],
});
export const normTrailer = (r: Trailer): Trailer => ({
  ...r,
  max_weight: nn(r.max_weight),
  year: nn(r.year),
  specs: r.specs && typeof r.specs === "object" && !Array.isArray(r.specs) ? r.specs : {},
});
export const normLoad = (r: Load): Load => ({
  ...r,
  gross_amount: n(r.gross_amount),
  commission_percent: n(r.commission_percent),
  dispatcher_cut: n(r.dispatcher_cut),
  loaded_miles: n(r.loaded_miles),
  deadhead_miles: n(r.deadhead_miles),
  weight_lbs: nn(r.weight_lbs),
  stops: Array.isArray(r.stops) ? r.stops : [],
});
export const normLine = (r: InvoiceLine): InvoiceLine => ({
  ...r,
  kind: r.kind || "item",
  loaded_miles: r.loaded_miles === null || r.loaded_miles === undefined ? null : Number(r.loaded_miles),
  quantity: n(r.quantity),
  unit_price: n(r.unit_price),
  gross_amount: n(r.gross_amount),
  amount: n(r.amount),
});
export const normInvoice = (r: Invoice): Invoice => ({
  ...r,
  total_gross: n(r.total_gross),
  total_due: n(r.total_due),
  amount_paid: n(r.amount_paid),
  doc_overrides: r.doc_overrides && typeof r.doc_overrides === "object" ? r.doc_overrides : {},
  lines: (r.lines || []).map(normLine).sort((a, b) => a.position - b.position),
});

/** Human message for a Supabase/PostgREST error. */
export function errMsg(e: unknown): string {
  if (!e) return "Something went wrong.";
  if (typeof e === "string") return e;
  const m = (e as { message?: string }).message || "Something went wrong.";
  if (m.includes("row-level security")) return "You don't have permission to do that.";
  if (m.includes("Failed to fetch")) return "Can't reach the server. Check your connection.";
  return m;
}

/** Storage path for a new file. */
export function docPath(companyId: string, folder: string, fileName: string) {
  const safe = fileName.normalize("NFKD").replace(/[^\w.\-]+/g, "_").slice(-120);
  const rand = Math.random().toString(36).slice(2, 8);
  return `${companyId}/${folder}/${Date.now()}-${rand}-${safe}`;
}

/** Short-lived links for many files at once (photo thumbnails). Missing files are left out. */
export async function signedUrls(paths: string[]): Promise<Record<string, string>> {
  if (!paths.length) return {};
  const { data, error } = await sb().storage.from(BUCKET).createSignedUrls(paths, 60 * 30);
  if (error || !data) return {};
  const out: Record<string, string> = {};
  for (const r of data) if (r.path && r.signedUrl) out[r.path] = r.signedUrl;
  return out;
}

/** Short-lived link to view or download a private document. */
export async function signedUrl(path: string, download?: string | boolean) {
  const { data, error } = await sb()
    .storage.from(BUCKET)
    .createSignedUrl(path, 60 * 10, download ? { download: typeof download === "string" ? download : true } : undefined);
  if (error) throw error;
  return data.signedUrl;
}

export async function openDocument(path: string, fileName?: string, download = false) {
  // Open the tab first (synchronously) so popup blockers allow it, then point it at the file.
  const win = download ? null : window.open("about:blank", "_blank");
  try {
    const url = await signedUrl(path, download ? fileName || true : false);
    if (download) {
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName || "";
      document.body.appendChild(a);
      a.click();
      a.remove();
    } else if (win) {
      win.location.href = url;
    } else {
      window.location.href = url;
    }
  } catch (e) {
    win?.close();
    throw e;
  }
}

export async function fetchFileBytes(path: string): Promise<{ bytes: ArrayBuffer; type: string }> {
  const { data, error } = await sb().storage.from(BUCKET).download(path);
  if (error || !data) throw error || new Error("File not found");
  return { bytes: await data.arrayBuffer(), type: data.type };
}
