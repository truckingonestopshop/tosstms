"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FileSignature, LayoutTemplate, Link2, ShieldCheck } from "lucide-react";
import { Page, PageHeader } from "@/components/ui/Bits";
import { cn } from "@/lib/format";
import { SigningDashboard } from "@/components/signing/Dashboard";
import { TemplatesList } from "@/components/signing/Templates";
import { AllLinks } from "@/components/signing/PublicLinks";

// TossSign: every document sent for signing (numbers, status tabs, progress, bulk actions), the
// template gallery (with the starter library) and public links. Documents are also sent from a
// company's Documents tab, a DER / owner / contact on its Profile, or a driver.

type Tab = "documents" | "templates" | "links";
const TABS: { v: Tab; label: string; icon: typeof FileSignature }[] = [
  { v: "documents", label: "Documents", icon: FileSignature },
  { v: "templates", label: "Templates", icon: LayoutTemplate },
  { v: "links", label: "Public links", icon: Link2 },
];

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
  const raw = params.get("tab");
  const tab: Tab = raw === "templates" || raw === "links" ? raw : "documents";
  return (
    <Page>
      <PageHeader
        eyebrow={
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5" /> Sealed e-signatures
          </span>
        }
        title="TossSign"
      />
      <div className="mb-5 flex gap-1 border-b border-line">
        {TABS.map((t) => (
          <button
            key={t.v}
            onClick={() => router.replace(`/signing?tab=${t.v}`, { scroll: false })}
            className={cn("-mb-px flex items-center gap-1.5 border-b-2 px-3 pb-2.5 pt-1 text-[13px] font-semibold transition-colors", tab === t.v ? "border-brand text-fg" : "border-transparent text-fg-3 hover:text-fg")}
          >
            <t.icon className="h-4 w-4" /> {t.label}
          </button>
        ))}
      </div>
      {tab === "documents" ? <SigningDashboard /> : tab === "templates" ? <TemplatesList key={params.toString()} /> : <AllLinks />}
    </Page>
  );
}
