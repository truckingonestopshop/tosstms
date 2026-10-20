-- Shared admin layer for TOSS TMS and TOSS Leads (one Supabase project, one login).
-- Super admins manage everyone's access to both apps from the TMS admin panel.
-- Nothing in TOSS Leads is changed or removed: Leads keeps its profiles / workspace_members;
-- the admin panel reads and updates them through its server (secret key).

create table if not exists public.toss_super_admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  granted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Who did what in the admin panel (written by the server only).
create table if not exists public.toss_admin_audit (
  id           uuid primary key default gen_random_uuid(),
  actor_id     uuid references auth.users(id) on delete set null,
  actor_email  text,
  action       text not null,
  target_id    uuid,
  target_email text,
  details      jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);
create index if not exists toss_admin_audit_created_idx on public.toss_admin_audit (created_at desc);
create index if not exists toss_admin_audit_target_idx on public.toss_admin_audit (target_id);

-- "Am I a super admin?" for both apps (only ever answers about the caller).
create or replace function public.toss_is_super_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.toss_super_admins s where s.user_id = (select auth.uid()));
$$;
revoke all on function public.toss_is_super_admin() from public, anon;
grant execute on function public.toss_is_super_admin() to authenticated;

alter table public.toss_super_admins enable row level security;
alter table public.toss_admin_audit  enable row level security;
revoke all on public.toss_super_admins, public.toss_admin_audit from anon;
grant select on public.toss_super_admins, public.toss_admin_audit to authenticated;

-- Read-only for super admins in the browser; every change goes through the admin server.
drop policy if exists toss_super_admins_read on public.toss_super_admins;
create policy toss_super_admins_read on public.toss_super_admins for select to authenticated
  using (user_id = (select auth.uid()) or (select public.toss_is_super_admin()));
drop policy if exists toss_admin_audit_read on public.toss_admin_audit;
create policy toss_admin_audit_read on public.toss_admin_audit for select to authenticated
  using ((select public.toss_is_super_admin()));

-- The team can never lose its last super admin.
create or replace function public.toss_keep_a_super_admin() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.toss_super_admins s where s.user_id <> old.user_id) then
    raise exception 'There must be at least one super admin' using errcode = '23514';
  end if;
  return old;
end $$;
revoke all on function public.toss_keep_a_super_admin() from public, anon, authenticated;
drop trigger if exists toss_super_admins_keep_one on public.toss_super_admins;
create trigger toss_super_admins_keep_one before delete on public.toss_super_admins
  for each row execute function public.toss_keep_a_super_admin();

-- Start with the current TMS owners as super admins.
insert into public.toss_super_admins (user_id)
select user_id from public.tms_members where role = 'owner'
on conflict (user_id) do nothing;

notify pgrst, 'reload schema';

-- The admin panel's server (secret key) may change TMS roles; it checks super admin itself.
create or replace function tms_private.member_profile_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.role()) = 'service_role' then
    return new;
  end if;
  if not tms_private.is_owner() and (
       new.role is distinct from old.role
    or new.email is distinct from old.email
    or new.user_id is distinct from old.user_id
    or new.created_at is distinct from old.created_at) then
    raise exception 'Only owners can change roles' using errcode = '42501';
  end if;
  return new;
end $$;
