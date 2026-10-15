-- =============================================================================
-- TOSS TMS — core schema
--
-- Lives in the shared TOSS Supabase project next to TOSS Leads. Everything the
-- TMS owns is prefixed `tms_` (tables, views, functions) or lives in the
-- `tms_private` schema, so nothing here touches TOSS Leads tables.
--
-- Access model: a signed-in TOSS user can use the TMS only if they have a row
-- in public.tms_members. Owners manage members, the invoice issuer profile,
-- and can delete companies.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 0. Retire the previous prototype.
--    Its views exposed the tables to anon (read AND write) without RLS, so they
--    are removed (views hold no data). Its tables are kept, untouched, in a
--    locked `tms_legacy` schema that the API cannot reach.
-- ---------------------------------------------------------------------------
drop view if exists public.load_documents;
drop view if exists public.companies;
drop view if exists public.drivers;
drop view if exists public.trucks;
drop view if exists public.loads;
drop view if exists public.invoices;

create schema if not exists tms_legacy;
revoke all on schema tms_legacy from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['tms_invoice_loads', 'tms_invoices', 'tms_documents', 'tms_loads', 'tms_trucks',
                           'tms_drivers', 'tms_company_dispatchers', 'tms_company_vault', 'tms_companies', 'tms_profiles']
  loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I set schema tms_legacy', t);
      execute format('revoke all on tms_legacy.%I from public, anon, authenticated', t);
    end if;
  end loop;
end $$;

create schema if not exists tms_private;
revoke all on schema tms_private from public, anon;
grant usage on schema tms_private to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 1. Members & access helpers
-- ---------------------------------------------------------------------------
create table public.tms_members (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  email      text not null,
  full_name  text not null default '',
  role       text not null default 'dispatcher' check (role in ('owner', 'dispatcher')),
  created_at timestamptz not null default now()
);

create or replace function tms_private.is_member()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.tms_members m where m.user_id = (select auth.uid()));
$$;

create or replace function tms_private.is_owner()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.tms_members m where m.user_id = (select auth.uid()) and m.role = 'owner');
$$;

revoke all on function tms_private.is_member() from public, anon;
revoke all on function tms_private.is_owner() from public, anon;
grant execute on function tms_private.is_member() to authenticated;
grant execute on function tms_private.is_owner() to authenticated;

create or replace function tms_private.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Owners add an existing TOSS account (same login as TOSS Leads) by email.
create or replace function public.tms_add_member(p_email text, p_role text default 'dispatcher')
returns public.tms_members
language plpgsql security definer set search_path = '' as $$
declare
  u   auth.users%rowtype;
  row public.tms_members%rowtype;
begin
  if not tms_private.is_owner() then
    raise exception 'Only owners can add team members' using errcode = '42501';
  end if;
  if p_role not in ('owner', 'dispatcher') then
    raise exception 'Unknown role %', p_role;
  end if;
  select * into u from auth.users where lower(email) = lower(trim(p_email)) limit 1;
  if not found then
    raise exception 'No TOSS account uses %. Invite them in Supabase Auth first.', p_email using errcode = 'P0002';
  end if;
  insert into public.tms_members (user_id, email, full_name, role)
  values (
    u.id,
    u.email,
    coalesce(nullif(u.raw_user_meta_data->>'full_name', ''), (select p.full_name from public.profiles p where p.id = u.id), split_part(u.email, '@', 1)),
    p_role
  )
  on conflict (user_id) do update set role = excluded.role
  returning * into row;
  return row;
end;
$$;
revoke all on function public.tms_add_member(text, text) from public, anon;
grant execute on function public.tms_add_member(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Carrier companies (the carriers TOSS dispatches for)
-- ---------------------------------------------------------------------------
create table public.tms_companies (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  mc_number          text,
  dot_number         text,
  contact_name       text,
  contact_phone      text,
  contact_email      text,
  address            text,
  commission_percent numeric(5,2) not null default 10 check (commission_percent >= 0 and commission_percent <= 100),
  billing_cadence    text not null default 'weekly' check (billing_cadence in ('weekly', 'monthly')),
  payment_terms_days integer not null default 7 check (payment_terms_days >= 0),
  factoring_company  text,
  factoring_email    text,
  status             text not null default 'active' check (status in ('active', 'inactive')),
  notes              text,
  created_by         uuid default auth.uid(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 3. Drivers
-- ---------------------------------------------------------------------------
create table public.tms_drivers (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid not null references public.tms_companies(id) on delete cascade,
  name                text not null,
  phone               text,
  email               text,
  cdl_number          text,
  cdl_state           text,
  cdl_expiry          date,
  medical_card_expiry date,
  status              text not null default 'active' check (status in ('active', 'inactive')),
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index tms_drivers_company_idx on public.tms_drivers (company_id);

-- ---------------------------------------------------------------------------
-- 4. Trucks & equipment (one row = power unit + its trailer)
-- ---------------------------------------------------------------------------
create table public.tms_trucks (
  id                 uuid primary key default gen_random_uuid(),
  company_id         uuid not null references public.tms_companies(id) on delete cascade,
  unit_number        text not null,
  trailer_number     text,
  plate              text,
  vin_number         text,
  year               integer,
  make               text,
  trailer_type       text,
  trailer_length     text,
  max_weight         integer,
  door_type          text,
  suspension         text,
  important_info     text,
  accessories        jsonb not null default '[]'::jsonb,
  desk_blocks        jsonb not null default '[]'::jsonb,
  custom_pitch       text,
  assigned_driver_id uuid references public.tms_drivers(id) on delete set null,
  current_location   text,
  available_date     date,
  status             text not null default 'active' check (status in ('active', 'out_of_service', 'inactive')),
  notes              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index tms_trucks_company_idx on public.tms_trucks (company_id);
create index tms_trucks_driver_idx on public.tms_trucks (assigned_driver_id);

-- ---------------------------------------------------------------------------
-- 5. Loads
-- ---------------------------------------------------------------------------
create table public.tms_loads (
  id                 uuid primary key default gen_random_uuid(),
  company_id         uuid not null references public.tms_companies(id) on delete cascade,
  driver_id          uuid references public.tms_drivers(id) on delete set null,
  truck_id           uuid references public.tms_trucks(id) on delete set null,
  dispatcher_id      uuid default auth.uid() references auth.users(id) on delete set null,
  load_number        text,
  rate_con_number    text,
  status             text not null default 'booked' check (status in (
                       'new', 'booked', 'in_transit', 'delivered', 'invoiced', 'paid',
                       'canceled_by_broker', 'canceled_by_carrier')),
  broker_name        text not null default '',
  broker_mc          text,
  broker_contact     text,
  broker_email       text,
  broker_phone       text,
  origin_city        text not null default '',
  origin_state       text not null default '',
  destination_city   text not null default '',
  destination_state  text not null default '',
  pickup_date        date,
  delivery_date      date,
  gross_amount       numeric(12,2) not null default 0,
  commission_percent numeric(5,2) not null default 0,
  dispatcher_cut     numeric(12,2) not null default 0,
  loaded_miles       numeric(10,1) not null default 0,
  deadhead_miles     numeric(10,1) not null default 0,
  weight_lbs         numeric(10,1),
  commodity          text,
  equipment_type     text,
  broker_notes       text,
  internal_notes     text,
  stops              jsonb not null default '[]'::jsonb,
  created_by         uuid default auth.uid(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index tms_loads_company_idx on public.tms_loads (company_id);
create index tms_loads_driver_idx on public.tms_loads (driver_id);
create index tms_loads_truck_idx on public.tms_loads (truck_id);
create index tms_loads_status_idx on public.tms_loads (status);
create index tms_loads_pickup_idx on public.tms_loads (pickup_date);
create index tms_loads_dispatcher_idx on public.tms_loads (dispatcher_id);

-- Activity history per load (created, status changes, notes)
create table public.tms_load_events (
  id          uuid primary key default gen_random_uuid(),
  load_id     uuid not null references public.tms_loads(id) on delete cascade,
  kind        text not null check (kind in ('created', 'status', 'note', 'document', 'update')),
  from_status text,
  to_status   text,
  message     text,
  actor_id    uuid default auth.uid(),
  actor_name  text,
  created_at  timestamptz not null default now()
);
create index tms_load_events_load_idx on public.tms_load_events (load_id, created_at desc);

create or replace function tms_private.actor_name()
returns text language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select nullif(m.full_name, '') from public.tms_members m where m.user_id = (select auth.uid())),
    (select m.email from public.tms_members m where m.user_id = (select auth.uid())),
    'System');
$$;

create or replace function tms_private.log_load_event()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.tms_load_events (load_id, kind, to_status, message, actor_name)
    values (new.id, 'created', new.status, 'Load created', tms_private.actor_name());
  elsif new.status is distinct from old.status then
    insert into public.tms_load_events (load_id, kind, from_status, to_status, actor_name)
    values (new.id, 'status', old.status, new.status, tms_private.actor_name());
  end if;
  return new;
end;
$$;

create trigger tms_loads_events_trg
  after insert or update of status on public.tms_loads
  for each row execute function tms_private.log_load_event();

-- Fill actor_name on manual notes
create or replace function tms_private.fill_event_actor()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.actor_name is null then
    new.actor_name := tms_private.actor_name();
  end if;
  return new;
end;
$$;
create trigger tms_load_events_actor_trg
  before insert on public.tms_load_events
  for each row execute function tms_private.fill_event_actor();

-- ---------------------------------------------------------------------------
-- 6. Documents (files live in the private `tms-docs` storage bucket)
-- ---------------------------------------------------------------------------
create table public.tms_doc_types (
  key        text primary key,
  name       text not null,
  scope      text not null default 'any' check (scope in ('company', 'load', 'driver', 'truck', 'any')),
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

insert into public.tms_doc_types (key, name, scope, is_default) values
  ('rate_confirmation', 'Rate Confirmation', 'load', true),
  ('bol', 'Bill of Lading (BOL)', 'load', true),
  ('pod', 'Proof of Delivery (POD)', 'load', true),
  ('lumper_receipt', 'Lumper Receipt', 'load', true),
  ('scale_ticket', 'Scale Ticket', 'load', true),
  ('insurance', 'Certificate of Insurance (COI)', 'company', true),
  ('authority', 'MC Authority', 'company', true),
  ('w9', 'W-9', 'company', true),
  ('noa', 'Notice of Assignment (NOA)', 'company', true),
  ('dispatch_agreement', 'Dispatch Agreement', 'company', true),
  ('voided_check', 'Voided Check', 'company', true),
  ('cdl', 'CDL', 'driver', true),
  ('medical_card', 'Medical Card', 'driver', true),
  ('registration', 'Registration', 'truck', true),
  ('inspection', 'Annual Inspection', 'truck', true),
  ('other', 'Other', 'any', true);

create table public.tms_documents (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.tms_companies(id) on delete cascade,
  load_id     uuid references public.tms_loads(id) on delete cascade,
  driver_id   uuid references public.tms_drivers(id) on delete cascade,
  truck_id    uuid references public.tms_trucks(id) on delete cascade,
  doc_type    text not null default 'other',
  file_path   text not null,
  file_name   text not null,
  file_size   bigint,
  mime_type   text,
  expires_on  date,
  notes       text,
  uploaded_by uuid default auth.uid(),
  uploaded_at timestamptz not null default now()
);
create index tms_documents_company_idx on public.tms_documents (company_id);
create index tms_documents_load_idx on public.tms_documents (load_id);
create index tms_documents_driver_idx on public.tms_documents (driver_id);
create index tms_documents_truck_idx on public.tms_documents (truck_id);

-- ---------------------------------------------------------------------------
-- 7. Invoices
-- ---------------------------------------------------------------------------
create sequence if not exists tms_private.invoice_seq start 1001;
grant usage on sequence tms_private.invoice_seq to authenticated;

create table public.tms_invoices (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid references public.tms_companies(id) on delete set null,
  invoice_number  text not null unique,
  invoice_type    text not null default 'load' check (invoice_type in ('load', 'custom')),
  status          text not null default 'draft' check (status in ('draft', 'sent', 'paid', 'void')),
  currency        text not null default 'USD' check (currency in ('USD', 'EUR', 'MDL')),
  issue_date      date not null default current_date,
  due_date        date,
  period_start    date,
  period_end      date,
  total_gross     numeric(12,2) not null default 0,
  total_due       numeric(12,2) not null default 0,
  amount_paid     numeric(12,2) not null default 0,
  notes           text,
  issuer_name     text,
  issuer_address  text,
  issuer_email    text,
  issuer_phone    text,
  bill_to_name    text,
  bill_to_details text,
  doc_overrides   jsonb not null default '{}'::jsonb,
  sent_at         timestamptz,
  paid_at         timestamptz,
  created_by      uuid default auth.uid(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index tms_invoices_company_idx on public.tms_invoices (company_id);
create index tms_invoices_status_idx on public.tms_invoices (status);

create table public.tms_invoice_lines (
  id                uuid primary key default gen_random_uuid(),
  invoice_id        uuid not null references public.tms_invoices(id) on delete cascade,
  load_id           uuid references public.tms_loads(id) on delete set null,
  position          integer not null default 0,
  description       text not null default '',
  line_date         date,
  quantity          numeric(12,2) not null default 1,
  unit_price        numeric(12,2) not null default 0,
  gross_amount      numeric(12,2) not null default 0,
  amount            numeric(12,2) not null default 0,
  load_number       text,
  rate_con_number   text,
  broker_name       text,
  driver_name       text,
  origin            text,
  destination       text,
  pickup_date       date,
  delivery_date     date,
  created_at        timestamptz not null default now()
);
create index tms_invoice_lines_invoice_idx on public.tms_invoice_lines (invoice_id);
create index tms_invoice_lines_load_idx on public.tms_invoice_lines (load_id);

create or replace function public.tms_next_invoice_number()
returns text language plpgsql security definer set search_path = '' as $$
declare
  prefix text;
begin
  if not tms_private.is_member() then
    raise exception 'Not a TMS member' using errcode = '42501';
  end if;
  select coalesce(nullif(s.invoice_prefix, ''), 'TOSS') into prefix from public.tms_settings s where s.id = 1;
  return coalesce(prefix, 'TOSS') || '-' || to_char(current_date, 'YYYY') || '-' || nextval('tms_private.invoice_seq')::text;
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. Settings (single row): invoice issuer profile
-- ---------------------------------------------------------------------------
create table public.tms_settings (
  id              integer primary key default 1 check (id = 1),
  issuer_name     text not null default 'Trucking One Stop Shop LLC',
  issuer_address  text not null default '',
  issuer_email    text not null default 'billing@truckingonestopshop.net',
  issuer_phone    text not null default '',
  invoice_prefix  text not null default 'TOSS',
  remittance_text text not null default 'Please pay by ACH, wire transfer or Zelle within the agreed payment terms.',
  footer_text     text not null default 'Thank you for your business.',
  updated_at      timestamptz not null default now()
);
insert into public.tms_settings (id) values (1);

revoke all on function public.tms_next_invoice_number() from public, anon;
grant execute on function public.tms_next_invoice_number() to authenticated;

-- ---------------------------------------------------------------------------
-- 9. Company vault (portal logins, contacts). Passwords encrypted at rest.
--    The app reads/writes public.tms_vault_items (a view); the base table
--    lives in tms_private and is never exposed through the API.
-- ---------------------------------------------------------------------------
do $$ begin
  if not exists (select 1 from vault.secrets where name = 'tms_vault_key') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'tms_vault_key', 'TOSS TMS vault password encryption key');
  end if;
end $$;

create table tms_private.vault_items (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references public.tms_companies(id) on delete cascade,
  category       text not null default 'login' check (category in ('login', 'contact', 'custom')),
  title          text not null,
  url            text,
  username       text,
  password_enc   bytea,
  account_number text,
  contact_name   text,
  contact_email  text,
  contact_phone  text,
  role_title     text,
  notes          text,
  custom_fields  jsonb not null default '[]'::jsonb,
  sort_order     integer not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index tms_vault_company_idx on tms_private.vault_items (company_id);
revoke all on tms_private.vault_items from public, anon, authenticated;

create or replace function tms_private.vault_key()
returns text language sql stable security definer set search_path = '' as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'tms_vault_key';
$$;
revoke all on function tms_private.vault_key() from public, anon, authenticated;

create view public.tms_vault_items as
  select v.id, v.company_id, v.category, v.title, v.url, v.username,
         case when v.password_enc is null then null
              else extensions.pgp_sym_decrypt(v.password_enc, tms_private.vault_key()) end as password,
         v.account_number, v.contact_name, v.contact_email, v.contact_phone, v.role_title,
         v.notes, v.custom_fields, v.sort_order, v.created_at, v.updated_at
  from tms_private.vault_items v
  where tms_private.is_member();

revoke all on public.tms_vault_items from public, anon;
grant select, insert, update, delete on public.tms_vault_items to authenticated;

create or replace function tms_private.vault_write()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not tms_private.is_member() then
    raise exception 'Not a TMS member' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' then
    insert into tms_private.vault_items (id, company_id, category, title, url, username, password_enc,
      account_number, contact_name, contact_email, contact_phone, role_title, notes, custom_fields, sort_order)
    values (coalesce(new.id, gen_random_uuid()), new.company_id, coalesce(new.category, 'login'), new.title, new.url, new.username,
      case when new.password is null or new.password = '' then null else extensions.pgp_sym_encrypt(new.password, tms_private.vault_key()) end,
      new.account_number, new.contact_name, new.contact_email, new.contact_phone, new.role_title, new.notes,
      coalesce(new.custom_fields, '[]'::jsonb), coalesce(new.sort_order, 0))
    returning id, created_at, updated_at into new.id, new.created_at, new.updated_at;
    return new;
  elsif tg_op = 'UPDATE' then
    update tms_private.vault_items set
      company_id = new.company_id, category = new.category, title = new.title, url = new.url, username = new.username,
      password_enc = case when new.password is null or new.password = '' then null else extensions.pgp_sym_encrypt(new.password, tms_private.vault_key()) end,
      account_number = new.account_number, contact_name = new.contact_name, contact_email = new.contact_email,
      contact_phone = new.contact_phone, role_title = new.role_title, notes = new.notes,
      custom_fields = coalesce(new.custom_fields, '[]'::jsonb), sort_order = coalesce(new.sort_order, 0), updated_at = now()
    where id = old.id;
    return new;
  else
    delete from tms_private.vault_items where id = old.id;
    return old;
  end if;
end;
$$;

create trigger tms_vault_items_write
  instead of insert or update or delete on public.tms_vault_items
  for each row execute function tms_private.vault_write();

-- ---------------------------------------------------------------------------
-- 10. updated_at triggers
-- ---------------------------------------------------------------------------
create trigger tms_companies_touch before update on public.tms_companies for each row execute function tms_private.touch_updated_at();
create trigger tms_drivers_touch   before update on public.tms_drivers   for each row execute function tms_private.touch_updated_at();
create trigger tms_trucks_touch    before update on public.tms_trucks    for each row execute function tms_private.touch_updated_at();
create trigger tms_loads_touch     before update on public.tms_loads     for each row execute function tms_private.touch_updated_at();
create trigger tms_invoices_touch  before update on public.tms_invoices  for each row execute function tms_private.touch_updated_at();
create trigger tms_settings_touch  before update on public.tms_settings  for each row execute function tms_private.touch_updated_at();

-- ---------------------------------------------------------------------------
-- 11. Row level security: members only; a few owner-only operations
-- ---------------------------------------------------------------------------
alter table public.tms_members       enable row level security;
alter table public.tms_companies     enable row level security;
alter table public.tms_drivers       enable row level security;
alter table public.tms_trucks        enable row level security;
alter table public.tms_loads         enable row level security;
alter table public.tms_load_events   enable row level security;
alter table public.tms_doc_types     enable row level security;
alter table public.tms_documents     enable row level security;
alter table public.tms_invoices      enable row level security;
alter table public.tms_invoice_lines enable row level security;
alter table public.tms_settings      enable row level security;

revoke all on public.tms_members, public.tms_companies, public.tms_drivers, public.tms_trucks, public.tms_loads,
  public.tms_load_events, public.tms_doc_types, public.tms_documents, public.tms_invoices, public.tms_invoice_lines,
  public.tms_settings from anon;
grant select, insert, update, delete on public.tms_members, public.tms_companies, public.tms_drivers, public.tms_trucks,
  public.tms_loads, public.tms_load_events, public.tms_doc_types, public.tms_documents, public.tms_invoices,
  public.tms_invoice_lines, public.tms_settings to authenticated;

create policy tms_members_read   on public.tms_members for select to authenticated using ((select tms_private.is_member()));
create policy tms_members_write  on public.tms_members for update to authenticated using ((select tms_private.is_owner())) with check ((select tms_private.is_owner()));
create policy tms_members_delete on public.tms_members for delete to authenticated using ((select tms_private.is_owner()) and user_id <> (select auth.uid()));

create policy tms_companies_read   on public.tms_companies for select to authenticated using ((select tms_private.is_member()));
create policy tms_companies_insert on public.tms_companies for insert to authenticated with check ((select tms_private.is_member()));
create policy tms_companies_update on public.tms_companies for update to authenticated using ((select tms_private.is_member())) with check ((select tms_private.is_member()));
create policy tms_companies_delete on public.tms_companies for delete to authenticated using ((select tms_private.is_owner()));

create policy tms_drivers_all       on public.tms_drivers       for all to authenticated using ((select tms_private.is_member())) with check ((select tms_private.is_member()));
create policy tms_trucks_all        on public.tms_trucks        for all to authenticated using ((select tms_private.is_member())) with check ((select tms_private.is_member()));
create policy tms_loads_all         on public.tms_loads         for all to authenticated using ((select tms_private.is_member())) with check ((select tms_private.is_member()));
create policy tms_load_events_read  on public.tms_load_events   for select to authenticated using ((select tms_private.is_member()));
create policy tms_load_events_add   on public.tms_load_events   for insert to authenticated with check ((select tms_private.is_member()) and kind in ('note', 'document', 'update'));
create policy tms_load_events_del   on public.tms_load_events   for delete to authenticated using ((select tms_private.is_member()) and kind = 'note' and actor_id = (select auth.uid()));
create policy tms_doc_types_read    on public.tms_doc_types     for select to authenticated using ((select tms_private.is_member()));
create policy tms_doc_types_add     on public.tms_doc_types     for insert to authenticated with check ((select tms_private.is_member()) and not is_default);
create policy tms_doc_types_edit    on public.tms_doc_types     for update to authenticated using ((select tms_private.is_member()) and not is_default) with check (not is_default);
create policy tms_doc_types_del     on public.tms_doc_types     for delete to authenticated using ((select tms_private.is_member()) and not is_default);
create policy tms_documents_all     on public.tms_documents     for all to authenticated using ((select tms_private.is_member())) with check ((select tms_private.is_member()));
create policy tms_invoices_all      on public.tms_invoices      for all to authenticated using ((select tms_private.is_member())) with check ((select tms_private.is_member()));
create policy tms_invoice_lines_all on public.tms_invoice_lines for all to authenticated using ((select tms_private.is_member())) with check ((select tms_private.is_member()));
create policy tms_settings_read     on public.tms_settings      for select to authenticated using ((select tms_private.is_member()));
create policy tms_settings_update   on public.tms_settings      for update to authenticated using ((select tms_private.is_owner())) with check ((select tms_private.is_owner()));

-- ---------------------------------------------------------------------------
-- 12. Storage bucket for documents (private, members only)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('tms-docs', 'tms-docs', false, 26214400)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

create policy "tms docs read"   on storage.objects for select to authenticated using (bucket_id = 'tms-docs' and (select tms_private.is_member()));
create policy "tms docs insert" on storage.objects for insert to authenticated with check (bucket_id = 'tms-docs' and (select tms_private.is_member()));
create policy "tms docs update" on storage.objects for update to authenticated using (bucket_id = 'tms-docs' and (select tms_private.is_member()));
create policy "tms docs delete" on storage.objects for delete to authenticated using (bucket_id = 'tms-docs' and (select tms_private.is_member()));

-- ---------------------------------------------------------------------------
-- 13. Realtime: keep every dispatcher's screen in sync
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table
  public.tms_companies, public.tms_drivers, public.tms_trucks, public.tms_loads,
  public.tms_documents, public.tms_invoices, public.tms_invoice_lines, public.tms_load_events;

-- ---------------------------------------------------------------------------
-- 14. Initial members: the existing TOSS team accounts
-- ---------------------------------------------------------------------------
insert into public.tms_members (user_id, email, full_name, role)
select u.id, u.email,
       coalesce(nullif(p.full_name, ''), nullif(u.raw_user_meta_data->>'full_name', ''), split_part(u.email, '@', 1)),
       case when lower(u.email) in ('thebodistean@gmail.com', 'dev@truckingonestopshop.net') then 'owner' else 'dispatcher' end
from auth.users u
left join public.profiles p on p.id = u.id
on conflict (user_id) do nothing;

-- ---------------------------------------------------------------------------
-- 15. Function privileges inside a view are checked as the caller, so the
--     view decrypts through a member-checked security definer wrapper.
-- ---------------------------------------------------------------------------
create or replace function tms_private.vault_decrypt(cipher bytea)
returns text language plpgsql stable security definer set search_path = '' as $$
begin
  if cipher is null or not tms_private.is_member() then
    return null;
  end if;
  return extensions.pgp_sym_decrypt(cipher, tms_private.vault_key());
end;
$$;
revoke all on function tms_private.vault_decrypt(bytea) from public, anon;
grant execute on function tms_private.vault_decrypt(bytea) to authenticated;

create or replace view public.tms_vault_items as
  select v.id, v.company_id, v.category, v.title, v.url, v.username,
         tms_private.vault_decrypt(v.password_enc) as password,
         v.account_number, v.contact_name, v.contact_email, v.contact_phone, v.role_title,
         v.notes, v.custom_fields, v.sort_order, v.created_at, v.updated_at
  from tms_private.vault_items v
  where tms_private.is_member();
revoke all on public.tms_vault_items from public, anon;
grant select, insert, update, delete on public.tms_vault_items to authenticated;

-- The view runs as the caller (security_invoker): members can read the
-- encrypted base table through RLS; writes still go through vault_write().
alter table tms_private.vault_items enable row level security;
create policy tms_vault_items_read on tms_private.vault_items for select to authenticated using ((select tms_private.is_member()));
grant select on tms_private.vault_items to authenticated;
alter view public.tms_vault_items set (security_invoker = true);
