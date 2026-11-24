import { NextResponse, type NextRequest } from "next/server";
import { adminClient, adminConfigured } from "@/lib/server/admin";
import { webhookAllowed } from "@/lib/server/kixie";
import { matchPhone } from "@/lib/server/comms";

export const runtime = "nodejs";

/**
 * Kixie's Contact Lookup (Custom CRM): GET ?number=+13105551234 with the x-toss-key header (or
 * ?key=). Kixie shows who's calling and links to the carrier in TOSS Cloud.
 * https://www.kixie.com/developer/custom-crm-integration/
 */
export async function GET(req: NextRequest) {
  if (!webhookAllowed(req.headers.get("x-toss-key") || req.nextUrl.searchParams.get("key"))) {
    return NextResponse.json({ error: "Not allowed" }, { status: 401 });
  }
  if (!adminConfigured()) return NextResponse.json({ found: false });
  const m = await matchPhone(req.nextUrl.searchParams.get("number"));
  if (!m?.company_id) return NextResponse.json({ found: false });

  const { data: c } = await adminClient().from("tms_companies").select("id, name, contact_email, contact_phone, city, state, street, zip").eq("id", m.company_id).maybeSingle();
  const [first, ...rest] = (m.name || "").split(" ");
  const link = `${req.nextUrl.origin}/fleet?company=${m.company_id}`;
  return NextResponse.json({
    found: true,
    contact: {
      contact_id: m.company_id,
      first_name: first || c?.name || "",
      last_name: rest.join(" "),
      email: c?.contact_email || "",
      phone_number: c?.contact_phone || "",
      title: m.via === "driver" ? "Driver" : "",
      link,
    },
    deal: {},
    org: { org_id: m.company_id, name: c?.name || m.company_name || "", address: [c?.street, c?.city, c?.state, c?.zip].filter(Boolean).join(", "), link },
  });
}
