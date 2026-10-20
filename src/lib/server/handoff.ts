import "server-only";
import { adminClient, AdminError } from "./admin";
import { safeNext } from "@/lib/links";

// Moving a signed-in person between TOSS Cloud and TOSS Lead Hunter without a second sign-in.
// The two sites are different domains, so they can't share the login cookie. Instead this
// server (the only one with the secret key) makes a one-time sign-in link for the same
// person and sends the browser to the other site's /auth/confirm, which signs them in there.
// The link works once and expires quickly; it's only made for someone already signed in
// (cookie here, or an access token checked with Supabase) who has access to the target.

export type Product = "cloud" | "leads";

export const LEADS_URL = (process.env.NEXT_PUBLIC_LEADS_URL || "https://tossleadhunter.tech").replace(/\/+$/, "");

/** Does this person have access to the product? (Checked with the secret key.) */
async function hasAccess(userId: string, target: Product) {
  const a = adminClient();
  const q =
    target === "cloud"
      ? a.from("tms_members").select("user_id").eq("user_id", userId).limit(1)
      : a.from("workspace_members").select("user_id").eq("user_id", userId).limit(1);
  const { data, error } = await q;
  if (error) throw new AdminError("Couldn't check access. Try again.", 502);
  return (data?.length ?? 0) > 0;
}

/**
 * The address that signs `user` in on `target` and opens `next` there.
 * `cloudOrigin` is this site's own address (works on localhost too).
 */
export async function handoffUrl(user: { id: string; email: string | null }, target: Product, next: unknown, cloudOrigin: string) {
  if (!user.email) throw new AdminError("This login has no email.", 400);
  if (!(await hasAccess(user.id, target))) {
    throw new AdminError(`This login doesn't have ${target === "cloud" ? "TOSS Cloud" : "TOSS Lead Hunter"} access. Ask a TOSS admin to turn it on.`, 403);
  }
  const { data, error } = await adminClient().auth.admin.generateLink({ type: "magiclink", email: user.email });
  const hash = data?.properties?.hashed_token;
  if (error || !hash) throw new AdminError("Couldn't open the other app. Try again.", 502);
  const base = target === "cloud" ? cloudOrigin.replace(/\/+$/, "") : LEADS_URL;
  const url = new URL("/auth/confirm", base);
  url.searchParams.set("token_hash", hash);
  url.searchParams.set("type", data.properties.verification_type || "magiclink");
  url.searchParams.set("next", safeNext(next));
  url.searchParams.set("sw", "1"); // play the arrival transition
  return url.toString();
}

/** This site's own address, as the browser sees it (tosscloud.tech, a preview URL or localhost). */
export const cloudOrigin = (req: Request) => new URL(req.url).origin;
