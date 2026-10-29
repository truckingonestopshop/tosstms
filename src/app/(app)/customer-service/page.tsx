"use client";

import { Suspense } from "react";
import { Page, PageHeader } from "@/components/ui/Bits";
import { CasesView } from "@/components/cases/Cases";
import { useStore } from "@/lib/store";

// Customer Service: cases when a customer reports an overcharge, is unhappy with a service, their
// dispatcher or safety account manager, or has a suggestion.

export default function CustomerServicePage() {
  const { scopedCompany } = useStore();
  return (
    <Page>
      <PageHeader eyebrow={scopedCompany ? scopedCompany.name : "All companies"} title="Customer Service" />
      <Suspense>
        <CasesView kind="customer_service" />
      </Suspense>
    </Page>
  );
}
