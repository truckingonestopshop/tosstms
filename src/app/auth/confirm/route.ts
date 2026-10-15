import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { safeNext } from "@/lib/links";
import { supabaseServer } from "@/lib/supabase/server";

// Landing URL for email links: ?code=… (password reset, PKCE) or ?token_hash=…&type=…
export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const next = safeNext(url.searchParams.get("next") ?? "/");

  const sb = await supabaseServer();
  let ok = false;
  if (code) {
    ok = !(await sb.auth.exchangeCodeForSession(code)).error;
  } else if (tokenHash && type) {
    ok = !(await sb.auth.verifyOtp({ type, token_hash: tokenHash })).error;
  }
  if (ok) return NextResponse.redirect(new URL(next, url.origin));

  const login = new URL("/login", url.origin);
  login.searchParams.set("error", "link");
  return NextResponse.redirect(login);
}
