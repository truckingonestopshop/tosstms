"use client";

import { useActionState } from "react";
import { AuthShell, authButton, authInput, authLabel, authLabelText } from "@/components/auth/AuthShell";
import { setPassword, type PwState } from "./actions";

export default function SetPasswordPage() {
  const [state, action, pending] = useActionState<PwState, FormData>(setPassword, {});
  return (
    <AuthShell>
      <form action={action} className="space-y-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.03em]">Set your password</h1>
          <p className="mt-1.5 text-sm text-zinc-400">At least 12 characters.</p>
        </div>
        <label className={authLabel}>
          <span className={authLabelText}>New password</span>
          <input name="password" type="password" autoComplete="new-password" minLength={12} required className={authInput} />
        </label>
        <label className={authLabel}>
          <span className={authLabelText}>Repeat password</span>
          <input name="confirm" type="password" autoComplete="new-password" minLength={12} required className={authInput} />
        </label>
        {state.error && <p className="text-sm text-red-400">{state.error}</p>}
        <button disabled={pending} className={authButton}>
          {pending ? "Saving…" : "Save and continue"}
        </button>
      </form>
    </AuthShell>
  );
}
