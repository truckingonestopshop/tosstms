import type { Metadata } from "next";
import { AuthShell, authButton } from "@/components/auth/AuthShell";

export const metadata: Metadata = { title: "Continue" };

// Step between an email link and signing in (see app/auth/confirm/route.ts): the one-time
// code is only used when the person presses Continue, not when a mail scanner opens the link.

const COPY: Record<string, { title: string; body: string; button: string }> = {
  invite: { title: "Welcome to TOSS", body: "Accept your invite, then choose a password for your TOSS account.", button: "Accept invite" },
  recovery: { title: "Reset your password", body: "Continue to choose a new password for your TOSS account.", button: "Continue" },
  magiclink: { title: "Sign in to TOSS", body: "Continue to sign in to your TOSS account.", button: "Sign in" },
  email: { title: "Sign in to TOSS", body: "Continue to sign in to your TOSS account.", button: "Sign in" },
  email_change: { title: "Confirm your new email", body: "Continue to confirm the new email address for your TOSS account.", button: "Confirm email" },
  signup: { title: "Confirm your email", body: "Continue to confirm your email and finish setting up TOSS.", button: "Confirm email" },
};

export default async function ContinuePage({ searchParams }: PageProps<"/auth/continue">) {
  const p = await searchParams;
  const one = (k: string) => (typeof p[k] === "string" ? (p[k] as string) : "");
  const tokenHash = one("token_hash");
  const type = one("type");
  const copy = COPY[type];

  return (
    <AuthShell>
      {tokenHash && copy ? (
        <form method="post" action="/auth/confirm" className="space-y-5">
          <input type="hidden" name="token_hash" value={tokenHash} />
          <input type="hidden" name="type" value={type} />
          <input type="hidden" name="next" value={one("next") || "/"} />
          <div>
            <h1 className="text-2xl font-semibold tracking-[-0.03em]">{copy.title}</h1>
            <p className="mt-1.5 text-sm text-zinc-400">{copy.body}</p>
          </div>
          <button className={authButton}>{copy.button}</button>
          <p className="text-center text-xs text-zinc-500">The link works once. If it has expired, ask your TOSS admin for a new one.</p>
        </form>
      ) : (
        <div className="space-y-3">
          <h1 className="text-2xl font-semibold tracking-[-0.03em]">This link isn&apos;t complete</h1>
          <p className="text-sm text-zinc-400">Open the button in the email again, or ask your TOSS admin for a new link.</p>
          <a href="/login" className="inline-block text-sm text-zinc-300 underline underline-offset-2 hover:text-white">
            Go to sign in
          </a>
        </div>
      )}
    </AuthShell>
  );
}
