"use client";

import Link from "next/link";
import { useState } from "react";
import { Paperclip, Plus, Target } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, Empty, Pill } from "@/components/ui/Bits";
import { cn, fmtDay, money } from "@/lib/format";
import { AGREEMENT_STATUSES, oppNumber, statusMeta } from "@/lib/sales";
import type { Company } from "@/lib/types";
import { SalesProvider, useSales } from "./SalesProvider";
import { NewOpportunity, svcLabel } from "./Opportunities";
import { OpportunityDetail } from "./OpportunityDetail";

/** The carrier's Sales tab: its opportunities (open first) and agreements, same data as Sales. */
export function CompanySales({ company }: { company: Company }) {
  return (
    <SalesProvider>
      <Inner company={company} />
    </SalesProvider>
  );
}

function Inner({ company }: { company: Company }) {
  const { opps, stages, agreements, pipelines } = useSales();
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const list = opps.rows
    .filter((o) => o.company_id === company.id)
    .sort((a, b) => Number(b.status === "open") - Number(a.status === "open") || b.updated_at.localeCompare(a.updated_at));
  const agr = agreements.rows.filter((a) => a.company_id === company.id);
  const openValue = list.filter((o) => o.status === "open").reduce((s, o) => s + Number(o.value), 0);
  const wonValue = list.filter((o) => o.status === "won").reduce((s, o) => s + Number(o.value), 0);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <Card>
        <CardHeader
          title="Opportunities"
          subtitle={`${money(openValue, { cents: false })} open · ${money(wonValue, { cents: false })} won`}
          actions={
            <>
              <Link href="/sales?tab=opportunities" className="text-xs font-medium text-fg-3 hover:text-fg">
                Sales →
              </Link>
              <Button size="sm" variant="primary" onClick={() => setAdding(true)} disabled={!pipelines.rows.length}>
                <Plus className="h-4 w-4" /> New opportunity
              </Button>
            </>
          }
        />
        {list.length === 0 ? (
          <Empty icon={Target} title="No opportunities yet" body="Add what you're selling them: a service, its value and where it is in the pipeline." />
        ) : (
          <ul className="divide-y divide-line">
            {list.map((o) => {
              const s = stages.rows.find((x) => x.id === o.stage_id);
              const st = statusMeta(o.status);
              return (
                <li key={o.id}>
                  <button type="button" onClick={() => setOpen(o.id)} className={cn("flex w-full flex-wrap items-center gap-2 px-4 py-2.5 text-left hover:bg-surface-2/50 sm:px-5", o.status !== "open" && "opacity-75")}>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-medium text-fg">
                        <span className="tnum mr-1.5 text-xs font-semibold text-fg-4">{oppNumber(o)}</span>
                        {o.title}
                      </div>
                      <div className="flex items-center gap-1.5 text-[11px] text-fg-4">
                        <span className="h-2 w-2 rounded-full" style={{ background: s?.color || "#a1a1aa" }} />
                        {s?.name || "—"} · {svcLabel(o.service)}
                        {o.expected_close ? ` · close ${fmtDay(o.expected_close)}` : ""}
                      </div>
                    </div>
                    <Pill className={st.pill}>{st.label}</Pill>
                    <span className="tnum w-20 text-right text-[13px] font-semibold text-fg">{money(Number(o.value), { cents: false })}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      <Card className="self-start">
        <CardHeader title="Agreements" actions={<Link href="/sales?tab=templates" className="text-xs font-medium text-fg-3 hover:text-fg">All →</Link>} />
        {agr.length === 0 ? (
          <div className="px-4 py-6 text-center text-xs text-fg-4">None yet. Make one from an opportunity.</div>
        ) : (
          <ul className="divide-y divide-line">
            {agr.map((a) => {
              const st = AGREEMENT_STATUSES.find((x) => x.v === a.status)!;
              return (
                <li key={a.id}>
                  <button type="button" onClick={() => a.opportunity_id && setOpen(a.opportunity_id)} className="flex w-full items-center gap-2 px-4 py-2 text-left hover:bg-surface-2/50">
                    <span className="min-w-0 flex-1 truncate text-[13px] text-fg">{a.title}</span>
                    {a.signed_file && <Paperclip className="h-3.5 w-3.5 text-fg-4" />}
                    <Pill className={st.pill}>{st.label}</Pill>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      <NewOpportunity
        open={adding}
        companyId={company.id}
        onClose={() => setAdding(false)}
        onCreated={(o) => {
          setAdding(false);
          setOpen(o.id);
        }}
      />
      <OpportunityDetail id={open} onClose={() => setOpen(null)} />
    </div>
  );
}
