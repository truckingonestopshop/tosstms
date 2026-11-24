import "server-only";
import { adminClient } from "@/lib/server/admin";
import { requireMember } from "@/lib/supabase/server";

/**
 * The main Kixie user (KIXIE_DEFAULT_EMAIL): who calls and texts for members without their own
 * Kixie login. Must be a Kixie user on Professional or higher.
 */
export const defaultKixieEmail = () => (process.env.KIXIE_DEFAULT_EMAIL || "").trim().toLowerCase();

/**
 * The signed-in TOSS member and the Kixie login they call and text as: their own Kixie email,
 * else the main Kixie user, else their TOSS email.
 */
export async function agent() {
  const me = await requireMember();
  if (!me) return null;
  const { data } = await adminClient().from("tms_members").select("kixie_email, full_name").eq("user_id", me.id).maybeSingle();
  const kixieEmail = ((data?.kixie_email as string | null) || defaultKixieEmail() || me.email || "").trim();
  return { ...me, fullName: (data?.full_name as string | null) || me.fullName, kixieEmail };
}
