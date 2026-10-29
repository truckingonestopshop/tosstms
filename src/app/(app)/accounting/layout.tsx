import { AccountingProvider } from "@/components/accounting/AccountingProvider";

// TOSS Accounting (switcher → Accounting). Access is checked by the app shell (Users → Accounting)
// and by the database (tms_private.can_accounting).
export default function AccountingLayout({ children }: { children: React.ReactNode }) {
  return <AccountingProvider>{children}</AccountingProvider>;
}
