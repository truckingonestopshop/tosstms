-- Trailers as their own equipment: a trailer can be dropped and hooked to another truck,
-- has its own plate / VIN / documents, and a truck can run with none (power only).
-- The truck's trailer columns stay as a read-only copy of its current trailer so every
-- screen that shows "53 ft Reefer · Trailer #013" keeps working.
-- TMS tables only; nothing in TOSS Leads is touched.

create table if not exists public.tms_trailers (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references public.tms_companies(id) on delete cascade,
  unit_number    text not null,
  trailer_type   text,
  trailer_length text,
  max_weight     integer,
  door_type      text,
  suspension     text,
  features       text,
  plate          text,
  vin_number     text,
  year           integer,
  make           text,
  status         text not null default 'active' check (status in ('active', 'out_of_service', 'inactive')),
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists tms_trailers_company_idx on public.tms_trailers (company_id);

drop trigger if exists tms_trailers_touch on public.tms_trailers;
create trigger tms_trailers_touch before update on public.tms_trailers for each row execute function tms_private.touch_updated_at();

alter table public.tms_trailers enable row level security;
revoke all on public.tms_trailers from anon;
grant select, insert, update, delete on public.tms_trailers to authenticated;
drop policy if exists tms_trailers_all on public.tms_trailers;
create policy tms_trailers_all on public.tms_trailers for all to authenticated
  using ((select tms_private.is_member())) with check ((select tms_private.is_member()));

-- Links: truck → current trailer (one truck per trailer), documents and loads → trailer.
alter table public.tms_trucks add column if not exists trailer_id uuid references public.tms_trailers(id) on delete set null;
create unique index if not exists tms_trucks_trailer_uniq on public.tms_trucks (trailer_id) where trailer_id is not null;
alter table public.tms_documents add column if not exists trailer_id uuid references public.tms_trailers(id) on delete cascade;
create index if not exists tms_documents_trailer_idx on public.tms_documents (trailer_id);
alter table public.tms_loads add column if not exists trailer_id uuid references public.tms_trailers(id) on delete set null;

-- Document types: a "trailer" scope with its own required paperwork.
alter table public.tms_doc_types drop constraint if exists tms_doc_types_scope_check;
alter table public.tms_doc_types add constraint tms_doc_types_scope_check check (scope in ('company', 'load', 'driver', 'truck', 'trailer', 'any'));
alter table public.tms_doc_types disable trigger tms_doc_types_guard;
update public.tms_doc_types set scope = 'trailer', required_from = 'always', has_expiry = true, sort = 10 where key = 'trailer_registration';
alter table public.tms_doc_types enable trigger tms_doc_types_guard;
insert into public.tms_doc_types (key, name, scope, is_default, required_from, has_expiry, in_packet, sort) values
  ('trailer_inspection', 'Trailer Annual Inspection', 'trailer', true, 'always', true, false, 20),
  ('trailer_lease', 'Trailer Lease / Interchange', 'trailer', true, null, false, false, 30),
  ('reefer_service', 'Reefer Unit Service Record', 'trailer', true, null, false, false, 40)
on conflict (key) do nothing;

-- Existing trucks: their trailer details become a trailer record linked to the truck.
do $$
declare t record; tid uuid;
begin
  for t in select * from public.tms_trucks
           where trailer_id is null and (coalesce(trailer_number, '') <> '' or coalesce(trailer_type, '') <> '')
  loop
    insert into public.tms_trailers (company_id, unit_number, trailer_type, trailer_length, max_weight, door_type, suspension)
    values (t.company_id, coalesce(nullif(trim(t.trailer_number), ''), 'T-' || t.unit_number), t.trailer_type, t.trailer_length, t.max_weight, t.door_type, t.suspension)
    returning id into tid;
    update public.tms_trucks set trailer_id = tid where id = t.id;
    update public.tms_documents set trailer_id = tid, truck_id = null where truck_id = t.id and doc_type = 'trailer_registration';
  end loop;
end $$;

-- Truck columns follow the hooked trailer; hooking a trailer drops it from any other truck.
create or replace function tms_private.truck_trailer_copy() returns trigger
language plpgsql set search_path = '' as $$
declare tr public.tms_trailers;
begin
  if new.trailer_id is not null then
    select * into tr from public.tms_trailers where id = new.trailer_id;
    if found then
      new.trailer_number := tr.unit_number;
      new.trailer_type := tr.trailer_type;
      new.trailer_length := tr.trailer_length;
      new.max_weight := tr.max_weight;
      new.door_type := tr.door_type;
      new.suspension := tr.suspension;
      update public.tms_trucks set trailer_id = null where trailer_id = new.trailer_id and id <> new.id;
    end if;
  elsif tg_op = 'UPDATE' and old.trailer_id is not null then
    -- Dropped the trailer: power only until another is hooked.
    new.trailer_number := null;
    new.trailer_type := null;
    new.trailer_length := null;
    new.max_weight := null;
    new.door_type := null;
    new.suspension := null;
  end if;
  return new;
end $$;

drop trigger if exists tms_trucks_trailer_copy on public.tms_trucks;
create trigger tms_trucks_trailer_copy before insert or update on public.tms_trucks
  for each row execute function tms_private.truck_trailer_copy();

-- Editing a trailer updates the truck pulling it.
create or replace function tms_private.trailer_to_truck() returns trigger
language plpgsql set search_path = '' as $$
begin
  update public.tms_trucks set trailer_id = new.id where trailer_id = new.id;
  return null;
end $$;

drop trigger if exists tms_trailers_to_truck on public.tms_trailers;
create trigger tms_trailers_to_truck after update on public.tms_trailers
  for each row execute function tms_private.trailer_to_truck();

do $$ begin
  alter publication supabase_realtime add table public.tms_trailers;
exception when duplicate_object then null; end $$;

notify pgrst, 'reload schema';
