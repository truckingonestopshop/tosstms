-- Carrier services and office view, company details, driver hire / termination dates, and
-- the driver document list the team asked for. TMS tables only.

-- 1. Carriers: DBA, EIN, address parts, owner and secondary contact split into first / last,
--    and the services the customer is active in (with each service's details).
alter table public.tms_companies
  add column if not exists dba_name             text,
  add column if not exists ein                  text,
  add column if not exists street               text,
  add column if not exists city                 text,
  add column if not exists county               text,
  add column if not exists state                text,
  add column if not exists zip                  text,
  add column if not exists contact_first_name   text,
  add column if not exists contact_last_name    text,
  add column if not exists secondary_first_name text,
  add column if not exists secondary_last_name  text,
  add column if not exists secondary_title      text,
  add column if not exists secondary_phone      text,
  add column if not exists secondary_email      text,
  add column if not exists services             jsonb not null default '{}'::jsonb,
  add column if not exists compliance           jsonb not null default '{}'::jsonb;

comment on column public.tms_companies.compliance is
  'DOT compliance details typed by the team: { safety_rating, iss_score, basics: { key: { score, threshold } }, updated_on }';

comment on column public.tms_companies.services is
  'Services the customer is active in: { dispatch | dot_compliance | mcpt | accounting | factoring | fuel_card | insurance: { on, source, ...details } }';

-- Every existing carrier is a dispatch customer; split their owner name once.
update public.tms_companies set services = jsonb_build_object('dispatch', jsonb_build_object('on', true))
where services = '{}'::jsonb;
update public.tms_companies set
  contact_first_name = coalesce(contact_first_name, nullif(split_part(trim(coalesce(contact_name, '')), ' ', 1), '')),
  contact_last_name  = coalesce(contact_last_name, nullif(trim(substr(trim(coalesce(contact_name, '')), length(split_part(trim(coalesce(contact_name, '')), ' ', 1)) + 1)), ''))
where contact_name is not null;

-- The owner's full name and the one-line address follow their parts (invoices, search and
-- older screens keep using contact_name / address).
create or replace function tms_private.company_composed() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT'
     or new.contact_first_name is distinct from old.contact_first_name
     or new.contact_last_name is distinct from old.contact_last_name then
    if new.contact_first_name is not null or new.contact_last_name is not null then
      new.contact_name := nullif(trim(concat_ws(' ', nullif(trim(new.contact_first_name), ''), nullif(trim(new.contact_last_name), ''))), '');
    end if;
  elsif new.contact_name is distinct from old.contact_name then
    -- Only the full name was edited (older screens): split it into first / last.
    new.contact_first_name := nullif(split_part(trim(coalesce(new.contact_name, '')), ' ', 1), '');
    new.contact_last_name := nullif(trim(substr(trim(coalesce(new.contact_name, '')), length(split_part(trim(coalesce(new.contact_name, '')), ' ', 1)) + 1)), '');
  end if;
  if tg_op = 'INSERT'
     or (new.street, new.city, new.county, new.state, new.zip) is distinct from (old.street, old.city, old.county, old.state, old.zip) then
    if coalesce(new.street, new.city, new.state, new.zip) is not null then
      new.address := nullif(concat_ws(E'\n',
        nullif(trim(new.street), ''),
        nullif(trim(concat_ws(', ', nullif(trim(new.city), ''), nullif(trim(concat_ws(' ', nullif(trim(new.state), ''), nullif(trim(new.zip), ''))), ''))), '')
      ), '');
    end if;
  end if;
  return new;
end $$;

drop trigger if exists tms_companies_composed on public.tms_companies;
create trigger tms_companies_composed before insert or update on public.tms_companies
  for each row execute function tms_private.company_composed();

-- 2. Drivers: hire and termination dates.
alter table public.tms_drivers
  add column if not exists hire_date        date,
  add column if not exists termination_date date;

-- 3. Team: which view each person works in (set in the admin panel).
alter table public.tms_members
  add column if not exists workspace_view text not null default 'dispatch' check (workspace_view in ('dispatch', 'office'));

-- 4. Document types.
alter table public.tms_doc_types disable trigger tms_doc_types_guard;

-- One MVR and one clearinghouse query, both expiring; PSP and termination letter added.
update public.tms_doc_types set name = 'MVR', has_expiry = true, required_from = 'always', sort = 30 where key = 'mvr';
update public.tms_doc_types set name = 'Clearinghouse query', has_expiry = true, required_from = null, sort = 32, doc_group = 'expiry' where key = 'clearinghouse_full_query';
delete from public.tms_doc_types t where t.key = 'clearinghouse_limited_query'
  and not exists (select 1 from public.tms_documents d where d.doc_type = t.key);
insert into public.tms_doc_types (key, name, scope, is_default, required_from, has_expiry, in_packet, sort) values
  ('psp',                'PSP (Pre-employment Screening Program)', 'driver', true, null, false, false, 58),
  ('termination_letter', 'Termination letter',                     'driver', true, null, false, false, 96),
  ('dot_compliance_agreement', 'DOT compliance agreement',         'company', true, null, false, false, 46),
  -- Roadside inspection reports: filed on the carrier and linked to a truck and / or driver.
  ('inspection_report',        'Inspection report',                'company', true, null, false, false, 47)
on conflict (key) do nothing;
update public.tms_doc_types set name = 'Factoring contract' where key = 'factoring_agreement';

-- Required for every driver: license, medical card, employment application, MVR,
-- past employment verification (PEV) and the pre-employment drug test.
update public.tms_doc_types set required_from = 'always'
  where key in ('cdl', 'medical_card', 'driver_application', 'mvr', 'past_employment_verification', 'pre_employment_drug_test');
update public.tms_doc_types set required_from = null where key in ('driver_trainings', 'driver_policies', 'drug_test');

-- The medical card is filed as a document (with its date), not a photo slot. Photos already
-- uploaded there become medical card documents, dated from the driver's medical card expiry.
update public.tms_documents d set
  doc_type = 'medical_card',
  expires_on = coalesce(d.expires_on, (select dr.medical_card_expiry from public.tms_drivers dr where dr.id = d.driver_id))
where d.doc_type = 'driver_photo_medical_card';
delete from public.tms_doc_types t where t.key = 'driver_photo_medical_card'
  and not exists (select 1 from public.tms_documents d where d.doc_type = t.key);

alter table public.tms_doc_types enable trigger tms_doc_types_guard;

notify pgrst, 'reload schema';
