"use client";

import Link from "next/link";
import { use } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Card, Empty, Page, PageHeader } from "@/components/ui/Bits";
import { LoadEditor } from "@/components/loads/LoadEditor";
import { useStore } from "@/lib/store";
import { lane } from "@/lib/format";

export default function EditLoadPage({ params }: PageProps<"/loads/[id]/edit">) {
  const { id } = use(params);
  const router = useRouter();
  const { loads } = useStore();
  const load = loads.find((l) => l.id === id);
  return (
    <Page className="pb-40 md:pb-16">
      <Link href={`/loads/${id}`} className="mb-3 inline-flex items-center gap-1.5 text-[13px] text-fg-3 hover:text-fg">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to load
      </Link>
      {!load ? (
        <Card>
          <Empty title="Load not found" body="It may have been deleted." />
        </Card>
      ) : (
        <>
          <PageHeader eyebrow={load.load_number ? `Load #${load.load_number}` : "Edit load"} title={lane(load)} />
          <LoadEditor key={load.id} load={load} onDone={() => router.push(`/loads/${id}`)} />
        </>
      )}
    </Page>
  );
}
