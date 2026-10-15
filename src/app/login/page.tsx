"use client";

import { use, useActionState } from "react";
import { EmailLinkSession } from "@/components/auth/EmailLinkSession";
import { AuthShell, authButton, authInput, authLabel, authLabelText } from "@/components/auth/AuthShell";
import { sendReset, signIn, type AuthState } from "./actions";

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = use(searchParams);
  const next = params.next;
  const linkError = params.error === "link";
  const [state, login, pending] = useActionState<AuthState, FormData>(signIn, {});
  const [reset, resetAction, resetting] = useActionState<AuthState, FormData>(sendReset, {});
  return (
    <AuthShell>
      <EmailLinkSession />
      <form action={login} className="space-y-5">
        <input type="hidden" name="next" value={typeof next === "string" ? next : "/"} />
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.03em]">Sign in</h1>
          <p className="mt-1.5 text-sm text-zinc-400">Use the account your admin invited.</p>
        </div>
        <label className={authLabel}>
          <span className={authLabelText}>Email</span>
          <input name="email" type="email" autoComplete="email" required placeholder="name@company.com" className={authInput} />
        </label>
        <label className={authLabel}>
          <span className={authLabelText}>Password</span>
          <input name="password" type="password" autoComplete="current-password" required className={authInput} />
        </label>
        {linkError && <p className="text-sm text-red-400">That link expired or was already used. Request a new one.</p>}
        {state.error && <p className="text-sm text-red-400">{state.error}</p>}
        {reset.error && <p className="text-sm text-red-400">{reset.error}</p>}
        {reset.info && <p className="text-sm text-zinc-300">{reset.info}</p>}
        <button disabled={pending} className={authButton}>
          {pending ? "Signing in…" : "Sign in"}
        </button>
        <button
          formAction={resetAction}
          formNoValidate
          disabled={resetting}
          className="w-full text-center text-xs text-zinc-400 underline underline-offset-2 hover:text-white"
        >
          Forgot password? Email me a reset link
        </button>
      </form>
    </AuthShell>
  );
}
