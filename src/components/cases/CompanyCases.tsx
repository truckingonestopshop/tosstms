"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Segmented } from "@/components/ui/Field";
import type { CaseKind } from "@/lib/cases";
import { CasesView } from "./Cases";

/** The carrier's Cases tab: the same list as the Cases / Customer Service screens (Open, Mine,
 *  Closed, All), only for this carrier. New cases opened here belong to it. */
export function CompanyCases({ companyId }: { companyId: string }) {
  // ?kind=customer_service&case=… (a link to one case) opens on the right list.
  const params = useSearchParams();
  const [kind, setKind] = useState<CaseKind>(params.get("kind") === "customer_service" ? "customer_service" : "work");
  return (
    <div>
      <Segmented<CaseKind>
        value={kind}
        onChange={setKind}
        className="mb-3"
        options={[
          { value: "work", label: "Cases" },
          { value: "customer_service", label: "Customer Service" },
        ]}
      />
      <CasesView key={kind} kind={kind} companyId={companyId} />
    </div>
  );
}
