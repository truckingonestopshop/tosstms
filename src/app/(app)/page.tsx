import { redirect } from "next/navigation";

// Home is the Dashboard (every area at a glance). Companies is /fleet; the dispatch dashboard is
// /dispatch, under Dispatch with Loads, Invoices and Analytics.
export default function Home() {
  redirect("/dashboard");
}
