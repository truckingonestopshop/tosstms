"use client";

import { ArrowRight, ExternalLink, FileText, Layers } from "lucide-react";
import { Card, Empty, KV } from "@/components/ui/Bits";
import { useStore } from "@/lib/store";
import { openDocument, errMsg } from "@/lib/db";
import { toast } from "@/lib/toast";
import { fmtDay } from "@/lib/format";
import { docsOf } from "@/lib/docs";
import { activeServices, sourceLabel } from "@/lib/services";
import type { Company, ServiceInfo, ServiceKey } from "@/lib/types";

/** Service documents shown on its card. */
const SERVICE_DOCS: Partial<Record<ServiceKey, string[]>> = {
  dispatch: ["dispatch_agreement"],
  dot_compliance: ["dot_compliance_agreement"],
  accounting: ["noa", "factoring_agreement"],
  factoring: ["noa", "factoring_agreement"],
};

const pct = (v?: number | null) => (v != null ? `${v}%` : null);

/** The services the carrier is active in, each with what the team recorded for it. */
export function ServicesOverview({ company, onMore }: { company: Company; onMore: (tab: "dot" | "mcpt") => void }) {
  const { documents, docTypeName } = useStore();
  const list = activeServices(company);
  const files = docsOf(documents, { scope: "company", companyId: company.id });

  if (!list.length)
    return (
      <Card>
        <Empty icon={Layers} title="No services selected" body="Check the services this carrier is active in under Profile → Details." />
      </Card>
    );

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {list.map(({ key, label }) => {
        const s: ServiceInfo = company.services?.[key] ?? {};
        const rows: [string, React.ReactNode][] = (
          {
            dispatch: [
              ["Dispatch fee", pct(company.commission_percent)],
              ["Billing", company.billing_cadence === "monthly" ? "Monthly" : "Weekly"],
              ["Assigned dispatcher", s.dispatcher],
              ["Sold by", s.sold_by],
              ["Factoring company", company.factoring_company],
            ],
            dot_compliance: [
              ["Safety account manager", s.sam],
              ["Sold by", s.sold_by],
            ],
            mcpt: [
              ["MCPT agent", s.agent],
              ["Fuel taxes", s.fuel_taxes ? "Yes" : "No"],
            ],
            accounting: [
              ["Factoring service", s.provider],
              ["Percentage", pct(s.percent)],
            ],
            factoring: [
              ["Percentage", pct(s.percent)],
              ["Activation date", s.activation_date ? fmtDay(s.activation_date, true) : null],
              ["Factoring agent", s.agent],
              ["Sold by", s.sold_by],
            ],
            fuel_card: [
              ["Cards", s.cards != null ? String(s.cards) : null],
              ["Activation date", s.activation_date ? fmtDay(s.activation_date, true) : null],
              ["Fuel card agent", s.agent],
              ["Sold by", s.sold_by],
            ],
            insurance: [
              ["Insurance agent", s.agent],
              ["Insurance provider", s.provider],
            ],
          } satisfies Record<ServiceKey, [string, React.ReactNode][]>
        )[key];
        const source = s.source === "referral" && s.referred_by ? `${sourceLabel(s.source)} · ${s.referred_by}` : sourceLabel(s.source);
        const docs = (SERVICE_DOCS[key] ?? []).map((t) => ({ t, d: files.filter((x) => x.doc_type === t).sort((a, b) => b.uploaded_at.localeCompare(a.uploaded_at))[0] }));
        const more = key === "dot_compliance" ? "dot" : key === "mcpt" ? "mcpt" : null;
        return (
          <Card key={key} className="flex flex-col p-4 sm:p-5">
            <div className="flex items-center justify-between gap-2">
              <div className="text-[15px] font-semibold text-fg">{label}</div>
              {source && <span className="truncate text-xs text-fg-4">{source}</span>}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3">
              {rows.map(([k, v]) => (
                <KV key={k} label={k}>
                  {v}
                </KV>
              ))}
            </div>
            {docs.length > 0 && (
              <ul className="mt-4 space-y-1 border-t border-line pt-3">
                {docs.map(({ t, d }) => (
                  <li key={t} className="flex items-center gap-2 text-[13px]">
                    <FileText className="h-3.5 w-3.5 shrink-0 text-fg-4" />
                    <span className="w-36 shrink-0 truncate text-fg-3">{docTypeName(t)}</span>
                    {d ? (
                      <button
                        type="button"
                        className="truncate text-fg hover:underline"
                        onClick={() => openDocument(d.file_path, d.file_name).catch((e) => toast.error(`Couldn't open the file: ${errMsg(e)}`))}
                      >
                        {d.file_name}
                      </button>
                    ) : (
                      <span className="text-fg-4">Not on file</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {more && (
              <button type="button" onClick={() => onMore(more)} className="mt-4 inline-flex items-center gap-1 self-start text-xs font-medium text-fg-2 hover:text-fg">
                More info <ArrowRight className="h-3.5 w-3.5" />
              </button>
            )}
          </Card>
        );
      })}
    </div>
  );
}

/** The carrier's details at a glance (office view). */
export function CompanySummary({ company }: { company: Company }) {
  const second = [company.secondary_first_name, company.secondary_last_name].filter(Boolean).join(" ");
  return (
    <Card className="p-4 sm:p-5">
      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
        <KV label="DBA" className="col-span-2">
          {company.dba_name}
        </KV>
        <KV label="USDOT">{company.dot_number}</KV>
        <KV label="MC">{company.mc_number}</KV>
        <KV label="EIN">{company.ein}</KV>
        <KV label="Status">{company.status === "active" ? "Active" : "Inactive"}</KV>
        <KV label="Address" className="col-span-2">
          <span className="whitespace-pre-line">{company.address}</span>
        </KV>
        <KV label="Owner" className="col-span-2">
          {company.contact_name}
        </KV>
        <KV label="Phone">{company.contact_phone}</KV>
        <KV label="Email">{company.contact_email}</KV>
        {second && (
          <>
            <KV label="Secondary contact" className="col-span-2">
              {[second, company.secondary_title].filter(Boolean).join(" · ")}
            </KV>
            <KV label="Phone">{company.secondary_phone}</KV>
            <KV label="Email">{company.secondary_email}</KV>
          </>
        )}
      </div>
    </Card>
  );
}

const HUNTER = (process.env.NEXT_PUBLIC_LEADS_URL || "https://www.tossleadhunter.tech").replace(/\/+$/, "");

/** Outside pages for the carrier: SAFER snapshot, its TOSS Lead Hunter profile and FMCSA Motus. */
export function CompanyLinks({ company }: { company: Company }) {
  const dot = (company.dot_number || "").replace(/\D/g, "");
  const links = [
    {
      name: "SAFER profile",
      about: "FMCSA company snapshot: authority, insurance, inspections",
      href: dot ? `https://safer.fmcsa.dot.gov/query.asp?searchtype=ANY&query_type=queryCarrierSnapshot&query_param=USDOT&query_string=${dot}` : null,
    },
    { name: "Profile in Hunter", about: "This carrier in TOSS Lead Hunter", href: dot ? `${HUNTER}/c/${dot}` : null },
    { name: "MOTUS", about: "FMCSA registration system (sign in with Login.gov)", href: "https://motus.fmcsa.dot.gov" },
  ];
  return (
    <Card className="divide-y divide-line overflow-hidden">
      {links.map((l) =>
        l.href ? (
          <a key={l.name} href={l.href} target="_blank" rel="noopener noreferrer" className="group flex items-center gap-3 px-4 py-3.5 hover:bg-surface-2/50">
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-semibold text-fg group-hover:underline">{l.name}</span>
              <span className="block truncate text-xs text-fg-3">{l.about}</span>
            </span>
            <ExternalLink className="h-4 w-4 shrink-0 text-fg-4" />
          </a>
        ) : (
          <div key={l.name} className="flex items-center gap-3 px-4 py-3.5">
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-semibold text-fg-3">{l.name}</span>
              <span className="block truncate text-xs text-fg-4">Add the USDOT number to open it.</span>
            </span>
          </div>
        ),
      )}
    </Card>
  );
}
