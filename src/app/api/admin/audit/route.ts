import { errorResponse, isPreview, listAudit, previewAudit, requireSuperAdmin } from "@/lib/server/admin";

export const runtime = "nodejs";

/** GET: the latest admin actions (who invited, changed, disabled or deleted whom). */
export async function GET() {
  try {
    if (await isPreview()) return Response.json({ rows: previewAudit() });
    await requireSuperAdmin();
    return Response.json({ rows: await listAudit() });
  } catch (e) {
    return errorResponse(e);
  }
}
