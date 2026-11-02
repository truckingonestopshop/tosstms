"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Page, PageHeader } from "@/components/ui/Bits";
import { Segmented } from "@/components/ui/Field";
import { SigningRequests } from "@/components/signing/Requests";
import { TemplatesList } from "@/components/signing/Templates";

// TossSign: everything sent for signing (all companies) and the templates. Documents are sent from
// a company's Documents tab, a DER / owner / contact on its Profile, or a driver.

type Tab = "sent" | "templates";

export default function SigningPage() {
  return (
    <Suspense>
      <Signing />
    </Suspense>
  );
}

function Signing() {
  const params = useSearchParams();
  const router = useRouter();
  const tab: Tab = params.get("tab") === "templates" ? "templates" : "sent";
  return (
    <Page>
      <PageHeader eyebrow="Documents & e-signatures" title="TossSign" />
      <Segmented<Tab>
        value={tab}
        onChange={(t) => router.replace(`/signing?tab=${t}`, { scroll: false })}
        className="mb-4"
        options={[
          { value: "sent", label: "Sent" },
          { value: "templates", label: "Templates" },
        ]}
      />
      {tab === "sent" ? <SigningRequests title="All documents sent for signing" /> : <TemplatesList />}
    </Page>
  );
}
