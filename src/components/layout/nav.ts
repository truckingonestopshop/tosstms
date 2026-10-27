import { Building2 } from "lucide-react";

/** Pages under Dispatch (its own section, inside the carrier's sections). */
export const isDispatchPath = (p: string) => p === "/dispatch" || p.startsWith("/loads") || p.startsWith("/invoices") || p.startsWith("/analytics");

// TOSS Cloud serves every service: the top bar holds the carriers; Dashboard, Loads, Invoices and
// Analytics are under each carrier's Dispatch section (or Carriers · Dispatch for all of them).
export const NAV = [
  { href: "/fleet", label: "Fleet & Company", short: "Fleet", icon: Building2, match: (p: string) => p.startsWith("/fleet") || isDispatchPath(p) },
];
