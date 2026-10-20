import "server-only";

// The two products' public addresses (server side).

/** A configured address, unless it's a *.vercel.app one (an old setting): people must land on
 *  the real domain, where their sign-in cookie lives. */
function productUrl(v: string | undefined, fallback: string) {
  const u = (v || "").trim().replace(/\/+$/, "");
  return u && !/\.vercel\.app$/i.test(u) ? u : fallback;
}

/** TOSS Lead Hunter. */
export const LEADS_URL = productUrl(process.env.NEXT_PUBLIC_LEADS_URL, "https://www.tossleadhunter.tech");
