"use client";

import { useState } from "react";
import { Mail, Send } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { ChoiceSelect } from "@/components/fleet/Trailers";
import { POSITIONS } from "@/lib/profile";
import { toast } from "@/lib/toast";
import { AccessEditor, type Access } from "./AccessEditor";
import { api } from "./shared";

/** Invite someone: who they are, which apps, which role. Supabase sends the email. */
export function InviteDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [position, setPosition] = useState("Dispatcher");
  const [phone, setPhone] = useState("");
  const [access, setAccess] = useState<Access>({ tms: "dispatcher", leads: "member", super_admin: false });
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setEmail("");
    setName("");
    setPosition("Dispatcher");
    setPhone("");
    setAccess({ tms: "dispatcher", leads: "member", super_admin: false });
  };

  const apps = [access.tms && "TOSS Cloud", access.leads && "TOSS Lead Hunter"].filter(Boolean).join(" and ");

  const send = async () => {
    if (!email.trim() || !name.trim()) return toast.error("Enter their email and name.");
    if (!access.tms && !access.leads) return toast.error("Turn on at least one app.");
    setBusy(true);
    try {
      await api("/api/admin/users", {
        method: "POST",
        body: JSON.stringify({ email, full_name: name, position, phone, tms: access.tms, leads: access.leads, super_admin: access.super_admin }),
      });
      toast.success(`Invite sent to ${email.trim()}`);
      reset();
      onDone();
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title="Invite people"
      subtitle="They get an email to set a password, then sign in with the same login to every app you allow."
      footer={
        <>
          <span className="mr-auto hidden text-xs text-fg-4 sm:block">{apps ? `Access: ${apps}` : "No app selected"}</span>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={send} loading={busy}>
            {!busy && <Send className="h-4 w-4" />} Send invite
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Work email" required className="sm:col-span-2">
            <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="name@truckingonestopshop.net" autoFocus />
          </Field>
          <Field label="Full name" required>
            <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
          </Field>
          <Field label="Phone">
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" />
          </Field>
          <Field label="Position" className="sm:col-span-2">
            <ChoiceSelect value={position} onChange={setPosition} groups={[{ types: POSITIONS }]} placeholder="Select…" otherLabel="Other position…" />
          </Field>
        </div>
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-fg-3">Access</div>
          <AccessEditor value={access} onChange={setAccess} />
        </div>
        <p className="flex items-start gap-2 rounded-lg bg-surface-2 px-3 py-2 text-xs text-fg-3">
          <Mail className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          The invite link opens {access.tms ? "TOSS Cloud" : "TOSS Lead Hunter"} to set a password. It works once; you can resend it from the person&apos;s page.
        </p>
      </div>
    </Modal>
  );
}
