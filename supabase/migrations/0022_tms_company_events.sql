-- Carrier timeline (Profile): everything that happened on the account, newest first, plus team
-- notes with attached files. Mirrors tms_load_events. TMS tables only.

create table if not exists public.tms_company_events (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.tms_companies (id) on delete cascade,
  kind        text not null check (kind in ('created', 'note', 'document', 'service', 'status', 'update')),
  message     text,
  -- note attachments: [{ id, name, path, mime }] (files live in tms_documents / the tms-docs bucket)
  attachments jsonb not null default '[]'::jsonb,
  actor_id    uuid default auth.uid(),
  actor_name  text,
  created_at  timestamptz not null default now()
);
create index if not exists tms_company_events_company_idx on public.tms_company_events (company_id, created_at desc);

drop trigger if exists tms_company_events_actor_trg on public.tms_company_events;
create trigger tms_company_events_actor_trg
  before insert on public.tms_company_events
  for each row execute function tms_private.fill_event_actor();

alter table public.tms_company_events enable row level security;
drop policy if exists tms_company_events_read on public.tms_company_events;
drop policy if exists tms_company_events_add on public.tms_company_events;
drop policy if exists tms_company_events_del on public.tms_company_events;
create policy tms_company_events_read on public.tms_company_events for select to authenticated using ((select tms_private.is_member()));
create policy tms_company_events_add  on public.tms_company_events for insert to authenticated
  with check ((select tms_private.is_member()) and kind = 'note');
create policy tms_company_events_del  on public.tms_company_events for delete to authenticated
  using ((select tms_private.is_member()) and kind = 'note' and actor_id = (select auth.uid()));

-- Carrier created / services, statuses changed.
create or replace function tms_private.log_company_event()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  added text[];
  removed text[];
  label constant jsonb := '{"dispatch":"Dispatch","dot_compliance":"DOT Compliance","mcpt":"MCPT","accounting":"Accounting","factoring":"Factoring","fuel_card":"Fuel Card","insurance":"Insurance"}';
  st constant jsonb := '{"active":"Active","inactive":"Inactive","oos":"Out of service"}';
begin
  if tg_op = 'INSERT' then
    insert into public.tms_company_events (company_id, kind, message, actor_name)
    values (new.id, 'created', coalesce(nullif(new.notes, ''), 'Carrier created'), tms_private.actor_name());
    return new;
  end if;
  -- services turned on / off
  select coalesce(array_agg(label ->> s), '{}') into added
    from jsonb_object_keys(coalesce(new.services, '{}')) s
   where coalesce((new.services -> s ->> 'on')::boolean, false)
     and not coalesce((old.services -> s ->> 'on')::boolean, false);
  select coalesce(array_agg(label ->> s), '{}') into removed
    from jsonb_object_keys(coalesce(old.services, '{}')) s
   where coalesce((old.services -> s ->> 'on')::boolean, false)
     and not coalesce((new.services -> s ->> 'on')::boolean, false);
  if cardinality(added) > 0 then
    insert into public.tms_company_events (company_id, kind, message, actor_name)
    values (new.id, 'service', 'Service added: ' || array_to_string(added, ', '), tms_private.actor_name());
  end if;
  if cardinality(removed) > 0 then
    insert into public.tms_company_events (company_id, kind, message, actor_name)
    values (new.id, 'service', 'Service removed: ' || array_to_string(removed, ', '), tms_private.actor_name());
  end if;
  if new.status is distinct from old.status then
    insert into public.tms_company_events (company_id, kind, message, actor_name)
    values (new.id, 'status', 'Client status: ' || initcap(coalesce(old.status, '—')) || ' → ' || initcap(coalesce(new.status, '—')), tms_private.actor_name());
  end if;
  if new.dot_status is distinct from old.dot_status then
    insert into public.tms_company_events (company_id, kind, message, actor_name)
    values (new.id, 'status', 'DOT status: ' || coalesce(st ->> old.dot_status, 'not recorded') || ' → ' || coalesce(st ->> new.dot_status, 'not recorded'), tms_private.actor_name());
  end if;
  if new.mc_status is distinct from old.mc_status then
    insert into public.tms_company_events (company_id, kind, message, actor_name)
    values (new.id, 'status', 'MC status: ' || coalesce(st ->> old.mc_status, 'not recorded') || ' → ' || coalesce(st ->> new.mc_status, 'not recorded'), tms_private.actor_name());
  end if;
  return new;
end;
$$;
drop trigger if exists tms_companies_events_trg on public.tms_companies;
create trigger tms_companies_events_trg
  after insert or update of services, status, dot_status, mc_status on public.tms_companies
  for each row execute function tms_private.log_company_event();

-- Files uploaded for the carrier (its own, its drivers', trucks', trailers'; not load paperwork,
-- not photo slots, not files attached to a timeline note).
create or replace function tms_private.log_company_document()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  t text;
  who text;
begin
  if new.load_id is not null or new.doc_type like '%\_photo\_%' or coalesce(new.notes, '') = 'Timeline note attachment' then
    return new;
  end if;
  select name into t from public.tms_doc_types where key = new.doc_type;
  who := case
    when new.driver_id is not null then (select ' · driver ' || d.name from public.tms_drivers d where d.id = new.driver_id)
    when new.truck_id is not null then (select ' · unit ' || tr.unit_number from public.tms_trucks tr where tr.id = new.truck_id)
    else '' end;
  insert into public.tms_company_events (company_id, kind, message, actor_name)
  values (new.company_id, 'document', 'Uploaded ' || coalesce(t, 'file') || ': ' || new.file_name || coalesce(who, ''), tms_private.actor_name());
  return new;
end;
$$;
drop trigger if exists tms_documents_company_events_trg on public.tms_documents;
create trigger tms_documents_company_events_trg
  after insert on public.tms_documents
  for each row execute function tms_private.log_company_document();

-- Existing carriers start with their creation date.
insert into public.tms_company_events (company_id, kind, message, actor_name, actor_id, created_at)
select c.id, 'created', 'Carrier created', 'System', null, c.created_at
  from public.tms_companies c
 where not exists (select 1 from public.tms_company_events e where e.company_id = c.id and e.kind = 'created');

do $$ begin
  alter publication supabase_realtime add table public.tms_company_events;
exception when duplicate_object then null; end $$;

notify pgrst, 'reload schema';
