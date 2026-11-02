"use client";

import { usePathname } from "next/navigation";
import { inCompanyArea, useStore } from "@/lib/store";

/**
 * The company a page is narrowed to (?company=… from a link), in the page's eyebrow. There is no
 * picker: pages open on all companies, and a company's own pages are reached from the company.
 * Inside one company's pages (its Dispatch, Billing…) the header already says it, so nothing shows;
 * `before` goes with it.
 */
export function CompanyFilter({ before }: { before?: string }) {
  const { companies, scope } = useStore();
  const path = usePathname();
  const current = companies.find((c) => c.id === scope);
  if (!current || inCompanyArea(path)) return null;
  return (
    <>
      {before}
      <span className="inline-block max-w-[280px] truncate align-bottom">{current.name}</span>
    </>
  );
}
