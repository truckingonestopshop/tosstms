"use client";

import Link from "next/link";
import { ArrowLeft, Building2 } from "lucide-react";
import { ButtonLink } from "@/components/ui/Button";
import { Card, Empty, Page, PageHeader } from "@/components/ui/Bits";
import { LoadEditor } from "@/components/loads/LoadEditor";
import { DispatchGate } from "@/components/fleet/CompanyNav";
import { useStore } from "@/lib/store";
import { hasService } from "@/lib/services";

export default function NewLoadPage() {
  return (
    <DispatchGate>
      <NewLoad />
    </DispatchGate>
  );
}

function NewLoad() {
  const { companies } = useStore();
  const dispatched = companies.filter((c) => hasService(c, "dispatch"));
  return (
    <Page className="pb-40 md:pb-16">
      <Link href="/loads" className="mb-3 inline-flex items-center gap-1.5 text-[13px] text-fg-3 hover:text-fg">
        <ArrowLeft className="h-3.5 w-3.5" /> Loads
      </Link>
      <PageHeader title="New load" />
      {dispatched.length === 0 ? (
        <Card>
          <Empty
            icon={Building2}
            title={companies.length ? "No carrier has Dispatch yet" : "Add a carrier first"}
            body={
              companies.length
                ? "Loads are booked for carriers with the Dispatch service. Turn on Dispatch in the carrier's Services, then book its loads."
                : "Loads belong to a carrier company. Add the carrier you dispatch for, then book its loads."
            }
            action={
              companies.length ? (
                <ButtonLink href="/fleet?tab=services" variant="primary">
                  Open Services
                </ButtonLink>
              ) : (
                <ButtonLink href="/fleet?new=company" variant="primary">
                  Add carrier company
                </ButtonLink>
              )
            }
          />
        </Card>
      ) : (
        <LoadEditor />
      )}
    </Page>
  );
}
