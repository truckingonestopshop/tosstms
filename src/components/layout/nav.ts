import { BarChart3, Building2, FileText, LayoutGrid, Truck } from "lucide-react";

export const NAV = [
  { href: "/", label: "Dashboard", short: "Home", icon: LayoutGrid, match: (p: string) => p === "/" },
  { href: "/loads", label: "Loads", short: "Loads", icon: Truck, match: (p: string) => p.startsWith("/loads") },
  { href: "/invoices", label: "Invoices", short: "Invoices", icon: FileText, match: (p: string) => p.startsWith("/invoices") },
  { href: "/analytics", label: "Analytics", short: "Analytics", icon: BarChart3, match: (p: string) => p.startsWith("/analytics") },
  { href: "/fleet", label: "Fleet & Company", short: "Fleet", icon: Building2, match: (p: string) => p.startsWith("/fleet") },
];
