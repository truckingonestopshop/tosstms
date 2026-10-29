"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { AlertTriangle, LayoutGrid, List, Plus, Search, UserCheck, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, Empty, PageHeader, Pill, neutralPill } from "@/components/ui/Bits";
import { Input, Segmented, Select } from "@/components/ui/Field";
import { AllCarriersTabs } from "@/components/fleet/CompanyNav";
import { driverAlert } from "@/components/fleet/Drivers";
import { useStore } from "@/lib/store";
import { useLiveTable } from "@/lib/live";
import type { Opportunity } from "@/lib/sales";
import { toast } from "@/lib/toast";
import { ACTIVE_STATUSES, daysUntil, fmtDay, money, today } from "@/lib/format";
import { SERVICES, activeServices, hasService } from "@/lib/services";
import type { Company, ServiceKey } from "@/lib/types";

// Companies (Fleet & Company with "All companies"): the CRM list of leads and clients, with
// filters (stage, how old, service) and a search over EIN, DOT, MC, name, representatives, email
// and phone. Clicking a company opens it, exactly as before.

type Stage = "all" | "client" | "lead" | "inactive";
type Age = "any" | "7" | "30" | "30-90" | "90+";
type Sort = "name" | "newest" | "oldest";

const digits = (s: string | null | undefined) => (s || "").replace(/\D/g, "");

/** Days since a date (created / became client). */
const ageDays = (iso: string | null | undefined) => (iso ? Math.max(0, -(daysUntil(iso.slice(0, 10)) ?? 0)) : 0);
const ageLabel = (n: number) => (n === 0 ? "today" : n < 30 ? `${n}d` : n < 365 ? `${Math.floor(n / 30)} mo` : `${(n / 365).toFixed(1)} yr`);

export const rep = (c: Company) => [c.contact_first_name, c.contact_last_name].filter(Boolean).join(" ") || c.contact_name || "";

/** Everything the CRM search looks in. Phone numbers match on digits only. */
function haystack(c: Company) {
  return [
    c.name,
    c.dba_name,
    c.ein,
    c.dot_number && `dot ${c.dot_number}`,
    c.mc_number && `mc ${c.mc_number}`,
    rep(c),
    c.secondary_first_name,
    c.secondary_last_name,
    c.contact_email,
    c.secondary_email,
    c.factoring_email,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}
const phones = (c: Company) => [c.contact_phone, c.secondary_phone].map(digits).join(" ");

export function CompaniesCrm({ onAdd }: { onAdd: () => void }) {
  const { companies, trucks, drivers, loads, documents, updateCompany } = useStore();
  const router = useRouter();
  const open = (id: string) => router.push(`/fleet?company=${id}`);
  const [stage, setStage] = useState<Stage>("all");
  const [age, setAge] = useState<Age>("any");
  const [service, setService] = useState<ServiceKey | "none" | "any">("any");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>("name");
  const [layout, setLayout] = useState<"cards" | "table">("cards");
  // Open opportunities per company (Sales), shown on leads and in the table.
  const opps = useLiveTable<Opportunity>("tms_opportunities", { filter: { status: "open" } }).rows;
  const pipe = new Map<string, { n: number; value: number }>();
  for (const o of opps) {
    const r = pipe.get(o.company_id) || { n: 0, value: 0 };
    r.n++;
    r.value += Number(o.value) || 0;
    pipe.set(o.company_id, r);
  }

  const counts = {
    all: companies.length,
    client: companies.filter((c) => c.stage !== "lead" && c.status !== "inactive").length,
    lead: companies.filter((c) => c.stage === "lead").length,
    inactive: companies.filter((c) => c.stage !== "lead" && c.status === "inactive").length,
  };

  const list = useMemo(() => {
    const text = q.trim().toLowerCase();
    const num = digits(q);
    return companies
      .filter((c) => {
        if (stage === "lead" && c.stage !== "lead") return false;
        if (stage === "client" && (c.stage === "lead" || c.status === "inactive")) return false;
        if (stage === "inactive" && (c.stage === "lead" || c.status !== "inactive")) return false;
        // Leads: how long ago they came in; clients: how long they've been a client.
        const n = ageDays(c.stage === "lead" ? c.created_at : c.became_client_at || c.created_at);
        if (age === "7" && n > 7) return false;
        if (age === "30" && n > 30) return false;
        if (age === "30-90" && (n < 30 || n > 90)) return false;
        if (age === "90+" && n < 90) return false;
        if (service === "none" && activeServices(c).length) return false;
        if (service !== "any" && service !== "none" && !hasService(c, service)) return false;
        if (text && !haystack(c).includes(text) && !(num.length >= 3 && (phones(c).includes(num) || digits(c.ein).includes(num) || digits(c.dot_number).includes(num) || digits(c.mc_number).includes(num)))) return false;
        return true;
      })
      .sort((a, b) => (sort === "newest" ? b.created_at.localeCompare(a.created_at) : sort === "oldest" ? a.created_at.localeCompare(b.created_at) : a.name.localeCompare(b.name)));
  }, [companies, stage, age, service, q, sort]);

  const filtered = stage !== "all" || age !== "any" || service !== "any" || !!q;
  const makeClient = async (c: Company) => {
    if (await updateCompany(c.id, { stage: "client" })) toast.success(`${c.name} is now a client`);
  };

  return (
    <>
      <AllCarriersTabs value="carriers" />
      <PageHeader
        eyebrow="All companies"
        title="Companies"
        actions={
          <Button variant="primary" onClick={onAdd}>
            <Plus className="h-4 w-4" /> Add company
          </Button>
        }
      />

      <div className="mb-3 flex flex-col gap-2 lg:flex-row lg:items-center">
        <Segmented<Stage>
          value={stage}
          onChange={setStage}
          className="scrollbar-none overflow-x-auto"
          options={[
            { value: "all", label: `All ${counts.all}` },
            { value: "client", label: `Clients ${counts.client}` },
            { value: "lead", label: `Leads ${counts.lead}` },
            { value: "inactive", label: `Inactive ${counts.inactive}` },
          ]}
        />
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-4" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="EIN, DOT, MC, company, representative, email, phone" className="pl-9" />
          {q && (
            <button onClick={() => setQ("")} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-fg-4 hover:text-fg" aria-label="Clear search">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Select value={age} onChange={(e) => setAge(e.target.value as Age)} className="w-auto" aria-label={stage === "lead" ? "Lead age" : "Age"}>
          <option value="any">{stage === "lead" ? "Any lead age" : "Any age"}</option>
          <option value="7">Last 7 days</option>
          <option value="30">Last 30 days</option>
          <option value="30-90">30–90 days</option>
          <option value="90+">Over 90 days</option>
        </Select>
        <Select value={service} onChange={(e) => setService(e.target.value as typeof service)} className="w-auto" aria-label="Service">
          <option value="any">Any service</option>
          {SERVICES.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
          <option value="none">No service yet</option>
        </Select>
        <Select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="w-auto" aria-label="Sort">
          <option value="name">Name A–Z</option>
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
        </Select>
        {filtered && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setStage("all");
              setAge("any");
              setService("any");
              setQ("");
            }}
          >
            Clear filters
          </Button>
        )}
        <span className="ml-auto text-xs text-fg-3">
          {list.length} of {companies.length}
        </span>
        <Segmented
          size="sm"
          value={layout}
          onChange={setLayout}
          options={[
            { value: "cards", label: <LayoutGrid className="h-3.5 w-3.5" aria-label="Cards" /> },
            { value: "table", label: <List className="h-3.5 w-3.5" aria-label="Table" /> },
          ]}
        />
      </div>

      {list.length === 0 ? (
        <Card>
          <Empty icon={Search} title="No companies match" body="Try another filter or clear the search." />
        </Card>
      ) : layout === "table" ? (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-[13px]">
            <thead>
              <tr className="border-b border-line text-left text-[11px] uppercase tracking-wider text-fg-4">
                <th className="px-4 py-2 font-semibold">Company</th>
                <th className="px-3 py-2 font-semibold">Stage</th>
                <th className="px-3 py-2 font-semibold">Age</th>
                <th className="px-3 py-2 font-semibold">Services</th>
                <th className="px-3 py-2 text-right font-semibold">Open sales</th>
                <th className="px-3 py-2 font-semibold">Representative</th>
                <th className="px-3 py-2 font-semibold">Phone</th>
                <th className="px-3 py-2 font-semibold">Email</th>
                <th className="w-28" />
              </tr>
            </thead>
            <tbody>
              {list.map((c) => {
                const lead = c.stage === "lead";
                const n = ageDays(lead ? c.created_at : c.became_client_at || c.created_at);
                return (
                  <tr key={c.id} onClick={() => open(c.id)} className="cursor-pointer border-b border-line last:border-b-0 hover:bg-surface-2/50">
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-fg">{c.name}</div>
                      <div className="text-[11px] text-fg-4">{[c.dot_number && `DOT ${c.dot_number}`, c.mc_number && `MC ${c.mc_number}`, c.ein && `EIN ${c.ein}`].filter(Boolean).join(" · ")}</div>
                    </td>
                    <td className="px-3 py-2.5">
                      <StagePill c={c} />
                    </td>
                    <td className="px-3 py-2.5 text-fg-2" title={lead ? `Lead since ${fmtDay(c.created_at.slice(0, 10))}` : `Client since ${fmtDay((c.became_client_at || c.created_at).slice(0, 10))}`}>
                      {ageLabel(n)}
                    </td>
                    <td className="px-3 py-2.5 text-fg-2">{activeServices(c).map((s) => s.label).join(", ") || <span className="text-fg-4">—</span>}</td>
                    <td className="tnum px-3 py-2.5 text-right text-fg-2">{pipe.get(c.id) ? `${money(pipe.get(c.id)!.value, { cents: false })} (${pipe.get(c.id)!.n})` : <span className="text-fg-4">—</span>}</td>
                    <td className="px-3 py-2.5 text-fg-2">{rep(c) || <span className="text-fg-4">—</span>}</td>
                    <td className="px-3 py-2.5 text-fg-2">{c.contact_phone || <span className="text-fg-4">—</span>}</td>
                    <td className="max-w-[200px] truncate px-3 py-2.5 text-fg-2">{c.contact_email || <span className="text-fg-4">—</span>}</td>
                    <td className="px-3 py-2.5 text-right">
                      {lead && (
                        <Button
                          size="xs"
                          variant="outline"
                          onClick={(e) => {
                            e.stopPropagation();
                            makeClient(c);
                          }}
                        >
                          <UserCheck className="h-3.5 w-3.5" /> Mark client
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {list.map((c) => {
            const t = trucks.filter((x) => x.company_id === c.id);
            const d = drivers.filter((x) => x.company_id === c.id);
            const l = loads.filter((x) => x.company_id === c.id);
            const active = l.filter((x) => ACTIVE_STATUSES.includes(x.status)).length;
            const month = today().slice(0, 7);
            const gross = l.filter((x) => (x.delivery_date || x.pickup_date || "").startsWith(month)).reduce((s, x) => s + x.gross_amount, 0);
            const alerts = d.filter(driverAlert).length + documents.filter((x) => x.company_id === c.id && (daysUntil(x.expires_on) ?? 99) <= 30).length;
            const lead = c.stage === "lead";
            return (
              <div
                key={c.id}
                role="button"
                tabIndex={0}
                onClick={() => open(c.id)}
                onKeyDown={(e) => e.key === "Enter" && open(c.id)}
                className="group flex cursor-pointer flex-col rounded-xl border border-line bg-surface p-4 text-left transition-colors hover:border-line-strong sm:p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-[15px] font-semibold text-fg">{c.name}</div>
                    <div className="mt-0.5 truncate text-xs text-fg-3">{[c.mc_number && `MC ${c.mc_number}`, c.dot_number && `DOT ${c.dot_number}`].filter(Boolean).join(" · ") || "No MC / DOT"}</div>
                  </div>
                  {lead ? <StagePill c={c} /> : <Pill className={c.status === "active" ? "bg-brand/10 text-fg ring-brand/30" : neutralPill}>{c.commission_percent}%</Pill>}
                </div>
                {lead ? (
                  <div className="mt-4 space-y-1 border-t border-line pt-3 text-xs text-fg-2">
                    <div>
                      Lead for <b className="text-fg">{ageLabel(ageDays(c.created_at))}</b> · since {fmtDay(c.created_at.slice(0, 10))}
                    </div>
                    {rep(c) && <div className="truncate text-fg-3">{[rep(c), c.contact_phone, c.contact_email].filter(Boolean).join(" · ")}</div>}
                    {pipe.get(c.id) && (
                      <div className="text-fg-3">
                        {pipe.get(c.id)!.n} open opportunit{pipe.get(c.id)!.n === 1 ? "y" : "ies"} · <b className="text-fg">{money(pipe.get(c.id)!.value, { cents: false })}</b>
                      </div>
                    )}
                    <div className="pt-1.5">
                      <Button
                        size="xs"
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation();
                          makeClient(c);
                        }}
                      >
                        <UserCheck className="h-3.5 w-3.5" /> Mark as client
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 grid grid-cols-4 gap-2 border-t border-line pt-3">
                    {[
                      ["Trucks", t.length],
                      ["Drivers", d.length],
                      ["Active", active],
                      ["This month", money(gross, { cents: false })],
                    ].map(([k, v]) => (
                      <div key={k as string} className="min-w-0">
                        <div className="tnum truncate text-sm font-semibold text-fg">{v}</div>
                        <div className="truncate text-[11px] text-fg-4">{k}</div>
                      </div>
                    ))}
                  </div>
                )}
                {alerts > 0 && (
                  <div className="mt-3 flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-300">
                    <AlertTriangle className="h-3.5 w-3.5" /> {alerts} expiring item{alerts > 1 ? "s" : ""}
                  </div>
                )}
                {!lead && c.status === "inactive" && <div className="mt-3 text-xs text-fg-4">Inactive</div>}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

export function StagePill({ c }: { c: Company }) {
  if (c.stage === "lead") return <Pill className="bg-sky-500/10 text-sky-700 ring-sky-600/25 dark:text-sky-300">Lead</Pill>;
  if (c.status === "inactive") return <Pill className={neutralPill}>Inactive client</Pill>;
  return <Pill className="bg-emerald-500/10 text-emerald-700 ring-emerald-600/25 dark:text-emerald-300">Client</Pill>;
}

