"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { safeNext } from "@/lib/links";
import { supabaseServer } from "@/lib/supabase/server";
import { handoffUrl } from "@/lib/server/handoff";

/** go: one-time link that opens TOSS Lead Hunter signed in (the page plays the transition first). */
export type AuthState = { error?: string; info?: string; go?: string };

export async function signIn(_prev: AuthState, form: FormData): Promise<AuthState> {
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");
  if (!email || !password) return { error: "Enter your email and password." };
  const sb = await supabaseServer();
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) {
    console.warn(`[login] sign-in failed: ${error.status ?? ""} ${error.code ?? ""} ${error.message}`);
    if (!error.status || error.status >= 500) return { error: "Can't reach the sign-in service right now. Try again in a moment." };
    if (error.code === "email_not_confirmed") return { error: "This email isn't confirmed yet. Use the invite link first." };
    return { error: "Wrong email or password." };
  }
  if (form.get("app") === "leads") {
    // Signed in here too, so switching back to TOSS Cloud later needs no second sign-in.
    let next = String(form.get("next") ?? "/");
    if (next.startsWith("/go/leads")) next = new URL(next, "http://x").searchParams.get("next") ?? "/";
    try {
      const h = await headers();
      const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
      return { go: await handoffUrl({ id: data.user.id, email: data.user.email ?? email }, "leads", next, origin) };
    } catch (e) {
      return { error: e instanceof Error ? e.message : "Couldn't open TOSS Lead Hunter. Try again." };
    }
  }
  redirect(safeNext(form.get("next")));
}

export async function sendReset(_prev: AuthState, form: FormData): Promise<AuthState> {
  const email = String(form.get("email") ?? "").trim();
  if (!email) return { error: "Enter your email first." };
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  const sb = await supabaseServer();
  await sb.auth.resetPasswordForEmail(email, { redirectTo: `${origin}/auth/confirm?next=/set-password` });
  return { info: "If that email has an account, a reset link is on its way." };
}

export async function signOut() {
  const sb = await supabaseServer();
  // global: also ends the TOSS Lead Hunter session (same login) instead of leaving it open there.
  await sb.auth.signOut({ scope: "global" });
  redirect("/login");
}
