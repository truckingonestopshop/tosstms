"use server";

import { supabaseServer } from "@/lib/supabase/server";

/** done: saved; the page opens the app with a full page load (Lead Hunter-only people are sent on). */
export type PwState = { error?: string; done?: boolean };

export async function setPassword(_prev: PwState, form: FormData): Promise<PwState> {
  const password = String(form.get("password") ?? "");
  if (password.length < 12) return { error: "Use at least 12 characters." };
  if (password !== form.get("confirm")) return { error: "The passwords don't match." };
  const sb = await supabaseServer();
  const { data } = await sb.auth.getClaims();
  if (!data?.claims) return { error: "This link has expired. Ask for a new invite or reset link." };
  const { error } = await sb.auth.updateUser({ password });
  if (error) return { error: error.message };
  return { done: true };
}
