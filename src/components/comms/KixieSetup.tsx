"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, CircleAlert, Link2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/format";

interface Status {
  kixie: boolean;
  email: boolean;
  kixieEmail: string;
  owner: boolean;
  webhookUrl: string;
  lookupUrl: string;
  hooks: { event: string; location: string; ok: boolean }[];
  hooksError: string | null;
}

const EVENT_LABEL: Record<string, string> = {
  endcall: "Call ended (length, recording)",
  disposition: "Call outcome",
  SMS: "Texts in and out",
  answeredcall: "Call answered",
  voicemail: "Voicemail",
};

/** Settings → Phone & Inbox: my Kixie login, and (owners) connecting Kixie's webhooks to TOSS. */
export function KixieSetup({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [s, setS] = useState<Status | null>(null);
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [connecting, setConnecting] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/kixie/setup");
    const j = (await res.json().catch(() => null)) as Status | null;
    if (j && res.ok) {
      setS(j);
      setEmail(j.kixieEmail);
    }
  }, []);
  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const save = async () => {
    setSaving(true);
    const res = await fetch("/api/kixie/setup", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kixieEmail: email }) });
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    setSaving(false);
    if (!res.ok) return toast.error(j.error || "Couldn't save");
    toast.success("Saved");
    load();
  };

  const connect = async () => {
    setConnecting(true);
    const res = await fetch("/api/kixie/setup", { method: "POST" });
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    setConnecting(false);
    if (!res.ok) return toast.error(j.error || "Couldn't connect");
    toast.success("Kixie is connected to TOSS");
    load();
  };

  const allOk = !!s?.hooks.length && s.hooks.every((h) => h.ok);

  return (
    <Modal open={open} onClose={onClose} title="Phone & Inbox" subtitle="Calls and texts through Kixie, emails through TOSS." size="lg">
      {!s ? (
        <div className="py-8 text-center text-[13px] text-fg-3">Loading…</div>
      ) : (
        <div className="space-y-5">
          <div className="grid gap-2 sm:grid-cols-2">
            <Check ok={s.kixie} label="Kixie" detail={s.kixie ? "API key and Business ID are set" : "Add KIXIE_API_KEY and KIXIE_BUSINESS_ID on the server"} />
            <Check ok={s.email} label="Email" detail={s.email ? "Emails go out through Resend" : "Add RESEND_API_KEY on the server"} />
          </div>

          <Field label="Your Kixie login email" hint="Kixie rings this user's app or phone when you press Call, and texts from their number. Leave empty to use your TOSS email.">
            <div className="flex gap-2">
              <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" type="email" />
              <Button onClick={save} loading={saving}>
                Save
              </Button>
            </div>
          </Field>

          <div className="rounded-xl border border-line p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-[13px] font-semibold text-fg">Kixie → TOSS</div>
                <div className="text-[12px] text-fg-3">Kixie tells TOSS about every call, call outcome and text, so they show in the Inbox and on the carrier.</div>
              </div>
              {s.owner && s.kixie && (
                <Button size="sm" variant={allOk ? "outline" : "primary"} onClick={connect} loading={connecting}>
                  {!connecting && (allOk ? <RefreshCw className="h-3.5 w-3.5" /> : <Link2 className="h-3.5 w-3.5" />)} {allOk ? "Reconnect" : "Connect Kixie"}
                </Button>
              )}
            </div>
            {s.hooksError && <p className="mt-2 text-[12px] text-red-600">{s.hooksError}</p>}
            {s.hooks.length > 0 && (
              <ul className="mt-3 space-y-1.5">
                {s.hooks.map((h) => (
                  <li key={h.event} className="flex items-center gap-2 text-[12px]">
                    {h.ok ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : <CircleAlert className="h-3.5 w-3.5 text-amber-500" />}
                    <span className="text-fg">{EVENT_LABEL[h.event] || h.event}</span>
                    <span className="truncate text-fg-4">{h.ok ? "connected" : h.location ? `points to ${h.location}` : "not connected"}</span>
                  </li>
                ))}
              </ul>
            )}
            {!s.owner && !allOk && <p className="mt-2 text-[12px] text-fg-3">An owner connects Kixie once for everyone.</p>}
            <p className="mt-3 text-[11px] text-fg-4">Webhook address: {s.webhookUrl}</p>
          </div>
        </div>
      )}
    </Modal>
  );
}

function Check({ ok, label, detail }: { ok: boolean; label: string; detail: string }) {
  return (
    <div className={cn("flex items-start gap-2 rounded-xl border p-3", ok ? "border-emerald-500/30 bg-emerald-500/5" : "border-amber-500/30 bg-amber-500/5")}>
      {ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" /> : <CircleAlert className="mt-0.5 h-4 w-4 text-amber-500" />}
      <div>
        <div className="text-[13px] font-semibold text-fg">{label}</div>
        <div className="text-[12px] text-fg-3">{detail}</div>
      </div>
    </div>
  );
}
