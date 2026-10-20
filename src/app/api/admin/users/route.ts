import type { NextRequest } from "next/server";
import { adminConfigured, errorResponse, inviteUser, isPreview, listUsers, origins, previewUsers, requireSuperAdmin, type InviteInput } from "@/lib/server/admin";

export const runtime = "nodejs";

/** GET: everyone with a TOSS login and their access to TMS and Leads. */
export async function GET() {
  try {
    if (await isPreview()) return Response.json({ configured: true, preview: true, users: previewUsers(), me: "demo-me", leadsUrl: process.env.NEXT_PUBLIC_LEADS_URL || null });
    const me = await requireSuperAdmin();
    if (!adminConfigured()) return Response.json({ configured: false, users: [], me: me.id });
    return Response.json({ configured: true, users: await listUsers(), me: me.id, leadsUrl: process.env.NEXT_PUBLIC_LEADS_URL || null });
  } catch (e) {
    return errorResponse(e);
  }
}

/** POST: invite someone (email, name, position, which apps and roles). */
export async function POST(req: NextRequest) {
  try {
    if (await isPreview()) return Response.json({ id: `demo-${Date.now()}`, preview: true });
    const me = await requireSuperAdmin();
    const body = (await req.json()) as InviteInput;
    const id = await inviteUser(me, body, origins(req));
    return Response.json({ id });
  } catch (e) {
    return errorResponse(e);
  }
}
