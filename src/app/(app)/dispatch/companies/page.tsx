"use client";

import { useState } from "react";
import { Page } from "@/components/ui/Bits";
import { DispatchFrame, DispatchGate } from "@/components/fleet/CompanyNav";
import { CompaniesCrm } from "@/components/fleet/CompaniesCrm";
import { NewCompanyModal } from "@/components/fleet/CompanyForm";

export default function DispatchCompaniesPage() {
  const [newOpen, setNewOpen] = useState(false);
  return (
    <DispatchGate>
      <Page>
        <DispatchFrame />
        <CompaniesCrm mode="dispatch" onAdd={() => setNewOpen(true)} />
        <NewCompanyModal open={newOpen} onClose={() => setNewOpen(false)} />
      </Page>
    </DispatchGate>
  );
}

