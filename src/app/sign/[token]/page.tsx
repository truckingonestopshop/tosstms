"use client";

import { use, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Download, FileText, XCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Checkbox, Textarea } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { cn } from "@/lib/format";
import { isEmpty, usDate, type PageSize, type SignField, type SignRole } from "@/lib/signing";
import { PdfPages } from "@/components/signing/PdfPages";
import { SignaturePad } from "@/components/signing/SignaturePad";

// The page a signer opens from their link (no TOSS Cloud login). Shows the document with their
// fields to fill (signature, initials, date, text, checkboxes); TOSS's values and earlier signers'
// are already on it. Finish signs; Decline says no (with a reason).

interface View {
  title: string;
  number: number;
  company: string | null;
  status: string;
  signedCopy: boolean;
  fileUrl: string | null;
  pages: PageSize[];
  roles: SignRole[];
  fields: SignField[];
  values: Record<string, string>;
  message: string | null;
  expiresAt: string | null;
  me: { name: string; role: string | null; kind: string; status: string; values: Record<string, string>; myTurn: boolean };
}

const today = () => {
  const d = new Date();
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/${d.getFullYear()}`;
};

export default function SignPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [view, setView] = useState<View | null>(null);
  const [error, setError] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [pad, setPad] = useState<SignField | null>(null);
  const [adopted, setAdopted] = useState<{ signature?: string; initials?: string }>({});
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");
  const [done, setDone] = useState<"" | "signed" | "completed" | "declined">("");

  useEffect(() => {
    fetch(`/api/sign/public/${token}`)
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw new Error(body.error || "This link isn't valid.");
        const v = body as View;
        // Start from what's prefilled; dates of the signing day are today.
        const start: Record<string, string> = {};
        for (const f of v.fields.filter((f) => f.role === v.me.role)) {
          const pre = v.me.values[f.id] ?? v.values[f.id];
          start[f.id] = f.type === "date" && f.auto === "today" ? today() : pre || "";
        }
        setValues(start);
        setView(v);
      })
      .catch((e) => setError(e.message));
  }, [token]);

  const mine = useMemo(() => (view ? view.fields.filter((f) => f.role === view.me.role) : []), [view]);
  const left = mine.filter((f) => f.required && isEmpty(f, values[f.id]));
  const canSign = view && view.me.kind === "signer" && view.status === "sent" && view.me.status !== "signed" && view.me.status !== "declined" && view.me.myTurn && !done;

  const set = (id: string, v: string) => setValues((x) => ({ ...x, [id]: v }));
  const goNext = () => {
    const f = left[0];
    if (f) document.getElementById(`f-${f.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  };
  const submit = async (body: object) => {
    setBusy(true);
    setProblem("");
    const r = await fetch(`/api/sign/public/${token}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const res = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setProblem(res.error || "Something went wrong. Please try again.");
    setDone(res.status);
    setDeclining(false);
  };

  if (error)
    return (
      <Shell>
        <Notice icon={<XCircle className="h-10 w-10 text-red-500" />} title={error} body="Ask the person who sent it for a new link." />
      </Shell>
    );
  if (!view) return <Shell>{<div className="py-20 text-center text-sm text-fg-3">Opening the document…</div>}</Shell>;

  const status = done || (view.me.status === "signed" ? "signed" : view.me.status === "declined" ? "declined" : "");
  return (
    <Shell>
      <div className="mb-4">
        <div className="text-xs font-semibold uppercase tracking-wider text-fg-4">{view.company || "TOSS · Trucking One Stop Shop"}</div>
        <h1 className="mt-1 text-xl font-semibold text-fg">{view.title}</h1>
        {view.message && <p className="mt-2 whitespace-pre-line text-sm text-fg-2">{view.message}</p>}
      </div>

      {status === "completed" || view.signedCopy ? (
        <Notice icon={<CheckCircle2 className="h-10 w-10 text-emerald-500" />} title="All done, everyone has signed" body="A signed copy is on its way to your email." />
      ) : status === "signed" ? (
        <Notice icon={<CheckCircle2 className="h-10 w-10 text-emerald-500" />} title={`Thank you, ${view.me.name.split(" ")[0]}. You signed.`} body="When everyone has signed, you'll get the signed copy by email." />
      ) : status === "declined" ? (
        <Notice icon={<XCircle className="h-10 w-10 text-fg-4" />} title="You declined this document" body="TOSS has been told." />
      ) : view.me.kind === "cc" ? (
        <Notice icon={<FileText className="h-10 w-10 text-fg-4" />} title="You were sent a copy" body="Nothing to sign. You'll get the signed copy when it's done." />
      ) : view.status === "expired" ? (
        <Notice icon={<XCircle className="h-10 w-10 text-amber-500" />} title="This document has expired" body="Ask TOSS to send it again." />
      ) : view.status !== "sent" ? (
        <Notice icon={<XCircle className="h-10 w-10 text-fg-4" />} title="This document isn't open for signing anymore" body="Ask TOSS if you need it." />
      ) : !view.me.myTurn ? (
        <Notice icon={<FileText className="h-10 w-10 text-fg-4" />} title="Not your turn yet" body="Someone has to sign before you. You'll get an email when it's your turn." />
      ) : null}

      {view.signedCopy && view.fileUrl && (
        <a href={view.fileUrl} className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-fg hover:underline">
          <Download className="h-4 w-4" /> Download the signed copy
        </a>
      )}

      <PdfPages
        src={view.fileUrl}
        pages={view.pages}
        className="pb-40"
        overlay={(page) =>
          view.signedCopy ? null : (
            <div className="absolute inset-0">
              {view.fields
                .filter((f) => f.page === page)
                .map((f) => {
                  const own = canSign && f.role === view.me.role;
                  const v = own ? values[f.id] : view.values[f.id];
                  return <FieldBox key={f.id} f={f} v={v || ""} own={!!own} missing={!!own && f.required && isEmpty(f, values[f.id])} onChange={(x) => set(f.id, x)} onPad={() => (adopted[f.type as "signature" | "initials"] ? set(f.id, adopted[f.type as "signature" | "initials"]!) : setPad(f))} />;
                })}
            </div>
          )
        }
      />

      {canSign && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur" style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}>
          <div className="mx-auto flex max-w-3xl flex-col gap-2 sm:flex-row sm:items-center">
            <div className="flex-1 text-sm text-fg-2">
              {left.length ? (
                <button onClick={goNext} className="font-medium text-fg underline-offset-2 hover:underline">
                  {left.length} required field{left.length === 1 ? "" : "s"} left · go to next
                </button>
              ) : (
                "All your fields are filled."
              )}
              <Checkbox checked={agree} onChange={setAgree} className="mt-1 flex text-xs" label="I agree to sign this document electronically, and that my electronic signature is as valid as my handwritten one." />
              {problem && <div className="mt-1 text-xs text-red-600">{problem}</div>}
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setDeclining(true)} disabled={busy}>
                Decline
              </Button>
              <Button variant="primary" onClick={() => submit({ action: "sign", values, agree })} disabled={busy || !!left.length || !agree}>
                Finish and sign
              </Button>
            </div>
          </div>
        </div>
      )}

      <SignaturePad
        open={!!pad}
        initials={pad?.type === "initials"}
        name={view.me.name}
        onClose={() => setPad(null)}
        onDone={(png) => {
          if (!pad) return;
          const kind = pad.type as "signature" | "initials";
          setAdopted((a) => ({ ...a, [kind]: png }));
          // Adopted once, it goes on every empty field of the same kind.
          setValues((x) => {
            const next = { ...x, [pad.id]: png };
            for (const f of mine) if (f.type === kind && !next[f.id]) next[f.id] = png;
            return next;
          });
          setPad(null);
        }}
      />
      <Modal
        open={declining}
        onClose={() => setDeclining(false)}
        title="Decline to sign?"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeclining(false)}>
              Back
            </Button>
            <Button variant="danger" onClick={() => submit({ action: "decline", reason })} disabled={busy}>
              Decline
            </Button>
          </>
        }
      >
        <p className="mb-2 text-sm text-fg-2">TOSS will be told. You can say why (optional).</p>
        <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
      </Modal>
    </Shell>
  );
}

function FieldBox({ f, v, own, missing, onChange, onPad }: { f: SignField; v: string; own: boolean; missing: boolean; onChange: (v: string) => void; onPad: () => void }) {
  const style = { left: `${f.x * 100}%`, top: `${f.y * 100}%`, width: `${f.w * 100}%`, height: `${f.h * 100}%` };
  const ring = own ? (missing ? "bg-amber-300/30 ring-2 ring-amber-500" : "bg-sky-300/15 ring-1 ring-sky-500") : "";
  if (f.type === "signature" || f.type === "initials") {
    return (
      <button id={`f-${f.id}`} type="button" disabled={!own} onClick={onPad} className={cn("absolute flex items-center justify-center overflow-hidden rounded-[3px]", ring)} style={style} title={f.label}>
        {v.startsWith("data:image") ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={v} alt={f.label} className="max-h-full max-w-full object-contain" />
        ) : own ? (
          <span className="text-[10px] font-semibold text-sky-800 sm:text-xs">{f.type === "signature" ? "Sign here" : "Initial"}</span>
        ) : null}
      </button>
    );
  }
  if (f.type === "checkbox") {
    return (
      <button id={`f-${f.id}`} type="button" disabled={!own} onClick={() => onChange(v === "true" ? "" : "true")} className={cn("absolute flex items-center justify-center rounded-[2px] border border-zinc-500 bg-white/70 text-zinc-900", ring)} style={style} title={f.label} aria-pressed={v === "true"}>
        {v === "true" && <span className="text-[min(2.2vw,14px)] font-bold leading-none">✕</span>}
      </button>
    );
  }
  const shown = f.type === "date" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? usDate(v) : v;
  return own ? (
    <input
      id={`f-${f.id}`}
      value={shown}
      onChange={(e) => onChange(e.target.value)}
      placeholder={f.label}
      className={cn("absolute rounded-[2px] border-0 bg-transparent px-0.5 text-[min(1.6vw,12px)] text-[#0d0d33] outline-none placeholder:text-sky-700/60", ring)}
      style={style}
      aria-label={f.label}
    />
  ) : (
    <div className="absolute flex items-center overflow-hidden whitespace-nowrap px-0.5 text-[min(1.6vw,12px)] text-[#0d0d33]" style={style}>
      {shown}
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-bg">
      <header className="border-b border-line bg-surface px-4 py-3">
        <div className="mx-auto flex max-w-3xl items-center gap-2 text-sm font-semibold text-fg">
          <span className="rounded bg-[#F28C38] px-1.5 py-0.5 text-xs font-bold text-black">TOSS</span> Document signing
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-5">{children}</main>
    </div>
  );
}

function Notice({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="mb-5 flex items-center gap-3 rounded-xl border border-line bg-surface p-4">
      {icon}
      <div>
        <div className="font-semibold text-fg">{title}</div>
        <div className="text-sm text-fg-3">{body}</div>
      </div>
    </div>
  );
}
