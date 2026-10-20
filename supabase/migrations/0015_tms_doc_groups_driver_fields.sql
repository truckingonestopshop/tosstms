-- Document types grouped the way the team files them (No expiration / Expiration / Per request),
-- the driver and truck types the team asked for, driver license photos, and driver fields:
-- first / last name, license type (CDL, DL, International CDL), license state or country.

-- 1. Groups on document types (shown as headings in the Type picker).
alter table public.tms_doc_types
  add column if not exists doc_group text check (doc_group in ('no_expiry', 'expiry', 'per_request'));

alter table public.tms_doc_types disable trigger tms_doc_types_guard;

-- Driver types
insert into public.tms_doc_types (key, name, scope, is_default, required_from, has_expiry, in_packet, sort, doc_group) values
  ('pre_employment_drug_test',     'Pre-employment drug test',             'driver', true, null, false, false, 52, 'no_expiry'),
  ('past_employment_verification', 'Past employment verification',         'driver', true, null, false, false, 54, 'no_expiry'),
  ('clearinghouse_full_query',     'Clearinghouse full query',             'driver', true, null, false, false, 56, 'no_expiry'),
  ('clearinghouse_limited_query',  'Clearinghouse limited query · Annual', 'driver', true, null, true,  false, 32, 'expiry'),
  ('driver_policies',              'Policies',                             'driver', true, null, false, false, 72, 'per_request'),
  ('driver_trainings',             'Trainings',                            'driver', true, null, false, false, 74, 'per_request'),
  ('passport',                     'Passport',                             'driver', true, null, true,  false, 90, null),
  ('government_id',                'ID card',                              'driver', true, null, true,  false, 92, null),
  ('driver_headshot',              'Driver photo',                         'driver', true, null, false, false, 94, null),
  -- License and medical card photos (shown in the driver's photo slots, not the file list)
  ('driver_photo_license_front',   'Photo · Driving license front',        'driver', true, null, false, false, 200, null),
  ('driver_photo_license_back',    'Photo · Driving license back',         'driver', true, null, false, false, 201, null),
  ('driver_photo_medical_card',    'Photo · Medical card',                 'driver', true, null, false, false, 202, null)
on conflict (key) do nothing;

update public.tms_doc_types set name = 'Employment application', doc_group = 'no_expiry', sort = 50 where key = 'driver_application';
update public.tms_doc_types set name = 'MVR · Annual', doc_group = 'expiry', has_expiry = true, sort = 30 where key = 'mvr';
update public.tms_doc_types set name = 'Drug and alcohol testing', doc_group = 'per_request', sort = 70 where key = 'drug_test';
update public.tms_doc_types set doc_group = 'expiry' where key in ('cdl', 'medical_card');
update public.tms_doc_types set name = 'Driving license' where key = 'cdl';

-- Truck types
insert into public.tms_doc_types (key, name, scope, is_default, required_from, has_expiry, in_packet, sort, doc_group) values
  ('ny_hut_permit',   'NY HUT permit',    'truck', true, null, true, false, 61, 'expiry'),
  ('nm_state_permit', 'NM state permit',  'truck', true, null, true, false, 62, 'expiry'),
  ('ky_state_permit', 'KYU state permit', 'truck', true, null, true, false, 63, 'expiry'),
  ('or_state_permit', 'OR state permit',  'truck', true, null, true, false, 64, 'expiry'),
  ('ct_state_permit', 'CT state permit',  'truck', true, null, true, false, 65, 'expiry')
on conflict (key) do nothing;

update public.tms_doc_types set name = 'Title registration', doc_group = 'no_expiry' where key = 'truck_title';
update public.tms_doc_types set doc_group = 'expiry' where key in ('registration', 'inspection', 'ifta', 'form_2290', 'physical_damage');

alter table public.tms_doc_types enable trigger tms_doc_types_guard;

-- 2. Drivers: first / last name, license type and where it was issued.
alter table public.tms_drivers
  add column if not exists first_name   text,
  add column if not exists last_name    text,
  add column if not exists license_type text check (license_type in ('CDL', 'DL', 'International CDL'));

-- Existing drivers: split the full name at the first space; their license counts as a CDL.
update public.tms_drivers set
  first_name = coalesce(first_name, split_part(trim(name), ' ', 1)),
  last_name  = coalesce(last_name, nullif(trim(substr(trim(name), length(split_part(trim(name), ' ', 1)) + 1)), '')),
  license_type = coalesce(license_type, case when coalesce(cdl_number, '') <> '' then 'CDL' end);

-- The full name always follows first + last (search, loads and invoices keep using it).
create or replace function tms_private.driver_full_name() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.first_name is not null or new.last_name is not null then
    new.name := nullif(trim(concat_ws(' ', nullif(trim(new.first_name), ''), nullif(trim(new.last_name), ''))), '');
    if new.name is null then new.name := coalesce(old.name, ''); end if;
  end if;
  return new;
end $$;

drop trigger if exists tms_drivers_full_name on public.tms_drivers;
create trigger tms_drivers_full_name before insert or update on public.tms_drivers
  for each row execute function tms_private.driver_full_name();

notify pgrst, 'reload schema';
