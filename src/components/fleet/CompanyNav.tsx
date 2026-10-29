"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  Briefcase,
  FileText,
  KeyRound,
  LayoutGrid,
  Layers,
  Route,
  Settings2,
  ShieldCheck,
  Stamp,
  Target,
  Truck as TruckIcon,
  Wallet,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card, CopyButton, Empty, Page, PageHeader, Tabs } from "@/components/ui/Bits";
import { useStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/format";
import { hasService } from "@/lib/services";
import type { Company } from "@/lib/types";

// The carrier's header and tab bar, shared by Fleet & Company and the Dispatch pages (Dashboard,
// Loads, Invoices, Analytics), so Dispatch sits among the carrier's sections like DOT Compliance
// and MCPT. TOSS Cloud serves every service; dispatch is one of them.

export type CompanyTab = "units" | "trucks" | "trailers" | "drivers" | "equipment_list" | "docs" | "vault" | "profile" | "services" | "sales" | "cases" | "dot" | "mcpt" | "dispatch" | "billing";

/** Where a carrier tab lives: Dispatch and Billing have their own pages, the rest are on Fleet & Company. */
/** A company tab's address; the company rides along in ?company= (Dispatch and Billing show only it). */
export const companyTabHref = (t: CompanyTab, companyId: string) =>
  t === "dispatch" ? `/dispatch?company=${companyId}` : t === "billing" ? `/billing?company=${companyId}` : `/fleet?company=${companyId}&tab=${t}`;

/** Carrier name with its MC / DOT (and the dispatch fee when it has Dispatch). */
export function CompanyHeader({ company }: { company: Company }) {
  return (
    <PageHeader
      eyebrow="Fleet & Company"
      title={company.name}
      actions={
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-fg-3">
          {company.mc_number && (
            <span className="inline-flex items-center gap-0.5 rounded-lg border border-line px-2 py-1">
              MC {company.mc_number}
              <CopyButton text={company.mc_number} />
            </span>
          )}
          {company.dot_number && (
            <span className="inline-flex items-center gap-0.5 rounded-lg border border-line px-2 py-1">
              DOT {company.dot_number}
              <CopyButton text={company.dot_number} />
            </span>
          )}
          {hasService(company, "dispatch") && (
            <span className="rounded-lg border border-line px-2 py-1.5">
              {company.commission_percent}% · {company.billing_cadence}
            </span>
          )}
        </div>
      }
    />
  );
}

/**
 * The carrier's sections. Units, Trucks, Trailers and Drivers sit together under one tab,
 * Equipment & Drivers (its own sub-tabs). Dispatch, DOT Compliance and MCPT show when the carrier
 * has that service.
 */
export function CompanyTabs({ company, value, onChange }: { company: Company; value: CompanyTab; onChange: (t: CompanyTab) => void }) {
  const { trucks, trailers, drivers, documents, view } = useStore();
  const office = view === "office";
  const t = trucks.filter((x) => x.company_id === company.id);
  const tl = trailers.filter((x) => x.company_id === company.id);
  const d = drivers.filter((x) => x.company_id === company.id);
  const docs = documents.filter((x) => x.company_id === company.id);

  type Shown = Exclude<CompanyTab, "units" | "trucks" | "trailers" | "drivers" | "equipment_list"> | "equipment";
  const all: Record<Shown, { value: Shown; label: React.ReactNode; count?: number }> = {
    equipment: { value: "equipment", label: <><TruckIcon className="h-4 w-4" /> Equipment & Drivers</>, count: t.length + tl.length + d.length },
    docs: { value: "docs", label: <><FileText className="h-4 w-4" /> Documents</>, count: docs.length },
    vault: { value: "vault", label: <><KeyRound className="h-4 w-4" /> Credentials</> },
    profile: { value: "profile", label: <><Settings2 className="h-4 w-4" /> Profile</> },
    services: { value: "services", label: <><Layers className="h-4 w-4" /> Services</> },
    sales: { value: "sales", label: <><Target className="h-4 w-4" /> Sales</> },
    cases: { value: "cases", label: <><Briefcase className="h-4 w-4" /> Cases</> },
    dispatch: { value: "dispatch", label: <><Route className="h-4 w-4" /> Dispatch</> },
    billing: { value: "billing", label: <><Wallet className="h-4 w-4" /> Billing</> },
    dot: { value: "dot", label: <><ShieldCheck className="h-4 w-4" /> DOT Compliance</> },
    mcpt: { value: "mcpt", label: <><Stamp className="h-4 w-4" /> MCPT</> },
  };
  const order: Shown[] = office
    ? ["profile", "services", "sales", "cases", "billing", "dispatch", "dot", "mcpt", "equipment", "docs", "vault"]
    : ["dispatch", "equipment", "docs", "vault", "services", "sales", "cases", "dot", "mcpt", "billing", "profile"];
  const tabs = order
    .filter((k) =>
      k === "dispatch"
        ? hasService(company, "dispatch")
        : k === "dot"
          ? hasService(company, "dot_compliance")
          : k === "mcpt"
            ? hasService(company, "mcpt")
            : true,
    )
    .map((k) => all[k]);
  const equipment = value === "units" || value === "trucks" || value === "trailers" || value === "drivers" || value === "equipment_list";
  return (
    <Tabs<Shown>
      value={equipment ? "equipment" : (value as Shown)}
      onChange={(v) => onChange(v === "equipment" ? (office ? "drivers" : "units") : v)}
      className="mb-5"
      tabs={tabs}
    />
  );
}

const DISPATCH = [
  { href: "/dispatch", label: "Dashboard", icon: LayoutGrid, match: (p: string) => p === "/dispatch" },
  { href: "/loads", label: "Loads", icon: TruckIcon, match: (p: string) => p.startsWith("/loads") },
  { href: "/invoices", label: "Invoices", icon: FileText, match: (p: string) => p.startsWith("/invoices") },
  { href: "/analytics", label: "Analytics", icon: BarChart3, match: (p: string) => p.startsWith("/analytics") },
];

/** Dashboard · Loads · Invoices · Analytics, under Dispatch. */
function DispatchSubTabs() {
  const path = usePathname();
  const { scope } = useStore();
  const q = scope === "all" ? "" : `?company=${scope}`;
  return (
    <div className="mb-5 flex flex-wrap gap-1 rounded-xl border border-line bg-surface p-1">
      {DISPATCH.map((s) => {
        const on = s.match(path);
        return (
          <Link
            key={s.href}
            href={s.href + q}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors",
              on ? "bg-surface-2 text-fg" : "text-fg-3 hover:bg-surface-2/60 hover:text-fg",
            )}
          >
            <s.icon className="h-3.5 w-3.5" />
            {s.label}
          </Link>
        );
      })}
    </div>
  );
}

/** Top of the Billing page: the carrier's header and tabs (Billing selected); nothing for all companies (the menu has it). */
export function BillingFrame() {
  const { scope, companies } = useStore();
  const router = useRouter();
  const company = scope !== "all" ? companies.find((c) => c.id === scope) : undefined;
  if (!company) return null;
  return (
    <div className="no-print">
      <CompanyHeader company={company} />
      <CompanyTabs company={company} value="billing" onChange={(t) => t !== "billing" && router.push(companyTabHref(t, company.id))} />
    </div>
  );
}

/**
 * Top of the Dispatch pages: the carrier's header and tabs (Dispatch selected) when one carrier is
 * chosen; then Dashboard · Loads · Invoices · Analytics.
 */
export function DispatchFrame() {
  const { scope, companies } = useStore();
  const router = useRouter();
  const company = scope !== "all" ? companies.find((c) => c.id === scope) : undefined;
  return (
    <div className="no-print">
      {company ? (
        <>
          <CompanyHeader company={company} />
          <CompanyTabs company={company} value="dispatch" onChange={(t) => t !== "dispatch" && router.push(companyTabHref(t, company.id))} />
        </>
      ) : null}
      <DispatchSubTabs />
    </div>
  );
}

/**
 * Wraps a Dispatch page. When the chosen carrier doesn't have the Dispatch service, it shows the
 * carrier's tabs and a note with a button to turn Dispatch on, instead of an empty dashboard.
 */
export function DispatchGate({ children }: { children: React.ReactNode }) {
  const { scopedCompany, updateCompany } = useStore();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  if (!scopedCompany || hasService(scopedCompany, "dispatch")) return <>{children}</>;
  const company = scopedCompany;
  const turnOn = async () => {
    setBusy(true);
    const ok = await updateCompany(company.id, { services: { ...company.services, dispatch: { ...company.services?.dispatch, on: true } } });
    setBusy(false);
    if (ok) toast.success("Dispatch turned on");
  };
  return (
    <Page>
      <div className="no-print">
        <CompanyHeader company={company} />
        <CompanyTabs company={company} value="dispatch" onChange={(t) => router.push(companyTabHref(t, company.id))} />
      </div>
      <Card>
        <Empty
          icon={Route}
          title={`${company.name} doesn't have Dispatch`}
          body="Dispatch (dashboard, loads, invoices and analytics) shows for carriers that have the Dispatch service. Turn it on to start booking loads for this carrier."
          action={
            <Button variant="primary" onClick={turnOn} disabled={busy}>
              <Route className="h-4 w-4" /> Turn on Dispatch
            </Button>
          }
        />
      </Card>
    </Page>
  );
}
