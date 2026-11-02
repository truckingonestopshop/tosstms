-- Documents for signing, built into TOSS Cloud (no outside service).
--   Templates: an uploaded PDF with fields placed on its pages. Each field is filled either by TOSS
--   before sending ("toss") or by a signer role (owner, der, driver…). Fields can fill themselves
--   from the carrier / person (company name, DOT, MC, address, today…).
--   Requests: one send of a template (or of a one-off PDF) to recipients, each with a private link.
--   The signed PDF (with a certificate page) is saved to the carrier's / driver's documents.
-- The public signing page reaches these tables only through the server (secret key), by token.

create table if not exists public.tms_sign_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  -- where it's sent from: company (W-9, contracts, policies…), der, driver (application,
  -- Clearinghouse authorization, policies…), other
  category text not null default 'company' check (category in ('company', 'der', 'driver', 'other')),
  -- the document type the signed copy is filed as (tms_doc_types.key), e.g. driver_application
  doc_type text,
  file_path text not null,
  file_name text not null,
  -- [{ w, h }] in PDF points, one per page
  pages jsonb not null default '[]'::jsonb,
  -- [{ key, label }]: who signs (besides TOSS)
  roles jsonb not null default '[{"key":"signer","label":"Signer"}]'::jsonb,
  -- [{ id, type, page, x, y, w, h, role, label, required, auto }] (x/y/w/h: 0–1 of the page)
  fields jsonb not null default '[]'::jsonb,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create sequence if not exists tms_private.sign_number_seq start 1001;
-- service_role: the server (secret key) can create requests too
grant usage on schema tms_private to service_role;
grant usage on sequence tms_private.sign_number_seq to authenticated, service_role;

create table if not exists public.tms_sign_requests (
  id uuid primary key default gen_random_uuid(),
  number integer not null default nextval('tms_private.sign_number_seq') unique,
  title text not null,
  template_id uuid references public.tms_sign_templates (id) on delete set null,
  company_id uuid references public.tms_companies (id) on delete cascade,
  driver_id uuid references public.tms_drivers (id) on delete set null,
  person_id uuid references public.tms_company_people (id) on delete set null,
  case_id uuid references public.tms_cases (id) on delete set null,
  doc_type text,
  file_path text not null,
  file_name text not null,
  pages jsonb not null default '[]'::jsonb,
  roles jsonb not null default '[]'::jsonb,
  fields jsonb not null default '[]'::jsonb,
  -- what TOSS filled before sending: { fieldId: value }
  values jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'sent', 'completed', 'declined', 'expired', 'void')),
  -- signers one after another (by position) instead of all at once
  in_order boolean not null default false,
  subject text,
  message text,
  expires_at timestamptz,
  signed_path text,
  document_id uuid references public.tms_documents (id) on delete set null,
  sent_at timestamptz,
  completed_at timestamptz,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists tms_sign_requests_company_idx on public.tms_sign_requests (company_id, created_at desc);
create index if not exists tms_sign_requests_driver_idx on public.tms_sign_requests (driver_id);
create index if not exists tms_sign_requests_person_idx on public.tms_sign_requests (person_id);

create table if not exists public.tms_sign_recipients (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.tms_sign_requests (id) on delete cascade,
  -- the template role this person fills (signers); null for CC
  role text,
  kind text not null default 'signer' check (kind in ('signer', 'cc')),
  name text not null,
  email text,
  phone text,
  position integer not null default 1,
  -- the private link: /sign/<token>
  token text not null unique default encode(extensions.gen_random_bytes(24), 'hex'),
  status text not null default 'waiting' check (status in ('waiting', 'sent', 'viewed', 'signed', 'declined')),
  -- what this signer filled: { fieldId: value } (signatures as PNG data URLs)
  values jsonb not null default '{}'::jsonb,
  declined_reason text,
  sent_at timestamptz,
  viewed_at timestamptz,
  signed_at timestamptz,
  ip text,
  user_agent text,
  created_at timestamptz not null default now()
);
create index if not exists tms_sign_recipients_request_idx on public.tms_sign_recipients (request_id, position);

-- Audit trail (also printed on the certificate page)
create table if not exists public.tms_sign_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.tms_sign_requests (id) on delete cascade,
  recipient_id uuid references public.tms_sign_recipients (id) on delete cascade,
  action text not null,
  detail text,
  ip text,
  user_agent text,
  actor_name text,
  created_at timestamptz not null default now()
);
create index if not exists tms_sign_events_request_idx on public.tms_sign_events (request_id, created_at);

do $$
declare t text;
begin
  foreach t in array array['tms_sign_templates', 'tms_sign_requests'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_updated', t);
    execute format('create trigger %I before update on public.%I for each row execute function tms_private.touch_updated_at()', t || '_updated', t);
  end loop;
  foreach t in array array['tms_sign_templates', 'tms_sign_requests', 'tms_sign_recipients', 'tms_sign_events'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_all', t);
    execute format('create policy %I on public.%I for all to authenticated using ((select tms_private.is_member())) with check ((select tms_private.is_member()))', t || '_all', t);
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

-- Timeline: sent / signed / declined show on the carrier
create or replace function tms_private.log_sign_event()
returns trigger language plpgsql security definer set search_path = '' as $$
declare msg text;
begin
  if new.company_id is null or new.status is not distinct from old.status then return new; end if;
  msg := case new.status
    when 'sent' then 'Sent for signing: '
    when 'completed' then 'Signed by everyone: '
    when 'declined' then 'Signing declined: '
    when 'void' then 'Signing cancelled: '
    else null end;
  if msg is not null then
    insert into public.tms_company_events (company_id, kind, message, actor_name)
    values (new.company_id, 'document', msg || new.title, tms_private.actor_name());
  end if;
  return new;
end;
$$;
drop trigger if exists tms_sign_requests_events_trg on public.tms_sign_requests;
create trigger tms_sign_requests_events_trg after update of status on public.tms_sign_requests
  for each row execute function tms_private.log_sign_event();

notify pgrst, 'reload schema';
