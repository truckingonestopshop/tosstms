"use client";

import { ShieldCheck } from "lucide-react";
import { cn } from "@/lib/format";
import { LEADS_ROLES, TMS_ROLES, type LeadsRole, type TmsRole } from "./shared";

export type TmsView = "dispatch" | "office";

const VIEWS: { v: TmsView; label: string; hint: string }[] = [
  { v: "dispatch", label: "Dispatch", hint: "Loads and units first" },
  { v: "office", label: "Office", hint: "Carrier profile first, lists" },
];

export interface Access {
  tms: TmsRole | null;
  tms_view: TmsView;
  leads: LeadsRole | null;
  super_admin: boolean;
}

/** Pick which apps a person can use, their role in each, and super admin. */
export function AccessEditor({ value, onChange, lockSelf }: { value: Access; onChange: (a: Access) => void; lockSelf?: boolean }) {
  return (
    <div className="space-y-2.5">
      <AppCard
        name="TOSS Cloud"
        about="Dispatch: loads, fleet, documents, invoices"
        tone="bg-brand"
        roles={TMS_ROLES}
        role={value.tms}
        locked={lockSelf || value.super_admin}
        lockedWhy={lockSelf ? "You can't remove your own TOSS Cloud access." : "Super admins keep TOSS Cloud access (the admin panel is in TOSS Cloud)."}
        onRole={(r) => onChange({ ...value, tms: r as TmsRole | null })}
        extra={
          <div className="mt-3">
            <div className="mb-1.5 text-[11px] font-semibold text-fg-3">View</div>
            <Choices options={VIEWS} value={value.tms_view} onPick={(v) => onChange({ ...value, tms_view: v as TmsView })} />
          </div>
        }
      />
      <AppCard
        name="TOSS Lead Hunter"
        about="Lead search, lists, verification, exports"
        tone="bg-violet-500"
        roles={LEADS_ROLES}
        role={value.leads}
        onRole={(r) => onChange({ ...value, leads: r as LeadsRole | null })}
      />
      <label
        className={cn(
          "flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors",
          value.super_admin ? "border-brand/50 bg-brand/5" : "border-line hover:border-line-strong",
          lockSelf && "cursor-not-allowed opacity-70",
        )}
      >
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 accent-[#f28c38]"
          checked={value.super_admin}
          disabled={lockSelf}
          onChange={(e) => onChange({ ...value, super_admin: e.target.checked, tms: e.target.checked ? value.tms || "owner" : value.tms })}
        />
        <span className="min-w-0">
          <span className="flex items-center gap-1.5 text-[13px] font-semibold text-fg">
            <ShieldCheck className="h-4 w-4 text-brand" /> Super admin
          </span>
          <span className="block text-xs text-fg-3">
            {lockSelf ? "You can't remove your own super admin access." : "Opens this admin panel: invite people, change access in both apps, disable or delete accounts."}
          </span>
        </span>
      </label>
    </div>
  );
}

function AppCard({
  name,
  about,
  tone,
  roles,
  role,
  onRole,
  locked,
  lockedWhy,
  extra,
}: {
  name: string;
  about: string;
  tone: string;
  roles: { v: string; label: string; hint: string }[];
  role: string | null;
  onRole: (r: string | null) => void;
  locked?: boolean;
  lockedWhy?: string;
  /** more settings for the app, shown while it's on */
  extra?: React.ReactNode;
}) {
  const on = !!role;
  return (
    <div className={cn("rounded-xl border p-3 transition-colors", on ? "border-line bg-surface" : "border-dashed border-line-strong")}>
      <div className="flex items-center gap-3">
        <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", on ? tone : "bg-fg-4/40")} />
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold text-fg">{name}</div>
          <div className="truncate text-xs text-fg-3">{about}</div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label={`${name} access`}
          disabled={locked && on}
          title={locked && on ? lockedWhy : undefined}
          onClick={() => onRole(on ? null : roles[0].v)}
          className={cn("relative h-6 w-10 shrink-0 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-60", on ? "bg-inverse" : "bg-surface-3")}
        >
          <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-surface shadow transition-transform duration-200", on ? "translate-x-[18px]" : "translate-x-0.5")} />
        </button>
      </div>
      {on && (
        <div className="animate-rise mt-3">
          <Choices options={roles} value={role} onPick={onRole} />
          {extra}
        </div>
      )}
    </div>
  );
}

function Choices({ options, value, onPick }: { options: { v: string; label: string; hint: string }[]; value: string | null; onPick: (v: string) => void }) {
  return (
    <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((r) => (
        <button
          key={r.v}
          type="button"
          aria-pressed={value === r.v}
          onClick={() => onPick(r.v)}
          className={cn(
            "rounded-lg border px-2 py-1.5 text-left transition-colors",
            value === r.v ? "border-transparent bg-inverse text-inverse-fg" : "border-line text-fg-2 hover:border-line-strong",
          )}
        >
          <span className="block text-xs font-semibold">{r.label}</span>
          <span className={cn("block text-[10px] leading-tight", value === r.v ? "opacity-75" : "text-fg-4")}>{r.hint}</span>
        </button>
      ))}
    </div>
  );
}
