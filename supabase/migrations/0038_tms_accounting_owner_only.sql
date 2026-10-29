-- TOSS Accounting is no longer open to every owner: only people with "accounting" in their sections.
-- Ali (h.ali.bakri99@gmail.com) and the developer accounts (owners, everywhere) get it; everyone else
-- loses it. Only someone who already has Accounting can give it to (or take it from) another person,
-- so no owner can grant it to themselves.

create or replace function tms_private.can_accounting()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.tms_members m
     where m.user_id = (select auth.uid())
       and 'accounting' = any (coalesce(m.sections, '{}'))
  );
$$;

create or replace function tms_private.guard_accounting_access()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  had boolean := tg_op = 'UPDATE' and 'accounting' = any (coalesce(old.sections, '{}'));
  has boolean := 'accounting' = any (coalesce(new.sections, '{}'));
begin
  -- Server jobs (no signed-in user) may change it; people need Accounting themselves.
  if had is distinct from has and (select auth.uid()) is not null and not tms_private.can_accounting() then
    raise exception 'Only someone with TOSS Accounting access can change who has it';
  end if;
  return new;
end;
$$;

drop trigger if exists tms_members_guard_accounting on public.tms_members;
create trigger tms_members_guard_accounting
  before insert or update of sections on public.tms_members
  for each row execute function tms_private.guard_accounting_access();

-- The data changes below run as the server (the member guard only lets owners or the server change
-- access, and a migration has no signed-in user).
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- Ali and the developer accounts are owners, so every other section stays open to them.
update public.tms_members m
   set sections = array_append(coalesce(m.sections, '{}'), 'accounting')
  from auth.users u
 where u.id = m.user_id
   and lower(u.email) in ('h.ali.bakri99@gmail.com', 'thebodistean@gmail.com', 'dev@truckingonestopshop.net')
   and not ('accounting' = any (coalesce(m.sections, '{}')));

-- The developer account dev@ becomes an owner too (access everywhere).
update public.tms_members m
   set role = 'owner'
  from auth.users u
 where u.id = m.user_id
   and lower(u.email) = 'dev@truckingonestopshop.net';

-- Nobody else keeps it.
update public.tms_members m
   set sections = array_remove(m.sections, 'accounting')
  from auth.users u
 where u.id = m.user_id
   and lower(u.email) not in ('h.ali.bakri99@gmail.com', 'thebodistean@gmail.com', 'dev@truckingonestopshop.net')
   and 'accounting' = any (coalesce(m.sections, '{}'));
