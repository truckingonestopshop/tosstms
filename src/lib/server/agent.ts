import "server-only";
import { adminClient } from "@/lib/server/admin";
import { requireMember } from "@/lib/supabase/server";

/**
 * The company's main Kixie account: everyone in TOSS calls and texts through this Kixie user,
 * whoever is signed in. Set by owners in Inbox → Phone setup (tms_settings.kixie_main_email);
 * KIXIE_DEFAULT_EMAIL on the server is the fallback. Empty = each member's own Kixie login.
 */
export async function mainKixieEmail(): Promise<string> {
  const { data } = await adminClient().from("tms_settings").select("kixie_main_email").eq("id", 1).maybeSingle();
  return ((data?.kixie_main_email as string | null) || process.env.KIXIE_DEFAULT_EMAIL || "").trim().toLowerCase();
}

/**
 * The signed-in TOSS member and the Kixie login they call and text as: the main Kixie account
 * when there is one, else their own Kixie login, else their TOSS email.
 */
export async function agent() {
  const me = await requireMember();
  if (!me) return null;
  const [{ data }, main] = await Promise.all([adminClient().from("tms_members").select("kixie_email, full_name").eq("user_id", me.id).maybeSingle(), mainKixieEmail()]);
  const own = ((data?.kixie_email as string | null) || "").trim();
  const kixieEmail = (main || own || me.email || "").trim();
  return { ...me, fullName: (data?.full_name as string | null) || me.fullName, kixieEmail, ownKixieEmail: own, mainKixieEmail: main };
}
