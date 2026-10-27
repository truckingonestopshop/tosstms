"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  Building2,
  Container,
  FileText,
  KeyRound,
  LayoutGrid,
  Layers,
  Network,
  Route,
  Settings2,
  ShieldCheck,
  Stamp,
  Truck as TruckIcon,
  Users,
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

export type CompanyTab = "units" | "trucks" | "trailers" | "drivers" | "docs" | "vault" | "profile" | "services" | "dot" | "mcpt" | "dispatch" | "billing";

/** Where a carrier tab lives: Dispatch and Billing have their own pages, the rest are on Fleet & Company. */
export const companyTabHref = (t: CompanyTab) => (t === "dispatch" ? "/dispatch" : t === "billing" ? "/billing" : `/fleet?tab=${t}`);

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

/** The carrier's sections. Dispatch, DOT Compliance and MCPT show when the carrier has that service. */
export function CompanyTabs({ company, value, onChange }: { company: Company; value: CompanyTab; onChange: (t: CompanyTab) => void }) {
  const { trucks, trailers, drivers, documents, view } = useStore();
  const office = view === "office";
  const t = trucks.filter((x) => x.company_id === company.id);
  const tl = trailers.filter((x) => x.company_id === company.id);
  const d = drivers.filter((x) => x.company_id === company.id);
  const docs = documents.filter((x) => x.company_id === company.id);

  const all: Record<CompanyTab, { value: CompanyTab; label: React.ReactNode; count?: number }> = {
    units: { value: "units", label: <><Network className="h-4 w-4" /> Units</>, count: t.filter((x) => x.status !== "inactive").length },
    trucks: { value: "trucks", label: <><TruckIcon className="h-4 w-4" /> Trucks</>, count: t.length },
    trailers: { value: "trailers", label: <><Container className="h-4 w-4" /> Trailers</>, count: tl.length },
    drivers: { value: "drivers", label: <><Users className="h-4 w-4" /> Drivers</>, count: d.length },
    docs: { value: "docs", label: <><FileText className="h-4 w-4" /> Documents</>, count: docs.length },
    vault: { value: "vault", label: <><KeyRound className="h-4 w-4" /> Credentials</> },
    profile: { value: "profile", label: <><Settings2 className="h-4 w-4" /> Profile</> },
    services: { value: "services", label: <><Layers className="h-4 w-4" /> Services</> },
    dispatch: { value: "dispatch", label: <><Route className="h-4 w-4" /> Dispatch</> },
    billing: { value: "billing", label: <><Wallet className="h-4 w-4" /> Billing</> },
    dot: { value: "dot", label: <><ShieldCheck className="h-4 w-4" /> DOT Compliance</> },
    mcpt: { value: "mcpt", label: <><Stamp className="h-4 w-4" /> MCPT</> },
  };
  const order: CompanyTab[] = office
    ? ["profile", "services", "billing", "dispatch", "dot", "mcpt", "drivers", "trucks", "trailers", "docs", "vault", "units"]
    : ["dispatch", "units", "trucks", "trailers", "drivers", "docs", "vault", "services", "dot", "mcpt", "billing", "profile"];
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
  return <Tabs<CompanyTab> value={value} onChange={onChange} className="mb-5" tabs={tabs} />;
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
  return (
    <div className="mb-5 flex flex-wrap gap-1 rounded-xl border border-line bg-surface p-1">
      {DISPATCH.map((s) => {
        const on = s.match(path);
        return (
          <Link
            key={s.href}
            href={s.href}
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

type AllTab = "carriers" | "dispatch" | "billing";
const ALL_HREF: Record<AllTab, string> = { carriers: "/fleet", dispatch: "/dispatch", billing: "/billing" };

/** Carriers · Dispatch · Billing, when every carrier is shown ("All companies"). */
export function AllCarriersTabs({ value }: { value: AllTab }) {
  const router = useRouter();
  return (
    <Tabs<AllTab>
      value={value}
      onChange={(v) => router.push(ALL_HREF[v])}
      className="mb-5"
      tabs={[
        { value: "carriers", label: <><Building2 className="h-4 w-4" /> Carriers</> },
        { value: "dispatch", label: <><Route className="h-4 w-4" /> Dispatch</> },
        { value: "billing", label: <><Wallet className="h-4 w-4" /> Billing</> },
      ]}
    />
  );
}

/** Top of the Billing page: the carrier's header and tabs (Billing selected), or Carriers · Dispatch · Billing. */
export function BillingFrame() {
  const { scope, companies } = useStore();
  const router = useRouter();
  const company = scope !== "all" ? companies.find((c) => c.id === scope) : undefined;
  return (
    <div className="no-print">
      {company ? (
        <>
          <CompanyHeader company={company} />
          <CompanyTabs company={company} value="billing" onChange={(t) => t !== "billing" && router.push(companyTabHref(t))} />
        </>
      ) : (
        <AllCarriersTabs value="billing" />
      )}
    </div>
  );
}

/**
 * Top of the Dispatch pages: the carrier's header and tabs (Dispatch selected) when one carrier is
 * chosen, or Carriers · Dispatch for all of them; then Dashboard · Loads · Invoices · Analytics.
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
          <CompanyTabs company={company} value="dispatch" onChange={(t) => t !== "dispatch" && router.push(companyTabHref(t))} />
        </>
      ) : (
        <AllCarriersTabs value="dispatch" />
      )}
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
        <CompanyTabs company={company} value="dispatch" onChange={(t) => router.push(companyTabHref(t))} />
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
