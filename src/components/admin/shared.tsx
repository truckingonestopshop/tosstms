"use client";

import { cn } from "@/lib/format";

export type TmsRole = "owner" | "dispatcher";
export type LeadsRole = "owner" | "admin" | "member";
export type Status = "active" | "invited" | "disabled";

export interface AdminUser {
  id: string;
  email: string;
  full_name: string;
  position: string | null;
  phone: string | null;
  avatar_path: string | null;
  created_at: string;
  invited_at: string | null;
  last_sign_in_at: string | null;
  status: Status;
  super_admin: boolean;
  tms: TmsRole | null;
  tms_view: "dispatch" | "office";
  leads: LeadsRole | null;
}

export interface AuditRow {
  id: string;
  actor_email: string | null;
  action: string;
  target_email: string | null;
  details: Record<string, unknown>;
  created_at: string;
}

export const TMS_ROLES: { v: TmsRole; label: string; hint: string }[] = [
  { v: "dispatcher", label: "Dispatcher", hint: "Loads, fleet, documents, invoices" },
  { v: "owner", label: "Owner", hint: "Everything, plus team and billing settings" },
];

export const LEADS_ROLES: { v: LeadsRole; label: string; hint: string }[] = [
  { v: "member", label: "Member", hint: "Search leads, lists, exports, verify" },
  { v: "admin", label: "Admin", hint: "Members plus workspace settings" },
  { v: "owner", label: "Owner", hint: "Full control of the Leads workspace" },
];

export const STATUS_UI: Record<Status, { label: string; cls: string; dot: string }> = {
  active: { label: "Active", cls: "bg-emerald-500/10 text-emerald-700 ring-emerald-600/20 dark:text-emerald-300", dot: "bg-emerald-500" },
  invited: { label: "Invited", cls: "bg-sky-500/10 text-sky-700 ring-sky-600/20 dark:text-sky-300", dot: "bg-sky-500" },
  disabled: { label: "Disabled", cls: "bg-zinc-500/10 text-zinc-600 ring-zinc-600/20 dark:text-zinc-400", dot: "bg-zinc-400" },
};

export const roleLabel = (app: "tms" | "leads", r: string | null) =>
  !r ? "No access" : (app === "tms" ? TMS_ROLES : LEADS_ROLES).find((x) => x.v === r)?.label || r;

/** Small "TMS · Dispatcher" chip. */
export function AccessChip({ app, role }: { app: "tms" | "leads"; role: string | null }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border px-1.5 py-0.5 text-[11px] font-medium",
        role ? "border-line bg-surface-2 text-fg-2" : "border-dashed border-line text-fg-4",
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", role ? (app === "tms" ? "bg-brand" : "bg-violet-500") : "bg-fg-4/40")} />
      {app === "tms" ? "Cloud" : "Lead Hunter"}
      {role && <span className="text-fg">{roleLabel(app, role)}</span>}
    </span>
  );
}

/** JSON fetch with the server's error message. */
export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers || {}) } });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as { error?: string }).error || `Request failed (${res.status})`);
  return json as T;
}
