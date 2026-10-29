"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowUpRight, ShieldCheck, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, Page, PageHeader, Pill, neutralPill } from "@/components/ui/Bits";
import { Checkbox, Select } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { MemberAvatar } from "@/components/team/MemberAvatar";
import { SECTIONS } from "@/components/layout/nav";
import { errMsg, sb } from "@/lib/db";
import { useStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import type { Member, Role } from "@/lib/types";

// Users: the TOSS Cloud team, their roles, and which menu sections each person can open.
// Owners see every Cloud section. Settings (your own profile) is always open. TOSS Accounting is only
// for people given it, owners included, and only someone who has it can give it. Inviting, disabling and
// removing people stays in Settings → Team and the admin panel.

// Cloud sections; Accounting (TOSS's own money) is its own tick, never part of "every section".
const PICKABLE = SECTIONS.filter((s) => s.key !== "settings" && s.key !== "users" && s.key !== "accounting");
const hasAccounting = (m: Member) => !!m.sections?.includes("accounting");
/** "All sections" stays null unless Accounting is added, then it's every key plus accounting. */
const cloudAll = (m: Member) => !m.sections || PICKABLE.every((s) => m.sections!.includes(s.key));

export default function UsersPage() {
  const { members, me, isOwner, isSuperAdmin, setMemberRole } = useStore();
  const [edit, setEdit] = useState<Member | null>(null);
  const list = [...members].sort((a, b) => (a.role === b.role ? (a.full_name || a.email).localeCompare(b.full_name || b.email) : a.role === "owner" ? -1 : 1));

  return (
    <Page className="max-w-[1100px]">
      <PageHeader
        eyebrow="TOSS Cloud"
        title="Users"
        actions={
          <>
            {isSuperAdmin && (
              <Link href="/admin" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-[13px] font-medium text-fg hover:bg-surface-2">
                <ShieldCheck className="h-4 w-4" /> Admin panel
              </Link>
            )}
            {isOwner && (
              <Link href="/settings" className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand px-3 text-[13px] font-semibold text-brand-fg hover:opacity-90">
                <UserPlus className="h-4 w-4" /> Add people
              </Link>
            )}
          </>
        }
      />
      <p className="-mt-2 mb-5 max-w-2xl text-sm text-fg-3">
        Owners see every section and manage the team. For everyone else, choose the sections they can open; the rest are hidden from their menu. New people can open every section until you limit them.
      </p>

      <Card>
        <CardHeader title={`Team · ${members.length}`} />
        <ul className="divide-y divide-line">
          {list.map((m) => {
            const all = m.role === "owner" || cloudAll(m);
            const names = all ? [] : PICKABLE.filter((s) => m.sections!.includes(s.key)).map((s) => s.label);
            const acc = hasAccounting(m);
            return (
              <li key={m.user_id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:px-5">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <MemberAvatar id={m.user_id} name={m.full_name || m.email} />
                  <div className="min-w-0">
                    <div className="truncate text-[13px] font-semibold text-fg">
                      {m.full_name || m.email}
                      {m.user_id === me.id && <span className="font-normal text-fg-4"> (you)</span>}
                    </div>
                    <div className="truncate text-xs text-fg-3">{[m.position, m.email].filter(Boolean).join(" · ")}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-fg-2">
                      {all ? (
                        <span className="text-fg-3">All sections</span>
                      ) : names.length ? (
                        <>Can open: {names.join(", ")}</>
                      ) : (
                        <span className="text-amber-600 dark:text-amber-400">Only Settings</span>
                      )}
                      {acc && <Pill className="bg-violet-500/10 text-violet-700 ring-violet-600/25 dark:text-violet-300">Accounting</Pill>}
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {isOwner && m.user_id !== me.id ? (
                    <Select
                      value={m.role}
                      onChange={async (e) => {
                        if (await setMemberRole(m.user_id, e.target.value as Role)) toast.success("Role changed");
                      }}
                      className="w-36"
                      aria-label="Role"
                    >
                      <option value="dispatcher">Dispatcher</option>
                      <option value="owner">Owner</option>
                    </Select>
                  ) : (
                    <Pill className={neutralPill}>{m.role === "owner" ? "Owner" : "Dispatcher"}</Pill>
                  )}
                  {isOwner && m.role !== "owner" && (
                    <Button size="sm" variant="outline" onClick={() => setEdit(m)}>
                      Access
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </Card>

      {!isOwner && <p className="mt-4 text-xs text-fg-4">Only owners can change roles and access.</p>}
      {isSuperAdmin && (
        <Link href="/admin" className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-fg-3 hover:text-fg">
          Invite, disable or remove people in the admin panel <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      )}

      <AccessModal member={edit} onClose={() => setEdit(null)} />
    </Page>
  );
}

/** Pick the sections one person can open. */
function AccessModal({ member, onClose }: { member: Member | null; onClose: () => void }) {
  const { me, memberById } = useStore();
  const canGiveAccounting = hasAccounting(memberById(me.id) ?? ({} as Member));
  const [all, setAll] = useState(true);
  const [picked, setPicked] = useState<string[]>([]);
  const [acc, setAcc] = useState(false);
  const [opened, setOpened] = useState("");
  const [saving, setSaving] = useState(false);
  if (member && opened !== member.user_id) {
    setOpened(member.user_id);
    setAll(cloudAll(member));
    setPicked((member.sections ?? PICKABLE.map((s) => s.key)).filter((k) => k !== "accounting"));
    setAcc(!!member.sections?.includes("accounting"));
  }
  if (!member && opened) setOpened("");
  if (!member) return null;

  const save = async () => {
    setSaving(true);
    const { error } = await sb()
      .from("tms_members")
      .update({ sections: all && !acc ? null : [...(all ? PICKABLE.map((s) => s.key) : picked), ...(acc ? ["accounting"] : [])] })
      .eq("user_id", member.user_id);
    setSaving(false);
    if (error) return toast.error(errMsg(error));
    toast.success("Access saved");
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`Access · ${member.full_name || member.email}`}
      subtitle="Sections they can open. Settings (their own profile) is always open."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} disabled={saving}>
            Save
          </Button>
        </>
      }
    >
      <Checkbox checked={all} onChange={setAll} label={<span className="text-[13px] font-medium">Every section (no limits)</span>} />
      <div className={`mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 ${all ? "pointer-events-none opacity-40" : ""}`}>
        {PICKABLE.map((s) => (
          <Checkbox
            key={s.key}
            checked={all || picked.includes(s.key)}
            onChange={(v) => setPicked((l) => (v ? [...new Set([...l, s.key])] : l.filter((k) => k !== s.key)))}
            label={
              <span className="inline-flex items-center gap-2 text-[13px]">
                <s.icon className="h-4 w-4 text-fg-4" /> {s.label}
              </span>
            }
          />
        ))}
      </div>
      {!all && picked.length === 0 && <p className="mt-3 text-xs text-amber-600 dark:text-amber-400">They&apos;ll only be able to open Settings.</p>}
      {canGiveAccounting && (
      <div className="mt-4 border-t border-line pt-4">
        <Checkbox
          checked={acc}
          onChange={setAcc}
          label={
            <span className="text-[13px]">
              <b>TOSS Accounting</b> <span className="text-fg-3">· TOSS&apos;s own expenses, income and accounts (off unless ticked)</span>
            </span>
          }
        />
      </div>
      )}
    </Modal>
  );
}
