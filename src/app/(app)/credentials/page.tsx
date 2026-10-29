"use client";

import { Page, PageHeader } from "@/components/ui/Bits";
import { Vault } from "@/components/fleet/Vault";

// Credentials: TOSS's own master accounts and company logins. Each carrier's credentials stay in
// its own Credentials tab (Companies). Same encrypted store and screen.

export default function CredentialsPage() {
  return (
    <Page>
      <PageHeader eyebrow="Trucking One Stop Shop" title="Credentials" />
      <Vault companyId={null} />
    </Page>
  );
}
