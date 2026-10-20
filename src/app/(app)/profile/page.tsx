"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Camera, Check, Clock, Copy, KeyRound, Languages, Mail, Trash2, UserRound, Wand2 } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { Avatar, Card, CardHeader, Empty, Page, Pill, neutralPill } from "@/components/ui/Bits";
import { stagger } from "@/components/ui/Motion";
import { confirmDialog } from "@/components/ui/Confirm";
import { ChoiceSelect } from "@/components/fleet/Trailers";
import { PhotoCropper } from "@/components/team/PhotoCropper";
import { useStore } from "@/lib/store";
import { avatarUrl } from "@/lib/db";
import { toast } from "@/lib/toast";
import { cn, fmtDay, localDay } from "@/lib/format";
import { HOURS_PRESETS, LANGUAGES, POSITIONS, TIMEZONES, buildSignature, localTime, tzLabel } from "@/lib/profile";
import type { Member, MemberProfile } from "@/lib/types";

export default function ProfilePage() {
  return (
    <Suspense>
      <Profile />
    </Suspense>
  );
}

type Draft = Required<{ [K in keyof MemberProfile]: NonNullable<MemberProfile[K]> }>;

const toDraft = (m: Member): Draft => ({
  full_name: m.full_name || "",
  position: m.position || "",
  phone: m.phone || "",
  phone_ext: m.phone_ext || "",
  mobile: m.mobile || "",
  timezone: m.timezone || "",
  work_hours: m.work_hours || "",
  languages: m.languages || [],
  bio: m.bio || "",
  email_signature: m.email_signature || "",
});

/** My profile (or, for owners, a teammate's via ?user=). */
function Profile() {
  const params = useSearchParams();
  const { me, isOwner, memberById, members, settings } = useStore();
  const userId = params.get("user") || me.id;
  const m = memberById(userId);
  const mine = userId === me.id;

  if (!m) {
    return (
      <Page>
        <Card>
          <Empty icon={UserRound} title={members.length ? "Profile not found" : "Loading…"} action={<ButtonLink href="/settings">Back to team</ButtonLink>} />
        </Card>
      </Page>
    );
  }
  if (!mine && !isOwner) {
    return (
      <Page>
        <Card>
          <Empty icon={UserRound} title="Only owners can edit a teammate's profile" action={<ButtonLink href="/profile">My profile</ButtonLink>} />
        </Card>
      </Page>
    );
  }
  return <Editor key={m.user_id} m={m} mine={mine} companyName={settings?.issuer_name || "Trucking One Stop Shop"} />;
}

function Editor({ m, mine, companyName }: { m: Member; mine: boolean; companyName: string }) {
  const { updateProfile, setAvatar } = useStore();
  const [d, setD] = useState<Draft>(() => toDraft(m));
  const [saving, setSaving] = useState(false);
  const [crop, setCrop] = useState<File | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const set = (p: Partial<Draft>) => setD((x) => ({ ...x, ...p }));

  // Follow saves from another tab / teammate while nothing is being edited here.
  const saved = useMemo(() => toDraft(m), [m]);
  const dirty = JSON.stringify(saved) !== JSON.stringify(d);
  const [base, setBase] = useState(saved);
  if (JSON.stringify(saved) !== JSON.stringify(base)) {
    setBase(saved);
    if (!dirty) setD(saved);
  }

  const auto = buildSignature({ ...m, ...d }, companyName);
  const signature = d.email_signature.trim() || auto;
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  const save = async () => {
    if (!d.full_name.trim()) return toast.error("Your name can't be empty.");
    setSaving(true);
    const ok = await updateProfile(m.user_id, { ...d, full_name: d.full_name.trim() });
    setSaving(false);
    if (ok) toast.success(mine ? "Profile saved" : `${d.full_name.trim()}'s profile saved`);
  };

  // Ctrl/Cmd + S saves.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (dirty && !saving) save();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const photo = avatarUrl(m.avatar_path);
  const name = d.full_name || m.email;

  return (
    <Page className="pb-28">
      <Link href={mine ? "/" : "/settings"} className="mb-3 inline-flex items-center gap-1.5 text-[13px] text-fg-3 hover:text-fg">
        <ArrowLeft className="h-3.5 w-3.5" /> {mine ? "Dashboard" : "Team"}
      </Link>

      {/* Identity */}
      <div className="animate-rise mb-5 flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5 sm:flex-row sm:items-center">
        <div className="relative w-fit">
          <Avatar name={name} src={photo} className="h-20 w-20 text-2xl" />
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={photoBusy}
            className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full border-2 border-surface bg-inverse text-inverse-fg shadow transition-transform hover:scale-105"
            aria-label={photo ? "Change photo" : "Add photo"}
          >
            <Camera className="h-3.5 w-3.5" />
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) setCrop(f);
              e.target.value = "";
            }}
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-[22px] font-bold text-fg">{name}</h1>
            <Pill className={m.role === "owner" ? "bg-brand/15 text-fg ring-brand/30" : neutralPill}>{m.role === "owner" ? "Owner" : "Dispatcher"}</Pill>
          </div>
          <div className="mt-0.5 text-[13px] text-fg-3">
            {[d.position, m.email].filter(Boolean).join(" · ")}
          </div>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-fg-4">
            <span>Member since {fmtDay(localDay(m.created_at), true)}</span>
            {d.timezone && (
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3 w-3" /> {localTime(d.timezone, now)} local · {tzLabel(d.timezone)}
              </span>
            )}
          </div>
        </div>
        {photo && (
          <Button
            variant="ghost"
            size="sm"
            loading={photoBusy}
            onClick={async () => {
              if (!(await confirmDialog({ title: "Remove the photo?", confirmLabel: "Remove", danger: true }))) return;
              setPhotoBusy(true);
              if (await setAvatar(m.user_id, null)) toast.success("Photo removed");
              setPhotoBusy(false);
            }}
          >
            <Trash2 className="h-3.5 w-3.5" /> Remove photo
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card className="animate-rise" style={stagger(1, 60)}>
          <CardHeader title="Basics" subtitle="How you show up to the team, drivers and brokers" />
          <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 sm:p-5">
            <Field label="Full name" required className="sm:col-span-2">
              <Input value={d.full_name} onChange={(e) => set({ full_name: e.target.value })} maxLength={120} autoComplete="name" />
            </Field>
            <Field label="Position" className="sm:col-span-2">
              <ChoiceSelect value={d.position} onChange={(v) => set({ position: v })} groups={[{ types: POSITIONS }]} placeholder="Select your position…" otherLabel="Other position…" />
            </Field>
            <Field label="About" hint="A line the team sees, e.g. lanes you know best" className="sm:col-span-2">
              <Textarea value={d.bio} onChange={(e) => set({ bio: e.target.value })} rows={2} maxLength={300} placeholder="Flatbed and reefer, Midwest ↔ Southeast" />
            </Field>
          </div>
        </Card>

        <Card className="animate-rise" style={stagger(2, 60)}>
          <CardHeader title="Contact" subtitle="Shown on driver sheets and broker pitches" />
          <div className="grid grid-cols-3 gap-3 p-4 sm:p-5">
            <Field label="Direct phone" className="col-span-2">
              <Input value={d.phone} onChange={(e) => set({ phone: e.target.value })} type="tel" autoComplete="tel" placeholder="(312) 555-0100" />
            </Field>
            <Field label="Ext.">
              <Input value={d.phone_ext} onChange={(e) => set({ phone_ext: e.target.value.replace(/[^\d#*]/g, "") })} inputMode="numeric" maxLength={8} />
            </Field>
            <Field label="Mobile" className="col-span-3 sm:col-span-2">
              <Input value={d.mobile} onChange={(e) => set({ mobile: e.target.value })} type="tel" placeholder="For after-hours calls" />
            </Field>
            <Field label="Email" hint="Your sign-in email. Ask an owner to change it." className="col-span-3">
              <div className="flex h-9 items-center gap-2 rounded-lg border border-line bg-surface-2 px-3 text-sm text-fg-2">
                <Mail className="h-3.5 w-3.5 text-fg-4" />
                <span className="truncate">{m.email}</span>
              </div>
            </Field>
          </div>
        </Card>

        <Card className="animate-rise" style={stagger(3, 60)}>
          <CardHeader title="Work" subtitle="So the team knows when and how to reach you" />
          <div className="space-y-3 p-4 sm:p-5">
            <Field label="Time zone">
              <Select value={d.timezone} onChange={(e) => set({ timezone: e.target.value })}>
                <option value="">Select…</option>
                <optgroup label="United States">
                  {TIMEZONES.filter((t) => t.v.startsWith("America") || t.v.startsWith("Pacific")).map((t) => (
                    <option key={t.v} value={t.v}>
                      {t.label}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Europe">
                  {TIMEZONES.filter((t) => t.v.startsWith("Europe")).map((t) => (
                    <option key={t.v} value={t.v}>
                      {t.label}
                    </option>
                  ))}
                </optgroup>
              </Select>
            </Field>
            <Field label="Working hours">
              <Input value={d.work_hours} onChange={(e) => set({ work_hours: e.target.value })} placeholder="Mon–Fri 7am–5pm CT" />
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {HOURS_PRESETS.map((h) => (
                  <button
                    key={h}
                    type="button"
                    onClick={() => set({ work_hours: h })}
                    className={cn("rounded-full border px-2 py-0.5 text-[11px] transition-colors", d.work_hours === h ? "border-transparent bg-inverse text-inverse-fg" : "border-line text-fg-3 hover:text-fg")}
                  >
                    {h}
                  </button>
                ))}
              </div>
            </Field>
            <Field label={<span className="inline-flex items-center gap-1"><Languages className="h-3.5 w-3.5" /> Languages</span>}>
              <div className="flex flex-wrap gap-1.5">
                {LANGUAGES.map((l) => {
                  const on = d.languages.includes(l);
                  return (
                    <button
                      key={l}
                      type="button"
                      aria-pressed={on}
                      onClick={() => set({ languages: on ? d.languages.filter((x) => x !== l) : [...d.languages, l] })}
                      className={cn("rounded-full border px-2.5 py-1 text-xs font-medium transition-colors", on ? "border-transparent bg-inverse text-inverse-fg" : "border-line text-fg-2 hover:border-line-strong")}
                    >
                      {on && <Check className="-ml-0.5 mr-1 inline h-3 w-3" />}
                      {l}
                    </button>
                  );
                })}
              </div>
            </Field>
          </div>
        </Card>

        <Card className="animate-rise" style={stagger(4, 60)}>
          <CardHeader
            title="Email signature"
            subtitle="Added to invoice and reminder emails"
            actions={
              <Button size="xs" variant="ghost" onClick={() => set({ email_signature: auto })} title="Fill from your details">
                <Wand2 className="h-3.5 w-3.5" /> From my details
              </Button>
            }
          />
          <div className="space-y-3 p-4 sm:p-5">
            <Textarea value={d.email_signature} onChange={(e) => set({ email_signature: e.target.value })} rows={5} placeholder={auto} />
            <div className="rounded-lg border border-line bg-surface-2/50 p-3">
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-4">Preview{d.email_signature.trim() ? "" : " (from your details)"}</span>
                <button
                  type="button"
                  onClick={() => navigator.clipboard.writeText(signature).then(() => toast.success("Signature copied"))}
                  className="inline-flex items-center gap-1 text-xs text-fg-3 hover:text-fg"
                >
                  <Copy className="h-3 w-3" /> Copy
                </button>
              </div>
              <div className="flex gap-3">
                <Avatar name={name} src={photo} className="h-10 w-10 text-sm" />
                <pre className="min-w-0 whitespace-pre-wrap font-sans text-[13px] leading-relaxed text-fg-2">{signature}</pre>
              </div>
            </div>
          </div>
        </Card>

        {mine && (
          <Card className="animate-rise lg:col-span-2" style={stagger(5, 60)}>
            <CardHeader title="Sign-in & security" />
            <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:p-5">
              <div className="min-w-0 flex-1 text-[13px] text-fg-3">
                You sign in to TOSS Cloud with your TOSS account (<b className="font-medium text-fg-2">{m.email}</b>). Changing the password changes it for TOSS Lead Hunter too.
              </div>
              <ButtonLink href="/set-password" variant="outline">
                <KeyRound className="h-4 w-4" /> Change password
              </ButtonLink>
            </div>
          </Card>
        )}
      </div>

      {/* Save bar: appears when something changed */}
      <div
        className={cn(
          "pb-safe fixed inset-x-0 bottom-[60px] z-30 border-t border-line bg-surface/95 px-4 py-2.5 backdrop-blur transition-[transform,opacity] duration-300 md:bottom-0",
          dirty ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-full opacity-0",
        )}
      >
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <span className="inline-flex items-center gap-1.5 text-[13px] text-fg-2">
            Unsaved changes
            <span className="hidden text-fg-4 sm:inline">· Ctrl+S</span>
          </span>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setD(saved)}>
              Discard
            </Button>
            <Button variant="primary" onClick={save} loading={saving}>
              Save profile
            </Button>
          </div>
        </div>
      </div>

      {crop && (
        <PhotoCropper
          file={crop}
          onCancel={() => setCrop(null)}
          onDone={async (blob) => {
            setCrop(null);
            setPhotoBusy(true);
            if (await setAvatar(m.user_id, blob)) toast.success("Photo updated");
            setPhotoBusy(false);
          }}
        />
      )}
    </Page>
  );
}
