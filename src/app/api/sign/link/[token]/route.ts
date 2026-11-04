import { NextResponse, type NextRequest } from "next/server";
import { adminClient, adminConfigured } from "@/lib/server/admin";
import { logEvent } from "@/lib/server/signing";
import { AUTO, autoValue, resolveFieldValue, type SignField, type SignRole } from "@/lib/signing";

export const runtime = "nodejs";

// TossSign public links (like DocuSign PowerForms): anyone with the link types their name and
// email and gets their own copy of the document to fill and sign. Each visit makes a new request,
// filed on the link's carrier when it has one.

type Link = {
  id: string;
  title: string;
  company_id: string | null;
  doc_type: string | null;
  file_path: string;
  file_name: string;
  pages: unknown;
  roles: SignRole[];
  fields: SignField[];
  values: Record<string, string>;
  verify_email: boolean;
  active: boolean;
  uses: number;
};

async function linkOf(token: string) {
  if (!/^[a-f0-9]{36}$/.test(token)) return null;
  const { data } = await adminClient().from("tms_sign_links").select("*").eq("token", token).maybeSingle();
  return (data as Link | null) || null;
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  if (!adminConfigured()) return NextResponse.json({ error: "Not available" }, { status: 503 });
  const link = await linkOf((await ctx.params).token);
  if (!link || !link.active) return NextResponse.json({ error: "This link isn't available." }, { status: 404 });
  const { data: company } = link.company_id ? await adminClient().from("tms_companies").select("name").eq("id", link.company_id).maybeSingle() : { data: null };
  return NextResponse.json({ title: link.title, company: (company as { name?: string } | null)?.name || null, verifyEmail: link.verify_email });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  if (!adminConfigured()) return NextResponse.json({ error: "Not available" }, { status: 503 });
  const link = await linkOf((await ctx.params).token);
  if (!link || !link.active) return NextResponse.json({ error: "This link isn't available." }, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as { name?: string; email?: string; phone?: string };
  const name = String(body.name || "").trim().slice(0, 120);
  const email = String(body.email || "").trim().toLowerCase().slice(0, 200);
  const phone = String(body.phone || "").trim().slice(0, 40) || null;
  if (!name) return NextResponse.json({ error: "Enter your full name" }, { status: 400 });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "Enter a valid email" }, { status: 400 });

  const role = link.roles[0]?.key || "signer";
  // The visitor's own name / email / phone fill the fields that ask for them.
  const values: Record<string, string> = { ...link.values };
  for (const f of link.fields) {
    if (!values[f.id] && f.value) values[f.id] = f.value;
    if (f.role === role) {
      if (f.auto?.startsWith("recipient.") && AUTO.some((a) => a.v === f.auto)) {
        values[f.id] = autoValue(f.auto, { recipient: { name, email, phone } });
      } else if (!values[f.id]) {
        const v = resolveFieldValue(f, { recipient: { name, email, phone } });
        if (v) values[f.id] = v;
      }
    }
  }
  const db = adminClient();
  const { data: request, error } = await db
    .from("tms_sign_requests")
    .insert({
      title: `${link.title} · ${name}`,
      company_id: link.company_id,
      doc_type: link.doc_type,
      file_path: link.file_path,
      file_name: link.file_name,
      pages: link.pages,
      roles: link.roles.slice(0, 1),
      fields: link.fields,
      values,
      status: "sent",
      sent_at: new Date().toISOString(),
      link_id: link.id,
    })
    .select("id")
    .single();
  if (error || !request) return NextResponse.json({ error: "Couldn't start the document" }, { status: 500 });
  const { data: rec, error: e2 } = await db
    .from("tms_sign_recipients")
    .insert({ request_id: request.id, role, kind: "signer", name, email, phone, position: 1, status: "sent", sent_at: new Date().toISOString(), verify: link.verify_email ? "email" : "none" })
    .select("token")
    .single();
  if (e2 || !rec) return NextResponse.json({ error: "Couldn't start the document" }, { status: 500 });
  await db.from("tms_sign_links").update({ uses: (link.uses || 0) + 1 }).eq("id", link.id);
  await logEvent({ request_id: request.id, action: "created", detail: `Started from the public link "${link.title}" by ${name} (${email})`, ip: (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || null, user_agent: req.headers.get("user-agent") });
  return NextResponse.json({ token: (rec as { token: string }).token });
}
