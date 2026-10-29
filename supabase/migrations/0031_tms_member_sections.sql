-- Users: which menu sections each person can open. null = every section (everyone today keeps
-- full access). Owners always see everything. Only owners (or the admin panel's server) can
-- change it, like roles. TMS tables only.

alter table public.tms_members add column if not exists sections text[];

create or replace function tms_private.member_profile_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- The admin panel's server (secret key) may change roles; it checks super admin itself.
  if (select auth.role()) = 'service_role' then
    return new;
  end if;
  if not tms_private.is_owner() and (
       new.role is distinct from old.role
    or new.email is distinct from old.email
    or new.user_id is distinct from old.user_id
    or new.created_at is distinct from old.created_at
    or new.sections is distinct from old.sections) then
    raise exception 'Only owners can change roles and access' using errcode = '42501';
  end if;
  return new;
end $$;

notify pgrst, 'reload schema';
