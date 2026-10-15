"use server";

import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";

export type PwState = { error?: string };

export async function setPassword(_prev: PwState, form: FormData): Promise<PwState> {
  const password = String(form.get("password") ?? "");
  if (password.length < 12) return { error: "Use at least 12 characters." };
  if (password !== form.get("confirm")) return { error: "The passwords don't match." };
  const sb = await supabaseServer();
  const { data } = await sb.auth.getClaims();
  if (!data?.claims) return { error: "This link has expired. Ask for a new invite or reset link." };
  const { error } = await sb.auth.updateUser({ password });
  if (error) return { error: error.message };
  redirect("/");
}
