import { NextResponse, type NextRequest } from "next/server";
import { adminClient, adminConfigured } from "@/lib/server/admin";
import { codeOk, loadRequest } from "@/lib/server/signing";
import type { SignRecipient } from "@/lib/signing";

export const runtime = "nodejs";

const MAX = 15 * 1024 * 1024;
const OK = /\.(pdf|png|jpe?g|webp|heic|heif|gif|tiff?|doc|docx|xls|xlsx|csv|txt)$/i;

/** A file a signer attaches for an Attachment field (stored until the document is done). */
export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  if (!adminConfigured()) return NextResponse.json({ error: "Not available" }, { status: 503 });
  const { token } = await ctx.params;
  if (!/^[a-f0-9]{48}$/.test(token)) return NextResponse.json({ error: "This link isn't valid." }, { status: 404 });
  const { data } = await adminClient().from("tms_sign_recipients").select("*").eq("token", token).maybeSingle();
  const me = data as (SignRecipient & { otp_hash?: string | null }) | null;
  if (!me || me.kind !== "signer" || me.status === "signed" || me.status === "declined") return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  if (!codeOk(me, req.headers.get("x-sign-code"))) return NextResponse.json({ error: "Enter your code first." }, { status: 403 });
  const { req: request } = await loadRequest(me.request_id);
  if (!request || request.status !== "sent") return NextResponse.json({ error: "This document isn't open anymore." }, { status: 409 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No file" }, { status: 400 });
  if (file.size > MAX) return NextResponse.json({ error: "Files up to 15 MB" }, { status: 400 });
  if (!OK.test(file.name)) return NextResponse.json({ error: "PDF, images and Office files only" }, { status: 400 });
  const safe = file.name.normalize("NFKD").replace(/[^\w.\-]+/g, "_").slice(-100);
  const path = `signing/uploads/${request.id}/${me.id}/${Date.now()}-${safe}`;
  const up = await adminClient().storage.from("tms-docs").upload(path, new Uint8Array(await file.arrayBuffer()), { contentType: file.type || undefined });
  if (up.error) return NextResponse.json({ error: "Upload failed" }, { status: 502 });
  return NextResponse.json({ path, name: file.name, mime: file.type || null });
}
