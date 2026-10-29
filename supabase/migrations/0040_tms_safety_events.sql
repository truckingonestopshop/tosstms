-- Inspections and accidents as records of their own (DOT Compliance tab): a date, truck, driver,
-- inspection level / location, notes, and any number of files. Each one can be edited or deleted.
-- Files stay in tms_documents with event_id (still shown on the truck's and driver's documents).
-- Existing inspection reports become one inspection each (files with the same date, truck, driver
-- and notes are grouped).

create table if not exists public.tms_safety_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.tms_companies (id) on delete cascade,
  kind text not null check (kind in ('inspection', 'accident')),
  event_date date,
  truck_id uuid references public.tms_trucks (id) on delete set null,
  driver_id uuid references public.tms_drivers (id) on delete set null,
  -- Inspection: I – NAS … VI – Hazmat. Accident: free text (e.g. tow-away, injury).
  level text,
  location text,
  notes text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists tms_safety_events_company_idx on public.tms_safety_events (company_id, kind, event_date desc);

alter table public.tms_documents add column if not exists event_id uuid references public.tms_safety_events (id) on delete set null;
create index if not exists tms_documents_event_idx on public.tms_documents (event_id);

-- Accident paperwork.
insert into public.tms_doc_types (key, name, scope, is_default, has_expiry, sort)
values
  ('accident_police_report', 'Police report', 'company', false, false, 300),
  ('accident_registry', 'Accident registry', 'company', false, false, 301),
  ('accident_drug_test', 'Post-accident drug & alcohol test', 'company', false, false, 302),
  ('accident_hos', 'HOS reports', 'company', false, false, 303),
  ('accident_maintenance', 'Vehicle maintenance reports', 'company', false, false, 304),
  ('accident_other', 'Other accident files', 'company', false, false, 305)
on conflict (key) do nothing;

-- Today's inspection reports → inspections.
with groups as (
  select company_id, coalesce(issued_on, uploaded_at::date) as d, truck_id, driver_id, coalesce(notes, '') as n,
         gen_random_uuid() as event_id
    from public.tms_documents
   where doc_type = 'inspection_report' and event_id is null
   group by 1, 2, 3, 4, 5
), made as (
  insert into public.tms_safety_events (id, company_id, kind, event_date, truck_id, driver_id, notes, created_by)
  select event_id, company_id, 'inspection', d, truck_id, driver_id, nullif(n, ''), null from groups
  returning id
)
update public.tms_documents doc
   set event_id = g.event_id
  from groups g
 where doc.doc_type = 'inspection_report' and doc.event_id is null
   and doc.company_id = g.company_id and coalesce(doc.issued_on, doc.uploaded_at::date) = g.d
   and doc.truck_id is not distinct from g.truck_id and doc.driver_id is not distinct from g.driver_id
   and coalesce(doc.notes, '') = g.n;

alter table public.tms_safety_events enable row level security;
drop policy if exists tms_safety_events_all on public.tms_safety_events;
create policy tms_safety_events_all on public.tms_safety_events for all to authenticated using ((select tms_private.is_member())) with check ((select tms_private.is_member()));
do $$ begin
  alter publication supabase_realtime add table public.tms_safety_events;
exception when duplicate_object then null;
end $$;

notify pgrst, 'reload schema';
