import "server-only";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { currentUser } from "@/lib/supabase/server";
import { supabaseServer } from "@/lib/supabase/server";

// Admin panel server: one place that manages people across TOSS Cloud and TOSS Lead Hunter.
// Uses the Supabase secret key (server only) for Auth admin calls (invite, disable, delete)
// and to write both apps' access tables. Every call first checks the caller is a super admin.

export type TmsRole = "owner" | "dispatcher";
export type LeadsRole = "owner" | "admin" | "member";
export type AdminStatus = "active" | "invited" | "disabled";

export interface AdminUser {
  id: string;
  email: string;
  full_name: string;
  position: string | null;
  phone: string | null;
  avatar_path: string | null;
  created_at: string;
  invited_at: string | null;
  last_sign_in_at: string | null;
  status: AdminStatus;
  super_admin: boolean;
  tms: TmsRole | null;
  leads: LeadsRole | null;
}

export interface AuditRow {
  id: string;
  actor_email: string | null;
  action: string;
  target_email: string | null;
  details: Record<string, unknown>;
  created_at: string;
}

const SECRET = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
export const adminConfigured = () => !!SECRET;

let client: SupabaseClient | null = null;
/** Supabase client with the secret key. Never send anything it returns to the browser unfiltered. */
export function adminClient() {
  if (!SECRET) throw new AdminError("The admin panel isn't set up: SUPABASE_SECRET_KEY is missing on the server.", 503);
  client ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, SECRET, { auth: { persistSession: false, autoRefreshToken: false } });
  return client;
}

export class AdminError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

/** The signed-in super admin, or an error. Checked against the database on every call. */
export async function requireSuperAdmin() {
  const me = await currentUser();
  if (!me) throw new AdminError("Sign in required", 401);
  const sb = await supabaseServer();
  const { data, error } = await sb.rpc("toss_is_super_admin");
  if (error || data !== true) throw new AdminError("Only super admins can do this", 403);
  return me;
}

const BANNED_FOREVER = "876000h"; // ~100 years

function statusOf(u: User): AdminStatus {
  const banned = (u as User & { banned_until?: string | null }).banned_until;
  if (banned && new Date(banned).getTime() > Date.now()) return "disabled";
  if (!u.email_confirmed_at && !u.last_sign_in_at) return "invited";
  return "active";
}

/** The Leads default workspace (where every Leads user works). */
async function leadsWorkspace(a: SupabaseClient) {
  const { data } = await a.from("workspaces").select("id").eq("is_default", true).maybeSingle();
  if (data?.id) return data.id as string;
  const first = await a.from("workspaces").select("id").order("created_at").limit(1).maybeSingle();
  return (first.data?.id as string) || null;
}

/** Everyone with a TOSS login, with their access to each app. */
export async function listUsers(): Promise<AdminUser[]> {
  const a = adminClient();
  const users: User[] = [];
  for (let page = 1; page < 50; page++) {
    const { data, error } = await a.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new AdminError(error.message, 502);
    users.push(...data.users);
    if (data.users.length < 200) break;
  }
  const ws = await leadsWorkspace(a);
  const [tms, leads, supers, profiles] = await Promise.all([
    a.from("tms_members").select("user_id, full_name, role, position, phone, avatar_path"),
    ws ? a.from("workspace_members").select("user_id, role").eq("workspace_id", ws) : Promise.resolve({ data: [] as { user_id: string; role: string }[] }),
    a.from("toss_super_admins").select("user_id"),
    a.from("profiles").select("id, full_name"),
  ]);
  const tmsBy = new Map((tms.data || []).map((r) => [r.user_id as string, r]));
  const leadsBy = new Map((leads.data || []).map((r) => [r.user_id as string, r.role as LeadsRole]));
  const superSet = new Set((supers.data || []).map((r) => r.user_id as string));
  const profBy = new Map((profiles.data || []).map((r) => [r.id as string, r.full_name as string | null]));

  return users
    .map((u) => {
      const t = tmsBy.get(u.id);
      const meta = (u.user_metadata || {}) as Record<string, unknown>;
      return {
        id: u.id,
        email: u.email || "",
        full_name: (t?.full_name as string) || profBy.get(u.id) || (meta.full_name as string) || "",
        position: (t?.position as string) || (meta.position as string) || null,
        phone: (t?.phone as string) || (meta.phone as string) || null,
        avatar_path: (t?.avatar_path as string) || null,
        created_at: u.created_at,
        invited_at: (u as User & { invited_at?: string }).invited_at || null,
        last_sign_in_at: u.last_sign_in_at || null,
        status: statusOf(u),
        super_admin: superSet.has(u.id),
        tms: (t?.role as TmsRole) || null,
        leads: leadsBy.get(u.id) || null,
      } satisfies AdminUser;
    })
    .sort((x, y) => (x.full_name || x.email).localeCompare(y.full_name || y.email));
}

export async function listAudit(limit = 200): Promise<AuditRow[]> {
  const { data, error } = await adminClient()
    .from("toss_admin_audit")
    .select("id, actor_email, action, target_email, details, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new AdminError(error.message, 502);
  return (data || []) as AuditRow[];
}

async function audit(actor: { id: string; email: string }, action: string, target: { id?: string | null; email?: string | null }, details: Record<string, unknown> = {}) {
  await adminClient().from("toss_admin_audit").insert({ actor_id: actor.id, actor_email: actor.email, action, target_id: target.id || null, target_email: target.email || null, details });
}

async function getUser(id: string) {
  const { data, error } = await adminClient().auth.admin.getUserById(id);
  if (error || !data.user) throw new AdminError("User not found", 404);
  return data.user;
}

// ---------------------------------------------------------------------------
// Access changes (shared by invite and edit)
// ---------------------------------------------------------------------------
async function setTmsAccess(u: { id: string; email: string }, role: TmsRole | null, profile: { full_name?: string; position?: string | null; phone?: string | null }) {
  const a = adminClient();
  if (!role) {
    const { error } = await a.from("tms_members").delete().eq("user_id", u.id);
    if (error) throw new AdminError(error.message.includes("owner") ? "TOSS Cloud needs at least one owner." : error.message);
    return;
  }
  const row: Record<string, unknown> = { user_id: u.id, email: u.email, role };
  if (profile.full_name !== undefined) row.full_name = profile.full_name;
  if (profile.position !== undefined) row.position = profile.position || null;
  if (profile.phone !== undefined) row.phone = profile.phone || null;
  const { error } = await a.from("tms_members").upsert(row, { onConflict: "user_id" });
  if (error) throw new AdminError(error.message.includes("owner") ? "TOSS Cloud needs at least one owner." : error.message);
}

async function setLeadsAccess(userId: string, role: LeadsRole | null) {
  const a = adminClient();
  const ws = await leadsWorkspace(a);
  if (!ws) throw new AdminError("TOSS Lead Hunter has no workspace yet.");
  if (!role) {
    const { error } = await a.from("workspace_members").delete().eq("workspace_id", ws).eq("user_id", userId);
    if (error) throw new AdminError(error.message);
    return;
  }
  const { error } = await a.from("workspace_members").upsert({ workspace_id: ws, user_id: userId, role }, { onConflict: "workspace_id,user_id" });
  if (error) throw new AdminError(error.message);
}

async function setSuperAdmin(actorId: string, userId: string, on: boolean) {
  const a = adminClient();
  if (on) {
    const { error } = await a.from("toss_super_admins").upsert({ user_id: userId, granted_by: actorId }, { onConflict: "user_id" });
    if (error) throw new AdminError(error.message);
  } else {
    const { error } = await a.from("toss_super_admins").delete().eq("user_id", userId);
    if (error) throw new AdminError(error.message.includes("at least one") ? "There must be at least one super admin." : error.message);
  }
}

/** Name in both apps (TMS member row and the Leads profile) and in the login's metadata. */
async function setNames(u: User, p: { full_name?: string; position?: string | null; phone?: string | null }) {
  const a = adminClient();
  if (p.full_name !== undefined) await a.from("profiles").update({ full_name: p.full_name }).eq("id", u.id);
  const meta = { ...(u.user_metadata || {}) };
  if (p.full_name !== undefined) meta.full_name = p.full_name;
  if (p.position !== undefined) meta.position = p.position || null;
  if (p.phone !== undefined) meta.phone = p.phone || null;
  await a.auth.admin.updateUserById(u.id, { user_metadata: meta });
  const t = await a.from("tms_members").select("user_id").eq("user_id", u.id).maybeSingle();
  if (t.data) {
    const patch: Record<string, unknown> = {};
    if (p.full_name !== undefined) patch.full_name = p.full_name;
    if (p.position !== undefined) patch.position = p.position || null;
    if (p.phone !== undefined) patch.phone = p.phone || null;
    if (Object.keys(patch).length) await a.from("tms_members").update(patch).eq("user_id", u.id);
  }
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------
export interface InviteInput {
  email: string;
  full_name: string;
  position?: string | null;
  phone?: string | null;
  tms: TmsRole | null;
  leads: LeadsRole | null;
  super_admin?: boolean;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Invite someone by email: Supabase sends the invite, the person sets a password, and
 * they get exactly the app access chosen here. (TOSS Lead Hunter adds every new login to its
 * workspace automatically, so that is undone right away when Leads isn't granted.)
 */
export async function inviteUser(actor: { id: string; email: string }, input: InviteInput, origins: { tms: string; leads: string | null }) {
  const email = input.email.trim().toLowerCase();
  const full_name = input.full_name.trim();
  if (!EMAIL.test(email)) throw new AdminError("Enter a valid email address.");
  if (!full_name) throw new AdminError("Enter the person's name.");
  if (!input.tms && !input.leads) throw new AdminError("Give access to at least one app.");
  if (input.super_admin && !input.tms) throw new AdminError("Super admins need TOSS Cloud access (the admin panel is in TOSS Cloud).");
  const a = adminClient();

  const existing = (await listUsers()).find((u) => u.email.toLowerCase() === email);
  if (existing) throw new AdminError(`${email} already has a TOSS login. Open them in the list to change their access.`, 409);

  // Land on the app they can use: TMS when granted, else Leads.
  const base = input.tms || !origins.leads ? origins.tms : origins.leads;
  const { data, error } = await a.auth.admin.inviteUserByEmail(email, {
    data: { full_name, position: input.position || null, phone: input.phone || null },
    redirectTo: `${base}/login`,
  });
  if (error || !data.user) throw new AdminError(error?.message || "Couldn't send the invite", 502);
  const u = data.user;

  await setNames(u, { full_name, position: input.position ?? null, phone: input.phone ?? null });
  await setTmsAccess({ id: u.id, email }, input.tms, { full_name, position: input.position ?? null, phone: input.phone ?? null });
  await setLeadsAccess(u.id, input.leads);
  if (input.super_admin) await setSuperAdmin(actor.id, u.id, true);
  await audit(actor, "invite", { id: u.id, email }, { tms: input.tms, leads: input.leads, super_admin: !!input.super_admin, position: input.position || null });
  return u.id;
}

export interface UpdateInput {
  full_name?: string;
  position?: string | null;
  phone?: string | null;
  tms?: TmsRole | null;
  leads?: LeadsRole | null;
  super_admin?: boolean;
}

export async function updateUser(actor: { id: string; email: string }, id: string, input: UpdateInput) {
  const u = await getUser(id);
  const before = (await listUsers()).find((x) => x.id === id);
  if (!before) throw new AdminError("User not found", 404);
  const self = id === actor.id;

  // Guard rails: nobody locks themselves out of the panel.
  if (self && input.super_admin === false) throw new AdminError("You can't remove your own super admin access. Ask another super admin.");
  if (self && input.tms === null) throw new AdminError("You can't remove your own TOSS Cloud access (the admin panel is in TOSS Cloud).");
  const willBeSuper = input.super_admin ?? before.super_admin;
  const willHaveTms = input.tms === undefined ? before.tms : input.tms;
  if (willBeSuper && !willHaveTms) throw new AdminError("Super admins need TOSS Cloud access. Remove super admin first, or keep TOSS Cloud.");
  if (input.full_name !== undefined && !input.full_name.trim()) throw new AdminError("Name can't be empty.");

  const names = { full_name: input.full_name?.trim(), position: input.position, phone: input.phone };
  if (names.full_name !== undefined || names.position !== undefined || names.phone !== undefined) await setNames(u, names);
  if (input.tms !== undefined && input.tms !== before.tms)
    await setTmsAccess({ id, email: u.email || "" }, input.tms, { full_name: names.full_name ?? before.full_name, position: names.position ?? before.position, phone: names.phone ?? before.phone });
  if (input.leads !== undefined && input.leads !== before.leads) await setLeadsAccess(id, input.leads);
  if (input.super_admin !== undefined && input.super_admin !== before.super_admin) await setSuperAdmin(actor.id, id, input.super_admin);

  const changes: Record<string, unknown> = {};
  for (const k of ["full_name", "position", "phone", "tms", "leads", "super_admin"] as const) {
    const v = k === "full_name" ? names.full_name : input[k];
    if (v !== undefined && v !== (before as unknown as Record<string, unknown>)[k]) changes[k] = { from: (before as unknown as Record<string, unknown>)[k] ?? null, to: v ?? null };
  }
  if (Object.keys(changes).length) await audit(actor, "update", { id, email: u.email }, changes);
}

export async function setDisabled(actor: { id: string; email: string }, id: string, disabled: boolean) {
  if (id === actor.id) throw new AdminError("You can't disable your own account.");
  const u = await getUser(id);
  const { error } = await adminClient().auth.admin.updateUserById(id, { ban_duration: disabled ? BANNED_FOREVER : "none" });
  if (error) throw new AdminError(error.message, 502);
  await audit(actor, disabled ? "disable" : "enable", { id, email: u.email });
}

/** Resend the invite (not signed in yet) or send a password reset (already active). */
export async function sendLink(actor: { id: string; email: string }, id: string, origins: { tms: string; leads: string | null }) {
  const u = await getUser(id);
  if (!u.email) throw new AdminError("This login has no email.");
  const before = (await listUsers()).find((x) => x.id === id);
  const base = before?.tms || !origins.leads ? origins.tms : origins.leads;
  const a = adminClient();
  if (!u.email_confirmed_at && !u.last_sign_in_at) {
    const { error } = await a.auth.admin.inviteUserByEmail(u.email, { redirectTo: `${base}/login` });
    if (error) throw new AdminError(error.message, 502);
    await audit(actor, "resend_invite", { id, email: u.email });
    return "invite";
  }
  const { error } = await a.auth.resetPasswordForEmail(u.email, { redirectTo: `${base}/login` });
  if (error) throw new AdminError(error.message, 502);
  await audit(actor, "password_reset", { id, email: u.email });
  return "reset";
}

/**
 * Delete the login for good. Their loads, lists and invoices stay (they just lose the
 * person's name on them). Owners / super admins are protected by the database guards.
 */
export async function deleteUser(actor: { id: string; email: string }, id: string, confirm: string) {
  if (id === actor.id) throw new AdminError("You can't delete your own account.");
  const u = await getUser(id);
  if (confirm.trim().toLowerCase() !== (u.email || "").toLowerCase()) throw new AdminError("The email you typed doesn't match.");
  const { error } = await adminClient().auth.admin.deleteUser(id);
  if (error) {
    const msg = error.message || "";
    throw new AdminError(msg.includes("owner") ? "This person is the last TOSS Cloud owner. Make someone else owner first." : msg.includes("super admin") ? "This person is the last super admin." : msg, 400);
  }
  await audit(actor, "delete", { id, email: u.email });
}

export function origins(req: Request) {
  const tms = (process.env.NEXT_PUBLIC_APP_URL && !process.env.NEXT_PUBLIC_APP_URL.includes("localhost") ? process.env.NEXT_PUBLIC_APP_URL : new URL(req.url).origin).replace(/\/+$/, "");
  const leads = (process.env.NEXT_PUBLIC_LEADS_URL || "").replace(/\/+$/, "") || null;
  return { tms, leads };
}

export function errorResponse(e: unknown) {
  const err = e instanceof AdminError ? e : new AdminError((e as Error)?.message || "Something went wrong", 500);
  return Response.json({ error: err.message }, { status: err.status });
}

// ---------------------------------------------------------------------------
// Development-only sample-data preview (/preview-ui): no real accounts are touched.
// ---------------------------------------------------------------------------
export async function isPreview() {
  if (process.env.NODE_ENV !== "development") return false;
  const { cookies } = await import("next/headers");
  return (await cookies()).get("tms_ui_preview")?.value === "1";
}

export function previewUsers(): AdminUser[] {
  const now = new Date().toISOString();
  const ago = (d: number) => new Date(Date.now() - d * 86400000).toISOString();
  const u = (id: string, email: string, full_name: string, position: string | null, tms: TmsRole | null, leads: LeadsRole | null, status: AdminStatus, last: string | null, sa = false): AdminUser => ({
    id, email, full_name, position, phone: null, avatar_path: null, created_at: ago(40), invited_at: ago(40), last_sign_in_at: last, status, super_admin: sa, tms, leads,
  });
  return [
    u("demo-me", "dispatch@truckingonestopshop.net", "Preview Dispatcher", "Dispatch Manager", "owner", "owner", "active", now, true),
    u("demo-2", "dayana@truckingonestopshop.net", "Dayana Villa", "Senior Dispatcher", "dispatcher", "member", "active", ago(1)),
    u("demo-3", "marco@truckingonestopshop.net", "Marco Ionescu", "Sales / Carrier Recruiting", null, "admin", "active", ago(3)),
    u("demo-4", "alina@truckingonestopshop.net", "Alina Rusu", "Dispatcher", "dispatcher", null, "invited", null),
    u("demo-5", "old.account@truckingonestopshop.net", "Victor Popa", "Dispatcher", "dispatcher", "member", "disabled", ago(60)),
  ];
}

export function previewAudit(): AuditRow[] {
  const ago = (h: number) => new Date(Date.now() - h * 3600000).toISOString();
  return [
    { id: "a1", actor_email: "dispatch@truckingonestopshop.net", action: "invite", target_email: "alina@truckingonestopshop.net", details: { tms: "dispatcher", leads: null }, created_at: ago(2) },
    { id: "a2", actor_email: "dispatch@truckingonestopshop.net", action: "update", target_email: "marco@truckingonestopshop.net", details: { leads: { from: "member", to: "admin" } }, created_at: ago(26) },
    { id: "a3", actor_email: "dispatch@truckingonestopshop.net", action: "disable", target_email: "old.account@truckingonestopshop.net", details: {}, created_at: ago(70) },
  ];
}
