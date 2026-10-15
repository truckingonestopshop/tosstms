"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowDown, ArrowUp, ExternalLink, Eye, EyeOff, KeyRound, Lock, Pencil, Plus, Search, Trash2, UserRound, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Field, Input, Segmented, Select, Textarea } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { CopyButton, Empty, Pill, neutralPill } from "@/components/ui/Bits";
import { confirmDialog } from "@/components/ui/Confirm";
import { errMsg, sb } from "@/lib/db";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/format";
import type { VaultCategory, VaultItem } from "@/lib/types";

const PRESETS: { title: string; category: VaultCategory; url?: string }[] = [
  { title: "DAT", category: "login", url: "https://one.dat.com" },
  { title: "Truckstop", category: "login", url: "https://truckstop.com" },
  { title: "FMCSA portal", category: "login", url: "https://portal.fmcsa.dot.gov" },
  { title: "Factoring portal", category: "login" },
  { title: "ELD", category: "login" },
  { title: "Fuel card", category: "login" },
  { title: "Insurance agent", category: "contact" },
  { title: "Factoring rep", category: "contact" },
];

type Draft = Omit<VaultItem, "id" | "created_at" | "updated_at" | "sort_order" | "company_id">;
const blank = (v?: Partial<VaultItem>): Draft => ({
  category: v?.category ?? "login",
  title: v?.title ?? "",
  url: v?.url ?? "",
  username: v?.username ?? "",
  password: v?.password ?? "",
  account_number: v?.account_number ?? "",
  contact_name: v?.contact_name ?? "",
  contact_email: v?.contact_email ?? "",
  contact_phone: v?.contact_phone ?? "",
  role_title: v?.role_title ?? "",
  notes: v?.notes ?? "",
  custom_fields: v?.custom_fields ?? [],
});

/** Portal logins and key contacts for a carrier. Passwords are encrypted in the database. */
export function Vault({ companyId }: { companyId: string }) {
  const [items, setItems] = useState<VaultItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [cat, setCat] = useState<"all" | VaultCategory>("all");
  const [q, setQ] = useState("");
  const [shown, setShown] = useState<Record<string, boolean>>({});
  const [edit, setEdit] = useState<{ item?: VaultItem; preset?: Partial<VaultItem> } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await sb().from("tms_vault_items").select("*").eq("company_id", companyId).order("sort_order").order("created_at");
    if (error) toast.error(`Couldn't load credentials: ${errMsg(error)}`);
    setItems((data || []) as VaultItem[]);
    setLoading(false);
  }, [companyId]);

  useEffect(() => {
    load();
  }, [load]);

  const list = items.filter(
    (v) =>
      (cat === "all" || v.category === cat) &&
      (!q || `${v.title} ${v.username} ${v.contact_name} ${v.url} ${v.notes}`.toLowerCase().includes(q.toLowerCase())),
  );

  const move = async (v: VaultItem, dir: -1 | 1) => {
    const idx = items.findIndex((x) => x.id === v.id);
    const other = items[idx + dir];
    if (!other) return;
    const next = items.slice();
    next[idx] = other;
    next[idx + dir] = v;
    setItems(next);
    // Rewrite the order of the whole list so it is always consistent.
    await Promise.all(next.map((x, i) => (x.sort_order !== i ? sb().from("tms_vault_items").update({ ...x, sort_order: i }).eq("id", x.id) : null)));
    load();
  };

  const remove = async (v: VaultItem) => {
    if (!(await confirmDialog({ title: `Delete "${v.title}"?`, confirmLabel: "Delete", danger: true }))) return;
    const { error } = await sb().from("tms_vault_items").delete().eq("id", v.id);
    if (error) return toast.error(errMsg(error));
    setItems((l) => l.filter((x) => x.id !== v.id));
    toast.success("Deleted");
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-xl border border-line bg-surface-2/40 p-3.5 text-[13px] text-fg-2">
        <Lock className="mt-0.5 h-4 w-4 shrink-0 text-fg-3" />
        <p>Logins and contacts for this carrier: load boards, factoring, ELD, insurance. Passwords are encrypted and only visible to the dispatch team.</p>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Segmented
          value={cat}
          onChange={setCat}
          options={[
            { value: "all", label: `All ${items.length}` },
            { value: "login", label: "Logins" },
            { value: "contact", label: "Contacts" },
            { value: "custom", label: "Other" },
          ]}
        />
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-4" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" className="pl-9" />
        </div>
        <Button variant="secondary" onClick={() => setEdit({})}>
          <Plus className="h-4 w-4" /> Add
        </Button>
      </div>

      {items.length === 0 && !loading && (
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((p) => (
            <button
              key={p.title}
              onClick={() => setEdit({ preset: p })}
              className="inline-flex items-center gap-1 rounded-full border border-line px-2.5 py-1 text-xs text-fg-2 hover:bg-surface-2"
            >
              <Plus className="h-3 w-3" /> {p.title}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="py-10 text-center text-sm text-fg-4">Loading…</div>
      ) : list.length === 0 ? (
        <Empty icon={KeyRound} title={items.length ? "Nothing matches" : "No credentials saved"} body={items.length ? undefined : "Start with one of the shortcuts above."} />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {list.map((v) => (
            <div key={v.id} className="flex flex-col rounded-xl border border-line bg-surface p-4">
              <div className="flex items-start gap-2">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-fg-3">
                  {v.category === "contact" ? <UserRound className="h-4 w-4" /> : <KeyRound className="h-4 w-4" />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-fg">{v.title}</div>
                  <Pill className={cn(neutralPill, "mt-0.5")}>{v.category === "login" ? "Login" : v.category === "contact" ? "Contact" : "Other"}</Pill>
                </div>
                <div className="flex shrink-0">
                  <button onClick={() => move(v, -1)} className="rounded p-1 text-fg-4 hover:text-fg" aria-label="Move up">
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => move(v, 1)} className="rounded p-1 text-fg-4 hover:text-fg" aria-label="Move down">
                    <ArrowDown className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => setEdit({ item: v })} className="rounded p-1 text-fg-4 hover:text-fg" aria-label="Edit">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => remove(v)} className="rounded p-1 text-fg-4 hover:text-red-500" aria-label="Delete">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <div className="mt-3 space-y-1.5 text-[13px]">
                {v.url && (
                  <Row label="URL">
                    <a href={v.url.startsWith("http") ? v.url : `https://${v.url}`} target="_blank" rel="noreferrer" className="inline-flex min-w-0 items-center gap-1 truncate text-fg hover:underline">
                      <span className="truncate">{v.url.replace(/^https?:\/\//, "")}</span>
                      <ExternalLink className="h-3 w-3 shrink-0" />
                    </a>
                  </Row>
                )}
                {v.username && (
                  <Row label="User" copy={v.username}>
                    {v.username}
                  </Row>
                )}
                {v.password && (
                  <Row label="Password" copy={v.password}>
                    <span className="flex items-center gap-1">
                      <span className="tnum truncate font-mono">{shown[v.id] ? v.password : "••••••••••"}</span>
                      <button onClick={() => setShown((s) => ({ ...s, [v.id]: !s[v.id] }))} className="text-fg-4 hover:text-fg" aria-label="Show password">
                        {shown[v.id] ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      </button>
                    </span>
                  </Row>
                )}
                {v.account_number && (
                  <Row label="Account" copy={v.account_number}>
                    {v.account_number}
                  </Row>
                )}
                {v.contact_name && <Row label="Name">{[v.contact_name, v.role_title].filter(Boolean).join(" · ")}</Row>}
                {v.contact_phone && (
                  <Row label="Phone" copy={v.contact_phone}>
                    <a href={`tel:${v.contact_phone}`} className="hover:underline">
                      {v.contact_phone}
                    </a>
                  </Row>
                )}
                {v.contact_email && (
                  <Row label="Email" copy={v.contact_email}>
                    <a href={`mailto:${v.contact_email}`} className="hover:underline">
                      {v.contact_email}
                    </a>
                  </Row>
                )}
                {v.custom_fields.map((f, i) => (
                  <Row key={i} label={f.label || "—"} copy={f.value}>
                    {f.value}
                  </Row>
                ))}
              </div>
              {v.notes && <p className="mt-3 whitespace-pre-wrap border-t border-line pt-2.5 text-xs text-fg-3">{v.notes}</p>}
            </div>
          ))}
        </div>
      )}

      {edit && (
        <VaultForm
          companyId={companyId}
          item={edit.item}
          preset={edit.preset}
          nextOrder={items.length}
          onClose={() => setEdit(null)}
          onSaved={() => {
            setEdit(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function Row({ label, children, copy }: { label: string; children: React.ReactNode; copy?: string | null }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="w-16 shrink-0 text-xs text-fg-4">{label}</span>
      <span className="min-w-0 flex-1 truncate text-fg-2">{children}</span>
      {copy && <CopyButton text={copy} />}
    </div>
  );
}

function VaultForm({
  companyId,
  item,
  preset,
  nextOrder,
  onClose,
  onSaved,
}: {
  companyId: string;
  item?: VaultItem;
  preset?: Partial<VaultItem>;
  nextOrder: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [d, setD] = useState<Draft>(blank(item || preset));
  const [saving, setSaving] = useState(false);
  const set = (p: Partial<Draft>) => setD((x) => ({ ...x, ...p }));

  const save = async () => {
    if (!d.title.trim()) return toast.error("Give it a title.");
    setSaving(true);
    const row = { ...d, custom_fields: d.custom_fields.filter((f) => f.label || f.value), company_id: companyId };
    const res = item
      ? await sb().from("tms_vault_items").update({ ...row, sort_order: item.sort_order }).eq("id", item.id)
      : await sb().from("tms_vault_items").insert({ ...row, sort_order: nextOrder });
    setSaving(false);
    if (res.error) return toast.error(errMsg(res.error));
    toast.success("Saved");
    onSaved();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={item ? "Edit credential" : "Add credential"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} loading={saving}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="grid grid-cols-3 gap-3">
          <Field label="Title" required className="col-span-2">
            <Input value={d.title} onChange={(e) => set({ title: e.target.value })} autoFocus />
          </Field>
          <Field label="Kind">
            <Select value={d.category} onChange={(e) => set({ category: e.target.value as VaultCategory })}>
              <option value="login">Login</option>
              <option value="contact">Contact</option>
              <option value="custom">Other</option>
            </Select>
          </Field>
        </div>
        {d.category !== "contact" && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Website" className="col-span-2">
              <Input value={d.url || ""} onChange={(e) => set({ url: e.target.value })} placeholder="https://" />
            </Field>
            <Field label="Username / email">
              <Input value={d.username || ""} onChange={(e) => set({ username: e.target.value })} autoComplete="off" />
            </Field>
            <Field label="Password">
              <Input value={d.password || ""} onChange={(e) => set({ password: e.target.value })} autoComplete="new-password" />
            </Field>
            <Field label="Account / customer #" className="col-span-2">
              <Input value={d.account_number || ""} onChange={(e) => set({ account_number: e.target.value })} />
            </Field>
          </div>
        )}
        {d.category !== "login" && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Contact name">
              <Input value={d.contact_name || ""} onChange={(e) => set({ contact_name: e.target.value })} />
            </Field>
            <Field label="Role">
              <Input value={d.role_title || ""} onChange={(e) => set({ role_title: e.target.value })} />
            </Field>
            <Field label="Phone">
              <Input value={d.contact_phone || ""} onChange={(e) => set({ contact_phone: e.target.value })} type="tel" />
            </Field>
            <Field label="Email">
              <Input value={d.contact_email || ""} onChange={(e) => set({ contact_email: e.target.value })} type="email" />
            </Field>
          </div>
        )}
        <div>
          <div className="mb-1.5 text-xs font-semibold text-fg-2">Extra fields</div>
          <div className="space-y-1.5">
            {d.custom_fields.map((f, i) => (
              <div key={i} className="flex gap-1.5">
                <Input
                  value={f.label}
                  placeholder="Label"
                  className="w-32"
                  onChange={(e) => set({ custom_fields: d.custom_fields.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })}
                />
                <Input
                  value={f.value}
                  placeholder="Value"
                  className="flex-1"
                  onChange={(e) => set({ custom_fields: d.custom_fields.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)) })}
                />
                <button onClick={() => set({ custom_fields: d.custom_fields.filter((_, j) => j !== i) })} className="px-1 text-fg-4 hover:text-fg">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
            <Button size="xs" variant="ghost" onClick={() => set({ custom_fields: [...d.custom_fields, { label: "", value: "" }] })}>
              <Plus className="h-3 w-3" /> Field
            </Button>
          </div>
        </div>
        <Field label="Notes">
          <Textarea value={d.notes || ""} onChange={(e) => set({ notes: e.target.value })} rows={2} />
        </Field>
      </div>
    </Modal>
  );
}
