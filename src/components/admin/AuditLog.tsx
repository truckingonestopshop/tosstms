"use client";

import { Ban, KeyRound, Mail, Pencil, RotateCcw, Trash2, UserPlus } from "lucide-react";
import { Card, Empty } from "@/components/ui/Bits";
import { stagger } from "@/components/ui/Motion";
import { fmtDateTime, relTime } from "@/lib/format";
import { roleLabel, type AuditRow } from "./shared";

const ICON: Record<string, typeof Mail> = {
  invite: UserPlus,
  update: Pencil,
  disable: Ban,
  enable: RotateCcw,
  delete: Trash2,
  resend_invite: Mail,
  password_reset: KeyRound,
};

const FIELD: Record<string, string> = { full_name: "name", position: "position", phone: "phone", tms: "TOSS Cloud", leads: "TOSS Lead Hunter", super_admin: "super admin" };

const val = (k: string, v: unknown) =>
  v === null || v === undefined || v === "" ? "none" : k === "tms" || k === "leads" ? roleLabel(k, String(v)) : k === "super_admin" ? (v ? "yes" : "no") : String(v);

/** Plain-English line for an audit entry. */
export function auditText(a: AuditRow) {
  const who = a.target_email || "someone";
  const d = a.details || {};
  switch (a.action) {
    case "invite": {
      const apps = [d.tms && `Cloud ${roleLabel("tms", String(d.tms))}`, d.leads && `Lead Hunter ${roleLabel("leads", String(d.leads))}`].filter(Boolean).join(", ");
      return `Invited ${who}${apps ? ` (${apps})` : ""}${d.super_admin ? " as super admin" : ""}`;
    }
    case "update": {
      const parts = Object.entries(d).map(([k, v]) => {
        const c = v as { from?: unknown; to?: unknown };
        return `${FIELD[k] || k}: ${val(k, c?.from)} → ${val(k, c?.to)}`;
      });
      return `Changed ${who}: ${parts.join(" · ") || "details"}`;
    }
    case "disable":
      return `Disabled ${who}`;
    case "enable":
      return `Enabled ${who}`;
    case "delete":
      return `Deleted ${who}`;
    case "resend_invite":
      return `Resent the invite to ${who}`;
    case "password_reset":
      return `Sent a password reset to ${who}`;
    default:
      return `${a.action} ${who}`;
  }
}

export function AuditLog({ rows }: { rows: AuditRow[] }) {
  if (!rows.length) {
    return (
      <Card>
        <Empty icon={Pencil} title="Nothing yet" body="Invites, access changes and account actions show up here." />
      </Card>
    );
  }
  return (
    <Card className="overflow-hidden">
      <ol className="divide-y divide-line">
        {rows.map((a, i) => {
          const Icon = ICON[a.action] || Pencil;
          return (
            <li key={a.id} className="animate-rise flex items-start gap-3 px-4 py-3 sm:px-5" style={stagger(i, 20)}>
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-fg-3">
                <Icon className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[13px] text-fg">{auditText(a)}</div>
                <div className="text-xs text-fg-4" title={fmtDateTime(a.created_at)}>
                  by {a.actor_email || "system"} · {relTime(a.created_at)}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
