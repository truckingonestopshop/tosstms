import { redirect } from "next/navigation";

// TOSS Cloud serves every service: the home page is the carriers. The dispatch dashboard is at
// /dispatch, under Dispatch with Loads, Invoices and Analytics.
export default function Home() {
  redirect("/fleet");
}
