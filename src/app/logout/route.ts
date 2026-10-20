import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

// Signing out of TOSS Lead Hunter ends the shared login there (scope global) and lands here to
// clear this site's cookie too; otherwise the shared sign-in page would sign them straight back in.
export async function GET(req: NextRequest) {
  const sb = await supabaseServer();
  await sb.auth.signOut({ scope: "local" });
  const url = new URL("/login", req.url);
  if (req.nextUrl.searchParams.get("app") === "leads") url.searchParams.set("app", "leads");
  return NextResponse.redirect(url);
}
