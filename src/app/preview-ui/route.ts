import { NextResponse, type NextRequest } from "next/server";
import { PREVIEW_COOKIE, PREVIEW_VIEW_COOKIE, previewAllowed } from "@/lib/preview";

/** Dev only: /preview-ui turns the sample-data preview on, /preview-ui?off turns it off; ?office / ?dispatch pick the view. */
export function GET(req: NextRequest) {
  if (!previewAllowed()) return new NextResponse("Not found", { status: 404 });
  const off = req.nextUrl.searchParams.has("off");
  const res = NextResponse.redirect(new URL(off ? "/login" : "/", req.url));
  if (off) res.cookies.delete(PREVIEW_COOKIE);
  else res.cookies.set(PREVIEW_COOKIE, "1", { path: "/", httpOnly: true, sameSite: "lax" });
  const view = req.nextUrl.searchParams.has("office") ? "office" : req.nextUrl.searchParams.has("dispatch") ? "dispatch" : null;
  if (view) res.cookies.set(PREVIEW_VIEW_COOKIE, view, { path: "/", httpOnly: true, sameSite: "lax" });
  return res;
}
