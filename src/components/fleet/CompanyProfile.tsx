"use client";

import { ArrowRight, ExternalLink, FileText, Layers, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { StagePill } from "./CompaniesCrm";
import { Card, Empty, KV } from "@/components/ui/Bits";
import { useStore } from "@/lib/store";
import { CompanyTimeline } from "./CompanyTimeline";
import { openDocument, errMsg } from "@/lib/db";
import { toast } from "@/lib/toast";
import { cn, fmtDay } from "@/lib/format";
import { docsOf } from "@/lib/docs";
import { activeServices, authorityLabel, sourceLabel } from "@/lib/services";
import type { AuthorityStatus, Company, ServiceInfo, ServiceKey } from "@/lib/types";

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

/** Active / Inactive / Out of service, colored only when it needs attention. */
function AuthorityPill({ v }: { v?: AuthorityStatus | null }) {
  if (!v) return <span className="text-fg-4">Not recorded</span>;
  const cls = v === "oos" ? "text-red-700 dark:text-red-300" : v === "inactive" ? "text-amber-700 dark:text-amber-300" : "text-emerald-700 dark:text-emerald-300";
  return <span className={cn("font-medium", cls)}>{authorityLabel(v)}</span>;
}

function Section({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <Card className={cn("p-4 sm:p-5", className)}>
      <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-fg-4">{title}</div>
      {children}
    </Card>
  );
}

/** Turns a lead into a client (stamps when, for the CRM). */
function MarkClient({ company }: { company: Company }) {
  const { updateCompany } = useStore();
  return (
    <Button
      size="xs"
      variant="outline"
      onClick={async () => {
        if (await updateCompany(company.id, { stage: "client" })) toast.success(`${company.name} is now a client`);
      }}
    >
      <UserCheck className="h-3.5 w-3.5" /> Mark as client
    </Button>
  );
}

/** Everything about the carrier on one page, read-only (Edit opens the form). */
export function CompanyOverview({ company, onServices }: { company: Company; onServices: () => void }) {
  const second = [company.secondary_first_name, company.secondary_last_name].filter(Boolean).join(" ");
  const services = activeServices(company);
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <Section title="Company" className="lg:col-span-2">
        <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
          <KV label="Legal name" className="col-span-2 sm:col-span-3">
            {company.name}
          </KV>
          <KV label="DBA">{company.dba_name}</KV>
          <KV label="EIN">{company.ein}</KV>
          <KV label="Stage">
            <span className="inline-flex flex-wrap items-center gap-2">
              <StagePill c={company} />
              <span className="text-xs text-fg-3">
                {company.stage === "lead" ? `since ${fmtDay(company.created_at.slice(0, 10))}` : company.became_client_at ? `since ${fmtDay(company.became_client_at.slice(0, 10))}` : ""}
              </span>
              {company.stage === "lead" && <MarkClient company={company} />}
            </span>
          </KV>
          <KV label="USDOT">{company.dot_number}</KV>
          <KV label="DOT status">
            <AuthorityPill v={company.dot_status} />
          </KV>
          <div className="hidden sm:block" />
          <KV label="MC">{company.mc_number}</KV>
          <KV label="MC status">
            <AuthorityPill v={company.mc_status} />
          </KV>
        </div>
      </Section>

      <Section title="Address">
        <div className="whitespace-pre-line text-sm text-fg">{company.address || <span className="text-fg-4">—</span>}</div>
        {company.county && <div className="mt-1 text-xs text-fg-3">{company.county} County</div>}
      </Section>

      <Section title="Owner / main contact" className="lg:col-span-2">
        <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
          <KV label="First name">{company.contact_first_name}</KV>
          <KV label="Last name">{company.contact_last_name}</KV>
          <KV label="Phone">{company.contact_phone}</KV>
          <KV label="Email">{company.contact_email}</KV>
        </div>
        {second && (
          <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-line pt-4 sm:grid-cols-4">
            <KV label="Secondary contact">{second}</KV>
            <KV label="Role">{company.secondary_title}</KV>
            <KV label="Phone">{company.secondary_phone}</KV>
            <KV label="Email">{company.secondary_email}</KV>
          </div>
        )}
      </Section>

      <Section title="Services">
        {services.length ? (
          <div className="flex flex-wrap gap-1.5">
            {services.map((s) => (
              <span key={s.key} className="rounded-full border border-line px-2.5 py-1 text-xs font-medium text-fg-2">
                {s.label}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-sm text-fg-4">No services selected.</p>
        )}
        <button type="button" onClick={onServices} className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-fg-2 hover:text-fg">
          Service details <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </Section>

      <div className="lg:col-span-2">
        <Section title="Notes">
          <p className="whitespace-pre-line text-sm text-fg-2">{company.notes || <span className="text-fg-4">No notes.</span>}</p>
        </Section>
      </div>
      <div>
        <div className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-fg-4">Links</div>
        <CompanyLinks company={company} />
      </div>
      <div className="lg:col-span-3">
        <CompanyTimeline companyId={company.id} />
      </div>
    </div>
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
