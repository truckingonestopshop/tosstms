import {
  ArrowLeftRight,
  Calculator,
  Repeat,
  SlidersHorizontal,
  Briefcase,
  Building2,
  Clock,
  FolderOpen,
  Headset,
  KeyRound,
  Layers,
  LayoutDashboard,
  Route,
  Settings,
  TrendingUp,
  Truck,
  UserCog,
  Wallet,
  type LucideIcon,
} from "lucide-react";

/** Pages under Dispatch (its own section, inside the carrier's sections). */
export const isDispatchPath = (p: string) => p === "/dispatch" || p.startsWith("/loads") || p.startsWith("/invoices") || p.startsWith("/analytics");

export interface NavItem {
  /** section key (Users → access) */
  key: string;
  href: string;
  label: string;
  icon: LucideIcon;
  match: (p: string) => boolean;
}

// The left menu. Companies opens Fleet & Company (each carrier's own sections are unchanged
// inside it); Dispatch and Billing keep their pages.
export const SIDEBAR: NavItem[][] = [
  [
    { key: "dashboard", href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, match: (p) => p.startsWith("/dashboard") },
    { key: "companies", href: "/fleet", label: "Companies", icon: Building2, match: (p) => p.startsWith("/fleet") },
    { key: "services", href: "/services", label: "Services", icon: Layers, match: (p) => p.startsWith("/services") },
    { key: "dispatch", href: "/dispatch", label: "Dispatch", icon: Route, match: isDispatchPath },
    { key: "sales", href: "/sales", label: "Sales", icon: TrendingUp, match: (p) => p.startsWith("/sales") },
    { key: "billing", href: "/billing", label: "Billing", icon: Wallet, match: (p) => p.startsWith("/billing") },
    { key: "cases", href: "/cases", label: "Cases", icon: Briefcase, match: (p) => p.startsWith("/cases") },
    { key: "pending", href: "/pending", label: "Pending", icon: Clock, match: (p) => p.startsWith("/pending") },
  ],
  [
    { key: "equipment", href: "/equipment", label: "Equipment & Drivers", icon: Truck, match: (p) => p.startsWith("/equipment") || p.startsWith("/drivers") },
  ],
  [
    { key: "credentials", href: "/credentials", label: "Credentials", icon: KeyRound, match: (p) => p.startsWith("/credentials") },
    { key: "documents", href: "/documents", label: "Documents", icon: FolderOpen, match: (p) => p.startsWith("/documents") },
    { key: "customer_service", href: "/customer-service", label: "Customer Service", icon: Headset, match: (p) => p.startsWith("/customer-service") },
    { key: "users", href: "/users", label: "Users", icon: UserCog, match: (p) => p.startsWith("/users") || p.startsWith("/admin") },
    { key: "settings", href: "/settings", label: "Settings", icon: Settings, match: (p) => p.startsWith("/settings") || p.startsWith("/profile") },
  ],
];

// TOSS Accounting (switcher → Accounting): TOSS's own money, its own menu.
export const ACCOUNTING_SIDEBAR: NavItem[][] = [
  [
    { key: "accounting", href: "/accounting", label: "Dashboard", icon: LayoutDashboard, match: (p) => p === "/accounting" },
    { key: "accounting", href: "/accounting/transactions", label: "Transactions", icon: ArrowLeftRight, match: (p) => p.startsWith("/accounting/transactions") },
    { key: "accounting", href: "/accounting/recurring", label: "Recurring", icon: Repeat, match: (p) => p.startsWith("/accounting/recurring") },
    { key: "accounting", href: "/accounting/setup", label: "Setup", icon: SlidersHorizontal, match: (p) => p.startsWith("/accounting/setup") },
  ],
];
/** The Accounting access option (Users → access). */
export const ACCOUNTING_SECTION: NavItem = { key: "accounting", href: "/accounting", label: "TOSS Accounting", icon: Calculator, match: (p) => p.startsWith("/accounting") };

/** Every section, in menu order (Accounting last). */
export const SECTIONS = [...SIDEBAR.flat(), ACCOUNTING_SECTION];
/** Always open: your own profile and settings. */
const ALWAYS = new Set(["settings"]);

/** The section a page belongs to (null: not part of one, e.g. sign-in pages). */
export const sectionFor = (path: string) => (ACCOUNTING_SECTION.match(path) ? ACCOUNTING_SECTION : SIDEBAR.flat().find((n) => n.match(path)) ?? null);

/**
 * Owners open everything; others the sections chosen for them on Users (none chosen = all).
 * Accounting (TOSS's own money) is the exception: only owners and people given it on Users.
 */
export function canOpen(m: { role: string; sections?: string[] | null } | undefined, key: string) {
  if (key === "accounting") return !!m && (m.role === "owner" || !!m.sections?.includes("accounting"));
  if (!m || m.role === "owner" || ALWAYS.has(key)) return true;
  return !m.sections || m.sections.includes(key);
}
