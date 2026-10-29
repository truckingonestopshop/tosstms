"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Building2, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, Empty, Page, PageHeader } from "@/components/ui/Bits";
import { confirmDialog } from "@/components/ui/Confirm";
import { CompanyFields, NewCompanyModal, draftProblem, fromDraft, toDraft, type CompanyDraft } from "@/components/fleet/CompanyForm";
import { DotComplianceTab, McptTab } from "@/components/fleet/Compliance";
import { Vault } from "@/components/fleet/Vault";
import { CompanyHeader, CompanyTabs, companyTabHref, type CompanyTab } from "@/components/fleet/CompanyNav";
import { CompanyOverview, ServicesOverview } from "@/components/fleet/CompanyProfile";
import { CompanyEquipment, isEquipmentTab } from "@/components/fleet/CompanyEquipment";
import { CompanySales } from "@/components/sales/CompanySales";
import { CompanyCases } from "@/components/cases/CompanyCases";
import { CompaniesCrm } from "@/components/fleet/CompaniesCrm";
import { DocumentsPanel } from "@/components/docs/DocumentsPanel";
import { FleetPaperwork } from "@/components/docs/FleetPaperwork";
import { useStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import type { Company } from "@/lib/types";

type Tab = Exclude<CompanyTab, "dispatch" | "billing">;

export default function FleetPage() {
  return (
    <Suspense>
      <Fleet />
    </Suspense>
  );
}

function Fleet() {
  const params = useSearchParams();
  const router = useRouter();
  const { companies, drivers, trucks, trailers, scopedCompany, setScope } = useStore();
  const [newOpen, setNewOpen] = useState(false);

  // Links from the dashboard and alerts name the carrier (or a driver / truck of it):
  // open that carrier even when "All companies" is selected.
  const wantCompany =
    params.get("company") ||
    drivers.find((d) => d.id === params.get("driver"))?.company_id ||
    trucks.find((t) => t.id === params.get("truck"))?.company_id ||
    trailers.find((t) => t.id === params.get("trailer"))?.company_id ||
    null;
  useEffect(() => {
    if (!wantCompany || !companies.some((c) => c.id === wantCompany)) return;
    // A link that names only a driver / truck / trailer: put its company in the address.
    if (!params.get("company") && scopedCompany?.id !== wantCompany) setScope(wantCompany);
    // Only when the link changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantCompany, companies.length]);

  useEffect(() => {
    if (params.get("new") === "company") {
      setNewOpen(true);
      router.replace("/fleet");
    }
  }, [params, router]);

  return (
    <Page>
      {companies.length === 0 ? (
        <>
          <PageHeader title="Fleet & Company" />
          <Card>
            <Empty
              icon={Building2}
              title="Add your first carrier"
              body="Each carrier company you dispatch for gets its own trucks, drivers, documents, credentials and dispatch fee."
              action={
                <Button variant="primary" onClick={() => setNewOpen(true)}>
                  <Plus className="h-4 w-4" /> Add carrier company
                </Button>
              }
            />
          </Card>
        </>
      ) : scopedCompany ? (
        <CompanyView company={scopedCompany} />
      ) : (
        <CompaniesCrm onAdd={() => setNewOpen(true)} />
      )}
      <NewCompanyModal open={newOpen} onClose={() => setNewOpen(false)} />
    </Page>
  );
}

// ----------------------------------------------------------------------------
// All companies
// ----------------------------------------------------------------------------
// ----------------------------------------------------------------------------
// One company
// ----------------------------------------------------------------------------
function CompanyView({ company }: { company: Company }) {
  const params = useSearchParams();
  const router = useRouter();
  const { view } = useStore();
  const office = view === "office";
  const tab = (params.get("tab") as Tab) || (office ? "profile" : "units");
  const setTab = (t: Tab) => router.replace(`/fleet?company=${company.id}&tab=${t}`, { scroll: false });


  return (
    <>
      <CompanyHeader company={company} />
      {/* Dispatch and Billing open their own pages, still under this carrier */}
      <CompanyTabs company={company} value={tab} onChange={(next) => (next === "dispatch" || next === "billing" ? router.push(companyTabHref(next, company.id)) : setTab(next))} />
      {isEquipmentTab(tab) && <CompanyEquipment company={company} tab={tab} onTab={setTab} />}
      {tab === "docs" && <DocsTab company={company} />}
      {tab === "vault" && <Vault companyId={company.id} />}
      {tab === "dot" && <DotComplianceTab key={company.id} company={company} />}
      {tab === "mcpt" && <McptTab key={company.id} company={company} />}
      {tab === "sales" && <CompanySales company={company} />}
      {tab === "cases" && <CompanyCases companyId={company.id} />}
      {tab === "services" && <ServicesOverview company={company} onMore={setTab} />}
      {tab === "profile" && <ProfileTab company={company} onServices={() => setTab("services")} />}
    </>
  );
}

function DocsTab({ company }: { company: Company }) {
  const target = useMemo(() => ({ scope: "company" as const, companyId: company.id }), [company.id]);
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="min-w-0">
        <DocumentsPanel target={target} includeAll emptyText="No documents for this carrier yet." />
      </div>
      <div className="min-w-0 xl:order-none">
        <FleetPaperwork companyId={company.id} />
      </div>
    </div>
  );
}

function ProfileTab({ company, onServices }: { company: Company; onServices: () => void }) {
  const { updateCompany, deleteCompany, isOwner, loads, setScope } = useStore();
  const [editing, setEditing] = useState(false);
  const [d, setD] = useState<CompanyDraft>(toDraft(company));
  const [saving, setSaving] = useState(false);
  useEffect(() => setD(toDraft(company)), [company]);
  const dirty = useMemo(() => JSON.stringify(d) !== JSON.stringify(toDraft(company)), [d, company]);
  const loadCount = loads.filter((l) => l.company_id === company.id).length;

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="text-sm text-fg-3">{editing ? "Editing the carrier's details" : "Carrier profile"}</div>
        {!editing && (
          <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
            <Pencil className="h-3.5 w-3.5" /> Edit
          </Button>
        )}
      </div>
      {!editing && <CompanyOverview company={company} onServices={onServices} />}
      {editing && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_320px]">
          <Card className="p-4 sm:p-6">
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const problem = draftProblem(d);
                if (problem) return toast.error(problem);
                setSaving(true);
                const ok = await updateCompany(company.id, fromDraft(d));
                setSaving(false);
                if (ok) {
                  toast.success("Company saved");
                  setEditing(false);
                }
              }}
            >
              <CompanyFields key={company.id} d={d} set={(p) => setD((x) => ({ ...x, ...p }))} companyId={company.id} />
              <div className="mt-6 flex justify-end gap-2 border-t border-line pt-4">
                <Button
                  variant="ghost"
                  onClick={() => {
                    setD(toDraft(company));
                    setEditing(false);
                  }}
                >
                  Cancel
                </Button>
                <Button type="submit" variant="primary" disabled={!dirty} loading={saving}>
                  Save changes
                </Button>
              </div>
            </form>
          </Card>
          <div className="space-y-4">
            {company.services?.dispatch?.on && (
              <Card className="p-4 text-[13px] text-fg-2">
                <div className="font-semibold text-fg">How the dispatch fee works</div>
                <p className="mt-1.5 leading-relaxed text-fg-3">
                  Every new load for {company.name} takes {company.commission_percent}% of its gross as TOSS&apos;s fee. You can change the
                  percentage on any single load. Delivered loads are billed {company.billing_cadence} from Invoices.
                </p>
              </Card>
            )}
            {isOwner && (
              <Card className="border-red-500/25 p-4">
                <div className="text-[13px] font-semibold text-fg">Delete company</div>
                <p className="mt-1 text-[13px] text-fg-3">
                  Removes {company.name} with its trucks, drivers, {loadCount} load{loadCount === 1 ? "" : "s"}, documents and credentials. Invoices stay.
                </p>
                <Button
                  variant="danger"
                  size="sm"
                  className="mt-3"
                  onClick={async () => {
                    if (
                      await confirmDialog({
                        title: `Delete ${company.name}?`,
                        body: "This can't be undone.",
                        confirmLabel: "Delete company",
                        danger: true,
                        typeToConfirm: company.name,
                      })
                    ) {
                      if (await deleteCompany(company.id)) {
                        toast.success("Company deleted");
                        setScope("all");
                      }
                    }
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" /> Delete company
                </Button>
              </Card>
            )}
          </div>
        </div>
      )}
    </>
  );
}
