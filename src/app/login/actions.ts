"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { safeNext } from "@/lib/links";
import { supabaseServer } from "@/lib/supabase/server";

export type AuthState = { error?: string; info?: string };

export async function signIn(_prev: AuthState, form: FormData): Promise<AuthState> {
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");
  if (!email || !password) return { error: "Enter your email and password." };
  const sb = await supabaseServer();
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) {
    console.warn(`[login] sign-in failed: ${error.status ?? ""} ${error.code ?? ""} ${error.message}`);
    if (!error.status || error.status >= 500) return { error: "Can't reach the sign-in service right now. Try again in a moment." };
    if (error.code === "email_not_confirmed") return { error: "This email isn't confirmed yet. Use the invite link first." };
    return { error: "Wrong email or password." };
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
  await sb.auth.signOut();
  redirect("/login");
}
