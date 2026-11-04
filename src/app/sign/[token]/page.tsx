"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Download, FileText, Loader2, Lock, Paperclip, ShieldCheck, XCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Checkbox, Input, Textarea } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { cn } from "@/lib/format";
import { evalFormula, fieldProblem, isShown, usDate, type PageSize, type RecipientKind, type SignField, type SignRole } from "@/lib/signing";
import { PdfPages } from "@/components/signing/PdfPages";
import { SignaturePad } from "@/components/signing/SignaturePad";

// TossSign: the page someone opens from their link (no TOSS Cloud login). A code first when one
// is asked (access code or emailed code). Then the document with their fields: signatures,
// initials, names, dates, numbers (some worked out), choices, checkboxes, attachments; fields
// that only show when another answer is picked. Approvers approve, reviewers confirm they read it.

interface View {
  title: string;
  number: number;
  company: string | null;
  name: string;
  status: string;
  signedCopy: boolean;
  sealed: boolean;
  fileUrl: string | null;
  pages: PageSize[];
  roles: SignRole[];
  fields: SignField[];
  values: Record<string, string>;
  message: string | null;
  expiresAt: string | null;
  me: { name: string; role: string | null; kind: RecipientKind; status: string; values: Record<string, string>; myTurn: boolean; inPerson: boolean };
}
type Locked = { locked: { method: "code" | "email"; email: string | null }; title: string; company: string | null; name: string };

const todayUs = () => {
  const d = new Date();
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/${d.getFullYear()}`;
};
const KEY = (t: string) => `tosssign:${t}`;

export default function SignPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [code, setCode] = useState<string>(() => {
    try {
      return sessionStorage.getItem(KEY(token)) || "";
    } catch {
      return "";
    }
  });
  const [view, setView] = useState<View | null>(null);
  const [locked, setLocked] = useState<Locked | null>(null);
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
  const [uploading, setUploading] = useState<string | null>(null);
  const headers = useCallback((extra: Record<string, string> = {}) => ({ ...extra, ...(code ? { "x-sign-code": code } : {}) }), [code]);

  const load = useCallback(() => {
    fetch(`/api/sign/public/${token}`, { headers: headers() })
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw new Error(body.error || "This link isn't valid.");
        if (body.locked) return setLocked(body as Locked);
        const v = body as View;
        setLocked(null);
        // Start from what's prefilled; "today" dates are the signing day.
        const start: Record<string, string> = {};
        for (const f of v.fields.filter((f) => f.role === v.me.role)) {
          const pre = v.me.values[f.id] ?? v.values[f.id];
          start[f.id] = f.type === "date" && f.auto === "today" ? todayUs() : pre || "";
        }
        setValues(start);
        setView(v);
      })
      .catch((e) => setError(e.message));
  }, [token, headers]);
  useEffect(() => {
    load();
  }, [load]);

  // Everything on the page right now (theirs + others'), with formulas worked out.
  const all = useMemo(() => {
    if (!view) return {};
    const v = { ...view.values, ...values };
    for (const f of view.fields) if (f.type === "number" && f.formula) v[f.id] = evalFormula(f.formula, view.fields, v);
    return v;
  }, [view, values]);
  const mine = useMemo(() => (view ? view.fields.filter((f) => f.role === view.me.role && isShown(f, view.fields, all)) : []), [view, all]);
  const problems = mine.map((f) => ({ f, p: fieldProblem(f, all[f.id]) })).filter((x) => x.p);
  const isSigner = view?.me.kind === "signer";
  const canAct = view && view.me.kind !== "cc" && view.status === "sent" && view.me.status !== "signed" && view.me.status !== "declined" && view.me.myTurn && !done;

  const set = (id: string, v: string) => setValues((x) => ({ ...x, [id]: v }));
  const goNext = () => {
    const f = problems[0]?.f;
    if (f) document.getElementById(`f-${f.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  };
  const post = async (body: object) => {
    setBusy(true);
    setProblem("");
    const r = await fetch(`/api/sign/public/${token}`, { method: "POST", headers: headers({ "Content-Type": "application/json" }), body: JSON.stringify(body) });
    const res = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setProblem(res.error || "Something went wrong. Please try again."), null;
    return res;
  };
  const act = async (body: object) => {
    const res = await post(body);
    if (res) {
      setDone(res.status);
      setDeclining(false);
    }
  };
  const attach = async (f: SignField, file: File) => {
    setUploading(f.id);
    const fd = new FormData();
    fd.append("file", file);
    const r = await fetch(`/api/sign/public/${token}/file`, { method: "POST", headers: headers(), body: fd });
    const res = await r.json().catch(() => ({}));
    setUploading(null);
    if (!r.ok) return setProblem(res.error || "The file couldn't be attached");
    set(f.id, JSON.stringify(res));
  };

  if (error)
    return (
      <Shell>
        <Notice icon={<XCircle className="h-10 w-10 text-red-500" />} title={error} body="Ask the person who sent it for a new link." />
      </Shell>
    );
  if (locked) return <CodeGate locked={locked} token={token} onOk={(c) => (sessionStorage.setItem(KEY(token), c), setCode(c))} />;
  if (!view)
    return (
      <Shell>
        <div className="flex items-center justify-center gap-2 py-20 text-sm text-fg-3">
          <Loader2 className="h-4 w-4 animate-spin" /> Opening the document…
        </div>
      </Shell>
    );

  const status = done || (view.me.status === "signed" ? "signed" : view.me.status === "declined" ? "declined" : "");
  const doneWord = view.me.kind === "approver" ? "approved" : view.me.kind === "viewer" ? "reviewed it" : "signed";
  return (
    <Shell>
      <div className="mb-4">
        <div className="text-xs font-semibold uppercase tracking-wider text-fg-4">{view.company || "Trucking One Stop Shop"}</div>
        <h1 className="mt-1 text-xl font-semibold text-fg">{view.title}</h1>
        {view.message && <p className="mt-2 whitespace-pre-line text-sm text-fg-2">{view.message}</p>}
        {canAct && view.me.kind !== "signer" && (
          <p className="mt-2 text-sm text-fg-2">{view.me.kind === "approver" ? "Please review the document, then approve it or decline." : "Please review the document, then confirm you've read it."}</p>
        )}
      </div>

      {status === "completed" || view.signedCopy ? (
        <Notice icon={<ShieldCheck className="h-10 w-10 text-emerald-500" />} title="All done, everyone has finished" body={view.sealed ? "The signed copy is digitally sealed and on its way to your email." : "A signed copy is on its way to your email."} />
      ) : status === "signed" ? (
        <Notice icon={<CheckCircle2 className="h-10 w-10 text-emerald-500" />} title={`Thank you, ${view.me.name.split(" ")[0]}. You ${doneWord}.`} body="When everyone has finished, you'll get the signed copy by email." />
      ) : status === "declined" ? (
        <Notice icon={<XCircle className="h-10 w-10 text-fg-4" />} title="You declined this document" body="Trucking One Stop Shop has been told." />
      ) : view.me.kind === "cc" ? (
        <Notice icon={<FileText className="h-10 w-10 text-fg-4" />} title="You were sent a copy" body="Nothing to do. You'll get the signed copy when it's done." />
      ) : view.status === "expired" ? (
        <Notice icon={<XCircle className="h-10 w-10 text-amber-500" />} title="This document has expired" body="Ask TOSS to send it again." />
      ) : view.status !== "sent" ? (
        <Notice icon={<XCircle className="h-10 w-10 text-fg-4" />} title="This document isn't open anymore" body="Ask TOSS if you need it." />
      ) : !view.me.myTurn ? (
        <Notice icon={<FileText className="h-10 w-10 text-fg-4" />} title="Not your turn yet" body="Someone has to finish before you. You'll get an email when it's your turn." />
      ) : null}

      {view.signedCopy && view.fileUrl && (
        <a href={view.fileUrl} className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-fg hover:underline">
          <Download className="h-4 w-4" /> Download the signed copy
        </a>
      )}

      <div className="scrollbar-bold overflow-x-auto">
        <PdfPages
          src={view.fileUrl}
          pages={view.pages}
          className="min-w-[340px] pb-44"
        overlay={(page) =>
          view.signedCopy ? null : (
            <div className="absolute inset-0">
              {view.fields
                .filter((f) => f.page === page && isShown(f, view.fields, all))
                .map((f) => {
                  const own = !!canAct && isSigner && f.role === view.me.role;
                  return (
                    <FieldBox
                      key={f.id}
                      f={f}
                      v={all[f.id] || ""}
                      own={own && !f.readOnly && !f.formula}
                      missing={own && !!fieldProblem(f, all[f.id])}
                      busy={uploading === f.id}
                      onChange={(x) => set(f.id, x)}
                      onFile={(file) => attach(f, file)}
                      onPad={() => (adopted[f.type as "signature" | "initials"] ? set(f.id, adopted[f.type as "signature" | "initials"]!) : setPad(f))}
                    />
                  );
                })}
            </div>
          )
        }
      />
      </div>

      {canAct && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur" style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}>
          <div className="mx-auto flex max-w-3xl flex-col gap-2 sm:flex-row sm:items-center">
            <div className="flex-1 text-sm text-fg-2">
              {isSigner &&
                (problems.length ? (
                  <button onClick={goNext} className="font-medium text-fg underline-offset-2 hover:underline">
                    {problems.length} field{problems.length === 1 ? "" : "s"} to finish · {problems[0].p}
                  </button>
                ) : (
                  "All your fields are filled."
                ))}
              {isSigner && <Checkbox checked={agree} onChange={setAgree} className="mt-1 flex text-xs" label="I agree to sign this document electronically, and that my electronic signature is as valid as my handwritten one." />}
              {problem && <div className="mt-1 text-xs text-red-600">{problem}</div>}
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setDeclining(true)} disabled={busy}>
                Decline
              </Button>
              {view.me.kind === "signer" && (
                <Button variant="primary" onClick={() => act({ action: "sign", values, agree })} disabled={busy || !!problems.length || !agree}>
                  Finish and sign
                </Button>
              )}
              {view.me.kind === "approver" && (
                <Button variant="primary" onClick={() => act({ action: "approve" })} disabled={busy}>
                  Approve
                </Button>
              )}
              {view.me.kind === "viewer" && (
                <Button variant="primary" onClick={() => act({ action: "reviewed" })} disabled={busy}>
                  I&apos;ve reviewed it
                </Button>
              )}
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
        title={view.me.kind === "approver" ? "Decline to approve?" : "Decline?"}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeclining(false)}>
              Back
            </Button>
            <Button variant="danger" onClick={() => act({ action: "decline", reason })} disabled={busy}>
              Decline
            </Button>
          </>
        }
      >
        <p className="mb-2 text-sm text-fg-2">Trucking One Stop Shop will be told. You can say why (optional).</p>
        <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
      </Modal>
    </Shell>
  );
}

/** Access code / emailed code, before the document opens. */
function CodeGate({ locked, token, onOk }: { locked: Locked; token: string; onOk: (code: string) => void }) {
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const email = locked.locked.method === "email";
  const call = async (body: object) => {
    setBusy(true);
    setMsg("");
    const r = await fetch(`/api/sign/public/${token}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const res = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setMsg(res.error || "Something went wrong"), false;
    return true;
  };
  return (
    <Shell>
      <div className="mx-auto max-w-sm py-10">
        <Lock className="mx-auto mb-3 h-9 w-9 text-fg-3" />
        <h1 className="text-center text-lg font-semibold text-fg">{locked.title}</h1>
        <p className="mt-1 text-center text-sm text-fg-3">
          Hi {locked.name.split(" ")[0]}.{" "}
          {email ? (sent ? `Enter the 6-digit code we emailed to ${locked.locked.email}.` : `To keep it private, we'll email a code to ${locked.locked.email}.`) : "Enter the access code TOSS gave you."}
        </p>
        <div className="mt-5 space-y-2">
          {email && !sent ? (
            <Button variant="primary" className="w-full" disabled={busy} onClick={async () => (await call({ action: "send_code" })) && setSent(true)}>
              Email me the code
            </Button>
          ) : (
            <>
              <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder={email ? "123456" : "Access code"} inputMode={email ? "numeric" : "text"} autoFocus className="text-center text-lg tracking-widest" />
              <Button variant="primary" className="w-full" disabled={busy || !code.trim()} onClick={async () => (await call({ action: "verify", code: code.trim() })) && onOk(code.trim())}>
                Open the document
              </Button>
              {email && (
                <button className="w-full text-xs text-fg-3 hover:text-fg" disabled={busy} onClick={() => call({ action: "send_code" }).then((ok) => ok && setMsg("A new code is on its way."))}>
                  Send a new code
                </button>
              )}
            </>
          )}
          {msg && <p className="text-center text-xs text-red-600">{msg}</p>}
        </div>
      </div>
    </Shell>
  );
}

function FieldBox({
  f,
  v,
  own,
  missing,
  busy,
  onChange,
  onFile,
  onPad,
}: {
  f: SignField;
  v: string;
  own: boolean;
  missing: boolean;
  busy: boolean;
  onChange: (v: string) => void;
  onFile: (file: File) => void;
  onPad: () => void;
}) {
  const style = { left: `${f.x * 100}%`, top: `${f.y * 100}%`, width: `${f.w * 100}%`, height: `${f.h * 100}%` };
  const ring = own ? (missing ? "bg-amber-300/30 ring-2 ring-amber-500" : "bg-sky-300/15 ring-1 ring-sky-500") : "";
  const text = "text-[min(1.6vw,12px)] text-[#0d0d33]";
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
  if (f.type === "attachment") {
    let name = "";
    try {
      name = v ? (JSON.parse(v) as { name: string }).name : "";
    } catch {}
    return (
      <label id={`f-${f.id}`} className={cn("absolute flex cursor-pointer items-center gap-1 overflow-hidden rounded-[3px] px-1", text, ring, !own && "pointer-events-none")} style={style} title={f.label}>
        {busy ? <Loader2 className="h-3 w-3 shrink-0 animate-spin" /> : <Paperclip className="h-3 w-3 shrink-0" />}
        <span className="truncate">{name || (own ? `Attach: ${f.label}` : "")}</span>
        {own && <input type="file" className="hidden" onChange={(e) => (e.target.files?.[0] && onFile(e.target.files[0]), (e.target.value = ""))} />}
      </label>
    );
  }
  if (f.type === "dropdown" && own) {
    return (
      <select id={`f-${f.id}`} value={v} onChange={(e) => onChange(e.target.value)} className={cn("absolute rounded-[2px] border-0 bg-white/70 px-0.5 outline-none", text, ring)} style={style} aria-label={f.label}>
        <option value="">{f.label}…</option>
        {(f.options || []).map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    );
  }
  if (f.type === "radio" && own) {
    return (
      <div id={`f-${f.id}`} role="radiogroup" aria-label={f.label} className={cn("absolute flex flex-col justify-center gap-0.5 overflow-hidden rounded-[3px] bg-white/70 px-1", text, ring)} style={style}>
        {(f.options || []).map((o) => (
          <label key={o} className="flex cursor-pointer items-center gap-1 leading-tight">
            <input type="radio" name={f.id} checked={v === o} onChange={() => onChange(o)} className="h-3 w-3 accent-[#f28c38]" />
            <span className="truncate">{o}</span>
          </label>
        ))}
      </div>
    );
  }
  const shown = f.type === "date" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? usDate(v) : v;
  return own ? (
    <input
      id={`f-${f.id}`}
      value={shown}
      onChange={(e) => onChange(e.target.value)}
      placeholder={f.label}
      inputMode={f.type === "number" ? "decimal" : f.type === "email" ? "email" : undefined}
      className={cn("absolute rounded-[2px] border-0 bg-transparent px-0.5 outline-none placeholder:text-sky-700/60", text, ring)}
      style={style}
      aria-label={f.label}
    />
  ) : (
    <div className={cn("absolute flex items-center overflow-hidden whitespace-nowrap px-0.5", text)} style={style}>
      {shown}
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
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
