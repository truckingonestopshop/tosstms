import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { adminConfigured } from "@/lib/server/admin";
import { sweep } from "@/lib/server/signing";

export const runtime = "nodejs";

/**
 * TossSign's daily run (Vercel Cron, see vercel.json): reminders to whoever hasn't finished, on
 * the days each document asks for, and documents past their date marked expired. Vercel sends
 * "Authorization: Bearer <CRON_SECRET>"; without that secret on the server nothing runs.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET || "";
  const given = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!secret || given.length !== secret.length || !timingSafeEqual(Buffer.from(given), Buffer.from(secret))) {
    return NextResponse.json({ error: "Not allowed", serverSecret: secret ? "set" : "missing" }, { status: 401 });
  }
  if (!adminConfigured()) return NextResponse.json({ error: "Server not set up (SUPABASE_SECRET_KEY)" }, { status: 503 });
  return NextResponse.json({ ok: true, ...(await sweep(req.nextUrl.origin)) });
}
