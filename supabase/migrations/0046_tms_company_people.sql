-- People of a carrier besides its drivers: owners (with their license, even when they don't drive),
-- DERs (Designated Employer Representatives, more than one allowed) and contacts for permits / DOT.
-- One person can be several (an owner who is also the DER). An owner who drives is linked to the
-- driver made from them. Nothing here feeds Pending or the to-dos.

create table if not exists public.tms_company_people (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.tms_companies (id) on delete cascade,
  first_name text not null default '',
  last_name text not null default '',
  phone text,
  email text,
  -- e.g. "Office manager", "Permits agent"
  title text,
  is_owner boolean not null default false,
  is_der boolean not null default false,
  is_contact boolean not null default false,
  -- owners: license and date of birth
  license_type text check (license_type in ('CDL', 'DL', 'International CDL')),
  license_number text,
  license_state text,
  license_expiry date,
  dob date,
  -- license photos and other files: [{ id, name, path, mime }] in the tms-docs bucket
  files jsonb not null default '[]'::jsonb,
  driver_id uuid references public.tms_drivers (id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tms_company_people_role check (is_owner or is_der or is_contact)
);
create index if not exists tms_company_people_company_idx on public.tms_company_people (company_id);

drop trigger if exists tms_company_people_updated on public.tms_company_people;
create trigger tms_company_people_updated before update on public.tms_company_people
  for each row execute function tms_private.touch_updated_at();

alter table public.tms_company_people enable row level security;
drop policy if exists tms_company_people_all on public.tms_company_people;
create policy tms_company_people_all on public.tms_company_people for all to authenticated
  using ((select tms_private.is_member())) with check ((select tms_private.is_member()));

do $$
begin
  alter publication supabase_realtime add table public.tms_company_people;
exception when duplicate_object then null;
end $$;

notify pgrst, 'reload schema';
