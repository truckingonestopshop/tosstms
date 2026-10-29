"use client";

import { Suspense } from "react";
import { Page, PageHeader } from "@/components/ui/Bits";
import { CasesView } from "@/components/cases/Cases";
import { useStore } from "@/lib/store";

// Cases: the work TOSS does for a client, connected to an invoice / opportunity, with a work log
// and expenses.

export default function CasesPage() {
  const { scopedCompany } = useStore();
  return (
    <Page>
      <PageHeader eyebrow={scopedCompany ? scopedCompany.name : "All companies"} title="Cases" />
      <Suspense>
        <CasesView kind="work" />
      </Suspense>
    </Page>
  );
}
