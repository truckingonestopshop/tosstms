"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronRight, KeyRound, RefreshCw, Search, ShieldCheck, UserPlus, Users } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Field";
import { Avatar, Card, Empty, Page, PageHeader, Pill, Skeleton, Stat } from "@/components/ui/Bits";
import { CountUp, MotionTabs, stagger } from "@/components/ui/Motion";
import { InviteDialog } from "@/components/admin/InviteDialog";
import { UserSheet } from "@/components/admin/UserSheet";
import { AuditLog } from "@/components/admin/AuditLog";
import { AccessChip, STATUS_UI, api, type AdminUser, type AuditRow } from "@/components/admin/shared";
import { useStore } from "@/lib/store";
import { avatarUrl } from "@/lib/db";
import { cn, relTime } from "@/lib/format";

export default function AdminPage() {
  return (
    <Suspense>
      <Admin />
    </Suspense>
  );
}

type Tab = "people" | "activity";
type AppFilter = "all" | "tms" | "leads" | "both" | "none";

/** People & access for TOSS Cloud and TOSS Lead Hunter (super admins only). */
function Admin() {
  const { isSuperAdmin } = useStore();
  const params = useSearchParams();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("people");
  const [data, setData] = useState<{ configured: boolean; users: AdminUser[]; me: string; preview?: boolean } | null>(null);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [app, setApp] = useState<AppFilter>("all");
  const [status, setStatus] = useState<"all" | AdminUser["status"]>("all");
  const [invite, setInvite] = useState(false);
  const open = data?.users.find((u) => u.id === params.get("user")) || null;
  const openUser = (id: string | null) => router.replace(id ? `/admin?user=${id}` : "/admin", { scroll: false });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [u, a] = await Promise.all([
        api<{ configured: boolean; users: AdminUser[]; me: string; preview?: boolean }>("/api/admin/users"),
        api<{ rows: AuditRow[] }>("/api/admin/audit").catch(() => ({ rows: [] })),
      ]);
      setData(u);
      setAudit(a.rows);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const users = useMemo(() => data?.users || [], [data]);
  const stats = useMemo(
    () => ({
      total: users.length,
      active: users.filter((u) => u.status === "active").length,
      invited: users.filter((u) => u.status === "invited").length,
      disabled: users.filter((u) => u.status === "disabled").length,
      tms: users.filter((u) => u.tms && u.status !== "disabled").length,
      leads: users.filter((u) => u.leads && u.status !== "disabled").length,
    }),
    [users],
  );
  const list = users.filter((u) => {
    if (status !== "all" && u.status !== status) return false;
    if (app === "tms" && !u.tms) return false;
    if (app === "leads" && !u.leads) return false;
    if (app === "both" && !(u.tms && u.leads)) return false;
    if (app === "none" && (u.tms || u.leads)) return false;
    if (q && !`${u.full_name} ${u.email} ${u.position}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  if (!isSuperAdmin && !data) {
    return (
      <Page>
        <Card>
          <Empty icon={ShieldCheck} title="Admin panel" body={loading ? "Checking access…" : error || "Only super admins can open the admin panel."} action={!loading ? <ButtonLink href="/fleet">Back to carriers</ButtonLink> : undefined} />
        </Card>
      </Page>
    );
  }

  return (
    <Page>
      <PageHeader
        eyebrow="Admin · TOSS Cloud + TOSS Lead Hunter"
        title="People & access"
        actions={
          <>
            <Button variant="outline" size="icon" onClick={load} aria-label="Refresh" title="Refresh">
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            </Button>
            <Button variant="primary" onClick={() => setInvite(true)} disabled={data?.configured === false}>
              <UserPlus className="h-4 w-4" /> Invite people
            </Button>
          </>
        }
      />

      {error && !data && (
        <Card className="mb-5 border-red-500/30 p-4 text-[13px] text-red-700 dark:text-red-300">{error}</Card>
      )}

      {data?.configured === false && (
        <Card className="animate-rise mb-5 border-amber-500/40 p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <KeyRound className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div className="text-[13px] text-fg-2">
              <div className="font-semibold text-fg">One setup step: the Supabase secret key</div>
              Inviting, disabling and deleting accounts uses Supabase&apos;s admin API, which needs the project&apos;s secret key on the server.
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-fg-3">
                <li>Supabase → Project Settings → API Keys → copy the <b>secret</b> key (sb_secret_…).</li>
                <li>
                  Add <code className="rounded bg-surface-2 px-1">SUPABASE_SECRET_KEY=…</code> to <code className="rounded bg-surface-2 px-1">.env.local</code> and to Vercel → Settings → Environment Variables.
                </li>
                <li>Restart the dev server / redeploy, then reload this page.</li>
              </ol>
              <div className="mt-2 text-xs text-fg-4">The key stays on the server; the browser never sees it.</div>
            </div>
          </div>
        </Card>
      )}

      {data?.preview && <div className="mb-4 rounded-lg bg-brand/10 px-3 py-2 text-[13px] text-fg-2">Sample data: changes here don&apos;t touch real accounts.</div>}

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "People", value: stats.total, sub: `${stats.active} active` },
          { label: "Invited", value: stats.invited, sub: "Haven't signed in yet" },
          { label: "TOSS Cloud", value: stats.tms, sub: "With access" },
          { label: "TOSS Lead Hunter", value: stats.leads, sub: "With access" },
        ].map((s, i) => (
          <Stat key={s.label} className="animate-rise" style={stagger(i, 50)} label={s.label} value={<CountUp value={s.value} />} sub={s.sub} />
        ))}
      </div>

      <div className="mb-3 flex flex-col gap-2 lg:flex-row lg:items-center">
        <MotionTabs
          value={tab}
          onChange={setTab}
          options={[
            { value: "people", label: "People", count: users.length },
            { value: "activity", label: "Activity log", count: audit.length },
          ]}
        />
        {tab === "people" && (
          <div className="flex flex-1 flex-col gap-2 sm:flex-row lg:justify-end">
            <div className="relative sm:w-64">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-4" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, email, position" className="pl-9" />
            </div>
            <Select value={app} onChange={(e) => setApp(e.target.value as AppFilter)} className="sm:w-40" aria-label="App">
              <option value="all">All apps</option>
              <option value="tms">TOSS Cloud</option>
              <option value="leads">TOSS Lead Hunter</option>
              <option value="both">Both apps</option>
              <option value="none">No app access</option>
            </Select>
            <Select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className="sm:w-36" aria-label="Status">
              <option value="all">Any status</option>
              <option value="active">Active</option>
              <option value="invited">Invited</option>
              <option value="disabled">Disabled</option>
            </Select>
          </div>
        )}
      </div>

      {tab === "activity" ? (
        <AuditLog rows={audit} />
      ) : loading && !data ? (
        <Card className="space-y-3 p-5">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-10" />
          ))}
        </Card>
      ) : list.length === 0 ? (
        <Card>
          <Empty icon={Users} title={users.length ? "No one matches" : "No people yet"} body={users.length ? undefined : "Invite your team to get started."} />
        </Card>
      ) : (
        <>
          <Card className="hidden overflow-hidden md:block">
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className="border-b border-line text-[11px] font-semibold uppercase tracking-wider text-fg-4">
                  <th className="px-4 py-2.5">Person</th>
                  <th className="px-3 py-2.5">Position</th>
                  <th className="px-3 py-2.5">Access</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {list.map((u, i) => (
                  <tr key={u.id} onClick={() => openUser(u.id)} className="animate-rise group cursor-pointer transition-colors hover:bg-surface-2/60" style={stagger(i, 20)}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={u.full_name || u.email} src={avatarUrl(u.avatar_path)} className="h-8 w-8" />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 truncate font-semibold text-fg">
                            {u.full_name || "No name"}
                            {u.super_admin && <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-brand" aria-label="Super admin" />}
                            {u.id === data?.me && <span className="font-normal text-fg-4">(you)</span>}
                          </div>
                          <div className="truncate text-xs text-fg-3">{u.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="max-w-[200px] truncate px-3 py-3 text-fg-2">{u.position || <span className="text-fg-4">—</span>}</td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        <AccessChip app="tms" role={u.tms} />
                        <AccessChip app="leads" role={u.leads} />
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3">
                      <Pill className={STATUS_UI[u.status].cls} dot={STATUS_UI[u.status].dot}>
                        {STATUS_UI[u.status].label}
                      </Pill>
                      <div className="mt-0.5 text-[11px] text-fg-4">{u.last_sign_in_at ? `Seen ${relTime(u.last_sign_in_at)}` : u.status === "invited" ? "Waiting for sign-in" : "Never signed in"}</div>
                    </td>
                    <td className="pr-3 text-fg-4">
                      <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <div className="grid grid-cols-1 gap-2.5 md:hidden">
            {list.map((u, i) => (
              <button key={u.id} onClick={() => openUser(u.id)} className="animate-rise flex items-start gap-3 rounded-xl border border-line bg-surface p-3.5 text-left active:bg-surface-2" style={stagger(i, 20)}>
                <Avatar name={u.full_name || u.email} src={avatarUrl(u.avatar_path)} className="h-9 w-9" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-[13px] font-semibold text-fg">{u.full_name || u.email}</span>
                    {u.super_admin && <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-brand" />}
                  </div>
                  <div className="truncate text-xs text-fg-3">{[u.position, u.email].filter(Boolean).join(" · ")}</div>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    <AccessChip app="tms" role={u.tms} />
                    <AccessChip app="leads" role={u.leads} />
                  </div>
                </div>
                <Pill className={STATUS_UI[u.status].cls}>{STATUS_UI[u.status].label}</Pill>
              </button>
            ))}
          </div>
        </>
      )}

      <InviteDialog open={invite} onClose={() => setInvite(false)} onDone={load} />
      <UserSheet user={open} me={data?.me || ""} audit={audit} onClose={() => openUser(null)} onChanged={load} />
    </Page>
  );
}
