-- Credentials: load-board logins are for the dispatch team only; every other credential is visible
-- to the whole TOSS Cloud team. People on the Office view don't see dispatch-only items (owners do).
-- TMS tables only.

alter table tms_private.vault_items add column if not exists dispatch_only boolean not null default false;

-- Dispatch view or owner (sees dispatch-only credentials).
create or replace function tms_private.sees_dispatch()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.tms_members m
     where m.user_id = (select auth.uid()) and (m.role = 'owner' or coalesce(m.workspace_view, 'dispatch') = 'dispatch')
  );
$$;
revoke all on function tms_private.sees_dispatch() from public, anon;
grant execute on function tms_private.sees_dispatch() to authenticated;

create or replace view public.tms_vault_items as
  select v.id, v.company_id, v.category, v.title, v.url, v.username,
         tms_private.vault_decrypt(v.password_enc) as password,
         v.account_number, v.contact_name, v.contact_email, v.contact_phone, v.role_title,
         v.notes, v.custom_fields, v.sort_order, v.created_at, v.updated_at, v.dispatch_only
  from tms_private.vault_items v
  where tms_private.is_member() and (not v.dispatch_only or tms_private.sees_dispatch());
-- Runs as the caller (see 0001 section 15): members read the encrypted table through RLS.
alter view public.tms_vault_items set (security_invoker = true);

create or replace function tms_private.vault_write()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not tms_private.is_member() then
    raise exception 'Not a TMS member' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' then
    insert into tms_private.vault_items (id, company_id, category, title, url, username, password_enc,
      account_number, contact_name, contact_email, contact_phone, role_title, notes, custom_fields, sort_order, dispatch_only)
    values (coalesce(new.id, gen_random_uuid()), new.company_id, coalesce(new.category, 'login'), new.title, new.url, new.username,
      case when new.password is null or new.password = '' then null else extensions.pgp_sym_encrypt(new.password, tms_private.vault_key()) end,
      new.account_number, new.contact_name, new.contact_email, new.contact_phone, new.role_title, new.notes,
      coalesce(new.custom_fields, '[]'::jsonb), coalesce(new.sort_order, 0), coalesce(new.dispatch_only, false))
    returning id, created_at, updated_at into new.id, new.created_at, new.updated_at;
    return new;
  elsif tg_op = 'UPDATE' then
    update tms_private.vault_items set
      company_id = new.company_id, category = new.category, title = new.title, url = new.url, username = new.username,
      password_enc = case when new.password is null or new.password = '' then null else extensions.pgp_sym_encrypt(new.password, tms_private.vault_key()) end,
      account_number = new.account_number, contact_name = new.contact_name, contact_email = new.contact_email,
      contact_phone = new.contact_phone, role_title = new.role_title, notes = new.notes,
      custom_fields = coalesce(new.custom_fields, '[]'::jsonb), sort_order = coalesce(new.sort_order, 0),
      dispatch_only = coalesce(new.dispatch_only, false), updated_at = now()
    where id = old.id;
    return new;
  else
    delete from tms_private.vault_items where id = old.id;
    return old;
  end if;
end;
$$;

-- Load boards already saved become dispatch-only.
update tms_private.vault_items set dispatch_only = true
 where title ~* '(^|\W)(dat|truckstop|123\s*load\s*board|load\s*board)(\W|$)';

notify pgrst, 'reload schema';
