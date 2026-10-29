"use client";

import { Suspense } from "react";
import { Page, PageHeader } from "@/components/ui/Bits";
import { CasesView } from "@/components/cases/Cases";
import { CompanyFilter } from "@/components/layout/CompanyFilter";

// Customer Service: cases when a customer reports an overcharge, is unhappy with a service, their
// dispatcher or safety account manager, or has a suggestion.

export default function CustomerServicePage() {
  return (
    <Page>
      <PageHeader eyebrow={<CompanyFilter />} title="Customer Service" />
      <Suspense>
        <CasesView kind="customer_service" />
      </Suspense>
    </Page>
  );
}
