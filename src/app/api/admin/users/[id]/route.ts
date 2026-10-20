import type { NextRequest } from "next/server";
import { AdminError, deleteUser, isPreview, errorResponse, origins, requireSuperAdmin, sendLink, setDisabled, updateUser, type UpdateInput } from "@/lib/server/admin";

export const runtime = "nodejs";

/** PATCH: change name, position, phone, app access / roles, super admin. */
export async function PATCH(req: NextRequest, ctx: RouteContext<"/api/admin/users/[id]">) {
  try {
    if (await isPreview()) return Response.json({ ok: true, preview: true, sent: "invite" });
    const me = await requireSuperAdmin();
    const { id } = await ctx.params;
    await updateUser(me, id, (await req.json()) as UpdateInput);
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

/** POST { action: "disable" | "enable" | "send_link" } */
export async function POST(req: NextRequest, ctx: RouteContext<"/api/admin/users/[id]">) {
  try {
    if (await isPreview()) return Response.json({ ok: true, preview: true, sent: "invite" });
    const me = await requireSuperAdmin();
    const { id } = await ctx.params;
    const { action } = (await req.json()) as { action?: string };
    if (action === "disable" || action === "enable") {
      await setDisabled(me, id, action === "disable");
      return Response.json({ ok: true });
    }
    if (action === "send_link") return Response.json({ ok: true, sent: await sendLink(me, id, origins(req)) });
    throw new AdminError("Unknown action");
  } catch (e) {
    return errorResponse(e);
  }
}

/** DELETE: remove the login for good (needs { confirm: email }). */
export async function DELETE(req: NextRequest, ctx: RouteContext<"/api/admin/users/[id]">) {
  try {
    if (await isPreview()) return Response.json({ ok: true, preview: true, sent: "invite" });
    const me = await requireSuperAdmin();
    const { id } = await ctx.params;
    const { confirm } = (await req.json().catch(() => ({}))) as { confirm?: string };
    if (!confirm) throw new AdminError("Type the email to confirm.");
    await deleteUser(me, id, confirm);
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
