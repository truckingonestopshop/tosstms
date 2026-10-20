"use client";

import { use, useActionState, useEffect, useState } from "react";
import { EmailLinkSession } from "@/components/auth/EmailLinkSession";
import { AuthShell, authButton, authInput, authLabel, authLabelText } from "@/components/auth/AuthShell";
import { APP_NAME, useAppLeave, type AppKey } from "@/components/auth/AppSwitch";
import { sendReset, signIn, type AuthState } from "./actions";

// The one sign-in page for both TOSS products. TOSS Cloud opens here; TOSS Lead Hunter
// (another site) opens through a one-time link made after the password is checked.
export default function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = use(searchParams);
  const next = typeof params.next === "string" ? params.next : "/";
  const linkError = params.error === "link";
  const startApp: AppKey = params.app === "leads" || next.startsWith("/go/leads") ? "leads" : "cloud";
  const [app, setApp] = useState<AppKey>(startApp);
  const [state, login, pending] = useActionState<AuthState, FormData>(signIn, {});
  const [reset, resetAction, resetting] = useActionState<AuthState, FormData>(sendReset, {});
  const { go, curtain, leaving } = useAppLeave();

  // Signed in, Lead Hunter chosen: the action answers with the one-time link.
  useEffect(() => {
    if (state.go) go("leads", state.go);
  }, [state.go]); // eslint-disable-line react-hooks/exhaustive-deps

  const choose = (k: string) => {
    const a = k === "leads" ? "leads" : "cloud";
    setApp(a);
    const url = new URL(window.location.href);
    if (a === "leads") url.searchParams.set("app", "leads");
    else url.searchParams.delete("app");
    history.replaceState(null, "", url);
  };

  return (
    <AuthShell app={app} onApp={choose}>
      <EmailLinkSession />
      <form action={login} className="space-y-5">
        {/* the page asked for belongs to the app the visitor came for */}
        <input type="hidden" name="next" value={app === startApp ? next : "/"} />
        <input type="hidden" name="app" value={app} />
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.03em]">
            Sign in{" "}
            <span key={app} className="inline-block text-zinc-400 [animation:rise_420ms_cubic-bezier(.22,.8,.2,1)]">
              to {APP_NAME[app]}
            </span>
          </h1>
          <p className="mt-1.5 text-sm text-zinc-400">Use the account your admin invited. Same login for both apps.</p>
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
        <button disabled={pending || !!leaving} className={authButton}>
          {pending || leaving ? "Signing in…" : "Sign in"}
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
      {curtain}
    </AuthShell>
  );
}
