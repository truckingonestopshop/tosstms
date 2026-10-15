"use client";

import Link from "next/link";
import { ArrowLeft, Building2 } from "lucide-react";
import { ButtonLink } from "@/components/ui/Button";
import { Card, Empty, Page, PageHeader } from "@/components/ui/Bits";
import { LoadEditor } from "@/components/loads/LoadEditor";
import { useStore } from "@/lib/store";

export default function NewLoadPage() {
  const { companies } = useStore();
  return (
    <Page className="pb-40 md:pb-16">
      <Link href="/loads" className="mb-3 inline-flex items-center gap-1.5 text-[13px] text-fg-3 hover:text-fg">
        <ArrowLeft className="h-3.5 w-3.5" /> Loads
      </Link>
      <PageHeader title="New load" />
      {companies.length === 0 ? (
        <Card>
          <Empty
            icon={Building2}
            title="Add a carrier first"
            body="Loads belong to a carrier company. Add the carrier you dispatch for, then book its loads."
            action={
              <ButtonLink href="/fleet?new=company" variant="primary">
                Add carrier company
              </ButtonLink>
            }
          />
        </Card>
      ) : (
        <LoadEditor />
      )}
    </Page>
  );
}
