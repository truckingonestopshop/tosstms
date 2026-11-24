"use client";

import { useState } from "react";
import { Settings2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Page, PageHeader } from "@/components/ui/Bits";
import { CompanyFilter } from "@/components/layout/CompanyFilter";
import { Inbox } from "@/components/comms/Inbox";
import { KixieSetup } from "@/components/comms/KixieSetup";

// Inbox: calls and texts (Kixie) and emails (TOSS) with carriers and leads, one conversation each.

export default function InboxPage() {
  const [setup, setSetup] = useState(false);
  return (
    <Page>
      <PageHeader
        eyebrow={<CompanyFilter />}
        title="Inbox"
        actions={
          <Button variant="outline" size="sm" onClick={() => setSetup(true)}>
            <Settings2 className="h-3.5 w-3.5" /> Phone setup
          </Button>
        }
      />
      <Inbox />
      <KixieSetup open={setup} onClose={() => setSetup(false)} />
    </Page>
  );
}
