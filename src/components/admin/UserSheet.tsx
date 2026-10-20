"use client";

import { useEffect, useMemo, useState } from "react";
import { Ban, CheckCircle2, KeyRound, Mail, RotateCcw, ShieldCheck, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { Drawer, Modal } from "@/components/ui/Modal";
import { Avatar, Eyebrow, Pill } from "@/components/ui/Bits";
import { confirmDialog } from "@/components/ui/Confirm";
import { ChoiceSelect } from "@/components/fleet/Trailers";
import { avatarUrl } from "@/lib/db";
import { POSITIONS } from "@/lib/profile";
import { toast } from "@/lib/toast";
import { cn, fmtDateTime, relTime } from "@/lib/format";
import { AccessEditor, type Access } from "./AccessEditor";
import { STATUS_UI, api, type AdminUser, type AuditRow } from "./shared";
import { auditText } from "./AuditLog";

/** One person: who they are, what they can use, and account actions. */
export function UserSheet({
  user,
  me,
  audit,
  onClose,
  onChanged,
}: {
  user: AdminUser | null;
  me: string;
  audit: AuditRow[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [name, setName] = useState("");
  const [position, setPosition] = useState("");
  const [phone, setPhone] = useState("");
  const [access, setAccess] = useState<Access>({ tms: null, leads: null, super_admin: false });
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [del, setDel] = useState(false);

  useEffect(() => {
    if (!user) return;
    setName(user.full_name);
    setPosition(user.position || "");
    setPhone(user.phone || "");
    setAccess({ tms: user.tms, leads: user.leads, super_admin: user.super_admin });
  }, [user]);

  const history = useMemo(() => (user ? audit.filter((a) => a.target_email?.toLowerCase() === user.email.toLowerCase()).slice(0, 8) : []), [audit, user]);
  if (!user) return null;
  const self = user.id === me;
  const dirty =
    name !== user.full_name ||
    position !== (user.position || "") ||
    phone !== (user.phone || "") ||
    access.tms !== user.tms ||
    access.leads !== user.leads ||
    access.super_admin !== user.super_admin;
  const st = STATUS_UI[user.status];

  const save = async () => {
    if (!access.tms && !access.leads && !(await confirmDialog({ title: "Remove all app access?", body: `${user.email} will still have a login but can't use TOSS Cloud or TOSS Lead Hunter.`, confirmLabel: "Remove access", danger: true })))
      return;
    setSaving(true);
    try {
      await api(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        body: JSON.stringify({ full_name: name, position: position || null, phone: phone || null, tms: access.tms, leads: access.leads, super_admin: access.super_admin }),
      });
      toast.success("Changes saved");
      onChanged();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const act = async (action: "disable" | "enable" | "send_link") => {
    if (action === "disable" && !(await confirmDialog({ title: `Disable ${user.full_name || user.email}?`, body: "They're signed out of both apps and can't sign in until enabled again. Their data stays.", confirmLabel: "Disable", danger: true })))
      return;
    setBusy(action);
    try {
      const r = await api<{ sent?: string }>(`/api/admin/users/${user.id}`, { method: "POST", body: JSON.stringify({ action }) });
      toast.success(action === "send_link" ? (r.sent === "reset" ? "Password reset email sent" : "Invite sent again") : action === "disable" ? "Account disabled" : "Account enabled");
      onChanged();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Drawer
      open
      onClose={onClose}
      title={
        <span className="flex items-center gap-2">
          {user.full_name || user.email}
          {user.super_admin && <ShieldCheck className="h-4 w-4 text-brand" aria-label="Super admin" />}
        </span>
      }
      subtitle={user.email}
      footer={
        dirty ? (
          <div className="flex w-full items-center justify-end gap-2">
            <span className="mr-auto text-xs text-fg-3">Unsaved changes</span>
            <Button variant="ghost" onClick={() => user && (setName(user.full_name), setPosition(user.position || ""), setPhone(user.phone || ""), setAccess({ tms: user.tms, leads: user.leads, super_admin: user.super_admin }))}>
              Discard
            </Button>
            <Button variant="primary" onClick={save} loading={saving}>
              Save changes
            </Button>
          </div>
        ) : undefined
      }
    >
      <div className="space-y-6 p-5">
        <div className="flex items-center gap-3">
          <Avatar name={user.full_name || user.email} src={avatarUrl(user.avatar_path)} className="h-12 w-12 text-base" />
          <div className="min-w-0 text-xs text-fg-3">
            <Pill className={st.cls} dot={st.dot}>
              {st.label}
            </Pill>
            <div className="mt-1">
              {user.status === "invited"
                ? `Invited ${user.invited_at ? relTime(user.invited_at) : ""} · hasn't signed in yet`
                : user.last_sign_in_at
                  ? `Last sign-in ${relTime(user.last_sign_in_at)}`
                  : "Never signed in"}
            </div>
          </div>
        </div>

        <section>
          <Eyebrow className="mb-2">Profile</Eyebrow>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Full name" className="sm:col-span-2">
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Position">
              <ChoiceSelect value={position} onChange={setPosition} groups={[{ types: POSITIONS }]} placeholder="Select…" otherLabel="Other position…" />
            </Field>
            <Field label="Phone">
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" />
            </Field>
          </div>
        </section>

        <section>
          <Eyebrow className="mb-2">Access</Eyebrow>
          <AccessEditor value={access} onChange={setAccess} lockSelf={self} />
        </section>

        <section>
          <Eyebrow className="mb-2">Account</Eyebrow>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Button variant="outline" onClick={() => act("send_link")} loading={busy === "send_link"} disabled={user.status === "disabled"}>
              {busy !== "send_link" && (user.status === "invited" ? <Mail className="h-4 w-4" /> : <KeyRound className="h-4 w-4" />)}
              {user.status === "invited" ? "Resend invite" : "Send password reset"}
            </Button>
            {!self &&
              (user.status === "disabled" ? (
                <Button variant="outline" onClick={() => act("enable")} loading={busy === "enable"}>
                  {busy !== "enable" && <RotateCcw className="h-4 w-4" />} Enable account
                </Button>
              ) : (
                <Button variant="outline" onClick={() => act("disable")} loading={busy === "disable"}>
                  {busy !== "disable" && <Ban className="h-4 w-4" />} Disable account
                </Button>
              ))}
          </div>
          {!self && (
            <button type="button" onClick={() => setDel(true)} className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-red-600 hover:underline dark:text-red-400">
              <Trash2 className="h-3.5 w-3.5" /> Delete account permanently
            </button>
          )}
          <div className="mt-3 text-[11px] text-fg-4">Login created {fmtDateTime(user.created_at)}</div>
        </section>

        {history.length > 0 && (
          <section>
            <Eyebrow className="mb-2">History</Eyebrow>
            <ol className="space-y-2">
              {history.map((h) => (
                <li key={h.id} className="flex gap-2 text-[13px]">
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-fg-4" />
                  <span className="min-w-0">
                    <span className="text-fg-2">{auditText(h)}</span>
                    <span className="block text-[11px] text-fg-4">
                      {h.actor_email} · {relTime(h.created_at)}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>
      {del && <DeleteDialog user={user} onClose={() => setDel(false)} onDone={() => (setDel(false), onClose(), onChanged())} />}
    </Drawer>
  );
}

/** Delete a login for good: type the email to confirm. */
function DeleteDialog({ user, onClose, onDone }: { user: AdminUser; onClose: () => void; onDone: () => void }) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const ok = typed.trim().toLowerCase() === user.email.toLowerCase();
  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title="Delete this account?"
      subtitle="The login is removed from both apps. Loads, lists and invoices they worked on stay, without their name."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="danger"
            disabled={!ok}
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await api(`/api/admin/users/${user.id}`, { method: "DELETE", body: JSON.stringify({ confirm: typed }) });
                toast.success(`${user.email} deleted`);
                onDone();
              } catch (e) {
                toast.error((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Delete for good
          </Button>
        </>
      }
    >
      <Field label={<span>Type <b className="font-semibold text-fg">{user.email}</b> to confirm</span>}>
        <Input value={typed} onChange={(e) => setTyped(e.target.value)} className={cn(ok && "border-red-500")} autoFocus />
      </Field>
      <p className="mt-3 text-xs text-fg-3">Prefer Disable if they might come back: it keeps the account and blocks sign-in.</p>
    </Modal>
  );
}
