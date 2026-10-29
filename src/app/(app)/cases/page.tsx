"use client";

import { Suspense } from "react";
import { Page, PageHeader } from "@/components/ui/Bits";
import { CasesView } from "@/components/cases/Cases";
import { CompanyFilter } from "@/components/layout/CompanyFilter";

// Cases: the work TOSS does for a client, connected to an invoice / opportunity, with a work log
// and expenses.

export default function CasesPage() {
  return (
    <Page>
      <PageHeader eyebrow={<CompanyFilter />} title="Cases" />
      <Suspense>
        <CasesView kind="work" />
      </Suspense>
    </Page>
  );
}
