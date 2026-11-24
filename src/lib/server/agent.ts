import "server-only";
import { adminClient } from "@/lib/server/admin";
import { requireMember } from "@/lib/supabase/server";

/**
 * The company's main Kixie account: everyone in TOSS calls and texts through this Kixie user,
 * whoever is signed in. Set by owners in Inbox → Phone setup (tms_settings.kixie_main_email);
 * KIXIE_DEFAULT_EMAIL on the server is the fallback. Empty = each member's own Kixie login.
 */
export async function mainKixie(): Promise<{ texts: string; calls: string }> {
  const { data } = await adminClient().from("tms_settings").select("kixie_main_email, kixie_call_email").eq("id", 1).maybeSingle();
  const texts = ((data?.kixie_main_email as string | null) || process.env.KIXIE_DEFAULT_EMAIL || "").trim().toLowerCase();
  // calls can ring a different Kixie user (the one whose Kixie app is open); empty = same as texts
  const calls = ((data?.kixie_call_email as string | null) || "").trim().toLowerCase() || texts;
  return { texts, calls };
}

/**
 * The signed-in TOSS member and the Kixie users they text and call as: the main Kixie accounts
 * when there are, else their own Kixie login, else their TOSS email.
 */
export async function agent() {
  const me = await requireMember();
  if (!me) return null;
  const [{ data }, main] = await Promise.all([adminClient().from("tms_members").select("kixie_email, full_name").eq("user_id", me.id).maybeSingle(), mainKixie()]);
  const own = ((data?.kixie_email as string | null) || "").trim();
  const fallback = own || me.email || "";
  return {
    ...me,
    fullName: (data?.full_name as string | null) || me.fullName,
    /** texts go out from this Kixie user's number */
    kixieEmail: (main.texts || fallback).trim(),
    /** calls ring this Kixie user's app first */
    callEmail: (main.calls || fallback).trim(),
    ownKixieEmail: own,
    mainKixieEmail: main.texts,
    mainCallEmail: main.calls,
  };
}
