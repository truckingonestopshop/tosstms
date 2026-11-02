"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FileSignature, Loader2, ShieldCheck, XCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";

// TossSign public link: the visitor says who they are, then signs their own copy (/sign/<token>).

export default function PublicLinkPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const router = useRouter();
  const [info, setInfo] = useState<{ title: string; company: string | null; verifyEmail: boolean } | null>(null);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");

  useEffect(() => {
    fetch(`/api/sign/link/${token}`)
      .then(async (r) => {
        const b = await r.json();
        if (!r.ok) throw new Error(b.error || "This link isn't available.");
        setInfo(b);
      })
      .catch((e) => setError(e.message));
  }, [token]);

  const start = async () => {
    setBusy(true);
    setProblem("");
    const r = await fetch(`/api/sign/link/${token}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, email, phone }) });
    const b = await r.json().catch(() => ({}));
    if (!r.ok) {
      setBusy(false);
      return setProblem(b.error || "Something went wrong");
    }
    router.push(`/sign/${b.token}`);
  };

  return (
    <div className="min-h-dvh bg-bg">
      <header className="border-b border-line bg-surface px-4 py-3">
        <div className="mx-auto flex max-w-3xl items-center gap-2 text-sm font-semibold text-fg">
          <span className="rounded bg-[#F28C38] px-1.5 py-0.5 text-xs font-bold text-black">TOSS</span> TossSign
          <span className="ml-auto inline-flex items-center gap-1 text-xs font-normal text-fg-3">
            <ShieldCheck className="h-3.5 w-3.5" /> Secure, sealed signing
          </span>
        </div>
      </header>
      <main className="mx-auto max-w-md px-4 py-10">
        {error ? (
          <div className="flex items-center gap-3 rounded-xl border border-line bg-surface p-4">
            <XCircle className="h-9 w-9 text-red-500" />
            <div className="font-semibold text-fg">{error}</div>
          </div>
        ) : !info ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-fg-3">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          <div className="rounded-2xl border border-line bg-surface p-5">
            <FileSignature className="mb-3 h-8 w-8 text-fg-3" />
            <div className="text-xs font-semibold uppercase tracking-wider text-fg-4">{info.company || "Trucking One Stop Shop"}</div>
            <h1 className="mt-1 text-lg font-semibold text-fg">{info.title}</h1>
            <p className="mt-1 text-sm text-fg-3">Tell us who you are, then fill in and sign the document. You&apos;ll get the signed copy by email.</p>
            <div className="mt-4 space-y-3">
              <Field label="Full name" required>
                <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" autoFocus />
              </Field>
              <Field label="Email" required hint={info.verifyEmail ? "We'll email you a code to confirm it" : undefined}>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
              </Field>
              <Field label="Phone">
                <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" />
              </Field>
              {problem && <p className="text-xs text-red-600">{problem}</p>}
              <Button variant="primary" className="w-full" onClick={start} disabled={busy || !name.trim() || !email.trim()}>
                Continue
              </Button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
