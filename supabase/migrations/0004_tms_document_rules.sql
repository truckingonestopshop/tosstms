-- Document rules: which types are required (and from which load stage), which expire,
-- which go into the billing packet, plus the standard US trucking types that were missing.
-- TMS tables only; nothing in TOSS Leads is touched.

alter table public.tms_doc_types
  add column if not exists required_from text check (required_from in ('always', 'booked', 'in_transit', 'delivered')),
  add column if not exists has_expiry boolean not null default false,
  add column if not exists in_packet boolean not null default false,
  add column if not exists sort integer not null default 100;

comment on column public.tms_doc_types.required_from is
  'null = optional. Company/driver/truck: always. Load: required once the load reaches booked / in_transit / delivered.';

-- New standard types (existing keys are left alone).
insert into public.tms_doc_types (key, name, scope, is_default) values
  ('accessorial_receipt', 'Accessorial Receipt', 'load', true),
  ('detention_proof', 'Detention / Layover Proof', 'load', true),
  ('freight_photos', 'Freight & Damage Photos', 'load', true),
  ('boc3', 'BOC-3', 'company', true),
  ('ucr', 'UCR Registration', 'company', true),
  ('carrier_packet', 'Carrier Packet', 'company', true),
  ('factoring_agreement', 'Factoring Agreement', 'company', true),
  ('mvr', 'Motor Vehicle Record (MVR)', 'driver', true),
  ('drug_test', 'Drug & Alcohol Test', 'driver', true),
  ('driver_application', 'Driver Application', 'driver', true),
  ('driver_agreement', 'Driver / Lease Agreement', 'driver', true),
  ('cab_card', 'IRP Cab Card', 'truck', true),
  ('ifta', 'IFTA License', 'truck', true),
  ('form_2290', 'Form 2290 (Schedule 1)', 'truck', true),
  ('truck_title', 'Title', 'truck', true),
  ('truck_lease', 'Equipment Lease', 'truck', true),
  ('physical_damage', 'Physical Damage Insurance', 'truck', true),
  ('trailer_registration', 'Trailer Registration', 'truck', true)
on conflict (key) do nothing;

-- Defaults: what is required, what expires, what goes in the packet, display order.
update public.tms_doc_types t set
  required_from = v.req, has_expiry = v.exp, in_packet = v.pkt, sort = v.ord
from (values
  ('rate_confirmation',   'booked',     false, true,  10),
  ('bol',                 'in_transit', false, true,  20),
  ('pod',                 'delivered',  false, true,  30),
  ('lumper_receipt',      null,         false, true,  40),
  ('scale_ticket',        null,         false, true,  50),
  ('accessorial_receipt', null,         false, true,  60),
  ('detention_proof',     null,         false, true,  70),
  ('freight_photos',      null,         false, false, 80),
  ('insurance',           'always',     true,  false, 10),
  ('authority',           'always',     false, false, 20),
  ('w9',                  'always',     false, false, 30),
  ('dispatch_agreement',  'always',     false, false, 40),
  ('noa',                 null,         false, false, 50),
  ('voided_check',        null,         false, false, 60),
  ('boc3',                null,         false, false, 70),
  ('ucr',                 null,         true,  false, 80),
  ('carrier_packet',      null,         false, false, 90),
  ('factoring_agreement', null,         false, false, 95),
  ('cdl',                 'always',     true,  false, 10),
  ('medical_card',        'always',     true,  false, 20),
  ('mvr',                 null,         true,  false, 30),
  ('drug_test',           null,         false, false, 40),
  ('driver_application',  null,         false, false, 50),
  ('driver_agreement',    null,         false, false, 60),
  ('registration',        'always',     true,  false, 10),
  ('inspection',          'always',     true,  false, 20),
  ('cab_card',            null,         true,  false, 30),
  ('ifta',                null,         true,  false, 40),
  ('form_2290',           null,         true,  false, 50),
  ('physical_damage',     null,         true,  false, 60),
  ('trailer_registration',null,         true,  false, 70),
  ('truck_title',         null,         false, false, 80),
  ('truck_lease',         null,         false, false, 90),
  ('other',               null,         false, false, 999)
) as v(key, req, exp, pkt, ord)
where t.key = v.key;

-- The team may change the rules (required / expiry / packet / order) on built-in types,
-- but a built-in type's key, name and scope stay fixed.
create or replace function tms_private.doc_type_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.is_default and (new.key is distinct from old.key or new.name is distinct from old.name or new.scope is distinct from old.scope) then
    raise exception 'Built-in document types can''t be renamed or moved';
  end if;
  if new.is_default is distinct from old.is_default then
    raise exception 'Built-in flag can''t be changed';
  end if;
  return new;
end $$;

drop trigger if exists tms_doc_types_guard on public.tms_doc_types;
create trigger tms_doc_types_guard before update on public.tms_doc_types
  for each row execute function tms_private.doc_type_guard();

drop policy if exists tms_doc_types_edit on public.tms_doc_types;
create policy tms_doc_types_edit on public.tms_doc_types for update to authenticated
  using ((select tms_private.is_member())) with check ((select tms_private.is_member()));

create index if not exists tms_documents_type_idx on public.tms_documents (doc_type);
