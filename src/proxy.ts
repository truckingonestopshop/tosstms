import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Refreshes the Supabase session cookie on every request and sends signed-out users
// to /login. This is an optimistic check only; the app layout, route handlers and
// RLS verify the user again.
export async function proxy(request: NextRequest) {
  // Without these the Supabase client throws on every request and the host shows a bare
  // "Internal Server Error". Say what's missing instead (names only, never values).
  const missing = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"].filter((k) => !process.env[k]);
  if (missing.length) {
    return new NextResponse(`TOSS TMS is not configured: ${missing.join(", ")} missing. Add it in the hosting settings and redeploy.`, {
      status: 503,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
  let response = NextResponse.next({ request });
  const sb = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list) => {
          for (const { name, value } of list) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of list) response.cookies.set(name, value, options);
        },
      },
    },
  );
  const { data } = await sb.auth.getClaims();
  const path = request.nextUrl.pathname;
  const preview = process.env.NODE_ENV === "development" && request.cookies.get("tms_ui_preview")?.value === "1";
  const isPublic = path.startsWith("/login") || path.startsWith("/auth/") || path.startsWith("/preview-ui") || preview;
  if (!data?.claims && !isPublic) {
    if (path.startsWith("/api/")) {
      return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    if (path !== "/") url.searchParams.set("next", path + request.nextUrl.search);
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|fonts/|brand/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|otf|woff2?)$).*)"],
};
