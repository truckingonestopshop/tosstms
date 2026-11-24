import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { adminClient, adminConfigured } from "@/lib/server/admin";
import type { Invoice, InvoiceLine } from "@/lib/types";
import { PublicInvoice } from "./PublicInvoice";

// An invoice sent by text or email: anyone with the link (the long random token is the key) sees
// it and can download the PDF. No TOSS Cloud login. Drafts aren't shown.

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Invoice · TOSS", robots: { index: false, follow: false } };

export default async function InvoiceLinkPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!adminConfigured() || !/^[a-f0-9]{32,128}$/i.test(token)) notFound();
  const a = adminClient();
  const { data: inv } = await a.from("tms_invoices").select("*").eq("public_token", token).maybeSingle();
  if (!inv || inv.status === "draft") notFound();
  const { data: lines } = await a.from("tms_invoice_lines").select("*").eq("invoice_id", inv.id);
  return <PublicInvoice invoice={{ ...(inv as Invoice), lines: (lines || []) as InvoiceLine[] }} />;
}
