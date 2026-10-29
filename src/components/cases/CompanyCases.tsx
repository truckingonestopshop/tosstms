"use client";

import Link from "next/link";
import { Briefcase, Headset, Plus } from "lucide-react";
import { ButtonLink } from "@/components/ui/Button";
import { Card, CardHeader, Empty, Pill } from "@/components/ui/Bits";
import { useLiveTable } from "@/lib/live";
import { useStore } from "@/lib/store";
import { cn, fmtDay } from "@/lib/format";
import { priorityOf, statusOf, type Case, type CaseKind } from "@/lib/cases";
import { useCategoryLabel } from "./Cases";

/** The carrier's Cases tab: its work cases and customer service cases, open first. Each opens on
 *  the Cases / Customer Service screen. */
export function CompanyCases({ companyId }: { companyId: string }) {
  const cases = useLiveTable<Case>("tms_cases", { order: "updated_at", filter: { company_id: companyId } });
  const mine = cases.rows.filter((c) => c.company_id === companyId);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <List kind="work" companyId={companyId} rows={mine.filter((c) => c.kind === "work")} loaded={cases.loaded} />
      <List kind="customer_service" companyId={companyId} rows={mine.filter((c) => c.kind === "customer_service")} loaded={cases.loaded} />
    </div>
  );
}

function List({ kind, companyId, rows, loaded }: { kind: CaseKind; companyId: string; rows: Case[]; loaded: boolean }) {
  const { memberName } = useStore();
  const catLabel = useCategoryLabel(kind);
  const base = kind === "work" ? "/cases" : "/customer-service";
  const sorted = [...rows].sort((a, b) => Number(a.status === "closed") - Number(b.status === "closed") || b.updated_at.localeCompare(a.updated_at));
  const open = rows.filter((c) => c.status !== "closed").length;
  return (
    <Card className="self-start">
      <CardHeader
        title={kind === "work" ? "Cases" : "Customer Service"}
        subtitle={`${open} open · ${rows.length - open} closed`}
        actions={
          <ButtonLink href={`${base}?new=1&company=${companyId}`} size="sm" variant="outline">
            <Plus className="h-4 w-4" /> New
          </ButtonLink>
        }
      />
      {!loaded ? (
        <div className="px-4 py-6 text-center text-xs text-fg-4">Loading…</div>
      ) : sorted.length === 0 ? (
        <Empty icon={kind === "work" ? Briefcase : Headset} title={kind === "work" ? "No cases" : "No customer service cases"} />
      ) : (
        <ul className="divide-y divide-line">
          {sorted.map((c) => {
            const st = statusOf(c.status);
            const pr = priorityOf(c.priority);
            return (
              <li key={c.id}>
                <Link href={`${base}?case=${c.id}`} className={cn("flex items-center gap-2 px-4 py-2.5 hover:bg-surface-2/50 sm:px-5", c.status === "closed" && "opacity-70")}>
                  <span className="tnum w-12 shrink-0 text-xs font-semibold text-fg-4">#{c.number}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-medium text-fg">{c.title}</div>
                    <div className="truncate text-[11px] text-fg-4">
                      {[catLabel(c.category), c.owner_id ? memberName(c.owner_id) : "Unassigned", c.due_date ? `due ${fmtDay(c.due_date)}` : ""].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                  {c.priority !== "normal" && c.status !== "closed" && <Pill className={pr.pill}>{pr.label}</Pill>}
                  <Pill className={st.pill}>{st.label}</Pill>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
