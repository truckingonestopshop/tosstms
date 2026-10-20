import { LogoMark } from "@/components/brand/Logo";
import { signOut } from "@/app/login/actions";

export function NoAccess({ email }: { email: string }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-bg px-4">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-surface p-7 text-center">
        <LogoMark className="mx-auto h-8 w-auto text-fg" />
        <h1 className="mt-6 text-lg font-semibold text-fg">No access to TOSS Cloud yet</h1>
        <p className="mt-2 text-sm leading-relaxed text-fg-3">
          You&apos;re signed in as <span className="font-semibold text-fg-2">{email}</span>, but this account isn&apos;t on the
          dispatch team. Ask an owner to add you in Settings → Team.
        </p>
        <form action={signOut} className="mt-6">
          <button className="h-9 w-full rounded-lg border border-line-strong text-sm font-semibold text-fg hover:bg-surface-2">Sign out</button>
        </form>
      </div>
    </div>
  );
}
