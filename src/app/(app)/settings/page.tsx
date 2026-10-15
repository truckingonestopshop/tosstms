"use client";

import { useEffect, useState } from "react";
import { Monitor, Moon, Sun, Trash2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { Avatar, Card, CardHeader, Page, PageHeader, Pill, neutralPill } from "@/components/ui/Bits";
import { confirmDialog } from "@/components/ui/Confirm";
import { DocTypesModal } from "@/components/docs/DocTypesModal";
import { useStore } from "@/lib/store";
import { useTheme } from "@/lib/theme";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/format";
import type { Role, Settings } from "@/lib/types";

export default function SettingsPage() {
  const { isOwner } = useStore();
  return (
    <Page className="max-w-[1000px]">
      <PageHeader title="Settings" />
      <div className="space-y-5">
        <Team />
        <InvoiceProfile editable={isOwner} />
        <DocTypes />
        <Appearance />
      </div>
    </Page>
  );
}

function Team() {
  const { members, me, isOwner, addMember, setMemberRole, removeMember } = useStore();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("dispatcher");
  const [busy, setBusy] = useState(false);
  return (
    <Card>
      <CardHeader title="Team" subtitle="People who can use TOSS TMS. They sign in with their TOSS account." />
      {isOwner && (
        <form
          className="flex flex-col gap-2 border-b border-line p-4 sm:flex-row sm:px-5"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!email.trim()) return;
            setBusy(true);
            const ok = await addMember(email.trim(), role);
            setBusy(false);
            if (ok) {
              toast.success(`${email} added`);
              setEmail("");
            }
          }}
        >
          <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="Their TOSS email" className="flex-1" />
          <Select value={role} onChange={(e) => setRole(e.target.value as Role)} className="sm:w-36">
            <option value="dispatcher">Dispatcher</option>
            <option value="owner">Owner</option>
          </Select>
          <Button type="submit" variant="secondary" loading={busy}>
            <UserPlus className="h-4 w-4" /> Add
          </Button>
        </form>
      )}
      <ul className="divide-y divide-line">
        {members.map((m) => (
          <li key={m.user_id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
            <Avatar name={m.full_name || m.email} className="h-8 w-8" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-medium text-fg">
                {m.full_name || m.email} {m.user_id === me.id && <span className="text-fg-4">(you)</span>}
              </div>
              <div className="truncate text-xs text-fg-3">{m.email}</div>
            </div>
            {isOwner && m.user_id !== me.id ? (
              <>
                <Select value={m.role} onChange={(e) => setMemberRole(m.user_id, e.target.value as Role)} className="h-8 w-32 text-[13px]">
                  <option value="dispatcher">Dispatcher</option>
                  <option value="owner">Owner</option>
                </Select>
                <Button
                  size="icon-sm"
                  variant="danger-ghost"
                  aria-label="Remove"
                  onClick={async () => {
                    if (
                      await confirmDialog({
                        title: `Remove ${m.full_name || m.email}?`,
                        body: "They lose access to TOSS TMS. Their TOSS Leads access is not affected.",
                        confirmLabel: "Remove",
                        danger: true,
                      })
                    )
                      removeMember(m.user_id);
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </>
            ) : (
              <Pill className={neutralPill}>{m.role === "owner" ? "Owner" : "Dispatcher"}</Pill>
            )}
          </li>
        ))}
      </ul>
      {!isOwner && <p className="border-t border-line px-5 py-3 text-xs text-fg-3">Only owners can add or remove people.</p>}
    </Card>
  );
}

function InvoiceProfile({ editable }: { editable: boolean }) {
  const { settings, updateSettings } = useStore();
  const [d, setD] = useState<Partial<Settings>>(settings || {});
  const [saving, setSaving] = useState(false);
  useEffect(() => setD(settings || {}), [settings]);
  const set = (p: Partial<Settings>) => setD((x) => ({ ...x, ...p }));
  return (
    <Card>
      <CardHeader title="Invoice profile" subtitle="Printed on every new invoice as the sender. Existing invoices keep what they were issued with." />
      <form
        className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 sm:p-5"
        onSubmit={async (e) => {
          e.preventDefault();
          setSaving(true);
          const ok = await updateSettings({
            issuer_name: d.issuer_name,
            issuer_address: d.issuer_address,
            issuer_email: d.issuer_email,
            issuer_phone: d.issuer_phone,
            invoice_prefix: (d.invoice_prefix || "TOSS").replace(/[^A-Za-z0-9]/g, "").toUpperCase(),
            remittance_text: d.remittance_text,
            footer_text: d.footer_text,
          });
          setSaving(false);
          if (ok) toast.success("Invoice profile saved");
        }}
      >
        <fieldset disabled={!editable} className="contents">
          <Field label="Legal name">
            <Input value={d.issuer_name || ""} onChange={(e) => set({ issuer_name: e.target.value })} />
          </Field>
          <Field label="Invoice number prefix" hint={`Next numbers look like ${(d.invoice_prefix || "TOSS").toUpperCase()}-${new Date().getFullYear()}-1001`}>
            <Input value={d.invoice_prefix || ""} onChange={(e) => set({ invoice_prefix: e.target.value })} maxLength={8} />
          </Field>
          <Field label="Billing email">
            <Input value={d.issuer_email || ""} onChange={(e) => set({ issuer_email: e.target.value })} type="email" />
          </Field>
          <Field label="Phone">
            <Input value={d.issuer_phone || ""} onChange={(e) => set({ issuer_phone: e.target.value })} type="tel" />
          </Field>
          <Field label="Address" className="sm:col-span-2">
            <Textarea value={d.issuer_address || ""} onChange={(e) => set({ issuer_address: e.target.value })} rows={2} />
          </Field>
          <Field label="How to pay" hint="Bank, ACH, Zelle details" className="sm:col-span-2">
            <Textarea value={d.remittance_text || ""} onChange={(e) => set({ remittance_text: e.target.value })} rows={3} />
          </Field>
          <Field label="Footer" className="sm:col-span-2">
            <Input value={d.footer_text || ""} onChange={(e) => set({ footer_text: e.target.value })} />
          </Field>
        </fieldset>
        <div className="flex items-center justify-end gap-2 sm:col-span-2">
          {!editable && <span className="mr-auto text-xs text-fg-3">Only owners can change this.</span>}
          {editable && (
            <Button type="submit" variant="primary" loading={saving}>
              Save profile
            </Button>
          )}
        </div>
      </form>
    </Card>
  );
}

function DocTypes() {
  const { docTypes } = useStore();
  const [open, setOpen] = useState(false);
  return (
    <Card>
      <CardHeader
        title="Document types"
        subtitle={`${docTypes.length} types · ${docTypes.filter((d) => !d.is_default).length} added by your team`}
        actions={
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
            Manage
          </Button>
        }
      />
      <div className="flex flex-wrap gap-1.5 p-4 sm:px-5">
        {docTypes.map((d) => (
          <Pill key={d.key} className={neutralPill}>
            {d.name}
          </Pill>
        ))}
      </div>
      <DocTypesModal open={open} onClose={() => setOpen(false)} />
    </Card>
  );
}

function Appearance() {
  const { choice, setChoice } = useTheme();
  return (
    <Card>
      <CardHeader title="Appearance" subtitle="Saved on this device" />
      <div className="grid grid-cols-3 gap-3 p-4 sm:max-w-md sm:px-5">
        {(
          [
            { v: "light", icon: Sun, label: "Light" },
            { v: "dark", icon: Moon, label: "Dark" },
            { v: "system", icon: Monitor, label: "Match device" },
          ] as const
        ).map((o) => (
          <button
            key={o.v}
            onClick={() => setChoice(o.v)}
            className={cn(
              "flex flex-col items-center gap-2 rounded-xl border px-3 py-4 text-[13px] font-medium transition-colors",
              choice === o.v ? "border-brand bg-brand/5 text-fg" : "border-line text-fg-3 hover:border-line-strong hover:text-fg",
            )}
          >
            <o.icon className="h-5 w-5" />
            {o.label}
          </button>
        ))}
      </div>
    </Card>
  );
}
