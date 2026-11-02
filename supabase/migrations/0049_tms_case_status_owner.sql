-- A case's status is moved by the person it's assigned to (TOSS Cloud owners can too). Checked
-- against the owner after the change, so assigning yourself and moving it in one save works.
-- The server (secret key, no signed-in user) is not limited.

create or replace function tms_private.case_status_by_owner()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status is distinct from old.status
     and (select auth.uid()) is not null
     and new.owner_id is distinct from (select auth.uid())
     and not tms_private.is_owner() then
    raise exception 'Only the person this case is assigned to can change its status'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists tms_cases_status_owner on public.tms_cases;
create trigger tms_cases_status_owner before update of status on public.tms_cases
  for each row execute function tms_private.case_status_by_owner();
