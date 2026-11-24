import { NextResponse, type NextRequest } from "next/server";
import { adminConfigured } from "@/lib/server/admin";
import { kixieConfigured, makeCall } from "@/lib/server/kixie";
import { agent } from "@/lib/server/agent";
import { e164 } from "@/lib/phone";

export const runtime = "nodejs";

/**
 * POST { to, name? }: Kixie rings the signed-in member's Kixie app / phone; when they pick up it
 * dials the customer. The call itself (length, recording, outcome) arrives by webhook.
 */
export async function POST(req: NextRequest) {
  const me = await agent();
  if (!me) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  if (!kixieConfigured()) return NextResponse.json({ error: "Kixie isn't set up (KIXIE_API_KEY, KIXIE_BUSINESS_ID)" }, { status: 503 });
  if (!adminConfigured()) return NextResponse.json({ error: "Server not set up (SUPABASE_SECRET_KEY)" }, { status: 503 });
  const { to, name } = (await req.json().catch(() => ({}))) as { to?: string; name?: string };
  const target = e164(to);
  if (!target) return NextResponse.json({ error: "That isn't a phone number Kixie can dial" }, { status: 400 });
  if (!me.kixieEmail) return NextResponse.json({ error: "Add your Kixie login email in Settings → Phone & Inbox" }, { status: 400 });

  const error = await makeCall({ agentEmail: me.kixieEmail, target, displayName: name?.trim() || target });
  // The account can't use Kixie's automation API (yet): the browser hands the number to the
  // Kixie app / extension instead (tel: link), and the call still comes back by webhook.
  if (error && /automation api|access to use/i.test(error)) return NextResponse.json({ error: `Kixie: ${error}`, fallback: "tel", target }, { status: 403 });
  if (error) return NextResponse.json({ error: `Kixie: ${error}` }, { status: 502 });
  return NextResponse.json({ ok: true, target, agent: me.kixieEmail });
}
