import { NextResponse, type NextRequest } from "next/server";
import { currentUser } from "@/lib/supabase/server";
import { cloudOrigin, handoffUrl } from "@/lib/server/handoff";

// TOSS Cloud → TOSS Lead Hunter, already signed in (see lib/server/handoff.ts).
// Signed-out visitors are sent to /login?next=/go/leads by proxy.ts and come back here.
export async function GET(req: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.redirect(new URL("/login?app=leads", req.url));
  try {
    return NextResponse.redirect(await handoffUrl(user, "leads", req.nextUrl.searchParams.get("next") ?? "/", cloudOrigin(req)));
  } catch (e) {
    const url = new URL("/", req.url);
    url.searchParams.set("switch_error", e instanceof Error ? e.message : "Couldn't open TOSS Lead Hunter.");
    return NextResponse.redirect(url);
  }
}
