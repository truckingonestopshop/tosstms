"use client";

import { ChevronDown } from "lucide-react";
import { useStore } from "@/lib/store";

/**
 * "All companies ⌄" in a page's eyebrow: narrows that page to one company. It lives in the page
 * address (?company=…), so the menu always opens on all companies again.
 */
export function CompanyFilter() {
  const { companies, scope, setScope } = useStore();
  const list = [...companies].sort((a, b) => Number(a.stage === "lead") - Number(b.stage === "lead") || a.name.localeCompare(b.name));
  const current = companies.find((c) => c.id === scope);
  return (
    <span className="relative inline-flex max-w-[280px] items-center gap-1 rounded-md hover:text-fg">
      <span className="truncate">{current ? current.name : "All companies"}</span>
      <ChevronDown className="h-3 w-3 shrink-0" />
      <select
        value={current ? current.id : "all"}
        onChange={(e) => setScope(e.target.value)}
        className="absolute inset-0 cursor-pointer opacity-0"
        aria-label="Filter by company"
      >
        <option value="all">All companies</option>
        <optgroup label="Clients">
          {list
            .filter((c) => c.stage !== "lead")
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
        </optgroup>
        {list.some((c) => c.stage === "lead") && (
          <optgroup label="Leads">
            {list
              .filter((c) => c.stage === "lead")
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </optgroup>
        )}
      </select>
    </span>
  );
}
